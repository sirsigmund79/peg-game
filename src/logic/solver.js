// ============================================================================
// solver.js
// ----------------------------------------------------------------------------
// This file answers one question, as fast as possible: "starting from this
// exact board position, what's the FEWEST pegs I could ever end up with if I
// played perfectly?" That number is called `par`. It also tells us the best
// next move to take to stay on track for that par -- that's the `hint`.
//
// No Vue code lives here. This is plain math/search so it's easy to test on
// its own (see the bottom of daily.js or scripts/check-solver.js for a
// real-world check against the answers we already know are correct).
//
// HOW A BOARD POSITION IS STORED
// A board position is a "mask": one big number where bit `i` is 1 if hole
// `i` currently has a peg in it, and 0 if it's empty. We use BigInt (not a
// normal number) so this works correctly even for the 33-hole English cross
// board, which has more bits than a normal 32-bit integer can safely hold
// with bitwise operators.
// ============================================================================

/**
 * Counts how many 1-bits (pegs) are set in a mask.
 *
 * @param {bigint} mask
 * @returns {number} how many pegs are on the board
 */
export function countPegs(mask) {
  let remaining = mask;
  let total = 0;
  while (remaining > 0n) {
    // The lowest bit tells us if there's a peg in the "next" hole we're
    // checking; then we shift it off and check the next one.
    if (remaining & 1n) {
      total += 1;
    }
    remaining >>= 1n;
  }
  return total;
}

/**
 * Thrown when a solve exceeds an explicit `nodeBudget` (see createSolver
 * below). This only ever happens if a caller opts into a budget -- normal
 * gameplay never sets one, so this never affects a real player.
 */
export class SolverBudgetExceededError extends Error {}

/**
 * Builds a solver for one specific board shape. You pass in the board's
 * list of legal jump triples (from geometry.js), and you get back a
 * `findBest` function you can call over and over with different starting
 * positions -- answers are memoized (remembered) so repeated calls for the
 * same or overlapping positions are fast.
 *
 * @param {{from:number, over:number, to:number}[]} moveList - every jump
 *   this board shape allows, from geometry.js
 * @param {{nodeBudget?: number}} [options] - optional safety valve, used
 *   only by the offline pool-generator script (scripts/generate-puzzle-pool.js)
 *   to skip a handful of pathologically slow candidates on big, densely
 *   connected boards instead of running (near) forever. Leave unset for
 *   normal gameplay -- there is no limit by default.
 * @returns {{ findBest: (mask: bigint) => {minPegs: number, move: object|null} }}
 */
export function createSolver(moveList, options = {}) {
  const nodeBudget = options.nodeBudget ?? Infinity;
  let nodesVisited = 0;

  // The memo remembers "for this exact board position, here's the best
  // outcome we already worked out". BigInt keys work fine in a Map.
  const memo = new Map();

  /**
   * Recursively searches every possible sequence of jumps from `mask`
   * onward, and returns the best (lowest peg-count) result reachable, plus
   * the first move to make to head down that path.
   *
   * @param {bigint} mask - current board position
   * @returns {{minPegs: number, move: {from:number, over:number, to:number}|null}}
   */
  function findBest(mask) {
    const cached = memo.get(mask);
    if (cached !== undefined) {
      return cached;
    }

    nodesVisited += 1;
    if (nodesVisited > nodeBudget) {
      throw new SolverBudgetExceededError(`Exceeded node budget of ${nodeBudget}`);
    }

    // If we make no more jumps at all, this is how many pegs we'd be left
    // with -- our starting point for "best so far".
    let bestPegs = countPegs(mask);
    let bestMove = null;

    for (const move of moveList) {
      const fromBit = 1n << BigInt(move.from);
      const overBit = 1n << BigInt(move.over);
      const toBit = 1n << BigInt(move.to);

      const fromHasPeg = (mask & fromBit) !== 0n;
      const overHasPeg = (mask & overBit) !== 0n;
      const toIsEmpty = (mask & toBit) === 0n;

      // A jump is only legal if the peg exists, the peg it's jumping is
      // there too, and the landing hole is empty.
      if (fromHasPeg && overHasPeg && toIsEmpty) {
        // Making the jump removes the "from" and "over" pegs, and adds a
        // peg at "to".
        const nextMask = (mask & ~fromBit & ~overBit) | toBit;
        const result = findBest(nextMask);

        if (result.minPegs < bestPegs) {
          bestPegs = result.minPegs;
          bestMove = move;
        }

        // NOTE: a board can never end with zero pegs (the last jump always
        // leaves the landing peg behind), so 1 is the best any board can
        // ever do. Once we find a path that reaches 1, there's no point
        // checking the rest of the moves -- stop early to keep this fast.
        if (bestPegs === 1) {
          break;
        }
      }
    }

    const answer = { minPegs: bestPegs, move: bestMove };
    memo.set(mask, answer);
    return answer;
  }

  return { findBest };
}
