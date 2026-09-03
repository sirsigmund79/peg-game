// ============================================================================
// logic/__tests__/roundState.test.js
// ----------------------------------------------------------------------------
// Covers logic/roundState.js's resume-the-result-screen record: the masks
// round-trip as bigints, Reset clears the entry, and the Pro-mode flag the
// share text reads is stored with the round rather than looked up live.
//
// The legacy case matters most: entries written before Pro mode existed are a
// bare array of mask strings, and a player mid-round when the feature shipped
// has one sitting in localStorage right now. Reading one must still resume the
// board, and must report "not Pro" -- which it necessarily was.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFinishedMasks,
  getFinishedInProMode,
  recordRoundFinished,
  clearRoundFinished,
} from '../roundState.js';

const ROUND_STATE_KEY = 'dot-hop:round-state';

beforeEach(() => {
  window.localStorage.clear();
});

describe('roundState', () => {
  it('has nothing stored by default', () => {
    expect(getFinishedMasks(842)).toBeUndefined();
    expect(getFinishedInProMode(842)).toBe(false);
  });

  it('round-trips masks as bigints', () => {
    recordRoundFinished(842, [7n, 0n, 260n]);
    expect(getFinishedMasks(842)).toEqual([7n, 0n, 260n]);
  });

  it('stores the Pro-mode flag alongside the round', () => {
    recordRoundFinished(842, [7n], true);
    expect(getFinishedInProMode(842)).toBe(true);
  });

  it('defaults the Pro-mode flag to false when the caller omits it', () => {
    recordRoundFinished(842, [7n]);
    expect(getFinishedInProMode(842)).toBe(false);
  });

  it('keeps each puzzle independent', () => {
    recordRoundFinished(842, [7n], true);
    recordRoundFinished(843, [3n], false);
    expect(getFinishedInProMode(842)).toBe(true);
    expect(getFinishedInProMode(843)).toBe(false);
  });

  it('overwrites a previous finish of the same puzzle, flag included', () => {
    recordRoundFinished(842, [7n], true);
    recordRoundFinished(842, [3n], false);
    expect(getFinishedMasks(842)).toEqual([3n]);
    expect(getFinishedInProMode(842)).toBe(false);
  });

  it('clears an entry on Reset', () => {
    recordRoundFinished(842, [7n], true);
    clearRoundFinished(842);
    expect(getFinishedMasks(842)).toBeUndefined();
    expect(getFinishedInProMode(842)).toBe(false);
  });

  it('still resumes a pre-Pro-mode entry, and reports it as not Pro', () => {
    // The exact shape written by every version before Pro mode shipped.
    window.localStorage.setItem(ROUND_STATE_KEY, JSON.stringify({ 842: ['7', '0', '260'] }));
    expect(getFinishedMasks(842)).toEqual([7n, 0n, 260n]);
    expect(getFinishedInProMode(842)).toBe(false);
  });

  it('ignores an entry too malformed to resume', () => {
    window.localStorage.setItem(ROUND_STATE_KEY, JSON.stringify({ 842: { pro: true } }));
    expect(getFinishedMasks(842)).toBeUndefined();
    expect(getFinishedInProMode(842)).toBe(false);
  });
});
