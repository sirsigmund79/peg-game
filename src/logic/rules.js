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
 * How many pegs a puzzle STARTS with -- every hole that isn't empty (-1).
 * The other half of the percentage denominator below (see removablePegCount).
 *
 * @param {number[]} holeColors
 * @returns {number}
 */
export function startingPegCount(holeColors) {
  return holeColors.filter((color) => color !== -1).length;
}

/**
 * The most pegs this puzzle can possibly clear -- starting pegs minus par
 * (the fewest that can ever remain). This is the denominator the rank
 * percentage (see getCompletionPercent) is measured against: it's what
 * separates "3 pegs over par on a tiny 12-peg board" from "3 over on a
 * 34-peg board," where the same absolute miss is a much smaller share of
 * everything that was ever clearable.
 *
 * @param {number[]} holeColors
 * @param {number[]} par - the solver-proven best, one target count per color
 * @returns {number}
 */
export function removablePegCount(holeColors, par) {
  const parTotal = par.reduce((sum, count) => sum + count, 0);
  return startingPegCount(holeColors) - parTotal;
}

/**
 * Turns a result into "what percent of the clearable pegs did you clear" --
 * 100 means you reached par (cleared everything that could ever come off),
 * 0 means you cleared none of them. This is the single number the rank
 * tiers below are keyed on, replacing the old raw "pegs over par."
 *
 * @param {number} overPar - pegs left beyond par (0 = perfect)
 * @param {number} removable - see removablePegCount()
 * @returns {number} 0..100
 */
export function getCompletionPercent(overPar, removable) {
  // A board with nothing to clear (par === start) can't be measured as a
  // fraction -- treat reaching par as a perfect 100, anything else as 0.
  if (removable <= 0) return overPar <= 0 ? 100 : 0;
  return ((removable - overPar) / removable) * 100;
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
 * Each tier is keyed on `minCompletion` -- the lowest completion PERCENT (see
 * getCompletionPercent) that still earns it -- rather than a raw "pegs over
 * par" count. Percentages are what keep the ranks fair across wildly
 * different board sizes: leaving 3 pegs over par is a near-miss on a 34-peg
 * octagon (you cleared ~89% of what was clearable) but a real stumble on a
 * 12-peg triangle (~67%), and the old absolute thresholds punished both the
 * same. Genius stays pinned to actually reaching par (100%). The bottom tier
 * (`minCompletion: 0`) is the always-reached catch-all.
 *
 * Each tier also carries a `quips` list -- gentle, rotating ribs shown under
 * the rank on the result screen (see getQuipForRank); several per tier so a
 * player replaying the same puzzle sees a different one each try. Kept as one
 * ordered list (rather than a chain of if-statements) for easy scanning and
 * testing.
 */
export const RANK_TIERS = [
  {
    minCompletion: 0,
    rank: 'Warming Up',
    emoji: '',
    quips: ['Everybody starts somewhere.', 'The board says hi.', 'Plenty of pegs to keep you company.'],
  },
  {
    minCompletion: 50,
    rank: 'Movin’ Up',
    emoji: '',
    quips: ['Progress! Sorta.', 'The pegs are winning, but barely.', 'Rome wasn’t cleared in a day.'],
  },
  {
    minCompletion: 70,
    rank: 'Not bad',
    emoji: '',
    quips: ['Cracker Barrel would nod.', 'Middle of the pack, and proud.', 'You’ve done worse. Probably.'],
  },
  {
    minCompletion: 85,
    rank: 'Purty smart',
    emoji: '',
    quips: ['So close you can taste it.', 'Par’s right there, sugar.', 'One good jump from glory.'],
  },
  {
    minCompletion: 100,
    rank: 'Genius',
    emoji: '🧠',
    quips: ['Par cleared. Show-off.', 'Nothing left to prove.', 'The board never stood a chance.'],
  },
];

/**
 * The RANK_TIERS entry earned by a result. Scans best-first and returns the
 * highest tier whose `minCompletion` the result's completion percent clears;
 * the `minCompletion: 0` catch-all always matches, so this never returns
 * undefined.
 *
 * @param {number} overPar
 * @param {number} removable - see removablePegCount()
 * @returns {typeof RANK_TIERS[number]}
 */
function getRankTier(overPar, removable) {
  const percent = getCompletionPercent(overPar, removable);
  for (let index = RANK_TIERS.length - 1; index >= 0; index--) {
    if (percent >= RANK_TIERS[index].minCompletion) return RANK_TIERS[index];
  }
  return RANK_TIERS[0];
}

/**
 * Turns a result into its rank copy. Kept here (not in a Vue component) so
 * it's easy to unit test and so every screen that needs rank text -- the
 * result modal, the archive's played-day badges -- uses the exact same
 * wording. Needs `removable` (not just overPar) now that ranks are
 * percentage-based; every caller has it from the puzzle definition (or can
 * rebuild it via daily.js's getPuzzleForNumber for a stored result).
 *
 * @param {number} overPar
 * @param {number} removable - see removablePegCount()
 * @returns {{rank: string, emoji: string}}
 */
export function getRankForOverPar(overPar, removable) {
  const tier = getRankTier(overPar, removable);
  return { rank: tier.rank, emoji: tier.emoji };
}

/**
 * The RANK_TIERS index for a result -- 0 (worst, "Warming Up") through
 * RANK_TIERS.length - 1 (best, "Genius"). Lets callers compare two results by
 * which RANK they earned rather than their raw overPar numbers, which can
 * differ within the same tier (each tier now covers a band of percentages,
 * so several different overPar values on the same puzzle can share one tier).
 *
 * @param {number} overPar
 * @param {number} removable - see removablePegCount()
 * @returns {number}
 */
export function getRankTierIndex(overPar, removable) {
  return RANK_TIERS.indexOf(getRankTier(overPar, removable));
}

/**
 * A gentle, rotating rib for the rank a result earned -- shown under the rank
 * on the result screen. Picks from the tier's `quips` by attempt count so a
 * player replaying the same puzzle cycles through the options rather than
 * seeing the same line every time; deterministic (no randomness), so it stays
 * put across a re-render or a restored round.
 *
 * @param {number} overPar
 * @param {number} removable - see removablePegCount()
 * @param {number} tries - total attempts on this puzzle (1-based; see badgeStats.js)
 * @returns {string}
 */
export function getQuipForRank(overPar, removable, tries) {
  const { quips } = getRankTier(overPar, removable);
  return quips[(Math.max(1, tries) - 1) % quips.length];
}

/**
 * How many more pegs a player would need to clear to reach a given rank
 * tier, from their current overPar -- the result screen's rank ladder shows
 * this on every tier above the one just achieved (e.g. "2 dots to go").
 * Even though tiers are keyed on percentages now, the answer is still a whole
 * number of pegs: clearing to tier threshold `t` needs
 * `overPar <= removable * (1 - t/100)`, so the most pegs you can leave and
 * still qualify is `floor(removable * (1 - t/100))`, and the gap is your
 * current overPar minus that. For the top tier (t=100) that floor is 0 (par
 * exactly); for the bottom catch-all (t=0) it's `removable`, so the gap is
 * always 0 (already reached).
 *
 * @param {number} overPar - the player's current overPar
 * @param {number} removable - see removablePegCount()
 * @param {number} tierMinCompletion - the target tier's `minCompletion`
 * @returns {number} 0 if the tier is already reached, else the positive peg distance
 */
export function getDotsToRank(overPar, removable, tierMinCompletion) {
  const maxOverParForTier = Math.floor(removable * (1 - tierMinCompletion / 100));
  return Math.max(0, overPar - maxOverParForTier);
}
