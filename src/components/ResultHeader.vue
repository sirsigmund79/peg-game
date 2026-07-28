<!--
  ============================================================================
  components/ResultHeader.vue
  ----------------------------------------------------------------------------
  The result screen's header: the rank itself ("Genius", "Warming Up", ...),
  always the same size now -- there's no embarrassing bottom-tier copy left to
  de-emphasize (see logic/rules.js's RANK_TIERS), so every tier gets the same
  treatment -- plus a gentle rib underneath it (the `quip` prop; see
  logic/rules.js's getQuipForRank), which cycles through several options per
  tier as a puzzle is replayed. Both stay hidden until `revealed` (see
  composables/useResultReveal.js) turns true, then pop in together. The old "N
  dots shy of Genius" callout that used to live here has been generalized to
  every tier and moved into components/RankLadder.vue's own "N dots to go"
  labels. The puzzle's date isn't repeated here -- see
  components/PlayView.vue's `.puzzle-line`, already on screen above.

  Swaps out for StatBar.vue in components/PlayView.vue's `.game-area` once the
  round is over -- see PlayView.vue for why components/Board.vue itself stays
  a single, stable sibling the whole time rather than this wrapping it.
  ============================================================================
-->
<script setup>
defineProps({
  record: { type: Object, required: true }, // {rank, emoji} -- see logic/rules.js's getRankForOverPar
  quip: { type: String, default: '' }, // a gentle, rotating rib for this rank -- see logic/rules.js's getQuipForRank
  revealed: { type: Boolean, default: false },
});
</script>

<template>
  <header class="result-header">
    <p class="rank-title" :class="{ revealed }">
      <span v-if="record.emoji" aria-hidden="true">{{ record.emoji }}</span>
      {{ record.rank }}
    </p>
    <!-- A gentle rib under the rank, cycling per attempt (see logic/rules.js's
         getQuipForRank). Pops in with the same reveal beat as the rank so the
         two read as one moment, not a second thing appearing late. -->
    <p v-if="quip" class="rank-quip" :class="{ revealed }">{{ quip }}</p>
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

.rank-quip {
  margin: 4px 0 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-ink-dim);
  /* Same "hold invisible, then pop in with the rank" treatment as the title
     above -- kept in layout (not display:none) so the header doesn't jump. */
  opacity: 0;
}

.rank-quip.revealed {
  animation: quip-reveal 0.4s ease-out forwards;
}

@keyframes quip-reveal {
  0% {
    opacity: 0;
    transform: translateY(3px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
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
  .rank-title.revealed,
  .rank-quip,
  .rank-quip.revealed {
    opacity: 1;
    animation: none;
  }
}
</style>
