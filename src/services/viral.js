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
 * -- the puzzle's date, a colored circle emoji plus count per peg color (in
 * color order), and a link straight to that day's puzzle.
 *
 * @param {object} params
 * @param {number[]} params.pegsRemaining - final per-color peg counts, color-index order
 * @param {number|null} [params.puzzleNumber] - the day's puzzle number (see logic/daily.js); omitted/null for a one-off custom design, which has no day to link to
 * @param {string|null} [params.formattedDate] - the puzzle's date, already formatted for display (see ResultOverlay.vue's formattedDate); omitted/null for a custom design
 * @returns {string}
 */
export function buildShareText({ pegsRemaining, puzzleNumber = null, formattedDate = null }) {
  const emojiLine = pegsRemaining.map((count, colorIndex) => `${getPegColor(colorIndex).emoji}${count}`).join(' ');
  const dateLine = formattedDate ? `Dot Hop — ${formattedDate}\n` : '';
  const link = puzzleNumber === null ? SITE_URL : `${SITE_URL}#/play/${puzzleNumber}`;
  return `${dateLine}${emojiLine}\n${link}`;
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
