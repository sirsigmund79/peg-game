// ============================================================================
// composables/useHowToPlay.js
// ----------------------------------------------------------------------------
// A reactive singleton (same pattern as useGhostOutline.js) for the How to
// Play modal's open/closed state -- shared between App.vue's header "?"
// button (the only way to open it; see HowToPlayModal.vue) and the modal
// itself, without prop drilling a single boolean through every route.
// ============================================================================

import { reactive } from 'vue';
import { EVENTS, track } from '../services/analytics.js';

const state = reactive({ visible: false });

export function useHowToPlay() {
  function open() {
    state.visible = true;
    track(EVENTS.HOW_TO_PLAY_SHOWN);
  }

  /** @param {'manual'|'backdrop'|'escape'} source - how the modal was dismissed: its own CTA/close button, a backdrop click, or Escape. */
  function close(source) {
    if (!state.visible) return;
    state.visible = false;
    track(EVENTS.HOW_TO_PLAY_DISMISSED, { source });
  }

  return { state, open, close };
}
