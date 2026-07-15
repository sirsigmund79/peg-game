// ============================================================================
// logic/__tests__/daily.test.js
// ----------------------------------------------------------------------------
// Covers logic/daily.js's getPuzzleForNumber() lookup order, with particular
// attention to the layer added by scripts/freeze-and-shrink-pool.js: a
// hand-scheduled puzzle (logic/scheduledPuzzles.js) must still win over
// everything, a frozen day (logic/frozenDailyPuzzles.js) must win over the
// pool, and anything covered by neither must still fall through to the
// normal pool/shuffle lookup exactly as before.
//
// logic/puzzlePool.js, logic/frozenDailyPuzzles.js, and
// logic/scheduledPuzzles.js are mocked with small, hand-built fixtures
// rather than tested against the real (ever-growing, real-data) files --
// this is the one place in the app where the precedence ORDER between three
// lookup layers matters, and that's much more precisely testable against
// fixtures than against production data that changes shape every time the
// freeze script runs again.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';

vi.mock('../puzzlePool.js', () => ({
  PUZZLE_POOL: [
    { boardId: 'triangle', holeColors: [0, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0], par: [1, 1] },
    { boardId: 'triangle', holeColors: [0, 1, 0, 0, -1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0], par: [1, 1] },
  ],
}));

vi.mock('../frozenDailyPuzzles.js', () => ({
  FROZEN_DAILY_PUZZLES: {
    0: { boardId: 'triangle', holeColors: [1, 1, 0, -1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1], par: [2, 1] },
    2: { boardId: 'triangle', holeColors: [1, 0, 1, 1, -1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1], par: [1, 2] },
  },
}));

vi.mock('../scheduledPuzzles.js', () => ({
  // Puzzle number 2 lands on this date too (see getDateForPuzzleNumber) --
  // scheduled must win even though 2 is ALSO a frozen key above.
  SCHEDULED_PUZZLES: {
    '2026-05-31': {
      boardName: 'Scheduled Override',
      shape: 'grid',
      rows: 4,
      cols: 4,
      cellStates: [0, 1, 1, 'empty', 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0],
      colorCount: 2,
      par: [1, 1],
    },
  },
}));

const { getPuzzleForNumber } = await import('../daily.js');

describe('getPuzzleForNumber -- lookup precedence', () => {
  it('returns a frozen day exactly as recorded, not re-derived from the pool', () => {
    const puzzle = getPuzzleForNumber(0);
    expect(puzzle.boardId).toBe('triangle');
    expect(puzzle.holeColors).toEqual([1, 1, 0, -1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1]);
    expect(puzzle.par).toEqual([2, 1]);
  });

  it('a scheduled date wins even when the same puzzle number is ALSO frozen', () => {
    // Puzzle number 2 has a frozen entry above AND a scheduled override for
    // its date -- scheduled must take priority (matches the existing
    // "swap out a past day's puzzle after the fact" behavior).
    const puzzle = getPuzzleForNumber(2);
    expect(puzzle.boardName).toBe('Scheduled Override');
    expect(puzzle.par).toEqual([1, 1]);
  });

  it('a puzzle number covered by neither scheduled nor frozen falls through to the pool', () => {
    // Puzzle number 1 is unfrozen and unscheduled in these fixtures.
    const puzzle = getPuzzleForNumber(1);
    expect(puzzle.boardId).toBe('triangle');
    // Must match ONE of the two pool entries, not the frozen/scheduled ones.
    const matchesPoolEntry = [
      [0, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0],
      [0, 1, 0, 0, -1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    ].some((holeColors) => JSON.stringify(holeColors) === JSON.stringify(puzzle.holeColors));
    expect(matchesPoolEntry).toBe(true);
  });

  it('reconstructs the same puzzle shape (geometry, label, colorCount) for a frozen day as for a pool day', () => {
    const frozen = getPuzzleForNumber(0);
    const pooled = getPuzzleForNumber(1);
    expect(Object.keys(frozen).sort()).toEqual(Object.keys(pooled).sort());
    expect(frozen.geometry).toBeTruthy();
    expect(frozen.colorCount).toBe(frozen.par.length);
    expect(frozen.cellCount).toBe(frozen.geometry.cellCount);
  });
});
