// ============================================================================
// rules.js
// ----------------------------------------------------------------------------
// This file knows the RULES of peg solitaire: how to build a starting board,
// how to check whether a specific jump is legal, how to apply a jump, and
// how to tell whether the round is over. It works together with geometry.js
// (the board's shape) and solver.js (finding the best possible outcome).
//
// No Vue code lives here on purpose -- useGame.js (a composable) is the
// bridge that connects this pure logic to what's shown on screen.
// ============================================================================

/**
 * Builds the starting board position (a mask) for a puzzle: every hole has
 * a peg EXCEPT the ones listed in `emptyHoles`.
 *
 * @param {number} cellCount - how many holes the board has
 * @param {number[]} emptyHoles - indexes of holes that start empty
 * @returns {bigint} the starting mask
 */
export function createStartingMask(cellCount, emptyHoles) {
  let mask = (1n << BigInt(cellCount)) - 1n; // start with every hole filled
  for (const holeIndex of emptyHoles) {
    mask &= ~(1n << BigInt(holeIndex)); // clear that bit (remove the peg)
  }
  return mask;
}

/** @returns {boolean} true if there's a peg at `index` in this mask. */
export function isFilled(mask, index) {
  return (mask & (1n << BigInt(index))) !== 0n;
}

/**
 * Checks whether a specific jump is legal on the given board right now.
 * A jump is legal when: the "from" hole has a peg, the "over" hole has a
 * peg, and the "to" hole is empty. (We don't need to re-check that the
 * three holes are lined up correctly -- that was already guaranteed when
 * geometry.js generated the list of possible moves.)
 *
 * @param {bigint} mask
 * @param {{from:number, over:number, to:number}} move
 * @returns {boolean}
 */
export function isLegalMove(mask, move) {
  return isFilled(mask, move.from) && isFilled(mask, move.over) && !isFilled(mask, move.to);
}

/**
 * Applies a jump to a board position and returns the NEW position. Does not
 * modify the mask you passed in (masks are just numbers, so this happens
 * naturally, but it's worth calling out).
 *
 * @param {bigint} mask
 * @param {{from:number, over:number, to:number}} move
 * @returns {bigint} the resulting mask after the jump
 */
export function applyMove(mask, move) {
  const fromBit = 1n << BigInt(move.from);
  const overBit = 1n << BigInt(move.over);
  const toBit = 1n << BigInt(move.to);
  return (mask & ~fromBit & ~overBit) | toBit;
}

/**
 * Finds every legal jump available right now, out of a board's full move
 * list. Pass `fromIndex` to only get jumps starting from one particular
 * peg (used to highlight valid landing holes after the player taps a peg).
 *
 * @param {bigint} mask
 * @param {{from:number, over:number, to:number}[]} moveList - all jumps this
 *   board shape allows (from geometry.js)
 * @param {number} [fromIndex] - if given, only return jumps starting here
 * @returns {{from:number, over:number, to:number}[]}
 */
export function findLegalMoves(mask, moveList, fromIndex) {
  return moveList.filter((move) => {
    if (fromIndex !== undefined && move.from !== fromIndex) {
      return false;
    }
    return isLegalMove(mask, move);
  });
}

/**
 * The round is over once no legal jump remains anywhere on the board.
 *
 * @param {bigint} mask
 * @param {{from:number, over:number, to:number}[]} moveList
 * @returns {boolean}
 */
export function isRoundOver(mask, moveList) {
  return findLegalMoves(mask, moveList).length === 0;
}

/**
 * Counts how many pegs remain on the board.
 *
 * @param {bigint} mask
 * @returns {number}
 */
export function countPegsRemaining(mask) {
  let remaining = mask;
  let total = 0;
  while (remaining > 0n) {
    if (remaining & 1n) {
      total += 1;
    }
    remaining >>= 1n;
  }
  return total;
}

/**
 * The nostalgic Cracker Barrel rank copy, ordered WORST first, BEST last.
 * `pegs: null` marks the catch-all bottom tier ("4 or more left"). Kept as
 * one ordered list (rather than a chain of if-statements) so
 * ResultOverlay.vue's "sliding scale" reveal can animate up through every
 * tier the player passed on the way to the one they actually landed on --
 * see getRankClimbSequence() below.
 */
export const RANK_TIERS = [
  { pegs: null, rank: 'Eg-no-ra-moose', emoji: '' },
  { pegs: 3, rank: 'Not bad', emoji: '' },
  { pegs: 2, rank: 'Purty smart', emoji: '' },
  { pegs: 1, rank: 'GENIUS', emoji: '🧠' },
];

/**
 * Turns a final peg count into its rank copy. Kept here (not in a Vue
 * component) so it's easy to unit test and so every screen that needs
 * rank text -- the result modal, the archive's played-day badges -- uses
 * the exact same wording.
 *
 * @param {number} pegsRemaining
 * @returns {{rank: string, emoji: string}}
 */
export function getRankForPegCount(pegsRemaining) {
  const tier = RANK_TIERS.find((candidate) => candidate.pegs === pegsRemaining) ?? RANK_TIERS[0];
  return { rank: tier.rank, emoji: tier.emoji };
}

/**
 * Every tier from the worst (bottom of RANK_TIERS) up through whichever
 * one the player actually reached, in the order a "sliding scale" reveal
 * should visit them -- always ending on the achieved tier, whether that's
 * a 1-step reveal (already at the bottom) or a full 4-step climb (GENIUS).
 *
 * @param {number} pegsRemaining
 * @returns {{rank: string, emoji: string}[]}
 */
export function getRankClimbSequence(pegsRemaining) {
  const achievedIndex = RANK_TIERS.findIndex((candidate) => candidate.pegs === pegsRemaining);
  const index = achievedIndex === -1 ? 0 : achievedIndex;
  // RANK_TIERS is already ordered worst -> best, so slicing from the start
  // up through the achieved tier already reads worst -> achieved -- no
  // reversal needed (an earlier version of this reversed it, which made
  // the sequence always land back on the WORST tier instead of the one
  // actually reached).
  return RANK_TIERS.slice(0, index + 1);
}
