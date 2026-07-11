<!--
  ============================================================================
  components/ResultHeader.vue
  ----------------------------------------------------------------------------
  The result screen's header: the rank ("Genius", "Eg-no-ra-moose", ...),
  sized by tier (Genius stays the hero moment, lower tiers are progressively
  de-emphasized -- see logic/rules.js's RANK_TIERS), a small "N dots shy of
  Genius" callout for any non-Genius result, and the puzzle's date underneath.
  The rank -- and the shy-of-Genius callout, which piggybacks on the same
  flag -- stay hidden until `revealed` (see composables/useResultReveal.js)
  turns true, then pop in together.

  Swaps out for StatBar.vue in components/PlayView.vue's `.game-area` once the
  round is over -- see PlayView.vue for why components/Board.vue itself stays
  a single, stable sibling the whole time rather than this wrapping it.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';

const props = defineProps({
  record: { type: Object, required: true }, // {rank, emoji, size} -- see logic/rules.js's getRankForOverPar
  overPar: { type: Number, required: true },
  formattedDate: { type: String, default: null },
  revealed: { type: Boolean, default: false },
});

const shyMessage = computed(() => {
  const n = props.overPar;
  if (n <= 0) return null; // Genius -- nothing to be shy about
  return n <= 2 ? `${n} dot${n === 1 ? '' : 's'} shy of Genius — so close!` : `${n} dots shy of Genius`;
});
</script>

<template>
  <header class="result-header">
    <p class="rank-title" :class="{ revealed }" :style="{ fontSize: record.size }">
      <span v-if="record.emoji" aria-hidden="true">{{ record.emoji }}</span>
      {{ record.rank }}
    </p>
    <p v-if="shyMessage && revealed" class="shy-pill">{{ shyMessage }}</p>
    <p v-if="formattedDate" class="result-date">{{ formattedDate }}</p>
  </header>
</template>

<style scoped>
.result-header {
  text-align: center;
}

.rank-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: var(--color-ink);
  /* Stays invisible until the score count-up (see composables/useResultReveal.js)
     finishes, then pops in as the achieved rank -- kept in layout (not
     display:none) so the header doesn't jump when it appears. */
  opacity: 0;
  transition: font-size 0.2s ease;
}

.rank-title.revealed {
  animation: rank-reveal 0.4s ease-out forwards;
}

@keyframes rank-reveal {
  0% {
    opacity: 0;
    transform: scale(0.86);
  }
  60% {
    opacity: 1;
    transform: scale(1.14);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rank-title {
    transition: none;
  }

  .rank-title,
  .rank-title.revealed {
    opacity: 1;
    animation: none;
  }
}

/* Pine-green progress callout -- neutral (no false enthusiasm) once more
   than 2 dots separate this result from Genius; see the shyMessage computed
   above. */
.shy-pill {
  display: inline-block;
  margin: 8px 0 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(28, 140, 82, 0.12);
  color: var(--color-peg);
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.78rem;
}

.result-date {
  margin: 4px 0 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--color-ink-dim);
}
</style>
