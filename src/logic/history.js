// ============================================================================
// logic/history.js
// ----------------------------------------------------------------------------
// Remembers how each PAST DAILY puzzle turned out on this device, purely
// so components/ArchiveView.vue can show a "you already played this one,
// here's how it went" badge instead of just a bare list of dates. Nothing
// here is used to pick or validate puzzles -- that's all logic/daily.js --
// this is read-only bookkeeping about what already happened.
//
// Keyed by puzzle NUMBER (not date) to match logic/daily.js, and never
// recorded for custom editor designs (those have puzzleNumber === null).
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const HISTORY_STORAGE_KEY = 'dot-hop:history';

/** @returns {Object<number, {pegsRemaining: number[], overPar: number, won: boolean}>} every recorded result, keyed by puzzle number. */
export function getHistory() {
  return safeGet(HISTORY_STORAGE_KEY, {});
}

/**
 * @param {number} puzzleNumber
 * @returns {{pegsRemaining: number[], overPar: number, won: boolean} | undefined} that puzzle's recorded result, if it's been played to completion.
 */
export function getResultForPuzzle(puzzleNumber) {
  return getHistory()[puzzleNumber];
}

/**
 * Records (or overwrites, if replayed) a finished round's result.
 *
 * @param {number} puzzleNumber
 * @param {{pegsRemaining: number[], overPar: number, won: boolean}} result
 */
export function recordResult(puzzleNumber, result) {
  const history = getHistory();
  history[puzzleNumber] = result;
  safeSet(HISTORY_STORAGE_KEY, history);
}
