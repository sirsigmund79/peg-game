// ============================================================================
// logic/badgeInput.js
// ----------------------------------------------------------------------------
// The single object every logic/badges.js condition is evaluated against:
// logic/badgeStats.js's recorded counters, plus the handful of values that are
// DERIVED rather than recorded.
//
// Day streak is the reason this file exists. It's not a counter anybody keeps
// -- puzzle numbers are consecutive calendar days, so a streak is just integer
// math over logic/history.js (see logic/streaks.js). Recording it into
// badgeStats.js would duplicate a truth that already lives somewhere else and
// can go stale; computing it inside badges.js would make those conditions
// impure and untestable. So it gets composed in here instead, and badges.js
// stays what it is: pure functions of one plain object.
//
// Anything derived that a future badge needs belongs here too, next to
// longestStreak.
// ============================================================================

import { getBadgeStats } from './badgeStats.js';
import { getHistory } from './history.js';
import { getTodayPuzzleNumber } from './daily.js';
import { computeStreaks } from './streaks.js';

/**
 * @returns {object} every recorded stat, plus:
 *   - `longestStreak`: the longest run of consecutive daily puzzles ever
 *     completed on this device. Deliberately `longest`, not `current` -- a
 *     badge that could un-earn itself the day a streak lapses isn't a badge.
 */
export function getBadgeInput() {
  const stats = getBadgeStats();
  const { longest } = computeStreaks(Object.keys(getHistory()).map(Number), getTodayPuzzleNumber());
  return { ...stats, longestStreak: longest };
}
