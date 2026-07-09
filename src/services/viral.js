// ============================================================================
// services/viral.js
// ----------------------------------------------------------------------------
// Everything related to sharing a result lives here: building the short
// "Wordle-style" spoiler-safe text summary, and copying it to the
// clipboard. Never reveals the actual moves, just the date, rank, and peg
// counts.
//
// No Vue code lives here -- ResultOverlay.vue calls these plain functions
// and just displays whatever comes back.
// ============================================================================

/**
 * Builds the short, spoiler-safe text people post when they share a result
 * -- similar in spirit to a Wordle result line.
 *
 * @param {object} params
 * @param {string|null} params.dateLabel - a pre-formatted display date (e.g. "July 8, 2026"), or null for a custom (editor-made) puzzle
 * @param {number} params.pegsRemaining - the player's actual final peg count
 * @param {number} params.bestPossible - the puzzle's par (best possible outcome)
 * @param {string} params.rankLabel - e.g. "GENIUS"
 * @returns {string}
 */
export function buildShareText({ dateLabel, pegsRemaining, bestPossible, rankLabel }) {
  const pegWord = pegsRemaining === 1 ? 'peg' : 'pegs';
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const subtitle = dateLabel || 'Custom design';
  return `Dot Hop — ${subtitle}\n${rankLabel} — ${pegsRemaining} ${pegWord} left (best: ${bestPossible})\n${siteUrl}`.trim();
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
