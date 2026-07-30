<!--
  ============================================================================
  components/BadgeBacklogCard.vue
  ----------------------------------------------------------------------------
  The one-time "badges are here, and you're already ahead" card, shown to a
  player whose lifetime stats already satisfied a pile of badges before the
  badge system ever looked at them -- see logic/badgeUnlocks.js's
  establishBadgeBaseline(), which grants that backlog at boot, and
  takeBadgeBacklogWelcome(), which hands it here exactly once.

  Deliberately ONE card no matter how big the backlog is. The alternative --
  letting BadgeUnlockCard.vue's v-for render all twelve -- is what this exists
  to prevent: a wall of cards on an ordinary result screen, and, worse, a
  `rare` badge arriving as one tile in a dozen, which reads as a participation
  trophy rather than a find. For the same reason there's no golden treatment
  here even when the backlog contains One and Done or Certified Genius: the
  gold is for a badge having its own moment, and spending it on a summary
  would spend it on the one card most likely to feel like bookkeeping. The
  rare ones keep their glint on the shelf, where the player is being sent.

  It borrows BadgeUnlockCard.vue's chrome and entrance wholesale (same card
  surface, same slapped-down overshoot) so this reads as a member of the same
  set, and like that card -- and ResultStreakPill.vue -- it's a plain hash
  link to #/stats rather than a button, so middle-click and open-in-new-tab
  behave and no JS is needed to navigate. The handler is analytics-only.

  Unlike BadgeUnlockCard, this one DOES announce what it is. That card can
  assume the badge is the announcement because it only ever appears at the
  moment of earning; this one is explaining something that already happened
  invisibly, and skipping the label would leave the player to guess.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { EVENTS, track } from '../services/analytics.js';

const props = defineProps({
  // Full definitions for the back-awarded badges, in shelf order -- see
  // logic/badgeUnlocks.js's getBadgeDefinitions().
  badges: { type: Array, required: true }, // [{id, name, icon, description, rare}]
});

// How many icons ride on the card before the rest collapse into a "+N" chip.
// Four is what fits on the narrowest phone without the row wrapping into a
// second line and turning the summary back into the grid it's replacing.
const MAX_SHOWN_ICONS = 4;

const shownBadges = computed(() => props.badges.slice(0, MAX_SHOWN_ICONS));
const overflowCount = computed(() => Math.max(0, props.badges.length - MAX_SHOWN_ICONS));

const headline = computed(() =>
  props.badges.length === 1 ? "You've already earned a badge" : `You've already earned ${props.badges.length} badges`,
);

function handleClick() {
  track(EVENTS.BADGE_BACKLOG_CARD_CLICKED, { count: props.badges.length });
}
</script>

<template>
  <a
    href="#/stats"
    class="backlog-card"
    :aria-label="`Badges are here. ${headline} for what you'd already done. View your badges.`"
    @click="handleClick"
  >
    <span class="backlog-icons" aria-hidden="true">
      <span v-for="(badge, iconIndex) in shownBadges" :key="badge.id" class="backlog-icon" :style="{ '--icon-index': iconIndex }">
        {{ badge.icon }}
      </span>
      <span v-if="overflowCount > 0" class="backlog-more" :style="{ '--icon-index': shownBadges.length }">
        +{{ overflowCount }}
      </span>
    </span>
    <span class="backlog-text">
      <span class="backlog-title">Badges are here</span>
      <span class="backlog-subtitle">{{ headline }} for what you'd already done. Take a look at your shelf.</span>
    </span>
  </a>
</template>

<style scoped>
.backlog-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  text-decoration: none;
  /* Same card chrome as BadgeUnlockCard.vue and StatsView.vue's rank card --
     see this file's header on why it borrows rather than invents a surface. */
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  /* `backwards`, not `both`, for the same reason BadgeUnlockCard gives: a
     retained final keyframe would keep pinning transform and the press/hover
     states below would silently never apply. */
  animation: backlog-card-in 0.5s cubic-bezier(0.2, 0.85, 0.3, 1) backwards;
}

@keyframes backlog-card-in {
  0% {
    opacity: 0;
    transform: translateY(16px) scale(0.92);
  }
  60% {
    opacity: 1;
    transform: translateY(-4px) scale(1.025);
  }
  80% {
    transform: translateY(1px) scale(0.997);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.backlog-icons {
  flex: none;
  display: flex;
  align-items: center;
  /* Overlapped rather than spaced: a small fan of badges reads as "a
     collection" at a glance, where an evenly spaced row reads as a list the
     player is meant to parse one by one. */
  margin-right: 4px;
}

.backlog-icon,
.backlog-more {
  /* The stagger BadgeUnlockCard.vue spends on a batch of cards is spent here
     on the icons instead, so the fan still deals itself out one at a time. */
  animation: backlog-icon-in 0.42s cubic-bezier(0.2, 0.8, 0.25, 1.4) calc(0.16s + var(--icon-index) * 0.07s) backwards;
}

.backlog-icon {
  font-size: 1.5rem;
  line-height: 1;
}

.backlog-icon:not(:first-child),
.backlog-more {
  margin-left: -7px;
}

.backlog-more {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.45rem;
  height: 1.45rem;
  padding: 0 5px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 0.72rem;
  color: var(--color-ink);
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 999px;
}

@keyframes backlog-icon-in {
  0% {
    opacity: 0;
    transform: scale(0.2) rotate(-24deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

.backlog-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  animation: backlog-text-in 0.4s ease-out 0.24s backwards;
}

@keyframes backlog-text-in {
  0% {
    opacity: 0;
    transform: translateX(-7px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.backlog-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1rem;
  line-height: 1.15;
  color: var(--color-ink);
}

.backlog-subtitle {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--color-ink-secondary);
}

@media (hover: hover) {
  .backlog-card:hover {
    transform: translate(-1px, -1px);
  }
}

.backlog-card:active {
  transform: translate(1px, 1px);
}

.backlog-card:focus-visible {
  outline: 2px solid var(--color-peg);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .backlog-card,
  .backlog-icon,
  .backlog-more,
  .backlog-text {
    animation: none;
  }
}
</style>
