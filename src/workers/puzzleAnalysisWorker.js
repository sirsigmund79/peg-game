// ============================================================================
// workers/puzzleAnalysisWorker.js
// ----------------------------------------------------------------------------
// Runs the full solve + DAG + perceived-difficulty analysis off the main
// thread. This isn't optional: the batch run of scripts/analyze-puzzle-
// difficulty.js showed Octagon/Diamond/Broken Square/some Square puzzles
// routinely take 20-45+ seconds, and the admin puzzle editor's whole point
// is fixing exactly those puzzles -- running that synchronously on the main
// thread (like the existing level editor's "Calculate Max" does for small
// custom designs) would freeze the tab for the puzzles you're most likely
// to be editing here.
//
// Budgets here are deliberately higher than the batch script's: an admin
// re-running ONE puzzle interactively (with a real Cancel button, via
// worker.terminate()) can afford to wait longer than a script that has to
// move through hundreds of puzzles unattended.
//
// Message protocol:
//   in:  { geometry, holeColors, colorCount, cellCount }
//   out: { type: 'result', par, dagSummary, perceived } | { type: 'error', message }
// ============================================================================

import { createStartingMasks } from '../logic/rules.js';
import { buildPuzzleDag, summarizeDagForPuzzle, DagBudgetExceededError } from '../logic/puzzleDag.js';
import { analyzePerceivedDifficulty } from '../logic/puzzlePerceivedDifficulty.js';

const SOLVE_NODE_BUDGET = 5_000_000;
const DAG_NODE_BUDGET = 1_000_000;
const SAMPLE_WIDTH = 4;

self.onmessage = (event) => {
  try {
    const { geometry, holeColors, colorCount, cellCount } = event.data;
    const startingMasks = createStartingMasks(cellCount, holeColors, colorCount);

    let dag;
    let sampled = false;
    try {
      dag = buildPuzzleDag(geometry.moves, cellCount, startingMasks, {
        nodeBudget: SOLVE_NODE_BUDGET,
        dagNodeBudget: DAG_NODE_BUDGET,
      });
    } catch (error) {
      if (!(error instanceof DagBudgetExceededError)) throw error;
      try {
        dag = buildPuzzleDag(geometry.moves, cellCount, startingMasks, {
          nodeBudget: SOLVE_NODE_BUDGET,
          sampleWidth: SAMPLE_WIDTH,
        });
        sampled = true;
      } catch (retryError) {
        if (!(retryError instanceof DagBudgetExceededError)) throw retryError;
        dag = { dagComplete: false, sampled: false, nodesVisited: null, target: null, startingMasks, everLegalHoles: new Set() };
      }
    }

    const dagSummary = summarizeDagForPuzzle(dag, holeColors);
    const perceived = analyzePerceivedDifficulty(geometry, startingMasks, holeColors, dag.target);

    self.postMessage({
      type: 'result',
      par: dag.target,
      dagSummary: { ...dagSummary, sampled: sampled || dagSummary.sampled },
      perceived,
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
