// ============================================================================
// logic/__tests__/badgeUnlocks.test.js
// ----------------------------------------------------------------------------
// Covers the stateful diffing layer on top of logic/badges.js's pure checks:
// a badge should only ever be reported as "newly unlocked" once, even though
// checkForNewlyUnlockedBadges() re-evaluates every badge on every call.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { checkForNewlyUnlockedBadges, getUnlockedBadgeIds } from '../badgeUnlocks.js';
import { recordGeniusReached, recordPlaythroughEnded } from '../badgeStats.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('checkForNewlyUnlockedBadges', () => {
  it('starts with nothing unlocked', () => {
    expect(getUnlockedBadgeIds()).toEqual([]);
  });

  it('reports a badge the first time its condition becomes true, and never again after', () => {
    for (let i = 0; i < 50; i++) {
      recordGeniusReached(1000 + i, { attemptUndoCount: 0 });
    }
    const first = checkForNewlyUnlockedBadges(1049);
    expect(first.map((badge) => badge.id)).toContain('certified_genius');

    const second = checkForNewlyUnlockedBadges(1049);
    expect(second).toEqual([]);
    expect(getUnlockedBadgeIds()).toContain('certified_genius');
  });

  it('can report more than one newly-satisfied badge from a single check', () => {
    for (let i = 0; i < 100; i++) {
      recordPlaythroughEnded(2000 + i);
    }
    const unlocked = checkForNewlyUnlockedBadges(2099);
    const ids = unlocked.map((badge) => badge.id);
    expect(ids).toContain('triple_digit_dot_hopper');
    expect(ids).toContain('a_real_regular');
  });

  it('returns an empty list when nothing new is satisfied', () => {
    expect(checkForNewlyUnlockedBadges(1)).toEqual([]);
    expect(getUnlockedBadgeIds()).toEqual([]);
  });
});
