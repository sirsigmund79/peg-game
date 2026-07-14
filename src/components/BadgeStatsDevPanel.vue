<!--
  ============================================================================
  components/BadgeStatsDevPanel.vue
  ----------------------------------------------------------------------------
  A bare-bones, unstyled way to check that logic/badgeStats.js and
  logic/badgeUnlocks.js are counting/unlocking things correctly -- NOT a
  preview of the eventual player-facing badge UI/Stats sheet (that's a
  separate, later pass). Just a raw dump of the current device's stats plus
  which badge ids have unlocked, with a Refresh button since neither store
  is reactive on its own (both live in localStorage).

  IMPORTANT: dev-only, same as DevPanel.vue -- only ever rendered when
  `import.meta.env.DEV` is true, never in a production build.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { getBadgeStats } from '../logic/badgeStats.js';
import { getUnlockedBadgeIds } from '../logic/badgeUnlocks.js';
import { BADGE_DEFINITIONS } from '../logic/badges.js';

const stats = ref(getBadgeStats());
const unlockedIds = ref(getUnlockedBadgeIds());

function refresh() {
  stats.value = getBadgeStats();
  unlockedIds.value = getUnlockedBadgeIds();
}

function badgeName(id) {
  return BADGE_DEFINITIONS.find((badge) => badge.id === id)?.name ?? id;
}
</script>

<template>
  <div class="badge-panel">
    <p class="dev-label">DEV MODE -- badge stats (not shown in production build)</p>

    <div class="dev-row">
      <button type="button" class="dev-button" @click="refresh">Refresh</button>
    </div>

    <p class="section-title">Unlocked badges ({{ unlockedIds.length }}/{{ BADGE_DEFINITIONS.length }})</p>
    <ul v-if="unlockedIds.length" class="badge-list">
      <li v-for="id in unlockedIds" :key="id">{{ badgeName(id) }} <span class="badge-id">({{ id }})</span></li>
    </ul>
    <p v-else class="fixed-note">None yet.</p>

    <p class="section-title">Raw stats</p>
    <pre class="stats-dump">{{ JSON.stringify(stats, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.badge-panel {
  max-width: 420px;
  margin: 16px auto 0;
  padding: 12px 14px;
  background: #222;
  color: #eee;
  border-radius: 10px;
  font-family: monospace;
  font-size: 0.8rem;
}

.dev-label {
  margin: 0 0 10px;
  color: #ffb27a;
  font-weight: bold;
}

.section-title {
  margin: 12px 0 4px;
  color: #8ad0ff;
}

.badge-list {
  margin: 0;
  padding-left: 18px;
}

.badge-id {
  color: #999;
}

.fixed-note {
  margin: 0;
  color: #999;
  font-style: italic;
}

.stats-dump {
  margin: 0;
  padding: 8px;
  background: #111;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre;
}

.dev-row {
  display: flex;
  gap: 8px;
}

.dev-button {
  padding: 6px 10px;
  cursor: pointer;
  font-family: monospace;
}
</style>
