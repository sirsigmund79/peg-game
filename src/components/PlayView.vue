<!--
  ============================================================================
  components/PlayView.vue
  ----------------------------------------------------------------------------
  The actual game screen -- exactly what a player sees, with nothing else
  competing for their attention. Loads a puzzle (today's by default), lets
  them play it, and shows the result once they finish.

  WHICH puzzle it loads comes from the URL (see composables/useRouter.js):
    "#/"             -> today's puzzle
    "#/play/842"     -> puzzle #842 specifically (used by ArchiveView.vue
                        and the dev puzzle-jumper to send a player here)
  ...or, one-shot, from composables/usePendingPuzzle.js if the level editor
  (dev-only, see components/EditorView.vue) just handed off a custom
  design -- see resolvePuzzle() below.

  The only dev-only thing left on this page is the small "Watch Solve"
  button: unlike the puzzle-archive picker, sound tuner, and level editor
  (all moved to components/DevToolsView.vue), it operates on THIS live
  round's state, so it has to live wherever that state does.
  ============================================================================
-->
<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { getTodaysPuzzle, getPuzzleForNumber } from '../logic/daily.js';
import { useGame } from '../composables/useGame.js';
import { useRouter } from '../composables/useRouter.js';
import { pendingCustomPuzzle } from '../composables/usePendingPuzzle.js';
import { EVENTS, track } from '../services/analytics.js';
import Board from './Board.vue';
import StatBar from './StatBar.vue';
import Controls from './Controls.vue';
import ResultOverlay from './ResultOverlay.vue';
import ArchiveDayStrip from './ArchiveDayStrip.vue';
import TemporaryWatchSolveButton from './TemporaryWatchSolveButton.vue';

const isDevBuild = import.meta.env.DEV;

const { route } = useRouter();

/** Figures out which puzzle to load: a hand-off from the editor, a specific "#/play/N", or today's. */
function resolvePuzzle() {
  if (pendingCustomPuzzle.value) {
    const custom = pendingCustomPuzzle.value;
    pendingCustomPuzzle.value = null;
    return custom;
  }
  const numberSegment = route.segments[1];
  const puzzleNumber = numberSegment !== undefined ? Number.parseInt(numberSegment, 10) : NaN;
  if (Number.isFinite(puzzleNumber)) return getPuzzleForNumber(puzzleNumber);
  return getTodaysPuzzle();
}

/** Analytics-only: where the puzzle useGame() is about to load came from -- mirrors resolvePuzzle()'s own branching. */
function resolveSource() {
  if (pendingCustomPuzzle.value) return 'custom';
  return route.segments[1] !== undefined ? 'link' : 'daily';
}

// `puzzle` and `game` are plain refs (not computed) because loading a new
// puzzle -- whether today's, an archive pick, or a custom design -- always
// needs a brand-new game with an empty undo history, not a recalculation
// of the same one.
const puzzle = ref(resolvePuzzle());
const game = ref(useGame(puzzle.value, { source: resolveSource() }));

/**
 * Fires puzzle_left_incomplete exactly once per round, iff the player made
 * at least one move but the round never finished -- the direct "drop-off"
 * signal docs/ANALYTICS.md's Core Loop Funnel dashboard is built on, rather
 * than only inferring abandonment from a funnel gap.
 */
function reportIncompleteIfNeeded() {
  const currentGame = game.value;
  if (!currentGame || currentGame.roundOver || currentGame.state.incompleteReported) return;
  if (currentGame.state.moveCount === 0) return;
  currentGame.state.incompleteReported = true;
  track(EVENTS.PUZZLE_LEFT_INCOMPLETE, {
    puzzle_number: puzzle.value.puzzleNumber ?? null,
    move_count: currentGame.state.moveCount,
    time_spent_ms: Date.now() - currentGame.state.roundStartedAt,
  });
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') reportIncompleteIfNeeded();
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', reportIncompleteIfNeeded);
});

/** Puzzle dates are plain "YYYY-MM-DD" local dates (see logic/daily.js) -- format for display without letting the browser reinterpret it in another timezone. */
const formattedDate = computed(() => {
  if (!puzzle.value.date) return null;
  const [year, month, day] = puzzle.value.date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
});

// If the URL changes while this page is already mounted (an archive/dev
// link to a different puzzle number, or browser back/forward), load
// whatever it now points to.
watch(
  () => route.path,
  () => {
    reportIncompleteIfNeeded();
    clearResultHold();
    showResult.value = false;
    showArchiveStrip.value = false;
    puzzle.value = resolvePuzzle();
    game.value = useGame(puzzle.value, { source: resolveSource() });
  }
);

// The board itself reacts to `game.roundOver` the instant it flips (see
// Board.vue's own `round-over` cues), but ResultOverlay -- and the page
// scroll it triggers -- is held back a beat so the player gets a moment on
// the board's own end-of-round flourish before their eye gets yanked down
// to the results.
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const RESULT_HOLD_MS = 800;
const showResult = ref(false);
// ArchiveDayStrip.vue (the archive callout below Undo/Reset) only comes in
// once ResultOverlay's OWN reveal animation (rank + score count-up) has
// finished -- see the `@revealed` listener below -- so it never competes
// with that still-playing sequence for attention.
const showArchiveStrip = ref(false);
let resultHoldTimeoutId = null;

function clearResultHold() {
  if (resultHoldTimeoutId !== null) {
    clearTimeout(resultHoldTimeoutId);
    resultHoldTimeoutId = null;
  }
}

watch(
  () => game.value.roundOver,
  (isOver) => {
    clearResultHold();
    if (!isOver) {
      showResult.value = false;
      showArchiveStrip.value = false;
      return;
    }
    if (prefersReducedMotion) {
      showResult.value = true;
      return;
    }
    resultHoldTimeoutId = setTimeout(() => {
      showResult.value = true;
      resultHoldTimeoutId = null;
    }, RESULT_HOLD_MS);
  }
);

onBeforeUnmount(() => {
  clearResultHold();
  reportIncompleteIfNeeded();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('pagehide', reportIncompleteIfNeeded);
});
</script>

<template>
  <div class="play-view">
    <!-- Everything except Controls is centered as one group in the space
         above the utility zone -- Controls is a separate flex sibling
         (not part of this group) so it always pins to the bottom of the
         screen in thumb-reach, no matter how tall the rest of this ends
         up being. -->
    <div class="play-content">
      <p class="puzzle-line">
        <template v-if="formattedDate">{{ formattedDate }} &middot; </template>
        {{ puzzle.label }}
      </p>

      <div class="game-area">
        <StatBar :pegs-remaining="game.pegsRemaining" :move-count="game.state.moveCount" :par="game.par" />

        <Board :game="game" />
      </div>

      <ResultOverlay v-if="showResult" :game="game" :puzzle="puzzle" @revealed="showArchiveStrip = true" />

      <TemporaryWatchSolveButton v-if="isDevBuild" :game="game" />
    </div>

    <Controls
      v-if="!game.roundOver"
      :can-undo="game.state.undoStack.length > 0"
      :round-over="game.roundOver"
      @undo="game.undo()"
      @reset="game.reset()"
    />

    <ArchiveDayStrip v-if="showArchiveStrip && puzzle.puzzleNumber != null" :key="puzzle.puzzleNumber" />
  </div>
</template>

<style scoped>
.play-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}

.play-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 6px 10px;
  text-align: center;
}

.puzzle-line {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.03em;
  color: var(--color-ink-dim);
}

.game-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
}
</style>
