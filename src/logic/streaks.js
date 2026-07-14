// ============================================================================
// logic/streaks.js
// ----------------------------------------------------------------------------
// How many consecutive calendar days a player has completed the daily puzzle
// on -- puzzle numbers ARE consecutive calendar days (see logic/daily.js), so
// this is pure integer math over whatever puzzle numbers logic/history.js has
// recorded, no dates involved.
//
// No Vue code lives here -- components/StatsView.vue and
// services/analytics.js both call this the same way.
// ============================================================================

/**
 * @param {number[]} puzzleNumbers - every puzzle number this device has a
 *   recorded result for (e.g. `Object.keys(getHistory()).map(Number)`)
 * @param {number} todayPuzzleNumber - see logic/daily.js's getTodayPuzzleNumber()
 * @returns {{current: number, longest: number}} `current` is 0 unless the most
 *   recently completed puzzle was TODAY or YESTERDAY -- a streak that lapsed
 *   any earlier than that isn't "current" anymore, even though it's still the
 *   longest run in `longest`.
 */
export function computeStreaks(puzzleNumbers, todayPuzzleNumber) {
  const sorted = [...new Set(puzzleNumbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const mostRecent = sorted[sorted.length - 1];
  if (mostRecent < todayPuzzleNumber - 1) return { current: 0, longest };

  let current = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i] === sorted[i - 1] + 1) current += 1;
    else break;
  }

  return { current, longest };
}
