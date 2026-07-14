<!--
  ============================================================================
  App.vue
  ----------------------------------------------------------------------------
  The page shell: applies the theme, renders the header/nav, and swaps in
  whichever page the URL (see composables/useRouter.js) points to --
  PlayView.vue (the actual game), ArchiveView.vue (pick a past puzzle), or,
  in a dev build only, DevToolsView.vue.

  This file used to own the live game state itself; that all moved to
  PlayView.vue so the game, the archive, and the dev tools can be genuinely
  separate pages instead of one screen with everything stacked on it.
  ============================================================================
-->
<script setup>
import { computed, watch } from 'vue';
import { useTheme } from './composables/useTheme.js';
import { useRouter } from './composables/useRouter.js';
import { EVENTS, track, trackPageview } from './services/analytics.js';
import PlayView from './components/PlayView.vue';
import ArchiveView from './components/ArchiveView.vue';
import StatsView from './components/StatsView.vue';
import DevToolsView from './components/DevToolsView.vue';
import StoryView from './components/StoryView.vue';

useTheme(); // applies the Moose theme's CSS variables to the page -- see composables/useTheme.js

// Vite sets import.meta.env.DEV to true for `npm run dev` and false for a
// production `npm run build` -- reading it into a plain variable here
// (rather than inline in the template) is required because Vue's template
// compiler can't parse `import.meta` expressions directly.
const isDevBuild = import.meta.env.DEV;

const { route, navigate } = useRouter();

// Whether the current hash actually points at a real page. Anything else
// (a typo'd path, a stale/removed link, a non-numeric puzzle number) isn't
// a page we have -- see the redirect-to-home watcher below.
const isKnownRoute = computed(() => {
  const [first, second] = route.segments;
  if (first === undefined) return true; // "#/" -- home
  if (first === 'archive') return true;
  if (first === 'stats') return true;
  if (first === 'dev') return isDevBuild;
  if (first === 'story') return true; // hidden prototype -- no nav link, see components/StoryView.vue
  if (first === 'play') return second === undefined || /^-?\d+$/.test(second);
  return false;
});

// A bad link should land on the home page, not a blank/broken screen --
// e.g. someone opens the site on an old, mistyped, or since-removed link.
// This corrects the URL itself (not just what's shown), so the address bar
// and reload both agree it's the home page.
watch(
  isKnownRoute,
  (known) => {
    if (!known) navigate('/');
  },
  { immediate: true }
);

// Any "#/play..." path (with or without a puzzle number) is the play page;
// "#/archive" is the archive; "#/dev" is the dev tools (only in a dev
// build -- real players hitting that URL just get the game instead, same
// as any other unrecognized path).
const page = computed(() => {
  if (route.segments[0] === 'archive') return 'archive';
  if (route.segments[0] === 'stats') return 'stats';
  if (route.segments[0] === 'dev' && isDevBuild) return 'dev';
  if (route.segments[0] === 'story') return 'story';
  return 'play';
});

// A manual $pageview per navigation -- see services/analytics.js for why
// PostHog's own pageview autocapture can't see this hash-based router.
watch(
  () => route.path,
  () => {
    const puzzleNumberSegment = page.value === 'play' ? route.segments[1] : undefined;
    trackPageview(page.value, puzzleNumberSegment !== undefined ? { puzzle_number: puzzleNumberSegment } : undefined);
  },
  { immediate: true }
);

function handleStatsNavClick() {
  track(EVENTS.STATS_NAV_CLICKED, {});
}
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="header-inner">
        <div class="header-text">
          <a href="#/" class="wordmark">
            Dot Hop
            <span class="beta-pill">Beta</span>
          </a>
        </div>
        <nav class="nav-links">
          
          <a href="#/stats" class="icon-link" :class="{ active: page === 'stats' }" aria-label="Stats" title="Stats" @click="handleStatsNavClick">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <span class="icon-link-label">Stats</span>
          </a>
          <a href="#/archive" class="nav-link" :class="{ active: page === 'archive' }">Archive</a>
        </nav>
      </div>
    </header>

    <main class="app">
      <PlayView v-if="page === 'play'" />
      <ArchiveView v-else-if="page === 'archive'" />
      <StatsView v-else-if="page === 'stats'" />
      <DevToolsView v-else-if="page === 'dev'" />
      <StoryView v-else-if="page === 'story'" />
    </main>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-page-bg);
}

.header {
  padding: max(14px, env(safe-area-inset-top, 0px)) 16px 10px;
  background: var(--color-header-bg);
  border-bottom: var(--frame-border);
}

.header-inner {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-text {
  text-align: left;
  min-width: 0;
}

.wordmark {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.3rem;
  letter-spacing: -0.2px;
  color: var(--color-header-text);
  text-decoration: none;
}

.beta-pill {
  padding: 2px 7px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.6rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-header-bg);
  background: var(--color-header-text);
  border-radius: 999px;
}

.nav-links {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--color-header-text-dim);
  background: transparent;
  color: var(--color-header-text-dim);
  text-decoration: none;
  cursor: pointer;
}

.nav-link.active {
  background: var(--color-header-text);
  border-color: var(--color-header-text);
  color: var(--color-header-bg);
}

.icon-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-header-text-dim);
  background: transparent;
  color: var(--color-header-text-dim);
  text-decoration: none;
  cursor: pointer;
}

.icon-link-label {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.7rem;
}

@media (hover: hover) {
  .icon-link:not(.active):hover {
    color: var(--color-header-text);
    border-color: var(--color-header-text);
  }
}

.icon-link:focus-visible {
  outline: 2px solid var(--color-header-text);
  outline-offset: 2px;
}

.icon-link.active {
  background: var(--color-header-text);
  border-color: var(--color-header-text);
  color: var(--color-header-bg);
}

.app {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>
