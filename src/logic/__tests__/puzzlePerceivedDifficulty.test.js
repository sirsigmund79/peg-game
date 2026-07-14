// ============================================================================
// logic/__tests__/puzzlePerceivedDifficulty.test.js
// ----------------------------------------------------------------------------
// Reuses the trap fixture from puzzleDag.test.js (see that file's header for
// why it's a clean, hand-verified case): from the start there are exactly 2
// legal moves, one safe (reaches the floor of 1 peg) and one a trap (dead-ends
// at 4 pegs). Which move looks "first" or "most obvious" to a naive strategy
// depends entirely on move-list order in this fixture (a single color and
// both candidate moves land on the same cell, so every heuristic here
// degenerates to "whichever move is listed first") -- so listing the safe
// move first makes every heuristic stumble onto it, and listing the trap
// first makes every heuristic walk straight into it. Both extremes were
// confirmed against the real implementation before being written into these
// assertions.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { runPerceivedDifficultyBattery, computeSymmetryScore, analyzePerceivedDifficulty } from '../puzzlePerceivedDifficulty.js';
import { createStartingMasks } from '../rules.js';

const CELLS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }];
const HOLE_COLORS = [0, -1, 0, 0, 0, 0];

const SAFE_MOVE_FIRST = [
  { from: 0, over: 1, to: 2 },
  { from: 2, over: 1, to: 0 },
  { from: 1, over: 2, to: 3 },
  { from: 3, over: 2, to: 1 }, // the safe first move
  { from: 1, over: 4, to: 5 },
  { from: 5, over: 4, to: 1 }, // the trap
];
const TRAP_MOVE_FIRST = [
  { from: 1, over: 4, to: 5 },
  { from: 5, over: 4, to: 1 }, // the trap, now listed first
  { from: 0, over: 1, to: 2 },
  { from: 2, over: 1, to: 0 },
  { from: 1, over: 2, to: 3 },
  { from: 3, over: 2, to: 1 },
];

function makeGeometry(moves) {
  return { cells: CELLS, moves, cellCount: CELLS.length, layoutStyle: 'grid' };
}

describe('runPerceivedDifficultyBattery', () => {
  it('every naive heuristic stumbles onto the optimum when the safe move is listed first', () => {
    const startingMasks = createStartingMasks(CELLS.length, HOLE_COLORS, 1);
    const result = runPerceivedDifficultyBattery(makeGeometry(SAFE_MOVE_FIRST), startingMasks, [1]);
    expect(result.perceivedDifficulty).toBe(0);
    for (const heuristic of result.heuristicResults) {
      expect(heuristic.succeeded).toBe(true);
      expect(heuristic.finalPerColor).toEqual([1]);
    }
  });

  it('every naive heuristic walks into the trap when it is listed first instead', () => {
    const startingMasks = createStartingMasks(CELLS.length, HOLE_COLORS, 1);
    const result = runPerceivedDifficultyBattery(makeGeometry(TRAP_MOVE_FIRST), startingMasks, [1]);
    expect(result.perceivedDifficulty).toBe(1);
    for (const heuristic of result.heuristicResults) {
      expect(heuristic.succeeded).toBe(false);
      expect(heuristic.finalPerColor).toEqual([4]);
    }
  });

  it('reports null (not a crash) when there is no proven target to compare against', () => {
    const startingMasks = createStartingMasks(CELLS.length, HOLE_COLORS, 1);
    const result = runPerceivedDifficultyBattery(makeGeometry(SAFE_MOVE_FIRST), startingMasks, null);
    expect(result.perceivedDifficulty).toBeNull();
    for (const heuristic of result.heuristicResults) {
      expect(heuristic.succeeded).toBeNull();
    }
  });
});

describe('computeSymmetryScore', () => {
  it('finds a perfect non-identity reflection on a palindromic row', () => {
    const geometry = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], layoutStyle: 'grid' };
    expect(computeSymmetryScore(geometry, [0, -1, 0])).toBe(1);
  });

  it('scores a partial match when only the empty middle hole survives the flip', () => {
    const geometry = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], layoutStyle: 'grid' };
    expect(computeSymmetryScore(geometry, [0, -1, 1])).toBeCloseTo(1 / 3, 10);
  });

  it('ignores a transform that only maps the board onto itself as the identity permutation', () => {
    // On a single row (all y=0), a "vertical flip" maps every cell to
    // itself -- that's not a real symmetry of THIS board, whatever the
    // transform is called in the abstract, and must not be reported as one.
    const geometry = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], layoutStyle: 'grid' };
    // The only real non-identity automorphism here is the horizontal flip,
    // already covered above -- a shape with genuinely no non-identity
    // automorphism (unequal-length arms) must report null, not a stray 1.
    const noSymmetryGeometry = {
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }],
      layoutStyle: 'grid',
    };
    expect(computeSymmetryScore(noSymmetryGeometry, [0, 0, 0, -1])).toBeNull();
  });

  it('finds the triangular-lattice rotation/reflection group on a real triangle board shape', () => {
    // 3-row triangle (6 cells): row 0 has 1 cell, row 1 has 2, row 2 has 3.
    const cells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col <= row; col++) cells.push({ x: col, y: row });
    }
    const geometry = { cells, layoutStyle: 'triangular-lattice' };
    expect(computeSymmetryScore(geometry, cells.map(() => 0))).toBe(1); // one color everywhere -> perfectly symmetric
    expect(computeSymmetryScore(geometry, [0, 1, 0, 0, 0, 0])).toBeCloseTo(2 / 3, 10); // one off-color corner breaks some, not all, symmetry
  });
});

describe('analyzePerceivedDifficulty', () => {
  it('combines both signals for one puzzle', () => {
    const startingMasks = createStartingMasks(CELLS.length, HOLE_COLORS, 1);
    const result = analyzePerceivedDifficulty(makeGeometry(SAFE_MOVE_FIRST), startingMasks, HOLE_COLORS, [1]);
    expect(result.perceivedDifficulty).toBe(0);
    expect(result.heuristicResults).toHaveLength(4);
    // This board (a row + an off-axis stub) has no non-trivial automorphism.
    expect(result.symmetryScore).toBeNull();
  });
});
