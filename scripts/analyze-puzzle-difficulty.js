// ============================================================================
// scripts/analyze-puzzle-difficulty.js
// ----------------------------------------------------------------------------
// Run this once with:
//   node scripts/analyze-puzzle-difficulty.js
//
// Estimates difficulty for every puzzle a player could actually see soon:
// every archive day so far (puzzle #0 up to today), a forward-looking buffer
// of upcoming plain pool days (see FUTURE_HORIZON_DAYS below), and every
// hand-scheduled puzzle in logic/scheduledPuzzles.js, past or future (even
// past that buffer).
//
// TWO INDEPENDENT SIGNALS, kept separate on purpose (see logic/puzzleDag.js
// and logic/puzzlePerceivedDifficulty.js for the full rationale):
//   STRUCTURAL -- a DAG of every state reachable from the puzzle's start,
//     tagged by whether each move still preserves the puzzle's proven
//     best-possible outcome ("safe") or throws it away ("a trap"). Reduces
//     to total_difficulty = raw_branching x trap_ratio x remaining_depth,
//     averaged over every state that stays on the safe path.
//   PERCEIVED -- whether four naive, lookahead-free strategies stumble onto
//     that same optimal outcome anyway, plus a structural (no solving
//     involved) board-symmetry score. A puzzle can have a high trap_ratio
//     and still be trivial in practice if the danger never LOOKS dangerous.
//
// Also runs the Phase 1 acceptance checks (residue cap, no permanently
// isolated dot, solvability sanity) and records any failures per puzzle --
// for pool-drawn puzzles these should mostly already pass (the pool
// generator enforces a close cousin of the residue-cap bar at generation
// time), but hand-authored logic/scheduledPuzzles.js entries never went
// through that gate, so failures there are real, useful signal.
//
// Results are written out as plain data to logic/puzzleDifficulty.js (same
// "generated file, don't hand-edit" pattern as generate-puzzle-pool.js), and
// components/AdminPuzzlesView.vue reads that file directly for its grid --
// re-running for one puzzle live (in AdminPuzzleEditPanel.vue) is separate,
// see workers/puzzleAnalysisWorker.js.
// ============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPuzzleNumberForDate, getPuzzleForNumber, getTodayPuzzleNumber } from '../src/logic/daily.js';
import { SCHEDULED_PUZZLES } from '../src/logic/scheduledPuzzles.js';
import { createStartingMasks } from '../src/logic/rules.js';
import { buildPuzzleDag, summarizeDagForPuzzle, DagBudgetExceededError } from '../src/logic/puzzleDag.js';
import { analyzePerceivedDifficulty } from '../src/logic/puzzlePerceivedDifficulty.js';

// Bounds the underlying solve (same role as the old script's budget, and the
// same knob generate-puzzle-pool.js uses) -- if THIS is exceeded, the
// puzzle's true optimum is never known at all, so no DAG or perceived-
// difficulty comparison can be made (both need a proven target).
const SOLVE_NODE_BUDGET = 1_000_000;

// A SEPARATE cap on the DAG's own size. Even a puzzle whose optimum is cheap
// to prove can still have an enormous SAFE subgraph (lots of equally-good
// move orders) -- exceeding this retries in sampling mode instead of the
// full DAG (see puzzleDag.js's buildPuzzleDag doc for why these two budgets
// are independent).
const DAG_NODE_BUDGET = 300_000;
const SAMPLE_WIDTH = 4;

const WEIGHTS_NOTE =
  'totalDifficulty is NOT z-scored/weighted like the old heuristic pipeline -- ' +
  'it is raw_branching x trap_ratio x remaining_depth, averaged directly over the DAG. ' +
  'Buckets below are still percentile-based (tertiles) so they stay meaningful as more puzzles are added.';

/** Same small deterministic RNG generate-puzzle-pool.js uses, so a re-run's sampling fallback is reproducible. */
function makeSeededRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// 1. Work out which puzzle numbers to analyze -- identical selection to the
//    pipeline this replaces, see components/AdminPuzzlesView.vue's default
//    "days forward" window.
// ----------------------------------------------------------------------------
const FUTURE_HORIZON_DAYS = 90;

const todayNumber = getTodayPuzzleNumber();
const puzzleNumbers = new Set();
for (let puzzleNumber = 0; puzzleNumber <= todayNumber + FUTURE_HORIZON_DAYS; puzzleNumber++) {
  puzzleNumbers.add(puzzleNumber);
}
for (const dateKey of Object.keys(SCHEDULED_PUZZLES)) {
  const [year, month, day] = dateKey.split('-').map(Number);
  puzzleNumbers.add(getPuzzleNumberForDate(new Date(year, month - 1, day)));
}
const sortedPuzzleNumbers = [...puzzleNumbers].sort((a, b) => a - b);

// ----------------------------------------------------------------------------
// 2. Per-puzzle DAG + perceived-difficulty analysis.
// ----------------------------------------------------------------------------
const records = [];
let totalWallClockMs = 0;

for (const puzzleNumber of sortedPuzzleNumbers) {
  const puzzle = getPuzzleForNumber(puzzleNumber);
  const { geometry, holeColors, colorCount, cellCount, par, boardId, boardName, date } = puzzle;
  const pegCount = cellCount - holeColors.filter((color) => color === -1).length;
  const startingMasks = createStartingMasks(cellCount, holeColors, colorCount);

  const startedAt = Date.now();

  // Try the full DAG first; if its own size (not the underlying solve)
  // exceeds DAG_NODE_BUDGET -- OR classifying some edge needs fresh search
  // findBest(startingMasks)'s early-exit shortcut skipped while proving the
  // optimum -- fall back to sampling several optimal paths instead (see
  // puzzleDag.js's buildPuzzleDag doc). A solve that never completes at all
  // (SOLVE_NODE_BUDGET exceeded on the very first call) can't be helped by
  // sampling either way -- there's no proven target to sample toward, so
  // buildPuzzleDag just returns dagComplete: false without throwing. Even
  // the SAMPLED retry can still throw (an expensive-to-classify edge right
  // at the start node isn't avoided by narrowing which SAFE children get
  // recursed into afterward) -- if THAT happens too, give up on DAG/
  // perceived-difficulty analysis for this puzzle entirely rather than
  // crashing the whole batch run; par is still whatever was already stored.
  let dag;
  let sampled = false;
  let dagExpansionFailedAfterSolve = false;
  try {
    dag = buildPuzzleDag(geometry.moves, cellCount, startingMasks, {
      nodeBudget: SOLVE_NODE_BUDGET,
      dagNodeBudget: DAG_NODE_BUDGET,
    });
  } catch (error) {
    if (!(error instanceof DagBudgetExceededError)) throw error;
    try {
      dag = buildPuzzleDag(geometry.moves, cellCount, startingMasks, {
        nodeBudget: SOLVE_NODE_BUDGET,
        sampleWidth: SAMPLE_WIDTH,
        rng: makeSeededRng(puzzleNumber + 1),
      });
      sampled = true;
    } catch (retryError) {
      if (!(retryError instanceof DagBudgetExceededError)) throw retryError;
      dagExpansionFailedAfterSolve = true;
      dag = { dagComplete: false, sampled: false, nodesVisited: null, target: null, startingMasks, everLegalHoles: new Set() };
    }
  }

  const dagSummary = summarizeDagForPuzzle(dag, holeColors);
  const perceived = analyzePerceivedDifficulty(geometry, startingMasks, holeColors, dag.target);

  const wallClockMs = Date.now() - startedAt;
  totalWallClockMs += wallClockMs;

  const storedBest = par.reduce((sum, count) => sum + count, 0);
  const solverBest = dag.target ? dag.bestPossibleTotal : null;
  let mismatch = null;
  if (dagExpansionFailedAfterSolve) {
    mismatch = 'dag_expansion_incomplete'; // the solve itself proved a value; only edge classification ran out of budget
  } else if (!dag.dagComplete) {
    mismatch = 'solver_incomplete';
  } else if (solverBest < storedBest) {
    mismatch = 'solver_found_better';
  } else if (solverBest > storedBest) {
    mismatch = 'solver_worse_than_stored';
  }

  records.push({
    puzzleNumber,
    date,
    boardId,
    boardName,
    pegCount,
    bestPossible: storedBest,
    solverBest,
    mismatch,
    wallClockMs,
    ...dagSummary,
    sampled,
    perceivedDifficulty: perceived.perceivedDifficulty,
    heuristicResults: perceived.heuristicResults,
    symmetryScore: perceived.symmetryScore,
  });

  const dagPart = dagSummary.dagComplete
    ? `dag=${dagSummary.dagNodeCount}n/${dagSummary.dagEdgeCount}e${sampled ? ' (sampled)' : ''} trap=${dagSummary.avgTrapRatio.toFixed(3)} diff=${dagSummary.totalDifficulty.toFixed(3)}`
    : '[solver budget exceeded]';
  const perceivedPart = perceived.perceivedDifficulty === null ? '' : ` perceived=${perceived.perceivedDifficulty.toFixed(2)}`;
  const flagPart = dagSummary.acceptanceFailures.length > 0 ? `  !! ${dagSummary.acceptanceFailures.map((f) => f.check).join(',')}` : '';
  console.log(`#${puzzleNumber} (${date}) ${boardName}: par=${storedBest} ${dagPart}${perceivedPart} (${wallClockMs}ms)${flagPart}`);
}

// ----------------------------------------------------------------------------
// 3. Bucket by totalDifficulty PERCENTILE (tertiles) -- same mechanism the
//    old script used on its composite z-score, just a new (unweighted, not
//    z-scored) input.
// ----------------------------------------------------------------------------
function percentile(sortedValues, fraction) {
  const index = Math.min(sortedValues.length - 1, Math.floor(fraction * sortedValues.length));
  return sortedValues[index];
}

const scoredValues = records
  .map((record) => record.totalDifficulty)
  .filter((value) => value !== null)
  .sort((a, b) => a - b);
const easyCutoff = percentile(scoredValues, 1 / 3);
const mediumCutoff = percentile(scoredValues, 2 / 3);

for (const record of records) {
  if (record.totalDifficulty === null) {
    record.difficultyBucket = 'Unknown';
  } else if (record.totalDifficulty <= easyCutoff) {
    record.difficultyBucket = 'Easy';
  } else if (record.totalDifficulty <= mediumCutoff) {
    record.difficultyBucket = 'Medium';
  } else {
    record.difficultyBucket = 'Genius';
  }
}

const mismatchCount = records.filter((record) => record.mismatch !== null).length;
const flaggedCount = records.filter((record) => record.acceptanceFailures.length > 0).length;
const sampledCount = records.filter((record) => record.sampled).length;
console.log(
  `\nAnalyzed ${records.length} puzzles (#0..#${todayNumber + FUTURE_HORIZON_DAYS} plus any scheduled dates beyond that) in ${(totalWallClockMs / 1000).toFixed(1)}s total. ` +
    `${mismatchCount} solver/stored-par mismatches, ${flaggedCount} acceptance-check flags, ${sampledCount} fell back to sampling. ` +
    `Easy cutoff <= ${easyCutoff?.toFixed(3)}, Medium cutoff <= ${mediumCutoff?.toFixed(3)}.`
);

// ----------------------------------------------------------------------------
// 4. Write the generated data file.
// ----------------------------------------------------------------------------
const fileLines = [];
fileLines.push('// ============================================================================');
fileLines.push('// puzzleDifficulty.js -- GENERATED FILE, do not hand-edit');
fileLines.push('// ----------------------------------------------------------------------------');
fileLines.push('// One entry per puzzle analyzed by scripts/analyze-puzzle-difficulty.js: every');
fileLines.push('// archive day up to the day this was generated, plus every hand-scheduled');
fileLines.push('// puzzle in logic/scheduledPuzzles.js (past or future). See that script for');
fileLines.push('// exactly what each field means.');
fileLines.push('//');
fileLines.push('// `mismatch` is non-null when this run\'s own solve of the puzzle didn\'t match');
fileLines.push('// its stored `bestPossible` -- worth a manual look, see the script header.');
fileLines.push('// `acceptanceFailures` are the Phase 1 generator checks (residue cap, no');
fileLines.push('// isolated dot, solvability sanity), re-run here for already-scheduled puzzles.');
fileLines.push('//');
fileLines.push('// To regenerate, run: node scripts/analyze-puzzle-difficulty.js');
fileLines.push('// ============================================================================');
fileLines.push('');
fileLines.push(`export const DIFFICULTY_META = ${JSON.stringify(
  {
    generatedAt: new Date().toISOString(),
    note: WEIGHTS_NOTE,
    solveNodeBudget: SOLVE_NODE_BUDGET,
    dagNodeBudget: DAG_NODE_BUDGET,
    sampleWidth: SAMPLE_WIDTH,
    easyCutoff,
    mediumCutoff,
  },
  null,
  2
)};`);
fileLines.push('');
fileLines.push('export const PUZZLE_DIFFICULTY = [');
for (const record of records) {
  fileLines.push(`  ${JSON.stringify(record)},`);
}
fileLines.push('];');
fileLines.push('');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'src', 'logic', 'puzzleDifficulty.js');
writeFileSync(outputPath, fileLines.join('\n'), 'utf8');
console.log(`Wrote ${outputPath}`);
