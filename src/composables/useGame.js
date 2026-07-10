// ============================================================================
// composables/useGame.js
// ----------------------------------------------------------------------------
// This is the bridge between the pure game logic (logic/rules.js) and the
// screen. It holds the CURRENT state of one round being played -- which
// pegs (and which colors) are on the board, what's selected, the undo
// history, move count, and whether the round has been won.
//
// Vue components (like Board.vue) read this state to know what to draw, and
// call its functions (selectHole, undo, reset) in response to taps. This
// file itself never touches the DOM -- that's what makes it a "composable"
// instead of a component.
// ============================================================================

import { reactive, computed } from 'vue';
import {
  createStartingMasks,
  getOccupiedMask,
  getColorAt,
  findLegalMoves,
  applyMove,
  isRoundOver,
  countPegsRemaining,
  getRankForOverPar,
} from '../logic/rules.js';
import { vibrateJump, vibrateRoundOver } from '../fx/haptics.js';
import { playSound, playRoundOverChime, soundState } from '../fx/sound.js';
import { recordResult } from '../logic/history.js';

function sum(numbers) {
  return numbers.reduce((total, value) => total + value, 0);
}

/**
 * Creates a fresh, playable game for one puzzle.
 *
 * @param {{geometry: object, holeColors: number[], colorCount: number, par: number[], cellCount: number}} puzzle
 *   a puzzle definition, e.g. from logic/daily.js's getTodaysPuzzle()
 * @returns the reactive game state and the functions to play it
 */
export function useGame(puzzle) {
  const geometry = puzzle.geometry;
  const startingMasks = createStartingMasks(puzzle.cellCount, puzzle.holeColors, puzzle.colorCount);

  // `state` is the one reactive object every other function below reads
  // from and writes to. Because it's created with Vue's reactive(), any
  // Vue component that reads these values will automatically re-render
  // when they change -- no manual "update the screen" code needed.
  const state = reactive({
    masks: startingMasks, // which holes currently have a peg, one bigint bitmask per color
    selectedHole: null, // index of the peg the player has tapped, or null
    undoStack: [], // previous masks arrays, so Undo can step backward
    moveCount: 0,
    // The most recent jump's {from, over, to}, or null. A fresh object
    // every time (never mutated in place) so Board.vue can watch it and
    // replay the "peg travels over, jumped peg dissolves" animation.
    lastMove: null,
  });

  const pegsRemaining = computed(() => countPegsRemaining(state.masks));

  const roundOver = computed(() => isRoundOver(state.masks, geometry.moves));

  // How many MORE pegs, in total, the player currently has left than the
  // puzzle's solver-proven best (par) -- the only measure that stays
  // meaningful across boards with different color counts/par totals.
  const overPar = computed(() => sum(pegsRemaining.value) - sum(puzzle.par));

  // The player has WON once no moves remain AND either:
  //  - this puzzle hides friends (see logic/story/story.js's
  //    getChapterPuzzle()) and every friend's hole has lost its peg, or
  //  - (the normal/daily game) every color matches this exact puzzle's
  //    solver-proven target.
  // If the round is over but neither holds, that's a loss (they got stuck
  // early, a friend's hole is still covered, or a color settled higher
  // than optimal).
  const hasWon = computed(() => {
    if (!roundOver.value) return false;
    if (puzzle.friendHoles) return puzzle.friendHoles.every((index) => !holeHasPeg(index));
    return pegsRemaining.value.every((count, colorIndex) => count === puzzle.par[colorIndex]);
  });

  const rank = computed(() => getRankForOverPar(overPar.value));

  // Every legal move the selected peg could make right now (the full
  // {from, over, to} triples, not just the landing holes) -- Board.vue uses
  // this both to light up valid landing holes and to highlight the
  // connector lines leading to them.
  const validMoves = computed(() => {
    if (state.selectedHole === null) return [];
    return findLegalMoves(state.masks, geometry.moves, state.selectedHole);
  });

  // Just the landing-hole side of validMoves, for the common case of
  // "which holes should light up".
  const validTargetHoles = computed(() => validMoves.value.map((move) => move.to));

  /** @returns {boolean} true if hole `index` currently has a peg (of any color). */
  function holeHasPeg(index) {
    const bit = 1n << BigInt(index);
    return (getOccupiedMask(state.masks) & bit) !== 0n;
  }

  /** @returns {number} the color index of the peg at `index`, or -1 if empty. */
  function getHoleColor(index) {
    return getColorAt(state.masks, index);
  }

  /**
   * Call this when the player taps a hole. Handles all three cases:
   * selecting a peg, deselecting the currently-selected peg, or jumping
   * into a valid landing hole.
   *
   * @param {number} index - the hole that was tapped
   */
  function selectHole(index) {
    if (roundOver.value) return; // no more moves to make

    // Tapping the already-selected peg again deselects it.
    if (state.selectedHole === index) {
      state.selectedHole = null;
      return;
    }

    // Tapping a hole that's a legal landing spot for the current
    // selection performs the jump.
    if (state.selectedHole !== null && validTargetHoles.value.includes(index)) {
      const move = { from: state.selectedHole, over: findOverHole(state.selectedHole, index), to: index };
      jump(move);
      return;
    }

    // Otherwise: if it's a peg, select it (or switch selection to it). If
    // it's an empty hole with no relevance right now, ignore the tap --
    // unless a peg WAS selected, in which case the player just tried an
    // illegal jump (a different color, or nothing to jump over), which is
    // worth a distinct "nope" sound.
    if (holeHasPeg(index)) {
      state.selectedHole = index;
      playSound('select');
    } else {
      if (state.selectedHole !== null) playSound('invalid');
      state.selectedHole = null;
    }
  }

  /** Finds the "over" hole for a from -> to jump, using the board's move list. */
  function findOverHole(from, to) {
    const move = geometry.moves.find((candidate) => candidate.from === from && candidate.to === to);
    return move ? move.over : null;
  }

  /**
   * Applies a jump: removes the jumped peg, moves the jumping peg, records
   * history for Undo, and clears the current selection.
   *
   * @param {{from:number, over:number, to:number}} move
   */
  function jump(move) {
    state.undoStack.push(state.masks);
    state.masks = applyMove(state.masks, move);
    state.moveCount += 1;
    state.selectedHole = null;
    state.lastMove = move;

    // Buzz and "landing" sound for the jump itself, plus an extra buzz and
    // chime once the round ends -- ANY ending, not just reaching the
    // puzzle's par, so getting stuck early still feels like a clear,
    // deliberate stop rather than the game just going quiet on you.
    vibrateJump();
    playSound('move');
    const roundJustEnded = isRoundOver(state.masks, geometry.moves);
    if (roundJustEnded) {
      vibrateRoundOver();
      const finalPegsRemaining = countPegsRemaining(state.masks);
      const won = finalPegsRemaining.every((count, colorIndex) => count === puzzle.par[colorIndex]);
      // Scheduled to start once the move sound's tone has finished, rather
      // than stacking both sounds on top of each other.
      playRoundOverChime(soundState.move.duration);
      // Custom editor designs (puzzleNumber === null) aren't real daily
      // puzzles, so components/ArchiveView.vue has nothing to show for
      // them -- there's nothing worth recording.
      if (puzzle.puzzleNumber !== null) {
        const overParAtEnd = sum(finalPegsRemaining) - sum(puzzle.par);
        recordResult(puzzle.puzzleNumber, { pegsRemaining: finalPegsRemaining, overPar: overParAtEnd, won });
      }
    }
  }

  /** Undoes the most recent jump, if there is one. Unlimited undos. */
  function undo() {
    if (state.undoStack.length === 0) return;
    state.masks = state.undoStack.pop();
    state.moveCount = Math.max(0, state.moveCount - 1);
    state.selectedHole = null;
    state.lastMove = null;
    playSound('undo');
  }

  /** Resets the board back to the puzzle's starting position. */
  function reset() {
    state.masks = startingMasks;
    state.selectedHole = null;
    state.lastMove = null;
    state.undoStack = [];
    state.moveCount = 0;
  }

  // NOTE: we wrap the returned object in reactive() so that computed refs
  // like `hasWon` or `validTargetHoles` are automatically "unwrapped" when
  // read as `game.hasWon` from a template or another component -- without
  // this, every reader would need to write `game.hasWon.value` instead,
  // which is an easy thing to forget and a confusing thing to explain.
  return reactive({
    state,
    geometry,
    par: puzzle.par,
    pegsRemaining,
    overPar,
    roundOver,
    hasWon,
    rank,
    validMoves,
    validTargetHoles,
    holeHasPeg,
    getHoleColor,
    selectHole,
    undo,
    reset,
  });
}
