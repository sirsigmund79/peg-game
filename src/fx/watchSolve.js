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

  for (const move of moves) {
    game.selectHole(move.from);
    await wait(delayBetweenMovesMs / 3);
    game.selectHole(move.to);
    await wait(delayBetweenMovesMs);
  }
}
