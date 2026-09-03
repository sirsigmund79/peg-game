<!--
  ============================================================================
  components/ProModeToggle.vue
  ----------------------------------------------------------------------------
  The on/off switch for Pro mode (see logic/proMode.js): one switch that
  takes Undo away, and nothing else.

  Borrowed from the difficulty toggle in Breadcrumbs, our sibling game:

    - The control names the mode it is in, not just the word "Mode". A
      setting you cannot see the state of is a setting players forget they
      changed, and this one changes what the board lets you do.
    - One line saying what the live mode does, shown only while Pro is on --
      that is the moment it earns its space, because it explains where the
      Undo button just went. Off is the plain state of the game and answers
      for itself.
    - Flipping it mid-round is allowed. Nothing here is retroactive, so the
      rule would only be an inconvenience.

  Sits directly above components/Controls.vue on purpose: the strip it
  changes is the next thing down the page, so the button disappearing is the
  reply to the tap.

  Self-contained: reads composables/useProMode.js's singleton directly rather
  than taking props, since this is global settings, not per-instance state.
  ============================================================================
-->
<script setup>
import { useProMode } from '../composables/useProMode.js';

const { pro, setEnabled } = useProMode();

const TOOLTIP =
  'Pro mode hides the Undo button — every jump is final, and Reset is the only way back. ' +
  'Nothing else about the puzzle changes.';
</script>

<template>
  <div class="pro-toggle-row">
    <button
      type="button"
      class="pro-toggle"
      role="switch"
      :aria-checked="pro.enabled"
      :title="TOOLTIP"
      @click="setEnabled(!pro.enabled)"
    >
      <span class="pro-toggle-icon" aria-hidden="true">🎯</span>
      <span class="pro-toggle-label">Pro mode</span>
      <span class="pro-toggle-track" :class="{ on: pro.enabled }" aria-hidden="true">
        <span class="pro-toggle-thumb"></span>
      </span>
    </button>
    <p v-if="pro.enabled" class="pro-toggle-what">No Undo — every jump is final.</p>
  </div>
</template>

<style scoped>
/* Column, unlike GhostToggle.vue's single row, so the caption can sit under
   the switch when Pro is on without shoving it off-centre. */
.pro-toggle-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 0 20px 10px;
}

.pro-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pro-toggle-icon {
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.8;
}

.pro-toggle-label {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  color: var(--color-ink-dim);
}

.pro-toggle-track {
  position: relative;
  width: 26px;
  height: 15px;
  border-radius: 999px;
  background: var(--color-card-border);
  transition: background-color 0.15s ease;
}

.pro-toggle-track.on {
  background: var(--color-accent);
}

.pro-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--color-card-bg);
  transition: transform 0.15s ease;
}

.pro-toggle-track.on .pro-toggle-thumb {
  transform: translateX(11px);
}

.pro-toggle-what {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.68rem;
  color: var(--color-ink-dim);
}

.pro-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
