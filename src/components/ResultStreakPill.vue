<!--
  ============================================================================
  components/ResultStreakPill.vue
  ----------------------------------------------------------------------------
  The player's current daily streak, shown in the TOP-RIGHT corner of the
  result screen (see components/PlayView.vue, which positions it). The count
  itself is logic/streaks.js's `current` -- how many consecutive daily
  puzzles this device has finished, ending today or yesterday -- computed by
  PlayView and handed in via `streak`; PlayView only mounts this when that
  count is at least 1, so there's no "0 🔥" empty state to design for here.

  The whole pill is a link to the stats page (#/stats, the same route the
  header's trophy icon and StatsView.vue's own "Day streak" tile live at), so
  the streak on the result screen doubles as a doorway into the fuller
  lifetime-stats view -- a tap fires RESULT_STREAK_CLICKED for the same
  funnel StatsView's STATS_NAV_CLICKED feeds, then the hash router
  (composables/useRouter.js) does the rest.
  ============================================================================
-->
<script setup>
import { EVENTS, track } from '../services/analytics.js';

defineProps({
  streak: { type: Number, required: true }, // logic/streaks.js's `current` -- always >= 1 here (PlayView gates the mount)
});

function handleClick() {
  track(EVENTS.RESULT_STREAK_CLICKED, {});
}
</script>

<template>
  <!-- A plain hash link (not a button) so it behaves like the header's own
       stats/archive nav links -- middle-click/open-in-new-tab, etc. -- and
       needs no JS to actually navigate; the click handler is analytics-only. -->
  <a
    href="#/stats"
    class="streak-pill"
    :aria-label="`${streak} day streak. View your stats.`"
    :title="`${streak}-day streak — view your stats`"
    @click="handleClick"
  >
    <span class="streak-flame" aria-hidden="true">🔥</span>
    <span class="streak-count">{{ streak }}</span>
  </a>
</template>

<style scoped>
.streak-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px 4px 8px;
  background: var(--color-card-bg);
  /* Same heavy frame + hard offset shadow as the result card and stats
     tiles, scaled down -- reads as part of the same sticker-y set rather
     than a stray chip floating in the corner. */
  border: var(--frame-border);
  border-radius: 999px;
  box-shadow: 3px 3px 0 var(--color-card-border);
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.streak-flame {
  font-size: 0.9rem;
  line-height: 1;
}

.streak-count {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 0.9rem;
  line-height: 1;
  color: var(--color-ink);
}

@media (hover: hover) {
  .streak-pill:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 var(--color-card-border);
  }
}

.streak-pill:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--color-card-border);
}

.streak-pill:focus-visible {
  outline: 2px solid var(--color-peg);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .streak-pill {
    transition: none;
  }
}
</style>
