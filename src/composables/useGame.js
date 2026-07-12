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
import { recordResult, getResultForPuzzle } from '../logic/history.js';
import { recordBestIfBetter } from '../logic/bestResults.js';
import { getFinishedMasks, recordRoundFinished, clearRoundFinished } from '../logic/roundState.js';
import { recordPegCleared, recordPlaythroughEnded, recordGiveUpReset, recordGeniusReached } from '../logic/badgeStats.js';
import { isGiveUpReset } from '../logic/attemptBoundary.js';
import { EVENTS, track, syncPlayerStatsToPostHog } from '../services/analytics.js';

function sum(numbers) {
  return numbers.reduce((total, value) => total + value, 0);
}

/**
 * Creates a fresh, playable game for one puzzle.
 *
 * @param {{geometry: object, holeColors: number[], colorCount: number, par: number[], cellCount: number}} puzzle
 *   a puzzle definition, e.g. from logic/daily.js's getTodaysPuzzle()
 * @param {{source?: 'daily'|'link'|'custom'}} [options] - where this round was launched from, for analytics only (see services/analytics.js)
 * @returns the reactive game state and the functions to play it
 */
export function useGame(puzzle, options = {}) {
  const geometry = puzzle.geometry;
  const startingMasks = createStartingMasks(puzzle.cellCount, puzzle.holeColors, puzzle.colorCount);
  const source = options.source ?? 'daily';

  // If this puzzle's last round finished and hasn't been Reset since (see
  // logic/roundState.js), resume showing that exact board instead of the
  // starting position -- see the `restoredFinished` flag below, which
  // components/PlayView.vue uses to jump straight to the result screen.
  const restoredMasks = puzzle.puzzleNumber != null ? getFinishedMasks(puzzle.puzzleNumber) : undefined;

  // `state` is the one reactive object every other function below reads
  // from and writes to. Because it's created with Vue's reactive(), any
  // Vue component that reads these values will automatically re-render
  // when they change -- no manual "update the screen" code needed.
  const state = reactive({
    masks: restoredMasks ?? startingMasks, // which holes currently have a peg, one bigint bitmask per color
    selectedHole: null, // index of the peg the player has tapped, or null
    undoStack: [], // previous masks arrays, so Undo can step backward
    moveCount: 0,
    // The most recent jump's {from, over, to}, or null. A fresh object
    // every time (never mutated in place) so Board.vue can watch it and
    // replay the "peg travels over, jumped peg dissolves" animation.
    lastMove: null,
    // Analytics-only bookkeeping (see services/analytics.js's puzzle_completed
    // event) -- kept here rather than as loose module-level variables so a
    // fresh useGame() call (a new puzzle, or a re-visit of the same one)
    // always starts them clean.
    undoCount: 0,
    resetCount: 0,
    roundStartedAt: Date.now(),
    firstMoveTracked: false,
    incompleteReported: false,
    // Badge-stat bookkeeping only (see logic/badgeStats.js's Clean Genius
    // check) -- Undo count for the CURRENT attempt specifically. Unlike
    // undoCount above (which analytics never resets across a reset() within
    // one session -- see the note in reset() below), this one always starts
    // back at 0 for a fresh attempt.
    attemptUndoCount: 0,
  });

  track(EVENTS.PUZZLE_STARTED, {
    puzzle_number: puzzle.puzzleNumber ?? null,
    puzzle_date: puzzle.date ?? null,
    board_shape: puzzle.boardId ?? null,
    color_count: puzzle.colorCount,
    par_total: sum(puzzle.par),
    source,
    already_played: puzzle.puzzleNumber !== null && puzzle.puzzleNumber !== undefined && Boolean(getResultForPuzzle(puzzle.puzzleNumber)),
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
    // Read the jumped-over peg's color BEFORE applying the move -- once
    // applyMove() removes it, there's nothing left at `move.over` to ask.
    const clearedColor = getColorAt(state.masks, move.over);
    state.undoStack.push(state.masks);
    state.masks = applyMove(state.masks, move);
    if (puzzle.puzzleNumber !== null) recordPegCleared(clearedColor);
    state.moveCount += 1;
    state.selectedHole = null;
    state.lastMove = move;

    if (!state.firstMoveTracked) {
      state.firstMoveTracked = true;
      track(EVENTS.PUZZLE_FIRST_MOVE, { puzzle_number: puzzle.puzzleNumber ?? null });
    }

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
      const overParAtEnd = sum(finalPegsRemaining) - sum(puzzle.par);
      // Custom editor designs (puzzleNumber === null) aren't real daily
      // puzzles, so components/ArchiveView.vue has nothing to show for
      // them -- there's nothing worth recording.
      if (puzzle.puzzleNumber !== null) {
        recordResult(puzzle.puzzleNumber, { pegsRemaining: finalPegsRemaining, overPar: overParAtEnd, won });
        recordBestIfBetter(puzzle.puzzleNumber, { pegsRemaining: finalPegsRemaining, overPar: overParAtEnd, won, masks: state.masks });
        recordRoundFinished(puzzle.puzzleNumber, state.masks);
        syncPlayerStatsToPostHog();

        // Reaching a terminal state always ends the current attempt -- see
        // logic/attemptBoundary.js for how this differs from Reset.
        recordPlaythroughEnded(puzzle.puzzleNumber);
        if (getRankForOverPar(overParAtEnd).rank === 'Genius') {
          recordGeniusReached(puzzle.puzzleNumber, { attemptUndoCount: state.attemptUndoCount });
        }
      }
      track(EVENTS.PUZZLE_COMPLETED, {
        puzzle_number: puzzle.puzzleNumber ?? null,
        puzzle_date: puzzle.date ?? null,
        board_shape: puzzle.boardId ?? null,
        color_count: puzzle.colorCount,
        won,
        rank: getRankForOverPar(overParAtEnd).rank,
        over_par: overParAtEnd,
        move_count: state.moveCount,
        undo_count: state.undoCount,
        reset_count: state.resetCount,
        duration_ms: Date.now() - state.roundStartedAt,
        source,
      });
    }
  }

  /** Undoes the most recent jump, if there is one. Unlimited undos. */
  function undo() {
    if (state.undoStack.length === 0) return;
    track(EVENTS.PUZZLE_UNDO_USED, { puzzle_number: puzzle.puzzleNumber ?? null, move_count_before_undo: state.moveCount });
    state.undoCount += 1;
    state.attemptUndoCount += 1;
    state.masks = state.undoStack.pop();
    state.moveCount = Math.max(0, state.moveCount - 1);
    state.selectedHole = null;
    state.lastMove = null;
    playSound('undo');
  }

  /** Resets the board back to the puzzle's starting position. */
  function reset() {
    // Read BEFORE anything below mutates state -- this is the one signal
    // that tells apart the two Reset entry points in the UI (see
    // logic/attemptBoundary.js): Controls' Reset (round still live -- a
    // give-up) vs. ResultFooter's "play again" Reset (round already over).
    const roundOverBeforeReset = roundOver.value;

    // A reset before any move has been made isn't a meaningful "the player
    // is frustrated" signal -- it's just clearing an idle selection, or a
    // stray tap. Only worth recording once there was actual progress to give up.
    if (state.moveCount > 0) {
      track(EVENTS.PUZZLE_RESET_USED, { puzzle_number: puzzle.puzzleNumber ?? null, move_count_before_reset: state.moveCount });
      state.resetCount += 1;
    }

    // A give-up Reset ends the current attempt -- a "play again" Reset
    // after the round already ended does not (that attempt was already
    // recorded as a playthrough the moment it hit its terminal state).
    if (puzzle.puzzleNumber !== null && isGiveUpReset({ roundOverBeforeReset, moveCount: state.moveCount })) {
      recordGiveUpReset(puzzle.puzzleNumber);
      recordPlaythroughEnded(puzzle.puzzleNumber);
    }

    // Explicit reset is the one signal that the next time this puzzle
    // loads, it should start fresh rather than resuming the result screen
    // -- see logic/roundState.js.
    if (puzzle.puzzleNumber != null) clearRoundFinished(puzzle.puzzleNumber);
    state.masks = startingMasks;
    state.selectedHole = null;
    state.lastMove = null;
    state.undoStack = [];
    state.moveCount = 0;
    state.attemptUndoCount = 0;
    state.roundStartedAt = Date.now();
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
    // True when this instance was created already sitting on a finished
    // round restored from logic/roundState.js, rather than having finished
    // during this instance's lifetime -- components/PlayView.vue uses this
    // to jump straight to the result screen without replaying its reveal
    // animation. Fixed at creation time, not reactive to later resets.
    restoredFinished: restoredMasks !== undefined,
    holeHasPeg,
    getHoleColor,
    selectHole,
    undo,
    reset,
  });
}
