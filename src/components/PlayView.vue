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
import { ref, watch, computed } from 'vue';
import { getTodaysPuzzle, getPuzzleForNumber } from '../logic/daily.js';
import { useGame } from '../composables/useGame.js';
import { useRouter } from '../composables/useRouter.js';
import { pendingCustomPuzzle } from '../composables/usePendingPuzzle.js';
import Board from './Board.vue';
import StatBar from './StatBar.vue';
import Controls from './Controls.vue';
import ResultOverlay from './ResultOverlay.vue';
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

// `puzzle` and `game` are plain refs (not computed) because loading a new
// puzzle -- whether today's, an archive pick, or a custom design -- always
// needs a brand-new game with an empty undo history, not a recalculation
// of the same one.
const puzzle = ref(resolvePuzzle());
const game = ref(useGame(puzzle.value));

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
    puzzle.value = resolvePuzzle();
    game.value = useGame(puzzle.value);
  }
);
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

      <ResultOverlay v-if="game.roundOver" :game="game" :puzzle="puzzle" />

      <TemporaryWatchSolveButton v-if="isDevBuild" :game="game" />
    </div>

    <Controls :can-undo="game.state.undoStack.length > 0" @undo="game.undo()" @reset="game.reset()" />
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
