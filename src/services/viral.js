// ============================================================================
// services/viral.js
// ----------------------------------------------------------------------------
// Everything related to sharing a result lives here: building the short,
// spoiler-safe emoji summary, and copying it to the clipboard. Never
// reveals the actual moves -- just a colored circle per peg color and how
// many of that color were left, plus the puzzle's date and a direct link
// back to that exact day (see logic/daily.js -- "#/play/<puzzleNumber>"
// loads that specific day regardless of what "today" is when it's opened),
// so sharing an archive day sends people to that day, not just today's.
//
// No Vue code lives here -- ResultOverlay.vue calls these plain functions
// and just displays whatever comes back.
// ============================================================================

import { getPegColor } from '../logic/pegColors.js';

/** The game's fixed public URL, used in every share. */
export const SITE_URL = 'https://dot-hop.pages.dev/';

/**
 * Builds the short, spoiler-safe text people post when they share a result
 * -- the puzzle's date, one row per peg color with that color's circle
 * emoji repeated once per surviving peg (in color order, colors with none
 * left omitted), the rank that result earned, and a link straight to that
 * day's puzzle.
 *
 * @param {object} params
 * @param {number[]} params.pegsRemaining - final per-color peg counts, color-index order
 * @param {number|null} [params.puzzleNumber] - the day's puzzle number (see logic/daily.js); omitted/null for a one-off custom design, which has no day to link to
 * @param {string|null} [params.formattedDate] - the puzzle's date, already formatted for display (see PlayView.vue's formattedDate); omitted/null for a custom design
 * @param {string|null} [params.rank] - the rank copy earned by this result (see logic/rules.js's getRankForOverPar); omitted/null to leave it out
 * @param {string|null} [params.emoji] - that rank's emoji, if it has one
 * @returns {string}
 */
export function buildShareText({ pegsRemaining, puzzleNumber = null, formattedDate = null, rank = null, emoji = null }) {
  const emojiLines = pegsRemaining
    .map((count, colorIndex) => getPegColor(colorIndex).emoji.repeat(count))
    .filter((row) => row.length > 0)
    .join('\n');
  const dateLine = formattedDate ? `Dot Hop — ${formattedDate}\n` : '';
  const rankLine = rank ? `${emoji ? emoji + ' ' : ''}${rank}\n` : '';
  // The `?ref=share` marker doesn't reveal anything spoiler-y -- it's the
  // only way to tell a session arriving from a shared result apart from any
  // other visit, since PostHog auto-captures $current_url/$referrer but has
  // no other way to know a link came from this button. See the Virality
  // dashboard in docs/ANALYTICS.md.
  const link = puzzleNumber === null ? `${SITE_URL}?ref=share` : `${SITE_URL}?ref=share#/play/${puzzleNumber}`;
  return `${dateLine}${emojiLines}\n${rankLine}${link}`;
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
