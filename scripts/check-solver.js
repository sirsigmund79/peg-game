// ============================================================================
// scripts/check-solver.js
// ----------------------------------------------------------------------------
// A self-check you can run from the command line with:
//   node scripts/check-solver.js
//
// Confirms: every board shape can actually be solved to 1 peg, the English
// cross's precomputed solution really plays out, a random sample of the
// generated puzzle pool re-verifies correctly, and -- the big one -- that
// the daily puzzle sequence never repeats a pool entry until the entire
// pool has been used once.
//
// This is NOT part of the app bundle -- it's a standalone developer tool,
// which is why it lives in /scripts instead of /src.
// ============================================================================

import { BOARD_CATALOG, ENGLISH_CROSS_GEOMETRY, ENGLISH_CROSS_EMPTY_HOLES, ENGLISH_CROSS_PRECOMPUTED } from '../src/logic/boards.js';
import { PUZZLE_POOL } from '../src/logic/puzzlePool.js';
import { createSolver } from '../src/logic/solver.js';
import { createStartingMask, applyMove, isLegalMove, countPegsRemaining } from '../src/logic/rules.js';
import { getPuzzleForNumber, describePoolCoverage } from '../src/logic/daily.js';

let allPassed = true;

// --- Check 1: every board shape has at least one verified pool entry -------
// NOTE: we deliberately do NOT re-derive this by solving single-hole starts
// live here -- some shapes (like the 19-hole hexagon) have NO single-hole
// start that reaches 1 peg, only multi-hole ones, and re-solving without a
// node budget risks the same runaway search that scripts/generate-puzzle-
// pool.js works around. The pool itself is the source of truth -- every
// entry in it was already solver-verified (with a budget) when it was
// generated, so we just confirm each shape actually contributed at least
// one entry.
console.log("Check 1: every board shape contributed at least one verified pool entry");
for (const board of Object.values(BOARD_CATALOG)) {
  const countForShape = PUZZLE_POOL.filter((entry) => entry.boardId === board.id).length;
  const status = countForShape > 0 ? 'OK' : 'FAILED';
  if (countForShape === 0) allPassed = false;
  console.log(`  ${board.id} (${board.geometry.cellCount} holes) -> ${countForShape} verified pool entries  [${status}]`);
}
console.log('');

// --- Check 2: a random sample of the pool re-verifies correctly -------------
console.log('Check 2: spot-checking 40 random pool entries against a fresh solve');
let sampleFailures = 0;
const sampleSize = Math.min(40, PUZZLE_POOL.length);
for (let i = 0; i < sampleSize; i++) {
  const index = Math.floor((i / sampleSize) * PUZZLE_POOL.length);
  const entry = PUZZLE_POOL[index];
  const board = BOARD_CATALOG[entry.boardId];
  const solver = createSolver(board.geometry.moves);
  const mask = createStartingMask(board.geometry.cellCount, entry.emptyHoles);
  const result = solver.findBest(mask);
  if (result.minPegs !== entry.par) {
    console.log(`  FAILED: pool entry ${JSON.stringify(entry)} claims par ${entry.par} but solver found ${result.minPegs}`);
    sampleFailures++;
  }
}
const sampleOk = sampleFailures === 0;
if (!sampleOk) allPassed = false;
console.log(`  -> ${sampleOk ? 'PASSED' : 'FAILED'}: ${sampleSize - sampleFailures}/${sampleSize} sampled entries match\n`);

// --- Check 3: English cross precomputed solution actually plays out ---------
console.log('Check 3: English cross precomputed solution replays correctly');
let crossMask = createStartingMask(ENGLISH_CROSS_GEOMETRY.cellCount, ENGLISH_CROSS_EMPTY_HOLES);
let crossReplayOk = true;
for (const move of ENGLISH_CROSS_PRECOMPUTED.solutionMoves) {
  if (!isLegalMove(crossMask, move)) {
    console.log(`  FAILED: move ${JSON.stringify(move)} is not legal at this point`);
    crossReplayOk = false;
    break;
  }
  crossMask = applyMove(crossMask, move);
}
const crossFinalPegs = countPegsRemaining(crossMask);
const crossPassed = crossReplayOk && crossFinalPegs === ENGLISH_CROSS_PRECOMPUTED.par;
if (!crossPassed) allPassed = false;
console.log(`  replayed ${ENGLISH_CROSS_PRECOMPUTED.solutionMoves.length} moves -> ${crossFinalPegs} peg(s) left (expected ${ENGLISH_CROSS_PRECOMPUTED.par})  [${crossPassed ? 'OK' : 'FAILED'}]\n`);

// --- Check 4: every daily puzzle in the pool's full cycle is par 1 ----------
console.log(`Check 4: every daily puzzle across the full pool cycle (${PUZZLE_POOL.length} days) is par 1`);
let dailyPuzzlesPassed = true;
const boardMixCounts = {};
for (let puzzleNumber = 0; puzzleNumber < PUZZLE_POOL.length; puzzleNumber++) {
  const puzzle = getPuzzleForNumber(puzzleNumber);
  boardMixCounts[puzzle.boardId] = (boardMixCounts[puzzle.boardId] || 0) + 1;
  if (puzzle.par !== 1) {
    console.log(`  FAILED: puzzle #${puzzleNumber} (${puzzle.date}, ${puzzle.boardId}) has par ${puzzle.par}`);
    dailyPuzzlesPassed = false;
  }
}
if (!dailyPuzzlesPassed) allPassed = false;
console.log(`  board mix: ${JSON.stringify(boardMixCounts)}`);
console.log(`  -> ${dailyPuzzlesPassed ? 'PASSED' : 'FAILED'}\n`);

// --- Check 5: no two days in that same cycle show the same puzzle -----------
// This is the actual proof behind the "never repeats" claim: every one of
// the pool's entries should be used EXACTLY once across a full cycle.
console.log('Check 5: no puzzle repeats within one full cycle of the pool');
const seenPuzzleKeys = new Set();
let duplicateFound = false;
for (let puzzleNumber = 0; puzzleNumber < PUZZLE_POOL.length; puzzleNumber++) {
  const puzzle = getPuzzleForNumber(puzzleNumber);
  const key = `${puzzle.boardId}:${puzzle.emptyHoles.join(',')}`;
  if (seenPuzzleKeys.has(key)) {
    console.log(`  FAILED: puzzle #${puzzleNumber} repeats an earlier puzzle (${key})`);
    duplicateFound = true;
  }
  seenPuzzleKeys.add(key);
}
const noDuplicates = !duplicateFound && seenPuzzleKeys.size === PUZZLE_POOL.length;
if (!noDuplicates) allPassed = false;
const coverage = describePoolCoverage();
console.log(`  -> ${noDuplicates ? 'PASSED' : 'FAILED'}: ${seenPuzzleKeys.size} unique puzzles across ${coverage.days} days (~${coverage.years} years) before any repeat\n`);

console.log(allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(allPassed ? 0 : 1);
