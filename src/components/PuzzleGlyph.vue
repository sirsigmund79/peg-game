<!--
  ============================================================================
  components/PuzzleGlyph.vue
  ----------------------------------------------------------------------------
  A tiny pointillist rendering of a puzzle: one dot per peg, positioned
  using the same layout math as Board.vue's holePositions (empty holes get
  no dot at all). Used by ArchiveView.vue so a puzzle's shape can be
  recognized (or guessed at) at a glance without spoiling it with a text
  label -- there, every dot gets a randomized size/opacity (seeded per hole,
  so it's stable across re-renders) for a loose, hand-drawn look.

  ArchiveDayStrip.vue instead passes real per-hole colors via `holeColors`,
  which switches this into a completely different, bolder rendering: every
  dot the SAME radius (sized off the board's own tightest neighbor gap, via
  boardLayout.js's computeHoleDiameterPercent -- the exact math Board.vue
  uses so a packed board's dots shrink just enough to avoid merging into a
  blob) at full opacity, with a thin dark outline -- legible at a glance
  rather than sketchy, since it's meant to look enticing, not just
  recognizable.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';
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

// Real colors (ArchiveDayStrip.vue, ArchiveView.vue) switch to the bold
// rendering: every dot the same radius, full opacity, outlined -- see the
// file header.
const isBold = computed(() => props.holeColors.length > 0);

/** One dot per peg (i.e. one per hole that isn't in emptyHoles) -- together they read as the puzzle's shape, Seurat-style (or, in bold mode, as a set of uniform pegs), without a dot standing in for more than one peg. */
const dots = computed(() => {
  const geometry = props.geometry;
  const emptySet = new Set(props.emptyHoles);
  const bold = isBold.value;
  const positions = computeDisplayPositions(geometry);
  // Half of Board.vue's own hole diameter -- already sized off
  // this board's tightest neighbor gap and capped for sparse boards, so a
  // packed board (e.g. a 35-peg star) gets smaller dots than a sparse one
  // instead of every board using one fixed radius that overlaps on the
  // dense ones.
  const boldRadius = bold ? computeHoleDiameterPercent(geometry, positions) / 2 : 0;

  const result = [];
  positions.forEach((position, index) => {
    if (emptySet.has(index)) return;

    const r = bold ? boldRadius : 2.6 + seededRandom(index * 211 + 3) * 1.4;
    const opacity = bold ? 1 : 0.55 + seededRandom(index * 271 + 4) * 0.45;

    result.push({
      x: position.x,
      y: position.y,
      r,
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
      :stroke="dot.color ? 'rgba(0, 0, 0, 0.3)' : 'none'"
      :stroke-width="dot.color ? 1.4 : 0"
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
