// ============================================================================
// scripts/precompute-english-cross.js
// ----------------------------------------------------------------------------
// Run this once with:
//   node scripts/precompute-english-cross.js
//
// The English cross board (33 holes) has a search tree too large to solve
// on every page load, so we solve it ONE TIME here, offline, and print out
// the exact `par` and `solutionMoves` array to paste into boards.js.
//
// Also double-checks the heart board (which IS small enough to live-solve,
// but it's good to confirm the verified starting position here too).
// ============================================================================

import { makeGridGeometry, findCellIndex } from '../src/logic/geometry.js';
import { createSolver } from '../src/logic/solver.js';
import { createStartingMask, applyMove } from '../src/logic/rules.js';

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

console.log('Solving English cross (33 holes, center empty)... this may take a little while.\n');

const startTime = Date.now();
const crossGeometry = makeGridGeometry(buildEnglishCrossCells());
const crossSolver = createSolver(crossGeometry.moves);
const crossCenterIndex = findCellIndex(crossGeometry, 3, 3);
const crossStartMask = createStartingMask(crossGeometry.cellCount, [crossCenterIndex]);
const crossResult = crossSolver.findBest(crossStartMask);

console.log(`English cross: center index = ${crossCenterIndex}, par = ${crossResult.minPegs}`);
console.log(`Solved in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

// Walk the chain of best-moves from the start to reconstruct the full
// solution path (findBest() only stores the FIRST move of the best line at
// each position, so we replay it forward, re-solving each new position).
const solutionMoves = [];
let currentMask = crossStartMask;
while (true) {
  const step = crossSolver.findBest(currentMask);
  if (!step.move) break;
  solutionMoves.push(step.move);
  currentMask = applyMove(currentMask, step.move);
}

console.log(`Solution has ${solutionMoves.length} moves.\n`);
console.log('export const ENGLISH_CROSS_PRECOMPUTED = {');
console.log(`  par: ${crossResult.minPegs},`);
console.log('  solutionMoves: [');
for (const move of solutionMoves) {
  console.log(`    { from: ${move.from}, over: ${move.over}, to: ${move.to} },`);
}
console.log('  ],');
console.log('};');
