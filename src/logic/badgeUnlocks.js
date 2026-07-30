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
//
// THE BASELINE (establishBadgeBaseline, below) is the one exception to that
// "only at attempt-end" rule, and exists because badges shipped long after
// the counters they read did. See its own comment for the whole story.
// ============================================================================

import { safeGet, safeSet } from './storage.js';
import { getBadgeInput } from './badgeInput.js';
import { BADGE_DEFINITIONS, getSatisfiedBadgeIds } from './badges.js';
import { EVENTS, track } from '../services/analytics.js';

const UNLOCKED_BADGES_KEY = 'dot-hop:unlocked-badges';
const BADGE_BASELINE_KEY = 'dot-hop:badge-baseline';

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
    // `backfilled` is stated explicitly rather than left off, so no PostHog
    // query has to reason about a missing property -- see the baseline below,
    // which is where the `true` case comes from.
    track(EVENTS.BADGE_UNLOCKED, { badge_id: id, puzzle_number: puzzleNumber, backfilled: false });
    return { id, name: badge.name, icon: badge.icon, description: badge.description, rare: Boolean(badge.rare) };
  });
}

/**
 * @returns {{capturedAt: string, backfilledIds: string[], welcomeShown: boolean} | null}
 *   this device's baseline record, or null if it has never been taken.
 */
function getBaselineRecord() {
  return safeGet(BADGE_BASELINE_KEY, null);
}

/**
 * One-time, per-browser back-award of every badge a player ALREADY qualified
 * for before the badge system could see them.
 *
 * The counters in logic/badgeStats.js shipped well before any badge UI did,
 * and every condition in logic/badges.js is a floor on a lifetime total
 * rather than a window (First Fifty is `pegsCleared.total >= 50`, not "your
 * first 50 hops"), so a returning player's stats can satisfy nearly the whole
 * shelf at once. Without this, checkForNewlyUnlockedBadges above would hand
 * all of that to the next result screen in one go: a wall of a dozen cards
 * where PlayView.vue reasonably expects none, a rare badge buried in the
 * pile, and a dozen badge_unlocked events sharing one puzzle number.
 *
 * So the backlog is granted here instead -- silently, at boot, before any of
 * it can pile onto a result screen -- and announced once as a single summary
 * card (see takeBadgeBacklogWelcome and components/BadgeBacklogCard.vue).
 * Nothing is earned or un-earned by running this that wouldn't have been
 * unlocked anyway on the player's very next finished round; the only thing
 * that changes is when it lands and how it's told.
 *
 * Guarded the same way analytics.js's captureGhostOutlineBaselineOnce() is,
 * so it's safe to call on every app boot but only ever acts once. The record
 * is written even when NOTHING was satisfied -- that empty write is what
 * makes this one-way for a brand new player, who would otherwise still be
 * "un-baselined" months later and collect a welcome card for badges they
 * earned the honest way.
 *
 * @returns {{count: number, ids: string[]} | null} the backlog just granted,
 *   or null if the baseline was already taken or there was nothing to grant.
 */
export function establishBadgeBaseline() {
  if (getBaselineRecord()) return null;

  const satisfiedIds = getSatisfiedBadgeIds(getBadgeInput());
  safeSet(BADGE_BASELINE_KEY, {
    capturedAt: new Date().toISOString(),
    backfilledIds: satisfiedIds,
    // Nothing to announce when the backlog is empty, so the welcome starts
    // life already spent -- takeBadgeBacklogWelcome never has to special-case
    // the new-player record.
    welcomeShown: satisfiedIds.length === 0,
  });
  if (satisfiedIds.length === 0) return null;

  const alreadyUnlocked = new Set(getUnlockedBadgeIds());
  satisfiedIds.forEach((id) => alreadyUnlocked.add(id));
  safeSet(UNLOCKED_BADGES_KEY, [...alreadyUnlocked]);

  console.info(`[badges] Baseline: back-awarded ${satisfiedIds.length}`, satisfiedIds);
  satisfiedIds.forEach((id) => {
    // puzzle_number is null on purpose: no puzzle earned these, and pinning
    // them to whichever one happened to be loaded at boot would be a lie the
    // funnel can't see through.
    track(EVENTS.BADGE_UNLOCKED, { badge_id: id, puzzle_number: null, backfilled: true });
  });

  return { count: satisfiedIds.length, ids: satisfiedIds };
}

/**
 * Hands over the backlog announcement exactly once, then marks it spent --
 * the same drain-on-read contract as useGame.js's takeBadgeUnlocks(), and for
 * the same reason: the result screen this lands on can be torn down and
 * rebuilt by a "play again" Reset, and the welcome should not come back.
 *
 * @returns {{count: number, ids: string[]} | null} the backlog to announce, or
 *   null if there is none or it has already been shown.
 */
export function takeBadgeBacklogWelcome() {
  const record = getBaselineRecord();
  if (!record || record.welcomeShown) return null;

  safeSet(BADGE_BASELINE_KEY, { ...record, welcomeShown: true });
  const ids = record.backfilledIds ?? [];
  return { count: ids.length, ids };
}

/**
 * @param {string[]} ids - badge ids, in logic/badges.js order or otherwise
 * @returns {{id: string, name: string, icon: string, description: string, rare: boolean}[]}
 *   their full definitions, in BADGE_DEFINITIONS (shelf) order, skipping any
 *   id badges.js no longer defines.
 */
export function getBadgeDefinitions(ids) {
  const wanted = new Set(ids);
  return BADGE_DEFINITIONS.filter((badge) => wanted.has(badge.id)).map((badge) => ({
    id: badge.id,
    name: badge.name,
    icon: badge.icon,
    description: badge.description,
    rare: Boolean(badge.rare),
  }));
}
