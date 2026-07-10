<!--
  ============================================================================
  components/MiniBoard.vue
  ----------------------------------------------------------------------------
  A small, non-interactive snapshot of a board's final position: one flat
  circle per hole, colored exactly like the real game board (see
  Board.vue) but without the tray, taps, or animations -- just enough for a
  player to recognize "this is the board I just played" at a glance in the
  result modal (see ResultOverlay.vue). Shares its layout math with
  Board.vue via logic/boardLayout.js, so hole spacing/sizing rules can
  never drift apart between the two.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';
import { getColorAt } from '../logic/rules.js';
import { getPegColor } from '../logic/pegColors.js';

const props = defineProps({
  geometry: { type: Object, required: true },
  masks: { type: Array, required: true }, // final bigint bitmasks -- which holes still have a peg, one per color
  pulsingIndex: { type: Number, default: -1 }, // hole index to briefly pulse (see ResultOverlay's score reveal), or -1 for none
});

const positions = computed(() => computeDisplayPositions(props.geometry));
const holeSizePercent = computed(() => computeHoleDiameterPercent(props.geometry, positions.value));

function holeColor(index) {
  return getColorAt(props.masks, index);
}

function holeHasPeg(index) {
  return holeColor(index) !== -1;
}
</script>

<template>
  <div class="mini-board" :style="{ '--hole-size': holeSizePercent + '%' }">
    <div
      v-for="(position, index) in positions"
      :key="index"
      class="hole"
      :class="{ filled: holeHasPeg(index), pulsing: index === pulsingIndex }"
      :style="{ left: position.left, top: position.top }"
    >
      <span v-if="holeHasPeg(index)" class="peg" :style="{ backgroundColor: getPegColor(holeColor(index)).hex }" aria-hidden="true"></span>
    </div>
  </div>
</template>

<style scoped>
.mini-board {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
}

.hole {
  position: absolute;
  width: var(--hole-size, 15%);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid var(--color-hole-border);
  background: var(--color-hole);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
}

.peg {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  /* background-color set inline per-peg -- see holeColor()/getPegColor() above. */
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.15));
}

/* The score reveal (see ResultOverlay) walks the remaining pegs one at a
   time -- this is the "it's this one's turn" cue on the mini board itself. */
.hole.pulsing .peg {
  animation: hole-pulse 0.3s ease-out;
}

@keyframes hole-pulse {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hole.pulsing .peg {
    animation: none;
  }
}
</style>
