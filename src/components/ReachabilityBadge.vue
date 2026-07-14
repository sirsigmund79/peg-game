<!--
  ============================================================================
  components/ReachabilityBadge.vue
  ----------------------------------------------------------------------------
  A small status line for the opt-in "Genius still reachable" indicator (see
  composables/useReachabilityIndicator.js). Pure display -- `status` comes
  straight from that composable.

  Renders nothing for `null` (feature off, or this board is too big to solve
  live) or `'unavailable'` (this round's node budget was spent without an
  answer) -- there's nothing useful to show a player in either case, so the
  badge just stays out of the way rather than showing a confusing state.
  ============================================================================
-->
<script setup>
defineProps({
  status: { type: String, default: null },
});
</script>

<template>
  <p v-if="status === 'reachable'" class="reachability-badge reachable">🧠 Genius still possible</p>
  <p v-else-if="status === 'unreachable'" class="reachability-badge unreachable">Genius no longer possible</p>
  <p v-else-if="status === 'checking'" class="reachability-badge checking">Checking…</p>
</template>

<style scoped>
.reachability-badge {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
}

.reachability-badge.reachable {
  color: var(--color-header-bg);
}

.reachability-badge.unreachable {
  color: var(--color-ink-dim);
}

.reachability-badge.checking {
  color: var(--color-ink-dim);
  opacity: 0.7;
}
</style>
