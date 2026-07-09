<!--
  ============================================================================
  components/Board.vue
  ----------------------------------------------------------------------------
  Draws the board: one button per hole, positioned based on that hole's
  (x, y) coordinate from logic/geometry.js. There is deliberately no etched
  grid/connector artwork -- the eye maps a peg-solitaire shape fine from the
  holes alone, so the board stays uncluttered. Empty holes look like flat
  recessed slots; holes with a peg show a solid flat peg; the selected peg
  and its valid landing holes get extra CSS classes so they can be
  highlighted.

  Jumps are animated rather than instant: when composables/useGame.js
  records a `lastMove`, this component plays a peg physically arcing from
  its origin hole, over the jumped hole, to its destination, while the
  jumped peg dissolves in place -- see animateJump() below. The underlying
  game state (composables/useGame.js's mask) already updated the instant
  the jump happened, so this animation is purely a cosmetic overlay: it
  never blocks input and can't get out of sync with what actually happened.

  This component does NOT know any game rules -- it just shows whatever
  `game` (a useGame() instance, passed in as a prop) tells it to show, and
  reports taps back by calling game.selectHole(). All the "is this jump
  legal" thinking happens in composables/useGame.js and logic/rules.js.

  Colors below are all CSS variables (e.g. var(--color-hole)) set by
  composables/useTheme.js, so re-skinning the game never means editing this
  file.
  ============================================================================
-->
<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';

const props = defineProps({
  // A useGame() instance -- see composables/useGame.js. Passed as a whole
  // object so this component always sees live, up-to-date game state.
  game: {
    type: Object,
    required: true,
  },
});

// Position/size math is shared with MiniBoard.vue (the read-only snapshot
// in the result modal) via logic/boardLayout.js, so the two never drift
// apart on how a board shape gets drawn.
const holePositions = computed(() => computeDisplayPositions(props.game.geometry));
const holeDiameterPercent = computed(() => computeHoleDiameterPercent(props.game.geometry, holePositions.value));

function isSelected(index) {
  return props.game.state.selectedHole === index;
}

function isValidTarget(index) {
  return props.game.validTargetHoles.includes(index);
}

/** Builds a human-readable label for screen readers, per hole. */
function holeAriaLabel(index) {
  const filled = props.game.holeHasPeg(index);
  return filled ? `Peg at hole ${index}` : `Empty hole ${index}`;
}

// --- jump animation: a peg travels over the jumped peg, which dissolves --

const JUMP_DURATION_MS = 320;
const ARC_HEIGHT_PERCENT = 7; // how high (in board %) the peg lifts mid-flight

// The move currently being animated ({from, over, to}), or null the rest
// of the time. While set, the `to` hole's peg is hidden (it hasn't
// "arrived" yet -- the traveling peg below stands in for it) and the
// `over` hole's peg is kept rendered so it can visibly dissolve, even
// though the game's mask already reports it gone.
const animatingMove = ref(null);
const travel = reactive({ leftPercent: 0, topPercent: 0, scale: 1 });

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let rafId = null;

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateJump(move) {
  const fromPos = holePositions.value[move.from];
  const toPos = holePositions.value[move.to];
  if (!fromPos || !toPos) return;

  if (rafId !== null) cancelAnimationFrame(rafId);
  animatingMove.value = move;

  const startTime = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startTime) / JUMP_DURATION_MS);
    const eased = easeInOutQuad(t);
    const lift = Math.sin(eased * Math.PI); // 0 at both ends, peaks mid-flight

    travel.leftPercent = fromPos.x + (toPos.x - fromPos.x) * eased;
    travel.topPercent = fromPos.y + (toPos.y - fromPos.y) * eased - lift * ARC_HEIGHT_PERCENT;
    // A subtle grow-then-shrink, echoing the "lifted toward the player"
    // language used for peg selection -- the peg reads as briefly closer
    // to the viewer at the peak of its arc, not just sliding sideways.
    travel.scale = 1 + lift * 0.22;

    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = null;
      animatingMove.value = null;
    }
  }
  rafId = requestAnimationFrame(step);
}

watch(
  () => props.game.state.lastMove,
  (move) => {
    // Reduced-motion players get the instant, un-animated state change --
    // never start the arc tween for them.
    if (move && !prefersReducedMotion) animateJump(move);
  }
);

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});

/** Whether hole `index` should currently show a peg -- overridden during a jump animation so the traveling peg (not the destination hole) reads as "carrying" it, and the jumped peg stays visible long enough to dissolve. */
function shouldShowPeg(index) {
  const move = animatingMove.value;
  if (move) {
    if (index === move.to) return false;
    if (index === move.over) return true;
  }
  return props.game.holeHasPeg(index);
}

/** Whether hole `index` is the jumped-over peg currently fading out. */
function isDissolving(index) {
  return animatingMove.value?.over === index;
}
</script>

<template>
  <div class="board" :class="{ 'round-over': game.roundOver }" :style="{ '--hole-size': holeDiameterPercent + '%' }">
    <button
      v-for="(position, index) in holePositions"
      :key="index"
      type="button"
      class="hole"
      :class="{
        filled: shouldShowPeg(index),
        selected: isSelected(index),
        target: isValidTarget(index),
      }"
      :style="{ left: position.left, top: position.top }"
      :aria-label="holeAriaLabel(index)"
      :aria-pressed="isSelected(index)"
      @click="game.selectHole(index)"
    >
      <span v-if="shouldShowPeg(index)" class="peg" :class="{ dissolving: isDissolving(index) }" aria-hidden="true"></span>
    </button>

    <!-- The peg physically mid-jump -- positioned independently of any
         hole so it can arc smoothly between two of them. -->
    <div
      v-if="animatingMove"
      class="travel-slot"
      aria-hidden="true"
      :style="{ left: travel.leftPercent + '%', top: travel.topPercent + '%' }"
    >
      <span class="peg" :style="{ transform: `scale(${travel.scale})` }"></span>
    </div>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  /* The hero element: sized off both viewport width and height so it
     reliably fills roughly two-thirds of a mobile screen's vertical
     space, no matter how tall the header/stats/controls end up being. */
  width: min(95vw, 66dvh);
  max-width: 460px;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  background: var(--color-board-plate);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-board);
}

/* A one-shot "something just happened" cue the instant the round ends --
   win or not -- so the eye is drawn back to the board itself rather than
   only the result copy further down the page (which may be off-screen).
   Bound directly to the `round-over` class rather than a timed flag: CSS
   animations already only play once when a class is freshly applied, and
   Undo can legitimately take the round back out of "over", so re-ending it
   later re-triggers this exactly the same way. */
.board.round-over {
  animation: board-settle 0.5s ease-out;
}

.board.round-over::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 3px solid var(--color-accent);
  opacity: 0;
  pointer-events: none;
  animation: board-ripple 0.7s ease-out;
}

@keyframes board-settle {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.035);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes board-ripple {
  0% {
    transform: scale(1);
    opacity: 0.85;
  }
  100% {
    transform: scale(1.15);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .board.round-over,
  .board.round-over::after {
    animation: none;
  }
}

.hole {
  position: absolute;
  width: var(--hole-size, 15%);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid var(--color-hole-border);
  background: var(--color-hole);
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.15s ease;
  /* A tiny flat recess shadow -- just enough for the empty hole to read
     as a physical slot, not a decorative dashed-outline ring. */
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
}

.hole.target {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    0 0 0 2px var(--color-accent);
}

.peg {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  background-color: var(--color-peg);
  /* Flat, confident vector fill separated from the tray by a crisp
     drop-shadow -- no gradients, no glossy sphere highlight. */
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));
  transition:
    transform 0.15s ease,
    filter 0.15s ease,
    opacity 0.15s ease;
}

.hole.selected .peg {
  /* No vertical lift -- instead the peg grows and casts a bigger, softer
     shadow, reading as "lifted toward the player" in depth rather than up
     the screen. */
  transform: scale(1.1);
  filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.3));
  box-shadow: 0 0 0 3px var(--color-accent);
}

.peg.dissolving {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  opacity: 0;
  transform: scale(0.35);
}

.travel-slot {
  position: absolute;
  width: var(--hole-size, 15%);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}

@media (prefers-reduced-motion: reduce) {
  /* .peg.dissolving re-declares its own `transition` (needed for the two
     different speeds above), so it needs its own override here too --
     the single-class `.peg` rule alone isn't specific enough to win. */
  .peg,
  .peg.dissolving {
    transition: none;
  }
}
</style>
