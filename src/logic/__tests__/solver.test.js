// ============================================================================
// logic/__tests__/solver.test.js
// ----------------------------------------------------------------------------
// Reuses the exact same hand-verified TRAP fixture as puzzleDag.test.js (see
// that file's header comment for the full walkthrough): a row of 4 cells
// (0-3) sharing its middle cell (1) as a junction with a 2-cell vertical
// stub (4-5), single color, only the junction starts empty. From the start
// there are exactly two legal moves: the "safe" row move ({from:3, over:2,
// to:1}), which threads all the way down to the true floor of 1 peg, and
// the "trap" vertical move ({from:5, over:4, to:1}), which immediately
// dead-ends at 4 pegs with no further legal moves.
//
// This is the same shape of question the live "Genius still reachable"
// indicator asks (see workers/reachabilityWorker.js): from ANY position, is
// this puzzle's par still achievable? These tests exercise `targetFloor`
// (the option that feature relies on) directly against a fixture small
// enough to reason about by hand.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createSolver } from '../solver.js';
import { createStartingMasks, applyMove } from '../rules.js';

const CELLS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }];
const MOVES = [
  { from: 0, over: 1, to: 2 },
  { from: 2, over: 1, to: 0 },
  { from: 1, over: 2, to: 3 },
  { from: 3, over: 2, to: 1 }, // the safe/winning first move
  { from: 1, over: 4, to: 5 },
  { from: 5, over: 4, to: 1 }, // the trap/dead-end first move
];
const HOLE_COLORS = [0, -1, 0, 0, 0, 0];
const SAFE_MOVE = MOVES[3];
const TRAP_MOVE = MOVES[5];
const PAR = 1; // this fixture's true, solver-proven optimum (colorCount === 1)

function startingMasks() {
  return createStartingMasks(CELLS.length, HOLE_COLORS, 1);
}

describe('createSolver targetFloor', () => {
  it('defaults to identical results when targetFloor is left unset', () => {
    const withDefault = createSolver(MOVES, CELLS.length).findBest(startingMasks());
    const withExplicitColorCountFloor = createSolver(MOVES, CELLS.length, { targetFloor: PAR }).findBest(startingMasks());
    expect(withDefault).toEqual(withExplicitColorCountFloor);
    expect(withDefault.minPegs).toBe(PAR);
  });

  it('reports the true best from the trap branch as 4 pegs (no further legal moves)', () => {
    const solver = createSolver(MOVES, CELLS.length);
    const afterTrapMove = applyMove(startingMasks(), TRAP_MOVE);
    expect(solver.findBest(afterTrapMove).minPegs).toBe(4);
  });

  it('with targetFloor set to par: reachable from the safe branch, unreachable from the trap branch', () => {
    const solver = createSolver(MOVES, CELLS.length, { targetFloor: PAR });

    const afterSafeMove = applyMove(startingMasks(), SAFE_MOVE);
    expect(solver.findBest(afterSafeMove).minPegs).toBeLessThanOrEqual(PAR);

    const afterTrapMove = applyMove(startingMasks(), TRAP_MOVE);
    expect(solver.findBest(afterTrapMove).minPegs).toBeGreaterThan(PAR);
  });

  it('an unreachable targetFloor still returns the true best achievable outcome, not a false positive', () => {
    const solver = createSolver(MOVES, CELLS.length, { targetFloor: 0 }); // impossible -- colorCount alone is 1
    const afterTrapMove = applyMove(startingMasks(), TRAP_MOVE);
    const result = solver.findBest(afterTrapMove);
    expect(result.minPegs).toBe(4); // every move was exhausted; this is genuinely the best reachable from here
  });
});
