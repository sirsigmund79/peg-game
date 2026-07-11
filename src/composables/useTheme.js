// ============================================================================
// composables/useTheme.js
// ----------------------------------------------------------------------------
// The game's visual identity: one theme (Moose), applied unconditionally on
// load. Every component reads colors through CSS variables (e.g.
// `background: var(--color-hole)`) instead of writing colors directly -- so
// re-skinning this one theme is the only place that needs to change; no
// component or game-logic file ever has to know a theme exists.
//
// This game used to ship 10 selectable themes with no picker UI to choose
// between them -- simplified down to just the default (Moose) alongside the
// multi-color peg rework, since peg color is no longer a purely cosmetic,
// per-theme choice (it now carries game meaning -- see logic/pegColors.js).
// ============================================================================

// A loud, saturated "printed activity-book" palette, re-skinned around a
// moose/forest identity (a nod to the bottom-tier rank's original
// "Eg-no-ra-moose" copy in logic/rules.js, since renamed to "Warming Up")
// -- warm birch-bark cream pages, a bold pine-green
// masthead, and an antler/harvest-amber board tray. Thick bark-brown
// borders and hard offset drop-shadows give it a "sticker" poster look.
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
    // Still used as a brand accent (Controls.vue's Reset button,
    // ResultFooter.vue's Share button) -- NOT for peg rendering, which
    // now comes from the fixed palette in logic/pegColors.js instead.
    '--color-peg': '#1c8c52',
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

/** Copies every `--css-variable: value` pair from the theme onto the page root. */
function applyThemeToDocument() {
  const root = document.documentElement;
  for (const [propertyName, value] of Object.entries(MOOSE_THEME.cssVariables)) {
    root.style.setProperty(propertyName, value);
  }
  // Lets native form controls (number inputs, sliders in the dev/sound
  // panels) pick light or dark chrome to match, instead of always
  // rendering as if the page were light.
  root.style.colorScheme = MOOSE_THEME.colorScheme;
}

/** Applies the theme to the page. Safe to call from multiple components -- applying it twice is harmless. */
export function useTheme() {
  applyThemeToDocument();
}
