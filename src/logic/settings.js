// ============================================================================
// logic/settings.js
// ----------------------------------------------------------------------------
// Small, player-facing preference toggles that aren't tied to any one
// puzzle or round -- currently just the opt-in "Genius still reachable"
// live indicator (see composables/useReachabilityIndicator.js). Off by
// default: this only ever runs for a player who has explicitly turned it
// on, so everyone else pays zero cost for it.
// ============================================================================

import { safeGet, safeSet } from './storage.js';

const LIVE_REACHABILITY_KEY = 'dot-hop:live-reachability-enabled';

/** @returns {boolean} whether the player has opted into the live "Genius still reachable" indicator. */
export function isLiveReachabilityEnabled() {
  return safeGet(LIVE_REACHABILITY_KEY, false);
}

/** @param {boolean} enabled */
export function setLiveReachabilityEnabled(enabled) {
  safeSet(LIVE_REACHABILITY_KEY, enabled);
}
