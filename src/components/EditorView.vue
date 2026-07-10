<!--
  ============================================================================
  components/EditorView.vue
  ----------------------------------------------------------------------------
  The full level-editor screen: the clickable design grid, the toolbar
  (resize, clear, Calculate Max, Watch Solve, Save), and a "My Puzzles" list
  of designs saved on this device. Saved designs are LOCAL ONLY -- see
  composables/useEditor.js for why a custom design can't become an actual
  shared daily puzzle.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { useEditor } from '../composables/useEditor.js';
import { getPegColor } from '../logic/pegColors.js';
import EditorGrid from './EditorGrid.vue';
import EditorTriangleGrid from './EditorTriangleGrid.vue';
import Board from './Board.vue';

const emit = defineEmits(['play-puzzle']);

const editor = useEditor();
const COLOR_COUNT_OPTIONS = [2, 3, 4];
const SHAPE_MODE_OPTIONS = [
  { value: 'grid', label: 'Grid' },
  { value: 'triangle', label: 'Triangle' },
];

const rowsInput = ref(String(editor.state.rows));
const colsInput = ref(String(editor.state.cols));
const triangleRadiusInput = ref(String(editor.state.triangleRadius));
const saveNameInput = ref('');

// Radius is capped lower than the grid's rows/cols: a hex canvas grows by a
// whole RING (6*radius cells) per step, so it gets huge fast -- radius 10
// is already 331 cells, comfortably past what's worth hand-drawing.
const MAX_TRIANGLE_RADIUS = 10;

function applyResize() {
  const newRows = Math.min(20, Math.max(1, Number.parseInt(rowsInput.value, 10) || editor.state.rows));
  const newCols = Math.min(20, Math.max(1, Number.parseInt(colsInput.value, 10) || editor.state.cols));
  rowsInput.value = String(newRows);
  colsInput.value = String(newCols);
  editor.resizeGrid(newRows, newCols);
}

function applyTriangleResize() {
  const newRadius = Math.min(
    MAX_TRIANGLE_RADIUS,
    Math.max(1, Number.parseInt(triangleRadiusInput.value, 10) || editor.state.triangleRadius)
  );
  triangleRadiusInput.value = String(newRadius);
  editor.resizeTriangle(newRadius);
}

function handleShapeModeChange(shape) {
  editor.setShapeMode(shape);
  rowsInput.value = String(editor.state.rows);
  colsInput.value = String(editor.state.cols);
  triangleRadiusInput.value = String(editor.state.triangleRadius);
}

function handleSave() {
  const didSave = editor.saveCurrentDesign(saveNameInput.value);
  if (didSave) {
    saveNameInput.value = '';
  }
}

function playSavedPuzzle(savedPuzzle) {
  emit('play-puzzle', editor.puzzleFromSavedDesign(savedPuzzle));
}
</script>

<template>
  <div class="editor-view">
    <p class="instructions">{{ editor.state.statusMessage }}</p>

    <div v-if="editor.state.previewGame" class="preview-panel">
      <p class="preview-label">Watch Solve preview</p>
      <Board :game="editor.state.previewGame" />
      <button type="button" class="text-button" :disabled="editor.state.isBusy" @click="editor.closePreview()">Back to editing</button>
    </div>

    <template v-else>
      <div class="toolbar-row">
        <span class="resize-field color-count-label">Shape</span>
        <button
          v-for="option in SHAPE_MODE_OPTIONS"
          :key="option.value"
          type="button"
          class="toolbar-button"
          :class="{ primary: editor.state.shape === option.value }"
          :disabled="editor.state.isBusy"
          @click="handleShapeModeChange(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <EditorGrid v-if="editor.state.shape === 'grid'" :editor="editor" />
      <EditorTriangleGrid v-else :editor="editor" />

      <div class="toolbar-row">
        <span class="resize-field color-count-label">Colors</span>
        <button
          v-for="count in COLOR_COUNT_OPTIONS"
          :key="count"
          type="button"
          class="toolbar-button"
          :class="{ primary: editor.state.colorCount === count }"
          :disabled="editor.state.isBusy"
          @click="editor.setColorCount(count)"
        >
          {{ count }}
        </button>
      </div>

      <div v-if="editor.state.shape === 'grid'" class="toolbar-row">
        <label class="resize-field">
          Rows
          <input v-model="rowsInput" type="number" min="1" max="20" @change="applyResize" />
        </label>
        <label class="resize-field">
          Cols
          <input v-model="colsInput" type="number" min="1" max="20" @change="applyResize" />
        </label>
        <button type="button" class="toolbar-button" @click="editor.clearGrid()">Clear</button>
      </div>
      <div v-else class="toolbar-row">
        <label class="resize-field">
          Size
          <input v-model="triangleRadiusInput" type="number" min="1" :max="MAX_TRIANGLE_RADIUS" @change="applyTriangleResize" />
        </label>
        <button type="button" class="toolbar-button" @click="editor.clearGrid()">Clear</button>
      </div>

      <div class="toolbar-row">
        <button type="button" class="toolbar-button primary" :disabled="editor.state.isBusy" @click="editor.calculateMax()">Calculate Max</button>
        <button type="button" class="toolbar-button primary" :disabled="editor.state.isBusy" @click="editor.watchSolve()">Watch Solve</button>
      </div>

      <p v-if="editor.state.calculatedPar !== null" class="par-readout">
        Best possible:
        <strong
          v-for="(count, colorIndex) in editor.state.calculatedPar"
          :key="colorIndex"
          class="par-chip"
          :style="{ color: getPegColor(colorIndex).hex }"
        >
          {{ getPegColor(colorIndex).emoji }}{{ count }}
        </strong>
        left
      </p>

      <div class="save-row">
        <input v-model="saveNameInput" type="text" placeholder="Name this design..." class="save-name-input" />
        <button type="button" class="toolbar-button primary" :disabled="editor.state.isBusy" @click="handleSave">Save</button>
      </div>
    </template>

    <div v-if="editor.state.savedPuzzles.length > 0" class="my-puzzles">
      <h2>My Puzzles</h2>
      <ul class="puzzle-list">
        <li v-for="saved in editor.state.savedPuzzles" :key="saved.id" class="puzzle-item">
          <div class="puzzle-info">
            <strong>{{ saved.name }}</strong>
            <span class="puzzle-meta">
              par
              <span v-for="(count, colorIndex) in saved.par" :key="colorIndex" :style="{ color: getPegColor(colorIndex).hex }">
                {{ getPegColor(colorIndex).emoji }}{{ count }}
              </span>
              &middot; {{ saved.shape === 'triangle' ? `triangle, size ${saved.radius}` : `${saved.rows}x${saved.cols}` }}
            </span>
          </div>
          <div class="puzzle-actions">
            <button type="button" class="text-button" @click="playSavedPuzzle(saved)">Play</button>
            <button type="button" class="text-button" @click="editor.loadSavedDesignIntoEditor(saved)">Edit</button>
            <button type="button" class="text-button" @click="editor.duplicateSavedDesign(saved)">Duplicate</button>
            <button type="button" class="text-button" @click="editor.copyScheduleSnippet(saved)">Copy for scheduling</button>
            <button type="button" class="text-button danger" @click="editor.deleteSavedPuzzle(saved.id)">Delete</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.editor-view {
  max-width: 440px;
  margin: 0 auto;
  padding: 0 0 40px;
}

.instructions {
  font-family: var(--font-ui);
  color: var(--color-ink-secondary);
  min-height: 1.4em;
  margin: 0 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.preview-panel {
  text-align: center;
}

.preview-label {
  font-family: var(--font-ui);
  font-weight: 700;
  color: var(--color-ink);
  margin: 0 0 8px;
}

.toolbar-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.resize-field {
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--color-ink-dim);
}

.resize-field input {
  width: 60px;
  padding: 6px;
  border: 1px solid var(--color-card-border);
  border-radius: 8px;
  font-family: var(--font-ui);
}

.toolbar-button {
  min-height: 44px;
  padding: 8px 18px;
  font-family: var(--font-ui);
  font-weight: 700;
  border-radius: 8px;
  border: 2px solid var(--color-ink);
  background: var(--color-card-bg);
  color: var(--color-ink);
  cursor: pointer;
}

.toolbar-button.primary {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}

.toolbar-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.par-readout {
  text-align: center;
  font-family: var(--font-ui);
  color: var(--color-ink);
  margin: 8px 0;
}

.par-chip {
  margin: 0 2px;
}

.color-count-label {
  font-weight: 700;
  color: var(--color-ink);
}

.save-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 16px 0;
}

.save-name-input {
  flex: 1;
  max-width: 240px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-card-border);
  font-family: var(--font-ui);
}

.my-puzzles {
  margin-top: 28px;
  text-align: left;
}

.my-puzzles h2 {
  font-family: var(--font-display);
  color: var(--color-ink);
  font-size: 1.2rem;
}

.puzzle-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.puzzle-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: 10px;
}

.puzzle-info {
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  color: var(--color-ink);
}

.puzzle-meta {
  font-size: 0.8rem;
  color: var(--color-ink-dim);
}

.puzzle-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.text-button {
  background: none;
  border: none;
  color: var(--color-accent);
  font-family: var(--font-ui);
  font-weight: 700;
  cursor: pointer;
  padding: 6px;
}

.text-button.danger {
  color: #a83232;
}
</style>
