// ============================================================================
// workers/searchTreeExplorerWorker.js
// ----------------------------------------------------------------------------
// Runs the REAL solver (logic/solver.js) from a given board position, off
// the main thread, purely to feed components/SearchTreeVisualizer.vue --
// a dev-only, screenshot/recording-oriented view of what the actual search
// looks like. Some boards genuinely visit hundreds of thousands to millions
// of distinct positions to prove their optimum (see puzzleAnalysisWorker.js's
// own header for the 20-45+ second boards) -- this file doesn't shrink that
// down to something fake and small, it reports the real thing:
//
//   - `layerCounts[depth]` -- across EVERY state the real solve visits, how
//     many are exactly `depth` moves from the given position. Sent as
//     periodic `progress` messages while the solve is still running (so the
//     UI can visibly grow these bars in step with genuine computation, not
//     a canned animation), then once more, complete, in the final `done`.
//   - `layerLegalMoveTotals[depth]` -- the SUM of legal-move counts across
//     those same expanded states. This is deliberately a different number
//     from layerCounts: solver.js's own early-exit (it stops trying a
//     state's remaining moves the instant one proves the theoretical floor)
//     means a state can have several legal moves while the search only ever
//     commits to and expands ONE of them -- so layerCounts[depth] can read
//     "1" at a depth whose one visited state still had, say, 4 legal moves
//     on the actual board. layerLegalMoveTotals makes that visible instead
//     of it just looking like the puzzle "only had one option" there.
//   - a small CONNECTED sample of real parent -> child edges (via
//     solver.js's `key`/`parentKey` instrumentation -- see its own header),
//     for drawing an actual (if necessarily partial) piece of the real
//     search graph, not a fabricated illustration.
//
// Message protocol:
//   in:  { geometry, cellCount, masks }
//   out: { type: 'progress', nodesVisited, layerCounts, layerLegalMoveTotals }
//      | { type: 'done', nodesVisited, layerCounts, layerLegalMoveTotals, maxDepth, startingTotal, graphNodes, graphEdges, graphRootKey, target, bestPossibleTotal }
//      | { type: 'budget-exceeded', nodesVisited, layerCounts, layerLegalMoveTotals, maxDepth, startingTotal, graphNodes, graphEdges, graphRootKey }
//      | { type: 'error', message }
// ============================================================================

import { createSolver, SolverBudgetExceededError } from '../logic/solver.js';
import { countPegsRemaining } from '../logic/rules.js';

const NODE_BUDGET = 5_000_000; // matches puzzleAnalysisWorker.js's own SOLVE_NODE_BUDGET
const PROGRESS_EVERY_NODES = 12_000;
const GRAPH_NODE_BUDGET = 160; // how many states the small illustrative graph keeps, total
const MAX_ACCEPTED_CHILDREN_PER_NODE = 4; // caps any one state from eating the whole graph budget itself

function totalPegs(masks) {
  return countPegsRemaining(masks).reduce((sum, count) => sum + count, 0);
}

/** bigint keys survive structured clone, but not as Map/Set keys on the receiving side of some engines -- stringify for the wire, main thread re-Maps them. */
function keyToString(key) {
  return key === null ? null : key.toString();
}

self.onmessage = (event) => {
  try {
    const { geometry, cellCount, masks } = event.data;
    const startingTotal = totalPegs(masks);

    const layerCounts = [];
    const layerLegalMoveTotals = [];
    let nodesVisited = 0;
    let lastReportedAt = 0;

    // A CONNECTED sample of the real search: a node is only ever accepted
    // if its real parent was already accepted (or it's the root), so this
    // is always a genuine, drawable subtree of the actual search -- never a
    // set of nodes with dangling/missing parents.
    const acceptedKeys = new Set();
    const acceptedChildCount = new Map();
    const graphNodes = new Map(); // key(string) -> {depth, branching, isLeaf}
    const graphEdges = []; // {fromKey(string), toKey(string)}
    let graphRootKey = null;

    const solver = createSolver(geometry.moves, cellCount, {
      nodeBudget: NODE_BUDGET,
      onStateExpanded(stateMasks, legalMoves, key, parentKey) {
        nodesVisited += 1;
        const depth = startingTotal - totalPegs(stateMasks);
        layerCounts[depth] = (layerCounts[depth] ?? 0) + 1;
        layerLegalMoveTotals[depth] = (layerLegalMoveTotals[depth] ?? 0) + legalMoves.length;

        if (parentKey === null) {
          acceptedKeys.add(key);
          graphRootKey = keyToString(key);
          graphNodes.set(graphRootKey, { depth, branching: legalMoves.length, isLeaf: legalMoves.length === 0 });
        } else if (acceptedKeys.has(parentKey) && graphNodes.size < GRAPH_NODE_BUDGET) {
          const childCount = acceptedChildCount.get(parentKey) ?? 0;
          if (childCount < MAX_ACCEPTED_CHILDREN_PER_NODE) {
            acceptedKeys.add(key);
            acceptedChildCount.set(parentKey, childCount + 1);
            const childKeyString = keyToString(key);
            graphNodes.set(childKeyString, { depth, branching: legalMoves.length, isLeaf: legalMoves.length === 0 });
            graphEdges.push({ fromKey: keyToString(parentKey), toKey: childKeyString });
          }
        }

        if (nodesVisited - lastReportedAt >= PROGRESS_EVERY_NODES) {
          lastReportedAt = nodesVisited;
          self.postMessage({
            type: 'progress',
            nodesVisited,
            layerCounts: [...layerCounts],
            layerLegalMoveTotals: [...layerLegalMoveTotals],
          });
        }
      },
    });

    function currentGraphPayload() {
      return {
        nodesVisited,
        layerCounts: [...layerCounts],
        layerLegalMoveTotals: [...layerLegalMoveTotals],
        maxDepth: layerCounts.length - 1,
        startingTotal,
        graphNodes: [...graphNodes],
        graphEdges,
        graphRootKey,
      };
    }

    let target = null;
    try {
      target = solver.findBest(masks).perColor;
    } catch (error) {
      if (!(error instanceof SolverBudgetExceededError)) throw error;
      self.postMessage({ type: 'budget-exceeded', ...currentGraphPayload() });
      return;
    }

    self.postMessage({
      type: 'done',
      ...currentGraphPayload(),
      target,
      bestPossibleTotal: target.reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
