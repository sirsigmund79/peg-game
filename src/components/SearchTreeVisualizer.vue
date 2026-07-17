<!--
  ============================================================================
  components/SearchTreeVisualizer.vue
  ----------------------------------------------------------------------------
  DEV-ONLY: runs the REAL solver (logic/solver.js, via
  workers/searchTreeExplorerWorker.js so it can't freeze the tab) from the
  puzzle's CURRENT board position and shows what the actual search looks
  like -- not a small illustrative stand-in. Some boards genuinely visit
  hundreds of thousands to millions of distinct positions to prove their
  optimum (see puzzleAnalysisWorker.js's own header for the 20-45+ second
  boards); this panel's whole point is to make that real scale visible and
  screenshot/record-able:

    - a live headline count of real states explored (grows while running)
    - TWO per-depth bar charts, log-scaled (raw counts can span many orders
      of magnitude between layers) and animated to grow bar by bar AS the
      real progress messages arrive, i.e. genuinely layering up as it's
      searched, not a canned replay:
        1. how many distinct board states the solver actually visited at
           each depth
        2. how many legal moves existed in total, summed across those same
           visited states -- deliberately a SEPARATE chart, not a second
           number tacked onto the first, because the two can diverge a lot:
           solver.js's early-exit often commits to and fully expands just
           ONE of a state's several legal moves the instant that one proves
           optimal, so chart 1 can read "1" at a depth whose one visited
           state still had several real options on the board (chart 2)
    - underneath, a small node-link sketch of an honestly-labeled SAMPLE of
      the real search graph (a connected subtree, via solver.js's
      key/parentKey instrumentation -- see its own header), reusing
      logic/searchTreeLayout.js's dendrogram layout

  Runs once automatically when this panel first mounts (i.e. when a puzzle
  is opened in dev mode); a manual "Re-run" button re-searches from
  whatever the CURRENT board position is, e.g. after making a few moves, so
  repeat runs are an explicit choice rather than an expensive recompute
  firing on every single move.

  IMPORTANT: only ever imported where `import.meta.env.DEV` is true (see
  PlayView.vue) -- never ships to real players.
  ============================================================================
-->
<script setup>
import { reactive, computed, onBeforeUnmount, toRaw } from 'vue';
import { layoutSearchTreeDendrogram } from '../logic/searchTreeLayout.js';

const props = defineProps({
  geometry: { type: Object, required: true },
  masks: { type: Array, required: true },
  par: { type: Array, required: true },
});

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const STAGGER_MS = 16;

// Mirrors the Moose theme's board-plate amber and header/accent pine green
// (composables/useTheme.js) -- hardcoded rather than read from CSS
// variables because this gradient needs to be numerically interpolated per
// row/node, the same "carries meaning, not just page chrome" reasoning
// logic/pegColors.js uses for peg colors.
const SHALLOW_COLOR = '#f0b23a';
const DEEP_COLOR = '#1c8c52';
// The convergence chart's own color pair -- deliberately NOT the depth
// gradient above (that means "how deep," this means "how much overlap"):
// purple (from logic/pegColors.js's fixed palette) for heavy funneling,
// the same pine green for "stayed wide open," so a glance at color alone
// tells them apart from the states/moves charts.
const FUNNEL_COLOR = '#7c4fa0';
const OPEN_COLOR = '#1c8c52';

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

function curvePath(x1, y1, x2, y2) {
  const midY = (y1 + y2) / 2;
  return `M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`;
}

const run = reactive({
  status: 'idle', // 'idle' | 'running' | 'done' | 'budget-exceeded' | 'error'
  nodesVisited: 0,
  layerCounts: [],
  layerLegalMoveTotals: [],
  maxDepth: 0,
  startingTotal: 0,
  graphNodes: new Map(),
  graphEdges: [],
  graphRootKey: null,
  target: null,
  bestPossibleTotal: null,
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
  run.nodesVisited = 0;
  run.layerCounts = [];
  run.layerLegalMoveTotals = [];
  run.maxDepth = 0;
  run.startingTotal = 0;
  run.graphNodes = new Map();
  run.graphEdges = [];
  run.graphRootKey = null;
  run.target = null;
  run.bestPossibleTotal = null;
  run.errorMessage = null;
  run.startedAt = Date.now();
  run.finishedAt = null;

  const worker = new Worker(new URL('../workers/searchTreeExplorerWorker.js', import.meta.url), { type: 'module' });
  activeWorker = worker;

  worker.onmessage = (event) => {
    if (activeWorker !== worker) return; // a stale message from a run superseded by a newer "Re-run"
    const message = event.data;

    if (message.type === 'progress') {
      run.nodesVisited = message.nodesVisited;
      run.layerCounts = message.layerCounts;
      run.layerLegalMoveTotals = message.layerLegalMoveTotals;
      run.maxDepth = message.layerCounts.length - 1;
      return;
    }

    if (message.type === 'error') {
      run.status = 'error';
      run.errorMessage = message.message;
      worker.terminate();
      activeWorker = null;
      return;
    }

    run.nodesVisited = message.nodesVisited;
    run.layerCounts = message.layerCounts;
    run.layerLegalMoveTotals = message.layerLegalMoveTotals;
    run.maxDepth = message.maxDepth;
    run.startingTotal = message.startingTotal;
    run.graphNodes = new Map(message.graphNodes);
    run.graphEdges = message.graphEdges;
    run.graphRootKey = message.graphRootKey;
    run.finishedAt = Date.now();
    run.status = message.type === 'done' ? 'done' : 'budget-exceeded';
    if (message.type === 'done') {
      run.target = message.target;
      run.bestPossibleTotal = message.bestPossibleTotal;
    }
    worker.terminate();
    activeWorker = null;
  };

  worker.onerror = (event) => {
    if (activeWorker !== worker) return;
    run.status = 'error';
    run.errorMessage = event.message || 'The search worker crashed.';
    worker.terminate();
    activeWorker = null;
  };

  // Worker.postMessage structured-clones its payload, which chokes on Vue's
  // reactive Proxy wrapping (game.geometry/game.state.masks are both nested
  // inside useGame.js's reactive() state) -- toRaw() unwraps back to the
  // plain objects/arrays underneath before they cross the worker boundary.
  worker.postMessage({ geometry: toRaw(props.geometry), cellCount: props.geometry.cellCount, masks: toRaw(props.masks) });
}

runSearch(); // auto-start once, from whatever position this panel first mounts with -- see the file header

onBeforeUnmount(terminateActiveWorker);

const formattedNodesVisited = computed(() => run.nodesVisited.toLocaleString());

// The "Legal moves available" chart's own grand total -- SUMMED across
// every depth, not just one row -- mirroring the states-visited headline
// above so the two charts each get an at-a-glance total, not just the
// per-depth breakdown. Always >= formattedNodesVisited's own number, for
// the same early-exit reason documented on layerRows below.
const totalLegalMoves = computed(() => run.layerLegalMoveTotals.reduce((sum, count) => sum + (count ?? 0), 0));
const formattedTotalLegalMoves = computed(() => totalLegalMoves.value.toLocaleString());

const optimalDepth = computed(() => (run.status === 'done' ? run.startingTotal - run.bestPossibleTotal : null));

const elapsedLabel = computed(() => {
  if (!run.startedAt || !run.finishedAt) return null;
  const seconds = (run.finishedAt - run.startedAt) / 1000;
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds.toFixed(1)}s`;
});

const layerRows = computed(() => {
  const counts = run.layerCounts;
  const legalMoveTotals = run.layerLegalMoveTotals;
  const maxCount = Math.max(1, ...counts.map((count) => count ?? 0));
  const maxLegalMoves = Math.max(1, ...legalMoveTotals.map((count) => count ?? 0));
  const depthSpan = Math.max(1, run.maxDepth);
  const rows = [];
  for (let depth = 0; depth <= run.maxDepth; depth++) {
    const count = counts[depth] ?? 0;
    // How many legal moves existed, SUMMED across every state actually
    // visited at this depth -- can run well ahead of `count` itself, since
    // solver.js's early-exit often commits to and expands just ONE of a
    // state's several legal moves once that one proves optimal (see
    // workers/searchTreeExplorerWorker.js's header for why these are two
    // genuinely different numbers, not the same thing twice).
    const legalMovesTotal = legalMoveTotals[depth] ?? 0;
    rows.push({
      depth,
      count,
      countLabel: count.toLocaleString(),
      widthPercent: count > 0 ? (100 * Math.log(count + 1)) / Math.log(maxCount + 1) : 0,
      legalMovesTotal,
      legalMovesLabel: legalMovesTotal.toLocaleString(),
      legalMovesWidthPercent: legalMovesTotal > 0 ? (100 * Math.log(legalMovesTotal + 1)) / Math.log(maxLegalMoves + 1) : 0,
      color: lerpColor(SHALLOW_COLOR, DEEP_COLOR, depth / depthSpan),
      isOptimalDepth: optimalDepth.value === depth,
    });
  }
  return rows;
});

// The "funnel" effect: at depth D, how many of the legal moves on offer
// (chart 2's own number) actually led somewhere NEW at depth D+1 (chart
// 1's number one row down), vs how many quietly converged onto a position
// already reached some other way. A low ratio here is what "lots of early
// choices, but they all end up in the same place" looks like on paper --
// two board-independent regions that can be cleared in either order are
// the classic case (see the file header). Approximate, not exact: it's
// bounded by which states/moves the search actually visited in the first
// place, same early-exit caveat as the two charts above.
function convergenceLabel(ratio) {
  if (ratio === null) return '—';
  if (ratio >= 0.75) return 'Wide open';
  if (ratio >= 0.5) return 'Some overlap';
  if (ratio >= 0.25) return 'Converging';
  return 'Funneling hard';
}

const convergenceRows = computed(() => {
  const counts = run.layerCounts;
  const legalMoveTotals = run.layerLegalMoveTotals;
  const rows = [];
  for (let depth = 0; depth < run.maxDepth; depth++) {
    const optionsHere = legalMoveTotals[depth] ?? 0;
    const distinctNext = counts[depth + 1] ?? 0;
    const ratio = optionsHere > 0 ? Math.min(1, distinctNext / optionsHere) : null;
    rows.push({
      fromDepth: depth,
      toDepth: depth + 1,
      ratio,
      percentLabel: ratio === null ? '—' : `${Math.round(ratio * 100)}%`,
      label: convergenceLabel(ratio),
      widthPercent: ratio === null ? 0 : ratio * 100,
      // Read: 100% = every legal move opened up genuinely new territory;
      // 0% = every legal move funneled back onto a position already reached.
      color: ratio === null ? SHALLOW_COLOR : lerpColor(FUNNEL_COLOR, OPEN_COLOR, ratio),
      distinctNext,
      optionsHere,
    });
  }
  return rows;
});

const graphMaxDepth = computed(() => Math.max(0, ...[...run.graphNodes.values()].map((node) => node.depth)));

const graphPositions = computed(() => {
  if (run.graphNodes.size === 0) return new Map();
  const primaryParent = new Map();
  for (const edge of run.graphEdges) primaryParent.set(edge.toKey, edge.fromKey);
  return layoutSearchTreeDendrogram({
    nodes: run.graphNodes,
    rootKey: run.graphRootKey,
    primaryParent,
    maxDepth: graphMaxDepth.value,
  });
});

const graphNodeViewModels = computed(() => {
  const pos = graphPositions.value;
  const depthSpan = Math.max(1, graphMaxDepth.value);
  return [...run.graphNodes.entries()].map(([key, node], index) => {
    const point = pos.get(key);
    return {
      key,
      x: point.x,
      y: point.y,
      r: key === run.graphRootKey ? 2.8 : node.isLeaf ? 2.1 : 1.5,
      fill: lerpColor(SHALLOW_COLOR, DEEP_COLOR, node.depth / depthSpan),
      isLeaf: node.isLeaf,
      delay: prefersReducedMotion ? 0 : index * STAGGER_MS,
    };
  });
});

const graphEdgeViewModels = computed(() => {
  const pos = graphPositions.value;
  return run.graphEdges.map((edge, index) => {
    const from = pos.get(edge.fromKey);
    const to = pos.get(edge.toKey);
    return {
      key: `${edge.fromKey}>${edge.toKey}`,
      d: curvePath(from.x, from.y, to.x, to.y),
      delay: prefersReducedMotion ? 0 : index * STAGGER_MS,
    };
  });
});
</script>

<template>
  <div class="search-tree-panel">
    <div class="panel-header">
      <div>
        <p class="panel-title">Search tree</p>
        <p v-if="run.status === 'running'" class="panel-meta">
          <span class="pulse-dot" aria-hidden="true"></span>Searching the real solver&hellip;
        </p>
        <p v-else-if="run.status === 'done'" class="panel-meta">
          {{ elapsedLabel }} &middot; optimal at depth {{ optimalDepth }} of {{ run.maxDepth }}
        </p>
        <p v-else-if="run.status === 'budget-exceeded'" class="panel-meta">Stopped at the 5,000,000-state safety cap</p>
        <p v-else-if="run.status === 'error'" class="panel-meta error">{{ run.errorMessage }}</p>
      </div>
      <button type="button" class="resim-button" :disabled="run.status === 'running'" @click="runSearch">
        {{ run.status === 'running' ? 'searching…' : 'Re-run' }}
      </button>
    </div>

    <p class="headline">
      <span class="headline-number">{{ formattedNodesVisited }}</span>
      <span class="headline-label">real board states {{ run.status === 'running' ? 'explored so far' : 'searched' }}</span>
    </p>

    <div v-if="layerRows.length" class="layer-chart-wrap">
      <p class="chart-subtitle">States visited</p>
      <div class="layer-chart-legend">
        <span>depth</span>
        <span>board states visited</span>
      </div>
      <div class="layer-chart" role="img" aria-label="How many distinct board states the solver actually visited at each depth">
        <div
          v-for="row in layerRows"
          :key="row.depth"
          class="layer-row"
          :class="{ 'layer-row--optimal': row.isOptimalDepth }"
          :title="`Depth ${row.depth}: ${row.countLabel} state(s) visited`"
        >
          <span class="layer-depth">{{ row.depth }}</span>
          <span class="layer-bar-track">
            <span class="layer-bar" :style="{ width: row.widthPercent + '%', background: row.color }"></span>
          </span>
          <span class="layer-count">{{ row.countLabel }}</span>
        </div>
      </div>
    </div>

    <div v-if="layerRows.length" class="layer-chart-wrap">
      <p class="chart-subtitle">Legal moves available</p>
      <p class="chart-subtotal"><span class="chart-subtotal-number">{{ formattedTotalLegalMoves }}</span> legal moves considered in total</p>
      <div class="layer-chart-legend">
        <span>depth</span>
        <span>legal moves, summed across visited states</span>
      </div>
      <div
        class="layer-chart"
        role="img"
        aria-label="How many legal moves existed in total, summed across every state the solver visited at each depth"
      >
        <div
          v-for="row in layerRows"
          :key="row.depth"
          class="layer-row"
          :title="`Depth ${row.depth}: ${row.legalMovesLabel} legal move(s), summed across the ${row.countLabel} state(s) visited there`"
        >
          <span class="layer-depth">{{ row.depth }}</span>
          <span class="layer-bar-track">
            <span class="layer-bar layer-bar--moves" :style="{ width: row.legalMovesWidthPercent + '%' }"></span>
          </span>
          <span class="layer-count">{{ row.legalMovesLabel }}</span>
        </div>
      </div>
      <p class="chart-note">
        Often bigger than the chart above -- a state can offer several legal moves while the solver only ever commits to
        and expands ONE of them, the instant it proves that one is optimal.
      </p>
    </div>

    <div v-if="convergenceRows.length" class="layer-chart-wrap">
      <p class="chart-subtitle">Convergence</p>
      <div class="layer-chart-legend">
        <span>move</span>
        <span>legal moves that led somewhere genuinely new</span>
      </div>
      <div
        class="layer-chart"
        role="img"
        aria-label="For each move, what share of the legal options led to a board position not already reached some other way -- low values mean many different choices funneled onto the same few positions"
      >
        <div
          v-for="row in convergenceRows"
          :key="row.fromDepth"
          class="layer-row"
          :title="`Depth ${row.fromDepth}→${row.toDepth}: ${row.distinctNext} new position(s) reached out of ${row.optionsHere} legal move(s) tried -- ${row.label.toLowerCase()}`"
        >
          <span class="layer-depth">{{ row.fromDepth }}&rarr;{{ row.toDepth }}</span>
          <span class="layer-bar-track">
            <span class="layer-bar" :style="{ width: row.widthPercent + '%', background: row.color }"></span>
          </span>
          <span class="layer-count">{{ row.percentLabel }} &middot; {{ row.label }}</span>
        </div>
      </div>
      <p class="chart-note">
        Low percentages are the "funnel" -- lots of nominally different choices that collapse onto the same handful of
        positions one move later (classic when two separate parts of the board don't interact). Approximate, for the
        same reason as the chart above.
      </p>
    </div>

    <svg
      v-if="graphNodeViewModels.length"
      class="tree-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        v-for="edge in graphEdgeViewModels"
        :key="edge.key"
        :d="edge.d"
        class="tree-edge"
        :style="{ animationDelay: edge.delay + 'ms' }"
      />
      <circle
        v-for="node in graphNodeViewModels"
        :key="node.key"
        :cx="node.x"
        :cy="node.y"
        :r="node.r"
        :fill="node.fill"
        class="tree-node"
        :class="{ 'tree-node--leaf': node.isLeaf }"
        :style="{ animationDelay: node.delay + 'ms' }"
      />
    </svg>

    <p class="panel-caption">
      <template v-if="run.status === 'running'">Bars above fill in live as the real solver actually visits each depth.</template>
      <template v-else-if="graphNodeViewModels.length">
        The sketch above is a connected {{ graphNodeViewModels.length }}-state SAMPLE of the real search graph, out of
        {{ formattedNodesVisited }} states actually visited -- too many to draw in full.
      </template>
    </p>
  </div>
</template>

<style scoped>
.search-tree-panel {
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
  color: var(--color-header-bg);
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

.chart-subtitle {
  margin: 4px 0 0;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.7rem;
  color: var(--color-ink);
}

.chart-subtotal {
  margin: 0 0 2px;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.66rem;
  color: var(--color-ink-dim);
}

.chart-subtotal-number {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--color-header-bg);
  font-variant-numeric: tabular-nums;
}

.chart-note {
  margin: 2px 4px 0;
  font-family: var(--font-ui);
  font-size: 0.6rem;
  line-height: 1.4;
  color: var(--color-ink-dim);
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

.layer-row--optimal {
  background: rgba(28, 140, 82, 0.14);
  box-shadow: 0 0 0 1px var(--color-accent);
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

/* Flat, non-gradient fill -- deliberately distinct from the states-visited
   chart's per-depth amber-to-green gradient, so the two charts read as two
   different KINDS of measurement at a glance, not the same chart twice.
   Matches the headline number's blue (see .headline-number) so it reads as
   "a plain count," the same association StatBar.vue's own stat numbers use. */
.layer-bar--moves {
  background: var(--color-header-bg);
}

.layer-count {
  min-width: 6em;
  text-align: right;
  font-family: var(--font-ui);
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-dim);
}

.tree-svg {
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: visible;
}

.tree-edge {
  fill: none;
  stroke: var(--color-ink-dim);
  stroke-width: 0.5;
  stroke-linecap: round;
  opacity: 0.4;
  animation: tree-edge-in 0.4s ease-out both;
}

.tree-node {
  stroke: var(--color-card-bg);
  stroke-width: 0.4;
  transform-box: fill-box;
  transform-origin: center;
  animation: tree-node-in 0.35s ease-out both;
}

.tree-node--leaf {
  stroke: var(--color-ink-secondary);
  stroke-width: 0.5;
}

.panel-caption {
  margin: 0;
  min-height: 1.6em;
  font-family: var(--font-ui);
  font-size: 0.62rem;
  color: var(--color-ink-dim);
  text-align: center;
}

@keyframes tree-node-in {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes tree-edge-in {
  0% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tree-edge,
  .tree-node {
    animation: none;
  }
  .pulse-dot {
    animation: none;
  }
}
</style>
