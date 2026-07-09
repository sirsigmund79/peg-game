// ============================================================================
// composables/useRouter.js
// ----------------------------------------------------------------------------
// A deliberately tiny client-side router -- this app only has three pages
// (play, archive, dev tools), so pulling in vue-router for that felt like
// overkill next to the project's one runtime dependency (Vue itself).
// Routes live in the URL hash (e.g. "#/archive", "#/play/842") so the app
// stays a static single-page bundle with no server-side routing to set up.
//
// Everything here is one module-level reactive singleton (the same pattern
// composables/useTheme.js uses for theme state) -- every component that
// calls useRouter() shares the same current route, and window's
// "hashchange" event (fired on back/forward too) keeps it in sync.
// ============================================================================

import { reactive } from 'vue';

/** Splits "#/play/842?x=1" into { path: "/play/842", params: ["842"], query: {x:"1"} }. */
function parseHash() {
  const raw = window.location.hash.slice(1) || '/';
  const [pathAndParams, queryString] = raw.split('?');
  const segments = pathAndParams.split('/').filter(Boolean);
  const path = '/' + segments.join('/');
  const query = Object.fromEntries(new URLSearchParams(queryString ?? ''));
  return { path, segments, query };
}

const route = reactive(parseHash());

window.addEventListener('hashchange', () => {
  Object.assign(route, parseHash());
});

/**
 * @returns {{route: object, navigate: (path: string) => void}}
 *   `route.path` is the current path (e.g. "/", "/archive", "/play/842");
 *   `route.segments` is that path split on "/" (e.g. ["play", "842"]).
 */
export function useRouter() {
  /** Changes the URL hash, which triggers "hashchange" and updates `route` for every component using it. */
  function navigate(path) {
    window.location.hash = path;
  }

  return { route, navigate };
}
