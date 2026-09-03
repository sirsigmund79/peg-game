// ============================================================================
// services/viral.js
// ----------------------------------------------------------------------------
// Everything related to sharing a result lives here: building the short,
// spoiler-safe emoji summary, and copying it to the clipboard. Never
// reveals the actual moves -- just a challenge line, the puzzle's date, a
// colored circle per peg color for how many of that color were left, and a
// direct link back to that exact day (see logic/daily.js --
// "#/play/<puzzleNumber>" loads that specific day regardless of what
// "today" is when it's opened), so sharing an archive day sends people to
// that day, not just today's.
//
// No Vue code lives here -- ResultFooter.vue calls these plain functions
// and just displays whatever comes back.
// ============================================================================

import { getPegColor } from '../logic/pegColors.js';

/** The game's fixed public URL, used in every share. */
export const SITE_URL = 'https://dothopper.com/';

/**
 * Builds the short, spoiler-safe text people post when they share a result
 * -- a one-line challenge naming the rank that result earned, the puzzle's
 * date, one row per peg color with that color's circle emoji repeated once
 * per surviving peg (in color order, colors with none left omitted), an
 * optional "Pro mode" line, an optional "Tries: N" line, and a link straight
 * to that day's puzzle.
 *
 * @param {object} params
 * @param {number[]} params.pegsRemaining - final per-color peg counts, color-index order
 * @param {number|null} [params.puzzleNumber] - the day's puzzle number (see logic/daily.js); omitted/null for a one-off custom design, which has no day to link to
 * @param {string|null} [params.formattedDate] - the puzzle's date, already formatted for display (see PlayView.vue's formattedDate); omitted/null for a custom design
 * @param {string|null} [params.rank] - the rank copy earned by this result (see logic/rules.js's getRankForOverPar); omitted/null to leave it out
 * @param {number|null} [params.tries] - total attempts on this puzzle (see logic/badgeStats.js's getAttemptsForPuzzle); omitted/null or non-positive leaves the "Tries" line out (a custom design has no recorded attempts)
 * @param {boolean} [params.proMode] - whether the attempt was played in Pro mode start to finish (see useGame.js's `proRound`); false leaves the mode line out entirely
 * @returns {string}
 */
export function buildShareText({ pegsRemaining, puzzleNumber = null, formattedDate = null, rank = null, tries = null, proMode = false }) {
  const emojiLines = pegsRemaining
    .map((count, colorIndex) => getPegColor(colorIndex).emoji.repeat(count))
    .filter((row) => row.length > 0)
    .join('\n');
  // Genius is the top rank -- there's no better result left to beat, so the
  // challenge reads differently than every other rank (see logic/rules.js's
  // RANK_TIERS).
  const challengeLine = rank ? (rank === 'Genius' ? 'I got Genius. Can you?\n' : `I got ${rank}. Can you beat it?\n`) : '';
  const dateLine = formattedDate ? `Dot Hopper — ${formattedDate}\n` : '';
  // The `?ref=share` marker doesn't reveal anything spoiler-y -- it's the
  // only way to tell a session arriving from a shared result apart from any
  // other visit, since PostHog auto-captures $current_url/$referrer but has
  // no other way to know a link came from this button. See the Virality
  // dashboard in docs/ANALYTICS.md.
  // The mode the board was actually played with (see useGame.js's `proRound`
  // for why that's not the same as what the toggle reads now). Only Pro gets
  // a line: playing with Undo available is the plain state of the game, not
  // something to announce, and the same reasoning keeps it off the toggle in
  // components/ProModeToggle.vue. Not spoiler-y -- it says nothing about the
  // board, only about what the player denied themselves on it.
  const proLine = proMode ? '\nPro mode — no Undo' : '';
  // How many attempts it took -- only when it's a real, recorded count (a
  // custom design has none). Not spoiler-y: it says nothing about the board.
  const triesLine = typeof tries === 'number' && tries > 0 ? `\nTries: ${tries}` : '';
  const link = puzzleNumber === null ? `${SITE_URL}?ref=share` : `${SITE_URL}?ref=share#/play/${puzzleNumber}`;
  return `${challengeLine}${dateLine}${emojiLines}${proLine}${triesLine}\n${link}`;
}

/**
 * Copies text to the clipboard. Never throws -- always resolves with
 * whether it actually worked, so the caller can show its own status
 * message either way.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Shares a result: always copies the text to the clipboard first (so it's
 * there to paste even if the device has no share sheet, or the player
 * cancels it), then -- on a device that supports it (mainly mobile) --
 * opens the OS's native share sheet with that same text, so it's a couple
 * taps to send straight to a specific contact or messaging app instead of
 * pasting it in by hand.
 *
 * @param {string} text
 * @returns {Promise<{copied: boolean, shared: boolean}>}
 */
export async function shareResult(text) {
  const copied = await copyTextToClipboard(text);
  let shared = false;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      shared = true;
    } catch (error) {
      // The player cancelled the share sheet, or the platform rejected the
      // request outright -- either way the clipboard copy above already
      // succeeded (or didn't) independently, so there's nothing left to
      // recover here.
    }
  }
  return { copied, shared };
}
