// ============================================================================
// puzzleAdminResolve.js
// ----------------------------------------------------------------------------
// Resolves any puzzle number into its editable design content, regardless of
// whether it's currently pool-sourced or already a scheduledPuzzles.js
// override -- the one bit of logic both useAdminPuzzleEditor.js (loading a
// puzzle into the edit panel) and AdminPuzzlesView.vue's drag-to-swap need,
// factored out so it's only written once.
//
// No Vue code lives here.
// ============================================================================

import { getPuzzleForNumber, getDateForPuzzleNumber } from './daily.js';
import { SCHEDULED_PUZZLES } from './scheduledPuzzles.js';
import { convertBoardToDesign } from './puzzleDesignConversion.js';

/**
 * @param {number} puzzleNumber
 * @returns {{date: string, isScheduled: boolean, boardName: string, design: import('./customBoard.js').BoardDesign & {colorCount: number}, par: number[]}}
 */
export function resolvePuzzleForAdmin(puzzleNumber) {
  const date = getDateForPuzzleNumber(puzzleNumber);
  const scheduledDesign = SCHEDULED_PUZZLES[date];

  if (scheduledDesign) {
    return {
      date,
      isScheduled: true,
      boardName: scheduledDesign.boardName,
      design: scheduledDesign,
      par: scheduledDesign.par,
    };
  }

  const puzzle = getPuzzleForNumber(puzzleNumber);
  return {
    date,
    isScheduled: false,
    boardName: puzzle.boardName,
    design: { ...convertBoardToDesign(puzzle.geometry, puzzle.holeColors), colorCount: puzzle.colorCount },
    par: puzzle.par,
  };
}

/** Builds the {date, boardName, shape, rows/cols|radius, cellStates, colorCount, par} payload the admin write endpoint expects, for a given target date, from a resolved puzzle's content. */
export function buildScheduledEntryPayload(targetDate, resolved) {
  const { design, boardName, par } = resolved;
  return {
    date: targetDate,
    boardName,
    shape: design.shape || 'grid',
    ...(design.shape === 'triangle' ? { radius: design.radius } : { rows: design.rows, cols: design.cols }),
    cellStates: design.cellStates,
    colorCount: design.colorCount,
    par,
  };
}

/**
 * A puzzleDifficulty.js record describes the puzzle's CONTENT (board layout)
 * -- pegCount, branching, bestPossible, difficultyBucket, etc. -- not the day
 * it happens to be shown on. `puzzleNumber`/`date` are the only fields that
 * are actually about the SLOT rather than the content, so when two days trade
 * content (AdminPuzzlesView.vue's drag-to-swap), their difficulty records
 * must trade right along with it -- otherwise the grid keeps showing each
 * day's OLD bucket, which after a swap describes whatever puzzle used to live
 * there, not the one a player will actually see. A day whose incoming content
 * was never analyzed loses whatever stale record was sitting there, rather
 * than keep displaying a bucket that isn't its own.
 *
 * @param {{puzzleNumber: number, date: string, record: object|null}} sourceSlot
 * @param {{puzzleNumber: number, date: string, record: object|null}} targetSlot
 * @returns {Array<{puzzleNumber: number, record: object|null}>} what each slot's PUZZLE_DIFFICULTY entry should become (null means "remove it")
 */
export function buildSwappedDifficultyRecords(sourceSlot, targetSlot) {
  const relabel = (record, puzzleNumber, date) => (record ? { ...record, puzzleNumber, date } : null);
  return [
    { puzzleNumber: sourceSlot.puzzleNumber, record: relabel(targetSlot.record, sourceSlot.puzzleNumber, sourceSlot.date) },
    { puzzleNumber: targetSlot.puzzleNumber, record: relabel(sourceSlot.record, targetSlot.puzzleNumber, targetSlot.date) },
  ];
}
