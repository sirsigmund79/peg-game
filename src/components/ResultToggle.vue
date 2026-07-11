<!--
  ============================================================================
  components/ResultToggle.vue
  ----------------------------------------------------------------------------
  The result screen's "This game" / "Best" segmented control -- since a day's
  puzzle can be replayed any number of times from the archive (see
  components/ArchiveView.vue / ArchiveDayStrip.vue), this lets a player flip
  between the attempt they just played and their best-ever result for that
  day (see logic/bestResults.js). Defaults to "This game" every time a round
  ends (see components/PlayView.vue) -- switching never replays the reveal
  animation, it's an instant swap of which result record is displayed.

  No reusable segmented-control component exists elsewhere in the codebase;
  this follows the same plain two-button, active-class pattern already used
  by components/EditorView.vue's toolbar-row rather than inventing a generic
  one for a single use site.
  ============================================================================
-->
<script setup>
defineProps({
  modelValue: { type: String, required: true }, // 'this' | 'best'
});

defineEmits(['update:modelValue']);
</script>

<template>
  <div class="result-toggle" role="tablist" aria-label="Result view">
    <button
      type="button"
      class="toggle-button"
      role="tab"
      :aria-selected="modelValue === 'this'"
      :class="{ active: modelValue === 'this' }"
      @click="$emit('update:modelValue', 'this')"
    >
      This game
    </button>
    <button
      type="button"
      class="toggle-button"
      role="tab"
      :aria-selected="modelValue === 'best'"
      :class="{ active: modelValue === 'best' }"
      @click="$emit('update:modelValue', 'best')"
    >
      Best
    </button>
  </div>
</template>

<style scoped>
.result-toggle {
  display: inline-flex;
  align-self: center;
  padding: 3px;
  gap: 3px;
  background: var(--color-page-bg);
  border: var(--frame-border);
  border-radius: 999px;
}

.toggle-button {
  padding: 6px 16px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.8rem;
  color: var(--color-ink-secondary);
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.toggle-button.active {
  color: var(--color-card-bg);
  background: var(--color-peg);
}

.toggle-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
