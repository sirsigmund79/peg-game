<!--
  ============================================================================
  components/StoryFriendsReveal.vue
  ----------------------------------------------------------------------------
  The one-time "curtain up" sequence shown before a Forest Trail level
  starts (see components/StoryChapterView.vue): empty holes appear, then
  each hidden friend pops into their spot, then every starting peg rolls in
  on top (covering everyone) -- only then does StoryChapterView swap this
  out for the real, interactive Board.vue/useGame() pairing.

  Deliberately isolated from Board.vue and useGame.js: this is pure
  presentation with no game state of its own, so it can't affect (or be
  affected by) real play. It reuses the same layout math Board.vue and
  MiniBoard.vue already share (logic/boardLayout.js) so the handoff between
  this and the real board lands in exactly the same positions, and follows
  Board.vue's own prefersReducedMotion pattern for the same reason it does.
  ============================================================================
-->
<script setup>
import { ref, computed, onMounted } from 'vue';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';
import { getPegColor } from '../logic/pegColors.js';

const props = defineProps({
  geometry: { type: Object, required: true },
  holeColors: { type: Array, required: true }, // -1 for a starting-empty hole, else a color index
  friends: { type: Array, required: true }, // [{index, emoji}]
});

const emit = defineEmits(['done']);

const positions = computed(() => computeDisplayPositions(props.geometry));
const holeSizePercent = computed(() => computeHoleDiameterPercent(props.geometry, positions.value));

const friendEmojiByIndex = computed(() => new Map(props.friends.map((friend) => [friend.index, friend.emoji])));

const phase = ref('holes'); // 'holes' -> 'friends' -> 'pegs' -> (emit 'done')

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? Math.min(ms, 120) : ms));
}

onMounted(async () => {
  await wait(500);
  phase.value = 'friends';
  await wait(200 + props.friends.length * 120 + 400);
  phase.value = 'pegs';
  await wait(200 + props.geometry.cellCount * 12 + 500);
  emit('done');
});
</script>

<template>
  <div class="reveal-board" :style="{ '--hole-size': holeSizePercent + '%' }">
    <div v-for="(position, index) in positions" :key="index" class="hole" :style="{ left: position.left, top: position.top }">
      <Transition name="pop">
        <span v-if="phase !== 'holes' && friendEmojiByIndex.has(index)" class="friend-glyph" aria-hidden="true">{{
          friendEmojiByIndex.get(index)
        }}</span>
      </Transition>
      <span
        v-if="phase === 'pegs' && holeColors[index] !== -1"
        class="peg peg-roll-in"
        :style="{ backgroundColor: getPegColor(holeColors[index]).hex, '--i': index }"
        aria-hidden="true"
      ></span>
    </div>
  </div>
</template>

<style scoped>
.reveal-board {
  position: relative;
  width: min(95vw, 66dvh);
  max-width: 460px;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  background: var(--color-board-plate);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-board);
}

.hole {
  position: absolute;
  width: var(--hole-size, 15%);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid var(--color-hole-border);
  background: var(--color-hole);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
}

.friend-glyph {
  font-size: 1.4rem;
  line-height: 1;
  user-select: none;
}

.peg {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));
}

.peg-roll-in {
  animation: peg-roll-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  animation-delay: calc(var(--i, 0) * 12ms);
}

@keyframes peg-roll-in {
  0% {
    opacity: 0;
    transform: scale(0.2) rotate(-140deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

.pop-enter-active {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.2s ease;
}

.pop-enter-from {
  opacity: 0;
  transform: scale(0.3);
}

@media (prefers-reduced-motion: reduce) {
  .peg-roll-in {
    animation: none;
  }

  .pop-enter-active {
    transition: none;
  }
}
</style>
