// ============================================================================
// puzzleDifficultyRecord.js
// ----------------------------------------------------------------------------
// Builds a logic/puzzleDifficulty.js-shaped record from a freshly completed
// admin re-run (see workers/puzzleAnalysisWorker.js), using the SAME field
// semantics scripts/analyze-puzzle-difficulty.js produces -- mismatch
// detection, and a difficultyBucket classified against that generated
// file's OWN stored percentile cutoffs (DIFFICULTY_META), not recomputed
// from scratch. That's what makes a single-puzzle live update safe to
// splice in without re-running the whole batch: the cutoffs stay valid
// (until the next full regeneration), only this one puzzle's numbers change.
//
// No Vue code lives here.
// ============================================================================

import { DIFFICULTY_META } from './puzzleDifficulty.js';

/** Exported so a live re-run's UI (AdminPuzzleEditPanel.vue) can show a difficulty bucket too, not just a saved record -- same cutoffs either way. */
export function classifyDifficultyBucket(totalDifficulty) {
  if (totalDifficulty === null) return 'Unknown';
  if (totalDifficulty <= DIFFICULTY_META.easyCutoff) return 'Easy';
  if (totalDifficulty <= DIFFICULTY_META.mediumCutoff) return 'Medium';
  return 'Genius';
}

/**
 * @param {{puzzleNumber:number, date:string, boardName:string, pegCount:number, storedPar:number[], analysis:{dagSummary:object, perceived:object, par:number[]|null}, wallClockMs:number}} input
 * @returns {object} a full logic/puzzleDifficulty.js PUZZLE_DIFFICULTY record
 */
export function buildDifficultyRecordFromAnalysis({ puzzleNumber, date, boardName, pegCount, storedPar, analysis, wallClockMs }) {
  const { dagSummary, perceived, par: solverPar } = analysis;
  const storedBest = storedPar.reduce((sum, count) => sum + count, 0);
  const solverBest = dagSummary.dagComplete ? solverPar.reduce((sum, count) => sum + count, 0) : null;

  let mismatch = null;
  if (!dagSummary.dagComplete) mismatch = 'solver_incomplete';
  else if (solverBest < storedBest) mismatch = 'solver_found_better';
  else if (solverBest > storedBest) mismatch = 'solver_worse_than_stored';

  return {
    puzzleNumber,
    date,
    // Once this is saved it always resolves via SCHEDULED_PUZZLES from now
    // on (see daily.js), regardless of whether it started out pool-sourced.
    boardId: 'scheduled',
    boardName,
    pegCount,
    bestPossible: storedBest,
    solverBest,
    mismatch,
    wallClockMs,
    ...dagSummary,
    perceivedDifficulty: perceived.perceivedDifficulty,
    heuristicResults: perceived.heuristicResults,
    symmetryScore: perceived.symmetryScore,
    difficultyBucket: classifyDifficultyBucket(dagSummary.totalDifficulty),
  };
}
