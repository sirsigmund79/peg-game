// ============================================================================
// fx/watchSolve.js
// ----------------------------------------------------------------------------
// Shared "auto-play the best solution" logic, used by both the level
// editor's Watch Solve button and the temporary Watch Solve button in the
// main game. Kept in one place so both features stay in sync and there's
// only one animation to tune.
//
// This is "juice" (a visual demonstration), not a game rule -- it works by
// planning the whole move sequence up front with the solver, then actually
// playing it out through the SAME public functions a real player uses
// (game.selectHole), just with a short delay between taps.
// ============================================================================

import { createSolver } from '../logic/solver.js';
import { applyMove } from '../logic/rules.js';

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Runs the solver on a board position and reports the best possible
 * outcome ("Calculate Max"), without touching the actual game state.
 *
 * @param {{moves: {from:number, over:number, to:number}[], cellCount: number}} geometry
 * @param {bigint[]} masks
 * @returns {{minPegs: number, perColor: number[], move: object|null}}
 */
export function calculateBestOutcome(geometry, masks) {
  const solver = createSolver(geometry.moves, geometry.cellCount);
  return solver.findBest(masks);
}

/**
 * Plans the full best-possible sequence of jumps from a starting position,
 * without applying any of them to the real game -- just returns the list
 * of moves.
 *
 * @param {{moves: object[], cellCount: number}} geometry
 * @param {bigint[]} startingMasks
 * @returns {{from:number, over:number, to:number}[]}
 */
export function planFullSolution(geometry, startingMasks) {
  const solver = createSolver(geometry.moves, geometry.cellCount);
  const moves = [];
  let masks = startingMasks;
  while (true) {
    const best = solver.findBest(masks);
    if (!best.move) break;
    moves.push(best.move);
    masks = applyMove(masks, best.move);
  }
  return moves;
}

/**
 * Plans the best solution from `game`'s CURRENT position, then plays it
 * out for real, one jump at a time, by calling game.selectHole() the same
 * way a real tap would -- so undo, haptics, and win detection all work
 * exactly like they would for a human player.
 *
 * @param {object} game - a useGame() instance
 * @param {number} [delayBetweenMovesMs]
 * @returns {Promise<void>} resolves once every move has been played
 */
export async function watchSolve(game, delayBetweenMovesMs = 500) {
  const moves = planFullSolution(game.geometry, game.state.masks);

  // Wait a tick before the first selection. The click that calls this
  // (components/TemporaryWatchSolveButton.vue / the level editor's own
  // button) is still bubbling up through the DOM at this point -- Vue's own
  // click handler runs during the target phase, before the browser finishes
  // propagating the event to `document`. components/Board.vue listens there
  // for "clicked outside any hole" to clear the selection (see its
  // handleNonHoleClick), and without this wait, that same original click
  // would reach `document` immediately AFTER the line below selects the
  // first peg -- synchronously deselecting it again before the second
  // selectHole() call ever runs. Every move after that then gets played
  // against a board that never actually changed, which is why this failed
  // silently rather than throwing: each subsequent "from" often still had
  // SOME legal move available (just never the planned one), so it kept
  // selecting pegs without ever completing a jump.
  await wait(0);

  for (const move of moves) {
    game.selectHole(move.from);
    await wait(delayBetweenMovesMs / 3);
    game.selectHole(move.to);
    await wait(delayBetweenMovesMs);
  }
}
