// ============================================================================
// scripts/freeze-and-shrink-pool.js
// ----------------------------------------------------------------------------
// Run this periodically with:
//   node scripts/freeze-and-shrink-pool.js
//
// logic/puzzlePool.js started out with 5,602 solver-verified puzzles -- about
// 15 years of daily coverage for a game that shows exactly one a day. That's
// far more than needed up front, and the plan is to keep refreshing the
// *future* pool over time as real play reveals what makes a good puzzle
// (re-run scripts/generate-puzzle-pool.js with updated quality rules, then
// run THIS script to fold the fresh batch in). This script does two things:
//
// 1. FREEZES history. logic/daily.js works out each day's puzzle from its
//    puzzle number and the CURRENT pool, using a shuffle whose output
//    depends on the pool's exact size (see that file's own comment on the
//    coprime-multiplier shuffle). That means shrinking the pool array would,
//    if done naively, silently change what puzzle every past (and
//    already-shown) day "was" -- corrupting anyone's recorded results if
//    they ever revisit that day. So before touching the pool, this script
//    calls the CURRENT (unmodified) getPuzzleForNumber() for every day from
//    0 through today + a small deploy-lag buffer, and permanently records
//    the result in logic/frozenDailyPuzzles.js. Re-running this script later
//    only ADDS newly-elapsed days to that file -- it never removes or
//    changes an already-frozen entry.
//
//    Hand-scheduled puzzles (logic/scheduledPuzzles.js) are left OUT of the
//    freeze on purpose -- they're keyed by date, not pool size, so they're
//    already immune to a pool shrink, and freezing them here would stop a
//    later edit to scheduledPuzzles.js from taking effect for a date that
//    hasn't actually happened yet.
//
// 2. SHRINKS the working pool to about 400 entries. English Cross's one
//    hardcoded entry is always kept (it's the "boss" board, solved once
//    offline -- see precompute-english-cross.js). The other shapes are
//    sampled proportionally to how many entries they currently have, with a
//    floor so a smaller shape (e.g. crescent) doesn't get sampled down to
//    almost nothing. Anything a freshly-frozen day actually used is excluded
//    from the sample, so a puzzle a player just saw can't reappear sooner
//    than the new (smaller, but still ~1-year) no-repeat window promises.
//
// This is NOT part of the app bundle -- it's a standalone developer tool,
// same as generate-puzzle-pool.js and check-solver.js.
// ============================================================================

import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { getTodayPuzzleNumber, getDateForPuzzleNumber, getPuzzleForNumber } from '../src/logic/daily.js';
import { SCHEDULED_PUZZLES } from '../src/logic/scheduledPuzzles.js';
import { PUZZLE_POOL } from '../src/logic/puzzlePool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frozenPath = join(__dirname, '..', 'src', 'logic', 'frozenDailyPuzzles.js');
const poolPath = join(__dirname, '..', 'src', 'logic', 'puzzlePool.js');

// Covers a realistic gap between running this script and actually deploying
// it -- any non-scheduled day within this window that a player could load
// before the deploy lands must show the exact same puzzle after it lands too.
const DEPLOY_LAG_BUFFER_DAYS = 7;

// Target size for the trimmed working pool. "About" 400: the per-shape
// floor below and English Cross's fixed single entry mean the true total
// lands close to, not exactly at, this number.
const TARGET_POOL_SIZE = 400;
const MIN_ENTRIES_PER_SHAPE = 10;

// --- Step 1: load whatever's already frozen from a previous run -------------
let existingFrozen = {};
if (existsSync(frozenPath)) {
  const module = await import(pathToFileURL(frozenPath).href);
  existingFrozen = module.FROZEN_DAILY_PUZZLES;
}
const alreadyFrozenNumbers = new Set(Object.keys(existingFrozen).map(Number));

// --- Step 2: freeze every new day through today + the buffer ----------------
const todayPuzzleNumber = getTodayPuzzleNumber();
const freezeThrough = todayPuzzleNumber + DEPLOY_LAG_BUFFER_DAYS;

const newlyFrozen = {};
const consumedPoolEntries = new Set(); // reference identity into PUZZLE_POOL, so we know what NOT to re-offer
let newlyFrozenCount = 0;
let skippedScheduledCount = 0;

for (let puzzleNumber = 0; puzzleNumber <= freezeThrough; puzzleNumber++) {
  if (alreadyFrozenNumbers.has(puzzleNumber)) continue;

  const date = getDateForPuzzleNumber(puzzleNumber);
  if (SCHEDULED_PUZZLES[date]) {
    skippedScheduledCount++;
    continue; // stays dynamic -- see the file header
  }

  const puzzle = getPuzzleForNumber(puzzleNumber); // CURRENT code, current (not-yet-shrunk) pool
  newlyFrozen[puzzleNumber] = { boardId: puzzle.boardId, holeColors: puzzle.holeColors, par: puzzle.par };
  newlyFrozenCount++;

  // holeColors is the SAME array reference as whatever PUZZLE_POOL entry
  // supplied it (see daily.js's getPuzzleForNumber -- it's assigned
  // straight from `entry.holeColors`, never copied), so this reliably finds
  // exactly which pool entry this day drew, with no need to re-derive the
  // shuffle's index math here.
  const usedEntry = PUZZLE_POOL.find((entry) => entry.holeColors === puzzle.holeColors);
  if (usedEntry) consumedPoolEntries.add(usedEntry);
}

const allFrozen = { ...existingFrozen, ...newlyFrozen };

console.log(`Today is puzzle #${todayPuzzleNumber} (${getDateForPuzzleNumber(todayPuzzleNumber)}).`);
console.log(`Freezing through puzzle #${freezeThrough} (+${DEPLOY_LAG_BUFFER_DAYS}-day deploy-lag buffer).`);
console.log(`  ${alreadyFrozenNumbers.size} day(s) were already frozen from a previous run.`);
console.log(`  ${newlyFrozenCount} new day(s) frozen just now.`);
console.log(`  ${skippedScheduledCount} day(s) skipped (hand-scheduled -- stays dynamic).`);
console.log(`  ${allFrozen ? Object.keys(allFrozen).length : 0} day(s) frozen in total.\n`);

// --- Step 3: shrink the working pool -----------------------------------------
const englishCrossEntries = PUZZLE_POOL.filter((entry) => entry.boardId === 'englishCross');
const otherEntriesByShape = new Map();
for (const entry of PUZZLE_POOL) {
  if (entry.boardId === 'englishCross') continue;
  if (consumedPoolEntries.has(entry)) continue; // just shown (or about to be) -- don't offer it again right away
  if (!otherEntriesByShape.has(entry.boardId)) otherEntriesByShape.set(entry.boardId, []);
  otherEntriesByShape.get(entry.boardId).push(entry);
}

const totalOtherAvailable = [...otherEntriesByShape.values()].reduce((sum, entries) => sum + entries.length, 0);
const budgetForOtherShapes = TARGET_POOL_SIZE - englishCrossEntries.length;

function pickRandomSubset(array, count) {
  const copy = [...array];
  const picked = [];
  const take = Math.min(count, copy.length);
  for (let i = 0; i < take; i++) {
    const index = Math.floor(Math.random() * copy.length);
    picked.push(copy[index]);
    copy.splice(index, 1);
  }
  return picked;
}

const shrunkPool = [...englishCrossEntries];
for (const [boardId, entries] of otherEntriesByShape) {
  const proportionalShare = Math.round((entries.length / totalOtherAvailable) * budgetForOtherShapes);
  const target = Math.max(MIN_ENTRIES_PER_SHAPE, proportionalShare);
  const picked = pickRandomSubset(entries, target);
  shrunkPool.push(...picked);
  console.log(`  ${boardId}: kept ${picked.length} of ${entries.length} available (excluding ${PUZZLE_POOL.filter((e) => e.boardId === boardId && consumedPoolEntries.has(e)).length} just-frozen)`);
}
console.log(`  englishCross: kept ${englishCrossEntries.length} (always kept)`);
console.log(`\nShrunk pool: ${PUZZLE_POOL.length} -> ${shrunkPool.length} entries.\n`);

// --- Step 4: write both files out --------------------------------------------
const frozenLines = [];
frozenLines.push('// ============================================================================');
frozenLines.push('// frozenDailyPuzzles.js -- GENERATED FILE, do not hand-edit');
frozenLines.push('// ----------------------------------------------------------------------------');
frozenLines.push('// Permanent record of exactly which puzzle each day showed, at the moment');
frozenLines.push('// scripts/freeze-and-shrink-pool.js last ran -- see that script and');
frozenLines.push('// logic/daily.js for why this exists (shrinking logic/puzzlePool.js changes');
frozenLines.push('// the pool-index shuffle for every puzzle number, so already-shown days need');
frozenLines.push('// their own permanent record instead of being re-derived from a pool that');
frozenLines.push('// keeps changing size). daily.js checks this BEFORE falling back to the');
frozenLines.push('// (hand-scheduled, then pool-based) normal lookup. Re-running the script only');
frozenLines.push('// ever ADDS entries here -- never edit or remove one by hand.');
frozenLines.push('// ============================================================================');
frozenLines.push('');
frozenLines.push('export const FROZEN_DAILY_PUZZLES = {');
for (const puzzleNumber of Object.keys(allFrozen).map(Number).sort((a, b) => a - b)) {
  const entry = allFrozen[puzzleNumber];
  frozenLines.push(`  ${puzzleNumber}: { boardId: ${JSON.stringify(entry.boardId)}, holeColors: ${JSON.stringify(entry.holeColors)}, par: ${JSON.stringify(entry.par)} },`);
}
frozenLines.push('};');
frozenLines.push('');
writeFileSync(frozenPath, frozenLines.join('\n'), 'utf8');

const poolLines = [];
poolLines.push('// ============================================================================');
poolLines.push('// puzzlePool.js -- GENERATED FILE, do not hand-edit');
poolLines.push('// ----------------------------------------------------------------------------');
poolLines.push('// Every entry here is a starting position that scripts/generate-puzzle-pool.js');
poolLines.push('// already verified. `holeColors[i]` is the color index of the peg starting at');
poolLines.push('// hole i (or -1 if it starts empty); `par` is the fewest pegs of each color');
poolLines.push('// (same index order) achievable from that exact starting position.');
poolLines.push('//');
poolLines.push('// Deliberately kept small (~400 entries, not thousands) -- the plan is to');
poolLines.push('// refresh this periodically with scripts/freeze-and-shrink-pool.js as real');
poolLines.push('// play reveals what makes a good puzzle, rather than front-loading years of');
poolLines.push('// content that can never incorporate that feedback. Already-shown days are');
poolLines.push('// safe from any of this -- see logic/frozenDailyPuzzles.js.');
poolLines.push('//');
poolLines.push('// To add a fresh large candidate batch to draw the next trim from, run:');
poolLines.push('// node scripts/generate-puzzle-pool.js');
poolLines.push('// Then run: node scripts/freeze-and-shrink-pool.js');
poolLines.push('// ============================================================================');
poolLines.push('');
poolLines.push('export const PUZZLE_POOL = [');
for (const entry of shrunkPool) {
  poolLines.push(`  { boardId: ${JSON.stringify(entry.boardId)}, holeColors: ${JSON.stringify(entry.holeColors)}, par: ${JSON.stringify(entry.par)} },`);
}
poolLines.push('];');
poolLines.push('');
writeFileSync(poolPath, poolLines.join('\n'), 'utf8');

console.log(`Wrote ${Object.keys(allFrozen).length} frozen entries to logic/frozenDailyPuzzles.js`);
console.log(`Wrote ${shrunkPool.length} pool entries to logic/puzzlePool.js`);
console.log('\nNext: wire logic/frozenDailyPuzzles.js into logic/daily.js\'s getPuzzleForNumber() (checked after scheduled, before the pool lookup), then run node scripts/check-solver.js.');
