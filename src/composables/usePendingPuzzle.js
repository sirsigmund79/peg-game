// ============================================================================
// composables/usePendingPuzzle.js
// ----------------------------------------------------------------------------
// A one-item hand-off slot for "play this exact puzzle object next",
// used only by the level editor (components/EditorView.vue, now hosted on
// the dev tools page) to send a freshly-designed custom puzzle over to
// PlayView.vue, which lives on a different route/page.
//
// Puzzle NUMBERS (today's puzzle, an archive pick, a dev puzzle-jump) can
// just travel in the URL -- see composables/useRouter.js -- but a custom
// design has no puzzle number; it's a whole ad-hoc object EditorView just
// built. That can't round-trip through a URL, so it takes this shared
// module-level ref instead (the same "one reactive singleton" pattern
// composables/useTheme.js uses).
// ============================================================================

import { ref } from 'vue';

export const pendingCustomPuzzle = ref(null);
