<!--
  ============================================================================
  components/AdminPuzzleEditPanel.vue
  ----------------------------------------------------------------------------
  The admin puzzle editor's "edit menu": load any puzzle (pool-sourced or
  already scheduled) for a given date, edit its layout with the SAME
  EditorGrid/EditorTriangleGrid components the level editor already uses,
  re-run the full solve/DAG/perceived-difficulty analysis in a worker (so it
  can't freeze the tab), and save it back as a logic/scheduledPuzzles.js
  override via the local admin write endpoint.

  Chrome is deliberately its own skin (a dark "field notebook" look, data
  set in tabular monospace) -- distinct from the Moose theme players see,
  since this never ships to them. The embedded board itself
  (EditorGrid/EditorTriangleGrid) is untouched and still renders with the
  real game's own board CSS variables.

  IMPORTANT: reachable only through AdminPuzzlesView.vue, which -- like the
  rest of DevToolsView.vue -- only ever renders when import.meta.env.DEV is
  true. Never ships to players.
  ============================================================================
-->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAdminPuzzleEditor } from '../composables/useAdminPuzzleEditor.js';
import { getPegColor } from '../logic/pegColors.js';
import { PUZZLE_DIFFICULTY } from '../logic/puzzleDifficulty.js';
import { classifyDifficultyBucket } from '../logic/puzzleDifficultyRecord.js';
import EditorGrid from './EditorGrid.vue';
import EditorTriangleGrid from './EditorTriangleGrid.vue';

const props = defineProps({
  puzzleNumber: { type: Number, required: true },
});
const emit = defineEmits(['close']);

const admin = useAdminPuzzleEditor();
const boardNameInput = ref('');
const parInput = ref('');
const rowsInput = ref('');
const colsInput = ref('');
const triangleRadiusInput = ref('');

const difficultyByPuzzleNumber = new Map(PUZZLE_DIFFICULTY.map((record) => [record.puzzleNumber, record]));

const BUCKET_CLASS = { Easy: 'bucket-easy', Medium: 'bucket-medium', Genius: 'bucket-genius', Unknown: 'bucket-unknown' };

// Short algorithm-style names rather than full sentences -- see each
// heuristic's own definition in logic/puzzlePerceivedDifficulty.js.
const HEURISTIC_LABELS = {
  firstLegalMove: 'first-legal',
  mostConstrainedOverPeg: 'min-degree',
  largestColorFirst: 'max-color',
  centroidSeeking: 'centroid',
};

function formatBigNumber(value) {
  if (value === null || value === undefined) return '–';
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * Normalizes EITHER a freshly re-run analysis result OR the puzzle's
 * existing generated-file snapshot into one common shape for display, so
 * the template only needs to render one stats block regardless of source.
 * Fresh results win once a re-run finishes; otherwise this falls back to
 * whatever's already known for this puzzle (if anything).
 */
const displayStats = computed(() => {
  if (admin.analysis.status === 'done') {
    const dagSummary = admin.analysis.dagSummary;
    return {
      source: 'fresh',
      par: admin.analysis.par,
      bestPossible: null,
      pegCount: null,
      mismatch: null,
      // A live re-run uses the SAME stored cutoffs a save would -- see
      // puzzleDifficultyRecord.js -- so the bucket shown here always
      // matches what saving would actually classify it as.
      difficultyBucket: classifyDifficultyBucket(dagSummary.totalDifficulty),
      ...dagSummary,
      perceivedDifficulty: admin.analysis.perceived.perceivedDifficulty,
      heuristicResults: admin.analysis.perceived.heuristicResults,
      symmetryScore: admin.analysis.perceived.symmetryScore,
    };
  }

  const record = difficultyByPuzzleNumber.get(props.puzzleNumber);
  if (!record) return null;
  return { source: 'stored', par: null, ...record };
});

function syncSizeInputs() {
  rowsInput.value = String(admin.editor.state.rows);
  colsInput.value = String(admin.editor.state.cols);
  triangleRadiusInput.value = String(admin.editor.state.triangleRadius);
}

function loadCurrentPuzzle() {
  admin.loadPuzzle(props.puzzleNumber);
  boardNameInput.value = admin.puzzleInfo.boardName;
  parInput.value = admin.editor.state.calculatedPar ? admin.editor.state.calculatedPar.join(',') : '';
  syncSizeInputs();
}

onMounted(loadCurrentPuzzle);
watch(() => props.puzzleNumber, loadCurrentPuzzle);
onUnmounted(() => admin.cancelAnalysis());

watch(
  () => admin.analysis.par,
  (par) => {
    if (par) parInput.value = par.join(',');
  }
);

function applyGridResize() {
  const newRows = Math.min(20, Math.max(1, Number.parseInt(rowsInput.value, 10) || admin.editor.state.rows));
  const newCols = Math.min(20, Math.max(1, Number.parseInt(colsInput.value, 10) || admin.editor.state.cols));
  rowsInput.value = String(newRows);
  colsInput.value = String(newCols);
  admin.editor.resizeGrid(newRows, newCols);
}

function applyTriangleResize() {
  const newRadius = Math.min(10, Math.max(1, Number.parseInt(triangleRadiusInput.value, 10) || admin.editor.state.triangleRadius));
  triangleRadiusInput.value = String(newRadius);
  admin.editor.resizeTriangle(newRadius);
}

function handleShapeModeChange(shape) {
  admin.editor.setShapeMode(shape);
  syncSizeInputs();
}

function parseParInput() {
  return parInput.value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function handleSave() {
  const par = parseParInput();
  if (par.length !== admin.editor.state.colorCount) {
    admin.save.status = 'error';
    admin.save.errorMessage = `par needs exactly ${admin.editor.state.colorCount} number(s), comma-separated (one per color) -- got ${par.length}.`;
    return;
  }
  admin.saveCurrentPuzzle(boardNameInput.value.trim() || 'Untitled', par);
}
</script>

<template>
  <div class="edit-panel-overlay" @click.self="emit('close')">
    <div class="edit-panel">
      <div class="edit-panel-header">
        <h2>
          №{{ admin.puzzleInfo.puzzleNumber }} <span class="header-date">{{ admin.puzzleInfo.date }}</span>
        </h2>
        <div class="header-tags">
          <span class="source-tag" :class="{ scheduled: admin.puzzleInfo.isScheduled }">
            {{ admin.puzzleInfo.isScheduled ? 'scheduled' : 'pool' }}
          </span>
          <span v-if="displayStats?.difficultyBucket" class="bucket-tag" :class="BUCKET_CLASS[displayStats.difficultyBucket]">
            {{ displayStats.difficultyBucket }}
          </span>
          <button type="button" class="close-button" @click="emit('close')">&times;</button>
        </div>
      </div>

      <div class="edit-panel-body">
        <div class="layout-column">
          <div class="toolbar-row">
            <button
              type="button"
              class="toolbar-button"
              :class="{ primary: admin.editor.state.shape === 'grid' }"
              :disabled="admin.editor.state.isBusy"
              @click="handleShapeModeChange('grid')"
            >
              Grid
            </button>
            <button
              type="button"
              class="toolbar-button"
              :class="{ primary: admin.editor.state.shape === 'triangle' }"
              :disabled="admin.editor.state.isBusy"
              @click="handleShapeModeChange('triangle')"
            >
              Triangle
            </button>
          </div>

          <EditorGrid v-if="admin.editor.state.shape === 'grid'" :editor="admin.editor" />
          <EditorTriangleGrid v-else :editor="admin.editor" />

          <div class="toolbar-row">
            <template v-for="count in [2, 3, 4]" :key="count">
              <button
                type="button"
                class="toolbar-button small"
                :class="{ primary: admin.editor.state.colorCount === count }"
                :disabled="admin.editor.state.isBusy"
                @click="admin.editor.setColorCount(count)"
              >
                {{ count }}c
              </button>
            </template>
            <template v-if="admin.editor.state.shape === 'grid'">
              <input v-model="rowsInput" type="number" min="1" max="20" class="size-input" @change="applyGridResize" />
              <span>&times;</span>
              <input v-model="colsInput" type="number" min="1" max="20" class="size-input" @change="applyGridResize" />
            </template>
            <input v-else v-model="triangleRadiusInput" type="number" min="1" max="10" class="size-input" @change="applyTriangleResize" />
          </div>
        </div>

        <div class="stats-column">
          <label class="field">
            Board name
            <input v-model="boardNameInput" type="text" />
          </label>

          <label class="field">
            par <span class="field-hint">(comma-separated, one per color)</span>
            <input v-model="parInput" type="text" placeholder="e.g. 1,2" class="mono-input" />
          </label>

          <div class="action-row">
            <button
              type="button"
              class="toolbar-button primary"
              :disabled="admin.analysis.status === 'running'"
              @click="admin.runAnalysis()"
            >
              {{ admin.analysis.status === 'running' ? 'solving…' : 'Re-run analysis' }}
            </button>
            <button v-if="admin.analysis.status === 'running'" type="button" class="toolbar-button" @click="admin.cancelAnalysis()">
              Cancel
            </button>
          </div>

          <p v-if="admin.analysis.status === 'error'" class="status-message error">{{ admin.analysis.errorMessage }}</p>
          <p v-if="admin.analysis.status === 'cancelled'" class="status-message">Cancelled.</p>

          <div v-if="displayStats" class="stats-panel">
            <p class="stats-source-note" :title="displayStats.source === 'stored' ? 'From the last full batch run' : ''">
              {{ displayStats.source === 'fresh' ? 'live' : 'cached' }}
            </p>

            <template v-if="displayStats.dagComplete">
              <section class="stat-section">
                <h3>
                  Best possible
                  <span v-if="displayStats.mismatch" class="info-mark flag" :title="displayStats.mismatch">!</span>
                </h3>
                <div class="stat-row">
                  <span class="stat-label">score</span>
                  <span class="stat-value">
                    <template v-if="displayStats.par">
                      <strong v-for="(count, colorIndex) in displayStats.par" :key="colorIndex" :style="{ color: getPegColor(colorIndex).hex }">
                        {{ getPegColor(colorIndex).emoji }}{{ count }}
                      </strong>
                    </template>
                    <template v-else>{{ displayStats.bestPossible }}</template>
                  </span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">n explored</span>
                  <span class="stat-value">{{ displayStats.nodesVisited?.toLocaleString() ?? '–' }}</span>
                </div>
              </section>

              <section class="stat-section">
                <h3>
                  Solution space
                  <span class="info-mark" title="Positions and moves that stay on a path to the best score. Routes are distinct optimal move ORDERINGS, not distinct final states.">?</span>
                </h3>
                <div class="stat-row">
                  <span class="stat-label">positions{{ displayStats.sampled ? ' *' : '' }}</span>
                  <span class="stat-value">{{ displayStats.dagNodeCount.toLocaleString() }}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">moves</span>
                  <span class="stat-value">{{ displayStats.dagEdgeCount.toLocaleString() }}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">optimal routes</span>
                  <span class="stat-value">{{ formatBigNumber(displayStats.optimalPathCount) }}</span>
                </div>
                <p v-if="displayStats.sampled" class="stat-flag-line">* sampled — too large to fully enumerate</p>
              </section>

              <section class="stat-section">
                <h3>
                  Branching &amp; difficulty
                  <span class="info-mark" title="Effective branching merges order-only permutations of independent moves. Total difficulty = raw branching × trap ratio × remaining depth, path-averaged (relative metric only, compare within this puzzle set).">?</span>
                </h3>
                <div class="stat-row">
                  <span class="stat-label">raw / safe / effective</span>
                  <span class="stat-value">{{ displayStats.avgRawBranching.toFixed(1) }} / {{ displayStats.avgSafeBranching.toFixed(1) }} / {{ displayStats.avgEffectiveBranching.toFixed(1) }}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">trap ratio</span>
                  <span class="stat-value">{{ (displayStats.avgTrapRatio * 100).toFixed(0) }}%</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">total</span>
                  <span class="stat-value">{{ displayStats.totalDifficulty.toFixed(2) }}</span>
                </div>
              </section>
            </template>
            <p v-else class="status-message error">Solver budget exceeded -- no proof of best-possible for this layout yet.</p>

            <section class="stat-section">
              <h3>
                Perceived
                <span class="info-mark" title="Perceived: fraction of no-lookahead heuristics that fail to reach the optimum. Symmetry: best-matching non-trivial board automorphism, colour-preserving fraction.">?</span>
              </h3>
              <div class="stat-row">
                <span class="stat-label">score</span>
                <span class="stat-value">{{ displayStats.perceivedDifficulty === null ? '–' : displayStats.perceivedDifficulty.toFixed(2) }}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">symmetry</span>
                <span class="stat-value">{{ displayStats.symmetryScore === null ? 'n/a' : displayStats.symmetryScore.toFixed(2) }}</span>
              </div>
              <div v-if="displayStats.heuristicResults" class="heuristic-table">
                <div
                  v-for="heuristic in displayStats.heuristicResults"
                  :key="heuristic.name"
                  class="stat-row heuristic-row"
                  :class="{ succeeded: heuristic.succeeded, failed: heuristic.succeeded === false }"
                >
                  <span class="stat-label">{{ HEURISTIC_LABELS[heuristic.name] ?? heuristic.name }}</span>
                  <span class="stat-value">{{ heuristic.succeeded === null ? 'n/a' : heuristic.succeeded ? 'solves' : 'misses' }}</span>
                </div>
              </div>
            </section>

            <ul v-if="displayStats.acceptanceFailures?.length > 0" class="failure-list">
              <li v-for="(failure, index) in displayStats.acceptanceFailures" :key="index"><strong>{{ failure.check }}</strong> — {{ failure.detail }}</li>
            </ul>
          </div>
          <p v-else class="status-message">No data yet for this puzzle -- run the analysis above.</p>

          <div class="action-row save-row">
            <button type="button" class="toolbar-button primary" :disabled="admin.save.status === 'saving'" @click="handleSave">
              {{ admin.save.status === 'saving' ? 'saving…' : 'Save' }}
            </button>
            <span v-if="admin.save.status === 'saved'" class="status-message success">Saved.</span>
            <span v-if="admin.save.status === 'error'" class="status-message error">{{ admin.save.errorMessage }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 8, 6, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.edit-panel {
  background: #191410;
  color: #e8ddc9;
  border: 1px solid #3a3024;
  border-radius: 3px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 0.86rem;
}

.edit-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 16px 20px;
  border-bottom: 1px solid #3a3024;
  position: sticky;
  top: 0;
  background: #191410;
}

.edit-panel-header h2 {
  margin: 0;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-weight: 800;
  font-size: 1.05rem;
  color: #e8ddc9;
  letter-spacing: -0.01em;
}

.header-date {
  color: #a2937a;
  font-weight: 400;
  font-size: 0.95rem;
  margin-left: 8px;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-tag {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 7px;
  border: 1px solid #4a4030;
  color: #a2937a;
}

.source-tag.scheduled {
  border-color: #4f7a5c;
  color: #8fbf9e;
}

.close-button {
  background: none;
  border: none;
  color: #a2937a;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  margin-left: 4px;
}

.close-button:hover {
  color: #e8ddc9;
}

.edit-panel-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 20px;
}

@media (max-width: 720px) {
  .edit-panel-body {
    grid-template-columns: 1fr;
  }
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  flex-wrap: wrap;
}

.toolbar-button {
  padding: 6px 14px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-weight: 600;
  font-size: 0.8rem;
  border-radius: 2px;
  border: 1px solid #4a4030;
  background: transparent;
  color: #e8ddc9;
  cursor: pointer;
}

.toolbar-button:hover:not(:disabled) {
  border-color: #a2937a;
}

.toolbar-button.small {
  padding: 6px 10px;
}

.toolbar-button.primary {
  background: #b3833f;
  color: #191410;
  border-color: #b3833f;
  font-weight: 700;
}

.toolbar-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.size-input {
  width: 46px;
  padding: 4px;
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  background: #211a13;
  border: 1px solid #3a3024;
  color: #e8ddc9;
  border-radius: 2px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #a2937a;
  margin-bottom: 12px;
}

.field-hint {
  text-transform: none;
  font-weight: 400;
  letter-spacing: normal;
}

.field input {
  padding: 7px 9px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 0.85rem;
  text-transform: none;
  font-weight: 400;
  letter-spacing: normal;
  border-radius: 2px;
  border: 1px solid #3a3024;
  background: #211a13;
  color: #e8ddc9;
}

.field input.mono-input {
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  flex-wrap: wrap;
}

.status-message {
  font-size: 0.75rem;
  color: #a2937a;
}

.status-message.error {
  color: #c1685a;
}

.status-message.success {
  color: #8fbf9e;
}

.stats-panel {
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px;
}

.stats-source-note {
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6e6250;
  margin: 0 0 14px;
}

.stat-section {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2c2418;
}

.stat-section h3 {
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-weight: 800;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #cfae74;
}

/* Hover-only explanations (native title tooltip) instead of always-visible
   caption sentences -- keeps the default view a plain, scannable data
   table; the "why" is still one hover away when it's actually wanted. */
.info-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid #4a4030;
  color: #6e6250;
  font-size: 0.58rem;
  font-weight: 700;
  font-style: normal;
  text-transform: none;
  letter-spacing: normal;
  cursor: help;
}

.info-mark.flag {
  border-color: #c1685a;
  color: #c1685a;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 1px 0;
}

.stat-label {
  font-size: 0.75rem;
  color: #a2937a;
}

.stat-value {
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 0.82rem;
  color: #e8ddc9;
  text-align: right;
}

.stat-flag-line {
  margin: 4px 0 0;
  font-size: 0.66rem;
  color: #6e6250;
}

.heuristic-table {
  margin: 4px 0 0;
  padding: 6px 0 0;
  border-top: 1px solid #2c2418;
}

.heuristic-row.succeeded .stat-value {
  color: #8fbf9e;
}

.heuristic-row.failed .stat-value {
  color: #c1685a;
}

.bucket-tag {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 1px 6px;
  border: 1px solid currentColor;
}

.bucket-tag.bucket-easy {
  color: #8fbf9e;
}

.bucket-tag.bucket-medium {
  color: #cfae74;
}

.bucket-tag.bucket-genius {
  color: #c1685a;
}

.bucket-tag.bucket-unknown {
  color: #6e6250;
}

.failure-list {
  margin: 8px 0 0;
  padding: 8px 0 0 16px;
  font-size: 0.72rem;
  color: #cfae74;
  border-top: 1px solid #2c2418;
}

.save-row {
  border-top: 1px solid #3a3024;
  padding-top: 14px;
  margin-top: 18px;
}
</style>
