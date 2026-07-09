<!--
  ============================================================================
  components/TemporaryWatchSolveButton.vue
  ----------------------------------------------------------------------------
  TEMPORARY testing tool -- requested for trying out the solver against real
  daily puzzles during development. Plays out the rest of the CURRENT
  puzzle automatically, using the same solver-planning logic as the level
  editor's Watch Solve button (see fx/watchSolve.js).

  This is intentionally its own tiny, easy-to-delete file rather than
  something wired into useGame.js -- when it's time to remove it, deleting
  this one file and its single usage in App.vue is the whole job. It's only
  ever shown in a dev build (see the isDevBuild check in App.vue).

  TODO: remove this component (and its usage in App.vue) before real
  players ever see the game.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { watchSolve } from '../fx/watchSolve.js';

const props = defineProps({
  game: { type: Object, required: true },
});

const isSolving = ref(false);

async function handleClick() {
  isSolving.value = true;
  await watchSolve(props.game);
  isSolving.value = false;
}
</script>

<template>
  <button type="button" class="watch-solve-button" :disabled="isSolving || game.roundOver" @click="handleClick">
    {{ isSolving ? 'Solving...' : '⚠ Watch Solve (temporary)' }}
  </button>
</template>

<style scoped>
.watch-solve-button {
  display: block;
  margin: 16px auto 0;
  min-height: 40px;
  padding: 8px 18px;
  font-family: monospace;
  font-size: 0.85rem;
  color: #fff;
  background: #b23b3b;
  border: none;
  border-radius: 999px;
  cursor: pointer;
}

.watch-solve-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
