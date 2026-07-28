// ============================================================================
// logic/__tests__/rules.test.js
// ----------------------------------------------------------------------------
// Covers the percentage-based rank logic in rules.js:
//   - getCompletionPercent -- the "% of clearable pegs cleared" a result earns,
//     the single number every rank tier is keyed on.
//   - getRankForOverPar / getRankTierIndex -- which tier a result lands in.
//     composables/useGame.js uses the index to decide whether a finish is a
//     genuine "New best!" (a higher RANK, not just a lower raw overPar).
//   - getDotsToRank -- the result screen's rank ladder uses this to show
//     "N dots to go" on every tier above the one just achieved.
//   - getQuipForRank -- the rotating rib under the rank.
// All of these take `removable` (the puzzle's max clearable pegs) now that
// ranks are relative to puzzle size rather than an absolute peg count.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  getCompletionPercent,
  getRankForOverPar,
  getRankTierIndex,
  getDotsToRank,
  getQuipForRank,
  removablePegCount,
  startingPegCount,
} from '../rules.js';

describe('startingPegCount / removablePegCount', () => {
  it('counts every non-empty (-1) hole as a starting peg', () => {
    expect(startingPegCount([0, 0, -1, 1, -1, 1])).toBe(4);
  });

  it('removable is starting pegs minus total par', () => {
    // 4 starting pegs, par sums to 2 -> 2 clearable.
    expect(removablePegCount([0, 0, -1, 1, -1, 1], [1, 1])).toBe(2);
  });
});

describe('getCompletionPercent', () => {
  it('is 100 exactly at par (overPar 0)', () => {
    expect(getCompletionPercent(0, 10)).toBe(100);
  });

  it('scales linearly with how many of the clearable pegs were cleared', () => {
    expect(getCompletionPercent(1, 10)).toBe(90);
    expect(getCompletionPercent(3, 10)).toBe(70);
    expect(getCompletionPercent(5, 10)).toBe(50);
  });

  it('treats a board with nothing to clear as pass/fail (reaching par is 100)', () => {
    expect(getCompletionPercent(0, 0)).toBe(100);
    expect(getCompletionPercent(1, 0)).toBe(0);
  });
});

describe('getRankForOverPar', () => {
  // removable 10 -> each peg over par is 10 percentage points, so the tier
  // thresholds (100/85/70/50) fall on clean peg counts.
  const R = 10;

  it('reaches Genius only by clearing to par exactly (100%)', () => {
    expect(getRankForOverPar(0, R).rank).toBe('Genius');
    expect(getRankForOverPar(1, R).rank).not.toBe('Genius');
  });

  it('maps each completion band to its tier', () => {
    expect(getRankForOverPar(1, R).rank).toBe('Purty smart'); // 90%
    expect(getRankForOverPar(3, R).rank).toBe('Not bad'); // 70% (boundary)
    expect(getRankForOverPar(5, R).rank).toBe('Movin’ Up'); // 50% (boundary)
    expect(getRankForOverPar(6, R).rank).toBe('Warming Up'); // 40%
  });

  it('includes the boundary percentage in the higher tier (>=, not >)', () => {
    // 85% is the Purty smart floor: overPar 1.5 on removable 10.
    expect(getRankForOverPar(1.5, R).rank).toBe('Purty smart');
  });

  it('makes the same absolute miss kinder on a bigger board', () => {
    // 3 over par: a stumble on a small board, a near-miss on a big one.
    expect(getRankForOverPar(3, 9).rank).toBe('Movin’ Up'); // ~67% (triangle)
    expect(getRankForOverPar(3, 27).rank).toBe('Purty smart'); // ~89% (octagon)
  });
});

describe('getRankTierIndex', () => {
  const R = 10;

  it('ranks a lower overPar as a higher (better) tier index', () => {
    expect(getRankTierIndex(0, R)).toBeGreaterThan(getRankTierIndex(1, R));
    expect(getRankTierIndex(1, R)).toBeGreaterThan(getRankTierIndex(3, R));
    expect(getRankTierIndex(3, R)).toBeGreaterThan(getRankTierIndex(6, R));
  });

  it('maps everything in one completion band to the same tier index', () => {
    // overPar 6..10 on removable 10 is all below 50% -> the bottom catch-all.
    expect(getRankTierIndex(6, R)).toBe(getRankTierIndex(10, R));
  });
});

describe('getDotsToRank', () => {
  const R = 10;

  it('is 0 once a tier is already reached (or is the bottom catch-all)', () => {
    // At overPar 1 (90%), the Not bad (70%) and Movin’ Up (50%) floors are met.
    expect(getDotsToRank(1, R, 70)).toBe(0);
    expect(getDotsToRank(1, R, 50)).toBe(0);
    // The 0% catch-all is always reached, at any overPar.
    expect(getDotsToRank(9, R, 0)).toBe(0);
  });

  it('is the positive peg distance to a not-yet-reached tier', () => {
    // From overPar 5 (50%): Genius (100%) needs to clear 5 more,
    // Purty smart (85%) allows at most 1 over so needs 4 more,
    // Not bad (70%) allows at most 3 over so needs 2 more.
    expect(getDotsToRank(5, R, 100)).toBe(5);
    expect(getDotsToRank(5, R, 85)).toBe(4);
    expect(getDotsToRank(5, R, 70)).toBe(2);
  });

  it('needs overPar 0 to reach the top tier (100% => floor(0) allowed)', () => {
    expect(getDotsToRank(2, R, 100)).toBe(2);
    expect(getDotsToRank(0, R, 100)).toBe(0);
  });
});

describe('getQuipForRank', () => {
  const R = 10;

  it('returns a non-empty rib for the earned tier', () => {
    expect(getQuipForRank(0, R, 1)).toBeTruthy();
    expect(getQuipForRank(6, R, 1)).toBeTruthy();
  });

  it('cycles through a tier’s options as tries increase, then repeats', () => {
    const first = getQuipForRank(6, R, 1);
    const second = getQuipForRank(6, R, 2);
    const third = getQuipForRank(6, R, 3);
    const fourth = getQuipForRank(6, R, 4);
    expect(new Set([first, second, third]).size).toBe(3); // three distinct ribs
    expect(fourth).toBe(first); // wraps back around
  });

  it('treats a 0/undefined tries count as the first attempt', () => {
    expect(getQuipForRank(6, R, 0)).toBe(getQuipForRank(6, R, 1));
  });
});
