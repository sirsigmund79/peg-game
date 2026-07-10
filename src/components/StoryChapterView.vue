<!--
  ============================================================================
  components/StoryChapterView.vue
  ----------------------------------------------------------------------------
  Plays a single Forest Trail node (see logic/story/forestTrailLevels.js):
  intro card -> friends-reveal sequence -> play the board -> outro card ->
  back to the map (components/StoryMapView.vue). Reached at
  "#/story/<nodeId>" -- see components/StoryView.vue, the thin dispatcher
  between this and the map.

  Winning a node means revealing every one of its hidden friends by the
  time no moves remain -- there's no par/rank here (see useGame.js's
  hasWon), so instead of StatBar this shows a small row of the node's
  friends themselves, each lighting up the instant its covering peg clears.
  ============================================================================
-->
<script setup>
import { ref, computed, watch } from 'vue';
import { useGame } from '../composables/useGame.js';
import { useRouter } from '../composables/useRouter.js';
import { getChapterPuzzle, recordNodeResult } from '../logic/story/story.js';
import Board from './Board.vue';
import Controls from './Controls.vue';
import StoryFriendsReveal from './StoryFriendsReveal.vue';

const props = defineProps({
  node: { type: Object, required: true },
});

const { navigate } = useRouter();

const nodeStyle = computed(() => props.node.themeOverrides ?? {});

const phase = ref('intro'); // 'intro' | 'revealing' | 'playing' | 'outro'
const puzzle = ref(null);
const game = ref(null);
const flavorLine = ref(null);
let firstMoveShown = false;
let lastPegShown = false;

function beginChapter() {
  puzzle.value = getChapterPuzzle(props.node);
  game.value = useGame(puzzle.value);
  flavorLine.value = null;
  firstMoveShown = false;
  lastPegShown = false;
  phase.value = 'revealing';
}

function onRevealDone() {
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
    recordNodeResult(props.node.id, { won: game.value.hasWon });
    phase.value = 'outro';
  }
);

const wonChapter = computed(() => game.value?.hasWon ?? false);

/** Whether friend `index` has had its covering peg cleared yet. */
function isFriendFound(index) {
  return !game.value.holeHasPeg(index);
}

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

      <template v-else-if="phase === 'revealing'">
        <p class="puzzle-line">{{ node.title }}</p>
        <StoryFriendsReveal
          :geometry="puzzle.geometry"
          :hole-colors="puzzle.holeColors"
          :friends="node.friends"
          @done="onRevealDone"
        />
      </template>

      <template v-else-if="phase === 'playing'">
        <p class="puzzle-line">{{ node.title }}</p>
        <div class="game-area">
          <div class="friends-row">
            <span
              v-for="friend in node.friends"
              :key="friend.index"
              class="friend-slot"
              :class="{ found: isFriendFound(friend.index) }"
              >{{ friend.emoji }}</span
            >
          </div>
          <Board :game="game" :friend-holes="node.friends" />
          <p class="move-line">{{ game.state.moveCount }} moves</p>
        </div>
        <p v-if="flavorLine" class="flavor-line">{{ flavorLine }}</p>
        <Controls
          :can-undo="game.state.undoStack.length > 0"
          :round-over="game.roundOver"
          @undo="game.undo()"
          @reset="game.reset()"
        />
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
  gap: 14px;
  width: 100%;
}

.friends-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.friend-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 1.3rem;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 50%;
  filter: grayscale(1);
  opacity: 0.45;
  transition:
    filter 0.25s ease,
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.friend-slot.found {
  filter: grayscale(0);
  opacity: 1;
  transform: scale(1.12);
}

.move-line {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-dim);
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

@media (hover: hover) {
  .story-button:hover {
    background: var(--color-ink);
    border-color: var(--color-ink);
  }
}

.story-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
