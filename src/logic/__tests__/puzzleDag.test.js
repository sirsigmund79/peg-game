// ============================================================================
// logic/__tests__/puzzleDag.test.js
// ----------------------------------------------------------------------------
// Two hand-built micro-boards, small enough to enumerate and verify by hand,
// anchor these tests:
//
// TRAP fixture (6 cells: a row of 4 sharing its middle cell as a junction
// with a 2-cell vertical stub, single color, only the junction cell starts
// empty): from the start there are exactly 2 legal moves. Taking the row
// move first threads all the way down to the theoretical floor (1 peg).
// Taking the vertical move first immediately dead-ends at 4 pegs -- a real,
// hand-verified trap. Confirmed against the actual solver's own values
// before being written into these assertions.
//
// TRANSPOSITION fixture (two disjoint 3-in-a-row groups, single color): the
// two groups don't share any cell, so clearing them in either order reaches
// the exact same final board -- a genuine DAG merge, and the textbook case
// findTranspositionGroups exists to collapse back into one effective choice.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildPuzzleDag,
  computeBranchingMetrics,
  computeEffectiveBranching,
  computeTotalDifficulty,
  countOptimalPaths,
  checkResidueCap,
  checkNoIsolatedDots,
  checkSolvabilitySanity,
  summarizeDagForPuzzle,
  DagBudgetExceededError,
} from '../puzzleDag.js';
import { createStartingMasks, countPegsRemaining } from '../rules.js';

const TRAP_CELLS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }];
const TRAP_MOVES = [
  { from: 0, over: 1, to: 2 },
  { from: 2, over: 1, to: 0 },
  { from: 1, over: 2, to: 3 },
  { from: 3, over: 2, to: 1 },
  { from: 1, over: 4, to: 5 },
  { from: 5, over: 4, to: 1 },
];
const TRAP_HOLE_COLORS = [0, -1, 0, 0, 0, 0]; // only the junction cell (1) starts empty

function buildTrapDag(options = {}) {
  const startingMasks = createStartingMasks(TRAP_CELLS.length, TRAP_HOLE_COLORS, 1);
  return buildPuzzleDag(TRAP_MOVES, TRAP_CELLS.length, startingMasks, options);
}

const TRANSPOSITION_MOVES = [
  { from: 0, over: 1, to: 2 },
  { from: 2, over: 1, to: 0 },
  { from: 3, over: 4, to: 5 },
  { from: 5, over: 4, to: 3 },
];
const TRANSPOSITION_HOLE_COLORS = [0, 0, -1, 0, 0, -1]; // row A: 0,1,2 -- row B: 3,4,5, disjoint

function buildTranspositionDag() {
  const startingMasks = createStartingMasks(6, TRANSPOSITION_HOLE_COLORS, 1);
  return buildPuzzleDag(TRANSPOSITION_MOVES, 6, startingMasks, {});
}

describe('buildPuzzleDag', () => {
  it('finds the proven optimum and terminates (peg count strictly decreases, so no state repeats)', () => {
    const dag = buildTrapDag();
    expect(dag.dagComplete).toBe(true);
    expect(dag.target).toEqual([1]);
    expect(dag.startingTotal).toBe(5);
    expect(dag.bestPossibleTotal).toBe(1);
  });

  it('classifies the safe move and the trap move correctly at the branching state', () => {
    const dag = buildTrapDag();
    const startKey = [...dag.dagNodeKeys][0]; // start is always visited first
    const edgesFromStart = dag.allEdges.filter((edge) => edge.fromKey === startKey);
    expect(edgesFromStart).toHaveLength(2);

    const safeEdge = edgesFromStart.find((edge) => edge.isSafe);
    const trapEdge = edgesFromStart.find((edge) => !edge.isSafe);
    expect(safeEdge.move).toEqual({ from: 3, over: 2, to: 1 });
    expect(trapEdge.move).toEqual({ from: 5, over: 4, to: 1 });
  });

  it('records the trap edge (and its target node) without expanding past it', () => {
    const dag = buildTrapDag();
    // 6 dag nodes on the safe path, but 7 allNodes total -- the one extra is
    // the trap target, recorded but never recursed into.
    expect(dag.dagNodeKeys.size).toBe(6);
    expect(dag.allNodes.size).toBe(7);
    expect(dag.dagEdges).toHaveLength(5);
    expect(dag.allEdges).toHaveLength(6);
  });

  it('does not repeat the underlying solve budget for calls made during DAG expansion', () => {
    // Every findBest() call during exploration is a cache hit against the
    // one findBest(startingMasks) call that already had to fully explore
    // this position's reachable state space to prove optimality.
    const dag = buildTrapDag({ nodeBudget: 100 });
    expect(dag.dagComplete).toBe(true);
  });
});

describe('computeBranchingMetrics', () => {
  it('gives the branching state raw=2, safe=1, trapRatio=0.5, and every forced state trapRatio=0', () => {
    const dag = buildTrapDag();
    const metrics = computeBranchingMetrics(dag);
    const startKey = [...dag.dagNodeKeys][0];
    expect(metrics.get(startKey)).toEqual({ rawBranching: 2, safeBranching: 1, trapRatio: 0.5 });

    for (const [key, metric] of metrics) {
      if (key === startKey) continue;
      expect(metric.trapRatio).toBe(0); // every other state on this fixture is either forced or terminal
    }
  });
});

describe('computeEffectiveBranching / findTranspositionGroups', () => {
  it('collapses two independent, order-swappable moves into one effective choice', () => {
    const dag = buildTranspositionDag();
    expect(dag.target).toEqual([2]);
    expect(dag.dagNodeKeys.size).toBe(4); // start, after-A, after-B, merged-final

    const startKey = [...dag.dagNodeKeys].find((key) => dag.allNodes.get(key).depth === 0);
    const metrics = computeBranchingMetrics(dag);
    expect(metrics.get(startKey)).toEqual({ rawBranching: 2, safeBranching: 2, trapRatio: 0 });

    const effective = computeEffectiveBranching(dag);
    expect(effective.get(startKey)).toBe(1); // raw/safe say 2 choices, but they're really one
  });

  it('does NOT collapse the trap fixture\'s two genuinely different terminal states', () => {
    // Deeper in the trap fixture's safe path there's a state with two moves
    // that both reach the floor (1 peg) but at DIFFERENT final cells --
    // that's real branching, not a transposition, and should stay 2.
    const dag = buildTrapDag();
    const effective = computeEffectiveBranching(dag);
    const metrics = computeBranchingMetrics(dag);
    for (const key of dag.dagNodeKeys) {
      if (metrics.get(key).safeBranching === 2) {
        expect(effective.get(key)).toBe(2);
      }
    }
  });
});

describe('DAG size cap and sampling fallback', () => {
  it('throws DagBudgetExceededError once DAG expansion (not the solve) exceeds dagNodeBudget', () => {
    // The transposition fixture has 4 dag_nodes; a budget of 2 must be hit
    // partway through expansion, independent of the (trivial) solve cost.
    expect(() => buildTranspositionDagWithBudget(2)).toThrow(DagBudgetExceededError);
  });

  it('sampleWidth avoids the budget entirely by capping branching at every node', () => {
    const startingMasks = createStartingMasks(6, TRANSPOSITION_HOLE_COLORS, 1);
    const dag = buildPuzzleDag(TRANSPOSITION_MOVES, 6, startingMasks, { sampleWidth: 1, rng: () => 0 });
    expect(dag.dagComplete).toBe(true);
    expect(dag.sampled).toBe(true);
    expect(dag.dagNodeKeys.size).toBeLessThan(4); // didn't expand both branches from the start
  });
});

function buildTranspositionDagWithBudget(dagNodeBudget) {
  const startingMasks = createStartingMasks(6, TRANSPOSITION_HOLE_COLORS, 1);
  return buildPuzzleDag(TRANSPOSITION_MOVES, 6, startingMasks, { dagNodeBudget });
}

describe('computeTotalDifficulty', () => {
  it('matches raw_branching x trap_ratio x remaining_depth averaged over dag_nodes, computed by hand', () => {
    const dag = buildTrapDag();
    const metrics = computeBranchingMetrics(dag);
    // Only the start node has a nonzero trap_ratio (0.5), remaining_depth =
    // totalPegs(5) - bestPossibleTotal(1) = 4, raw_branching = 2 -> 2*0.5*4=4.
    // Every other dag_node contributes 0 (trap_ratio 0 everywhere else).
    // Average over the 6 dag_nodes: 4 / 6.
    expect(computeTotalDifficulty(dag, metrics)).toBeCloseTo(4 / 6, 10);
  });

  it('is 0 for the transposition fixture (no traps anywhere)', () => {
    const dag = buildTranspositionDag();
    const metrics = computeBranchingMetrics(dag);
    expect(computeTotalDifficulty(dag, metrics)).toBe(0);
  });
});

describe('countOptimalPaths', () => {
  it('counts 2 distinct move sequences on the trap fixture (node "6" has 2 safe children, both terminal)', () => {
    const dag = buildTrapDag();
    expect(countOptimalPaths(dag)).toBe(2n);
  });

  it('counts 2 distinct move-order sequences on the transposition fixture, even though both land on the identical final board', () => {
    // A-then-B and B-then-A are different ROUTES (that's the whole point of
    // this fixture) even though they converge on one merged state -- route
    // counting is over edges/orderings, not deduplicated by final position.
    const dag = buildTranspositionDag();
    expect(countOptimalPaths(dag)).toBe(2n);
  });

  it('returns 0n for an empty DAG', () => {
    const dag = buildTrapDag({ nodeBudget: 0 });
    expect(dag.dagNodeKeys.size).toBe(0);
    expect(countOptimalPaths(dag)).toBe(0n);
  });
});

describe('checkResidueCap', () => {
  it('passes a color that clears the pool generator\'s own removal bar', () => {
    expect(checkResidueCap([4], [2])).toEqual([]); // removes 2 of 4, bar is 2
    expect(checkResidueCap([3], [2])).toEqual([]); // removes 1 of 3, bar is 1
    expect(checkResidueCap([1], [1])).toEqual([]); // lone peg, 0 required -- can't move at all, that's fine
  });

  it('flags a color that falls short of the bar', () => {
    const failures = checkResidueCap([4], [3]); // removes only 1 of 4, bar is 2
    expect(failures).toHaveLength(1);
    expect(failures[0].check).toBe('residueCap');
  });

  it('skips colors that never had any starting pegs', () => {
    expect(checkResidueCap([0, 4], [0, 2])).toEqual([]);
  });
});

describe('checkNoIsolatedDots', () => {
  it('flags a starting peg whose hole is never in the ever-legal set', () => {
    const failures = checkNoIsolatedDots([0, 1, -1], new Set([0]));
    expect(failures).toHaveLength(1);
    expect(failures[0].detail).toContain('hole 1');
  });

  it('passes when every starting peg is covered', () => {
    expect(checkNoIsolatedDots([0, 1, -1], new Set([0, 1]))).toEqual([]);
  });
});

describe('checkSolvabilitySanity', () => {
  it('passes on the trap fixture (the real solver\'s own move chain reaches the proven target)', () => {
    const dag = buildTrapDag();
    expect(checkSolvabilitySanity(dag.solver, dag.startingMasks, dag.target)).toEqual([]);
  });

  it('flags a solver whose own move chain does not reach the claimed target', () => {
    const startingMasks = createStartingMasks(TRAP_CELLS.length, TRAP_HOLE_COLORS, 1);
    const brokenSolver = { findBest: () => ({ move: null, perColor: countPegsRemaining(startingMasks) }) };
    const failures = checkSolvabilitySanity(brokenSolver, startingMasks, [1]);
    expect(failures).toHaveLength(1);
    expect(failures[0].check).toBe('solvabilitySanity');
  });
});

describe('summarizeDagForPuzzle', () => {
  it('flattens the trap fixture into the generated-file schema', () => {
    const dag = buildTrapDag();
    const summary = summarizeDagForPuzzle(dag, TRAP_HOLE_COLORS);
    expect(summary.dagComplete).toBe(true);
    expect(summary.dagNodeCount).toBe(6);
    expect(summary.dagEdgeCount).toBe(5);
    expect(summary.totalDifficulty).toBeCloseTo(4 / 6, 10);
    expect(summary.optimalPathCount).toBe('2'); // a string -- see puzzleDag.js's own note on why (JSON/bigint)
    expect(summary.acceptanceFailures).toEqual([]);
  });

  it('reports solverIncomplete instead of crashing when the solve exceeds budget', () => {
    const dag = buildTrapDag({ nodeBudget: 0 });
    expect(dag.dagComplete).toBe(false);
    const summary = summarizeDagForPuzzle(dag, TRAP_HOLE_COLORS);
    expect(summary.dagComplete).toBe(false);
    expect(summary.totalDifficulty).toBeNull();
    expect(summary.optimalPathCount).toBeNull();
    expect(summary.acceptanceFailures).toEqual([{ check: 'solverIncomplete', detail: expect.any(String) }]);
  });
});
