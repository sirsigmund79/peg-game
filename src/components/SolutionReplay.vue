<!--
  ============================================================================
  components/SolutionReplay.vue
  ----------------------------------------------------------------------------
  A small, watch-only copy of the puzzle that auto-plays the optimal solve,
  shown once the player has chosen to lock their rank in exchange for seeing
  the answer (see components/WatchSolution.vue). "Below the rank ladder" per
  the design: the same familiar board, just miniature and non-interactive,
  so the solve reads as "here's how it's done" rather than a second puzzle to
  play.

  The demonstration runs on a THROWAWAY useGame() instance (`ephemeral: true`,
  puzzleNumber forced to null) so replaying the solve records nothing and
  fires no analytics -- watching must never look like the player played the
  puzzle again. The solve itself reuses fx/watchSolve.js, the exact same
  solver-planned playback the level editor's Watch Solve uses, so this stays
  in sync with that one animation.

  The board is wrapped in an `inert` container: the player watches, they
  don't tap. All the interactivity Board.vue offers is simply never reachable
  here.
  ============================================================================
-->
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useGame } from '../composables/useGame.js';
import { watchSolve } from '../fx/watchSolve.js';
import { EVENTS, track } from '../services/analytics.js';
import Board from './Board.vue';

const props = defineProps({
  // The real puzzle definition (geometry, holeColors, colorCount, par,
  // cellCount, puzzleNumber) -- puzzleNumber is kept only for analytics; the
  // demo game below deliberately runs without it.
  puzzle: { type: Object, required: true },
  // Kick the solve off automatically on mount -- true when the player just
  // confirmed "watch the solution" (they asked to see it now), false when
  // this is simply restored on a later visit to an already-locked puzzle
  // (auto-replaying on every reload would be jarring).
  autoPlay: { type: Boolean, default: false },
});

// Throwaway board used only to demonstrate the solve -- see the file header.
const demoGame = useGame({ ...props.puzzle, puzzleNumber: null }, { ephemeral: true });

const isSolving = ref(false);
const hasPlayed = ref(false);
let disposed = false;

async function play() {
  if (isSolving.value) return;
  const isFirstAuto = !hasPlayed.value && props.autoPlay;
  // Every manual "watch again" is worth a signal; the initial auto-play
  // isn't (it's implied by the lock event WatchSolution.vue already fired).
  if (!isFirstAuto) {
    track(EVENTS.SOLUTION_REPLAYED, { puzzle_number: props.puzzle.puzzleNumber ?? null });
  }
  hasPlayed.value = true;
  isSolving.value = true;
  demoGame.reset(); // back to the starting position before each run
  await watchSolve(demoGame);
  if (!disposed) isSolving.value = false;
}

onMounted(() => {
  if (props.autoPlay) play();
});

onBeforeUnmount(() => {
  disposed = true;
});
</script>

<template>
  <div class="solution-replay">
    <!-- inert: the player watches the solve, they never tap this board. -->
    <div class="solution-board" inert aria-hidden="true">
      <Board :game="demoGame" compact />
    </div>
    <button type="button" class="replay-button" :disabled="isSolving" @click="play">
      <span aria-hidden="true">{{ isSolving ? '·' : hasPlayed ? '↻' : '▶' }}</span>
      {{ isSolving ? 'Playing the solve…' : hasPlayed ? 'Watch again' : 'Watch the solve' }}
    </button>
  </div>
</template>

<style scoped>
.solution-replay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

/* The board draws itself at its own compact size (see Board.vue); this just
   holds it and keeps the whole thing unreachable to pointer/keyboard. */
.solution-board {
  display: flex;
  justify-content: center;
  width: 100%;
}

.replay-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 8px 18px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--color-accent);
  background: transparent;
  border: var(--control-border-width) solid var(--color-accent);
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

@media (hover: hover) {
  .replay-button:not(:disabled):hover {
    background: var(--color-accent);
    color: var(--color-card-bg);
  }
}

.replay-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.replay-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
