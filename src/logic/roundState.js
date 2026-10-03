// ============================================================================
// logic/roundState.js
// ----------------------------------------------------------------------------
// Remembers the exact board a puzzle was left on the moment its most recent
// round FINISHED, purely so components/PlayView.vue can jump straight back
// to the result screen if the player refreshes, or navigates away and back,
// instead of dropping them onto a fresh empty board they already solved.
//
// Distinct from logic/history.js (the permanent "how did it go" record used
// for components/ArchiveView.vue's badges) and logic/bestResults.js (the
// permanent "best ever" record): those two are never touched by Reset, since
// resetting to replay shouldn't erase an earned badge. This store is the
// opposite -- it exists ONLY to say "resume showing results," and Reset is
// the one action that clears it, so the next load starts fresh.
//
// Keyed by puzzle NUMBER, like the other two, and never recorded for custom
// editor or story designs (those have puzzleNumber === null).
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const ROUND_STATE_KEY = 'dot-hop:round-state';

function getStore() {
  return safeGet(ROUND_STATE_KEY, {});
}

/**
 * @param {number} puzzleNumber
 * @returns {bigint[] | undefined} the masks the puzzle was left on when its
 *   most recent round finished, if it's currently sitting in that state.
 */
export function getFinishedMasks(puzzleNumber) {
  const stored = getStore()[puzzleNumber];
  return stored ? stored.map((mask) => BigInt(mask)) : undefined;
}

/**
 * Records the board state a just-finished round ended on, overwriting
 * whatever was there for a previous finish of the same puzzle.
 *
 * @param {number} puzzleNumber
 * @param {bigint[]} masks
 */
export function recordRoundFinished(puzzleNumber, masks) {
  const store = getStore();
  store[puzzleNumber] = masks.map((mask) => mask.toString());
  safeSet(ROUND_STATE_KEY, store);
}

/**
 * Clears the finished-state record for a puzzle, e.g. because the player
 * hit Reset -- the next time this puzzle loads, it should start fresh
 * rather than resuming the result screen.
 *
 * @param {number} puzzleNumber
 */
export function clearRoundFinished(puzzleNumber) {
  const store = getStore();
  if (!(puzzleNumber in store)) return;
  delete store[puzzleNumber];
  safeSet(ROUND_STATE_KEY, store);
}
