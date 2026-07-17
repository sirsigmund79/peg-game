<!--
  ============================================================================
  components/BreadthDepthThumbnails.vue
  ----------------------------------------------------------------------------
  DEV-ONLY: a horizontal filmstrip, one tiny glyph per move made so far in
  the current round (starting position included), each a two-bar gauge --
  the green bar is BREADTH (how many legal moves were available right after
  that move), the amber bar is DEPTH remaining (how many pegs were still on
  the board, as a share of the puzzle's starting total). Meant to be
  screenshotted as a quick "how did this puzzle's difficulty shape up as I
  played it" strip, not as an interactive tool.

  Reads the move history straight off useGame.js's own undo stack (`masks`
  BEFORE each jump, plus the live current `masks`) rather than tracking a
  separate history -- that stack already IS the full move-by-move record,
  and naturally shortens on Undo and clears on Reset for free.

  IMPORTANT: only ever imported where `import.meta.env.DEV` is true (see
  PlayView.vue) -- never ships to real players.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { sampleBreadthDepth } from '../logic/searchSimulation.js';

const props = defineProps({
  // A useGame() instance -- see composables/useGame.js. Passed as a whole
  // object (same convention as Board.vue) so this always reflects live
  // state without a pile of individual props to keep in sync.
  game: { type: Object, required: true },
});

const samples = computed(() => {
  const masksHistory = [...props.game.state.undoStack, props.game.state.masks];
  return masksHistory.map((masks, moveIndex) => ({ moveIndex, ...sampleBreadthDepth(props.game.geometry, masks) }));
});

const maxBranching = computed(() => Math.max(1, ...samples.value.map((sample) => sample.branching)));
const startingTotal = computed(() => samples.value[0]?.pegsRemaining ?? 1);

const thumbnails = computed(() =>
  samples.value.map((sample, index) => ({
    moveIndex: sample.moveIndex,
    isCurrent: index === samples.value.length - 1,
    branching: sample.branching,
    pegsRemaining: sample.pegsRemaining,
    breadthPercent: Math.max(8, (sample.branching / maxBranching.value) * 100),
    depthPercent: Math.max(8, (sample.pegsRemaining / startingTotal.value) * 100),
  }))
);
</script>

<template>
  <div class="thumb-panel">
    <div class="panel-header">
      <p class="panel-title">Breadth vs. depth</p>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot breadth"></span>Breadth</span>
        <span class="legend-item"><span class="legend-dot depth"></span>Depth left</span>
      </div>
    </div>

    <div class="thumb-strip">
      <div
        v-for="thumb in thumbnails"
        :key="thumb.moveIndex"
        class="thumb"
        :class="{ 'thumb--current': thumb.isCurrent }"
        :title="`Move ${thumb.moveIndex}: ${thumb.branching} legal move(s) available, ${thumb.pegsRemaining} pegs left`"
      >
        <span class="bar breadth" :style="{ height: thumb.breadthPercent + '%' }"></span>
        <span class="bar depth" :style="{ height: thumb.depthPercent + '%' }"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thumb-panel {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
}

.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-title {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  color: var(--color-ink);
}

.legend {
  display: flex;
  gap: 10px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-ui);
  font-size: 0.62rem;
  color: var(--color-ink-dim);
}

.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.legend-dot.breadth {
  background: var(--color-accent);
}

.legend-dot.depth {
  background: var(--color-board-plate);
}

.thumb-strip {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 44px;
  padding: 2px;
  overflow-x: auto;
}

.thumb {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  width: 12px;
  height: 100%;
  padding: 2px 2px 0;
  border-radius: 4px;
}

.thumb--current {
  background: rgba(28, 140, 82, 0.14);
  box-shadow: 0 0 0 1.5px var(--color-accent);
}

.bar {
  flex: 1 1 0;
  min-height: 2px;
  border-radius: 1.5px;
  transition: height 0.2s ease;
}

.bar.breadth {
  background: var(--color-accent);
}

.bar.depth {
  background: var(--color-board-plate);
}
</style>
