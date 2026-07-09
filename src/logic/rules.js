// ============================================================================
// rules.js
// ----------------------------------------------------------------------------
// This file knows the RULES of peg solitaire: how to build a starting board,
// how to check whether a specific jump is legal, how to apply a jump, and
// how to tell whether the round is over. It works together with geometry.js
// (the board's shape) and solver.js (finding the best possible outcome).
//
// Every board position is now a small ARRAY of masks, one bigint per peg
// color (index = color index, see logic/pegColors.js) -- not a single mask
// like before. A peg can only ever jump over a peg of its OWN color, so
// "which color owns this hole" matters for legality, not just "is it
// filled". A jump only ever changes ONE color's mask (the color doing the
// jumping); every other color's mask is untouched.
//
// No Vue code lives here on purpose -- useGame.js (a composable) is the
// bridge that connects this pure logic to what's shown on screen.
// ============================================================================

/**
 * Builds the starting board position: one bigint mask per color, bit i set
 * wherever hole i starts with a peg of that color.
 *
 * @param {number} cellCount - how many holes the board has
 * @param {number[]} holeColors - holeColors[i] is the color index (0..colorCount-1)
 *   of the peg starting at hole i, or -1 if hole i starts empty
 * @param {number} colorCount - how many distinct colors this puzzle uses
 * @returns {bigint[]} one mask per color
 */
export function createStartingMasks(cellCount, holeColors, colorCount) {
  const masks = new Array(colorCount).fill(0n);
  for (let index = 0; index < cellCount; index++) {
    const color = holeColors[index];
    if (color !== -1) {
      masks[color] |= 1n << BigInt(index);
    }
  }
  return masks;
}

/** @returns {boolean} true if there's a peg at `index` in this (single) mask. */
export function isFilled(mask, index) {
  return (mask & (1n << BigInt(index))) !== 0n;
}

/** @returns {bigint} the union of every color's mask -- "is any peg here at all". */
export function getOccupiedMask(masks) {
  return masks.reduce((acc, mask) => acc | mask, 0n);
}

/**
 * @param {bigint[]} masks
 * @param {number} index
 * @returns {number} the color index of the peg at `index`, or -1 if empty
 */
export function getColorAt(masks, index) {
  const bit = 1n << BigInt(index);
  for (let color = 0; color < masks.length; color++) {
    if (masks[color] & bit) return color;
  }
  return -1;
}

/**
 * Derives which holes start empty from a holeColors array -- the inverse of
 * what createStartingMasks() consumes. Used by anything that only cares
 * "which holes are empty" (display labels, the archive glyph) without
 * needing to know about colors.
 *
 * @param {number[]} holeColors
 * @returns {number[]}
 */
export function getEmptyHolesFromColors(holeColors) {
  const emptyHoles = [];
  holeColors.forEach((color, index) => {
    if (color === -1) emptyHoles.push(index);
  });
  return emptyHoles;
}

/**
 * Checks whether a specific jump is legal on the given board right now.
 * A jump is legal when: the "from" hole has a peg, the "over" hole has a
 * peg of the SAME color as "from" (a peg can only jump over its own
 * color), and the "to" hole is empty. (We don't need to re-check that the
 * three holes are lined up correctly -- that was already guaranteed when
 * geometry.js generated the list of possible moves.)
 *
 * @param {bigint[]} masks
 * @param {{from:number, over:number, to:number}} move
 * @returns {boolean}
 */
export function isLegalMove(masks, move) {
  const fromColor = getColorAt(masks, move.from);
  if (fromColor === -1) return false;
  if (getColorAt(masks, move.over) !== fromColor) return false;
  return !isFilled(getOccupiedMask(masks), move.to);
}

/**
 * Applies a jump to a board position and returns the NEW position (a fresh
 * masks array; the one you passed in is left untouched). Only the jumping
 * peg's own color mask ever changes.
 *
 * @param {bigint[]} masks
 * @param {{from:number, over:number, to:number}} move
 * @returns {bigint[]} the resulting masks after the jump
 */
export function applyMove(masks, move) {
  const color = getColorAt(masks, move.from);
  const fromBit = 1n << BigInt(move.from);
  const overBit = 1n << BigInt(move.over);
  const toBit = 1n << BigInt(move.to);
  const next = [...masks];
  next[color] = (masks[color] & ~fromBit & ~overBit) | toBit;
  return next;
}

/**
 * Finds every legal jump available right now, out of a board's full move
 * list. Pass `fromIndex` to only get jumps starting from one particular
 * peg (used to highlight valid landing holes after the player taps a peg).
 *
 * @param {bigint[]} masks
 * @param {{from:number, over:number, to:number}[]} moveList - all jumps this
 *   board shape allows (from geometry.js)
 * @param {number} [fromIndex] - if given, only return jumps starting here
 * @returns {{from:number, over:number, to:number}[]}
 */
export function findLegalMoves(masks, moveList, fromIndex) {
  return moveList.filter((move) => {
    if (fromIndex !== undefined && move.from !== fromIndex) {
      return false;
    }
    return isLegalMove(masks, move);
  });
}

/**
 * The round is over once no legal jump remains anywhere on the board.
 *
 * @param {bigint[]} masks
 * @param {{from:number, over:number, to:number}[]} moveList
 * @returns {boolean}
 */
export function isRoundOver(masks, moveList) {
  return findLegalMoves(masks, moveList).length === 0;
}

/**
 * Counts how many pegs remain, per color.
 *
 * @param {bigint[]} masks
 * @returns {number[]} one count per color, same index order as masks
 */
export function countPegsRemaining(masks) {
  return masks.map((mask) => {
    let remaining = mask;
    let total = 0;
    while (remaining > 0n) {
      if (remaining & 1n) {
        total += 1;
      }
      remaining >>= 1n;
    }
    return total;
  });
}

/**
 * The nostalgic Cracker Barrel rank copy, ordered WORST first, BEST last.
 * `overPar: null` marks the catch-all bottom tier ("3 or more over par").
 * Keyed on `overPar` -- how many MORE pegs total the player left behind
 * than the puzzle's solver-proven best -- rather than a raw peg count,
 * since that's the only measure that stays meaningful across boards with
 * different color counts and par totals (today's "left exactly 1 peg" was
 * always `overPar === 0` under the old single-color rule; these thresholds
 * carry that over unchanged). Kept as one ordered list (rather than a
 * chain of if-statements) so ResultOverlay.vue's "sliding scale" reveal
 * can animate up through every tier the player passed on the way to the
 * one they actually landed on -- see getRankClimbSequence() below.
 */
export const RANK_TIERS = [
  { overPar: null, rank: 'Eg-no-ra-moose', emoji: '' },
  { overPar: 2, rank: 'Not bad', emoji: '' },
  { overPar: 1, rank: 'Purty smart', emoji: '' },
  { overPar: 0, rank: 'GENIUS', emoji: '🧠' },
];

/**
 * Turns "how many pegs over par" into its rank copy. Kept here (not in a
 * Vue component) so it's easy to unit test and so every screen that needs
 * rank text -- the result modal, the archive's played-day badges -- uses
 * the exact same wording.
 *
 * @param {number} overPar
 * @returns {{rank: string, emoji: string}}
 */
export function getRankForOverPar(overPar) {
  const tier = RANK_TIERS.find((candidate) => candidate.overPar === overPar) ?? RANK_TIERS[0];
  return { rank: tier.rank, emoji: tier.emoji };
}

/**
 * Every tier from the worst (bottom of RANK_TIERS) up through whichever
 * one the player actually reached, in the order a "sliding scale" reveal
 * should visit them -- always ending on the achieved tier, whether that's
 * a 1-step reveal (already at the bottom) or a full 4-step climb (GENIUS).
 *
 * @param {number} overPar
 * @returns {{rank: string, emoji: string}[]}
 */
export function getRankClimbSequence(overPar) {
  const achievedIndex = RANK_TIERS.findIndex((candidate) => candidate.overPar === overPar);
  const index = achievedIndex === -1 ? 0 : achievedIndex;
  // RANK_TIERS is already ordered worst -> best, so slicing from the start
  // up through the achieved tier already reads worst -> achieved -- no
  // reversal needed.
  return RANK_TIERS.slice(0, index + 1);
}
