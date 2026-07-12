// ============================================================================
// logic/__tests__/attemptBoundary.test.js
// ----------------------------------------------------------------------------
// isGiveUpReset() is the one line standing between "5 finishes-and-resets"
// counting as 5 playthroughs (correct) and counting as 10 (an easy off-by-one
// if a "play again" Reset were treated the same as a mid-round give-up).
// These cases are deliberately exhaustive over its two boolean inputs.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { isGiveUpReset } from '../attemptBoundary.js';

describe('isGiveUpReset', () => {
  it('counts a mid-round Reset (round still live, moves made) as a give-up', () => {
    expect(isGiveUpReset({ roundOverBeforeReset: false, moveCount: 1 })).toBe(true);
    expect(isGiveUpReset({ roundOverBeforeReset: false, moveCount: 25 })).toBe(true);
  });

  it('does NOT count a "play again" Reset after the round already ended', () => {
    // This is the exact case that would double-count "finished-and-reset
    // five times" as 10 playthroughs instead of 5 if it were wrong.
    expect(isGiveUpReset({ roundOverBeforeReset: true, moveCount: 25 })).toBe(false);
  });

  it('does NOT count an idle Reset with no moves made, even mid-round', () => {
    // Clearing a stray selection/tap isn't a meaningful attempt to end.
    expect(isGiveUpReset({ roundOverBeforeReset: false, moveCount: 0 })).toBe(false);
  });

  it('does NOT count a Reset with no moves made after the round already ended', () => {
    expect(isGiveUpReset({ roundOverBeforeReset: true, moveCount: 0 })).toBe(false);
  });
});
