// ============================================================================
// workers/puzzleDifficultyProfileWorker.js
// ----------------------------------------------------------------------------
// Feeds components/PuzzleDifficultyProfile.vue -- a dev-only "is this puzzle
// hard, and WHERE" chart. Unlike workers/searchTreeExplorerWorker.js (raw
// search effort, which is partly an artifact of solver.js's own move-order
// and early-exit shortcut -- see that file's header), this reuses the
// codebase's actual, already-built difficulty scorer: logic/puzzleDag.js's
// safe/trap DAG. Every move off the optimal path either stays "safe"
// (the best-possible outcome is still reachable) or is a "trap" (it isn't);
// `computeBranchingMetrics` already turns that into a per-state trapRatio.
// This file's only job is grouping those per-state ratios by DEPTH, so the
// shape of the puzzle's real difficulty -- constrained here, wide open
// there, dangerous somewhere else -- reads directly off a chart, the same
// way logic/puzzleDag.js already feeds the admin scheduling grid's
// difficulty badge (see workers/puzzleAnalysisWorker.js), just broken out
// per depth instead of collapsed into one number.
//
// Budgets mirror puzzleAnalysisWorker.js's own (same reasoning: an admin --
// or here, a dev screenshotting a puzzle -- can afford to wait longer than
// the unattended batch scripts).
//
// Message protocol:
//   in:  { geometry, cellCount, masks }
//   out: { type: 'done', sampled, dagNodeCount, depthProfile, overallTrapRatio, startingTotal, bestPossibleTotal }
//      | { type: 'incomplete', reason: 'solve-incomplete' | 'dag-too-large' }
//      | { type: 'error', message }
// ============================================================================

import { buildPuzzleDag, DagBudgetExceededError, computeBranchingMetrics } from '../logic/puzzleDag.js';

const SOLVE_NODE_BUDGET = 5_000_000;
const DAG_NODE_BUDGET = 1_000_000;
const SAMPLE_WIDTH = 4;

self.onmessage = (event) => {
  try {
    const { geometry, cellCount, masks } = event.data;

    let dag;
    let sampled = false;
    try {
      dag = buildPuzzleDag(geometry.moves, cellCount, masks, { nodeBudget: SOLVE_NODE_BUDGET, dagNodeBudget: DAG_NODE_BUDGET });
    } catch (error) {
      if (!(error instanceof DagBudgetExceededError)) throw error;
      try {
        dag = buildPuzzleDag(geometry.moves, cellCount, masks, { nodeBudget: SOLVE_NODE_BUDGET, sampleWidth: SAMPLE_WIDTH });
        sampled = true;
      } catch (retryError) {
        if (!(retryError instanceof DagBudgetExceededError)) throw retryError;
        self.postMessage({ type: 'incomplete', reason: 'dag-too-large' });
        return;
      }
    }

    if (!dag.dagComplete) {
      self.postMessage({ type: 'incomplete', reason: 'solve-incomplete' });
      return;
    }

    const metrics = computeBranchingMetrics(dag);

    // Group every safe-dag state's trapRatio by how many moves deep it is,
    // so "how dangerous is THIS part of the puzzle" becomes one row per
    // depth instead of one number for the whole thing.
    const byDepth = new Map(); // depth -> { trapRatioSum, rawSum, safeSum, count }
    for (const key of dag.dagNodeKeys) {
      const node = dag.allNodes.get(key);
      const nodeMetrics = metrics.get(key);
      const bucket = byDepth.get(node.depth) ?? { trapRatioSum: 0, rawSum: 0, safeSum: 0, count: 0 };
      bucket.trapRatioSum += nodeMetrics.trapRatio;
      bucket.rawSum += nodeMetrics.rawBranching;
      bucket.safeSum += nodeMetrics.safeBranching;
      bucket.count += 1;
      byDepth.set(node.depth, bucket);
    }

    const maxDepth = Math.max(0, ...byDepth.keys());
    const depthProfile = [];
    let overallTrapRatioSum = 0;
    let overallCount = 0;
    for (let depth = 0; depth <= maxDepth; depth++) {
      const bucket = byDepth.get(depth);
      if (bucket) {
        overallTrapRatioSum += bucket.trapRatioSum;
        overallCount += bucket.count;
      }
      depthProfile.push({
        depth,
        nodeCount: bucket ? bucket.count : 0,
        avgTrapRatio: bucket ? bucket.trapRatioSum / bucket.count : null,
        avgRawBranching: bucket ? bucket.rawSum / bucket.count : null,
        avgSafeBranching: bucket ? bucket.safeSum / bucket.count : null,
      });
    }

    self.postMessage({
      type: 'done',
      sampled,
      dagNodeCount: dag.dagNodeKeys.size,
      depthProfile,
      overallTrapRatio: overallCount > 0 ? overallTrapRatioSum / overallCount : 0,
      startingTotal: dag.startingTotal,
      bestPossibleTotal: dag.bestPossibleTotal,
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
