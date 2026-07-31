// ============================================================================
// logic/__tests__/badgeStats.test.js
// ----------------------------------------------------------------------------
// Covers the raw counters badges.js reads from, with particular attention to
// the playthrough-counting boundary (see attemptBoundary.test.js for the
// isolated rule, and the "simulated attempt sequences" block below for it
// exercised the way composables/useGame.js actually calls these functions).
//
// The One and Done block is deliberately heavy on negative cases: its
// predecessor ("Clean Genius") shipped believing a "play again" Reset and an
// earlier attempt's Undos both disqualified an attempt, when neither was
// visible to it at all.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBadgeStats,
  getAttemptsForPuzzle,
  recordPegCleared,
  recordPlaythroughEnded,
  recordGiveUpReset,
  recordGeniusReached,
  recordUndo,
  recordResetPressed,
  recordRankReached,
  hasReachedGenius,
} from '../badgeStats.js';
import { isGiveUpReset } from '../attemptBoundary.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('getBadgeStats', () => {
  it('returns a fresh, zeroed schema when nothing has been recorded', () => {
    const stats = getBadgeStats();
    expect(stats.geniusPuzzleIds).toEqual([]);
    expect(stats.oneAndDonePuzzleIds).toEqual([]);
    expect(stats.totalPlaythroughs).toBe(0);
    expect(stats.playedThroughPuzzleIds).toEqual([]);
    expect(stats.resetsByPuzzle).toEqual({});
    expect(stats.resetsToGenius).toEqual({});
    expect(stats.undosByPuzzle).toEqual({});
    expect(stats.totalResets).toBe(0);
    expect(stats.ranksReached).toEqual([]);
    expect(stats.pegsCleared).toEqual({ total: 0, byColor: {} });
  });

  it('back-fills missing keys for a stats object saved by an older schema version', () => {
    window.localStorage.setItem(
      'dot-hop:badge-stats',
      JSON.stringify({ version: 1, geniusPuzzleIds: [5], pegsCleared: { total: 12, byColor: {} } })
    );
    const stats = getBadgeStats();
    expect(stats.geniusPuzzleIds).toEqual([5]);
    expect(stats.pegsCleared.total).toBe(12);
    // Fields that didn't exist in the saved record yet get their defaults,
    // not undefined -- this is the whole point of migrate().
    expect(stats.totalPlaythroughs).toBe(0);
    expect(stats.undosByPuzzle).toEqual({});
    expect(stats.totalResets).toBe(0);
  });

  it('drops v2 cleanGeniusPuzzleIds rather than carrying it into One and Done', () => {
    window.localStorage.setItem(
      'dot-hop:badge-stats',
      JSON.stringify({
        version: 2,
        geniusPuzzleIds: [1, 2, 3],
        cleanGeniusPuzzleIds: [1, 2, 3], // recorded by the check that over-awarded
        totalPlaythroughs: 9,
      })
    );
    const stats = getBadgeStats();
    // Everything trustworthy survives...
    expect(stats.geniusPuzzleIds).toEqual([1, 2, 3]);
    expect(stats.totalPlaythroughs).toBe(9);
    // ...and the untrustworthy field is gone, not renamed onto the new one.
    expect(stats.cleanGeniusPuzzleIds).toBeUndefined();
    expect(stats.oneAndDonePuzzleIds).toEqual([]);
    expect(stats.version).toBe(3);
  });
});

describe('recordPegCleared', () => {
  it('accumulates a lifetime total and a per-color breakdown', () => {
    recordPegCleared(0);
    recordPegCleared(0);
    recordPegCleared(2);
    const stats = getBadgeStats();
    expect(stats.pegsCleared.total).toBe(3);
    expect(stats.pegsCleared.byColor).toEqual({ 0: 2, 2: 1 });
  });
});

describe('recordPlaythroughEnded / playedThroughPuzzleIds', () => {
  it('counts every ended attempt but only lists each puzzle once', () => {
    recordPlaythroughEnded(1);
    recordPlaythroughEnded(1);
    recordPlaythroughEnded(2);
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(3);
    expect(stats.playedThroughPuzzleIds.sort()).toEqual([1, 2]);
  });
});

describe('recordUndo', () => {
  it('accumulates per puzzle, across attempts and visits', () => {
    recordUndo(4);
    recordUndo(4);
    recordUndo(7);
    const stats = getBadgeStats();
    expect(stats.undosByPuzzle).toEqual({ 4: 2, 7: 1 });
  });
});

describe('recordResetPressed', () => {
  it('accumulates one lifetime total, not keyed by puzzle', () => {
    recordResetPressed();
    recordResetPressed();
    recordResetPressed();
    expect(getBadgeStats().totalResets).toBe(3);
  });
});

describe('recordRankReached', () => {
  it('collects each tier index once, no matter how often it is repeated', () => {
    recordRankReached(0);
    recordRankReached(0);
    recordRankReached(4);
    recordRankReached(0);
    expect(getBadgeStats().ranksReached.sort()).toEqual([0, 4]);
  });
});

describe('recordGeniusReached', () => {
  it('dedupes geniusPuzzleIds across repeated GENIUS finishes on the same puzzle', () => {
    recordGeniusReached(9, { priorAttempts: 0 });
    recordGeniusReached(9, { priorAttempts: 3 });
    expect(getBadgeStats().geniusPuzzleIds).toEqual([9]);
  });

  it('snapshots resetsToGenius on the FIRST reach and never overwrites it after', () => {
    recordGiveUpReset(9); // 1 reset before first genius
    recordGeniusReached(9, { priorAttempts: 1 });
    expect(getBadgeStats().resetsToGenius[9]).toBe(1);

    // A later replay racks up more resets on this puzzle, then reaches
    // GENIUS again -- the ORIGINAL "how many resets it took the first time"
    // must not change.
    recordGiveUpReset(9);
    recordGiveUpReset(9);
    recordGeniusReached(9, { priorAttempts: 4 });
    expect(getBadgeStats().resetsToGenius[9]).toBe(1);
    expect(getBadgeStats().resetsByPuzzle[9]).toBe(3);
  });
});

describe('hasReachedGenius', () => {
  // The result screen drops its Reset button on the strength of this one
  // answer (see composables/useGame.js's `geniusLocked`), so a false negative
  // here hands a perfect score back a way to replay it into a worse one.
  it('is false for a puzzle that has never been finished at GENIUS', () => {
    expect(hasReachedGenius(7)).toBe(false);
    // A finish at a lower rank records plenty of other stats, but not this.
    recordRankReached(3);
    recordPlaythroughEnded(7);
    expect(hasReachedGenius(7)).toBe(false);
  });

  it('is true once GENIUS has been reached on that puzzle', () => {
    recordGeniusReached(7, { priorAttempts: 0 });
    expect(hasReachedGenius(7)).toBe(true);
  });

  it('stays true after a later, worse attempt on the same puzzle', () => {
    // geniusPuzzleIds is "ever," not "most recently" -- unlike
    // logic/history.js, which a worse replay overwrites.
    recordGeniusReached(7, { priorAttempts: 0 });
    recordRankReached(2);
    recordPlaythroughEnded(7);
    expect(hasReachedGenius(7)).toBe(true);
  });

  it('is per puzzle -- acing one puzzle says nothing about the next', () => {
    recordGeniusReached(12, { priorAttempts: 0 });
    expect(hasReachedGenius(12)).toBe(true);
    expect(hasReachedGenius(13)).toBe(false);
  });

  it('survives a reload, since it reads back out of storage', () => {
    recordGeniusReached(7, { priorAttempts: 0 });
    // Nothing in memory carries over between page loads; the stored record
    // is the whole reason the lock holds on a restored result screen.
    expect(JSON.parse(window.localStorage.getItem('dot-hop:badge-stats')).geniusPuzzleIds).toEqual([7]);
    expect(hasReachedGenius(7)).toBe(true);
  });
});

describe('recordGeniusReached / One and Done', () => {
  it('marks it on a first attempt with no Undos', () => {
    recordGeniusReached(1, { priorAttempts: 0 });
    expect(getBadgeStats().oneAndDonePuzzleIds).toEqual([1]);
  });

  it('does not mark it if the attempt used any Undo', () => {
    recordUndo(2);
    recordGeniusReached(2, { priorAttempts: 0 });
    expect(getBadgeStats().oneAndDonePuzzleIds).toEqual([]);
  });

  it('does not mark it if an EARLIER attempt on that puzzle used an Undo', () => {
    // The old check only ever saw the current attempt's Undo count, which
    // reset to zero the moment a new attempt started.
    recordUndo(3); // attempt 1
    recordPlaythroughEnded(3); // attempt 1 ends, badly
    recordGeniusReached(3, { priorAttempts: 1 });
    expect(getBadgeStats().oneAndDonePuzzleIds).toEqual([]);
  });

  it('does not mark it on any attempt after the first, however clean that attempt was', () => {
    recordGeniusReached(4, { priorAttempts: 1 });
    expect(getBadgeStats().oneAndDonePuzzleIds).toEqual([]);
  });

  it('dedupes, so replaying a One-and-Done puzzle to GENIUS again lists it once', () => {
    recordGeniusReached(5, { priorAttempts: 0 });
    recordGeniusReached(5, { priorAttempts: 0 });
    expect(getBadgeStats().oneAndDonePuzzleIds).toEqual([5]);
  });
});

describe('simulated attempt sequences (mirrors composables/useGame.js call order)', () => {
  // These helpers stand in for what jump()'s terminal branch and reset()
  // do, in the same order and behind the same isGiveUpReset() gate --
  // without pulling in Vue/useGame.js's other side effects (sound, haptics,
  // PostHog puzzle_* events) that aren't relevant to counting playthroughs.
  function simulateTerminalFinish(puzzleNumber, { genius = false, rankTierIndex = 0 } = {}) {
    // Read before the bump, exactly as jump() does -- One and Done depends
    // on this being "attempts BEFORE this one".
    const priorAttempts = getAttemptsForPuzzle(puzzleNumber);
    recordPlaythroughEnded(puzzleNumber);
    recordRankReached(rankTierIndex);
    if (genius) recordGeniusReached(puzzleNumber, { priorAttempts });
  }

  function simulateReset(puzzleNumber, { roundOverBeforeReset, moveCount }) {
    if (moveCount > 0) recordResetPressed();
    if (isGiveUpReset({ roundOverBeforeReset, moveCount })) {
      recordGiveUpReset(puzzleNumber);
      recordPlaythroughEnded(puzzleNumber);
    }
  }

  it('one puzzle finished-and-reset five times is 5 playthroughs, not 10', () => {
    const PUZZLE = 42;
    for (let i = 0; i < 5; i++) {
      simulateTerminalFinish(PUZZLE);
      // "Play again" reset -- round already over, must not double count.
      simulateReset(PUZZLE, { roundOverBeforeReset: true, moveCount: 18 });
    }
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(5);
    expect(stats.playedThroughPuzzleIds).toEqual([PUZZLE]);
    // Give-up resets: none. Button presses: five. The two counters mean
    // different things on purpose.
    expect(stats.resetsByPuzzle[PUZZLE]).toBeUndefined();
    expect(stats.totalResets).toBe(5);
  });

  it('THE BUG: a "play again" Reset then a clean GENIUS is not One and Done', () => {
    const PUZZLE = 11;
    simulateTerminalFinish(PUZZLE); // attempt 1: a bad finish
    simulateReset(PUZZLE, { roundOverBeforeReset: true, moveCount: 18 }); // "play again"
    simulateTerminalFinish(PUZZLE, { genius: true, rankTierIndex: 4 }); // attempt 2: nails it

    const stats = getBadgeStats();
    expect(stats.geniusPuzzleIds).toEqual([PUZZLE]);
    expect(stats.oneAndDonePuzzleIds).toEqual([]);
  });

  it('a first-attempt GENIUS with nothing taken back IS One and Done', () => {
    const PUZZLE = 12;
    simulateTerminalFinish(PUZZLE, { genius: true, rankTierIndex: 4 });
    expect(getBadgeStats().oneAndDonePuzzleIds).toEqual([PUZZLE]);
  });

  it('a mid-round give-up Reset ends the attempt and counts once', () => {
    const PUZZLE = 7;
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 4 });
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(1);
    expect(stats.resetsByPuzzle[PUZZLE]).toBe(1);
    expect(stats.totalResets).toBe(1);
  });

  it('Undo never ends an attempt or counts as a playthrough', () => {
    // It does now leave a per-puzzle trace (recordUndo), but that trace is
    // only ever read as a disqualifier -- it must not move any tally.
    recordUndo(1);
    recordUndo(1);
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(0);
    expect(stats.undosByPuzzle[1]).toBe(2);
  });

  it('mixes give-up resets and a terminal finish correctly across one puzzle', () => {
    const PUZZLE = 100;
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 2 }); // give-up #1
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 5 }); // give-up #2
    simulateTerminalFinish(PUZZLE, { genius: true, rankTierIndex: 4 }); // finally solved it

    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(3);
    expect(stats.resetsByPuzzle[PUZZLE]).toBe(2);
    expect(stats.resetsToGenius[PUZZLE]).toBe(2);
    expect(stats.geniusPuzzleIds).toEqual([PUZZLE]);
    // Two attempts already ended before this GENIUS, so it isn't one-and-done.
    expect(stats.oneAndDonePuzzleIds).toEqual([]);
    expect(stats.playedThroughPuzzleIds).toEqual([PUZZLE]);
  });

  it('an idle Reset (no moves made) never ends an attempt or counts a press', () => {
    const PUZZLE = 55;
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 0 });
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(0);
    expect(stats.resetsByPuzzle[PUZZLE]).toBeUndefined();
    expect(stats.totalResets).toBe(0);
  });

  it('distinct puzzles played through counts unique ids regardless of replay count', () => {
    simulateTerminalFinish(1);
    simulateReset(1, { roundOverBeforeReset: true, moveCount: 10 });
    simulateTerminalFinish(1);
    simulateTerminalFinish(2);
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(3);
    expect(stats.playedThroughPuzzleIds.sort()).toEqual([1, 2]);
  });

  it('collects rank tiers across puzzles, however often each is repeated', () => {
    simulateTerminalFinish(1, { rankTierIndex: 0 });
    simulateTerminalFinish(2, { rankTierIndex: 0 });
    simulateTerminalFinish(3, { rankTierIndex: 2 });
    simulateTerminalFinish(4, { rankTierIndex: 4, genius: true });
    expect(getBadgeStats().ranksReached.sort()).toEqual([0, 2, 4]);
  });
});
