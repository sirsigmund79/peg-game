// ============================================================================
// logic/__tests__/ghostMoves.test.js
// ----------------------------------------------------------------------------
// Covers logic/ghostMoves.js: the encoding used to tell board states apart,
// and the single "today" bucket that forgets everything once the puzzle
// number it was recorded against no longer matches.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { encodeMasks, moveKey, getSeenMoveKeys, recordMoveSeen } from '../ghostMoves.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('encodeMasks', () => {
  it('produces the same key for equal mask arrays', () => {
    const a = [1n, 2n, 4n];
    const b = [1n, 2n, 4n];
    expect(encodeMasks(a)).toBe(encodeMasks(b));
  });

  it('produces different keys when any single color differs', () => {
    expect(encodeMasks([1n, 2n, 4n])).not.toBe(encodeMasks([1n, 2n, 8n]));
  });

  it('produces different keys when the SAME hole is occupied by a different color', () => {
    // Hole 0 occupied by color 0 vs. hole 0 occupied by color 1 -- same
    // occupied/empty silhouette, different actual state.
    const colorZeroAtHoleZero = [1n, 0n];
    const colorOneAtHoleZero = [0n, 1n];
    expect(encodeMasks(colorZeroAtHoleZero)).not.toBe(encodeMasks(colorOneAtHoleZero));
  });

  it('stays compact for a large (37-hole, 4-color) board', () => {
    const bigMask = (1n << 37n) - 1n; // every one of 37 bits set
    const key = encodeMasks([bigMask, bigMask, bigMask, bigMask]);
    expect(key.length).toBeLessThan(60);
  });
});

describe('moveKey', () => {
  it('is unique per distinct (from, over, to) triple', () => {
    expect(moveKey({ from: 0, over: 1, to: 2 })).not.toBe(moveKey({ from: 0, over: 1, to: 3 }));
  });
});

describe('getSeenMoveKeys / recordMoveSeen', () => {
  it('returns an empty array for a state that has never been recorded', () => {
    expect(getSeenMoveKeys(1, encodeMasks([1n]))).toEqual([]);
  });

  it('remembers a move recorded from a given state, for the same puzzle', () => {
    const stateKey = encodeMasks([0b101n]);
    recordMoveSeen(1, stateKey, moveKey({ from: 0, over: 1, to: 2 }));
    expect(getSeenMoveKeys(1, stateKey)).toEqual(['0:1:2']);
  });

  it('does not duplicate the same move recorded twice from the same state', () => {
    const stateKey = encodeMasks([0b101n]);
    recordMoveSeen(1, stateKey, moveKey({ from: 0, over: 1, to: 2 }));
    recordMoveSeen(1, stateKey, moveKey({ from: 0, over: 1, to: 2 }));
    expect(getSeenMoveKeys(1, stateKey)).toEqual(['0:1:2']);
  });

  it('tracks multiple distinct moves from the same state independently', () => {
    const stateKey = encodeMasks([0b101n]);
    recordMoveSeen(1, stateKey, moveKey({ from: 0, over: 1, to: 2 }));
    recordMoveSeen(1, stateKey, moveKey({ from: 4, over: 3, to: 2 }));
    expect(getSeenMoveKeys(1, stateKey).sort()).toEqual(['0:1:2', '4:3:2']);
  });

  it('keeps different states, for the same puzzle, separate', () => {
    const stateA = encodeMasks([0b101n]);
    const stateB = encodeMasks([0b110n]);
    recordMoveSeen(1, stateA, 'a-move');
    expect(getSeenMoveKeys(1, stateA)).toEqual(['a-move']);
    expect(getSeenMoveKeys(1, stateB)).toEqual([]);
  });

  it('is scoped to a single puzzle number -- a different puzzle sees nothing recorded', () => {
    const stateKey = encodeMasks([0b101n]);
    recordMoveSeen(1, stateKey, 'move-on-puzzle-1');
    expect(getSeenMoveKeys(2, stateKey)).toEqual([]);
  });

  it('discards everything once a NEW puzzle number is recorded against, even if the state key coincidentally matches', () => {
    const stateKey = encodeMasks([0b101n]);
    recordMoveSeen(1, stateKey, 'move-on-puzzle-1');
    expect(getSeenMoveKeys(1, stateKey)).toEqual(['move-on-puzzle-1']);

    // A new day rolls over -- puzzle 2 is now being played. Recording
    // anything against puzzle 2 must not see puzzle 1's leftover data.
    recordMoveSeen(2, stateKey, 'move-on-puzzle-2');
    expect(getSeenMoveKeys(2, stateKey)).toEqual(['move-on-puzzle-2']);
    // And puzzle 1's data is gone -- this is a single "today" bucket, not an
    // accumulating history.
    expect(getSeenMoveKeys(1, stateKey)).toEqual([]);
  });

  it('survives being read again for the same puzzle -- i.e. persists across what a board Reset would do', () => {
    const startingStateKey = encodeMasks([0n]);
    recordMoveSeen(5, startingStateKey, 'first-move');
    // Simulate a board Reset: nothing in useGame.js's reset() calls into
    // this module, so a fresh read for the same puzzle number must still
    // see the earlier recording.
    expect(getSeenMoveKeys(5, startingStateKey)).toEqual(['first-move']);
  });
});
