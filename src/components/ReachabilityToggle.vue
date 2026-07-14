<!--
  ============================================================================
  components/ReachabilityToggle.vue
  ----------------------------------------------------------------------------
  A single small icon button that opts into the "Genius still reachable"
  live indicator (see composables/useReachabilityIndicator.js). There's only
  ever this one setting today, so it's a standalone inline toggle rather
  than a full settings screen -- kept out of StatBar.vue/Controls.vue, which
  are both otherwise single-purpose (pure display, and Undo/Reset only).
  ============================================================================
-->
<script setup>
defineProps({
  enabled: { type: Boolean, required: true },
});

const emit = defineEmits(['update:enabled']);
</script>

<template>
  <button
    type="button"
    class="reachability-toggle"
    :class="{ active: enabled }"
    :aria-pressed="enabled"
    :title="enabled ? 'Genius-reachable indicator: on' : 'Genius-reachable indicator: off'"
    @click="emit('update:enabled', !enabled)"
  >
    🧠
  </button>
</template>

<style scoped>
.reachability-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  background: transparent;
  border: 1px solid var(--color-card-border);
  border-radius: 999px;
  opacity: 0.45;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    border-color 0.15s ease;
}

.reachability-toggle.active {
  opacity: 1;
  border-color: var(--color-header-bg);
}

@media (hover: hover) {
  .reachability-toggle:hover {
    opacity: 0.75;
  }

  .reachability-toggle.active:hover {
    opacity: 1;
  }
}

.reachability-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
