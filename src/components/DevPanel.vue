<!--
  ============================================================================
  components/DevPanel.vue
  ----------------------------------------------------------------------------
  A developer-only tool for jumping around the puzzle archive while testing
  -- pick any puzzle number, jump to today, or jump to the next day that
  uses a particular board shape (handy for testing the heart/cross boards
  without waiting for their turn in the rotation).

  IMPORTANT: this panel only ever renders in a local dev build. App.vue only
  mounts it when `import.meta.env.DEV` is true, which Vite sets to true for
  `npm run dev` and false for `npm run build` -- so this never ships to
  real players. There is no separate "flag" to remember to turn off.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { getTodayPuzzleNumber, findNextPuzzleWithBoardId, describePoolCoverage } from '../logic/daily.js';
import { BOARD_CATALOG } from '../logic/boards.js';

const props = defineProps({
  currentPuzzle: { type: Object, required: true },
});

const boardIds = Object.keys(BOARD_CATALOG);
const poolCoverage = describePoolCoverage();

const emit = defineEmits(['load-puzzle-number']);

const puzzleNumberInput = ref(String(props.currentPuzzle.puzzleNumber));

function loadTyped() {
  const parsed = Number.parseInt(puzzleNumberInput.value, 10);
  if (Number.isFinite(parsed)) {
    emit('load-puzzle-number', parsed);
  }
}

function loadToday() {
  const todayNumber = getTodayPuzzleNumber();
  puzzleNumberInput.value = String(todayNumber);
  emit('load-puzzle-number', todayNumber);
}

function loadNextOfType(boardId) {
  const next = findNextPuzzleWithBoardId(props.currentPuzzle.puzzleNumber + 1, boardId);
  if (next) {
    puzzleNumberInput.value = String(next.puzzleNumber);
    emit('load-puzzle-number', next.puzzleNumber);
  }
}
</script>

<template>
  <div class="dev-panel">
    <p class="dev-label">DEV MODE -- puzzle archive access (not shown in production build)</p>
    <p class="dev-current">
      Now viewing
      <template v-if="currentPuzzle.puzzleNumber !== null">#{{ currentPuzzle.puzzleNumber }} ({{ currentPuzzle.date }})</template>
      <template v-else>a custom design</template>
      &middot; {{ currentPuzzle.boardName }} &middot; par {{ currentPuzzle.par }}
    </p>
    <p class="dev-current">Pool: {{ poolCoverage.days }} unique puzzles (~{{ poolCoverage.years }} years before any repeat)</p>

    <div class="dev-row">
      <input v-model="puzzleNumberInput" type="number" class="dev-input" aria-label="Puzzle number" />
      <button type="button" class="dev-button" @click="loadTyped">Load #</button>
      <button type="button" class="dev-button" @click="loadToday">Today</button>
    </div>

    <div class="dev-row wrap">
      <button v-for="boardId in boardIds" :key="boardId" type="button" class="dev-button" @click="loadNextOfType(boardId)">
        Next {{ BOARD_CATALOG[boardId].name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dev-panel {
  max-width: 420px;
  margin: 24px auto 0;
  padding: 12px 14px;
  background: #222;
  color: #eee;
  border-radius: 10px;
  font-family: monospace;
  font-size: 0.8rem;
}

.dev-label {
  margin: 0 0 6px;
  color: #ffb27a;
  font-weight: bold;
}

.dev-current {
  margin: 0 0 10px;
}

.dev-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.dev-row.wrap {
  flex-wrap: wrap;
}

.dev-input {
  width: 80px;
  padding: 6px;
  font-family: monospace;
}

.dev-button {
  padding: 6px 10px;
  cursor: pointer;
  font-family: monospace;
}
</style>
