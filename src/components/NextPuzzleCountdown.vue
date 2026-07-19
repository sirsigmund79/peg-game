<!--
  ============================================================================
  components/NextPuzzleCountdown.vue
  ----------------------------------------------------------------------------
  A small "Next puzzle in HH:MM:SS" note -- a quiet nudge that a brand new
  puzzle is coming too, shown wherever a player might be looking backward:
  ArchiveView.vue's full history list, and PlayView.vue's result screen
  (below ArchiveDayStrip.vue's "catch up on recent days" strip). See
  composables/useNextPuzzleCountdown.js for the actual ticking logic.
  ============================================================================
-->
<script setup>
import { useNextPuzzleCountdown } from '../composables/useNextPuzzleCountdown.js';

const { countdown } = useNextPuzzleCountdown();
</script>

<template>
  <p class="next-puzzle-countdown">Next puzzle in {{ countdown }}</p>
</template>

<style scoped>
.next-puzzle-countdown {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-dim);
  text-align: center;
}
</style>
