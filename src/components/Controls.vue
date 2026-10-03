<!--
  ============================================================================
  components/Controls.vue
  ----------------------------------------------------------------------------
  The ergonomic utility zone: Reset, the only way to correct a mistake
  (there is no Undo and no in-game Hint button -- every jump is final). Lives in its own bottom strip so it always sits in
  natural mobile thumb-reach, below the board and stats.
  ============================================================================
-->
<script setup>
const emit = defineEmits(['reset']);
</script>

<template>
  <div class="utility-zone">
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
    border-color 0.15s ease;
}


.control-button.solid {
  color: var(--color-card-bg);
  background: var(--color-peg);
  border-color: var(--color-peg);
}

/* Hover only on devices that actually have a hovering pointer -- on touch,
   the browser fakes :hover on tap and doesn't clear it until the next tap
   lands elsewhere, so an unguarded :hover here would leave the button stuck
   looking pressed after every tap. */
@media (hover: hover) {
  .control-button.solid:hover {
    background: var(--color-ink);
    border-color: var(--color-ink);
  }
}

.control-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
