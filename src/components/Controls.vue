<!--
  ============================================================================
  components/Controls.vue
  ----------------------------------------------------------------------------
  The ergonomic utility zone: Undo and Reset, the only two ways to correct
  a mistake (unlimited undo, or start the round over -- there is no
  in-game Hint button). Lives in its own bottom strip so it always sits in
  natural mobile thumb-reach, below the board and stats.
  ============================================================================
-->
<script setup>
defineProps({
  canUndo: { type: Boolean, required: true },
});

const emit = defineEmits(['undo', 'reset']);
</script>

<template>
  <div class="utility-zone">
    <button type="button" class="control-button outline" :disabled="!canUndo" @click="emit('undo')">Undo</button>
    <button type="button" class="control-button solid" @click="emit('reset')">Reset</button>
  </div>
</template>

<style scoped>
.utility-zone {
  display: flex;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px));
}

.control-button {
  flex: 1;
  min-height: 52px;
  padding: 8px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 1rem;
  border-width: var(--control-border-width);
  border-style: solid;
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.control-button.outline {
  color: var(--color-accent);
  background: transparent;
  border-color: var(--color-accent);
}

.control-button.outline:not(:disabled):hover {
  background: var(--color-accent);
  color: var(--color-card-bg);
}

.control-button.outline:disabled {
  color: var(--color-ink-dim);
  border-color: var(--color-card-border);
  opacity: 0.6;
  cursor: not-allowed;
}

.control-button.solid {
  color: var(--color-card-bg);
  background: var(--color-peg);
  border-color: var(--color-peg);
}

.control-button.solid:hover {
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.control-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
