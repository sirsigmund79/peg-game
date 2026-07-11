<!--
  ============================================================================
  components/ResultStatRow.vue
  ----------------------------------------------------------------------------
  The result screen's "Best possible" / "Your score" stats, lifted out of the
  now-retired ResultOverlay.vue. "Your score" only plays the count-up/pop
  reveal while `isRevealing` is true -- i.e. during the just-finished round's
  own one-shot reveal (see composables/useResultReveal.js). Once that's done,
  or whenever the This game/Best toggle is showing a DIFFERENT result record
  (see components/PlayView.vue), it renders `pegsRemaining` directly with no
  animation, so switching the toggle never replays anything.
  ============================================================================
-->
<script setup>
import { getPegColor } from '../logic/pegColors.js';

defineProps({
  par: { type: Array, required: true },
  pegsRemaining: { type: Array, required: true },
  displayedScore: { type: Array, required: true }, // per-color, only meaningful while isRevealing
  scoreBumpKeys: { type: Array, required: true }, // per-color, bumped to replay the count-pop while isRevealing
  isRevealing: { type: Boolean, default: false },
});
</script>

<template>
  <div class="stat-row">
    <div class="stat">
      <span class="stat-value multi">
        <span v-for="(count, colorIndex) in par" :key="colorIndex" class="color-count">
          <span class="dot" :style="{ background: getPegColor(colorIndex).hex }" aria-hidden="true"></span>{{ count }}
        </span>
      </span>
      <span class="stat-label">Best possible</span>
    </div>
    <div class="stat">
      <span class="stat-value multi">
        <span v-for="(count, colorIndex) in pegsRemaining" :key="colorIndex" class="color-count">
          <span class="dot" :style="{ background: getPegColor(colorIndex).hex }" aria-hidden="true"></span
          ><span :key="isRevealing ? `reveal-${colorIndex}-${scoreBumpKeys[colorIndex]}` : 'static'" class="count-number">{{
            isRevealing ? (displayedScore[colorIndex] ?? '') : count
          }}</span>
        </span>
      </span>
      <span class="stat-label">Your score</span>
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
  color: var(--color-ink);
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

/* Each tick of the score reveal (see composables/useResultReveal.js)
   replaces this element (via its bump-keyed :key), which replays the pop.
   When not revealing, the element is keyed by nothing special and never
   remounts, so no pop plays -- exactly what a static toggle swap needs. */
.count-number {
  display: inline-block;
  min-width: 0.6em;
  animation: count-pop 0.3s ease-out;
}

@keyframes count-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .count-number {
    animation: none;
  }
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
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-ink-secondary);
}
</style>
