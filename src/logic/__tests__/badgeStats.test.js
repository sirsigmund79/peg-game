// ============================================================================
// logic/__tests__/badgeStats.test.js
// ----------------------------------------------------------------------------
// Covers the raw counters badges.js reads from, with particular attention to
// the playthrough-counting boundary (see attemptBoundary.test.js for the
// isolated rule, and the "simulated attempt sequences" block below for it
// exercised the way composables/useGame.js actually calls these functions).
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBadgeStats,
  recordPegCleared,
  recordPlaythroughEnded,
  recordGiveUpReset,
  recordGeniusReached,
} from '../badgeStats.js';
import { isGiveUpReset } from '../attemptBoundary.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('getBadgeStats', () => {
  it('returns a fresh, zeroed schema when nothing has been recorded', () => {
    const stats = getBadgeStats();
    expect(stats.geniusPuzzleIds).toEqual([]);
    expect(stats.cleanGeniusPuzzleIds).toEqual([]);
    expect(stats.totalPlaythroughs).toBe(0);
    expect(stats.playedThroughPuzzleIds).toEqual([]);
    expect(stats.resetsByPuzzle).toEqual({});
    expect(stats.resetsToGenius).toEqual({});
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
    expect(stats.cleanGeniusPuzzleIds).toEqual([]);
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

describe('recordGeniusReached', () => {
  it('dedupes geniusPuzzleIds across repeated GENIUS finishes on the same puzzle', () => {
    recordGeniusReached(9, { attemptUndoCount: 0 });
    recordGeniusReached(9, { attemptUndoCount: 3 });
    expect(getBadgeStats().geniusPuzzleIds).toEqual([9]);
  });

  it('snapshots resetsToGenius on the FIRST reach and never overwrites it after', () => {
    recordGiveUpReset(9); // 1 reset before first genius
    recordGeniusReached(9, { attemptUndoCount: 0 });
    expect(getBadgeStats().resetsToGenius[9]).toBe(1);

    // A later replay racks up more resets on this puzzle, then reaches
    // GENIUS again -- the ORIGINAL "how many resets it took the first time"
    // must not change.
    recordGiveUpReset(9);
    recordGiveUpReset(9);
    recordGeniusReached(9, { attemptUndoCount: 1 });
    expect(getBadgeStats().resetsToGenius[9]).toBe(1);
    expect(getBadgeStats().resetsByPuzzle[9]).toBe(3);
  });

  it('marks Clean Genius only when zero Undos this attempt AND zero resets ever on this puzzle', () => {
    recordGeniusReached(1, { attemptUndoCount: 0 });
    expect(getBadgeStats().cleanGeniusPuzzleIds).toEqual([1]);
  });

  it('does not mark Clean Genius if the attempt used any Undo', () => {
    recordGeniusReached(2, { attemptUndoCount: 1 });
    expect(getBadgeStats().cleanGeniusPuzzleIds).toEqual([]);
  });

  it('does not mark Clean Genius if the puzzle had any prior give-up Reset', () => {
    recordGiveUpReset(3);
    recordGeniusReached(3, { attemptUndoCount: 0 });
    expect(getBadgeStats().cleanGeniusPuzzleIds).toEqual([]);
  });
});

describe('simulated attempt sequences (mirrors composables/useGame.js call order)', () => {
  // These helpers stand in for what jump()'s terminal branch and reset()
  // do, in the same order and behind the same isGiveUpReset() gate --
  // without pulling in Vue/useGame.js's other side effects (sound, haptics,
  // PostHog puzzle_* events) that aren't relevant to counting playthroughs.
  function simulateTerminalFinish(puzzleNumber, { genius = false, attemptUndoCount = 0 } = {}) {
    recordPlaythroughEnded(puzzleNumber);
    if (genius) recordGeniusReached(puzzleNumber, { attemptUndoCount });
  }

  function simulateReset(puzzleNumber, { roundOverBeforeReset, moveCount }) {
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
    expect(stats.resetsByPuzzle[PUZZLE]).toBeUndefined();
  });

  it('a mid-round give-up Reset ends the attempt and counts once', () => {
    const PUZZLE = 7;
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 4 });
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(1);
    expect(stats.resetsByPuzzle[PUZZLE]).toBe(1);
  });

  it('Undo never ends an attempt or counts as a playthrough', () => {
    // There is no "recordUndo" call into badgeStats.js at all -- Undo only
    // touches useGame.js's own in-memory state.attemptUndoCount. Simulating
    // a bunch of undos (i.e. doing nothing here) must leave the tally at 0.
    expect(getBadgeStats().totalPlaythroughs).toBe(0);
  });

  it('mixes give-up resets and a terminal finish correctly across one puzzle', () => {
    const PUZZLE = 100;
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 2 }); // give-up #1
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 5 }); // give-up #2
    simulateTerminalFinish(PUZZLE, { genius: true, attemptUndoCount: 0 }); // finally solved it

    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(3);
    expect(stats.resetsByPuzzle[PUZZLE]).toBe(2);
    expect(stats.resetsToGenius[PUZZLE]).toBe(2);
    expect(stats.geniusPuzzleIds).toEqual([PUZZLE]);
    // Two resets happened before this GENIUS, so it isn't "clean".
    expect(stats.cleanGeniusPuzzleIds).toEqual([]);
    expect(stats.playedThroughPuzzleIds).toEqual([PUZZLE]);
  });

  it('an idle Reset (no moves made) never ends an attempt', () => {
    const PUZZLE = 55;
    simulateReset(PUZZLE, { roundOverBeforeReset: false, moveCount: 0 });
    const stats = getBadgeStats();
    expect(stats.totalPlaythroughs).toBe(0);
    expect(stats.resetsByPuzzle[PUZZLE]).toBeUndefined();
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
});
