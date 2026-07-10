<!--
  ============================================================================
  components/EditorTriangleGrid.vue
  ----------------------------------------------------------------------------
  The clickable design grid for the level editor's 'triangle' shape mode --
  a real triangular-lattice board (see logic/geometry.js's
  makeCustomTriangularGeometry) instead of EditorGrid.vue's rows x cols
  rectangle. The canvas is a hexagon-shaped region of that lattice
  (listHexCanvasCells(), same shape makeHexagonGeometry() builds a real
  board from) that can be grown ring by ring via editor.resizeTriangle() --
  big enough, it holds a triangle, the hexagon itself, a star (two
  overlapping triangles), or any other shape the lattice can represent, all
  carved out by clicking cells to/from 'none'. Cells are laid out with the
  same math Board.vue uses (logic/boardLayout.js) so what you draw here is
  pixel-for-pixel the same shape a real game board would show -- no
  "doubled column" spacing trick needed to make a triangle look evenly
  staggered, which is exactly the trick that used to quietly drop a
  hand-drawn triangle's within-row jumps.

  Every cell starts out 'none' (not part of the board -- shown as a faint
  dashed circle). Clicking cycles it: none -> color 0 -> color 1 -> ... ->
  the design's last color -> empty -> none, same rule as EditorGrid.vue.
  composables/useEditor.js owns the actual cell data and the cycling rule.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { makeHexagonGeometry } from '../logic/geometry.js';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';
import { getPegColor } from '../logic/pegColors.js';

const props = defineProps({
  editor: { type: Object, required: true },
});

// The FULL hexagon canvas for this radius -- every slot needs a position to
// be clickable, whether or not the design currently uses it (a 'none' cell
// is still shown, faint, so it can be turned back on). geometry.cells here
// is exactly listHexCanvasCells(radius), unfiltered, so its index lines up
// 1:1 with editor.state.cellStates -- no separate row/col bookkeeping
// needed the way EditorGrid.vue's rectangle wants.
const geometry = computed(() => makeHexagonGeometry(props.editor.state.triangleRadius));
const holePositions = computed(() => computeDisplayPositions(geometry.value));
const holeDiameterPercent = computed(() => computeHoleDiameterPercent(geometry.value, holePositions.value));

function cellState(index) {
  return props.editor.state.cellStates[index];
}

function isPegCell(index) {
  return typeof cellState(index) === 'number';
}

function cellDescription(index) {
  const value = cellState(index);
  if (value === 'none') return 'not part of the board';
  if (value === 'empty') return 'empty hole';
  return `${getPegColor(value).name} peg`;
}
</script>

<template>
  <div class="editor-triangle" :class="{ busy: editor.state.isBusy }" :style="{ '--hole-size': holeDiameterPercent + '%' }">
    <button
      v-for="(position, index) in holePositions"
      :key="index"
      type="button"
      class="cell"
      :class="{ none: cellState(index) === 'none', empty: cellState(index) === 'empty', 'has-peg': isPegCell(index) }"
      :style="{ left: position.left, top: position.top }"
      :disabled="editor.state.isBusy"
      :aria-label="`Triangle canvas cell ${index}: ${cellDescription(index)}`"
      @click="editor.cycleTriangleCell(index)"
    >
      <span v-if="isPegCell(index)" class="peg" :style="{ background: getPegColor(cellState(index)).hex }" aria-hidden="true"></span>
    </button>
  </div>
</template>

<style scoped>
.editor-triangle {
  position: relative;
  width: min(95vw, 440px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  padding: 12px;
  background: var(--color-board-plate);
  border: 2px solid var(--color-board-border);
  border-radius: 12px;
  box-sizing: border-box;
}

.editor-triangle.busy {
  opacity: 0.7;
}

.cell {
  position: absolute;
  width: var(--hole-size, 15%);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px dashed var(--color-ink-dim);
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}

.cell.empty,
.cell.has-peg {
  background: var(--color-hole);
  border-style: solid;
  border-color: var(--color-board-border);
}

.cell:focus-visible {
  box-shadow: 0 0 0 3px var(--color-accent);
}

.peg {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  border: 1px solid var(--color-board-border);
}
</style>
