<!--
  ============================================================================
  components/ResultOverlay.vue
  ----------------------------------------------------------------------------
  Shown once the round is over (win or not-quite-win): a Wordle/Connections-
  style result modal with exactly three parts --
    1. HEADER: the rank ("GENIUS", "Eg-no-ra-moose", ...) and the puzzle's
       date underneath, small and muted. The rank stays hidden until the
       page has scrolled to the modal and the "Your score" count-up below
       has finished, then pops in once as the achieved rank (see
       rankRevealed/runPegPulses below) -- both the reveal itself and the
       board's own round-over pulse (see Board.vue) are the "something
       just happened" cue, since this modal can otherwise be scrolled out
       of view below the board on a short screen.
    2. CENTER CARD: a mini read-only snapshot of the final board (see
       MiniBoard.vue) styled like the real board tray, with the best-
       possible and actual peg counts underneath.
    3. FOOTER: one full-width "Share Score" button that copies a spoiler-
       safe result line to the clipboard -- including the puzzle's date and
       a direct link back to that exact day, so sharing an archive day
       sends people there, not just to today's puzzle -- and a second
       button to the archive.
  This component is purely presentational -- it reads the final state from
  the `game` prop and formats the share text via services/viral.js.
  ============================================================================
-->
<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { buildShareText, copyTextToClipboard } from '../services/viral.js';
import { getRankForOverPar, getColorAt } from '../logic/rules.js';
import { getPegColor } from '../logic/pegColors.js';
import { computeDisplayPositions } from '../logic/boardLayout.js';
import { useRouter } from '../composables/useRouter.js';
import MiniBoard from './MiniBoard.vue';

const props = defineProps({
  game: { type: Object, required: true },
  puzzle: { type: Object, required: true },
});

const { navigate } = useRouter();

// --- the rank reveal: stays hidden until the score count-up (below) has
// finished, then pops in once as the achieved rank -- no more climbing
// through worse tiers first.

const achievedTier = computed(() => getRankForOverPar(props.game.overPar));
const rankRevealed = ref(false);

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// --- the "Your score" reveal: walk the surviving pegs on the mini board
// one at a time, top-left down to the bottom row, briefly pulsing each
// hole and ticking its color's count up as it's reached -- rather than
// just showing the final tallies outright.

const pegPulseSequence = computed(() => {
  const positions = computeDisplayPositions(props.game.geometry);
  return positions
    .map((position, index) => ({ index, x: position.x, y: position.y, color: getColorAt(props.game.state.masks, index) }))
    .filter((entry) => entry.color !== -1)
    .sort((a, b) => a.y - b.y || a.x - b.x);
});

const displayedScore = ref(props.game.par.map(() => null)); // null == not yet revealed, shown blank
const scoreBumpKeys = ref(props.game.par.map(() => 0)); // bumped per-color to force the count-pop animation to replay
const pulsingHoleIndex = ref(-1);
const pulseStepIndex = ref(0);

const PEG_PULSE_STEP_MS = 300;
let pulseTimeoutId = null;

function runPegPulses() {
  const sequence = pegPulseSequence.value;
  if (pulseStepIndex.value >= sequence.length) {
    pulsingHoleIndex.value = -1;
    rankRevealed.value = true;
    return;
  }
  const step = sequence[pulseStepIndex.value];
  pulsingHoleIndex.value = step.index;
  displayedScore.value[step.color] = (displayedScore.value[step.color] ?? 0) + 1;
  scoreBumpKeys.value[step.color] += 1;
  pulseTimeoutId = setTimeout(() => {
    pulseStepIndex.value += 1;
    runPegPulses();
  }, PEG_PULSE_STEP_MS);
}

const modalRef = ref(null);

// The modal can land below the board, off the bottom of a short screen --
// bring it into view before anything animates, rather than having the
// score count up and the rank reveal happen off-screen while the page is
// still scrolling underneath them.
function waitForScrollSettle() {
  return new Promise((resolve) => {
    if (prefersReducedMotion || !modalRef.value) {
      modalRef.value?.scrollIntoView({ behavior: 'auto', block: 'start' });
      resolve();
      return;
    }
    let settleTimeoutId = null;
    const finish = () => {
      window.removeEventListener('scrollend', finish);
      clearTimeout(settleTimeoutId);
      resolve();
    };
    window.addEventListener('scrollend', finish, { once: true });
    // Fallback for browsers without 'scrollend' (e.g. Safari): assume the
    // smooth scroll has settled after a fixed delay.
    settleTimeoutId = setTimeout(finish, 600);
    modalRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

onMounted(async () => {
  await waitForScrollSettle();

  if (!prefersReducedMotion) {
    runPegPulses();
  } else {
    displayedScore.value = [...props.game.pegsRemaining];
    rankRevealed.value = true;
  }
});

onBeforeUnmount(() => {
  if (pulseTimeoutId !== null) clearTimeout(pulseTimeoutId);
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
    pegsRemaining: props.game.pegsRemaining,
    puzzleNumber: props.puzzle.puzzleNumber,
    formattedDate: formattedDate.value,
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
      <p class="rank-title" :class="{ revealed: rankRevealed }">
        <span v-if="achievedTier.emoji" aria-hidden="true">{{ achievedTier.emoji }}</span>
        {{ achievedTier.rank }}
      </p>
      <p v-if="formattedDate" class="result-date">{{ formattedDate }}</p>
    </header>

    <div class="result-card">
      <MiniBoard class="mini-board" :geometry="game.geometry" :masks="game.state.masks" :pulsing-index="pulsingHoleIndex" />

      <div class="stat-row">
        <div class="stat">
          <span class="stat-value multi">
            <span v-for="(count, colorIndex) in game.par" :key="colorIndex" class="color-count">
              <span class="dot" :style="{ background: getPegColor(colorIndex).hex }" aria-hidden="true"></span>{{ count }}
            </span>
          </span>
          <span class="stat-label">Best possible</span>
        </div>
        <div class="stat">
          <span class="stat-value multi">
            <span v-for="(count, colorIndex) in game.pegsRemaining" :key="colorIndex" class="color-count">
              <span class="dot" :style="{ background: getPegColor(colorIndex).hex }" aria-hidden="true"></span
              ><span class="count-number" :key="scoreBumpKeys[colorIndex]">{{ displayedScore[colorIndex] ?? '' }}</span>
            </span>
          </span>
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
  /* Stays invisible until the score count-up (see script) finishes, then
     pops in as the achieved rank -- kept in layout (not display:none) so
     the header doesn't jump when it appears. */
  opacity: 0;
}

.rank-title.revealed {
  animation: rank-reveal 0.4s ease-out forwards;
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

@keyframes rank-reveal {
  0% {
    opacity: 0;
    transform: scale(0.86);
  }
  60% {
    opacity: 1;
    transform: scale(1.14);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .result-modal,
  .count-number {
    animation: none;
  }

  .rank-title,
  .rank-title.revealed {
    opacity: 1;
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

.stat-value.multi {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* Each tick of the score reveal (see script) replaces this element (via
   its bump-keyed :key), which replays the pop -- same beat as the rank's
   own settle pop above. */
.count-number {
  display: inline-block;
  min-width: 0.6em;
  animation: count-pop 0.3s ease-out;
}

@keyframes count-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

.dot {
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  flex: 0 0 auto;
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
