// ============================================================================
// logic/badges.js
// ----------------------------------------------------------------------------
// Every badge's unlock condition, in one place, as a PURE function of
// logic/badgeInput.js's stats object -- no localStorage reads, no side
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
// `name` and `icon` are deliberately the only place a badge's display lives,
// so re-naming one or swapping its emoji is a one-line change here, not a
// hunt through unlock logic or components.
//
// `rare: true` marks the two badges that are meant to feel like a find rather
// than a milestone -- the ones you can't get to by just showing up often
// enough. Both the unlock card and the shelf tile give those the golden-ticket
// treatment (see components/BadgeUnlockCard.vue). It's a display flag only:
// nothing about how a badge is earned or checked reads it. Keep the set
// small -- if half the shelf glints, none of it does.
//
// ONE CONSTRAINT ON ICONS: stick to emoji from Unicode 11 or earlier. The
// Unicode 12/13 batch (2019-2020: 🪙 coin, 🪜 ladder, 🪄 wand, and their
// neighbours) is genuinely tempting for a badge set and renders as an empty
// tofu box on any Windows 10 install whose Segoe UI Emoji predates it -- a
// blank square is a worse badge than a slightly-less-literal picture. Two of
// the entries below already lost that argument; check a new pick on an older
// machine before committing to it.
//
// ORDER MATTERS, but only cosmetically: components/BadgeShelf.vue renders the
// grid in this order, so the list runs roughly cheapest -> hardest, giving the
// shelf a left-to-right sense of progression. Nothing functional depends on it.
// ============================================================================

import { RANK_TIERS } from './rules.js';

export const BADGE_DEFINITIONS = [
  {
    id: 'high_five',
    name: 'High Five',
    icon: '✋',
    description: 'Play through 5 different puzzles.',
    isUnlocked: (stats) => stats.playedThroughPuzzleIds.length >= 5,
  },
  {
    id: 'first_fifty',
    name: 'First Fifty',
    icon: '🐸',
    description: 'Hop your first 50 dots.',
    isUnlocked: (stats) => stats.pegsCleared.total >= 50,
  },
  {
    id: 'double_digits',
    name: 'Double Digits',
    icon: '🔟',
    description: 'Play through 10 different puzzles.',
    isUnlocked: (stats) => stats.playedThroughPuzzleIds.length >= 10,
  },
  {
    id: 'george_washington',
    // 25 -- a quarter, and he's the one on it. (A coin 🪙 would be the
    // on-the-nose icon, but see the note on icons in the header above -- the
    // banknote he's also on renders everywhere, and the joke is in the name.)
    name: 'George Washington',
    icon: '💵',
    description: 'Play through 25 different puzzles.',
    isUnlocked: (stats) => stats.playedThroughPuzzleIds.length >= 25,
  },
  {
    id: 'five_timers_club',
    name: 'Five Timers Club',
    icon: '🔥',
    description: 'Play 5 days in a row.',
    // See logic/badgeInput.js -- derived from logic/history.js, not a
    // recorded counter, and deliberately the LONGEST streak so a lapse can
    // never take this back.
    isUnlocked: (stats) => stats.longestStreak >= 5,
  },
  {
    id: 'one_and_done',
    name: 'One and Done',
    icon: '✨',
    description: 'Reach GENIUS on your first try at a puzzle, with no Undos.',
    rare: true,
    isUnlocked: (stats) => stats.oneAndDonePuzzleIds.length > 0,
  },
  {
    id: 'full_ladder',
    name: 'Full Ladder',
    // A climber rather than an actual ladder 🪜 -- again, see the header.
    icon: '🧗',
    description: 'Finish a puzzle at every one of the 5 ranks.',
    // Counted against RANK_TIERS rather than a hardcoded 5, so adding a rank
    // makes this badge harder rather than silently unearnable-at-full.
    isUnlocked: (stats) => stats.ranksReached.length >= RANK_TIERS.length,
  },
  {
    id: 'push_to_reset',
    name: 'Push to Reset',
    icon: '📎',
    description: 'Press Reset 50 times. No judgment.',
    isUnlocked: (stats) => stats.totalResets >= 50,
  },
  {
    id: 'comeback_kid',
    name: 'Comeback Kid',
    icon: '💪',
    description: 'Reach GENIUS on a puzzle after 10 or more Resets on it.',
    isUnlocked: (stats) => Object.values(stats.resetsToGenius).some((resetsBeforeGenius) => resetsBeforeGenius >= 10),
  },
  {
    id: 'a_real_regular',
    name: 'A Real Regular',
    icon: '🍽️',
    description: 'Play through 75 distinct puzzles.',
    isUnlocked: (stats) => stats.playedThroughPuzzleIds.length >= 75,
  },
  {
    id: 'certified_genius',
    name: 'Certified Genius',
    icon: '🧠',
    description: 'Reach GENIUS on 50 distinct puzzles.',
    rare: true,
    isUnlocked: (stats) => stats.geniusPuzzleIds.length >= 50,
  },
  {
    id: 'thousand_dot_club',
    name: '1,000 Dot Club',
    icon: '💎',
    description: 'Clear 1,000 pegs, lifetime, across every color.',
    isUnlocked: (stats) => stats.pegsCleared.total >= 1000,
  },
  {
    id: 'triple_digit_dot_hopper',
    name: 'Triple-Digit Dot-Hopper',
    icon: '💯',
    description: 'Rack up 100 total play-throughs.',
    isUnlocked: (stats) => stats.totalPlaythroughs >= 100,
  },
];

/**
 * @param {object} stats - see logic/badgeInput.js's getBadgeInput()
 * @returns {string[]} ids of every badge currently satisfied by these stats
 *   (not just newly unlocked ones -- see logic/badgeUnlocks.js for that diff).
 */
export function getSatisfiedBadgeIds(stats) {
  return BADGE_DEFINITIONS.filter((badge) => badge.isUnlocked(stats)).map((badge) => badge.id);
}
