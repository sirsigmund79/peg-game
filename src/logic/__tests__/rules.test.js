// ============================================================================
// logic/__tests__/rules.test.js
// ----------------------------------------------------------------------------
// Covers getDotsToRank -- the result screen's rank ladder uses this to show
// "N dots to go" on every tier above the one just achieved -- and
// getRankTierIndex, which composables/useGame.js uses to decide whether a
// finish is a genuine "New best!" (a higher RANK, not just a lower raw
// overPar -- see that file's own comments for the bug this was written to
// catch).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { getDotsToRank, getRankTierIndex } from '../rules.js';

describe('getDotsToRank', () => {
  it('is 0 once a tier is already reached', () => {
    expect(getDotsToRank(0, 0)).toBe(0);
    expect(getDotsToRank(0, 1)).toBe(0);
    expect(getDotsToRank(1, 2)).toBe(0);
  });

  it('is the positive distance to a not-yet-reached tier', () => {
    expect(getDotsToRank(3, 0)).toBe(3);
    expect(getDotsToRank(3, 1)).toBe(2);
    expect(getDotsToRank(3, 2)).toBe(1);
  });

  it('is always 0 for the bottom catch-all tier (overPar: null)', () => {
    expect(getDotsToRank(0, null)).toBe(0);
    expect(getDotsToRank(5, null)).toBe(0);
  });
});

describe('getRankTierIndex', () => {
  it('ranks a lower overPar as a higher tier index', () => {
    expect(getRankTierIndex(0)).toBeGreaterThan(getRankTierIndex(1));
    expect(getRankTierIndex(1)).toBeGreaterThan(getRankTierIndex(2));
    expect(getRankTierIndex(2)).toBeGreaterThan(getRankTierIndex(3));
  });

  it('maps every overPar of 3 or more to the same (bottom) tier index, since "Warming Up" is a catch-all', () => {
    expect(getRankTierIndex(3)).toBe(getRankTierIndex(5));
    expect(getRankTierIndex(3)).toBe(getRankTierIndex(100));
  });
});
