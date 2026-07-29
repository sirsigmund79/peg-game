// ============================================================================
// logic/solutionLock.js
// ----------------------------------------------------------------------------
// Remembers which puzzles the player chose to "watch the solution" for. Doing
// so is a deliberate trade-off (see components/WatchSolution.vue): once a
// player watches the solve, their rank for that puzzle is locked in and they
// can no longer Reset it to play again -- the whole point being that a rank
// earned honestly isn't worth anything if you could just peek at the answer
// and then replay for a better one.
//
// This is a one-way, permanent flag per puzzle NUMBER (like the other
// per-puzzle stores in logic/): once set, it never clears -- there's no
// "unlock." Never recorded for custom editor designs (puzzleNumber === null),
// which have no rank to protect in the first place.
//
// Kept separate from logic/roundState.js on purpose: that store's whole job
// is "resume showing the result screen" and Reset clears it; this one's job
// is "Reset is no longer allowed," so they're opposites and must not share a
// key.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const SOLUTION_LOCK_KEY = 'dot-hop:solution-locked';

function getStore() {
  return safeGet(SOLUTION_LOCK_KEY, {});
}

/**
 * @param {number} puzzleNumber
 * @returns {boolean} true if this puzzle's rank has been locked by watching the solution.
 */
export function isSolutionLocked(puzzleNumber) {
  return Boolean(getStore()[puzzleNumber]);
}

/**
 * Marks this puzzle's rank as locked (the player watched the solution).
 * Idempotent -- calling it again on an already-locked puzzle is a no-op.
 *
 * @param {number} puzzleNumber
 */
export function lockSolution(puzzleNumber) {
  const store = getStore();
  if (store[puzzleNumber]) return;
  store[puzzleNumber] = true;
  safeSet(SOLUTION_LOCK_KEY, store);
}
