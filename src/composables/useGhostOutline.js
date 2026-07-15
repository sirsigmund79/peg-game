// ============================================================================
// composables/useGhostOutline.js
// ----------------------------------------------------------------------------
// A tiny module-level reactive singleton (same pattern as useRouter.js /
// useTheme.js) wrapping logic/ghostSettings.js's persisted booleans, so
// components/StatsView.vue and components/GhostToggle.vue (and
// composables/useGame.js, which reads `enabled`/`flagEnabled` to decide
// whether to compute ghost rings at all) always agree on the current value
// without needing a page reload to see each other's changes.
//
// `flagEnabled` is logic/featureFlags.js's homemade launch switch -- a
// hardcoded constant, not something that changes at runtime, but kept here
// (rather than having every consumer import featureFlags.js directly) so
// every "is Ghost Outline live at all right now" check reads one property,
// `ghost.flagEnabled`, the same way it would if this were ever swapped for
// something fancier later.
// `enabled` is the player's own on/off switch (defaults on). `discovered`
// is a one-way flag for "has this player ever found the secret line in
// Stats" -- it only ever goes false -> true, and gates whether
// components/GhostToggle (the in-game on/off control) renders at all. See
// logic/ghostSettings.js's header for why these are kept as independent
// booleans.
// ============================================================================

import { reactive } from 'vue';
import {
  isGhostEnabled,
  setGhostEnabled,
  isGhostDiscovered,
  markGhostDiscovered,
  isGhostEverDisabled,
  markGhostEverDisabled,
  isGhostEverReEnabled,
  markGhostEverReEnabled,
} from '../logic/ghostSettings.js';
import { GHOST_OUTLINE_ENABLED } from '../logic/featureFlags.js';
import { trackGhostOutlineDisabled, trackGhostOutlineReEnabled } from '../services/analytics.js';

const ghost = reactive({
  flagEnabled: GHOST_OUTLINE_ENABLED,
  enabled: isGhostEnabled(),
  discovered: isGhostDiscovered(),
});

/**
 * @returns {{ghost: {flagEnabled: boolean, enabled: boolean, discovered: boolean}, setEnabled: (value: boolean) => void, discover: () => void}}
 */
export function useGhostOutline() {
  /**
   * Flips the player's own on/off switch and persists it. Also records, at
   * most once each per browser lifetime, whether the player has EVER turned
   * it off and whether they've EVER turned it back on after that -- see
   * logic/ghostSettings.js's `everDisabled`/`everReEnabled` and
   * services/analytics.js's trackGhostOutlineDisabled()/
   * trackGhostOutlineReEnabled(). Compares against the OLD value before
   * assigning, since both of those only mean anything as a transition, not
   * a static value.
   */
  function setEnabled(value) {
    const nextValue = Boolean(value);
    if (ghost.enabled && !nextValue && !isGhostEverDisabled()) {
      markGhostEverDisabled();
      trackGhostOutlineDisabled();
    }
    if (!ghost.enabled && nextValue && !isGhostEverReEnabled()) {
      markGhostEverReEnabled();
      trackGhostOutlineReEnabled();
    }
    ghost.enabled = nextValue;
    setGhostEnabled(nextValue);
  }

  /** Marks the secret Stats-page line as found, permanently. A no-op past the first call. */
  function discover() {
    if (ghost.discovered) return;
    ghost.discovered = true;
    markGhostDiscovered();
  }

  return { ghost, setEnabled, discover };
}
