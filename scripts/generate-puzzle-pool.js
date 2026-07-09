// ============================================================================
// scripts/generate-puzzle-pool.js
// ----------------------------------------------------------------------------
// Run this once with:
//   node scripts/generate-puzzle-pool.js
//
// This is how we get a HUGE, never-repeating supply of daily puzzles
// without a database: for every board shape, we try lots of candidate
// starting positions (every single empty hole, pairs of empty holes, and
// -- for smaller shapes -- triples), solver-verify each one, and keep only
// the ones that solve all the way down to 1 peg. The survivors get written
// out as plain data to logic/puzzlePool.js, which is checked into git and
// loaded instantly by every player (no solving happens in the browser for
// this).
//
// This only needs to be re-run if a board SHAPE changes (e.g. a different
// hexagon radius). It is NOT part of the app itself.
// ============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BOARD_CATALOG, ENGLISH_CROSS_EMPTY_HOLES } from '../src/logic/boards.js';
import { createSolver, SolverBudgetExceededError } from '../src/logic/solver.js';
import { createStartingMask } from '../src/logic/rules.js';

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
// that candidate (it's either unsolvable to 1 peg, or pathologically slow
// to prove either way) rather than let it run for a very long time. A few
// genuinely-solvable-but-slow candidates will get skipped by this -- that's
// a fine trade, since thousands of other candidates fill the pool anyway.
const CANDIDATE_NODE_BUDGET = 40000;

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
  const seenConfigs = new Set();
  const rng = makeSeededRng(2166136261 ^ (boardId.length * 486187739));
  let verifiedCount = 0;
  let skippedTooExpensive = 0;
  const startTime = Date.now();

  function tryCandidate(emptyHoles) {
    const sorted = [...emptyHoles].sort((a, b) => a - b);
    const key = sorted.join(',');
    if (seenConfigs.has(key)) return;
    seenConfigs.add(key);

    // NOTE: a fresh solver (empty memo) per candidate, on purpose. Reusing
    // one solver across hundreds of unrelated starting positions sounds
    // faster, but on a well-connected board the combined memo across many
    // candidates can grow past JS's Map size limit and crash. A fresh memo
    // per candidate keeps each solve's memory bounded to just that one
    // candidate's own search tree -- and the nodeBudget below bounds it
    // further still.
    const solver = createSolver(board.geometry.moves, { nodeBudget: CANDIDATE_NODE_BUDGET });
    const startingMask = createStartingMask(cellCount, sorted);
    try {
      const result = solver.findBest(startingMask);
      if (result.minPegs === 1) {
        pool.push({ boardId, emptyHoles: sorted, par: 1 });
        verifiedCount++;
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
    `${boardId}: tried ${seenConfigs.size} candidates, ${verifiedCount} verified (par 1), ${skippedTooExpensive} skipped (too slow) in ${seconds}s`
  );
}

// English cross ships with just its one known-good, already-verified start
// (see boards.js / scripts/precompute-english-cross.js).
pool.push({ boardId: 'englishCross', emptyHoles: ENGLISH_CROSS_EMPTY_HOLES, par: 1 });

console.log(`\nTOTAL POOL SIZE: ${pool.length} verified puzzles`);

// --- write the pool out as a plain data file -------------------------------
const fileLines = [];
fileLines.push('// ============================================================================');
fileLines.push('// puzzlePool.js -- GENERATED FILE, do not hand-edit');
fileLines.push('// ----------------------------------------------------------------------------');
fileLines.push('// Every entry here is a starting position that scripts/generate-puzzle-pool.js');
fileLines.push('// already solver-verified reaches exactly 1 peg. daily.js picks one entry per');
fileLines.push('// day, in a shuffled-but-fixed order, so no two days ever show the same puzzle');
fileLines.push(`// until all ${pool.length} entries have been used (see daily.js for how that works).`);
fileLines.push('//');
fileLines.push('// To regenerate this file (e.g. after changing a board shape in boards.js),');
fileLines.push('// run: node scripts/generate-puzzle-pool.js');
fileLines.push('// ============================================================================');
fileLines.push('');
fileLines.push('export const PUZZLE_POOL = [');
for (const entry of pool) {
  fileLines.push(`  { boardId: ${JSON.stringify(entry.boardId)}, emptyHoles: ${JSON.stringify(entry.emptyHoles)}, par: ${entry.par} },`);
}
fileLines.push('];');
fileLines.push('');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'src', 'logic', 'puzzlePool.js');
writeFileSync(outputPath, fileLines.join('\n'), 'utf8');
console.log(`Wrote ${outputPath}`);
