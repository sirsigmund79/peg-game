// ============================================================================
// composables/useDevPanels.js
// ----------------------------------------------------------------------------
// Dev-only (see App.vue's `isDevBuild` gate -- this never ships to real
// players): which of PlayView.vue's dev panels (the search-tree visualizer,
// the difficulty profile, the breadth/depth thumbnails) and the temporary
// Watch Solve button are currently shown. All default to on, matching this
// page's behavior before this toggle menu existed, so a fresh dev checkout
// looks exactly the same until someone actually turns something off.
//
// A tiny module-level reactive singleton (same pattern as
// composables/useGhostOutline.js), persisted so a toggle survives a page
// reload -- these panels can get in the way of quickly clicking through the
// board during everyday dev work, and re-hiding them every reload would be
// annoying.
// ============================================================================

import { reactive } from 'vue';
import { safeGet, safeSet } from '../logic/storage.js';

const STORAGE_KEY = 'dot-hop:dev-panels';

const DEFAULTS = {
  searchTree: true,
  difficulty: true,
  breadthDepth: true,
  watchSolve: true,
};

const devPanels = reactive({ ...DEFAULTS, ...safeGet(STORAGE_KEY, {}) });

/**
 * @returns {{devPanels: {searchTree: boolean, difficulty: boolean, breadthDepth: boolean, watchSolve: boolean}, togglePanel: (key: string) => void}}
 */
export function useDevPanels() {
  /** Flips one panel's visibility and persists the whole set. */
  function togglePanel(key) {
    devPanels[key] = !devPanels[key];
    safeSet(STORAGE_KEY, { ...devPanels });
  }

  return { devPanels, togglePanel };
}
