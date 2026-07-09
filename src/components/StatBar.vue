<!--
  ============================================================================
  components/StatBar.vue
  ----------------------------------------------------------------------------
  A single compact row of stats above the board: how many pegs are left,
  how many moves have been made, and the target (par) the player is trying
  to reach. Pure display -- all the numbers come in as props from whatever
  useGame() instance is currently active.

  Deliberately plain text, no boxed "chip" cards -- each stat is just a
  bold high-contrast number over a small muted uppercase-tracking label,
  so there's no background chrome competing with the board for attention.
  ============================================================================
-->
<script setup>
defineProps({
  pegsRemaining: { type: Number, required: true },
  moveCount: { type: Number, required: true },
  par: { type: Number, required: true },
});
</script>

<template>
  <div class="stat-row">
    <div class="stat">
      <span class="stat-value">{{ pegsRemaining }}</span>
      <span class="stat-label">Left</span>
    </div>
    <div class="stat">
      <span class="stat-value">{{ moveCount }}</span>
      <span class="stat-label">Moves</span>
    </div>
    <div class="stat">
      <span class="stat-value">{{ par }}</span>
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

.stat-label {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
</style>
