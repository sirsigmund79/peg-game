// ============================================================================
// logic/ghostMoves.js
// ----------------------------------------------------------------------------
// Backs the "Ghost Outline" memory aid: for the puzzle being played RIGHT
// NOW, remembers which exact (from, over, to) jumps have already been taken
// from each exact board state reached today, so components/Board.vue can
// draw a dotted ring on a jump instead of a solid one. Purely informational
// -- never used to decide whether a move is legal or good.
//
// "Exact board state" means the full per-hole color-or-empty pattern, not
// just occupied/empty -- a peg's color decides what it can jump over (see
// logic/rules.js), so two positions that look the same in silhouette but
// differ in which color sits where are different states here. That pattern
// is already exactly what a useGame.js `state.masks` array (one bigint
// bitmask per color) encodes, so encodeMasks() below just serializes that
// array rather than inventing a second representation of the same thing.
//
// ONE "today" BUCKET, NOT A GROWING HISTORY -- unlike logic/history.js or
// logic/badgeStats.js (which accumulate forever, keyed by every puzzle
// number ever played), this store only ever holds ONE puzzle's data at a
// time. Every read/write compares the puzzle number it's called with
// against whatever puzzle number is currently stored; a mismatch (a new
// day's puzzle) just starts over empty. That's what gives "survives a
// same-day Reset, resets itself on a new day" for free, with no separate
// cleanup/expiry job. composables/useGame.js's reset() must NEVER call
// anything in this file -- that's the one thing that would break the
// "survives Reset" half of this contract.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const GHOST_MOVES_KEY = 'dot-hop:ghost-seen-moves';

function emptyStore(puzzleNumber) {
  return { puzzleNumber, seen: {} };
}

/**
 * Reads the store, discarding it (starting fresh) if it belongs to a
 * different puzzle than the one being asked about.
 *
 * @param {number} puzzleNumber
 * @returns {{puzzleNumber: number, seen: Object<string, string[]>}}
 */
function getStoreForPuzzle(puzzleNumber) {
  const stored = safeGet(GHOST_MOVES_KEY, null);
  if (!stored || stored.puzzleNumber !== puzzleNumber) return emptyStore(puzzleNumber);
  return stored;
}

/**
 * Encodes a board position as a short, stable string key -- one bigint mask
 * per color, base-36 for compactness, joined by an underscore. Two calls
 * with equal `masks` (same color in every hole) always produce equal keys.
 *
 * @param {bigint[]} masks
 * @returns {string}
 */
export function encodeMasks(masks) {
  return masks.map((mask) => mask.toString(36)).join('_');
}

/**
 * Encodes a jump as a short string key. `over` is technically redundant
 * given `from`/`to` on any of this game's board shapes (two directions from
 * the same origin never land on the same destination), but keeping it costs
 * nothing and makes the key self-describing.
 *
 * @param {{from:number, over:number, to:number}} move
 * @returns {string}
 */
export function moveKey(move) {
  return `${move.from}:${move.over}:${move.to}`;
}

/**
 * Which jumps (as moveKey() strings) have already been taken from a given
 * board state, for a given puzzle, today.
 *
 * @param {number} puzzleNumber
 * @param {string} stateKey - from encodeMasks()
 * @returns {string[]}
 */
export function getSeenMoveKeys(puzzleNumber, stateKey) {
  return getStoreForPuzzle(puzzleNumber).seen[stateKey] ?? [];
}

/**
 * Records that a jump was just taken from a given board state, for a given
 * puzzle, today. Safe to call more than once for the same state/move (it
 * won't be duplicated).
 *
 * @param {number} puzzleNumber
 * @param {string} stateKey - from encodeMasks(), the state BEFORE the jump
 * @param {string} takenMoveKey - from moveKey()
 */
export function recordMoveSeen(puzzleNumber, stateKey, takenMoveKey) {
  const store = getStoreForPuzzle(puzzleNumber);
  const existing = store.seen[stateKey] ?? [];
  if (!existing.includes(takenMoveKey)) {
    store.seen[stateKey] = [...existing, takenMoveKey];
  }
  safeSet(GHOST_MOVES_KEY, store);
}
