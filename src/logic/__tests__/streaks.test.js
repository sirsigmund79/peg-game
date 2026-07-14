// ============================================================================
// logic/__tests__/streaks.test.js
// ----------------------------------------------------------------------------
// The one subtlety worth pinning down: `current` must lapse to 0 once the
// player's most recent completed puzzle falls more than a day behind today --
// otherwise a streak from weeks ago would keep reading as "current" forever.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { computeStreaks } from '../streaks.js';

describe('computeStreaks', () => {
  it('returns zeros with no history at all', () => {
    expect(computeStreaks([], 100)).toEqual({ current: 0, longest: 0 });
  });

  it('counts a run ending today as current', () => {
    expect(computeStreaks([97, 98, 99, 100], 100)).toEqual({ current: 4, longest: 4 });
  });

  it('counts a run ending yesterday as still current (today not played yet)', () => {
    expect(computeStreaks([96, 97, 98, 99], 100)).toEqual({ current: 4, longest: 4 });
  });

  it('is NOT current once the most recent completion is more than a day behind today', () => {
    expect(computeStreaks([95, 96, 97, 98], 100)).toEqual({ current: 0, longest: 4 });
  });

  it('finds the longest run even when it is not the most recent one', () => {
    // A 5-day run way in the past, then a lapse, then today's lone play.
    expect(computeStreaks([10, 11, 12, 13, 14, 100], 100)).toEqual({ current: 1, longest: 5 });
  });

  it('ignores duplicate puzzle numbers and out-of-order input', () => {
    expect(computeStreaks([100, 98, 99, 99, 98], 100)).toEqual({ current: 3, longest: 3 });
  });

  it('a single day played today is a current streak of 1', () => {
    expect(computeStreaks([100], 100)).toEqual({ current: 1, longest: 1 });
  });
});
