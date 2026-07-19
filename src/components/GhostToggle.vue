<!--
  ============================================================================
  components/GhostToggle.vue
  ----------------------------------------------------------------------------
  The real on/off switch for the Ghost Outline feature (see
  logic/ghostMoves.js and composables/useGhostOutline.js) -- deliberately
  small and low-key ("discreet"), since the feature itself is on by default
  and this is just an escape hatch. Only ever rendered once a player has
  found the secret line at the bottom of components/StatsView.vue (see
  `ghost.discovered`, gated by the caller in components/PlayView.vue) --
  before that, this component simply never mounts.

  Self-contained: reads composables/useGhostOutline.js's singleton directly
  rather than taking props, since this is global settings (one value for the
  whole app), not per-instance state.
  ============================================================================
-->
<script setup>
import { useGhostOutline } from '../composables/useGhostOutline.js';

const { ghost, setEnabled } = useGhostOutline();

const TOOLTIP =
  'When you select a peg, every hole it could jump to gets a ring. ' +
  "Dotted means you've already made that exact jump from this exact board state today -- solid means you haven't tried it yet. " +
  "Just a memory aid, never a hint about which move is good.";
</script>

<template>
  <div class="ghost-toggle-row">
    <button
      type="button"
      class="ghost-toggle"
      role="switch"
      :aria-checked="ghost.enabled"
      :title="TOOLTIP"
      @click="setEnabled(!ghost.enabled)"
    >
      <span class="ghost-toggle-icon" aria-hidden="true">👻</span>
      <span class="ghost-toggle-label">Ghost outline</span>
      <span class="ghost-toggle-track" :class="{ on: ghost.enabled }" aria-hidden="true">
        <span class="ghost-toggle-thumb"></span>
      </span>
    </button>
    <span class="ghost-toggle-info" :title="TOOLTIP" aria-hidden="true">?</span>
  </div>
</template>

<style scoped>
.ghost-toggle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 0 20px 10px;
}

.ghost-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ghost-toggle-icon {
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.8;
}

.ghost-toggle-label {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  color: var(--color-ink-dim);
}

.ghost-toggle-track {
  position: relative;
  width: 26px;
  height: 15px;
  border-radius: 999px;
  background: var(--color-card-border);
  transition: background-color 0.15s ease;
}

.ghost-toggle-track.on {
  background: var(--color-accent);
}

.ghost-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--color-card-bg);
  transition: transform 0.15s ease;
}

.ghost-toggle-track.on .ghost-toggle-thumb {
  transform: translateX(11px);
}

.ghost-toggle-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid var(--color-ink-dim);
  color: var(--color-ink-dim);
  font-size: 0.58rem;
  font-weight: 700;
  cursor: default;
}

.ghost-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
