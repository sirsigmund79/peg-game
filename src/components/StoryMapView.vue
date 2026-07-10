<!--
  ============================================================================
  components/StoryMapView.vue
  ----------------------------------------------------------------------------
  The Forest Trail level-select map -- shown at "#/story" (see
  components/StoryView.vue, the thin dispatcher between this and
  StoryChapterView.vue, which actually plays a node). Draws each node from
  logic/story/forestTrailLevels.js at its {x,y} position, connects them with
  lines per TRAIL_EDGES (the Riverside -> Treehouse shortcut drawn dashed),
  and locks/unlocks nodes per logic/story/story.js's isNodeUnlocked().
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { useRouter } from '../composables/useRouter.js';
import { FOREST_TRAIL_NODES, TRAIL_EDGES } from '../logic/story/forestTrailLevels.js';
import { getChapterPuzzle, isNodeUnlocked, getBestResult } from '../logic/story/story.js';
import { createStartingMasks } from '../logic/rules.js';
import { BOARD_CATALOG } from '../logic/boards.js';
import MiniBoard from './MiniBoard.vue';

const { navigate } = useRouter();

const nodes = computed(() =>
  FOREST_TRAIL_NODES.map((node) => {
    const puzzle = getChapterPuzzle(node);
    const unlocked = isNodeUnlocked(node.id);
    const won = getBestResult(node.id)?.won === true;
    return {
      ...node,
      geometry: BOARD_CATALOG[node.boardId].geometry,
      masks: createStartingMasks(puzzle.cellCount, puzzle.holeColors, puzzle.colorCount),
      unlocked,
      won,
      // A little hint of who's waiting, once a node is reachable but not
      // yet cleared -- withheld while locked so it's not spoiled ahead of
      // time.
      hintEmoji: unlocked && !won ? node.friends[0]?.emoji : null,
    };
  })
);

const allGathered = computed(() => nodes.value.every((node) => node.won));

function goToNode(node) {
  if (!node.unlocked) return;
  navigate(`/story/${node.id}`);
}
</script>

<template>
  <div class="story-map-view">
    <p class="map-tagline">
      {{ allGathered ? "Everyone's gathered at the treehouse... for now." : 'Clear the way, one stop at a time.' }}
    </p>

    <div class="trail">
      <svg class="trail-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          v-for="(edge, index) in TRAIL_EDGES"
          :key="index"
          :x1="FOREST_TRAIL_NODES.find((n) => n.id === edge.from).position.x"
          :y1="FOREST_TRAIL_NODES.find((n) => n.id === edge.from).position.y"
          :x2="FOREST_TRAIL_NODES.find((n) => n.id === edge.to).position.x"
          :y2="FOREST_TRAIL_NODES.find((n) => n.id === edge.to).position.y"
          class="trail-line"
          :class="{ shortcut: edge.shortcut }"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <button
        v-for="node in nodes"
        :key="node.id"
        type="button"
        class="node"
        :class="{ locked: !node.unlocked }"
        :style="{ left: node.position.x + '%', top: node.position.y + '%' }"
        :disabled="!node.unlocked"
        @click="goToNode(node)"
      >
        <span class="node-thumb">
          <MiniBoard :geometry="node.geometry" :masks="node.masks" />
          <span v-if="!node.unlocked" class="lock" aria-hidden="true">🔒</span>
          <span v-else-if="node.won" class="rank-badge" title="All friends found">✓</span>
          <span v-else-if="node.hintEmoji" class="rank-badge" title="Someone's waiting in there">{{ node.hintEmoji }}</span>
        </span>
        <span class="node-label">{{ node.mapLabel }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.story-map-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 20px 16px 40px;
  background: var(--color-page-bg);
}

.map-tagline {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-ink-secondary);
  text-align: center;
}

.trail {
  position: relative;
  width: 100%;
  max-width: 420px;
  aspect-ratio: 3 / 4;
}

.trail-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.trail-line {
  stroke: var(--color-ink-dim);
  stroke-width: 3;
  stroke-linecap: round;
}

.trail-line.shortcut {
  stroke: var(--color-accent);
  stroke-dasharray: 6 6;
}

.node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 76px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.node:disabled {
  cursor: not-allowed;
}

.node-thumb {
  position: relative;
  width: 60px;
  height: 60px;
  padding: 4px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 50%;
  box-shadow: var(--frame-shadow-card);
  transition: transform 0.15s ease;
}

@media (hover: hover) {
  .node:not(:disabled):hover .node-thumb {
    transform: scale(1.06);
  }
}

.node.locked .node-thumb {
  filter: grayscale(1);
  opacity: 0.55;
}

.lock {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
}

.rank-badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 0.85rem;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 50%;
}

.node-label {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.7rem;
  color: var(--color-ink);
  text-align: center;
}
</style>
