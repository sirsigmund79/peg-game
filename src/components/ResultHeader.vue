<!--
  ============================================================================
  components/ResultHeader.vue
  ----------------------------------------------------------------------------
  The result screen's header: just the rank itself ("Genius", "Warming
  Up", ...), always the same size now -- there's no embarrassing bottom-tier
  copy left to de-emphasize (see logic/rules.js's RANK_TIERS), so every tier
  gets the same treatment. Stays hidden until `revealed` (see
  composables/useResultReveal.js) turns true, then pops in. The old "N dots
  shy of Genius" callout that used to live here has been generalized to
  every tier and moved into components/RankLadder.vue's own "N dots to go"
  labels. The puzzle's date
  isn't repeated here -- see components/PlayView.vue's `.puzzle-line`,
  already on screen above.

  Swaps out for StatBar.vue in components/PlayView.vue's `.game-area` once the
  round is over -- see PlayView.vue for why components/Board.vue itself stays
  a single, stable sibling the whole time rather than this wrapping it.
  ============================================================================
-->
<script setup>
defineProps({
  record: { type: Object, required: true }, // {rank, emoji} -- see logic/rules.js's getRankForOverPar
  revealed: { type: Boolean, default: false },
});
</script>

<template>
  <header class="result-header">
    <p class="rank-title" :class="{ revealed }">
      <span v-if="record.emoji" aria-hidden="true">{{ record.emoji }}</span>
      {{ record.rank }}
    </p>
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
  font-size: 1.55rem;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: var(--color-ink);
  /* Stays invisible until the score count-up (see composables/useResultReveal.js)
     finishes, then pops in as the achieved rank -- kept in layout (not
     display:none) so the header doesn't jump when it appears. */
  opacity: 0;
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
  .rank-title,
  .rank-title.revealed {
    opacity: 1;
    animation: none;
  }
}
</style>
