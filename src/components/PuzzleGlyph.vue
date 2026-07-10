<!--
  ============================================================================
  components/PuzzleGlyph.vue
  ----------------------------------------------------------------------------
  A tiny pointillist rendering of a puzzle: one dot per peg, positioned
  using the same layout math as Board.vue's holePositions (empty holes get
  no dot at all). Used by ArchiveView.vue so a puzzle's shape can be
  recognized (or guessed at) at a glance without spoiling it with a text
  label. Also used by ArchiveDayStrip.vue, larger and in the puzzle's real
  peg colors (via the optional `size`/`holeColors` props below) -- ArchiveView
  itself keeps passing neither, so its dots stay the original flat, small
  silhouette.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { getPegColor } from '../logic/pegColors.js';

const props = defineProps({
  geometry: { type: Object, required: true },
  emptyHoles: { type: Array, default: () => [] },
  size: { type: Number, default: 34 },
  // Same shape as a puzzle's `holeColors` (logic/daily.js): color index per
  // hole, or -1/absent for empty. When omitted, dots fall back to a flat
  // `currentColor` silhouette instead of each peg's real color.
  holeColors: { type: Array, default: () => [] },
});

/** Deterministic pseudo-random in [0, 1), seeded by an integer so a given puzzle's dots always render with the same size/opacity -- no reshuffle on re-render. */
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** One dot per peg (i.e. one per hole that isn't in emptyHoles) -- together they read as the puzzle's shape, Seurat-style, without a dot standing in for more than one peg. */
const dots = computed(() => {
  const geometry = props.geometry;
  const cells = geometry.cells;
  const emptySet = new Set(props.emptyHoles);

  // Same de-skew as Board.vue: triangular-lattice boards store (x, y) as
  // (col, row), which draws skewed unless each row is shifted back.
  const displayCells =
    geometry.layoutStyle === 'triangular-lattice'
      ? cells.map((cell) => ({ x: cell.x - cell.y / 2, y: cell.y }))
      : cells;

  const xValues = displayCells.map((cell) => cell.x);
  const yValues = displayCells.map((cell) => cell.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const widthSpan = Math.max(1, maxX - minX);
  const heightSpan = Math.max(1, maxY - minY);

  const padding = 14;
  const usable = 100 - padding * 2;

  const result = [];
  displayCells.forEach((cell, index) => {
    if (emptySet.has(index)) return;

    const size = 2.6 + seededRandom(index * 211 + 3) * 1.4;
    const opacity = 0.55 + seededRandom(index * 271 + 4) * 0.45;

    result.push({
      x: padding + ((cell.x - minX) / widthSpan) * usable,
      y: padding + ((cell.y - minY) / heightSpan) * usable,
      r: size,
      opacity,
      color: props.holeColors[index] >= 0 ? getPegColor(props.holeColors[index]).hex : null,
    });
  });

  return result;
});
</script>

<template>
  <svg class="puzzle-glyph" :style="{ width: size + 'px', maxWidth: '100%' }" viewBox="0 0 100 100" aria-hidden="true">
    <circle
      v-for="(dot, index) in dots"
      :key="index"
      :cx="dot.x"
      :cy="dot.y"
      :r="dot.r"
      :fill-opacity="dot.color ? 1 : dot.opacity"
      :fill="dot.color ?? 'currentColor'"
    />
  </svg>
</template>

<style scoped>
.puzzle-glyph {
  flex: 0 1 auto;
  aspect-ratio: 1 / 1;
  color: var(--color-ink-secondary);
}
</style>
