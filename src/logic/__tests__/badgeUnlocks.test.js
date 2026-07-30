// ============================================================================
// logic/__tests__/badgeUnlocks.test.js
// ----------------------------------------------------------------------------
// Covers the stateful diffing layer on top of logic/badges.js's pure checks:
// a badge should only ever be reported as "newly unlocked" once, even though
// checkForNewlyUnlockedBadges() re-evaluates every badge on every call.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { checkForNewlyUnlockedBadges, getUnlockedBadgeIds, setUnlockedBadgeIds } from '../badgeUnlocks.js';
import { recordGeniusReached, recordPlaythroughEnded, recordResetPressed } from '../badgeStats.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('checkForNewlyUnlockedBadges', () => {
  it('starts with nothing unlocked', () => {
    expect(getUnlockedBadgeIds()).toEqual([]);
  });

  it('reports a badge the first time its condition becomes true, and never again after', () => {
    for (let i = 0; i < 50; i++) {
      recordGeniusReached(1000 + i, { priorAttempts: 0 });
    }
    const first = checkForNewlyUnlockedBadges(1049);
    expect(first.map((badge) => badge.id)).toContain('certified_genius');

    const second = checkForNewlyUnlockedBadges(1049);
    expect(second).toEqual([]);
    expect(getUnlockedBadgeIds()).toContain('certified_genius');
  });

  it('hands back everything the reveal UI needs, with no second lookup', () => {
    for (let i = 0; i < 50; i++) recordResetPressed();
    const [badge] = checkForNewlyUnlockedBadges(1).filter((entry) => entry.id === 'push_to_reset');
    expect(badge).toEqual({
      id: 'push_to_reset',
      name: 'Push to Reset',
      icon: '📎',
      description: 'Press Reset 50 times. No judgment.',
      rare: false,
    });
  });

  it('flags a rare badge so the card knows to give it the golden treatment', () => {
    recordGeniusReached(1, { priorAttempts: 0 });
    const [badge] = checkForNewlyUnlockedBadges(1).filter((entry) => entry.id === 'one_and_done');
    expect(badge.rare).toBe(true);
  });

  it('can report more than one newly-satisfied badge from a single check', () => {
    for (let i = 0; i < 100; i++) {
      recordPlaythroughEnded(2000 + i);
    }
    const unlocked = checkForNewlyUnlockedBadges(2099);
    const ids = unlocked.map((badge) => badge.id);
    expect(ids).toContain('triple_digit_dot_hopper');
    expect(ids).toContain('a_real_regular');
    // The early-game family lands in the same sweep for anyone who somehow
    // gets here without having been checked along the way.
    expect(ids).toContain('high_five');
  });

  it('returns an empty list when nothing new is satisfied', () => {
    expect(checkForNewlyUnlockedBadges(1)).toEqual([]);
    expect(getUnlockedBadgeIds()).toEqual([]);
  });

  it('ignores a stored id that logic/badges.js no longer defines, and sweeps it on the next write', () => {
    // `clean_genius` was retired in schema v3. A returning player still has
    // it sitting in storage; it must never be reported, counted, or rendered.
    window.localStorage.setItem('dot-hop:unlocked-badges', JSON.stringify(['clean_genius']));
    expect(getUnlockedBadgeIds()).toEqual([]);

    for (let i = 0; i < 5; i++) recordPlaythroughEnded(i);
    const unlocked = checkForNewlyUnlockedBadges(4);
    expect(unlocked.map((badge) => badge.id)).toEqual(['high_five']);
    expect(JSON.parse(window.localStorage.getItem('dot-hop:unlocked-badges'))).toEqual(['high_five']);
  });
});

describe('setUnlockedBadgeIds (dev tooling)', () => {
  it('round-trips through getUnlockedBadgeIds', () => {
    setUnlockedBadgeIds(['high_five', 'push_to_reset']);
    expect(getUnlockedBadgeIds().sort()).toEqual(['high_five', 'push_to_reset']);
  });

  it('drops unknown ids and duplicates rather than storing them', () => {
    setUnlockedBadgeIds(['high_five', 'high_five', 'clean_genius', 'not_a_badge']);
    expect(JSON.parse(window.localStorage.getItem('dot-hop:unlocked-badges'))).toEqual(['high_five']);
  });

  it('can empty the set', () => {
    setUnlockedBadgeIds(['high_five']);
    setUnlockedBadgeIds([]);
    expect(getUnlockedBadgeIds()).toEqual([]);
  });

  it('does not make a badge report as newly unlocked afterwards', () => {
    // Switching one on by hand must not queue a celebration the next time a
    // round ends -- it's already in the "we've told them" set.
    setUnlockedBadgeIds(['high_five']);
    for (let i = 0; i < 5; i++) recordPlaythroughEnded(i);
    expect(checkForNewlyUnlockedBadges(4)).toEqual([]);
  });
});
