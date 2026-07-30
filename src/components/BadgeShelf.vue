<!--
  ============================================================================
  components/BadgeShelf.vue
  ----------------------------------------------------------------------------
  The permanent home for badges: a grid of every badge in logic/badges.js,
  shown on the stats page (components/StatsView.vue). The result screen only
  ever shows a badge at the moment it's earned (components/BadgeUnlockCard.vue)
  -- this is where they live afterwards.

  Locked badges are shown, but as anonymous "?" tiles: no name, no icon, no
  hint at what earns them. So the shelf still says "there are N more of these
  out there" (the count in the heading is the only real information) without
  turning into a checklist of chores. Discovering WHAT a badge was is part of
  earning it.

  Read at setup, like the rest of StatsView -- localStorage isn't reactive,
  and in a production build nothing on this page can change a badge while it's
  open. It's held in a ref rather than a plain value purely so the dev toggles
  below can flip one and see the grid answer immediately. Grid order is
  BADGE_DEFINITIONS order, which runs roughly cheapest -> hardest (see that
  file's header).
  ============================================================================
-->
<script setup>
import { ref, computed } from 'vue';
import { BADGE_DEFINITIONS } from '../logic/badges.js';
import { getUnlockedBadgeIds } from '../logic/badgeUnlocks.js';
import BadgeShelfDevToggles from './BadgeShelfDevToggles.vue';

const isDevBuild = import.meta.env.DEV;

// getUnlockedBadgeIds already drops ids logic/badges.js no longer defines, so
// a retired badge (v3's `clean_genius`) can't show up as a phantom here.
const unlockedIds = ref(getUnlockedBadgeIds());

function refresh() {
  unlockedIds.value = getUnlockedBadgeIds();
}

const badges = computed(() => {
  const earned = new Set(unlockedIds.value);
  return BADGE_DEFINITIONS.map((badge) => ({
    id: badge.id,
    name: badge.name,
    icon: badge.icon,
    description: badge.description,
    // Only worth showing off once it's actually been earned -- a golden
    // LOCKED slot would leak which of the anonymous "?" tiles are the
    // interesting ones.
    rare: Boolean(badge.rare) && earned.has(badge.id),
    unlocked: earned.has(badge.id),
  }));
});

const unlockedCount = computed(() => badges.value.filter((badge) => badge.unlocked).length);
</script>

<template>
  <div class="badge-card">
    <div class="badge-header">
      <h2 class="badge-heading">Badges</h2>
      <span class="badge-count">{{ unlockedCount }} / {{ badges.length }}</span>
    </div>

    <!-- A real list, not a grid of <div>s: the tiles aren't tappable (nothing
         here has an action), so <li> is what gives each one a role for its
         aria-label to attach to -- an aria-label on a bare <div> is not
         reliably announced. It also means a locked tile still reads as
         "Locked badge" rather than as an empty box, since its "?" is
         decorative. -->
    <ul class="badge-grid">
      <li
        v-for="badge in badges"
        :key="badge.id"
        class="badge-tile"
        :class="{ locked: !badge.unlocked, rare: badge.rare }"
        :title="badge.unlocked ? badge.description : undefined"
        :aria-label="badge.unlocked ? `${badge.name}. ${badge.description}` : 'Locked badge'"
      >
        <template v-if="badge.unlocked">
          <span class="badge-icon" aria-hidden="true">{{ badge.icon }}</span>
          <span class="badge-name">{{ badge.name }}</span>
        </template>
        <span v-else class="badge-icon locked-mark" aria-hidden="true">?</span>
      </li>
    </ul>

    <BadgeShelfDevToggles v-if="isDevBuild" :unlocked-ids="unlockedIds" @changed="refresh" />
  </div>
</template>

<style scoped>
.badge-card {
  margin-top: 14px;
  padding: 16px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
}

.badge-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.badge-heading {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.badge-count {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.82rem;
  color: var(--color-ink-dim);
}

.badge-grid {
  display: grid;
  /* auto-fill rather than a fixed column count so the grid stays sane as
     badges are added, and on a narrow phone as well as a wide one. The 76px
     floor is deliberate: it's what still fits FOUR columns inside this card
     on a 390px-wide phone (326px of card interior, minus three 10px gaps),
     and most of this shelf is empty "?" slots for a long time -- three
     columns turns that into the tallest block on the page. */
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.badge-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  /* Every tile is the same height whether it holds a two-line name or a lone
     "?", so the grid reads as a shelf of equal slots rather than a ragged
     list with holes in it. */
  min-height: 72px;
  padding: 9px 5px;
  text-align: center;
  background: rgba(36, 27, 20, 0.03);
  border: 1px solid rgba(36, 27, 20, 0.1);
  border-radius: 10px;
}

.badge-tile.locked {
  /* Dimmed, not hidden -- the empty slots are the reason to keep playing. */
  background: rgba(36, 27, 20, 0.05);
  border-style: dashed;
}

/* The two `rare` badges (logic/badges.js) keep the golden-ticket look they
   arrived with on the result screen -- same amber, same glint, slower and
   quieter here since these sit on the page indefinitely rather than for one
   celebratory moment. See BadgeUnlockCard.vue for where the gold comes from. */
.badge-tile.rare {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #fdeec4 0%, #f6cf76 45%, #f0b23a 100%);
  border-color: rgba(36, 27, 20, 0.3);
}

.badge-tile.rare .badge-name {
  color: var(--color-ink);
}

.badge-tile.rare::after {
  content: '';
  position: absolute;
  inset: -25%;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 42%,
    rgba(255, 255, 255, 0.15) 46%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(255, 255, 255, 0.15) 54%,
    transparent 58%
  );
  animation: shelf-glint 6.5s ease-in-out infinite;
}

/* Both tiles glint together rather than on independent offsets -- two
   out-of-phase sparkles in one grid reads as a page that can't sit still. */
@keyframes shelf-glint {
  0% {
    transform: translateX(-100%);
  }
  16% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.badge-icon {
  font-size: 1.6rem;
  line-height: 1;
}

.locked-mark {
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--color-ink-dim);
  opacity: 0.45;
}

.badge-name {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.62rem;
  line-height: 1.2;
  color: var(--color-ink-secondary);
  overflow-wrap: break-word;
}

@media (prefers-reduced-motion: reduce) {
  /* The gold stays (it's information); only the sweep goes. */
  .badge-tile.rare::after {
    display: none;
  }
}
</style>
