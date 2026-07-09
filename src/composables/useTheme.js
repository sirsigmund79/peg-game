// ============================================================================
// composables/useTheme.js
// ----------------------------------------------------------------------------
// This file holds the game's visual identity as a small catalog of themes,
// each just a plain object of colors and fonts. Every component reads
// colors through CSS variables (e.g. `background: var(--color-hole)`)
// instead of writing colors directly -- so adding/editing a theme here is
// the ONLY place that needs to change; no component or game-logic file
// ever has to know a theme exists.
//
// There's currently no front-end UI for picking a theme -- App.vue just
// applies MOOSE_THEME (the default) unconditionally. The rest of the
// catalog and setTheme()/persistence below are kept in place (rather than
// deleted) so a picker can be reintroduced later without redesigning any
// of this.
// ============================================================================

import { reactive } from 'vue';
import { safeSet } from '../logic/storage.js';

const THEME_STORAGE_KEY = 'dot-hop:theme';

// A loud, saturated "printed activity-book" palette, re-skinned around a
// moose/forest identity (a nod to the "Eg-no-ra-moose" loss copy below) --
// warm birch-bark cream pages, a bold pine-green masthead, and an
// antler/harvest-amber board tray. Thick bark-brown borders and hard
// offset drop-shadows (not soft blurred ones) give the "sticker" poster
// look every other theme either keeps, loosens, or drops entirely.
const MOOSE_THEME = {
  id: 'moose',
  name: 'Moose',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#fbf2e0',
    '--color-header-bg': '#1c8c52',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#cdeed9',
    '--color-board-plate': '#f0b23a',
    '--color-board-border': 'transparent',
    '--color-hole': '#ffffff',
    '--color-hole-border': 'rgba(36, 27, 20, 0.35)',
    '--color-peg': '#1c8c52',
    '--color-peg-selected': '#1c8c52',
    '--color-accent': '#145c34',
    '--color-ink': '#241b14',
    '--color-ink-secondary': '#4a3826',
    '--color-ink-dim': '#8a7862',
    '--color-card-bg': '#ffffff',
    '--color-card-border': '#241b14',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '3px solid #241b14',
    '--frame-shadow-board': '5px 5px 0 #241b14',
    '--frame-shadow-card': '5px 5px 0 #241b14',
    '--frame-radius-board': '20px',
    '--control-border-width': '2.5px',
  },
};

// The pink option: same printed-sticker bones as Moose, re-dyed hot pink
// on soft blush, with deep plum ink instead of black so it doesn't just
// read as "Moose but pink".
const BUBBLEGUM_THEME = {
  id: 'bubblegum',
  name: 'Bubblegum',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#fff0f7',
    '--color-header-bg': '#ff2e93',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#ffd1e8',
    '--color-board-plate': '#ffb6d9',
    '--color-board-border': 'transparent',
    '--color-hole': '#ffffff',
    '--color-hole-border': 'rgba(122, 10, 74, 0.35)',
    '--color-peg': '#d6006c',
    '--color-peg-selected': '#d6006c',
    '--color-accent': '#7a0a4a',
    '--color-ink': '#3a0d24',
    '--color-ink-secondary': '#7a3a5c',
    '--color-ink-dim': '#b47b9a',
    '--color-card-bg': '#ffffff',
    '--color-card-border': '#3a0d24',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '3px solid #3a0d24',
    '--frame-shadow-board': '5px 5px 0 #3a0d24',
    '--frame-shadow-card': '5px 5px 0 #3a0d24',
    '--frame-radius-board': '20px',
    '--control-border-width': '2.5px',
  },
};

// The "pops more" option: black page, electric magenta/chartreuse/cyan,
// and a bigger offset shadow than any other theme -- the loudest, highest-
// contrast option in the catalog on purpose.
const NEON_THEME = {
  id: 'neon',
  name: 'Neon',
  colorScheme: 'dark',
  cssVariables: {
    '--color-page-bg': '#0e0e12',
    '--color-header-bg': '#ff00c8',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#ffd6f5',
    '--color-board-plate': '#caff00',
    '--color-board-border': 'transparent',
    '--color-hole': '#0e0e12',
    '--color-hole-border': 'rgba(0, 0, 0, 0.4)',
    '--color-peg': '#00e5ff',
    '--color-peg-selected': '#00e5ff',
    '--color-accent': '#ff00c8',
    '--color-ink': '#ffffff',
    '--color-ink-secondary': '#d8d8e2',
    '--color-ink-dim': '#8a8a9a',
    '--color-card-bg': '#17171d',
    '--color-card-border': '#ffffff',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '3px solid #ffffff',
    '--frame-shadow-board': '7px 7px 0 #ff00c8',
    '--frame-shadow-card': '7px 7px 0 #ff00c8',
    '--frame-radius-board': '16px',
    '--control-border-width': '3px',
  },
};

// Comic-book primaries: red masthead, blue board, yellow holes, red pegs
// -- the same three-color trick as a Lichtenstein panel -- with thick
// black outlines and offset shadows tinted a DIFFERENT primary than what
// they sit behind, for that two-tone comic-panel look. Anton (a tall,
// bold poster/headline face) carries the wordmark; body text stays in
// the everyday sans so it's still easy to read.
const POP_ART_THEME = {
  id: 'popArt',
  name: 'Pop Art',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#fff8ec',
    '--color-header-bg': '#e63946',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#ffd0d4',
    '--color-board-plate': '#2a5eea',
    '--color-board-border': 'transparent',
    '--color-hole': '#ffde59',
    '--color-hole-border': '#10121a',
    '--color-peg': '#e63946',
    '--color-peg-selected': '#e63946',
    '--color-accent': '#2a5eea',
    '--color-ink': '#10121a',
    '--color-ink-secondary': '#3c3f4a',
    '--color-ink-dim': '#74788a',
    '--color-card-bg': '#ffffff',
    '--color-card-border': '#10121a',
    '--font-display': '"Anton", "Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '4px solid #10121a',
    '--frame-shadow-board': '6px 6px 0 #e63946',
    '--frame-shadow-card': '6px 6px 0 #2a5eea',
    '--frame-radius-board': '12px',
    '--control-border-width': '3px',
  },
};

// Dark mode: unlike every "poster" theme above, this one drops the thick
// hard-edged border/shadow trick entirely in favor of soft, blurred, low-
// opacity shadows and hairline borders -- what reads as "sticker" on a
// light page reads as "cardboard cutout" on a dark one, so dark mode gets
// its own quieter frame language instead.
const MIDNIGHT_THEME = {
  id: 'midnight',
  name: 'Midnight',
  colorScheme: 'dark',
  cssVariables: {
    '--color-page-bg': '#12141a',
    '--color-header-bg': '#1f9d76',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#cdeee1',
    '--color-board-plate': '#2a2e3a',
    '--color-board-border': '#383d4c',
    '--color-hole': '#1b1e27',
    '--color-hole-border': 'rgba(255, 255, 255, 0.14)',
    '--color-peg': '#1f9d76',
    '--color-peg-selected': '#1f9d76',
    '--color-accent': '#34d1a0',
    '--color-ink': '#f5f6fa',
    '--color-ink-secondary': '#b6bbcc',
    '--color-ink-dim': '#767c8f',
    '--color-card-bg': '#1b1e27',
    '--color-card-border': '#33384a',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '1.5px solid #33384a',
    '--frame-shadow-board': '0 12px 28px rgba(0, 0, 0, 0.55)',
    '--frame-shadow-card': '0 8px 20px rgba(0, 0, 0, 0.45)',
    '--frame-radius-board': '20px',
    '--control-border-width': '1.5px',
  },
};

// Sophisticated/refined: a low-saturation editorial palette (ink-navy,
// antique gold, deep burgundy, warm ivory) with hairline borders and
// soft, blurred shadows instead of hard offset ones, plus a single serif
// (Fraunces) reserved for the wordmark/headings -- the one theme here
// that intentionally looks quiet rather than loud.
const ATELIER_THEME = {
  id: 'atelier',
  name: 'Atelier',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#f6f1e7',
    '--color-header-bg': '#22303f',
    '--color-header-text': '#f6f1e7',
    '--color-header-text-dim': '#9fb0bd',
    '--color-board-plate': '#e4dcc8',
    '--color-board-border': '#cdbfa0',
    '--color-hole': '#f6f1e7',
    '--color-hole-border': 'rgba(34, 48, 63, 0.25)',
    '--color-peg': '#6b2737',
    '--color-peg-selected': '#6b2737',
    '--color-accent': '#a8823c',
    '--color-ink': '#22303f',
    '--color-ink-secondary': '#5b6773',
    '--color-ink-dim': '#93876f',
    '--color-card-bg': '#fffdf8',
    '--color-card-border': '#d8cdb0',
    '--font-display': '"Fraunces", Georgia, serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '1px solid #d8cdb0',
    '--frame-shadow-board': '0 14px 32px rgba(34, 48, 63, 0.18)',
    '--frame-shadow-card': '0 8px 18px rgba(34, 48, 63, 0.12)',
    '--frame-radius-board': '14px',
    '--control-border-width': '1px',
  },
};

// Modern: near-white/near-black neutrals, a single crisp indigo accent,
// thin borders, soft shadows, and extra-rounded corners -- reads as a
// clean contemporary app rather than a printed poster.
const MODERN_THEME = {
  id: 'modern',
  name: 'Modern',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#f5f5f7',
    '--color-header-bg': '#111318',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#9aa0ac',
    '--color-board-plate': '#ffffff',
    '--color-board-border': '#e4e4e8',
    '--color-hole': '#eef0f3',
    '--color-hole-border': 'rgba(17, 19, 24, 0.12)',
    '--color-peg': '#4f46e5',
    '--color-peg-selected': '#4f46e5',
    '--color-accent': '#4f46e5',
    '--color-ink': '#111318',
    '--color-ink-secondary': '#565b66',
    '--color-ink-dim': '#8b909c',
    '--color-card-bg': '#ffffff',
    '--color-card-border': '#e4e4e8',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '1px solid #e4e4e8',
    '--frame-shadow-board': '0 10px 30px rgba(17, 19, 24, 0.08)',
    '--frame-shadow-card': '0 6px 16px rgba(17, 19, 24, 0.06)',
    '--frame-radius-board': '26px',
    '--control-border-width': '1px',
  },
};

// Highlands: a low-poly fantasy-adventure landscape -- mossy parchment
// page, forest-green masthead, grass-green board, and pegs the color of
// the little gold autumn trees dotting that kind of scene, with a river-
// blue selection ring. Keeps Moose's poster-sticker frame language, just
// with green and gold swapped from board to peg (rather than duplicating
// Moose's exact amber-board/green-peg combo).
const HIGHLANDS_THEME = {
  id: 'highlands',
  name: 'Highlands',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#eef2e3',
    '--color-header-bg': '#3f7d52',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#cfe6d4',
    '--color-board-plate': '#4ea86d',
    '--color-board-border': 'transparent',
    '--color-hole': '#eef2e3',
    '--color-hole-border': 'rgba(31, 43, 38, 0.35)',
    '--color-peg': '#e8c84a',
    '--color-peg-selected': '#e8c84a',
    '--color-accent': '#2f8fd0',
    '--color-ink': '#1f2b26',
    '--color-ink-secondary': '#46574c',
    '--color-ink-dim': '#7c8c7f',
    '--color-card-bg': '#ffffff',
    '--color-card-border': '#1f2b26',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '3px solid #1f2b26',
    '--frame-shadow-board': '5px 5px 0 #1f2b26',
    '--frame-shadow-card': '5px 5px 0 #1f2b26',
    '--frame-radius-board': '18px',
    '--control-border-width': '2.5px',
  },
};

// Ponder: a clean minimal puzzle-site look -- white page, light-gray card
// modules, barely-there shadows, big soft corners, an indigo-blue banner
// header/peg color, and near-black for the "controls" accent (mirroring
// that kind of site's black pill buttons).
const PONDER_THEME = {
  id: 'ponder',
  name: 'Ponder',
  colorScheme: 'light',
  cssVariables: {
    '--color-page-bg': '#ffffff',
    '--color-header-bg': '#3b5bdb',
    '--color-header-text': '#ffffff',
    '--color-header-text-dim': '#c7d2fa',
    '--color-board-plate': '#f0f0f2',
    '--color-board-border': '#e5e5ea',
    '--color-hole': '#ffffff',
    '--color-hole-border': 'rgba(20, 22, 42, 0.12)',
    '--color-peg': '#3b5bdb',
    '--color-peg-selected': '#3b5bdb',
    '--color-accent': '#14162a',
    '--color-ink': '#14162a',
    '--color-ink-secondary': '#565a6e',
    '--color-ink-dim': '#9498a6',
    '--color-card-bg': '#f7f7f8',
    '--color-card-border': '#e5e5ea',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '1px solid #e5e5ea',
    '--frame-shadow-board': '0 1px 3px rgba(20, 22, 42, 0.08)',
    '--frame-shadow-card': '0 1px 3px rgba(20, 22, 42, 0.08)',
    '--frame-radius-board': '24px',
    '--control-border-width': '1px',
  },
};

// Dominion: a dark strategy-game map -- near-black page, a gold banner
// header (like that kind of game's gold resource/icon accents), a deep
// teal-green board (one of a map's biome patches), gold pegs (little
// resource tokens), and a rust-red selection ring (another biome color).
// Soft dark shadows rather than the hard poster ones, same reasoning as
// Midnight: a hard shadow on a near-black page just disappears.
const DOMINION_THEME = {
  id: 'dominion',
  name: 'Dominion',
  colorScheme: 'dark',
  cssVariables: {
    '--color-page-bg': '#1b1d22',
    '--color-header-bg': '#d9a53f',
    '--color-header-text': '#1b1d22',
    '--color-header-text-dim': 'rgba(27, 29, 34, 0.62)',
    '--color-board-plate': '#2f6b5e',
    '--color-board-border': '#1c443a',
    '--color-hole': '#1b1d22',
    '--color-hole-border': 'rgba(224, 184, 74, 0.35)',
    '--color-peg': '#e0b84a',
    '--color-peg-selected': '#e0b84a',
    '--color-accent': '#8a3a3a',
    '--color-ink': '#f2ede0',
    '--color-ink-secondary': '#b9b2a0',
    '--color-ink-dim': '#7d7868',
    '--color-card-bg': '#24272e',
    '--color-card-border': '#3a3d46',
    '--font-display': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--font-ui': '"Plus Jakarta Sans", system-ui, sans-serif',
    '--frame-border': '2px solid #3a3d46',
    '--frame-shadow-board': '0 14px 30px rgba(0, 0, 0, 0.5)',
    '--frame-shadow-card': '0 8px 20px rgba(0, 0, 0, 0.4)',
    '--frame-radius-board': '16px',
    '--control-border-width': '2px',
  },
};

/** Every theme, keyed by id -- also the order they're offered in the picker. */
export const THEMES = {
  moose: MOOSE_THEME,
  bubblegum: BUBBLEGUM_THEME,
  neon: NEON_THEME,
  popArt: POP_ART_THEME,
  midnight: MIDNIGHT_THEME,
  atelier: ATELIER_THEME,
  modern: MODERN_THEME,
  highlands: HIGHLANDS_THEME,
  ponder: PONDER_THEME,
  dominion: DOMINION_THEME,
};

export const THEME_LIST = Object.values(THEMES);

const DEFAULT_THEME_ID = MOOSE_THEME.id;

/**
 * Turns a peg count into a friendly one-liner for the result screen. Kept
 * alongside the theme catalog (rather than in rules.js) because the
 * WORDING is a visual/copy choice, while rules.js's getRankForPegCount()
 * is the neutral, always-true rank. This copy is shared by every color
 * theme -- only the palette changes when you switch themes, not the jokes.
 *
 * @param {number} pegsRemaining
 * @returns {string}
 */
export function getWinCopy(pegsRemaining) {
  if (pegsRemaining === 1) return '🧠 Genius! Left one peg.';
  if (pegsRemaining === 2) return 'Purty smart.';
  if (pegsRemaining === 3) return "Just plain dumb (the board's words, not ours).";
  return "Eg-no-ra-moose 🫎 — leave four? We won't tell.";
}

// Always starts on the default theme -- with no picker UI, there's no way
// for a player to have chosen anything else, so a stale localStorage value
// from before the picker was removed (or from dev testing) is ignored
// rather than silently sticking.
const themeState = reactive({ activeId: DEFAULT_THEME_ID });

/** Copies every `--css-variable: value` pair from the active theme onto the page root. */
function applyThemeToDocument() {
  const activeTheme = THEMES[themeState.activeId] || MOOSE_THEME;
  const root = document.documentElement;
  for (const [propertyName, value] of Object.entries(activeTheme.cssVariables)) {
    root.style.setProperty(propertyName, value);
  }
  // Lets native form controls (number inputs, sliders in the dev/sound
  // panels) pick light or dark chrome to match, instead of always
  // rendering as if the page were light.
  root.style.colorScheme = activeTheme.colorScheme;
}

/** Switches the active theme, persists the choice, and re-applies it immediately. */
export function setTheme(themeId) {
  if (!THEMES[themeId] || themeId === themeState.activeId) return;
  themeState.activeId = themeId;
  safeSet(THEME_STORAGE_KEY, themeId);
  applyThemeToDocument();
}

/** Applies the saved (or default) theme to the page. Safe to call from multiple components -- applying it twice is harmless. */
export function useTheme() {
  applyThemeToDocument();
  return { themeState, themes: THEME_LIST, setTheme };
}
