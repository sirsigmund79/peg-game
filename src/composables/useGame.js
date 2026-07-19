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
  getRankTierIndex,
} from '../logic/rules.js';
import { vibrateJump, vibrateRoundOver, vibrateInvalid } from '../fx/haptics.js';
import { playRoundOverChime } from '../fx/sound.js';
import { recordResult, getResultForPuzzle } from '../logic/history.js';
import { getBestForPuzzle, recordBestIfBetter } from '../logic/bestResults.js';
import { getFinishedMasks, recordRoundFinished, clearRoundFinished } from '../logic/roundState.js';
import { recordPegCleared, recordPlaythroughEnded, recordGiveUpReset, recordGeniusReached } from '../logic/badgeStats.js';
import { isGiveUpReset } from '../logic/attemptBoundary.js';
import { checkForNewlyUnlockedBadges } from '../logic/badgeUnlocks.js';
import { encodeMasks, moveKey, getSeenMoveKeys, recordMoveSeen } from '../logic/ghostMoves.js';
import { useGhostOutline } from './useGhostOutline.js';
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
  const { ghost } = useGhostOutline();

  // If this puzzle's last round finished and hasn't been Reset since (see
  // logic/roundState.js), resume showing that exact board instead of the
  // starting position -- see the `restoredFinished` flag below, which
  // components/PlayView.vue uses to jump straight to the result screen.
  const restoredMasks = puzzle.puzzleNumber != null ? getFinishedMasks(puzzle.puzzleNumber) : undefined;

  // Seeds both `state.previousBest` and `state.sessionBest` below -- they
  // start out equal and only diverge once an attempt this session actually
  // beats it (see those fields' own comments for why two separate values).
  const priorBest = puzzle.puzzleNumber != null ? getBestForPuzzle(puzzle.puzzleNumber) : undefined;

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
    // The most recent tap that tried (and failed) to land a selected peg
    // somewhere it can't legally go -- a fresh object every time (never
    // mutated in place, same reasoning as lastMove) so Board.vue can watch
    // it and play a one-shot "nope" shake on the peg that tried to move.
    // Purely a feel cue; never affects game state itself.
    invalidAttempt: null,
    // Analytics-only bookkeeping (see services/analytics.js's puzzle_completed
    // event) -- kept here rather than as loose module-level variables so a
    // fresh useGame() call (a new puzzle, or a re-visit of the same one)
    // always starts them clean.
    undoCount: 0,
    resetCount: 0,
    // Ghost Outline analytics-only bookkeeping (see logic/featureFlags.js
    // and services/analytics.js) -- same "not reset by reset()" treatment
    // as undoCount/resetCount above, since these are meant to answer "for
    // this PUZZLE today" (spanning every give-up Reset), not "this single
    // attempt."
    repeatMoveCount: 0, // jumps that repeated an already-seen (state, move) pair today
    cumulativeMoveCount: 0, // total jumps made on this puzzle today, across every attempt
    ghostOutlineUsedThisPuzzle: false, // was Ghost Outline actually visible for at least one jump today
    roundStartedAt: Date.now(),
    firstMoveTracked: false,
    incompleteReported: false,
    // Badge-stat bookkeeping only (see logic/badgeStats.js's Clean Genius
    // check) -- Undo count for the CURRENT attempt specifically. Unlike
    // undoCount above (which analytics never resets across a reset() within
    // one session -- see the note in reset() below), this one always starts
    // back at 0 for a fresh attempt.
    attemptUndoCount: 0,
    // The best-ever result recorded for this puzzle before the attempt
    // whose result is CURRENTLY showing -- frozen for that attempt's whole
    // result screen (see reset() below, which refreshes it from
    // `sessionBest` at the start of the NEXT attempt). Purely the "did THIS
    // attempt just beat it" comparison below for `justAchievedNewBest` --
    // components/RankLadder.vue itself never reads this; its climb is
    // strictly per-playthrough, so a better previousBest tier this attempt
    // didn't reach gets no special treatment there.
    previousBest: priorBest,
    // The live, ratcheting best rank earned on this puzzle so far --
    // across every attempt this session, not just whichever one is
    // currently showing. Seeded the same as previousBest, then advances
    // in place (see jump() below) whenever an attempt reaches a higher
    // rank tier than anything before it. reset() copies this into
    // previousBest at the start of each new attempt, which is what makes a
    // same-session Reset-and-replay compare against whatever this session
    // has actually already earned, rather than a stale creation-time
    // snapshot.
    sessionBest: priorBest,
    // True only immediately after a finish that raised the bar above --
    // false the rest of the time, including a tie or a worse repeat (e.g.
    // two different "Warming Up" results in a row).
    justAchievedNewBest: false,
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

  // The player has WON once no moves remain AND every color matches this
  // exact puzzle's solver-proven target. If the round is over but that
  // doesn't hold, that's a loss (they got stuck early, or a color settled
  // higher than optimal).
  const hasWon = computed(() => {
    if (!roundOver.value) return false;
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

  // Ghost Outline (see logic/ghostMoves.js): which of the SELECTED peg's
  // valid landing holes correspond to a jump already taken from this exact
  // board state, today -- Board.vue draws these with a dotted ring instead
  // of a solid one. Gated on the feature's own on/off switch here (not in
  // Board.vue) so Board.vue never needs to know this feature exists beyond
  // reading one more array, same as validTargetHoles.
  const ghostRepeatedTargetHoles = computed(() => {
    if (!ghost.flagEnabled || !ghost.enabled || state.selectedHole === null) return [];
    const stateKey = encodeMasks(state.masks);
    const seenKeys = getSeenMoveKeys(puzzle.puzzleNumber, stateKey);
    return validMoves.value.filter((move) => seenKeys.includes(moveKey(move))).map((move) => move.to);
  });

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
    // illegal jump (a different color in the way, or nothing to jump over
    // at all) -- that's worth a distinct "nope" cue (see
    // `state.invalidAttempt` above and Board.vue's shake animation) rather
    // than just silently clearing the selection.
    if (holeHasPeg(index)) {
      state.selectedHole = index;
    } else {
      if (state.selectedHole !== null) {
        state.invalidAttempt = { pegIndex: state.selectedHole, targetIndex: index };
        vibrateInvalid();
      }
      state.selectedHole = null;
    }
  }

  /** Clears the current selection without attempting a jump -- e.g. Board.vue calls this when the player taps outside the board entirely. */
  function deselect() {
    state.selectedHole = null;
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
    // Ghost Outline bookkeeping (see logic/ghostMoves.js) -- keyed on the
    // state BEFORE this jump, since that's the state the player was looking
    // at when they chose it. Deliberately never called from reset() -- this
    // is what makes the "already tried" memory survive a same-day Reset.
    // Runs UNCONDITIONALLY, regardless of logic/featureFlags.js's
    // GHOST_OUTLINE_ENABLED -- this is what banks a "before" analytics
    // baseline even while the feature itself stays fully dark.
    if (puzzle.puzzleNumber !== null) {
      const stateKeyBeforeJump = encodeMasks(state.masks);
      const takenKey = moveKey(move);
      if (getSeenMoveKeys(puzzle.puzzleNumber, stateKeyBeforeJump).includes(takenKey)) {
        state.repeatMoveCount += 1;
      }
      state.cumulativeMoveCount += 1;
      // Unlike the counters above, this one DOES check both gates -- it's
      // not "is the feature live," it's "could this player actually have
      // seen a ring just now" (accounts for a player who's personally
      // toggled their own switch off even while the feature is live).
      if (ghost.flagEnabled && ghost.enabled) {
        state.ghostOutlineUsedThisPuzzle = true;
      }
      recordMoveSeen(puzzle.puzzleNumber, stateKeyBeforeJump, takenKey);
    }
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

    // Buzz for the jump itself, plus an extra buzz and chime once the round
    // ends -- ANY ending, not just reaching the puzzle's par, so getting
    // stuck early still feels like a clear, deliberate stop rather than the
    // game just going quiet on you.
    vibrateJump();
    const roundJustEnded = isRoundOver(state.masks, geometry.moves);
    if (roundJustEnded) {
      vibrateRoundOver();
      const finalPegsRemaining = countPegsRemaining(state.masks);
      const won = finalPegsRemaining.every((count, colorIndex) => count === puzzle.par[colorIndex]);
      playRoundOverChime();
      const overParAtEnd = sum(finalPegsRemaining) - sum(puzzle.par);
      // Custom editor designs (puzzleNumber === null) aren't real daily
      // puzzles, so components/ArchiveView.vue has nothing to show for
      // them -- there's nothing worth recording.
      if (puzzle.puzzleNumber !== null) {
        recordResult(puzzle.puzzleNumber, { pegsRemaining: finalPegsRemaining, overPar: overParAtEnd, won });
        recordBestIfBetter(puzzle.puzzleNumber, { pegsRemaining: finalPegsRemaining, overPar: overParAtEnd, won, masks: state.masks });
        recordRoundFinished(puzzle.puzzleNumber, state.masks);
        syncPlayerStatsToPostHog();

        // A "new best" means this attempt reached a strictly HIGHER RANK
        // than anything earned on this puzzle before it (this session or
        // any earlier one) -- compared by rank TIER, not raw overPar, so
        // two different "Warming Up" results (a catch-all tier covering
        // every overPar of 3+) never count as an improvement over each
        // other. Requires a previousBest to already exist -- a puzzle's
        // very first-ever completion has nothing to beat yet, so it seeds
        // the record quietly rather than celebrating a "new best" against
        // nothing. Compared against state.previousBest (frozen for THIS
        // attempt, not yet ratcheted -- see reset() for when that happens)
        // rather than state.sessionBest, so a same-session Reset-and-replay
        // correctly compares against whatever was already earned BEFORE
        // this attempt, not a value this same attempt might be about to
        // set.
        state.justAchievedNewBest =
          Boolean(state.previousBest) && getRankTierIndex(overParAtEnd) > getRankTierIndex(state.previousBest.overPar);
        if (!state.sessionBest || getRankTierIndex(overParAtEnd) > getRankTierIndex(state.sessionBest.overPar)) {
          state.sessionBest = { pegsRemaining: finalPegsRemaining, overPar: overParAtEnd, won, masks: state.masks };
        }

        // Reaching a terminal state always ends the current attempt -- see
        // logic/attemptBoundary.js for how this differs from Reset.
        recordPlaythroughEnded(puzzle.puzzleNumber);
        if (getRankForOverPar(overParAtEnd).rank === 'Genius') {
          recordGeniusReached(puzzle.puzzleNumber, { attemptUndoCount: state.attemptUndoCount });
        }
        checkForNewlyUnlockedBadges(puzzle.puzzleNumber);
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
        repeat_move_count: state.repeatMoveCount,
        cumulative_move_count: state.cumulativeMoveCount,
        ghost_outline_used: state.ghostOutlineUsedThisPuzzle,
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
      track(EVENTS.PUZZLE_RESET_USED, {
        puzzle_number: puzzle.puzzleNumber ?? null,
        move_count_before_reset: state.moveCount,
        repeat_move_count: state.repeatMoveCount,
        cumulative_move_count: state.cumulativeMoveCount,
        ghost_outline_used: state.ghostOutlineUsedThisPuzzle,
      });
      state.resetCount += 1;
    }

    // A give-up Reset ends the current attempt -- a "play again" Reset
    // after the round already ended does not (that attempt was already
    // recorded as a playthrough the moment it hit its terminal state).
    if (puzzle.puzzleNumber !== null && isGiveUpReset({ roundOverBeforeReset, moveCount: state.moveCount })) {
      recordGiveUpReset(puzzle.puzzleNumber);
      recordPlaythroughEnded(puzzle.puzzleNumber);
      checkForNewlyUnlockedBadges(puzzle.puzzleNumber);
    }

    // Explicit reset is the one signal that the next time this puzzle
    // loads, it should start fresh rather than resuming the result screen
    // -- see logic/roundState.js.
    if (puzzle.puzzleNumber != null) clearRoundFinished(puzzle.puzzleNumber);
    // Deliberately NOT clearing logic/ghostMoves.js's "already tried" record
    // here -- Ghost Outline is meant to survive a same-day Reset, and only
    // resets itself when the puzzle number changes (a new day).
    state.masks = startingMasks;
    state.selectedHole = null;
    state.lastMove = null;
    state.undoStack = [];
    state.moveCount = 0;
    state.attemptUndoCount = 0;
    state.roundStartedAt = Date.now();
    state.justAchievedNewBest = false;
    // Roll the just-finished attempt's result (if it raised the bar) into
    // the baseline the NEXT attempt's ladder animates from and compares
    // against -- see the state fields' own comments above for why this
    // can't just happen the instant that attempt finished.
    state.previousBest = state.sessionBest;
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
    ghostRepeatedTargetHoles,
    // True when this instance was created already sitting on a finished
    // round restored from logic/roundState.js, rather than having finished
    // during this instance's lifetime -- components/PlayView.vue uses this
    // to jump straight to the result screen without replaying its reveal
    // animation. Fixed at creation time, not reactive to later resets.
    restoredFinished: restoredMasks !== undefined,
    previousBest: computed(() => state.previousBest),
    justAchievedNewBest: computed(() => state.justAchievedNewBest),
    holeHasPeg,
    getHoleColor,
    selectHole,
    deselect,
    undo,
    reset,
  });
}
