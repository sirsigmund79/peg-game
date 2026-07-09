// ============================================================================
// scripts/generate-puzzle-pool.js
// ----------------------------------------------------------------------------
// Run this once with:
//   node scripts/generate-puzzle-pool.js
//
// This is how we get a HUGE, never-repeating supply of daily puzzles
// without a database: for every board shape, we try lots of candidate
// starting positions (every single empty hole, pairs of empty holes, and
// -- for smaller shapes -- triples), split each candidate's occupied holes
// into 2-4 peg colors (see logic/pegColors.js), and solver-verify each one
// -- keeping only candidates that are genuinely worth playing (see
// MIN_JUMPS_REQUIRED below). Each survivor's `par` is whatever the solver
// proves is the best achievable outcome FOR THAT EXACT COLOR SPLIT, per
// color -- not hardcoded to 1 like the old single-color game, since one
// color can end up blocked by another and unable to reduce all the way
// down. The survivors get written out as plain data to logic/puzzlePool.js,
// which is checked into git and loaded instantly by every player (no
// solving happens in the browser for this).
//
// This only needs to be re-run if a board SHAPE changes (e.g. a different
// hexagon radius) or the color-assignment/quality rules below change. It is
// NOT part of the app itself.
// ============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BOARD_CATALOG, ENGLISH_CROSS_HOLE_COLORS, ENGLISH_CROSS_PRECOMPUTED } from '../src/logic/boards.js';
import { createSolver, SolverBudgetExceededError } from '../src/logic/solver.js';
import { createStartingMasks } from '../src/logic/rules.js';
import { getColorCountForCellCount, assignHoleColors } from '../src/logic/pegColors.js';

// Shapes we enumerate offline. English cross is deliberately left out --
// its board is too big to solve hundreds of times in a row (see
// solver.js), so it ships with just its one known-good center-empty start
// instead (added separately, below).
const SHAPES_TO_ENUMERATE = ['triangle', 'heart', 'hexagon', 'star', 'square', 'diamond', 'octagon'];

// Trying EVERY pair of empty holes is fast on small boards, but on a big,
// densely-connected board (like the 37-hole star) both the number of pairs
// AND the difficulty of each individual solve balloon. Past this cell
// count, we randomly SAMPLE pairs instead of trying all of them.
const FULL_PAIR_ENUMERATION_CELL_LIMIT = 25;
const RANDOM_PAIR_SAMPLE_COUNT = 250;

// Triples are only tried for the smallest boards -- combinations grow fast.
const TRIPLE_HOLE_CELL_COUNT_LIMIT = 20;

// A safety valve for individual candidates: if solving one single starting
// position explores more than this many board states, we give up on JUST
// that candidate (it's either pathologically slow to solve, or just slow to
// prove either way) rather than let it run for a very long time. A few
// genuinely-solvable-but-slow candidates will get skipped by this -- that's
// a fine trade, since thousands of other candidates fill the pool anyway.
const CANDIDATE_NODE_BUDGET = 40000;

// A candidate is only worth playing if solving it actually clears out a
// meaningful number of pegs -- this replaces the old single-color game's
// "must reach exactly 1 peg" filter, which doesn't generalize (one color
// can legitimately be blocked above 1 by another color's pegs in its way).
// Instead we just require the solver's best line to remove at least this
// many pegs total, so a candidate that barely improves on its starting
// position (or can't improve at all) gets skipped as boring.
const MIN_JUMPS_REQUIRED = 4;

/** A tiny deterministic random number generator, so re-running this script produces the same pool. */
function makeSeededRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pool = [];

for (const boardId of SHAPES_TO_ENUMERATE) {
  const board = BOARD_CATALOG[boardId];
  const cellCount = board.geometry.cellCount;
  const colorCount = getColorCountForCellCount(cellCount);
  const seenConfigs = new Set();
  const rng = makeSeededRng(2166136261 ^ (boardId.length * 486187739));
  let verifiedCount = 0;
  let skippedTooExpensive = 0;
  let skippedDegenerate = 0;
  const startTime = Date.now();

  function tryCandidate(emptyHoles) {
    const sorted = [...emptyHoles].sort((a, b) => a - b);
    const key = sorted.join(',');
    if (seenConfigs.has(key)) return;
    seenConfigs.add(key);

    const occupiedCount = cellCount - sorted.length;
    const holeColors = assignHoleColors(board.geometry, sorted, colorCount, rng);

    // Defensive skip: a color with fewer than 2 starting pegs can never
    // jump at all (there's nothing of its own color to jump over) --
    // round-robin dealing makes this rare, but not impossible on the
    // smallest boards with the most empty holes.
    const colorCounts = new Array(colorCount).fill(0);
    holeColors.forEach((color) => {
      if (color !== -1) colorCounts[color]++;
    });
    if (colorCounts.some((count) => count > 0 && count < 2)) {
      skippedDegenerate++;
      return;
    }

    // NOTE: a fresh solver (empty memo) per candidate, on purpose. Reusing
    // one solver across hundreds of unrelated starting positions sounds
    // faster, but on a well-connected board the combined memo across many
    // candidates can grow past JS's Map size limit and crash. A fresh memo
    // per candidate keeps each solve's memory bounded to just that one
    // candidate's own search tree -- and the nodeBudget below bounds it
    // further still.
    const solver = createSolver(board.geometry.moves, cellCount, { nodeBudget: CANDIDATE_NODE_BUDGET });
    const startingMasks = createStartingMasks(cellCount, holeColors, colorCount);
    try {
      const result = solver.findBest(startingMasks);
      if (occupiedCount - result.minPegs >= MIN_JUMPS_REQUIRED) {
        pool.push({ boardId, holeColors, par: result.perColor });
        verifiedCount++;
      } else {
        skippedDegenerate++;
      }
    } catch (error) {
      if (error instanceof SolverBudgetExceededError) {
        skippedTooExpensive++;
      } else {
        throw error;
      }
    }

    if (seenConfigs.size % 100 === 0) {
      console.log(`  ...${boardId}: ${seenConfigs.size} tried so far (${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
    }
  }

  // Every single empty hole -- always tried in full.
  for (let i = 0; i < cellCount; i++) {
    tryCandidate([i]);
  }

  // Pairs of empty holes -- full enumeration on small boards, a bounded
  // random sample on big ones.
  if (cellCount <= FULL_PAIR_ENUMERATION_CELL_LIMIT) {
    for (let i = 0; i < cellCount; i++) {
      for (let j = i + 1; j < cellCount; j++) {
        tryCandidate([i, j]);
      }
    }
  } else {
    let sampled = 0;
    let attempts = 0;
    const maxAttempts = RANDOM_PAIR_SAMPLE_COUNT * 5;
    while (sampled < RANDOM_PAIR_SAMPLE_COUNT && attempts < maxAttempts) {
      attempts++;
      const i = Math.floor(rng() * cellCount);
      const j = Math.floor(rng() * cellCount);
      if (i === j) continue;
      const beforeSize = seenConfigs.size;
      tryCandidate([i, j]);
      if (seenConfigs.size > beforeSize) sampled++;
    }
  }

  // Triples -- only for the smallest boards.
  if (cellCount <= TRIPLE_HOLE_CELL_COUNT_LIMIT) {
    for (let i = 0; i < cellCount; i++) {
      for (let j = i + 1; j < cellCount; j++) {
        for (let k = j + 1; k < cellCount; k++) {
          tryCandidate([i, j, k]);
        }
      }
    }
  }

  const seconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `${boardId}: tried ${seenConfigs.size} candidates, ${verifiedCount} verified, ${skippedDegenerate} skipped (too easy/degenerate), ${skippedTooExpensive} skipped (too slow) in ${seconds}s`
  );
}

// English cross ships with just its one known-good, already-verified start
// (see boards.js / scripts/precompute-english-cross.js).
pool.push({ boardId: 'englishCross', holeColors: ENGLISH_CROSS_HOLE_COLORS, par: ENGLISH_CROSS_PRECOMPUTED.par });

console.log(`\nTOTAL POOL SIZE: ${pool.length} verified puzzles`);

// --- write the pool out as a plain data file -------------------------------
const fileLines = [];
fileLines.push('// ============================================================================');
fileLines.push('// puzzlePool.js -- GENERATED FILE, do not hand-edit');
fileLines.push('// ----------------------------------------------------------------------------');
fileLines.push('// Every entry here is a starting position that scripts/generate-puzzle-pool.js');
fileLines.push('// already solver-verified. `holeColors[i]` is the color index of the peg');
fileLines.push('// starting at hole i (or -1 if it starts empty); `par` is the fewest pegs of');
fileLines.push('// each color (same index order) the solver proved achievable from that exact');
fileLines.push('// starting position -- not hardcoded to 1, since one color can end up blocked');
fileLines.push('// by another. daily.js picks one entry per day, in a shuffled-but-fixed order,');
fileLines.push(`// so no two days ever show the same puzzle until all ${pool.length} entries have`);
fileLines.push('// been used (see daily.js for how that works).');
fileLines.push('//');
fileLines.push('// To regenerate this file (e.g. after changing a board shape in boards.js),');
fileLines.push('// run: node scripts/generate-puzzle-pool.js');
fileLines.push('// ============================================================================');
fileLines.push('');
fileLines.push('export const PUZZLE_POOL = [');
for (const entry of pool) {
  fileLines.push(`  { boardId: ${JSON.stringify(entry.boardId)}, holeColors: ${JSON.stringify(entry.holeColors)}, par: ${JSON.stringify(entry.par)} },`);
}
fileLines.push('];');
fileLines.push('');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'src', 'logic', 'puzzlePool.js');
writeFileSync(outputPath, fileLines.join('\n'), 'utf8');
console.log(`Wrote ${outputPath}`);
