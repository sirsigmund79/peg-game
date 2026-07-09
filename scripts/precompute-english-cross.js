// ============================================================================
// scripts/precompute-english-cross.js
// ----------------------------------------------------------------------------
// Run this once with:
//   node scripts/precompute-english-cross.js
//
// The English cross board (33 holes) has a search tree too large to solve
// on every page load, so we solve it ONE TIME here, offline, and print out
// the exact `holeColors`, `par`, and `solutionMoves` to paste into
// boards.js. The board always starts with just the center hole empty; the
// 32 occupied holes get split into 4 spatially-clustered colors (see
// pegColors.js's getColorCountForCellCount(33)/assignHoleColors) with a
// fixed seed, so rerunning this script always reproduces the exact same
// puzzle.
//
// A 4-color board this size is too big even for an OFFLINE exhaustive
// solve -- tracking "which color occupies which hole" multiplies the
// number of distinct reachable positions far past what fits in memory (a
// plain JS Map has a hard ~16.7M-key ceiling, and this board blows past it
// well before finishing). So we first try a bounded exhaustive solve (fast
// and exact if it fits); if it doesn't, we fall back to many random
// greedy playthroughs and keep the best one. That's not provably optimal
// for this one board, but it's the same "bound the compute, accept what's
// tractable" trade-off this codebase already makes elsewhere (see
// solver.js's nodeBudget, used by scripts/generate-puzzle-pool.js).
// ============================================================================

import { makeGridGeometry, findCellIndex } from '../src/logic/geometry.js';
import { createSolver, SolverBudgetExceededError } from '../src/logic/solver.js';
import { createStartingMasks, applyMove, findLegalMoves, countPegsRemaining } from '../src/logic/rules.js';
import { getColorCountForCellCount, assignHoleColors } from '../src/logic/pegColors.js';

// A tiny deterministic random number generator, matching the one in
// scripts/generate-puzzle-pool.js, so this one-off candidate's color split
// (and, if needed, its greedy-rollout fallback) is reproducible across
// reruns.
function makeSeededRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildEnglishCrossCells() {
  const cells = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const isRemovedCorner = (x < 2 || x > 4) && (y < 2 || y > 4);
      if (!isRemovedCorner) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

/** Plays one full round, picking a uniformly random legal move each turn until none remain. */
function playRandomRollout(moveList, startingMasks, rng) {
  let masks = startingMasks;
  const moves = [];
  while (true) {
    const legal = findLegalMoves(masks, moveList);
    if (legal.length === 0) break;
    const move = legal[Math.floor(rng() * legal.length)];
    masks = applyMove(masks, move);
    moves.push(move);
  }
  const perColor = countPegsRemaining(masks);
  const minPegs = perColor.reduce((sum, count) => sum + count, 0);
  return { minPegs, perColor, moves };
}

const ROLLOUT_ATTEMPTS = 4000;
const BOUNDED_NODE_BUDGET = 500000;

console.log('Solving English cross (33 holes, center empty)... this may take a little while.\n');

const startTime = Date.now();
const crossGeometry = makeGridGeometry(buildEnglishCrossCells());
const crossCenterIndex = findCellIndex(crossGeometry, 3, 3);
const colorCount = getColorCountForCellCount(crossGeometry.cellCount);
const rng = makeSeededRng(0x45585858); // "EXXX" -- fixed seed, just for reproducibility
const holeColors = assignHoleColors(crossGeometry, [crossCenterIndex], colorCount, rng);
const crossStartMasks = createStartingMasks(crossGeometry.cellCount, holeColors, colorCount);

let solutionMoves;
let bestPerColor;
let method;

try {
  const crossSolver = createSolver(crossGeometry.moves, crossGeometry.cellCount, { nodeBudget: BOUNDED_NODE_BUDGET });
  const crossResult = crossSolver.findBest(crossStartMasks);

  // Walk the chain of best-moves from the start to reconstruct the full
  // solution path (findBest() only stores the FIRST move of the best line
  // at each position, so we replay it forward, re-solving each new
  // position -- cheap, since everything along this path is now memoized).
  solutionMoves = [];
  let currentMasks = crossStartMasks;
  while (true) {
    const step = crossSolver.findBest(currentMasks);
    if (!step.move) break;
    solutionMoves.push(step.move);
    currentMasks = applyMove(currentMasks, step.move);
  }
  bestPerColor = crossResult.perColor;
  method = 'exhaustive';
} catch (error) {
  if (!(error instanceof SolverBudgetExceededError)) throw error;

  console.log(`Exhaustive solve exceeded ${BOUNDED_NODE_BUDGET} nodes -- falling back to ${ROLLOUT_ATTEMPTS} random rollouts.\n`);
  let best = null;
  for (let attempt = 0; attempt < ROLLOUT_ATTEMPTS; attempt++) {
    const rollout = playRandomRollout(crossGeometry.moves, crossStartMasks, rng);
    if (!best || rollout.minPegs < best.minPegs) best = rollout;
  }
  solutionMoves = best.moves;
  bestPerColor = best.perColor;
  method = `best of ${ROLLOUT_ATTEMPTS} random rollouts`;
}

console.log(`English cross: center index = ${crossCenterIndex}, colors = ${colorCount}, par = [${bestPerColor.join(', ')}] (${method})`);
console.log(`Solved in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
console.log(`Solution has ${solutionMoves.length} moves.\n`);
console.log(`export const ENGLISH_CROSS_HOLE_COLORS = [\n  ${holeColors.join(', ')},\n];\n`);
console.log('export const ENGLISH_CROSS_PRECOMPUTED = {');
console.log(`  par: [${bestPerColor.join(', ')}],`);
console.log('  solutionMoves: [');
for (const move of solutionMoves) {
  console.log(`    { from: ${move.from}, over: ${move.over}, to: ${move.to} },`);
}
console.log('  ],');
console.log('};');
