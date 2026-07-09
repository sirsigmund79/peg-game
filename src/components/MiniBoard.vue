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
import { isFilled } from '../logic/rules.js';

const props = defineProps({
  geometry: { type: Object, required: true },
  mask: { required: true }, // final bigint bitmask -- which holes still have a peg
});

const positions = computed(() => computeDisplayPositions(props.geometry));
const holeSizePercent = computed(() => computeHoleDiameterPercent(props.geometry, positions.value));

function holeHasPeg(index) {
  return isFilled(props.mask, index);
}
</script>

<template>
  <div class="mini-board" :style="{ '--hole-size': holeSizePercent + '%' }">
    <div
      v-for="(position, index) in positions"
      :key="index"
      class="hole"
      :class="{ filled: holeHasPeg(index) }"
      :style="{ left: position.left, top: position.top }"
    >
      <span v-if="holeHasPeg(index)" class="peg" aria-hidden="true"></span>
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
  background-color: var(--color-peg);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.15));
}
</style>
