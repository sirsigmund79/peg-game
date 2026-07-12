// ============================================================================
// logic/__tests__/badges.test.js
// ----------------------------------------------------------------------------
// Each BADGE_DEFINITIONS entry's isUnlocked() is a pure function of a stats
// object -- these tests build that object by hand, no logic/badgeStats.js
// or localStorage involved, exactly what makes them easy to write and read.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { BADGE_DEFINITIONS, getSatisfiedBadgeIds } from '../badges.js';

function baseStats(overrides = {}) {
  return {
    geniusPuzzleIds: [],
    cleanGeniusPuzzleIds: [],
    totalPlaythroughs: 0,
    playedThroughPuzzleIds: [],
    resetsByPuzzle: {},
    resetsToGenius: {},
    pegsCleared: { total: 0, byColor: {} },
    ...overrides,
  };
}

function findBadge(id) {
  const badge = BADGE_DEFINITIONS.find((definition) => definition.id === id);
  if (!badge) throw new Error(`no badge definition for id "${id}"`);
  return badge;
}

describe('comeback_kid', () => {
  it('unlocks once any puzzle took 10+ resets before GENIUS', () => {
    expect(findBadge('comeback_kid').isUnlocked(baseStats({ resetsToGenius: { 5: 10 } }))).toBe(true);
  });

  it('stays locked below the 10-reset threshold, even across several puzzles', () => {
    expect(findBadge('comeback_kid').isUnlocked(baseStats({ resetsToGenius: { 5: 9, 6: 3 } }))).toBe(false);
  });
});

describe('thousand_dot_club', () => {
  it('unlocks at exactly 1000 lifetime pegs cleared', () => {
    expect(findBadge('thousand_dot_club').isUnlocked(baseStats({ pegsCleared: { total: 1000, byColor: {} } }))).toBe(true);
  });

  it('stays locked at 999', () => {
    expect(findBadge('thousand_dot_club').isUnlocked(baseStats({ pegsCleared: { total: 999, byColor: {} } }))).toBe(false);
  });
});

describe('clean_genius', () => {
  it('unlocks as soon as any puzzle has a clean GENIUS on record', () => {
    expect(findBadge('clean_genius').isUnlocked(baseStats({ cleanGeniusPuzzleIds: [1] }))).toBe(true);
  });

  it('stays locked with zero clean GENIUS puzzles', () => {
    expect(findBadge('clean_genius').isUnlocked(baseStats())).toBe(false);
  });
});

describe('certified_genius', () => {
  it('unlocks at 50 distinct GENIUS puzzles', () => {
    const stats = baseStats({ geniusPuzzleIds: Array.from({ length: 50 }, (_, i) => i) });
    expect(findBadge('certified_genius').isUnlocked(stats)).toBe(true);
  });

  it('stays locked at 49', () => {
    const stats = baseStats({ geniusPuzzleIds: Array.from({ length: 49 }, (_, i) => i) });
    expect(findBadge('certified_genius').isUnlocked(stats)).toBe(false);
  });
});

describe('a_real_regular (badge 5, placeholder name)', () => {
  it('unlocks at 75 distinct puzzles played through', () => {
    const stats = baseStats({ playedThroughPuzzleIds: Array.from({ length: 75 }, (_, i) => i) });
    expect(findBadge('a_real_regular').isUnlocked(stats)).toBe(true);
  });

  it('stays locked at 74', () => {
    const stats = baseStats({ playedThroughPuzzleIds: Array.from({ length: 74 }, (_, i) => i) });
    expect(findBadge('a_real_regular').isUnlocked(stats)).toBe(false);
  });
});

describe('triple_digit_dot_hopper (badge 6, placeholder name)', () => {
  it('unlocks at 100 total playthroughs', () => {
    expect(findBadge('triple_digit_dot_hopper').isUnlocked(baseStats({ totalPlaythroughs: 100 }))).toBe(true);
  });

  it('stays locked at 99', () => {
    expect(findBadge('triple_digit_dot_hopper').isUnlocked(baseStats({ totalPlaythroughs: 99 }))).toBe(false);
  });
});

describe('getSatisfiedBadgeIds', () => {
  it('returns every badge id whose condition the stats satisfy, and none it does not', () => {
    const stats = baseStats({ totalPlaythroughs: 100, playedThroughPuzzleIds: [1] });
    const satisfied = getSatisfiedBadgeIds(stats);
    expect(satisfied).toEqual(['triple_digit_dot_hopper']);
  });

  it('returns an empty list against a fresh, all-zero stats object', () => {
    expect(getSatisfiedBadgeIds(baseStats())).toEqual([]);
  });
});
