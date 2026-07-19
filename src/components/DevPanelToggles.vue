<!--
  ============================================================================
  components/DevPanelToggles.vue
  ----------------------------------------------------------------------------
  Dev-only (see PlayView.vue's `isDevBuild` gate): a small horizontal row of
  chips for showing/hiding this page's dev panels one at a time -- see
  composables/useDevPanels.js for the persisted on/off state itself. Kept
  deliberately plain/utilitarian (monospace, no theme colors) to read as
  obviously-not-part-of-the-real-game, matching
  components/TemporaryWatchSolveButton.vue's existing dev styling.
  ============================================================================
-->
<script setup>
import { useDevPanels } from '../composables/useDevPanels.js';

const { devPanels, togglePanel } = useDevPanels();

const PANEL_LABELS = [
  { key: 'searchTree', label: 'Search tree' },
  { key: 'difficulty', label: 'Hard vs. easy' },
  { key: 'breadthDepth', label: 'Breadth vs. depth' },
  { key: 'watchSolve', label: 'Watch Solve' },
];
</script>

<template>
  <div class="dev-panel-toggles">
    <button
      v-for="panel in PANEL_LABELS"
      :key="panel.key"
      type="button"
      class="dev-panel-chip"
      :class="{ on: devPanels[panel.key] }"
      :aria-pressed="devPanels[panel.key]"
      @click="togglePanel(panel.key)"
    >
      {{ devPanels[panel.key] ? '✓' : '✕' }} {{ panel.label }}
    </button>
  </div>
</template>

<style scoped>
.dev-panel-toggles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 12px auto 0;
  max-width: 460px;
}

.dev-panel-chip {
  font-family: monospace;
  font-size: 0.72rem;
  color: #fff;
  background: #6b6b6b;
  border: none;
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  opacity: 0.6;
}

.dev-panel-chip.on {
  background: #b23b3b;
  opacity: 1;
}
</style>
