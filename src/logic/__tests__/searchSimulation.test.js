// ============================================================================
// logic/__tests__/searchSimulation.test.js
// ----------------------------------------------------------------------------
// Reuses the same hand-built TRAP fixture as puzzleDag.test.js (see that
// file's header for the full derivation): a row of 4 cells sharing its
// middle cell as a junction with a 2-cell vertical stub, single color, only
// the junction starts empty -- exactly 2 legal moves from the start.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { sampleBreadthDepth } from '../searchSimulation.js';
import { layoutSearchTreeDendrogram } from '../searchTreeLayout.js';
import { createStartingMasks } from '../rules.js';

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
const TRAP_GEOMETRY = { moves: TRAP_MOVES };

function trapStartMasks() {
  return createStartingMasks(TRAP_CELL_COUNT, TRAP_HOLE_COLORS, 1);
}

describe('sampleBreadthDepth', () => {
  it('reports branching and total pegs remaining at a position', () => {
    const sample = sampleBreadthDepth(TRAP_GEOMETRY, trapStartMasks());
    expect(sample.branching).toBe(2);
    expect(sample.pegsRemaining).toBe(5); // 6 cells, 1 starts empty
  });
});

describe('layoutSearchTreeDendrogram', () => {
  it('places the root at the top, centered, and spreads two symmetric leaves evenly', () => {
    const tree = {
      rootKey: 'root',
      maxDepth: 1,
      nodes: new Map([
        ['root', { depth: 0 }],
        ['left', { depth: 1 }],
        ['right', { depth: 1 }],
      ]),
      primaryParent: new Map([
        ['left', 'root'],
        ['right', 'root'],
      ]),
    };
    const positions = layoutSearchTreeDendrogram(tree);

    expect(positions.get('root').y).toBeCloseTo(9, 5);
    expect(positions.get('left').y).toBeCloseTo(91, 5);
    expect(positions.get('root').x).toBeCloseTo(50, 5);
    expect(positions.get('left').x).toBeLessThan(positions.get('root').x);
    expect(positions.get('right').x).toBeGreaterThan(positions.get('root').x);
  });

  it('centers a parent over its subtree even when children are unevenly distributed', () => {
    const tree = {
      rootKey: 'root',
      maxDepth: 2,
      nodes: new Map([
        ['root', { depth: 0 }],
        ['a', { depth: 1 }],
        ['a1', { depth: 2 }],
        ['a2', { depth: 2 }],
        ['b', { depth: 1 }],
      ]),
      primaryParent: new Map([
        ['a', 'root'],
        ['b', 'root'],
        ['a1', 'a'],
        ['a2', 'a'],
      ]),
    };
    const positions = layoutSearchTreeDendrogram(tree);

    const aX = positions.get('a').x;
    const a1X = positions.get('a1').x;
    const a2X = positions.get('a2').x;
    expect(aX).toBeCloseTo((a1X + a2X) / 2, 5);
  });
});
