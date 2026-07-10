// ============================================================================
// daily.js
// ----------------------------------------------------------------------------
// This file decides WHICH puzzle a player sees today. The key idea: today's
// puzzle is worked out purely from today's date -- no server, no database.
// Anyone opening the game on the same calendar day gets the exact same
// puzzle, forever, with no extra bookkeeping. "Calendar day" is each
// player's own device's local date/time -- the puzzle flips over at local
// midnight, not at a single fixed moment worldwide.
//
// HOW "NEVER REPEATS" WORKS
// logic/puzzlePool.js contains a big, fixed list of solver-verified starting
// positions (every shape in boards.js, combined) -- see
// scripts/generate-puzzle-pool.js for how that list was built. This file
// assigns each day a DIFFERENT entry from that pool using a shuffled-but-
// fixed order, so puzzle #0, #1, #2, ... never repeat a pool entry until
// every single one has been used once. Only after the entire pool has been
// shown once does the sequence start over from the beginning. See
// POOL_SIZE / describePoolCoverage() below for exactly how many days that
// buys us.
//
// No Vue code lives here -- useDaily.js (a composable) wraps this in
// reactive state for the screen.
// ============================================================================

import { BOARD_CATALOG } from './boards.js';
import { PUZZLE_POOL } from './puzzlePool.js';
import { SCHEDULED_PUZZLES } from './scheduledPuzzles.js';
import { buildDailyPuzzleFromDesign } from './customBoard.js';
import { getEmptyHolesFromColors } from './rules.js';

// NOTE: this is "day zero" of the puzzle numbering scheme. Moved back 40
// days (was 2026-07-08) while the game was still brand new and had no real
// player history yet, purely so the archive would open with a real month
// of past days already in it instead of a handful of upcoming previews --
// see components/ArchiveView.vue. Puzzle numbering (and thus which pool
// entry each date gets) is unaffected other than shifting which date each
// number lands on.
// Never change this again once the game has real players -- it would
// shuffle everyone's puzzle history.
const EPOCH_YEAR = 2026;
const EPOCH_MONTH_INDEX = 4; // May
const EPOCH_DAY = 29;
const EPOCH_LOCAL_MS = new Date(EPOCH_YEAR, EPOCH_MONTH_INDEX, EPOCH_DAY).getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns a JS Date into a "puzzle number": how many whole days it is after
 * the epoch, counting by each device's own LOCAL calendar date -- not UTC.
 * That means the puzzle flips over at local midnight, so a player in Tokyo
 * and a player in Denver may briefly be a day apart, but neither ever sees
 * "today" roll over in the middle of their afternoon.
 *
 * We build local-midnight Date objects (rather than just diffing raw
 * milliseconds) and round, so a daylight-saving transition -- which makes
 * one local day 23 or 25 hours long -- can't shift the count by a day.
 *
 * @param {Date} date
 * @returns {number}
 */
export function getPuzzleNumberForDate(date) {
  const midnightLocalMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((midnightLocalMs - EPOCH_LOCAL_MS) / ONE_DAY_MS);
}

/** @returns {number} today's puzzle number, based on the real current (local) date. */
export function getTodayPuzzleNumber() {
  return getPuzzleNumberForDate(new Date());
}

/**
 * @param {number} puzzleNumber
 * @returns {string} the local date (YYYY-MM-DD) that puzzle number lands on
 */
export function getDateForPuzzleNumber(puzzleNumber) {
  // Adding to the day-of-month (rather than adding raw milliseconds) lets
  // JS Date normalize the overflow using local calendar rules, so this
  // stays correct across DST transitions too.
  const date = new Date(EPOCH_YEAR, EPOCH_MONTH_INDEX, EPOCH_DAY + puzzleNumber);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ----------------------------------------------------------------------------
// The "never repeats" shuffle
// ----------------------------------------------------------------------------
// We want a function that maps 0, 1, 2, ..., POOL_SIZE-1 to a shuffled
// order that hits every one of those numbers EXACTLY once (a "bijection").
// A simple, well-known way to build one for any pool size: pick a
// multiplier that shares no common factors with POOL_SIZE (i.e. is
// "coprime" to it), then compute `(index * multiplier + offset) % POOL_SIZE`.
// Because the multiplier is coprime to POOL_SIZE, this is guaranteed to
// produce every value 0..POOL_SIZE-1 exactly once as `index` runs from 0 to
// POOL_SIZE-1 -- no collisions, no repeats, and no giant lookup table
// needed to remember the order.
// ----------------------------------------------------------------------------

const POOL_SIZE = PUZZLE_POOL.length;

function greatestCommonDivisor(a, b) {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Finds a number less than `total` that shares no common factor with it. */
function findCoprimeMultiplier(total) {
  if (total <= 1) return 1;
  // A golden-ratio-ish starting point tends to spread values out nicely,
  // but any coprime number works -- we just walk forward until we find one.
  let candidate = Math.max(2, Math.floor(total * 0.618033988));
  for (let attempt = 0; attempt < total; attempt++) {
    const test = 2 + ((candidate + attempt) % (total - 1));
    if (greatestCommonDivisor(test, total) === 1) {
      return test;
    }
  }
  return 1; // pathological fallback (e.g. total === 1)
}

const SHUFFLE_MULTIPLIER = findCoprimeMultiplier(POOL_SIZE);
const SHUFFLE_OFFSET = 104729; // an arbitrary constant, just for extra mixing

/** Maps a puzzle number to a pool index, in a fixed order that never repeats a pool index until all POOL_SIZE have been used. */
function getPoolIndexForPuzzleNumber(puzzleNumber) {
  const positionInCycle = ((puzzleNumber % POOL_SIZE) + POOL_SIZE) % POOL_SIZE;
  return (positionInCycle * SHUFFLE_MULTIPLIER + SHUFFLE_OFFSET) % POOL_SIZE;
}

/**
 * How many days of guaranteed-no-repeat puzzles the current pool provides,
 * in both days and roughly-years. Handy for sanity-checking in the
 * console, or displaying somewhere in the UI later.
 *
 * @returns {{days: number, years: string}}
 */
export function describePoolCoverage() {
  return { days: POOL_SIZE, years: (POOL_SIZE / 365).toFixed(1) };
}

// getPuzzleForNumber() is a pure function of its input, so caching results
// keeps repeated calls (re-renders, reloads within the same session) both
// fast and byte-for-byte identical -- "today's puzzle" never wobbles.
const puzzleCache = new Map();

/**
 * Works out the full puzzle definition for a given puzzle number: which
 * board shape, which holes start empty (and what color each starting peg
 * is), and the solver-confirmed par (one target count per color).
 *
 * @param {number} puzzleNumber
 * @returns {{puzzleNumber:number, date:string, boardId:string, boardName:string,
 *   geometry:object, holeColors:number[], colorCount:number, emptyHoles:number[],
 *   label:string, par:number[], cellCount:number}}
 */
export function getPuzzleForNumber(puzzleNumber) {
  const cached = puzzleCache.get(puzzleNumber);
  if (cached) return cached;

  const date = getDateForPuzzleNumber(puzzleNumber);

  // A hand-designed puzzle scheduled for this exact date (see
  // logic/scheduledPuzzles.js) always wins over the normal pool pick --
  // this is also how a past archive day can be swapped for a custom design.
  const scheduledDesign = SCHEDULED_PUZZLES[date];
  if (scheduledDesign) {
    const scheduledPuzzle = buildDailyPuzzleFromDesign(scheduledDesign, puzzleNumber, date);
    puzzleCache.set(puzzleNumber, scheduledPuzzle);
    return scheduledPuzzle;
  }

  const poolIndex = getPoolIndexForPuzzleNumber(puzzleNumber);
  const entry = PUZZLE_POOL[poolIndex];
  const board = BOARD_CATALOG[entry.boardId];
  const emptyHoles = getEmptyHolesFromColors(entry.holeColors);

  const holeWord = emptyHoles.length === 1 ? 'hole' : 'holes';
  const puzzle = {
    puzzleNumber,
    date,
    boardId: board.id,
    boardName: board.name,
    geometry: board.geometry,
    holeColors: entry.holeColors,
    colorCount: entry.par.length,
    emptyHoles,
    label: `${emptyHoles.length} empty ${holeWord}`,
    par: entry.par,
    cellCount: board.geometry.cellCount,
  };

  puzzleCache.set(puzzleNumber, puzzle);
  return puzzle;
}

/** @returns {object} the full puzzle definition for TODAY. */
export function getTodaysPuzzle() {
  return getPuzzleForNumber(getTodayPuzzleNumber());
}

/**
 * Searches forward from a starting puzzle number for the next puzzle that
 * uses a given board shape ("triangle", "heart", "englishCross", etc.).
 * Used by the developer-only puzzle picker (components/DevPanel.vue) so a
 * developer can jump straight to a particular shape for testing, instead
 * of guessing puzzle numbers.
 *
 * @param {number} fromPuzzleNumber - search starts at this puzzle number (inclusive)
 * @param {string} boardId
 * @param {number} [searchLimit] - give up after checking this many days
 * @returns {object|null} the matching puzzle, or null if none was found within the limit
 */
export function findNextPuzzleWithBoardId(fromPuzzleNumber, boardId, searchLimit = 2000) {
  for (let offset = 0; offset < searchLimit; offset++) {
    const puzzle = getPuzzleForNumber(fromPuzzleNumber + offset);
    if (puzzle.boardId === boardId) {
      return puzzle;
    }
  }
  return null;
}
