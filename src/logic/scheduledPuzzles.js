// ============================================================================
// scheduledPuzzles.js
// ----------------------------------------------------------------------------
// The one place to override "what puzzle shows up on date X" with a
// hand-designed board from the Editor, instead of the normal puzzle-pool
// pick (see daily.js). There's no server or database behind this game --
// every player's device works out today's puzzle purely from today's date --
// so "scheduling" a puzzle just means committing an entry here and
// deploying, exactly like any other code change.
//
// Emptied out during the multi-color rework: the editor's `cellStates`
// format changed (a peg cell is now a color index, not the string 'peg'),
// so any previously hand-scheduled single-color puzzle isn't compatible
// with today's format. New ones can be authored with the reworked editor.
//
// HOW TO ADD ONE
// 1. Design (or open) a puzzle in the Editor and click "Copy for
//    scheduling" next to it in "My Puzzles". That copies a ready-to-paste
//    object entry to your clipboard, keyed by a placeholder date.
// 2. Paste it into SCHEDULED_PUZZLES below and replace "YYYY-MM-DD" with
//    the real date you want it to appear (each player's own LOCAL date --
//    see logic/daily.js's date math) -- this also works for a date that's
//    already in the archive, which lets you swap out a past day's puzzle
//    after the fact.
// 3. Rebuild/redeploy. daily.js checks this map before falling back to the
//    puzzle pool, so a scheduled date always wins.
// ============================================================================

/**
 * @type {Record<string, {boardName: string, rows: number, cols: number, cellStates: (string|number)[], colorCount: number, par: number[]}>}
 */
export const SCHEDULED_PUZZLES = {
  // "2026-08-01": { boardName: "Launch Special", rows: 9, cols: 9, cellStates: [...], colorCount: 3, par: [1, 1, 1] },
};
