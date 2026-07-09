// ============================================================================
// services/viral.js
// ----------------------------------------------------------------------------
// Everything related to sharing a result lives here: building the short,
// spoiler-safe emoji summary, and copying it to the clipboard. Never
// reveals the actual moves -- just a colored circle per peg color and how
// many of that color were left, plus the site's URL.
//
// No Vue code lives here -- ResultOverlay.vue calls these plain functions
// and just displays whatever comes back.
// ============================================================================

import { getPegColor } from '../logic/pegColors.js';

/** The game's fixed public URL, used in every share. */
export const SITE_URL = 'https://dot-hop.pages.dev/';

/**
 * Builds the short, spoiler-safe text people post when they share a result
 * -- just a colored circle emoji plus count per peg color, in color order,
 * followed by the site URL.
 *
 * @param {object} params
 * @param {number[]} params.pegsRemaining - final per-color peg counts, color-index order
 * @returns {string}
 */
export function buildShareText({ pegsRemaining }) {
  const emojiLine = pegsRemaining.map((count, colorIndex) => `${getPegColor(colorIndex).emoji}${count}`).join(' ');
  return `${emojiLine}\n${SITE_URL}`;
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
