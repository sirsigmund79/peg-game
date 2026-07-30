// ============================================================================
// logic/__tests__/badges.test.js
// ----------------------------------------------------------------------------
// Each BADGE_DEFINITIONS entry's isUnlocked() is a pure function of a stats
// object -- these tests build that object by hand, no logic/badgeStats.js
// or localStorage involved, exactly what makes them easy to write and read.
//
// `baseStats` below mirrors logic/badgeInput.js's shape (recorded counters
// PLUS derived fields like longestStreak), since that's what these conditions
// are actually handed at runtime.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { BADGE_DEFINITIONS, getSatisfiedBadgeIds } from '../badges.js';
import { RANK_TIERS } from '../rules.js';

function baseStats(overrides = {}) {
  return {
    geniusPuzzleIds: [],
    oneAndDonePuzzleIds: [],
    totalPlaythroughs: 0,
    playedThroughPuzzleIds: [],
    resetsByPuzzle: {},
    resetsToGenius: {},
    undosByPuzzle: {},
    totalResets: 0,
    ranksReached: [],
    pegsCleared: { total: 0, byColor: {} },
    longestStreak: 0,
    ...overrides,
  };
}

function findBadge(id) {
  const badge = BADGE_DEFINITIONS.find((definition) => definition.id === id);
  if (!badge) throw new Error(`no badge definition for id "${id}"`);
  return badge;
}

/** Builds a playedThroughPuzzleIds list of `count` distinct puzzle numbers. */
function puzzlesPlayed(count) {
  return { playedThroughPuzzleIds: Array.from({ length: count }, (_, i) => i) };
}

describe('every definition is well-formed', () => {
  it('has a unique id, a name, an icon, and a description', () => {
    const ids = BADGE_DEFINITIONS.map((badge) => badge.id);
    expect(new Set(ids).size).toBe(ids.length);
    BADGE_DEFINITIONS.forEach((badge) => {
      expect(badge.name).toBeTruthy();
      expect(badge.icon).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(typeof badge.isUnlocked).toBe('function');
    });
  });

  it('keeps the golden-ticket treatment to the two badges meant to feel rare', () => {
    // A guard on taste, not correctness: `rare` is display-only, and the
    // effect stops meaning anything if it spreads across the shelf.
    const rareIds = BADGE_DEFINITIONS.filter((badge) => badge.rare).map((badge) => badge.id);
    expect(rareIds).toEqual(['one_and_done', 'certified_genius']);
  });
});

describe('high_five', () => {
  it('unlocks at 5 distinct puzzles played through', () => {
    expect(findBadge('high_five').isUnlocked(baseStats(puzzlesPlayed(5)))).toBe(true);
  });

  it('stays locked at 4', () => {
    expect(findBadge('high_five').isUnlocked(baseStats(puzzlesPlayed(4)))).toBe(false);
  });
});

describe('first_fifty', () => {
  it('unlocks at exactly 50 lifetime pegs cleared', () => {
    expect(findBadge('first_fifty').isUnlocked(baseStats({ pegsCleared: { total: 50, byColor: {} } }))).toBe(true);
  });

  it('stays locked at 49', () => {
    expect(findBadge('first_fifty').isUnlocked(baseStats({ pegsCleared: { total: 49, byColor: {} } }))).toBe(false);
  });
});

describe('double_digits', () => {
  it('unlocks at 10 distinct puzzles played through', () => {
    expect(findBadge('double_digits').isUnlocked(baseStats(puzzlesPlayed(10)))).toBe(true);
  });

  it('stays locked at 9', () => {
    expect(findBadge('double_digits').isUnlocked(baseStats(puzzlesPlayed(9)))).toBe(false);
  });
});

describe('george_washington', () => {
  it('unlocks at 25 distinct puzzles played through', () => {
    expect(findBadge('george_washington').isUnlocked(baseStats(puzzlesPlayed(25)))).toBe(true);
  });

  it('stays locked at 24', () => {
    expect(findBadge('george_washington').isUnlocked(baseStats(puzzlesPlayed(24)))).toBe(false);
  });
});

describe('five_timers_club', () => {
  it('unlocks at a 5-day longest streak', () => {
    expect(findBadge('five_timers_club').isUnlocked(baseStats({ longestStreak: 5 }))).toBe(true);
  });

  it('stays locked at 4', () => {
    expect(findBadge('five_timers_club').isUnlocked(baseStats({ longestStreak: 4 }))).toBe(false);
  });

  it('reads the LONGEST streak, so a lapsed run still counts', () => {
    // getBadgeInput() only ever supplies `longest`, never `current` -- this
    // is the property that keeps the badge from un-earning itself.
    expect(findBadge('five_timers_club').isUnlocked(baseStats({ longestStreak: 9, currentStreak: 0 }))).toBe(true);
  });
});

describe('one_and_done', () => {
  it('unlocks as soon as any puzzle has a first-try, no-Undo GENIUS on record', () => {
    expect(findBadge('one_and_done').isUnlocked(baseStats({ oneAndDonePuzzleIds: [1] }))).toBe(true);
  });

  it('stays locked with none on record', () => {
    expect(findBadge('one_and_done').isUnlocked(baseStats())).toBe(false);
  });

  it('is not satisfied by an ordinary GENIUS', () => {
    expect(findBadge('one_and_done').isUnlocked(baseStats({ geniusPuzzleIds: [1, 2, 3] }))).toBe(false);
  });
});

describe('full_ladder', () => {
  it('unlocks once every rank tier has been finished at', () => {
    const everyTier = RANK_TIERS.map((_, index) => index);
    expect(findBadge('full_ladder').isUnlocked(baseStats({ ranksReached: everyTier }))).toBe(true);
  });

  it('stays locked one tier short', () => {
    const allButOne = RANK_TIERS.slice(1).map((_, index) => index);
    expect(findBadge('full_ladder').isUnlocked(baseStats({ ranksReached: allButOne }))).toBe(false);
  });
});

describe('push_to_reset', () => {
  it('unlocks at exactly 50 Reset presses', () => {
    expect(findBadge('push_to_reset').isUnlocked(baseStats({ totalResets: 50 }))).toBe(true);
  });

  it('stays locked at 49', () => {
    expect(findBadge('push_to_reset').isUnlocked(baseStats({ totalResets: 49 }))).toBe(false);
  });
});

describe('comeback_kid', () => {
  it('unlocks once any puzzle took 10+ resets before GENIUS', () => {
    expect(findBadge('comeback_kid').isUnlocked(baseStats({ resetsToGenius: { 5: 10 } }))).toBe(true);
  });

  it('stays locked below the 10-reset threshold, even across several puzzles', () => {
    expect(findBadge('comeback_kid').isUnlocked(baseStats({ resetsToGenius: { 5: 9, 6: 3 } }))).toBe(false);
  });
});

describe('a_real_regular', () => {
  it('unlocks at 75 distinct puzzles played through', () => {
    expect(findBadge('a_real_regular').isUnlocked(baseStats(puzzlesPlayed(75)))).toBe(true);
  });

  it('stays locked at 74', () => {
    expect(findBadge('a_real_regular').isUnlocked(baseStats(puzzlesPlayed(74)))).toBe(false);
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

describe('thousand_dot_club', () => {
  it('unlocks at exactly 1000 lifetime pegs cleared', () => {
    expect(findBadge('thousand_dot_club').isUnlocked(baseStats({ pegsCleared: { total: 1000, byColor: {} } }))).toBe(true);
  });

  it('stays locked at 999', () => {
    expect(findBadge('thousand_dot_club').isUnlocked(baseStats({ pegsCleared: { total: 999, byColor: {} } }))).toBe(false);
  });
});

describe('triple_digit_dot_hopper', () => {
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

  it('returns the whole early-game family together once 25 puzzles are in', () => {
    const satisfied = getSatisfiedBadgeIds(baseStats(puzzlesPlayed(25)));
    expect(satisfied).toEqual(['high_five', 'double_digits', 'george_washington']);
  });
});
