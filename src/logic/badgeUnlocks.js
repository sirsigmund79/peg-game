// ============================================================================
// logic/badgeUnlocks.js
// ----------------------------------------------------------------------------
// The one stateful seam for badges: remembers which badge ids have already
// been unlocked on this device, and re-evaluates logic/badges.js's pure
// checks against the latest logic/badgeStats.js stats to find anything
// NEWLY satisfied. Everything that decides WHETHER a badge's condition is
// met lives in badges.js (pure, no localStorage); everything here is just
// "have we told the player about this one yet."
//
// Deliberately called from exactly one place per attempt-ending event in
// composables/useGame.js (right after the badgeStats.js recorder calls),
// not scattered ad hoc -- see useGame.js's jump()/reset().
// ============================================================================

import { safeGet, safeSet } from './storage.js';
import { getBadgeStats } from './badgeStats.js';
import { BADGE_DEFINITIONS, getSatisfiedBadgeIds } from './badges.js';
import { EVENTS, track } from '../services/analytics.js';

const UNLOCKED_BADGES_KEY = 'dot-hop:unlocked-badges';

/** @returns {string[]} every badge id already unlocked on this device. */
export function getUnlockedBadgeIds() {
  return safeGet(UNLOCKED_BADGES_KEY, []);
}

/**
 * Re-checks every badge against the current lifetime stats and persists any
 * newly satisfied ones. No UI yet -- console-logs and fires a PostHog event
 * per newly unlocked badge (see docs/ANALYTICS.md's `badge_unlocked` row) so
 * unlock rates are visible even before the badge card design exists.
 *
 * @param {number|null} puzzleNumber - which puzzle triggered this check, attached to the fired event only
 * @returns {{id: string, name: string}[]} badges newly unlocked by this check (empty if none)
 */
export function checkForNewlyUnlockedBadges(puzzleNumber) {
  const stats = getBadgeStats();
  const alreadyUnlocked = new Set(getUnlockedBadgeIds());
  const satisfiedIds = getSatisfiedBadgeIds(stats);
  const newlyUnlockedIds = satisfiedIds.filter((id) => !alreadyUnlocked.has(id));
  if (newlyUnlockedIds.length === 0) return [];

  satisfiedIds.forEach((id) => alreadyUnlocked.add(id));
  safeSet(UNLOCKED_BADGES_KEY, [...alreadyUnlocked]);

  return newlyUnlockedIds.map((id) => {
    const badge = BADGE_DEFINITIONS.find((definition) => definition.id === id);
    console.info(`[badges] Unlocked: ${badge.name} (${id})`, { puzzleNumber });
    track(EVENTS.BADGE_UNLOCKED, { badge_id: id, puzzle_number: puzzleNumber });
    return { id, name: badge.name };
  });
}
