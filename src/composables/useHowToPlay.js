// ============================================================================
// composables/useHowToPlay.js
// ----------------------------------------------------------------------------
// A reactive singleton (same pattern as useGhostOutline.js) for the How to
// Play modal's open/closed state -- shared between App.vue's header "?"
// button and the modal itself (HowToPlayModal.vue), without prop drilling a
// single boolean through every route.
//
// The modal used to open itself automatically on a browser's first-ever
// visit; it no longer does (players found the auto-popup more confusing than
// helpful), so it's now reached ONLY on purpose, via the header's "?" button.
// ============================================================================

import { reactive } from 'vue';
import { EVENTS, track } from '../services/analytics.js';

const state = reactive({ visible: false });

export function useHowToPlay() {
  /** @param {'manual'} source - kept for parity with the dismissed event; the header's "?" button is the only opener now. */
  function open(source = 'manual') {
    state.visible = true;
    track(EVENTS.HOW_TO_PLAY_SHOWN, { source });
  }

  /**
   * @param {'manual'|'backdrop'|'escape'} source - how the modal was dismissed: its own CTA/close button, a backdrop click, or Escape.
   * @param {number} [step] - the furthest 1-indexed step the player reached before dismissing, so we can see where the walkthrough loses people.
   */
  function close(source, step) {
    if (!state.visible) return;
    state.visible = false;
    track(EVENTS.HOW_TO_PLAY_DISMISSED, { source, step });
  }

  return { state, open, close };
}
