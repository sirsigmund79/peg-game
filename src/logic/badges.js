// ============================================================================
// logic/badges.js
// ----------------------------------------------------------------------------
// Every badge's unlock condition, in one place, as a PURE function of
// logic/badgeStats.js's stats object -- no localStorage reads, no side
// effects, nothing ad hoc scattered across the codebase. That makes adding a
// badge later a one-entry change here, and makes every condition trivial to
// unit test with a hand-built stats object.
//
// This file only decides "is this badge's condition currently satisfied by
// these lifetime stats" -- it has no opinion on whether a badge has already
// been shown to the player before. See logic/badgeUnlocks.js for the thin
// (stateful) layer that diffs against what's already been unlocked and
// fires the analytics event -- that's the one place allowed to touch
// localStorage or PostHog for badges.
//
// `name` is deliberately the only place a badge's display name lives, so
// swapping placeholder names (badges 5 and 6 below) later is a one-line
// change, not a hunt through unlock logic.
// ============================================================================

export const BADGE_DEFINITIONS = [
  {
    id: 'comeback_kid',
    name: 'Comeback Kid',
    description: 'Reach GENIUS on a puzzle after 10 or more Resets on it.',
    isUnlocked: (stats) => Object.values(stats.resetsToGenius).some((resetsBeforeGenius) => resetsBeforeGenius >= 10),
  },
  {
    id: 'thousand_dot_club',
    name: '1,000 Dot Club',
    description: 'Clear 1,000 pegs, lifetime, across every color.',
    isUnlocked: (stats) => stats.pegsCleared.total >= 1000,
  },
  {
    id: 'clean_genius',
    name: 'Clean Genius',
    description: 'Reach GENIUS with zero Undos in that attempt and zero Resets on that puzzle before it.',
    isUnlocked: (stats) => stats.cleanGeniusPuzzleIds.length > 0,
  },
  {
    id: 'certified_genius',
    name: 'Certified Genius',
    description: 'Reach GENIUS on 50 distinct puzzles.',
    isUnlocked: (stats) => stats.geniusPuzzleIds.length >= 50,
  },
  {
    id: 'a_real_regular',
    // Placeholder name -- swap here whenever a final one's picked.
    name: 'A Real Regular',
    description: 'Play through 75 distinct puzzles.',
    isUnlocked: (stats) => stats.playedThroughPuzzleIds.length >= 75,
  },
  {
    id: 'triple_digit_dot_hopper',
    // Placeholder name -- swap here whenever a final one's picked.
    name: 'Triple-Digit Dot-Hopper',
    description: 'Rack up 100 total play-throughs.',
    isUnlocked: (stats) => stats.totalPlaythroughs >= 100,
  },
];

/**
 * @param {object} stats - see logic/badgeStats.js's getBadgeStats()
 * @returns {string[]} ids of every badge currently satisfied by these stats
 *   (not just newly unlocked ones -- see logic/badgeUnlocks.js for that diff).
 */
export function getSatisfiedBadgeIds(stats) {
  return BADGE_DEFINITIONS.filter((badge) => badge.isUnlocked(stats)).map((badge) => badge.id);
}
