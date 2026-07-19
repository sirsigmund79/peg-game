<!--
  ============================================================================
  components/RankLadder.vue
  ----------------------------------------------------------------------------
  The result screen's rank ladder: every tier from logic/rules.js's
  RANK_TIERS (never hardcoded), best at the top. Self-plays its own one-shot
  entrance the same way ResultHeader.vue self-plays on `revealed` turning
  true: every rung stamps in first (unearned, except a tier ABOVE this
  round's result that was already earned on an earlier, better attempt --
  see `previousBest` below), then a highlight climbs from the very bottom
  ("Warming Up") up to the rank achieved THIS round, one rung at a time,
  every single time regardless of history -- so a repeat of an
  already-ranked puzzle gets the same "spotlight climbing the ladder"
  moment as a first-ever finish, rather than jumping straight to whichever
  rung was earned.

  Genius, the top tier, gets its own gold treatment (see the `.genius` CSS
  below) layered on top of the normal earned/current/unearned looks --
  dashed gold and its brain emoji shown even while unearned (an
  "aspirational hero" look no other tier gets), solid gold once it's the
  one actually achieved. It also never shows the "New best!" pill (see
  `newBestAchieved` below) -- the gold treatment is celebration enough on
  its own, and it's the ceiling tier, so there's no "further" to frame a
  new best against.
  ============================================================================
-->
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RANK_TIERS, getDotsToRank, getRankTierIndex } from '../logic/rules.js';

const props = defineProps({
  // The best-ever result recorded for this puzzle BEFORE this round (see
  // composables/useGame.js's `previousBest`) -- undefined if this is the
  // puzzle's first-ever completion. No longer decides where the animated
  // climb below STARTS (that's always the very bottom, every time) -- only
  // seeds a tier ABOVE this round's result as already-earned, on a worse
  // repeat of an already-better-earned puzzle. See `newBest` for whether
  // THIS round beat it.
  previousBest: { type: Object, default: undefined },
  // The just-finished round's overPar (see composables/useGame.js).
  overPar: { type: Number, required: true },
  // Whether THIS finish just raised previousBest -- see useGame.js's
  // `justAchievedNewBest`, computed there (not here) so it can compare
  // against the session's own ratcheted best rather than a value this
  // component would otherwise have to re-derive itself.
  newBest: { type: Boolean, default: false },
  // Mirrors ResultHeader.vue's `revealed` prop -- flips false -> true
  // exactly once per round to kick off the entrance below. Starting (or
  // restored) already true skips straight to the settled end state, no
  // animation, same as useResultReveal.js's showImmediately()/reduced-motion
  // paths.
  revealed: { type: Boolean, default: false },
  // True whenever composables/useResultReveal.js's current reveal was
  // reached via an instant path (a restored round, or reduced motion) --
  // this component can't otherwise tell "just restored" apart from "just
  // finished," since both hand it `revealed: true` on their very first
  // render.
  instant: { type: Boolean, default: false },
});

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const STAMP_STAGGER_MS = 100;
const CLIMB_STEP_MS = 400;
// Extra breathing room between the last rung stamping in and the climb's
// first step, so the two beats read as distinct rather than one blur.
const CLIMB_START_PAUSE_MS = 250;

// One entry per RANK_TIERS slot (same order: worst..best).
const rungs = reactive(RANK_TIERS.map(() => ({ status: 'unearned', appeared: false })));
const newBestAchieved = ref(false);

let timeoutIds = [];
function after(ms, fn) {
  timeoutIds.push(setTimeout(fn, ms));
}
function clearPendingTimeouts() {
  timeoutIds.forEach(clearTimeout);
  timeoutIds = [];
}

/** Renders the fully-settled end state instantly, no animation -- used for reduced motion and for a restored/already-finished round. */
function settleInstantly() {
  clearPendingTimeouts();
  const baselineIndex = props.previousBest ? getRankTierIndex(props.previousBest.overPar) : -1;
  const targetIndex = getRankTierIndex(props.overPar);
  const earnedThrough = Math.max(baselineIndex, targetIndex);
  rungs.forEach((rung, index) => {
    rung.appeared = true;
    rung.status = index === targetIndex ? 'current' : index <= earnedThrough ? 'earned' : 'unearned';
  });
  newBestAchieved.value = false; // no "just happened" moment to celebrate on an instant settle
}

/** The one-shot stamp-in-then-climb sequence -- see the file header above. */
function playEntrance() {
  clearPendingTimeouts();
  const baselineIndex = props.previousBest ? getRankTierIndex(props.previousBest.overPar) : -1;
  const targetIndex = getRankTierIndex(props.overPar);
  // No pill on Genius -- see the file header comment for why.
  newBestAchieved.value = props.newBest && targetIndex !== RANK_TIERS.length - 1;

  if (prefersReducedMotion || props.instant) {
    settleInstantly();
    return;
  }

  rungs.forEach((rung, index) => {
    rung.appeared = false;
    // Every tier AT or BELOW this round's result always starts unearned --
    // the climb below animates through all of them, every time, regardless
    // of previousBest. Only a tier ABOVE this round's result -- only
    // possible on a worse repeat of an already-better-earned puzzle --
    // keeps its earned-from-history status, since the climb never reaches
    // it this round (mirrors settleInstantly()'s equivalent rule below).
    rung.status = index > targetIndex && index <= baselineIndex ? 'earned' : 'unearned';
  });

  RANK_TIERS.forEach((_, index) => {
    after(index * STAMP_STAGGER_MS, () => {
      rungs[index].appeared = true;
    });
  });
  const stampSettleMs = RANK_TIERS.length * STAMP_STAGGER_MS + CLIMB_START_PAUSE_MS;

  // Always climbs the FULL ladder from Warming Up up to this round's result
  // -- never shortcut by previousBest -- so even a repeat of an
  // already-ranked puzzle gets the same "spotlight climbing one rung at a
  // time" moment as a first-ever finish. Each step lights the new rung up
  // as 'current' (the loud achieved/darker-green-or-gold look) and, in the
  // same tick, settles the rung the spotlight just left into 'earned'
  // (checkmark stays, look lightens) -- the achieved rung itself is simply
  // never demoted, since nothing steps past it.
  for (let index = 0; index <= targetIndex; index++) {
    const stepDelay = stampSettleMs + index * CLIMB_STEP_MS;
    after(stepDelay, () => {
      rungs[index].status = 'current';
      if (index > 0) rungs[index - 1].status = 'earned';
    });
  }
}

watch(
  () => props.revealed,
  (isRevealed, wasRevealed) => {
    if (!isRevealed || wasRevealed) return;
    playEntrance();
  },
  { immediate: true }
);

onBeforeUnmount(clearPendingTimeouts);

// Best tier first -- RANK_TIERS itself is worst-first (see rules.js), but a
// ladder reads top-down as best-to-worst.
const rungsForDisplay = computed(() =>
  RANK_TIERS.map((tier, index) => ({ tier, index, state: rungs[index], isGenius: index === RANK_TIERS.length - 1 })).reverse()
);

function dotsToGo(tier) {
  return getDotsToRank(props.overPar, tier.overPar);
}
</script>

<template>
  <div class="rank-ladder">
    <div
      v-for="{ tier, state, isGenius } in rungsForDisplay"
      :key="tier.rank"
      class="rung"
      :class="[state.status, { appeared: state.appeared, genius: isGenius }]"
    >
      <span class="rung-icon" aria-hidden="true">
        <!-- Genius shows its brain emoji even while unearned (the dashed-gold
             "aspirational hero" look below) -- every other tier stays a bare
             circle until actually earned/current. -->
        <span v-if="state.status === 'current' || state.status === 'earned' || isGenius">{{ tier.emoji || '✓' }}</span>
      </span>
      <span class="rung-name">{{ tier.rank }}</span>
      <span class="rung-meta">
        <span v-if="state.status === 'current' && newBestAchieved" class="new-best-pill">New best!</span>
        <span v-else-if="state.status === 'unearned' && dotsToGo(tier) > 0" class="to-go">
          {{ dotsToGo(tier) }} dot{{ dotsToGo(tier) === 1 ? '' : 's' }} to go
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.rank-ladder {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.rung {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 2px solid var(--color-card-border);
  background: var(--color-card-bg);
  opacity: 0;
  transform: scale(0.85);
}

.rung.appeared {
  /* Static fallback for once the entrance animation below finishes (or, for
     a rung that later becomes .current, gets superseded by that rule's OWN
     `animation` declaration below -- the `animation` shorthand doesn't
     merge across rules, so without a plain, non-animated opacity/transform
     here too, a rung reaching .current would otherwise snap back to this
     class's opacity:0/scale(0.85) base the moment rung-stamp stops being
     the active animation). */
  opacity: 1;
  transform: none;
  animation: rung-stamp 0.32s ease-out forwards;
}

@keyframes rung-stamp {
  0% {
    opacity: 0;
    transform: scale(0.85);
  }
  65% {
    opacity: 1;
    transform: scale(1.06);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rung {
    opacity: 1;
    transform: none;
  }

  .rung.appeared {
    animation: none;
  }

  .rung.current {
    animation: none;
  }
}

.rung-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 800;
  background: rgba(36, 27, 20, 0.08);
  color: var(--color-ink-dim);
}

.rung-name {
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.82rem;
  color: var(--color-ink-dim);
}

.rung-meta {
  margin-left: auto;
  text-align: right;
}

.to-go {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.68rem;
  color: var(--color-ink-dim);
}

/* Earned on a previous playthrough (or passed during this round's climb) --
   a settled, lighter accent look; never the loud "you are here" treatment
   reserved for .current below. */
.rung.earned {
  border-color: rgba(28, 140, 82, 0.35);
}

.rung.earned .rung-icon {
  background: rgba(28, 140, 82, 0.16);
  color: var(--color-peg);
}

.rung.earned .rung-name {
  color: var(--color-ink-secondary);
}

/* The rank actually achieved this round -- the one loud "you are here"
   rung. The color swap uses the same short ease already used for
   StatsView.vue's rank bars; the landing itself gets its own settle-bounce
   (same shape as Board.vue's board-settle) so arriving here reads as a
   distinct event during the climb, not just an ambient color fade. */
.rung.current {
  border-color: var(--color-ink);
  background: var(--color-peg);
  box-shadow: var(--frame-shadow-card);
  transition: background-color 0.25s ease-out;
  animation: rung-land 0.35s ease-out;
}

@keyframes rung-land {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

.rung.current .rung-icon {
  background: var(--color-card-bg);
  color: var(--color-peg);
}

.rung.current .rung-name {
  color: var(--color-header-text);
}

/* Genius is the hero tier -- a distinct gold treatment layered on top of
   the normal earned/current/unearned looks above (never a fourth parallel
   state), using the theme's one existing amber accent (--color-board-plate,
   the board tray color) rather than inventing a new one. */
.rung.genius.unearned {
  border-style: dashed;
  border-color: var(--color-board-plate);
  background: var(--color-card-bg);
}

.rung.genius.unearned .rung-icon {
  background: rgba(240, 178, 58, 0.22);
}

.rung.genius.current {
  background: var(--color-board-plate);
}

.rung.genius.current .rung-name {
  /* The green .current rung uses white text (--color-header-text) for
     contrast against its dark green; gold is much lighter, so dark ink
     reads better here instead. */
  color: var(--color-ink);
}

.new-best-pill {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--color-card-bg);
  color: var(--color-peg);
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.64rem;
  letter-spacing: 0.02em;
  animation: new-best-pop 0.3s ease-out;
}

@keyframes new-best-pop {
  0% {
    opacity: 0;
    transform: scale(0.7);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .new-best-pill {
    animation: none;
  }
}
</style>
