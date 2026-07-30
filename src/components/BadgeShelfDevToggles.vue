<!--
  ============================================================================
  components/BadgeShelfDevToggles.vue
  ----------------------------------------------------------------------------
  Dev-only (see BadgeShelf.vue's `isDevBuild` gate): one chip per badge for
  flipping it earned/unearned on the spot, so both halves of the shelf -- a
  filled tile and the anonymous "?" slot next to it -- can be looked at
  without first grinding out a thousand dots or a fifty-day streak.

  These write the REAL logic/badgeUnlocks.js store (see setUnlockedBadgeIds),
  not a display filter, so whatever's left switched on is what the shelf shows
  after a reload too. Emits `changed` rather than reaching into the shelf, so
  the shelf keeps owning what it renders.

  Deliberately plain/utilitarian (monospace, no theme colors), matching
  components/DevPanelToggles.vue -- dev chrome should never be mistakable for
  the real game.
  ============================================================================
-->
<script setup>
import { BADGE_DEFINITIONS } from '../logic/badges.js';
import { setUnlockedBadgeIds } from '../logic/badgeUnlocks.js';

const props = defineProps({
  // The ids currently earned -- owned by BadgeShelf.vue, passed down so these
  // chips and the grid above can never disagree about what's on.
  unlockedIds: { type: Array, required: true },
});

const emit = defineEmits(['changed']);

function isOn(id) {
  return props.unlockedIds.includes(id);
}

function toggle(id) {
  const next = isOn(id) ? props.unlockedIds.filter((current) => current !== id) : [...props.unlockedIds, id];
  setUnlockedBadgeIds(next);
  emit('changed');
}

function setAll(unlocked) {
  setUnlockedBadgeIds(unlocked ? BADGE_DEFINITIONS.map((badge) => badge.id) : []);
  emit('changed');
}
</script>

<template>
  <div class="badge-dev">
    <p class="dev-label">DEV MODE -- badge visibility (not shown in production build)</p>

    <div class="dev-chips">
      <button type="button" class="dev-chip bulk" @click="setAll(true)">Show all</button>
      <button type="button" class="dev-chip bulk" @click="setAll(false)">Hide all</button>
    </div>

    <div class="dev-chips">
      <button
        v-for="badge in BADGE_DEFINITIONS"
        :key="badge.id"
        type="button"
        class="dev-chip"
        :class="{ on: isOn(badge.id) }"
        :aria-pressed="isOn(badge.id)"
        @click="toggle(badge.id)"
      >
        {{ isOn(badge.id) ? '✓' : '✕' }} {{ badge.icon }} {{ badge.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.badge-dev {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(36, 27, 20, 0.2);
}

.dev-label {
  margin: 0 0 8px;
  font-family: monospace;
  font-size: 0.66rem;
  font-weight: bold;
  color: #b23b3b;
}

.dev-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dev-chips + .dev-chips {
  margin-top: 8px;
}

.dev-chip {
  font-family: monospace;
  font-size: 0.68rem;
  color: #fff;
  background: #6b6b6b;
  border: none;
  border-radius: 999px;
  padding: 4px 9px;
  cursor: pointer;
  opacity: 0.6;
}

.dev-chip.on {
  background: #b23b3b;
  opacity: 1;
}

.dev-chip.bulk {
  background: #3b5fb2;
  opacity: 1;
}
</style>
