// ============================================================================
// logic/ghostSettings.js
// ----------------------------------------------------------------------------
// Independent, lifetime persisted booleans behind the Ghost Outline feature
// (see logic/ghostMoves.js for the actual per-state tracking this controls
// the visibility of), plus a few one-way analytics markers used to make sure
// certain PostHog writes (see services/analytics.js) only ever happen once
// per browser:
//   - "enabled": the real on/off switch for the feature. Defaults to true --
//     Ghost Outline is purely informational and low-risk, so it ships on.
//   - "discovered": whether the player has ever tapped the secret ghost line
//     at the bottom of components/StatsView.vue. Defaults to false, and is
//     ONE-WAY -- once true, it never goes back to false. This is what gates
//     whether components/GhostToggle.vue (the real in-game on/off control)
//     is shown at all; until discovered, the feature is silently on with no
//     visible way to turn it off.
//   - "baselineCaptured": whether this browser's one-time pre-Ghost-Outline
//     lifetime stats snapshot has already been sent to PostHog. ONE-WAY.
//   - "everDisabled" / "everReEnabled": whether the player has EVER flipped
//     `enabled` false->true (having previously been on) or true->false,
//     lifetime. Each is its own ONE-WAY flag -- see
//     composables/useGhostOutline.js's setEnabled() for where these are set.
// Kept as separate keys (rather than one object) so each has its own
// obvious default when missing, matching the rest of this codebase's
// one-concern-per-store convention.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const ENABLED_KEY = 'dot-hop:ghost-outline-enabled';
const DISCOVERED_KEY = 'dot-hop:ghost-outline-discovered';
const BASELINE_CAPTURED_KEY = 'dot-hop:ghost-outline-baseline-captured';
const EVER_DISABLED_KEY = 'dot-hop:ghost-outline-ever-disabled';
const EVER_RE_ENABLED_KEY = 'dot-hop:ghost-outline-ever-re-enabled';

/** @returns {boolean} whether Ghost Outline is currently switched on. */
export function isGhostEnabled() {
  return safeGet(ENABLED_KEY, true);
}

/** @param {boolean} value */
export function setGhostEnabled(value) {
  safeSet(ENABLED_KEY, Boolean(value));
}

/** @returns {boolean} whether the player has ever found the secret toggle in Stats. */
export function isGhostDiscovered() {
  return safeGet(DISCOVERED_KEY, false);
}

/** Marks the secret toggle as found, permanently. Safe to call repeatedly. */
export function markGhostDiscovered() {
  safeSet(DISCOVERED_KEY, true);
}

/** @returns {boolean} whether this browser's one-time baseline stats snapshot has already been sent. */
export function isGhostBaselineCaptured() {
  return safeGet(BASELINE_CAPTURED_KEY, false);
}

/** Marks the one-time baseline snapshot as sent, permanently. Safe to call repeatedly. */
export function markGhostBaselineCaptured() {
  safeSet(BASELINE_CAPTURED_KEY, true);
}

/** @returns {boolean} whether the player has ever turned Ghost Outline off, lifetime. */
export function isGhostEverDisabled() {
  return safeGet(EVER_DISABLED_KEY, false);
}

/** Marks "has turned it off at least once" as true, permanently. Safe to call repeatedly. */
export function markGhostEverDisabled() {
  safeSet(EVER_DISABLED_KEY, true);
}

/** @returns {boolean} whether the player has ever turned Ghost Outline back on after disabling it, lifetime. */
export function isGhostEverReEnabled() {
  return safeGet(EVER_RE_ENABLED_KEY, false);
}

/** Marks "has turned it back on at least once" as true, permanently. Safe to call repeatedly. */
export function markGhostEverReEnabled() {
  safeSet(EVER_RE_ENABLED_KEY, true);
}
