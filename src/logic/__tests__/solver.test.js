// ============================================================================
// logic/__tests__/solver.test.js
// ----------------------------------------------------------------------------
// Focused on the onStateExpanded instrumentation contract (masks, legalMoves,
// key, parentKey) added for workers/searchTreeExplorerWorker.js -- puzzleDag.js's
// own tests already cover findBest's actual par-solving behavior in depth
// (via buildPuzzleDag), so this file doesn't re-derive that; it just proves
// the new key/parentKey plumbing threads a real, walkable parent chain.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createSolver } from '../solver.js';
import { createStartingMasks, applyMove } from '../rules.js';

// Same TRAP fixture as puzzleDag.test.js / searchSimulation.test.js: a row
// of 4 cells sharing its middle cell as a junction with a 2-cell vertical
// stub, single color, only the junction starts empty.
const TRAP_CELL_COUNT = 6;
const TRAP_MOVES = [
  { from: 0, over: 1, to: 2 },
  { from: 2, over: 1, to: 0 },
  { from: 1, over: 2, to: 3 },
  { from: 3, over: 2, to: 1 },
  { from: 1, over: 4, to: 5 },
  { from: 5, over: 4, to: 1 },
];
const TRAP_HOLE_COLORS = [0, -1, 0, 0, 0, 0];

function trapStartMasks() {
  return createStartingMasks(TRAP_CELL_COUNT, TRAP_HOLE_COLORS, 1);
}

describe('createSolver onStateExpanded instrumentation', () => {
  it('reports the root with a null parentKey, and every other state with its real discovering parent', () => {
    const expanded = [];
    const solver = createSolver(TRAP_MOVES, TRAP_CELL_COUNT, {
      onStateExpanded(masks, legalMoves, key, parentKey) {
        expanded.push({ key, parentKey });
      },
    });
    solver.findBest(trapStartMasks());

    expect(expanded.length).toBeGreaterThan(1);
    expect(expanded[0].parentKey).toBeNull();

    const rootKey = expanded[0].key;
    const keysSeen = new Set(expanded.map((entry) => entry.key));
    for (const entry of expanded.slice(1)) {
      expect(typeof entry.parentKey).toBe('bigint');
      // Every non-root state's reported parent is a state that was itself
      // actually expanded (either the root or some earlier entry) -- i.e. a
      // real, walkable edge, never a dangling reference.
      expect(entry.parentKey === rootKey || keysSeen.has(entry.parentKey)).toBe(true);
    }
  });

  it('gives every distinct state exactly one onStateExpanded call, even when reached from multiple parents', () => {
    const expanded = [];
    const solver = createSolver(TRAP_MOVES, TRAP_CELL_COUNT, {
      onStateExpanded(masks, legalMoves, key) {
        expanded.push(key);
      },
    });
    solver.findBest(trapStartMasks());

    expect(new Set(expanded).size).toBe(expanded.length);
  });

  it("does not change findBest's own public single-argument contract", () => {
    const solver = createSolver(TRAP_MOVES, TRAP_CELL_COUNT);
    // The dead-end branch (see the fixture comment above): 4 pegs, no
    // legal moves left -- called exactly the way every real caller in this
    // codebase calls it, with one argument.
    const deadEndMasks = applyMove(trapStartMasks(), { from: 5, over: 4, to: 1 });
    const result = solver.findBest(deadEndMasks);
    expect(result.minPegs).toBe(4);
    expect(result.move).toBeNull();
  });
});
