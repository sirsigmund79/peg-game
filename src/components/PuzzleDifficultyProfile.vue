<!--
  ============================================================================
  components/PuzzleDifficultyProfile.vue
  ----------------------------------------------------------------------------
  DEV-ONLY: "is this puzzle hard, and WHERE" -- one bar per depth, height =
  what SHARE of the legal moves at that point are traps (moves that throw
  away the best-possible outcome), via logic/puzzleDag.js's already-built
  safe/trap DAG (the SAME scorer that feeds the admin scheduling grid's
  difficulty badge -- see workers/puzzleAnalysisWorker.js -- just broken out
  per depth here instead of collapsed into one number).

  This is deliberately a DIFFERENT data source from SearchTreeVisualizer.vue's
  charts. Those show raw solver EFFORT, which is partly an artifact of
  solver.js's move-order and early-exit shortcut -- comparing that shape
  across two different puzzles isn't quite apples-to-apples. Trap ratio
  doesn't have that problem: it's "of the moves actually on the board at
  this point, how many are mistakes," independent of which order the solver
  happened to check them in. High bars (red) = a dangerous stretch, lots of
  tempting-looking wrong answers. Low bars (green) = you can't really go
  wrong here. A puzzle that's ALL green is easy start to finish; one with a
  red spike in the middle is "easy, then a minefield, then easy again" --
  exactly the shape a screenshot of this chart is meant to make legible at a
  glance.

  Runs once automatically when this panel first mounts; a manual "Re-run"
  button re-scores from whatever the CURRENT board position is (see
  SearchTreeVisualizer.vue's own header for why that's a manual button, not
  an automatic re-run on every move).

  IMPORTANT: only ever imported where `import.meta.env.DEV` is true (see
  PlayView.vue) -- never ships to real players.
  ============================================================================
-->
<script setup>
import { reactive, computed, onBeforeUnmount, toRaw } from 'vue';

const props = defineProps({
  geometry: { type: Object, required: true },
  masks: { type: Array, required: true },
  par: { type: Array, required: true },
});

const SAFE_COLOR = '#1c8c52'; // pine green, same "safe/optimal" association used throughout the other dev charts
const DANGER_COLOR = '#c1432f'; // matches logic/pegColors.js's red

function lerpColor(hexA, hexB, t) {
  const a = Number.parseInt(hexA.slice(1), 16);
  const b = Number.parseInt(hexB.slice(1), 16);
  const clampedT = Math.max(0, Math.min(1, t));
  const channel = (shift) => {
    const from = (a >> shift) & 255;
    const to = (b >> shift) & 255;
    return Math.round(from + (to - from) * clampedT);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

const run = reactive({
  status: 'idle', // 'idle' | 'running' | 'done' | 'incomplete' | 'error'
  depthProfile: [],
  overallTrapRatio: 0,
  dagNodeCount: 0,
  sampled: false,
  incompleteReason: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
});

let activeWorker = null;

function terminateActiveWorker() {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}

function runSearch() {
  terminateActiveWorker();
  run.status = 'running';
  run.depthProfile = [];
  run.overallTrapRatio = 0;
  run.dagNodeCount = 0;
  run.sampled = false;
  run.incompleteReason = null;
  run.errorMessage = null;
  run.startedAt = Date.now();
  run.finishedAt = null;

  const worker = new Worker(new URL('../workers/puzzleDifficultyProfileWorker.js', import.meta.url), { type: 'module' });
  activeWorker = worker;

  worker.onmessage = (event) => {
    if (activeWorker !== worker) return; // a stale message from a run superseded by a newer "Re-run"
    const message = event.data;
    run.finishedAt = Date.now();

    if (message.type === 'done') {
      run.status = 'done';
      run.depthProfile = message.depthProfile;
      run.overallTrapRatio = message.overallTrapRatio;
      run.dagNodeCount = message.dagNodeCount;
      run.sampled = message.sampled;
    } else if (message.type === 'incomplete') {
      run.status = 'incomplete';
      run.incompleteReason = message.reason;
    } else {
      run.status = 'error';
      run.errorMessage = message.message;
    }
    worker.terminate();
    activeWorker = null;
  };

  worker.onerror = (event) => {
    if (activeWorker !== worker) return;
    run.status = 'error';
    run.errorMessage = event.message || 'The difficulty worker crashed.';
    worker.terminate();
    activeWorker = null;
  };

  // toRaw() unwraps Vue's reactive Proxy wrapping (see
  // SearchTreeVisualizer.vue's own runSearch() for why postMessage needs
  // that -- structured clone can't cross the worker boundary with it).
  worker.postMessage({ geometry: toRaw(props.geometry), cellCount: props.geometry.cellCount, masks: toRaw(props.masks) });
}

runSearch(); // auto-start once, from whatever position this panel first mounts with -- see the file header

onBeforeUnmount(terminateActiveWorker);

const elapsedLabel = computed(() => {
  if (!run.startedAt || !run.finishedAt) return null;
  const seconds = (run.finishedAt - run.startedAt) / 1000;
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds.toFixed(1)}s`;
});

const overallPercentLabel = computed(() => `${Math.round(run.overallTrapRatio * 100)}%`);
const overallColor = computed(() => lerpColor(SAFE_COLOR, DANGER_COLOR, run.overallTrapRatio));
const formattedDagNodeCount = computed(() => run.dagNodeCount.toLocaleString());

const depthRows = computed(() =>
  run.depthProfile.map((entry) => {
    const ratio = entry.avgTrapRatio ?? 0;
    return {
      depth: entry.depth,
      ratio,
      percentLabel: entry.nodeCount > 0 ? `${Math.round(ratio * 100)}%` : '—',
      widthPercent: ratio * 100,
      color: lerpColor(SAFE_COLOR, DANGER_COLOR, ratio),
      nodeCount: entry.nodeCount,
    };
  })
);
</script>

<template>
  <div class="difficulty-panel">
    <div class="panel-header">
      <div>
        <p class="panel-title">Hard vs. easy</p>
        <p v-if="run.status === 'running'" class="panel-meta">
          <span class="pulse-dot" aria-hidden="true"></span>Scoring every move as safe or a trap&hellip;
        </p>
        <p v-else-if="run.status === 'done'" class="panel-meta">
          {{ elapsedLabel }} &middot; {{ formattedDagNodeCount }} states on the optimal-preserving tree{{ run.sampled ? ' (sampled)' : '' }}
        </p>
        <p v-else-if="run.status === 'incomplete'" class="panel-meta">
          {{ run.incompleteReason === 'dag-too-large' ? 'This puzzle\'s safe/trap map is too large to score live.' : 'Could not prove an optimum to score against.' }}
        </p>
        <p v-else-if="run.status === 'error'" class="panel-meta error">{{ run.errorMessage }}</p>
      </div>
      <button type="button" class="resim-button" :disabled="run.status === 'running'" @click="runSearch">
        {{ run.status === 'running' ? 'scoring…' : 'Re-run' }}
      </button>
    </div>

    <p v-if="run.status === 'done'" class="headline">
      <span class="headline-number" :style="{ color: overallColor }">{{ overallPercentLabel }}</span>
      <span class="headline-label">of moves along the way are traps, on average</span>
    </p>

    <div v-if="depthRows.length" class="layer-chart-wrap">
      <div class="layer-chart-legend">
        <span>depth</span>
        <span>share of moves that are traps</span>
      </div>
      <div
        class="layer-chart"
        role="img"
        aria-label="What share of legal moves at each depth are traps that throw away the puzzle's best-possible outcome -- red is dangerous, green is safe"
      >
        <div
          v-for="row in depthRows"
          :key="row.depth"
          class="layer-row"
          :title="`Depth ${row.depth}: ${row.percentLabel} of moves are traps, across ${row.nodeCount} state(s) on the optimal-preserving tree`"
        >
          <span class="layer-depth">{{ row.depth }}</span>
          <span class="layer-bar-track">
            <span class="layer-bar" :style="{ width: row.widthPercent + '%', background: row.color }"></span>
          </span>
          <span class="layer-count">{{ row.percentLabel }}</span>
        </div>
      </div>
    </div>

    <p class="panel-caption">
      <template v-if="run.status === 'running'">
        Solving the puzzle exhaustively, then classifying every move off the optimal path as safe or a trap.
      </template>
      <template v-else-if="run.status === 'done'">
        Green = you can't really go wrong here. Red = most options quietly throw away the best possible outcome.
      </template>
    </p>
  </div>
</template>

<style scoped>
.difficulty-panel {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.panel-title {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  color: var(--color-ink);
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 2px 0 0;
  font-family: var(--font-ui);
  font-size: 0.68rem;
  color: var(--color-ink-dim);
}

.panel-meta.error {
  color: #b3261e;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse-dot 1.1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

.resim-button {
  flex: 0 0 auto;
  padding: 6px 12px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.68rem;
  color: var(--color-accent);
  background: transparent;
  border: 1.5px solid var(--color-accent);
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.resim-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (hover: hover) {
  .resim-button:not(:disabled):hover {
    background: var(--color-accent);
    color: var(--color-card-bg);
  }
}

.headline {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.headline-number {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.7rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.headline-label {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.68rem;
  color: var(--color-ink-dim);
}

.layer-chart-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.layer-chart-legend {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  gap: 6px;
  padding: 0 4px;
  font-family: var(--font-ui);
  font-size: 0.56rem;
  letter-spacing: 0.02em;
  color: var(--color-ink-dim);
}

.layer-chart-legend span:last-child {
  text-align: right;
}

.layer-chart {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layer-row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 1.5px 4px;
  border-radius: 4px;
}

.layer-depth {
  font-family: var(--font-ui);
  font-size: 0.58rem;
  color: var(--color-ink-dim);
  text-align: right;
}

.layer-bar-track {
  height: 7px;
  border-radius: 3px;
  background: rgba(36, 27, 20, 0.06);
  overflow: hidden;
}

.layer-bar {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.layer-count {
  min-width: 3em;
  text-align: right;
  font-family: var(--font-ui);
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-dim);
}

.panel-caption {
  margin: 0;
  min-height: 1.6em;
  font-family: var(--font-ui);
  font-size: 0.62rem;
  color: var(--color-ink-dim);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .pulse-dot {
    animation: none;
  }
}
</style>
