// ============================================================================
// composables/useProMode.js
// ----------------------------------------------------------------------------
// A module-level reactive singleton wrapping logic/proMode.js's persisted
// boolean -- same pattern as useGhostOutline.js / useRouter.js / useTheme.js,
// so components/ProModeToggle.vue and components/PlayView.vue always agree on
// the current value without a page reload.
//
// This is global settings (one value for the whole app), not per-round state:
// turning Pro on is a statement about how you want to play, and it outlives
// the board you happened to be on when you flipped it.
// ============================================================================

import { reactive } from 'vue';
import { isProMode, setProMode } from '../logic/proMode.js';
import { EVENTS, track } from '../services/analytics.js';

const pro = reactive({ enabled: isProMode() });

/**
 * @returns {{pro: {enabled: boolean}, setEnabled: (value: boolean) => void}}
 */
export function useProMode() {
  /**
   * Flips the switch and persists it. Flipping it mid-round is deliberately
   * allowed: nothing here is retroactive (turning Pro on doesn't erase the
   * undo stack, it just stops offering the button), so forbidding it would
   * only be an inconvenience.
   */
  function setEnabled(value) {
    const nextValue = Boolean(value);
    if (nextValue === pro.enabled) return;
    pro.enabled = nextValue;
    setProMode(nextValue);
    track(EVENTS.PRO_MODE_CHANGED, { enabled: nextValue });
  }

  return { pro, setEnabled };
}
