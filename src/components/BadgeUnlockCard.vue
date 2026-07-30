<!--
  ============================================================================
  components/BadgeUnlockCard.vue
  ----------------------------------------------------------------------------
  One just-earned badge, announced on the result screen. Mounted by
  components/PlayView.vue directly under the rank ladder, and ONLY when
  something was actually unlocked -- see useGame.js's `pendingBadgeUnlocks`
  and takeBadgeUnlocks(). On every other result (the overwhelming majority)
  this component isn't in the tree at all, which is the whole reason badges
  can live on the result screen without adding permanent clutter to it.

  There's deliberately no "BADGE UNLOCKED!" label above the badge: a card
  that only ever appears at the moment of unlocking doesn't need to announce
  that that's what it is. The badge itself is the announcement.

  BECAUSE it may only ever be seen once, the entrance is doing real work: the
  card lands with an overshoot (the same "slapped-down sticker" feel the hard
  offset shadows all over this game imply), then the icon pops and the text
  slides in a beat behind it, so three things happen instead of one. A batch
  staggers by `index` rather than arriving as a wall.

  A `rare` badge (see logic/badges.js -- currently One and Done and Certified
  Genius) additionally gets the golden-ticket treatment: an amber fill and a
  specular band that sweeps across every few seconds, like the card is
  catching a light the other ones aren't. The amber is the theme's existing
  --color-board-plate, the same accent RankLadder.vue's Genius rung uses --
  no second gold invented for this.

  Like ResultStreakPill.vue, the whole card is a plain hash link to #/stats
  (not a button) so it behaves like the header's own nav -- middle-click,
  open-in-new-tab -- and needs no JS to navigate; the handler is
  analytics-only. #/stats is where components/BadgeShelf.vue lives, so the
  celebration doubles as the doorway to the rest of the collection.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { EVENTS, track } from '../services/analytics.js';

const props = defineProps({
  // A logic/badges.js definition, minus its isUnlocked -- exactly what
  // logic/badgeUnlocks.js's checkForNewlyUnlockedBadges() hands back.
  badge: { type: Object, required: true }, // {id, name, icon, description, rare}
  // Position within a batch landing together, so several unlocks arrive one
  // after another instead of all at once. Every animation below is offset by
  // this via --badge-delay.
  index: { type: Number, default: 0 },
});

const STAGGER_MS = 260;

const delayStyle = computed(() => ({ '--badge-delay': `${props.index * STAGGER_MS}ms` }));

function handleClick() {
  track(EVENTS.BADGE_CARD_CLICKED, { badge_id: props.badge.id, rare: Boolean(props.badge.rare) });
}
</script>

<template>
  <a
    href="#/stats"
    class="badge-card"
    :class="{ golden: badge.rare }"
    :style="delayStyle"
    :aria-label="`Badge earned: ${badge.name}. ${badge.description} View your badges.`"
    @click="handleClick"
  >
    <span class="badge-icon" aria-hidden="true">{{ badge.icon }}</span>
    <span class="badge-text">
      <span class="badge-name">{{ badge.name }}</span>
      <span class="badge-description">{{ badge.description }}</span>
    </span>
  </a>
</template>

<style scoped>
.badge-card {
  --badge-delay: 0ms;
  position: relative;
  /* Clips the sweeping highlight below to the card's own rounded box. Safe
     for the hard offset shadow, which paints outside and isn't clipped. */
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  text-decoration: none;
  /* Same card chrome as StatsView.vue's rank card and the streak pill, so a
     badge reads as another sticker in the same set rather than a new kind of
     surface the player has to learn. */
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  /* Arrives on its own beat, after the ladder has finished climbing (see
     PlayView.vue, which gates the mount on `reveal.ladderReady`).
     `backwards`, NOT `both`: a retained final keyframe would keep pinning
     `transform`, and the press/hover states below would silently never
     apply -- and with a stagger delay, `backwards` is also what holds the
     card invisible until its turn instead of flashing in at full size.
     Only transform/opacity animate here (never box-shadow), both so this
     stays on the compositor and so `.golden`'s amber halo isn't fought
     over by a keyframe. */
  animation: badge-card-in 0.5s cubic-bezier(0.2, 0.85, 0.3, 1) var(--badge-delay) backwards;
}

@keyframes badge-card-in {
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

.badge-icon {
  flex: none;
  font-size: 1.9rem;
  line-height: 1;
  /* Lands after the card does, with a bit of overshoot in the easing -- the
     card is the arrival, this is the punctuation. */
  animation: badge-icon-in 0.46s cubic-bezier(0.2, 0.8, 0.25, 1.4) calc(var(--badge-delay) + 0.16s) backwards;
}

@keyframes badge-icon-in {
  0% {
    opacity: 0;
    transform: scale(0.2) rotate(-24deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

.badge-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  animation: badge-text-in 0.4s ease-out calc(var(--badge-delay) + 0.24s) backwards;
}

@keyframes badge-text-in {
  0% {
    opacity: 0;
    transform: translateX(-7px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.badge-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1rem;
  line-height: 1.15;
  color: var(--color-ink);
}

.badge-description {
  font-family: var(--font-ui);
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--color-ink-secondary);
}

/* --- the golden ticket ---------------------------------------------------
   Only for `rare` badges (logic/badges.js). Amber mixed from the theme's one
   existing accent, --color-board-plate (#f0b23a), toward cream -- the same
   restraint RankLadder.vue's Genius rung follows, so the two golds on this
   screen are the same gold. */
.badge-card.golden {
  background: linear-gradient(135deg, #fdeec4 0%, #f6cf76 38%, #f0b23a 60%, #f8dc98 100%);
  /* The normal dark frame stays; only a warm halo is added outside it, so
     the card sits in its own pool of light without leaving the sticker set. */
  box-shadow: var(--frame-shadow-card), 0 0 22px rgba(240, 178, 58, 0.6);
}

.badge-card.golden .badge-description {
  /* Full ink rather than the muted secondary: --color-ink-secondary is tuned
     for white, and goes soft against amber. */
  color: var(--color-ink);
}

.badge-card.golden::after {
  content: '';
  position: absolute;
  /* Slightly oversized so the diagonal band clears the card at both ends of
     its travel rather than clipping in and out at the corners. Kept close to
     the card's own size on purpose: the wider this is, the further the band
     has to travel to cross the same card, and the less of the sweep is
     actually spent ON it. */
  inset: -20%;
  pointer-events: none;
  /* A broad, soft sheen rather than a hard line -- a narrow band crossed the
     card in about 150ms, too quick to register as anything but a flicker.
     Peak stays below full white so the description underneath stays readable
     as it passes. */
  background: linear-gradient(
    100deg,
    transparent 28%,
    rgba(255, 255, 255, 0.2) 40%,
    rgba(255, 255, 255, 0.72) 50%,
    rgba(255, 255, 255, 0.2) 60%,
    transparent 72%
  );
  /* Sweeps, then waits: the glint is most of a cycle's worth of nothing
     followed by one slow catch of the light. A continuous shimmer would read
     as a loading skeleton, not as gold. */
  animation: badge-glint 4.2s ease-in-out calc(var(--badge-delay) + 0.45s) infinite backwards;
}

@keyframes badge-glint {
  0% {
    transform: translateX(-100%);
  }
  34% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(100%);
  }
}

@media (hover: hover) {
  .badge-card:hover {
    transform: translate(-1px, -1px);
  }
}

.badge-card:active {
  transform: translate(1px, 1px);
}

.badge-card:focus-visible {
  outline: 2px solid var(--color-peg);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  /* The gold itself stays -- it's information (this badge is rarer), not
     decoration. Only the movement goes. */
  .badge-card,
  .badge-icon,
  .badge-text {
    animation: none;
  }

  .badge-card.golden::after {
    display: none;
  }
}
</style>
