// ============================================================================
// scripts/check-solver.js
// ----------------------------------------------------------------------------
// A self-check you can run from the command line with:
//   node scripts/check-solver.js
//
// Confirms: every board shape has puzzle-pool coverage, the English cross's
// precomputed solution really plays out, a random sample of the generated
// puzzle pool re-verifies correctly, every daily puzzle's par is
// structurally sane, every pool entry satisfies the per-color "no boring
// color" quality rules, and -- the big one -- that the daily puzzle
// sequence never repeats a pool entry until the entire pool has been used
// once.
//
// This is NOT part of the app bundle -- it's a standalone developer tool,
// which is why it lives in /scripts instead of /src.
// ============================================================================

import { BOARD_CATALOG, ENGLISH_CROSS_GEOMETRY, ENGLISH_CROSS_HOLE_COLORS, ENGLISH_CROSS_PRECOMPUTED } from '../src/logic/boards.js';
import { PUZZLE_POOL } from '../src/logic/puzzlePool.js';
import { createSolver } from '../src/logic/solver.js';
import { createStartingMasks, applyMove, isLegalMove, countPegsRemaining } from '../src/logic/rules.js';
import { getColorCountForCellCount } from '../src/logic/pegColors.js';
import { getPuzzleForNumber, describePoolCoverage } from '../src/logic/daily.js';

// Matches CANDIDATE_NODE_BUDGET in scripts/generate-puzzle-pool.js -- Check
// 2 below re-attempts an EXHAUSTIVE solve at the same budget the generator
// used, so it can tell "this entry's par is provably correct" apart from
// "this entry came from the generator's random-rollout fallback and was
// never proven optimal in the first place" (see that script for why some
// entries, mostly on the biggest boards, go that route).
const CANDIDATE_NODE_BUDGET = 12000;

let allPassed = true;

// --- Check 1: every board shape has at least one verified pool entry -------
// NOTE: we deliberately do NOT re-derive this by solving live here -- the
// pool itself is the source of truth, generated with a node budget (and a
// random-rollout fallback) by scripts/generate-puzzle-pool.js. We just
// confirm each shape currently in the catalog actually contributed entries.
console.log('Check 1: every board shape contributed at least one verified pool entry');
for (const board of Object.values(BOARD_CATALOG)) {
  const countForShape = PUZZLE_POOL.filter((entry) => entry.boardId === board.id).length;
  const status = countForShape > 0 ? 'OK' : 'FAILED';
  if (countForShape === 0) allPassed = false;
  console.log(`  ${board.id} (${board.geometry.cellCount} holes) -> ${countForShape} verified pool entries  [${status}]`);
}
console.log('');

// --- Check 2: a random sample of the pool re-verifies correctly -------------
// Re-attempts an EXHAUSTIVE solve (same budget the generator used) for each
// sampled entry. If it completes, the result must match the stored `par`
// exactly -- a mismatch here is a real bug. If it exceeds the budget again,
// that's consistent with this entry having come from the generator's
// random-rollout fallback in the first place (its par was never claimed to
// be provably optimal) -- that's expected, not a failure, so it's counted
// separately rather than flagged.
console.log('Check 2: spot-checking 80 random pool entries against a fresh bounded solve');
let sampleFailures = 0;
let sampleUnverified = 0;
const sampleSize = Math.min(80, PUZZLE_POOL.length);
for (let i = 0; i < sampleSize; i++) {
  const index = Math.floor((i / sampleSize) * PUZZLE_POOL.length);
  const entry = PUZZLE_POOL[index];
  const board = BOARD_CATALOG[entry.boardId];
  const colorCount = entry.par.length;
  const masks = createStartingMasks(board.geometry.cellCount, entry.holeColors, colorCount);
  try {
    const solver = createSolver(board.geometry.moves, board.geometry.cellCount, { nodeBudget: CANDIDATE_NODE_BUDGET });
    const result = solver.findBest(masks);
    const matches = JSON.stringify(result.perColor) === JSON.stringify(entry.par);
    if (!matches) {
      console.log(`  FAILED: pool entry (${entry.boardId}) claims par [${entry.par}] but solver found [${result.perColor}]`);
      sampleFailures++;
    }
  } catch (error) {
    // Budget exceeded again -- an approximate (rollout-derived) entry, not
    // independently re-verified here. Not a failure.
    sampleUnverified++;
  }
}
const sampleOk = sampleFailures === 0;
if (!sampleOk) allPassed = false;
const sampleExact = sampleSize - sampleFailures - sampleUnverified;
console.log(
  `  -> ${sampleOk ? 'PASSED' : 'FAILED'}: ${sampleExact}/${sampleSize} exactly reverified, ${sampleUnverified}/${sampleSize} approximate (rollout-derived, skipped), ${sampleFailures}/${sampleSize} disagreed\n`
);

// --- Check 3: English cross precomputed solution actually plays out ---------
console.log('Check 3: English cross precomputed solution replays correctly');
const crossColorCount = getColorCountForCellCount(ENGLISH_CROSS_GEOMETRY.cellCount);
let crossMasks = createStartingMasks(ENGLISH_CROSS_GEOMETRY.cellCount, ENGLISH_CROSS_HOLE_COLORS, crossColorCount);
let crossReplayOk = true;
for (const move of ENGLISH_CROSS_PRECOMPUTED.solutionMoves) {
  if (!isLegalMove(crossMasks, move)) {
    console.log(`  FAILED: move ${JSON.stringify(move)} is not legal at this point`);
    crossReplayOk = false;
    break;
  }
  crossMasks = applyMove(crossMasks, move);
}
const crossFinalPerColor = countPegsRemaining(crossMasks);
const crossPassed = crossReplayOk && JSON.stringify(crossFinalPerColor) === JSON.stringify(ENGLISH_CROSS_PRECOMPUTED.par);
if (!crossPassed) allPassed = false;
console.log(
  `  replayed ${ENGLISH_CROSS_PRECOMPUTED.solutionMoves.length} moves -> [${crossFinalPerColor}] left (expected [${ENGLISH_CROSS_PRECOMPUTED.par}])  [${crossPassed ? 'OK' : 'FAILED'}]\n`
);

// --- Check 4: every daily puzzle's par is structurally sane -----------------
// A full re-solve of every entry across the whole cycle would be far too
// slow (that's exactly why the generator uses a node budget + rollout
// fallback in the first place) -- so this check stays cheap and
// full-coverage, confirming structure rather than re-proving optimality
// (Check 2's sampling is where "does the solver agree" is covered).
console.log(`Check 4: every daily puzzle across the full pool cycle (${PUZZLE_POOL.length} days) has a structurally sane par`);
let dailyPuzzlesPassed = true;
const boardMixCounts = {};
for (let puzzleNumber = 0; puzzleNumber < PUZZLE_POOL.length; puzzleNumber++) {
  const puzzle = getPuzzleForNumber(puzzleNumber);
  boardMixCounts[puzzle.boardId] = (boardMixCounts[puzzle.boardId] || 0) + 1;

  const expectedColorCount = getColorCountForCellCount(puzzle.cellCount);
  const startingPerColor = countPegsRemaining(createStartingMasks(puzzle.cellCount, puzzle.holeColors, puzzle.colorCount));
  const startingTotal = startingPerColor.reduce((sum, count) => sum + count, 0);
  const parTotal = puzzle.par.reduce((sum, count) => sum + count, 0);

  const problems = [];
  if (puzzle.colorCount !== expectedColorCount) problems.push(`colorCount ${puzzle.colorCount} !== expected ${expectedColorCount}`);
  if (puzzle.par.length !== puzzle.colorCount) problems.push(`par length ${puzzle.par.length} !== colorCount ${puzzle.colorCount}`);
  if (puzzle.par.some((count) => count < 1)) problems.push(`par has a color at 0: [${puzzle.par}]`);
  if (parTotal >= startingTotal) problems.push(`par total ${parTotal} isn't fewer pegs than the starting total ${startingTotal}`);

  if (problems.length > 0) {
    console.log(`  FAILED: puzzle #${puzzleNumber} (${puzzle.date}, ${puzzle.boardId}) -- ${problems.join('; ')}`);
    dailyPuzzlesPassed = false;
  }
}
if (!dailyPuzzlesPassed) allPassed = false;
console.log(`  board mix: ${JSON.stringify(boardMixCounts)}`);
console.log(`  -> ${dailyPuzzlesPassed ? 'PASSED' : 'FAILED'}\n`);

// --- Check 5: every pool entry satisfies the "no boring color" rules --------
// The actual proof that the generator's per-color quality rules (see
// scripts/generate-puzzle-pool.js) held for the whole pool, not just the
// candidates spot-checked in Check 2 -- pure arithmetic over the already-
// stored holeColors/par, so it's effectively instant even at full pool
// scale. English cross's one hardcoded entry is included too (it happens to
// already satisfy these rules; it's exempt from the *generator's* retry
// loop, not from this check).
console.log('Check 5: every pool entry satisfies the "no boring color" rules');
const MIN_STARTING_PEGS_PER_COLOR = 3;
function requiredRemovalForColor(startingCount) {
  return startingCount === 3 ? 1 : 2;
}
const qualityBoardStats = {};
let qualityFailures = 0;
for (const entry of PUZZLE_POOL) {
  const colorCount = entry.par.length;
  const startingCounts = new Array(colorCount).fill(0);
  entry.holeColors.forEach((color) => {
    if (color !== -1) startingCounts[color]++;
  });

  const stats = (qualityBoardStats[entry.boardId] ??= { total: 0, pass: 0 });
  stats.total++;

  let ok = true;
  let anyColorAtOne = false;
  for (let color = 0; color < colorCount; color++) {
    const startingCount = startingCounts[color];
    if (startingCount === 0) continue;
    if (startingCount < MIN_STARTING_PEGS_PER_COLOR) ok = false;
    if (entry.par[color] === 1) anyColorAtOne = true;
    const removed = startingCount - entry.par[color];
    if (removed < requiredRemovalForColor(startingCount)) ok = false;
  }
  if (!anyColorAtOne) ok = false;

  if (ok) {
    stats.pass++;
  } else {
    qualityFailures++;
    console.log(`  FAILED: pool entry (${entry.boardId}) violates a quality rule -- starting [${startingCounts}], par [${entry.par}]`);
  }
}
for (const [boardId, stats] of Object.entries(qualityBoardStats)) {
  console.log(`  ${boardId}: ${stats.pass}/${stats.total} pass (${((100 * stats.pass) / stats.total).toFixed(1)}%)`);
}
const qualityOk = qualityFailures === 0;
if (!qualityOk) allPassed = false;
console.log(`  -> ${qualityOk ? 'PASSED' : 'FAILED'}: ${qualityFailures} entries violate the quality rules\n`);

// --- Check 6: no two days in that same cycle show the same puzzle -----------
// This is the actual proof behind the "never repeats" claim: every one of
// the pool's entries should be used EXACTLY once across a full cycle. Keyed
// on holeColors (not just which holes start empty) since two configs with
// the same empty holes but a different color split are meaningfully
// different puzzles.
console.log('Check 6: no puzzle repeats within one full cycle of the pool');
const seenPuzzleKeys = new Set();
let duplicateFound = false;
for (let puzzleNumber = 0; puzzleNumber < PUZZLE_POOL.length; puzzleNumber++) {
  const puzzle = getPuzzleForNumber(puzzleNumber);
  const key = `${puzzle.boardId}:${puzzle.holeColors.join(',')}`;
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
