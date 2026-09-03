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
//
// Also carries whether that finished round was played in Pro mode (see
// logic/proMode.js), because the share text names the mode and has to name
// the one the board was actually PLAYED with -- a result screen resumed
// after a reload must not start claiming Pro just because the toggle happens
// to read Pro now. This store is the right home for it: it lives and dies
// with exactly the round the result screen is showing.
//
// Entries written before Pro mode existed are a bare array of mask strings
// rather than an object, so every read below accepts both shapes and treats
// the old one as "not Pro" -- which it necessarily was.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const ROUND_STATE_KEY = 'dot-hop:round-state';

function getStore() {
  return safeGet(ROUND_STATE_KEY, {});
}

/** Reads one entry in either shape, or undefined. See this file's header. */
function readEntry(puzzleNumber) {
  const stored = getStore()[puzzleNumber];
  if (!stored) return undefined;
  if (Array.isArray(stored)) return { masks: stored, pro: false };
  if (!Array.isArray(stored.masks)) return undefined;
  return { masks: stored.masks, pro: Boolean(stored.pro) };
}

/**
 * @param {number} puzzleNumber
 * @returns {bigint[] | undefined} the masks the puzzle was left on when its
 *   most recent round finished, if it's currently sitting in that state.
 */
export function getFinishedMasks(puzzleNumber) {
  const entry = readEntry(puzzleNumber);
  return entry ? entry.masks.map((mask) => BigInt(mask)) : undefined;
}

/**
 * @param {number} puzzleNumber
 * @returns {boolean} whether the finished round currently being resumed was
 *   played in Pro mode. False when there's nothing stored, and false for
 *   entries written before Pro mode existed.
 */
export function getFinishedInProMode(puzzleNumber) {
  const entry = readEntry(puzzleNumber);
  return entry ? entry.pro : false;
}

/**
 * Records the board state a just-finished round ended on, overwriting
 * whatever was there for a previous finish of the same puzzle.
 *
 * @param {number} puzzleNumber
 * @param {bigint[]} masks
 * @param {boolean} [playedInProMode] - whether this round was played in Pro mode
 */
export function recordRoundFinished(puzzleNumber, masks, playedInProMode = false) {
  const store = getStore();
  store[puzzleNumber] = {
    masks: masks.map((mask) => mask.toString()),
    pro: Boolean(playedInProMode),
  };
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
