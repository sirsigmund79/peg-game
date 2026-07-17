// ============================================================================
// solver.js
// ----------------------------------------------------------------------------
// This file answers one question, as fast as possible: "starting from this
// exact board position, what's the FEWEST pegs I could ever end up with --
// broken down PER COLOR -- if I played perfectly?" Those per-color counts
// are called `par`. It also tells us the best next move to take to stay on
// track for that par -- that's the `hint`.
//
// No Vue code lives here. This is plain math/search so it's easy to test on
// its own (see scripts/check-solver.js for a real-world check against
// answers we already know are correct).
//
// HOW A BOARD POSITION IS STORED
// A board position is a `masks` array: one bigint per peg color, bit `i` of
// masks[c] is 1 if hole `i` currently has a peg of color `c`. A peg can only
// ever jump over a peg of the SAME color -- see rules.js -- so which color
// occupies a hole matters for legality, not just whether it's occupied.
// This file is deliberately self-contained (no import from rules.js, same
// as before) and duplicates the small amount of bit-twiddling it needs.
// ============================================================================

/**
 * Thrown when a solve exceeds an explicit `nodeBudget` (see createSolver
 * below). This only ever happens if a caller opts into a budget -- normal
 * gameplay never sets one, so this never affects a real player.
 */
export class SolverBudgetExceededError extends Error {}

function countBits(mask) {
  let remaining = mask;
  let total = 0;
  while (remaining > 0n) {
    if (remaining & 1n) total += 1;
    remaining >>= 1n;
  }
  return total;
}

function colorAt(masks, index) {
  const bit = 1n << BigInt(index);
  for (let color = 0; color < masks.length; color++) {
    if (masks[color] & bit) return color;
  }
  return -1;
}

/** How many colors are already down to exactly 1 peg -- used to break ties between equally-optimal lines (see findBest below). */
function countColorsAtOne(perColor) {
  return perColor.reduce((count, pegs) => count + (pegs === 1 ? 1 : 0), 0);
}

/**
 * Builds a solver for one specific board shape. You pass in the board's
 * list of legal jump triples (from geometry.js) and its hole count (needed
 * to pack a multi-color position into a single memo key), and you get back
 * a `findBest` function you can call over and over with different starting
 * positions -- answers are memoized (remembered) so repeated calls for the
 * same or overlapping positions are fast.
 *
 * @param {{from:number, over:number, to:number}[]} moveList - every jump
 *   this board shape allows, from geometry.js
 * @param {number} cellCount - how many holes this board has
 * @param {{nodeBudget?: number, onStateExpanded?: (masks: bigint[], legalMoves: object[], key: bigint, parentKey: bigint|null) => void}} [options] -
 *   `nodeBudget` is an optional safety valve, used only by the offline
 *   pool-generator script (scripts/generate-puzzle-pool.js) to skip a
 *   handful of pathologically slow candidates on big, densely connected
 *   boards instead of running (near) forever. `onStateExpanded` is an
 *   optional instrumentation hook, used by the offline difficulty analysis
 *   (scripts/analyze-puzzle-difficulty.js via puzzleDag.js) and the dev-only
 *   search-tree visualization (workers/searchTreeExplorerWorker.js) to
 *   observe every distinct position this solve visits without paying for a
 *   second traversal -- it fires once per distinct state, the first time
 *   `findBest` expands it (never on a cache hit), with that state's own memo
 *   key and the memo key of whichever call site first reached it (null at
 *   the root) -- a real edge in the actual search. Leave both unset for
 *   normal gameplay -- there is no limit and no instrumentation by default.
 * @returns {{ findBest: (masks: bigint[]) => {minPegs: number, perColor: number[], move: object|null}, getNodesVisited: () => number }}
 */
export function createSolver(moveList, cellCount, options = {}) {
  const nodeBudget = options.nodeBudget ?? Infinity;
  const onStateExpanded = options.onStateExpanded;
  let nodesVisited = 0;
  const cellCountBig = BigInt(cellCount);

  // The memo remembers "for this exact board position, here's the best
  // outcome we already worked out". Every color's mask gets packed into
  // ONE combined bigint key (color c's bits shifted up by c*cellCount
  // places) so the existing single-Map memoization pattern barely changes.
  const memo = new Map();

  function encodeKey(masks) {
    let key = 0n;
    for (let color = 0; color < masks.length; color++) {
      key |= masks[color] << (BigInt(color) * cellCountBig);
    }
    return key;
  }

  /**
   * Recursively searches every possible sequence of jumps from `masks`
   * onward, and returns the best (lowest total peg-count) result
   * reachable, its per-color breakdown, plus the first move to make to
   * head down that path.
   *
   * @param {bigint[]} masks - current board position, one mask per color
   * @param {bigint|null} [parentKey] - INTERNAL: the memo key of whichever
   *   state's recursive call led here, or null at the root. Every external
   *   caller calls findBest(masks) with just one argument (parentKey
   *   defaults to null) -- this is only ever threaded by findBest calling
   *   itself, purely so onStateExpanded (below) can report a real
   *   parent-child edge, not just an isolated state.
   * @returns {{minPegs: number, perColor: number[], move: {from:number, over:number, to:number}|null}}
   */
  function findBest(masks, parentKey = null) {
    const key = encodeKey(masks);
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    nodesVisited += 1;
    if (nodesVisited > nodeBudget) {
      throw new SolverBudgetExceededError(`Exceeded node budget of ${nodeBudget}`);
    }

    // Instrumentation only -- computed fresh (not from the scoring loop
    // below, which may stop early once it proves the theoretical floor) so
    // callers always see the COMPLETE legal-move list for this state, not
    // just whatever the early-exit scoring loop happened to look at. `key`
    // and `parentKey` are this state's own memo key and the memo key of the
    // ONE real call site that first reached it -- a genuine edge in the
    // actual search, not a fabricated one (see workers/searchTreeExplorerWorker.js).
    if (onStateExpanded) {
      const occupiedForCheck = masks.reduce((acc, mask) => acc | mask, 0n);
      const legalMoves = moveList.filter((move) => {
        const fromColor = colorAt(masks, move.from);
        if (fromColor === -1) return false;
        if (colorAt(masks, move.over) !== fromColor) return false;
        return !(occupiedForCheck & (1n << BigInt(move.to)));
      });
      onStateExpanded(masks, legalMoves, key, parentKey);
    }

    const colorCount = masks.length;

    // If we make no more jumps at all, this is how many pegs we'd be left
    // with (per color) -- our starting point for "best so far".
    let bestPerColor = masks.map(countBits);
    let bestPegs = bestPerColor.reduce((sum, count) => sum + count, 0);
    let bestMove = null;

    for (const move of moveList) {
      const fromColor = colorAt(masks, move.from);
      if (fromColor === -1) continue;
      if (colorAt(masks, move.over) !== fromColor) continue;

      const fromBit = 1n << BigInt(move.from);
      const overBit = 1n << BigInt(move.over);
      const toBit = 1n << BigInt(move.to);

      const occupied = masks.reduce((acc, mask) => acc | mask, 0n);
      if (occupied & toBit) continue; // landing hole must be empty

      // Making the jump removes the "from" and "over" pegs (both the same
      // color as the jumping peg) and adds a peg at "to", of that color.
      const nextMasks = [...masks];
      nextMasks[fromColor] = (masks[fromColor] & ~fromBit & ~overBit) | toBit;

      const result = findBest(nextMasks, key);

      // Prefer a strictly lower total, and among ties for the lowest total
      // prefer whichever line leaves more colors down at exactly 1 peg --
      // purely a tie-break (it can never change `minPegs`/par), but it
      // means a puzzle that CAN get some color to 1 is more likely to
      // actually report that in its `par`/hint instead of an equally-
      // optimal line that happens not to.
      const better =
        result.minPegs < bestPegs ||
        (result.minPegs === bestPegs && countColorsAtOne(result.perColor) > countColorsAtOne(bestPerColor));
      if (better) {
        bestPegs = result.minPegs;
        bestPerColor = result.perColor;
        bestMove = move;
      }

      // NOTE: a jump only ever removes a peg of its own color, and the
      // last peg of a color can never be jumped away (there's nothing left
      // to jump it over) -- so no color can ever be reduced below 1 once
      // it starts with at least 1 peg. That makes `colorCount` the true
      // floor for the total across every color that started non-empty.
      // Once we find a path that reaches it, there's no point checking the
      // rest of the moves -- stop early to keep this fast.
      if (bestPegs === colorCount) {
        break;
      }
    }

    const answer = { minPegs: bestPegs, perColor: bestPerColor, move: bestMove };
    memo.set(key, answer);
    return answer;
  }

  // Exposes the DFS's cache-miss count -- i.e. how many distinct board
  // positions this solver actually had to expand to reach its answer(s) so
  // far. Used offline by scripts/analyze-puzzle-difficulty.js as a "search
  // effort" difficulty signal; normal gameplay callers just ignore it.
  function getNodesVisited() {
    return nodesVisited;
  }

  return { findBest, getNodesVisited };
}
