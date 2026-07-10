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
import PlayView from './components/PlayView.vue';
import ArchiveView from './components/ArchiveView.vue';
import DevToolsView from './components/DevToolsView.vue';
import StoryView from './components/StoryView.vue';
import SoundToggleButton from './components/SoundToggleButton.vue';

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
  if (route.segments[0] === 'dev' && isDevBuild) return 'dev';
  if (route.segments[0] === 'story') return 'story';
  return 'play';
});
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="header-top">
        <a href="#/" class="wordmark">
          Dot Hop
          <span class="beta-pill">Beta</span>
        </a>
        <nav class="nav-links">
          <SoundToggleButton />
          <a href="#/archive" class="nav-link" :class="{ active: page === 'archive' }">Archive</a>
        </nav>
      </div>
      <p class="tagline">Hop same-color pegs over each other until each color is down to its best.</p>
    </header>

    <main class="app">
      <PlayView v-if="page === 'play'" />
      <ArchiveView v-else-if="page === 'archive'" />
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
  text-align: center;
  background: var(--color-header-bg);
  border-bottom: var(--frame-border);
}

.header-top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
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

.tagline {
  margin: 4px 0 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  color: var(--color-header-text-dim);
}

.nav-links {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 4px;
}

.nav-link {
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

.app {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>
