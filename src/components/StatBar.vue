<!--
  ============================================================================
  components/StatBar.vue
  ----------------------------------------------------------------------------
  A single compact row of stats above the board: how many pegs of each
  color are left, how many moves have been made, and the target (par) the
  player is trying to reach, per color. Pure display -- all the numbers
  come in as props from whatever useGame() instance is currently active.

  Deliberately plain text, no boxed "chip" cards -- each stat is just a
  bold high-contrast number (or row of colored-dot-plus-count pairs) over a
  small muted uppercase-tracking label, so there's no background chrome
  competing with the board for attention.
  ============================================================================
-->
<script setup>
import { getPegColor } from '../logic/pegColors.js';

defineProps({
  pegsRemaining: { type: Array, required: true },
  moveCount: { type: Number, required: true },
  par: { type: Array, required: true },
});
</script>

<template>
  <div class="stat-row">
    <div class="stat">
      <span class="stat-value multi">
        <span v-for="(count, colorIndex) in pegsRemaining" :key="colorIndex" class="color-count">
          <span class="dot" :style="{ background: getPegColor(colorIndex).hex }" aria-hidden="true"></span>{{ count }}
        </span>
      </span>
      <span class="stat-label">Left</span>
    </div>
    <div class="stat">
      <span class="stat-value">{{ moveCount }}</span>
      <span class="stat-label">Moves</span>
    </div>
    <div class="stat">
      <span class="stat-value multi">
        <span v-for="(count, colorIndex) in par" :key="colorIndex" class="color-count">
          <span class="dot" :style="{ background: getPegColor(colorIndex).hex }" aria-hidden="true"></span>{{ count }}
        </span>
      </span>
      <span class="stat-label">Goal</span>
    </div>
  </div>
</template>

<style scoped>
.stat-row {
  display: flex;
  justify-content: center;
  gap: 32px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1;
  /* The site's blue -- same as the header bar and the pegs -- so the stat
     counters read as branded, not just "some dark number". */
  color: var(--color-header-bg);
}

.stat-value.multi {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dot {
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  flex: 0 0 auto;
}

.stat-label {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
</style>
