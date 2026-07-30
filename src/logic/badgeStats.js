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
const SCHEMA_VERSION = 3;

function defaultStats() {
  return {
    version: SCHEMA_VERSION,
    // Puzzle numbers where GENIUS (par) has ever been reached -- a set, so
    // replaying the same puzzle to GENIUS again doesn't double count.
    geniusPuzzleIds: [],
    // Puzzle numbers taken to GENIUS on the VERY FIRST attempt that puzzle
    // ever had, with zero Undos on it -- see recordGeniusReached below for
    // why those two conditions are the whole rule.
    oneAndDonePuzzleIds: [],
    // Every ended attempt, on any puzzle, by any ending (terminal state or
    // give-up Reset). Undo never ends an attempt, so never touches this.
    totalPlaythroughs: 0,
    // Puzzle numbers with at least one ended attempt -- a set, so a puzzle
    // replayed many times only counts once.
    playedThroughPuzzleIds: [],
    // Total ended attempts PER puzzle number (unlike playedThroughPuzzleIds,
    // which dedupes to a boolean "played it"). The result screen's "Tries"
    // count reads this. Every ended attempt bumps it -- both a terminal
    // finish and a give-up Reset, since both flow through
    // recordPlaythroughEnded (see logic/attemptBoundary.js).
    attemptsByPuzzle: {},
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
    // Every Undo pressed on a puzzle, lifetime, across every attempt it's
    // ever had. Persisted (rather than counted per-attempt in memory)
    // precisely so One and Done can see an Undo from an EARLIER attempt, or
    // from an earlier visit entirely.
    undosByPuzzle: {},
    // Lifetime Reset presses across every puzzle -- BOTH give-up Resets and
    // result-screen "play again" Resets, since this one is about wearing
    // out the button, not about the intent behind it. resetsByPuzzle above
    // stays deliberately narrower (give-ups only); Comeback Kid's story
    // depends on that meaning.
    totalResets: 0,
    // Every logic/rules.js RANK_TIERS index ever finished at, deduped.
    // Recorded live rather than derived from logic/bestResults.js, which
    // only keeps a puzzle's BEST result and so forgets the lower ranks
    // earned on the way up to it.
    ranksReached: [],
    // Lifetime pegs cleared (the peg landed ON TOP of during a jump),
    // total and broken down by color index (see logic/pegColors.js's
    // PEG_COLORS -- byColor is keyed by that array's numeric id, as a
    // string, since object keys are always strings).
    pegsCleared: { total: 0, byColor: {} },
  };
}

function migrate(stored) {
  // The default-merge below keeps old records readable across schema bumps:
  // any counter added in a later version (e.g. v2's per-puzzle
  // `attemptsByPuzzle`) is simply absent from an older stored object, so it
  // falls back to its default value instead of crashing readers. A v1 record
  // just starts counting Tries fresh from here -- no back-fill of history.
  const merged = {
    ...defaultStats(),
    ...stored,
    pegsCleared: { ...defaultStats().pegsCleared, ...stored.pegsCleared },
  };

  // v3 is the first bump that reshapes data rather than just adding to it.
  // `cleanGeniusPuzzleIds` was filled by a check that over-awarded -- a
  // "play again" Reset was invisible to it (only give-up Resets were ever
  // recorded), and so were Undos from any attempt but the current one -- so
  // its contents can't be trusted, and there's no record left to re-derive
  // them from. Dropped outright rather than carried forward: no badge UI had
  // shipped when it was wrong, so nothing visibly un-earns here.
  if ((stored.version ?? 1) < 3) {
    delete merged.cleanGeniusPuzzleIds;
    merged.oneAndDonePuzzleIds = [];
    merged.version = SCHEMA_VERSION;
  }

  return merged;
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
  stats.attemptsByPuzzle[puzzleNumber] = (stats.attemptsByPuzzle[puzzleNumber] ?? 0) + 1;
  saveStore(stats);
  return stats;
}

/**
 * How many attempts have ended on a puzzle -- the result screen's "Tries"
 * count. Because recordPlaythroughEnded fires the instant a round hits its
 * terminal state (before the result UI renders), this already includes the
 * just-finished attempt by result time.
 *
 * @param {number} puzzleNumber
 * @returns {number}
 */
export function getAttemptsForPuzzle(puzzleNumber) {
  return getStore().attemptsByPuzzle[puzzleNumber] ?? 0;
}

/**
 * Records a give-up Reset (pressed with moves made, before the round ended)
 * on a puzzle -- the tally logic/badges.js's Comeback Kid check reads from.
 * Note this is the NARROW reset counter; recordResetPressed below is the one
 * that counts every press.
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
 * Records one Undo, on a puzzle, lifetime -- see `undosByPuzzle` above for
 * why this is persisted rather than counted per attempt in memory.
 *
 * @param {number} puzzleNumber
 */
export function recordUndo(puzzleNumber) {
  const stats = getStore();
  stats.undosByPuzzle[puzzleNumber] = (stats.undosByPuzzle[puzzleNumber] ?? 0) + 1;
  saveStore(stats);
  return stats;
}

/**
 * Records one Reset press, of EITHER kind (see `totalResets` above) -- the
 * tally logic/badges.js's Push to Reset check reads from. Not keyed by
 * puzzle: no badge asks "which board did you rage-quit," only "how many
 * times did you hit that button."
 */
export function recordResetPressed() {
  const stats = getStore();
  stats.totalResets += 1;
  saveStore(stats);
  return stats;
}

/**
 * Records that a round just finished at a given rank -- see `ranksReached`
 * above. Deduped, so grinding one tier over and over never fills the set.
 *
 * @param {number} tierIndex - a logic/rules.js RANK_TIERS index (see getRankTierIndex)
 */
export function recordRankReached(tierIndex) {
  const stats = getStore();
  if (!stats.ranksReached.includes(tierIndex)) {
    stats.ranksReached.push(tierIndex);
  }
  saveStore(stats);
  return stats;
}

/**
 * Records that GENIUS (par) was reached on a puzzle just now.
 *
 * @param {number} puzzleNumber
 * @param {{priorAttempts: number}} attempt - how many attempts had already
 *   ENDED on this puzzle before the one just finishing. The caller must read
 *   this (getAttemptsForPuzzle) BEFORE calling recordPlaythroughEnded, or it
 *   will already include the current attempt -- see useGame.js's jump().
 */
export function recordGeniusReached(puzzleNumber, { priorAttempts }) {
  const stats = getStore();
  if (!stats.geniusPuzzleIds.includes(puzzleNumber)) {
    stats.geniusPuzzleIds.push(puzzleNumber);
  }
  if (!(puzzleNumber in stats.resetsToGenius)) {
    stats.resetsToGenius[puzzleNumber] = stats.resetsByPuzzle[puzzleNumber] ?? 0;
  }
  // "One and done" is the whole rule: the first attempt this puzzle ever
  // had, taken straight to par, with nothing taken back. Resets need no
  // clause of their own -- a give-up Reset ENDS an attempt (so it'd show up
  // in priorAttempts), and a "play again" Reset can only ever follow one.
  // That last point is exactly what the old check missed.
  const isOneAndDone = priorAttempts === 0 && (stats.undosByPuzzle[puzzleNumber] ?? 0) === 0;
  if (isOneAndDone && !stats.oneAndDonePuzzleIds.includes(puzzleNumber)) {
    stats.oneAndDonePuzzleIds.push(puzzleNumber);
  }
  saveStore(stats);
  return stats;
}
