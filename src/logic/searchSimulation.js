// ============================================================================
// searchSimulation.js
// ----------------------------------------------------------------------------
// A single lightweight breadth/depth sample at one board position -- used by
// components/BreadthDepthThumbnails.vue (dev-only) to show how many legal
// moves were available and how many pegs were left at each move made so
// far. Real numbers from the actual position, just not a tree/search of any
// kind -- for that, see workers/searchTreeExplorerWorker.js, which
// instruments the REAL solver (logic/solver.js) instead.
//
// No Vue code lives here -- plain math, same convention as solver.js.
// ============================================================================

import { findLegalMoves, countPegsRemaining } from './rules.js';

/**
 * @param {{moves:object[]}} geometry
 * @param {bigint[]} masks
 * @returns {{branching:number, pegsRemaining:number}}
 */
export function sampleBreadthDepth(geometry, masks) {
  return {
    branching: findLegalMoves(masks, geometry.moves).length,
    pegsRemaining: countPegsRemaining(masks).reduce((sum, count) => sum + count, 0),
  };
}
