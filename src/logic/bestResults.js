// ============================================================================
// logic/bestResults.js
// ----------------------------------------------------------------------------
// Remembers the BEST result ever recorded for each daily puzzle, across every
// replay -- a distinct concept from logic/history.js's single "most recent
// attempt" record, which gets silently overwritten on every replay. This is
// what seeds composables/useGame.js's `previousBest` (the result screen's
// rank-ladder baseline and "New best!" pill) and StatsView.vue's rank
// breakdown.
//
// Unlike history.js, a best-result record includes the actual final board
// state (one bigint mask per color -- see logic/rules.js), not just the
// aggregate per-color peg counts. BigInt can't survive JSON.stringify (which
// logic/storage.js's safeGet/safeSet use under the hood), so masks are
// converted to/from strings at this file's own boundary.
//
// Deliberately starts tracking fresh from whenever this shipped, rather than
// trying to reconcile against pre-existing history.js records (which have no
// board state at all to show). The first completion of a puzzle always seeds
// its best record; every completion after that only overwrites it if
// strictly better.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const BEST_STORAGE_KEY = 'dot-hop:best-results';

function getBestStore() {
  return safeGet(BEST_STORAGE_KEY, {});
}

/**
 * @param {number} puzzleNumber
 * @returns {{overPar: number, pegsRemaining: number[], won: boolean, masks: bigint[]} | undefined}
 *   the best result recorded for that puzzle, if any attempt has been made since this feature shipped.
 */
export function getBestForPuzzle(puzzleNumber) {
  const stored = getBestStore()[puzzleNumber];
  if (!stored) return undefined;
  return { ...stored, masks: stored.masks.map((mask) => BigInt(mask)) };
}

/**
 * @returns {Object<number, {overPar: number, pegsRemaining: number[], won: boolean}>}
 *   every puzzle's best-ever recorded result, keyed by puzzle number -- masks
 *   omitted (unlike getBestForPuzzle()) since the only known caller
 *   (components/StatsView.vue's rank breakdown) just needs overPar.
 */
export function getAllBestResults() {
  const store = getBestStore();
  const results = {};
  for (const [puzzleNumber, entry] of Object.entries(store)) {
    results[puzzleNumber] = { overPar: entry.overPar, pegsRemaining: entry.pegsRemaining, won: entry.won };
  }
  return results;
}

/**
 * Records a finished round's result as the new best for that puzzle, if it's
 * the first attempt recorded or strictly better (lower overPar) than what's
 * already stored.
 *
 * @param {number} puzzleNumber
 * @param {{overPar: number, pegsRemaining: number[], won: boolean, masks: bigint[]}} result
 */
export function recordBestIfBetter(puzzleNumber, result) {
  const store = getBestStore();
  const existing = store[puzzleNumber];
  if (existing && result.overPar >= existing.overPar) return;
  store[puzzleNumber] = { ...result, masks: result.masks.map((mask) => mask.toString()) };
  safeSet(BEST_STORAGE_KEY, store);
}
