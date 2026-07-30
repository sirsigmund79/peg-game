// ============================================================================
// logic/badgeUnlocks.js
// ----------------------------------------------------------------------------
// The one stateful seam for badges: remembers which badge ids have already
// been unlocked on this device, and re-evaluates logic/badges.js's pure
// checks against the latest logic/badgeInput.js stats to find anything
// NEWLY satisfied. Everything that decides WHETHER a badge's condition is
// met lives in badges.js (pure, no localStorage); everything here is just
// "have we told the player about this one yet."
//
// Deliberately called from exactly one place per attempt-ending event in
// composables/useGame.js (right after the badgeStats.js recorder calls),
// not scattered ad hoc -- see useGame.js's jump()/reset().
// ============================================================================

import { safeGet, safeSet } from './storage.js';
import { getBadgeInput } from './badgeInput.js';
import { BADGE_DEFINITIONS, getSatisfiedBadgeIds } from './badges.js';
import { EVENTS, track } from '../services/analytics.js';

const UNLOCKED_BADGES_KEY = 'dot-hop:unlocked-badges';

/**
 * @returns {string[]} every badge id already unlocked on this device, filtered
 *   to ids logic/badges.js still defines -- a badge that's been renamed or
 *   dropped (e.g. v3's `clean_genius`) leaves a dangling string behind, and no
 *   caller should have to think about that.
 */
export function getUnlockedBadgeIds() {
  const knownIds = new Set(BADGE_DEFINITIONS.map((badge) => badge.id));
  return safeGet(UNLOCKED_BADGES_KEY, []).filter((id) => knownIds.has(id));
}

/**
 * DEV TOOLING ONLY -- components/BadgeShelfDevToggles.vue, so the whole shelf
 * can be filled in or emptied without grinding a thousand dots out first.
 * Nothing in the game calls this: real unlocking only ever happens through
 * checkForNewlyUnlockedBadges below, off recorded stats. It lives here rather
 * than in the dev component so UNLOCKED_BADGES_KEY stays the private business
 * of one module.
 *
 * Note this really does rewrite the stored set -- switching a badge off is a
 * genuine un-earn on this device, not a display filter.
 *
 * @param {string[]} ids - badge ids to store; unknown ids are dropped
 */
export function setUnlockedBadgeIds(ids) {
  const knownIds = new Set(BADGE_DEFINITIONS.map((badge) => badge.id));
  safeSet(UNLOCKED_BADGES_KEY, [...new Set(ids)].filter((id) => knownIds.has(id)));
}

/**
 * Re-checks every badge against the current lifetime stats and persists any
 * newly satisfied ones. Fires a PostHog event per newly unlocked badge (see
 * docs/ANALYTICS.md's `badge_unlocked` row), and hands the full definitions
 * back to the caller so the reveal UI needs no second lookup -- see
 * useGame.js's `pendingBadgeUnlocks` and components/BadgeUnlockCard.vue.
 *
 * @param {number|null} puzzleNumber - which puzzle triggered this check, attached to the fired event only
 * @returns {{id: string, name: string, icon: string, description: string, rare: boolean}[]}
 *   badges newly unlocked by this check (empty if none)
 */
export function checkForNewlyUnlockedBadges(puzzleNumber) {
  const stats = getBadgeInput();
  const alreadyUnlocked = new Set(getUnlockedBadgeIds());
  const satisfiedIds = getSatisfiedBadgeIds(stats);
  const newlyUnlockedIds = satisfiedIds.filter((id) => !alreadyUnlocked.has(id));
  if (newlyUnlockedIds.length === 0) return [];

  satisfiedIds.forEach((id) => alreadyUnlocked.add(id));
  // Writing back the filtered set (getUnlockedBadgeIds above already dropped
  // anything unknown) is also what finally sweeps a retired id out of storage.
  safeSet(UNLOCKED_BADGES_KEY, [...alreadyUnlocked]);

  return newlyUnlockedIds.map((id) => {
    const badge = BADGE_DEFINITIONS.find((definition) => definition.id === id);
    console.info(`[badges] Unlocked: ${badge.name} (${id})`, { puzzleNumber });
    track(EVENTS.BADGE_UNLOCKED, { badge_id: id, puzzle_number: puzzleNumber });
    return { id, name: badge.name, icon: badge.icon, description: badge.description, rare: Boolean(badge.rare) };
  });
}
