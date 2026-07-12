// ============================================================================
// logic/badgeStats.js
// ----------------------------------------------------------------------------
// The raw, lifetime counters that every badge in logic/badges.js is computed
// from -- source of truth, source of truth only. This file never decides
// whether a badge is unlocked (see logic/badges.js for that); it just
// records what happened, the same read-modify-write pattern as
// logic/history.js and logic/bestResults.js.
//
// Versioned (see SCHEMA_VERSION) so the shape can change later without
// wiping a returning player's progress -- add a branch to migrate() keyed on
// the stored version, never repurpose an existing key's meaning.
//
// Everything here is keyed by puzzle NUMBER where it's per-puzzle, matching
// logic/history.js/bestResults.js/roundState.js, and (like those stores)
// only ever recorded for real daily puzzles -- callers should skip custom
// editor/story designs (puzzleNumber === null) the same way useGame.js
// already does for recordResult() etc.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const BADGE_STATS_KEY = 'dot-hop:badge-stats';
const SCHEMA_VERSION = 1;

function defaultStats() {
  return {
    version: SCHEMA_VERSION,
    // Puzzle numbers where GENIUS (par) has ever been reached -- a set, so
    // replaying the same puzzle to GENIUS again doesn't double count.
    geniusPuzzleIds: [],
    // Puzzle numbers where GENIUS was reached with zero Undos in that
    // attempt and zero Resets anywhere in that puzzle's prior history.
    cleanGeniusPuzzleIds: [],
    // Every ended attempt, on any puzzle, by any ending (terminal state or
    // give-up Reset). Undo never ends an attempt, so never touches this.
    totalPlaythroughs: 0,
    // Puzzle numbers with at least one ended attempt -- a set, so a puzzle
    // replayed many times only counts once.
    playedThroughPuzzleIds: [],
    // Lifetime count of give-up Resets (a Reset pressed with moves made,
    // before the round reached a terminal state) per puzzle number. A Reset
    // pressed to start a fresh attempt AFTER a round already ended doesn't
    // count here -- see logic/attemptBoundary.js.
    resetsByPuzzle: {},
    // Snapshot of resetsByPuzzle[puzzleNumber] taken the FIRST time GENIUS
    // was reached on that puzzle -- "how many times did they give up before
    // finally getting it." Never overwritten after that first snapshot, so
    // a later replay-to-GENIUS-again doesn't change the story.
    resetsToGenius: {},
    // Lifetime pegs cleared (the peg landed ON TOP of during a jump),
    // total and broken down by color index (see logic/pegColors.js's
    // PEG_COLORS -- byColor is keyed by that array's numeric id, as a
    // string, since object keys are always strings).
    pegsCleared: { total: 0, byColor: {} },
  };
}

function migrate(stored) {
  // No migrations yet -- SCHEMA_VERSION 1 is the first shape this ever
  // shipped with. A future version bump adds a branch here keyed on
  // stored.version; this default-merge keeps old records readable meanwhile
  // (e.g. a stats object saved before a new counter existed just gets that
  // counter's zero value instead of crashing readers).
  return {
    ...defaultStats(),
    ...stored,
    pegsCleared: { ...defaultStats().pegsCleared, ...stored.pegsCleared },
  };
}

function getStore() {
  const stored = safeGet(BADGE_STATS_KEY, null);
  return stored ? migrate(stored) : defaultStats();
}

function saveStore(stats) {
  safeSet(BADGE_STATS_KEY, stats);
}

/** @returns {object} every lifetime badge-relevant stat recorded on this device. */
export function getBadgeStats() {
  return getStore();
}

/**
 * Records one peg cleared (jumped over and removed), lifetime.
 *
 * @param {number} colorIndex - matches logic/pegColors.js's PEG_COLORS id
 */
export function recordPegCleared(colorIndex) {
  const stats = getStore();
  stats.pegsCleared.total += 1;
  stats.pegsCleared.byColor[colorIndex] = (stats.pegsCleared.byColor[colorIndex] ?? 0) + 1;
  saveStore(stats);
  return stats;
}

/**
 * Records one ended attempt on a puzzle (terminal state OR a give-up
 * Reset) -- see logic/attemptBoundary.js for the rule on which Resets count.
 *
 * @param {number} puzzleNumber
 */
export function recordPlaythroughEnded(puzzleNumber) {
  const stats = getStore();
  stats.totalPlaythroughs += 1;
  if (!stats.playedThroughPuzzleIds.includes(puzzleNumber)) {
    stats.playedThroughPuzzleIds.push(puzzleNumber);
  }
  saveStore(stats);
  return stats;
}

/**
 * Records a give-up Reset (pressed with moves made, before the round ended)
 * on a puzzle -- the tally logic/badges.js's Comeback Kid and Clean Genius
 * checks read from.
 *
 * @param {number} puzzleNumber
 */
export function recordGiveUpReset(puzzleNumber) {
  const stats = getStore();
  stats.resetsByPuzzle[puzzleNumber] = (stats.resetsByPuzzle[puzzleNumber] ?? 0) + 1;
  saveStore(stats);
  return stats;
}

/**
 * Records that GENIUS (par) was reached on a puzzle just now.
 *
 * @param {number} puzzleNumber
 * @param {{attemptUndoCount: number}} attempt - the Undo count of THIS
 *   attempt only (see useGame.js's state.attemptUndoCount), used to decide
 *   whether this was a "clean" GENIUS -- zero Undos this attempt, and zero
 *   Resets ever recorded on this puzzle before it.
 */
export function recordGeniusReached(puzzleNumber, { attemptUndoCount }) {
  const stats = getStore();
  if (!stats.geniusPuzzleIds.includes(puzzleNumber)) {
    stats.geniusPuzzleIds.push(puzzleNumber);
  }
  if (!(puzzleNumber in stats.resetsToGenius)) {
    stats.resetsToGenius[puzzleNumber] = stats.resetsByPuzzle[puzzleNumber] ?? 0;
  }
  const isCleanAttempt = attemptUndoCount === 0 && (stats.resetsByPuzzle[puzzleNumber] ?? 0) === 0;
  if (isCleanAttempt && !stats.cleanGeniusPuzzleIds.includes(puzzleNumber)) {
    stats.cleanGeniusPuzzleIds.push(puzzleNumber);
  }
  saveStore(stats);
  return stats;
}
