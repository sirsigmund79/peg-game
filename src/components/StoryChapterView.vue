<!--
  ============================================================================
  components/StoryChapterView.vue
  ----------------------------------------------------------------------------
  Plays a single Forest Trail node (see logic/story/forestTrailLevels.js):
  intro card -> play the board -> outro card -> back to the map
  (components/StoryMapView.vue). Reached at "#/story/<nodeId>" -- see
  components/StoryView.vue, the thin dispatcher between this and the map.

  Playing itself is identical to the daily game (same Board/StatBar/Controls
  components, same rules) -- only the narration cards and the node's
  per-location palette (applied as inline CSS variables on this component's
  root, so it never touches the global theme) are different.
  ============================================================================
-->
<script setup>
import { ref, computed, watch } from 'vue';
import { useGame } from '../composables/useGame.js';
import { useRouter } from '../composables/useRouter.js';
import { getChapterPuzzle, recordNodeResult } from '../logic/story/story.js';
import Board from './Board.vue';
import StatBar from './StatBar.vue';
import Controls from './Controls.vue';

const props = defineProps({
  node: { type: Object, required: true },
});

const { navigate } = useRouter();

const nodeStyle = computed(() => props.node.themeOverrides ?? {});

const phase = ref('intro'); // 'intro' | 'playing' | 'outro'
const game = ref(null);
const flavorLine = ref(null);
let firstMoveShown = false;
let lastPegShown = false;

function beginChapter() {
  game.value = useGame(getChapterPuzzle(props.node));
  flavorLine.value = null;
  firstMoveShown = false;
  lastPegShown = false;
  phase.value = 'playing';
}

watch(
  () => game.value?.state.moveCount,
  (count) => {
    if (count === 1 && !firstMoveShown) {
      firstMoveShown = true;
      flavorLine.value = props.node.flavor?.onFirstMove ?? flavorLine.value;
    }
  }
);

watch(
  () => game.value?.pegsRemaining,
  (remaining) => {
    if (!remaining || lastPegShown) return;
    const total = remaining.reduce((sum, count) => sum + count, 0);
    if (total === 1) {
      lastPegShown = true;
      flavorLine.value = props.node.flavor?.onLastPeg ?? flavorLine.value;
    }
  }
);

watch(
  () => game.value?.roundOver,
  (roundOver) => {
    if (!roundOver) return;
    recordNodeResult(props.node.id, { overPar: game.value.overPar, won: game.value.hasWon });
    phase.value = 'outro';
  }
);

const wonChapter = computed(() => game.value?.hasWon ?? false);

function backToMap() {
  navigate('/story');
}
</script>

<template>
  <div class="story-chapter-view" :style="nodeStyle">
    <div class="story-content">
      <template v-if="phase === 'intro'">
        <div class="narrative-card">
          <h2 class="chapter-title">{{ node.title }}</h2>
          <p v-for="(line, index) in node.intro" :key="index" class="narrative-line">{{ line }}</p>
          <button type="button" class="story-button" @click="beginChapter">Begin</button>
        </div>
      </template>

      <template v-else-if="phase === 'playing'">
        <p class="puzzle-line">{{ node.title }}</p>
        <div class="game-area">
          <StatBar :pegs-remaining="game.pegsRemaining" :move-count="game.state.moveCount" :par="game.par" />
          <Board :game="game" />
        </div>
        <p v-if="flavorLine" class="flavor-line">{{ flavorLine }}</p>
        <Controls :can-undo="game.state.undoStack.length > 0" @undo="game.undo()" @reset="game.reset()" />
      </template>

      <template v-else>
        <div class="narrative-card">
          <h2 class="chapter-title">{{ node.title }}</h2>
          <p
            v-for="(line, index) in wonChapter ? node.outroWin : node.outroLeftover"
            :key="index"
            class="narrative-line"
          >
            {{ line }}
          </p>
          <button type="button" class="story-button" @click="backToMap">Back to the trail</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.story-chapter-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--color-page-bg);
}

.story-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 24px 20px;
  text-align: center;
}

.puzzle-line {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.03em;
  color: var(--color-ink-dim);
}

.game-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
}

.flavor-line {
  margin: 0;
  font-family: var(--font-ui);
  font-style: italic;
  font-size: 0.8rem;
  color: var(--color-ink-secondary);
}

.narrative-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  padding: 24px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-card);
}

.chapter-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.2rem;
  color: var(--color-ink);
}

.narrative-line {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  line-height: 1.4;
  color: var(--color-ink-secondary);
}

.story-button {
  margin-top: 6px;
  min-height: 52px;
  padding: 8px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-card-bg);
  background: var(--color-peg);
  border-width: var(--control-border-width);
  border-style: solid;
  border-color: var(--color-peg);
  border-radius: 14px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.story-button:hover {
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.story-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
