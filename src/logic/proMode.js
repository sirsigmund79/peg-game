// ============================================================================
// logic/proMode.js
// ----------------------------------------------------------------------------
// One persisted boolean: whether Pro mode is on. Pro mode takes Undo away --
// every jump is final, and Reset (start the round over) is the only way back.
// Nothing else about the game changes.
//
// Defaults to FALSE. Unlike Ghost Outline (see logic/ghostSettings.js), which
// only helps and so ships on, this one takes a safety net away -- a setting
// that makes the game harder has to be asked for, never assumed.
//
// Kept as its own key/module rather than folded into ghostSettings.js, matching
// this codebase's one-concern-per-store convention.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const PRO_MODE_KEY = 'dot-hop:pro-mode';

/** @returns {boolean} whether Pro mode is currently switched on. */
export function isProMode() {
  return safeGet(PRO_MODE_KEY, false);
}

/** @param {boolean} value */
export function setProMode(value) {
  safeSet(PRO_MODE_KEY, Boolean(value));
}
