<!--
  ============================================================================
  components/ResultOverlay.vue
  ----------------------------------------------------------------------------
  Shown once the round is over (win or not-quite-win): a Wordle/Connections-
  style result modal with exactly three parts --
    1. HEADER: the rank ("GENIUS", "Eg-no-ra-moose", ...) and the puzzle's
       date underneath, small and muted. The rank itself "climbs" up
       through every tier worse than the one achieved before landing on it
       (see climbSequence/runClimb below) -- both the reveal itself and the
       board's own round-over pulse (see Board.vue) are the "something
       just happened" cue, since this modal can otherwise be scrolled out
       of view below the board on a short screen.
    2. CENTER CARD: a mini read-only snapshot of the final board (see
       MiniBoard.vue) styled like the real board tray, with the best-
       possible and actual peg counts underneath.
    3. FOOTER: one full-width "Share Score" button that copies a spoiler-
       safe result line to the clipboard, and a second button to the
       archive.
  This component is purely presentational -- it reads the final state from
  the `game` prop and formats the share text via services/viral.js.
  ============================================================================
-->
<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { buildShareText, copyTextToClipboard } from '../services/viral.js';
import { getRankClimbSequence } from '../logic/rules.js';
import { useRouter } from '../composables/useRouter.js';
import MiniBoard from './MiniBoard.vue';

const props = defineProps({
  game: { type: Object, required: true },
  puzzle: { type: Object, required: true },
});

const { navigate } = useRouter();

// --- the rank "sliding scale" reveal: climb up through every tier worse
// than the one achieved (see logic/rules.js's getRankClimbSequence), then
// land and stay on the real one. A 1-tier sequence (already at the
// bottom) just shows that tier directly -- there's nothing worse to climb
// past.

const climbSequence = computed(() => getRankClimbSequence(props.game.pegsRemaining));
const climbStepIndex = ref(0);
const settled = ref(climbSequence.value.length <= 1);
const displayedTier = computed(() => climbSequence.value[climbStepIndex.value]);

const CLIMB_STEP_MS = 260;
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let climbTimeoutId = null;

function runClimb() {
  const lastIndex = climbSequence.value.length - 1;
  if (climbStepIndex.value >= lastIndex) {
    settled.value = true;
    return;
  }
  climbTimeoutId = setTimeout(() => {
    climbStepIndex.value += 1;
    runClimb();
  }, CLIMB_STEP_MS);
}

const modalRef = ref(null);

onMounted(() => {
  if (!prefersReducedMotion && climbSequence.value.length > 1) {
    runClimb();
  } else {
    climbStepIndex.value = climbSequence.value.length - 1;
    settled.value = true;
  }

  // The modal can land below the board, off the bottom of a short screen --
  // bring it into view instead of leaving the player to scroll and hunt
  // for it.
  modalRef.value?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
});

onBeforeUnmount(() => {
  if (climbTimeoutId !== null) clearTimeout(climbTimeoutId);
});

/** Puzzle dates are plain "YYYY-MM-DD" local dates (see logic/daily.js) -- format without letting the browser reinterpret it in another timezone. Custom (editor-made) puzzles have no date at all. */
const formattedDate = computed(() => {
  if (!props.puzzle.date) return null;
  const [year, month, day] = props.puzzle.date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
});

const shareText = computed(() =>
  buildShareText({
    dateLabel: formattedDate.value,
    pegsRemaining: props.game.pegsRemaining,
    bestPossible: props.game.par,
    rankLabel: props.game.rank.rank,
  })
);

const shareStatusMessage = ref('');

async function handleShareClick() {
  const didCopy = await copyTextToClipboard(shareText.value);
  shareStatusMessage.value = didCopy ? 'Copied to clipboard!' : "Couldn't copy -- try again, or share a screenshot instead.";
}

function goToArchive() {
  navigate('/archive');
}
</script>

<template>
  <div ref="modalRef" class="result-modal">
    <header class="result-header">
      <p class="rank-title" :class="{ settled }">
        <span v-if="displayedTier.emoji" aria-hidden="true">{{ displayedTier.emoji }}</span>
        {{ displayedTier.rank }}
      </p>
      <p v-if="formattedDate" class="result-date">{{ formattedDate }}</p>
    </header>

    <div class="result-card">
      <MiniBoard class="mini-board" :geometry="game.geometry" :mask="game.state.mask" />

      <div class="stat-row">
        <div class="stat">
          <span class="stat-value">{{ game.par }}</span>
          <span class="stat-label">Best possible</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ game.pegsRemaining }}</span>
          <span class="stat-label">Your score</span>
        </div>
      </div>
    </div>

    <footer class="result-footer">
      <button type="button" class="share-button" @click="handleShareClick">Share Score 📋</button>
      <p v-if="shareStatusMessage" class="share-status" role="status">{{ shareStatusMessage }}</p>

      <button type="button" class="archive-button" @click="goToArchive">Missed a day? Browse the archive 📅</button>
    </footer>
  </div>
</template>

<style scoped>
.result-modal {
  margin-top: 14px;
  width: 100%;
  max-width: 420px;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* A one-shot entrance so the whole modal reads as a distinct "event"
     rather than just more page content appearing below the board. */
  animation: modal-enter 0.35s ease-out;
}

.result-header {
  text-align: center;
}

.rank-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.9rem;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: var(--color-ink);
}

/* The moment the "climbing" rank reveal (see script) lands on the real
   rank, a quick pop punctuates it as the final answer rather than just
   another step in the sequence. */
.rank-title.settled {
  animation: rank-settle 0.4s ease-out;
}

@keyframes modal-enter {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes rank-settle {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.14);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .result-modal,
  .rank-title.settled {
    animation: none;
  }
}

.result-date {
  margin: 4px 0 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--color-ink-dim);
}

.result-card {
  padding: 20px;
  background: var(--color-board-plate);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-board);
}

.mini-board {
  max-width: 220px;
  margin: 0 auto;
}

.stat-row {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 18px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--color-ink);
}

.stat-label {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-ink-secondary);
}

.result-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Matches components/Controls.vue's ".control-button.solid" (the Reset
   button) property-for-property, so the two read as the same control
   language -- but full-width, since this button stands alone. */
.share-button {
  width: 100%;
  min-height: 52px;
  padding: 8px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-card-bg);
  background: var(--color-peg);
  border-width: var(--control-border-width);
  border-style: solid;
  border-color: var(--color-peg);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.share-button:hover {
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.share-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.share-status {
  margin: 0;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--color-ink-dim);
}

.archive-button {
  width: 100%;
  min-height: 44px;
  padding: 8px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--color-accent);
  background: transparent;
  border-width: var(--control-border-width);
  border-style: solid;
  border-color: var(--color-accent);
  border-radius: 14px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.archive-button:hover {
  background: var(--color-accent);
  color: var(--color-card-bg);
}

.archive-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
