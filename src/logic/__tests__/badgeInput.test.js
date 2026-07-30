// ============================================================================
// logic/__tests__/badgeInput.test.js
// ----------------------------------------------------------------------------
// getBadgeInput() is the seam that lets a badge condition read something
// nobody records -- so what's worth testing here is that the derived field
// actually composes in alongside the recorded ones, and that it's the
// LONGEST streak (not the current one), which is what keeps Five Timers Club
// from un-earning itself the day a run lapses.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { getBadgeInput } from '../badgeInput.js';
import { recordPegCleared } from '../badgeStats.js';

beforeEach(() => {
  window.localStorage.clear();
});

/** Seeds logic/history.js with a completed result for each puzzle number. */
function seedHistory(puzzleNumbers) {
  const history = {};
  puzzleNumbers.forEach((puzzleNumber) => {
    history[puzzleNumber] = { pegsRemaining: [1], overPar: 0, won: true };
  });
  window.localStorage.setItem('dot-hop:history', JSON.stringify(history));
}

describe('getBadgeInput', () => {
  it('carries the recorded stats through untouched', () => {
    recordPegCleared(0);
    recordPegCleared(1);
    const input = getBadgeInput();
    expect(input.pegsCleared.total).toBe(2);
    expect(input.totalResets).toBe(0);
    expect(input.oneAndDonePuzzleIds).toEqual([]);
  });

  it('adds longestStreak, derived from history rather than recorded', () => {
    seedHistory([10, 11, 12, 13, 14]);
    expect(getBadgeInput().longestStreak).toBe(5);
  });

  it('is 0 with no history at all', () => {
    expect(getBadgeInput().longestStreak).toBe(0);
  });

  it('measures the longest RUN, not the number of puzzles played', () => {
    // Nine puzzles, but the biggest unbroken run is three.
    seedHistory([1, 2, 3, 20, 21, 40, 60, 80, 100]);
    expect(getBadgeInput().longestStreak).toBe(3);
  });

  it('keeps reporting a long-lapsed run, since a badge must not un-earn itself', () => {
    // Ancient puzzle numbers -- `current` would be 0 here; `longest` is 5.
    seedHistory([1, 2, 3, 4, 5]);
    expect(getBadgeInput().longestStreak).toBe(5);
  });
});
