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
// -- keeping only candidates where every color is genuinely worth playing
// (see the per-color quality rules below). Each survivor's `par` is whatever the solver
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
import { createStartingMasks, findLegalMoves, applyMove, countPegsRemaining } from '../src/logic/rules.js';
import { getColorCountForCellCount, assignHoleColors } from '../src/logic/pegColors.js';

// Shapes we enumerate offline -- everything currently in BOARD_CATALOG
// except English cross, which is deliberately left out: its board is too
// big to solve hundreds of times in a row (see solver.js), so it ships with
// just its one known-good center-empty start instead (added separately,
// below). Star is currently pulled from BOARD_CATALOG entirely (see
// boards.js) for the beta, so it's skipped here too even though this
// enumeration logic already supports it.
const SHAPES_TO_ENUMERATE = [
  'triangle', 'heart', 'anvil', 'ribbon', 'boot',
  'hexagon', 'kidney', 'crescent',
  'square', 'diamond', 'octagon', 'brokenSquare',
];

// Trying EVERY pair of empty holes is fast on small boards, but on a big,
// densely-connected board (like the 37-hole star) both the number of pairs
// AND the difficulty of each individual solve balloon. Past this cell
// count, we randomly SAMPLE pairs instead of trying all of them.
const FULL_PAIR_ENUMERATION_CELL_LIMIT = 25;
const RANDOM_PAIR_SAMPLE_COUNT = 250;

// Triples are only tried for the smallest boards -- combinations grow fast.
const TRIPLE_HOLE_CELL_COUNT_LIMIT = 20;

// A safety valve for individual candidates: if EXHAUSTIVELY solving one
// starting position explores more than this many board states, we stop
// trying to PROVE it optimal and fall back to a bunch of random playthroughs
// instead (see playRandomRollout below), keeping the best one found. This
// matters most on the biggest boards (star, octagon): a peg's color-locked
// jumps make it cheap to quickly FIND a good line (the solver's early exit
// fires fast whenever one reaches the theoretical floor), but expensive to
// PROVE no better line exists when the true best doesn't reach that floor --
// on a 37-hole board, "prove no better line exists" can be enormous. Falling
// back to rollouts trades "provably optimal" for "actually has candidates at
// all" on those shapes -- the same trade-off already made for the English
// Cross board (see scripts/precompute-english-cross.js).
const CANDIDATE_NODE_BUDGET = 12000;
const ROLLOUT_FALLBACK_ATTEMPTS = 300;

// A candidate is only worth playing if EVERY color in it is actually
// playable -- not just the board as a whole. These per-color rules replace
// the old single aggregate "remove >= 4 pegs total" check, which let one
// lively color mask another color that could never jump at all (e.g. 3
// pegs placed so no two are ever exactly 2 cells apart along a legal jump
// direction -- frozen at 3 the whole game, boring).
//
//   1. Every color starts with at least this many pegs -- 1 or 2 starting
//      pegs can barely (or never) jump at all.
//   2. At least one color must be solvable all the way down to 1 peg, so
//      every puzzle has at least one fully-satisfying color to chase.
//   3. Every color must be able to remove at least this many pegs from its
//      starting count -- 3-peg colors only need to prove they're not
//      totally frozen (1 removal); 4+-peg colors need to prove real room
//      to maneuver (2 removals).
const MIN_STARTING_PEGS_PER_COLOR = 3;
function requiredRemovalForColor(startingCount) {
  return startingCount === 3 ? 1 : 2;
}

// Tightening the acceptance gate to real per-color rules (above) rejects far
// more BFS color-partitions than the old aggregate check did -- so instead
// of giving up on a starting position after one partition attempt, we
// redraw the color split a few times first. Cheap attempts (arithmetic
// only, rule 1) are tried liberally; only partitions that already pass rule
// 1 spend a real solver call checking rules 2+3.
const MAX_PARTITION_ATTEMPTS = 12;
const MAX_SOLVER_ATTEMPTS_PER_CANDIDATE = 4;

/** A tiny deterministic random number generator, so re-running this script produces the same pool. */
function makeSeededRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Plays one full round, picking a uniformly random legal move each turn until none remain. */
function playRandomRollout(moveList, startingMasks, rng) {
  let masks = startingMasks;
  while (true) {
    const legal = findLegalMoves(masks, moveList);
    if (legal.length === 0) break;
    const move = legal[Math.floor(rng() * legal.length)];
    masks = applyMove(masks, move);
  }
  const perColor = countPegsRemaining(masks);
  const minPegs = perColor.reduce((sum, count) => sum + count, 0);
  return { minPegs, perColor };
}

const pool = [];

for (const boardId of SHAPES_TO_ENUMERATE) {
  const board = BOARD_CATALOG[boardId];
  const cellCount = board.geometry.cellCount;
  const colorCount = getColorCountForCellCount(cellCount);
  const seenConfigs = new Set();
  const rng = makeSeededRng(2166136261 ^ (boardId.length * 486187739));
  let verifiedCount = 0;
  let approximateCount = 0;
  let skippedDegenerate = 0;
  let cheapPartitionRejects = 0;
  let skippedUnsatisfiable = 0;
  const startTime = Date.now();

  /** Runs the solver (with rollout fallback) for one exact color split -- pulled out so the retry loop below can call it more than once per candidate. */
  function solveCandidate(holeColors) {
    // NOTE: a fresh solver (empty memo) per attempt, on purpose. Reusing
    // one solver across hundreds of unrelated starting positions sounds
    // faster, but on a well-connected board the combined memo across many
    // candidates can grow past JS's Map size limit and crash. A fresh memo
    // per attempt keeps each solve's memory bounded to just that one
    // attempt's own search tree -- and the nodeBudget below bounds it
    // further still.
    const solver = createSolver(board.geometry.moves, cellCount, { nodeBudget: CANDIDATE_NODE_BUDGET });
    const startingMasks = createStartingMasks(cellCount, holeColors, colorCount);

    try {
      const result = solver.findBest(startingMasks);
      return { minPegs: result.minPegs, perColor: result.perColor, exact: true };
    } catch (error) {
      if (!(error instanceof SolverBudgetExceededError)) throw error;
      // Too slow to prove exhaustively -- fall back to a bunch of random
      // playthroughs and keep the best one, rather than discarding this
      // attempt outright (see ROLLOUT_FALLBACK_ATTEMPTS above).
      let best = null;
      for (let attempt = 0; attempt < ROLLOUT_FALLBACK_ATTEMPTS; attempt++) {
        const rollout = playRandomRollout(board.geometry.moves, startingMasks, rng);
        if (!best || rollout.minPegs < best.minPegs) best = rollout;
      }
      return { minPegs: best.minPegs, perColor: best.perColor, exact: false };
    }
  }

  /** Rule 1 only -- pure arithmetic, no solver call, so it's cheap enough to check on every redraw. */
  function meetsMinimumPerColor(colorCounts) {
    return colorCounts.every((count) => count === 0 || count >= MIN_STARTING_PEGS_PER_COLOR);
  }

  /** Rules 2+3 -- needs a solved outcome. */
  function passesQualityRules(colorCounts, outcome) {
    let anyColorAtOne = false;
    for (let color = 0; color < colorCounts.length; color++) {
      const startingCount = colorCounts[color];
      if (startingCount === 0) continue;
      if (outcome.perColor[color] === 1) anyColorAtOne = true;
      const removed = startingCount - outcome.perColor[color];
      if (removed < requiredRemovalForColor(startingCount)) return false;
    }
    return anyColorAtOne;
  }

  function tryCandidate(emptyHoles) {
    const sorted = [...emptyHoles].sort((a, b) => a - b);
    const key = sorted.join(',');
    if (seenConfigs.has(key)) return;
    seenConfigs.add(key);

    const occupiedCount = cellCount - sorted.length;

    // A perfectly even split couldn't even clear rule 1 -- no amount of
    // redrawing will fix that, so bail before spending any attempts.
    if (occupiedCount < colorCount * MIN_STARTING_PEGS_PER_COLOR) {
      skippedDegenerate++;
      return;
    }

    let accepted = null;
    let solverAttempts = 0;

    for (let attempt = 0; attempt < MAX_PARTITION_ATTEMPTS; attempt++) {
      const holeColors = assignHoleColors(board.geometry, sorted, colorCount, rng);
      const colorCounts = new Array(colorCount).fill(0);
      holeColors.forEach((color) => {
        if (color !== -1) colorCounts[color]++;
      });

      if (!meetsMinimumPerColor(colorCounts)) {
        cheapPartitionRejects++;
        continue;
      }

      if (solverAttempts >= MAX_SOLVER_ATTEMPTS_PER_CANDIDATE) break;
      solverAttempts++;
      const outcome = solveCandidate(holeColors);

      if (passesQualityRules(colorCounts, outcome)) {
        accepted = { holeColors, outcome };
        break;
      }
    }

    if (!accepted) {
      skippedUnsatisfiable++;
    } else {
      pool.push({ boardId, holeColors: accepted.holeColors, par: accepted.outcome.perColor });
      verifiedCount++;
      if (!accepted.outcome.exact) approximateCount++;
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
    `${boardId}: tried ${seenConfigs.size} candidates, ${verifiedCount} verified (${approximateCount} via rollout fallback), ` +
      `${skippedDegenerate} skipped (too few occupied holes), ${skippedUnsatisfiable} skipped (no partition satisfied all quality rules ` +
      `within ${MAX_PARTITION_ATTEMPTS} redraws), ${cheapPartitionRejects} redraws rejected by rule 1 in ${seconds}s`
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
fileLines.push('// already verified. `holeColors[i]` is the color index of the peg starting at');
fileLines.push('// hole i (or -1 if it starts empty); `par` is the fewest pegs of each color');
fileLines.push('// (same index order) achievable from that exact starting position -- not');
fileLines.push('// hardcoded to 1, since one color can end up blocked by another. Most entries\'');
fileLines.push('// `par` is solver-PROVEN optimal; on the biggest boards, some entries instead');
fileLines.push('// use the best of many random playthroughs (see ROLLOUT_FALLBACK_ATTEMPTS in');
fileLines.push('// the generator) when proving true optimality was too expensive -- still a');
fileLines.push('// genuinely good target, just not a guaranteed-best one. daily.js picks one');
fileLines.push('// entry per day, in a shuffled-but-fixed order, so no two days ever show the');
fileLines.push(`// same puzzle until all ${pool.length} entries have been used (see daily.js).`);
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
