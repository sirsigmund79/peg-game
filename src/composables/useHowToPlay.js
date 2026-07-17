// ============================================================================
// composables/useHowToPlay.js
// ----------------------------------------------------------------------------
// A reactive singleton (same pattern as useGhostOutline.js) for the How to
// Play modal's open/closed state -- shared between App.vue's header "?"
// button, App.vue's own first-visit auto-open (see openIfFirstVisit() below),
// and the modal itself (HowToPlayModal.vue), without prop drilling a single
// boolean through every route.
// ============================================================================

import { reactive } from 'vue';
import { EVENTS, track } from '../services/analytics.js';
import { safeGet, safeSet } from '../logic/storage.js';

const SEEN_KEY = 'dot-hop:how-to-play-seen';

const state = reactive({ visible: false });

export function useHowToPlay() {
  /** @param {'manual'|'auto'} source - the header's "?" button, or the automatic first-visit open. */
  function open(source = 'manual') {
    state.visible = true;
    safeSet(SEEN_KEY, true);
    track(EVENTS.HOW_TO_PLAY_SHOWN, { source });
  }

  /** Opens the modal automatically, but only the very first time this browser ever opens the game. Safe to call on every app boot -- a no-op once `SEEN_KEY` is set. */
  function openIfFirstVisit() {
    if (safeGet(SEEN_KEY, false)) return;
    open('auto');
  }

  /** @param {'manual'|'backdrop'|'escape'} source - how the modal was dismissed: its own CTA/close button, a backdrop click, or Escape. */
  function close(source) {
    if (!state.visible) return;
    state.visible = false;
    track(EVENTS.HOW_TO_PLAY_DISMISSED, { source });
  }

  return { state, open, openIfFirstVisit, close };
}
