<!--
  ============================================================================
  components/DevToolsView.vue
  ----------------------------------------------------------------------------
  Everything a developer needs while working on the game, kept off the
  actual player-facing pages entirely: the puzzle-archive jumper
  (DevPanel.vue), the synthesized-sound tuner (SoundDevPanel.vue), and the
  level editor (EditorView.vue).

  This page has no "current puzzle" of its own -- it's not playing
  anything -- so it tracks a small local `devPuzzleNumber` purely so
  DevPanel's "Next <shape>" buttons have somewhere to search forward from.
  Picking a puzzle here navigates to PlayView.vue (at "#/play/<number>") to
  actually show it; the editor's "Play" hands its custom design to
  PlayView.vue the same way EditorView already did in App.vue, just via
  composables/usePendingPuzzle.js since editor and play now live on
  different pages.

  IMPORTANT: App.vue only routes here when `import.meta.env.DEV` is true
  (Vite sets that to false for `npm run build`), so this page -- and the
  dev-only components it renders -- never ships to real players.
  ============================================================================
-->
<script setup>
import { ref, computed } from 'vue';
import { getPuzzleForNumber, getTodayPuzzleNumber } from '../logic/daily.js';
import { useRouter } from '../composables/useRouter.js';
import { pendingCustomPuzzle } from '../composables/usePendingPuzzle.js';
import DevPanel from './DevPanel.vue';
import SoundDevPanel from './SoundDevPanel.vue';
import EditorView from './EditorView.vue';

const { navigate } = useRouter();

const devPuzzleNumber = ref(getTodayPuzzleNumber());
const devPuzzle = computed(() => getPuzzleForNumber(devPuzzleNumber.value));

function handleLoadPuzzleNumber(puzzleNumber) {
  devPuzzleNumber.value = puzzleNumber;
  navigate(`/play/${puzzleNumber}`);
}

function handlePlayCustomPuzzle(customPuzzle) {
  pendingCustomPuzzle.value = customPuzzle;
  navigate('/');
}
</script>

<template>
  <div class="dev-tools-view">
    <DevPanel :current-puzzle="devPuzzle" @load-puzzle-number="handleLoadPuzzleNumber" />
    <SoundDevPanel />
    <EditorView @play-puzzle="handlePlayCustomPuzzle" />
  </div>
</template>

<style scoped>
.dev-tools-view {
  flex: 1;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 12px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
