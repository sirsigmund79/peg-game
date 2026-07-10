<!--
  ============================================================================
  components/EditorGrid.vue
  ----------------------------------------------------------------------------
  The clickable design grid for the level editor. Every cell starts out
  'none' (not part of the board -- shown as a faint dashed square). Clicking
  cycles it: none -> color 0 -> color 1 -> ... -> the design's last color ->
  empty -> none. This is plain display + click handling --
  composables/useEditor.js owns the actual cell data and the cycling rule.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { getPegColor } from '../logic/pegColors.js';

const props = defineProps({
  editor: { type: Object, required: true },
});

// Vue can't nest two v-for loops on one element, so we flatten "every
// (row, col) pair" into a single list here and loop over that instead.
const cellCoordinates = computed(() => {
  const coordinates = [];
  for (let row = 0; row < props.editor.state.rows; row++) {
    for (let col = 0; col < props.editor.state.cols; col++) {
      coordinates.push({ row, col });
    }
  }
  return coordinates;
});

/** A cell is 'none', 'empty', or a number (which peg color it starts with). */
function cellState(row, col) {
  return props.editor.state.cellStates[row * props.editor.state.cols + col];
}

function isPegCell(row, col) {
  return typeof cellState(row, col) === 'number';
}

function cellDescription(row, col) {
  const value = cellState(row, col);
  if (value === 'none') return 'not part of the board';
  if (value === 'empty') return 'empty hole';
  return `${getPegColor(value).name} peg`;
}
</script>

<template>
  <div
    class="editor-grid"
    :style="{ gridTemplateColumns: `repeat(${editor.state.cols}, 1fr)` }"
    :class="{ busy: editor.state.isBusy }"
  >
    <button
      v-for="{ row, col } in cellCoordinates"
      :key="`${row}-${col}`"
      type="button"
      class="cell"
      :class="{ empty: cellState(row, col) === 'empty', 'has-peg': isPegCell(row, col) }"
      :disabled="editor.state.isBusy"
      :aria-label="`Grid cell row ${row + 1}, column ${col + 1}: ${cellDescription(row, col)}`"
      @click="editor.cycleCell(row, col)"
    >
      <span v-if="isPegCell(row, col)" class="peg" :style="{ background: getPegColor(cellState(row, col)).hex }" aria-hidden="true"></span>
    </button>
  </div>
</template>

<style scoped>
.editor-grid {
  display: grid;
  gap: 4px;
  max-width: 440px;
  margin: 0 auto;
  padding: 12px;
  background: var(--color-board-plate);
  border: 2px solid var(--color-board-border);
  border-radius: 12px;
}

.editor-grid.busy {
  opacity: 0.7;
}

.cell {
  aspect-ratio: 1 / 1;
  border-radius: 4px;
  border: 1px dashed var(--color-ink-dim);
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell.empty {
  background: var(--color-hole);
  border-style: solid;
  border-color: var(--color-board-border);
}

.cell.has-peg {
  background: var(--color-hole);
  border-style: solid;
  border-color: var(--color-board-border);
}

.peg {
  width: 70%;
  height: 70%;
  border-radius: 50%;
  /* background set inline per-cell -- see getPegColor() above. */
  border: 1px solid var(--color-board-border);
}
</style>
