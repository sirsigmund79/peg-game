<!--
  ============================================================================
  components/WatchSolution.vue
  ----------------------------------------------------------------------------
  The result screen's "watch the solution" offer, sitting just below the rank
  ladder. Watching is a real trade-off: seeing the optimal solve LOCKS the
  player's rank for this puzzle, so they can never Reset and replay it for a
  better result (see logic/solutionLock.js and composables/useGame.js's
  lockSolution()/reset()). The whole point is that a rank is only worth
  something if you couldn't just peek at the answer and grind a better one.

  So the offer is deliberately a two-step, low-clutter thing:

    1. prompt   -- a single quiet text link ("Watch the solution"), small
                   enough not to compete with Share/Reset above it.
    2. confirm  -- tapping it expands one short, unmissable sentence about the
                   trade-off, with an explicit "watch & lock" vs. "never mind".
                   The player only commits at THIS step, once they've read it.
    3. revealed -- the rank is locked; components/SolutionReplay.vue plays the
                   solve below, replayable as many times as they like.

  A puzzle that's already locked (watched on an earlier visit) mounts straight
  into `revealed`, minus the auto-play -- see SolutionReplay.vue's autoPlay.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { EVENTS, track } from '../services/analytics.js';
import SolutionReplay from './SolutionReplay.vue';

const props = defineProps({
  // The real puzzle definition -- handed through to SolutionReplay.vue.
  puzzle: { type: Object, required: true },
  // The live useGame() instance whose rank this locks. Read for
  // `solutionLocked`, called via `lockSolution()` on confirm.
  game: { type: Object, required: true },
});

// Already-locked puzzles skip straight to the revealed solve (no auto-play,
// so a reload doesn't replay unprompted -- see SolutionReplay.vue).
const mode = ref(props.game.solutionLocked ? 'revealed' : 'prompt');
// True only when we reached `revealed` via a fresh confirm this session --
// the one case where the solve should start playing on its own.
const autoPlay = ref(false);

function openConfirm() {
  mode.value = 'confirm';
  track(EVENTS.SOLUTION_WATCH_PROMPTED, { puzzle_number: props.puzzle.puzzleNumber ?? null });
}

function cancel() {
  mode.value = 'prompt';
}

function confirmWatch() {
  props.game.lockSolution();
  autoPlay.value = true;
  mode.value = 'revealed';
  track(EVENTS.SOLUTION_RANK_LOCKED, {
    puzzle_number: props.puzzle.puzzleNumber ?? null,
    rank: props.game.rank.rank,
    over_par: props.game.overPar,
  });
}
</script>

<template>
  <div class="watch-solution">
    <!-- 1. prompt: a single quiet link, minimal footprint. -->
    <button v-if="mode === 'prompt'" type="button" class="watch-link" @click="openConfirm">
      <span class="watch-eye" aria-hidden="true">👀</span> Watch the solution
    </button>

    <!-- 2. confirm: the trade-off, stated once, plainly, before committing. -->
    <div v-else-if="mode === 'confirm'" class="watch-confirm" role="group" aria-label="Watch the solution">
      <p class="watch-confirm-text">
        Heads up — watching the solution <strong>locks in your rank</strong> for this puzzle. You won't be able to reset and play it again.
      </p>
      <div class="watch-confirm-actions">
        <button type="button" class="watch-confirm-yes" @click="confirmWatch">Watch &amp; lock rank</button>
        <button type="button" class="watch-confirm-no" @click="cancel">Never mind</button>
      </div>
    </div>

    <!-- 3. revealed: rank locked, solve on tap (or auto after confirm). -->
    <div v-else class="watch-reveal">
      <p class="watch-locked-note"><span aria-hidden="true">🔒</span> Rank locked in for this puzzle</p>
      <SolutionReplay :puzzle="puzzle" :auto-play="autoPlay" />
    </div>
  </div>
</template>

<style scoped>
.watch-solution {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

/* The collapsed offer: an understated text link, never a loud button -- it
   must not compete with Share/Reset for attention. */
.watch-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--color-ink-dim);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  transition: color 0.15s ease;
}

@media (hover: hover) {
  .watch-link:hover {
    color: var(--color-ink);
  }
}

.watch-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.watch-eye {
  font-size: 0.9rem;
}

/* The confirm step -- a compact card, but with the trade-off spelled out in
   full so the choice is genuinely informed. A one-shot entrance so expanding
   from the link doesn't snap. */
.watch-confirm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 340px;
  padding: 14px 16px;
  background: var(--color-card-bg);
  border: 1px solid rgba(36, 27, 20, 0.2);
  border-radius: 14px;
  animation: watch-confirm-enter 0.25s ease-out;
}

@keyframes watch-confirm-enter {
  0% {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .watch-confirm {
    animation: none;
  }
}

.watch-confirm-text {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--color-ink-secondary);
}

.watch-confirm-text strong {
  color: var(--color-ink);
}

.watch-confirm-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.watch-confirm-yes,
.watch-confirm-no {
  min-height: 40px;
  padding: 8px 16px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.85rem;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

/* The commit button carries the weight -- solid, so it reads as the real
   action, but the copy ("& lock rank") keeps the consequence attached to it. */
.watch-confirm-yes {
  color: var(--color-card-bg);
  background: var(--color-accent);
  border: var(--control-border-width) solid var(--color-accent);
}

.watch-confirm-no {
  color: var(--color-ink-dim);
  background: transparent;
  border: var(--control-border-width) solid transparent;
}

@media (hover: hover) {
  .watch-confirm-yes:hover {
    background: var(--color-ink);
    border-color: var(--color-ink);
  }

  .watch-confirm-no:hover {
    color: var(--color-ink);
  }
}

.watch-confirm-yes:focus-visible,
.watch-confirm-no:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.watch-reveal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  animation: watch-confirm-enter 0.25s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .watch-reveal {
    animation: none;
  }
}

.watch-locked-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.74rem;
  letter-spacing: 0.02em;
  color: var(--color-ink-dim);
}
</style>
