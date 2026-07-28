<!--
  ============================================================================
  components/HowToPlayModal.vue
  ----------------------------------------------------------------------------
  The "how do I play this" walkthrough -- a paginated, multi-step carousel
  (players kept missing the game's few non-obvious rules from the old
  single-card version, so each idea now gets its own dead-simple slide):

    1. The goal        -- clear as many dots as possible
    2. The hop         -- how a dot is actually removed
    3. Colors          -- a dot can only hop its own color
    4. Round ends      -- no hops left = round over, even with dots remaining
    5. Score / Best    -- fewer dots = higher rank; beat your Best

  Reached ONLY via the header's "?" button (see composables/useHowToPlay.js,
  driven from App.vue). It is no longer auto-shown on first visit.

  Every demo is a genuinely tiny, DECORATIVE version of the real triangle
  board (not an abstract single row of dots -- players found the old row
  jarring next to the real triangular board they saw on exit): same
  triangular-lattice hole layout (logic/geometry.js), same hole/peg shapes,
  same peg colors, same selected/target ring treatment as Board.vue, and --
  critically -- the exact same jump-arc tween (fx/jumpAnimation.js, shared
  with Board.vue itself) and dissolve CSS, so a tutorial jump looks and times
  out identically to a real one. Hole positions/sizes come straight from the
  same logic/boardLayout.js math the real board uses, so the mini board is a
  faithful scaled-down copy rather than a hand-placed approximation.

  Only the active slide's board animates; changing slides tears down the old
  slide's animation runner and (re)builds the new one from scratch -- see
  applyStep() below. Reduced-motion players get a single explanatory still
  frame per slide instead of any motion.
  ============================================================================
-->
<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { getPegColor } from '../logic/pegColors.js';
import { makeTriangleGeometry } from '../logic/geometry.js';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';
import { animateArc } from '../fx/jumpAnimation.js';
import { EVENTS, track } from '../services/analytics.js';

const emit = defineEmits(['close']);
const cardRef = ref(null);

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const BLUE = 0;
const PURPLE = 1;
const GREEN = 2;

// --- The shared mini board layout. Every slide draws the same 4-row (10-hole)
// triangle, positioned/sized by the exact same logic/boardLayout.js math the
// real Board.vue uses -- so it reads as a faithful, scaled-down real board
// (holes as a percent of the board's own square width), not a hand-placed
// stand-in. Row-major hole indexes:
//        0
//       1 2
//      3 4 5
//     6 7 8 9
const geometry = makeTriangleGeometry(4);
const holes = computeDisplayPositions(geometry); // [{x, y, left, top}] -- x/y in 0-100 board-percent
const holeSizePercent = computeHoleDiameterPercent(geometry, holes);

// --- a tiny animation driver (same shape as the real board's): `sleep()` for
// scripted holds, `jump()` for one real arc-tween-plus-dissolve move (reusing
// fx/jumpAnimation.js), and `run()` to loop a script forever until `stop()`.
// A fresh runner is built per slide so leaving a slide cleanly cancels its
// timers and in-flight arc -- see applyStep() below.

function createDemoRunner() {
  let cancelled = false;
  const pendingTimeouts = new Set();
  let cancelArc = null;

  function sleep(ms) {
    return new Promise((resolve) => {
      if (cancelled) {
        resolve();
        return;
      }
      const id = setTimeout(() => {
        pendingTimeouts.delete(id);
        resolve();
      }, ms);
      pendingTimeouts.add(id);
    });
  }

  /**
   * Runs one real jump -- arc tween + dissolve -- against the shared reactive
   * `board`. Mirrors useGame.js/Board.vue exactly: the peg DATA moves
   * instantly (from and over clear, to fills) the same instant a real jump's
   * board state updates -- the arc/dissolve is a cosmetic overlay on top,
   * using `dissolvingIndex`/`arrivingIndex` to keep rendering the jumped-over
   * peg (fading out) and hide the landed one until the travel-slot peg
   * visually arrives -- see shouldShowPeg()/pegColorForHole().
   */
  function jump({ move, colorIndex }) {
    return new Promise((resolve) => {
      if (cancelled) {
        resolve();
        return;
      }
      const fromPos = holes[move.from];
      const toPos = holes[move.to];

      board.dissolvingColorIndex = board.pegs[move.over];
      board.dissolvingIndex = move.over;
      board.arrivingIndex = move.to;
      board.pegs[move.from] = null;
      board.pegs[move.over] = null;
      board.pegs[move.to] = colorIndex;

      board.travel = { leftPercent: fromPos.x, topPercent: fromPos.y, scale: 1, colorIndex };
      cancelArc = animateArc({
        fromPos,
        toPos,
        onFrame: ({ leftPercent, topPercent, scale }) => {
          if (board.travel) Object.assign(board.travel, { leftPercent, topPercent, scale });
        },
        onDone: () => {
          cancelArc = null;
          board.travel = null;
          board.dissolvingIndex = -1;
          board.dissolvingColorIndex = null;
          board.arrivingIndex = -1;
          resolve();
        },
      });
    });
  }

  async function run(script) {
    while (!cancelled) {
      // eslint-disable-next-line no-await-in-loop -- a deliberate sequential script, not a batch of independent work
      await script({ sleep, jump });
    }
  }

  function stop() {
    cancelled = true;
    pendingTimeouts.forEach(clearTimeout);
    pendingTimeouts.clear();
    cancelArc?.();
  }

  return { run, stop };
}

// The one reactive board every slide shares -- reset per slide by applyStep().
const board = reactive({
  pegs: new Array(holes.length).fill(null), // colorIndex, or null for an empty hole -- one per hole
  selectedIndex: -1,
  targetIndices: [],
  rejectedIndex: -1, // an empty hole the player just tried (and failed) to hop into -- flashes a red ring (colors slide)
  shakeIndex: -1, // the peg that just attempted an illegal hop -- wiggles (colors slide), mirrors Board.vue's "nope" cue
  dissolvingIndex: -1,
  dissolvingColorIndex: null,
  arrivingIndex: -1,
  travel: null,
});

/** Wipes every transient bit of board state, then lays out a fresh set of pegs. Used at the top of each slide's script loop and by applyStep(). */
function resetBoard(pegs) {
  board.pegs = pegsFromMap(pegs);
  board.selectedIndex = -1;
  board.targetIndices = [];
  board.rejectedIndex = -1;
  board.shakeIndex = -1;
  board.dissolvingIndex = -1;
  board.dissolvingColorIndex = null;
  board.arrivingIndex = -1;
  board.travel = null;
}

/** Turns a sparse `{ index: colorIndex }` map into a full holes-length pegs array (missing indexes = empty). Keeps each slide's setup readable. */
function pegsFromMap(map) {
  const pegs = new Array(holes.length).fill(null);
  for (const [index, colorIndex] of Object.entries(map)) pegs[index] = colorIndex;
  return pegs;
}

/** Whether hole `index` should currently render a peg -- see jump() above for why this isn't just `board.pegs[index] !== null`. */
function shouldShowPeg(index) {
  if (board.arrivingIndex === index) return false;
  if (board.dissolvingIndex === index) return true;
  return board.pegs[index] !== null;
}

/** The color to render hole `index`'s peg with -- falls back to the captured dissolving color once the real data's already been cleared. */
function pegColorForHole(index) {
  const colorIndex = board.dissolvingIndex === index ? board.dissolvingColorIndex : board.pegs[index];
  return colorIndex === null || colorIndex === undefined ? null : getPegColor(colorIndex).hex;
}

function pegHex(colorIndex) {
  return colorIndex === null || colorIndex === undefined ? null : getPegColor(colorIndex).hex;
}

// ============================================================================
// The slides. Each has copy, a starting board, and (for the animated ones) a
// looping script plus the single still frame reduced-motion freezes on.
// ============================================================================

// --- Slide 1, "the goal": a full board clearing itself down to almost
// nothing, on a loop. Deliberately single-color so every hop is obviously
// legal and nothing distracts from the one message -- "get rid of the dots."
// (The color rule gets its own slide next.) The move list is a real,
// hand-verified reducing sequence on this 10-hole triangle: 9 dots -> 2.
const GOAL_START = { 0: BLUE, 1: BLUE, 2: BLUE, 3: BLUE, 4: BLUE, 5: BLUE, 6: BLUE, 7: BLUE, 9: BLUE }; // 8 starts empty
const GOAL_MOVES = [
  { from: 6, over: 7, to: 8 },
  { from: 9, over: 8, to: 7 },
  { from: 1, over: 4, to: 8 },
  { from: 2, over: 5, to: 9 },
  { from: 8, over: 7, to: 6 },
  { from: 6, over: 3, to: 1 },
  { from: 0, over: 1, to: 3 },
];

async function goalScript({ sleep, jump }) {
  resetBoard(GOAL_START);
  await sleep(750);
  for (const move of GOAL_MOVES) {
    // eslint-disable-next-line no-await-in-loop -- a deliberate sequential clear, one hop at a time
    await jump({ move, colorIndex: BLUE });
    // eslint-disable-next-line no-await-in-loop
    await sleep(360);
  }
  await sleep(1100);
}

// --- Slide 2, "the hop": one clear, slow hop with the selection + target
// rings shown, on an otherwise-full, real-looking multicolor board. The two
// dots that actually move (6 and 7) share a color; the rest are just set
// dressing so it reads like a real mid-game board.
const HOP_START = { 0: PURPLE, 1: BLUE, 2: GREEN, 3: PURPLE, 4: GREEN, 5: BLUE, 6: BLUE, 7: BLUE, 9: PURPLE }; // 8 empty

async function hopScript({ sleep, jump }) {
  resetBoard(HOP_START);
  await sleep(650);
  board.selectedIndex = 6;
  board.targetIndices = [8];
  await sleep(900);
  board.selectedIndex = -1;
  board.targetIndices = [];
  await jump({ move: { from: 6, over: 7, to: 8 }, colorIndex: BLUE });
  await sleep(1100);
}

// --- Slide 3, "colors": the same blue dot (6), same empty landing (8), told
// twice -- first with a BLUE dot in the middle (legal, it hops) and then with
// a PURPLE dot in the middle (illegal, it just shakes). Changing only the
// jumped-over dot's color between the two phases is what makes the rule land:
// the color of the dot in the MIDDLE is the whole game.
const COLORS_CONTEXT = { 0: GREEN, 1: PURPLE, 2: GREEN, 3: BLUE, 4: PURPLE, 5: GREEN, 9: BLUE }; // ambient dots, unchanged across phases
const COLORS_SAME = { ...COLORS_CONTEXT, 6: BLUE, 7: BLUE }; // 8 empty -- blue over blue: legal
const COLORS_DIFF = { ...COLORS_CONTEXT, 6: BLUE, 7: PURPLE }; // 8 empty -- blue over purple: illegal

async function colorsScript({ sleep, jump }) {
  // Phase A -- same color, it works.
  resetBoard(COLORS_SAME);
  await sleep(650);
  board.selectedIndex = 6;
  board.targetIndices = [8];
  await sleep(950);
  board.selectedIndex = -1;
  board.targetIndices = [];
  await jump({ move: { from: 6, over: 7, to: 8 }, colorIndex: BLUE });
  await sleep(1000);

  // Phase B -- different color, it won't budge. No target ring appears (there
  // is no legal hop); the peg shakes and the spot it can't reach flashes red,
  // exactly like the real board's "nope" cue.
  resetBoard(COLORS_DIFF);
  await sleep(500);
  board.selectedIndex = 6;
  await sleep(800); // selected, but notice: no target ring on 8 this time
  board.shakeIndex = 6;
  board.rejectedIndex = 8;
  await sleep(520);
  board.shakeIndex = -1;
  board.rejectedIndex = -1;
  board.selectedIndex = -1;
  await sleep(950);
}

// --- Slide 4, "round ends": a single still frame of a genuinely stuck board
// (verified by hand -- no same-color pair anywhere has an empty landing two
// away), so its whole job is showing what "no hops left" looks like. Dots
// still on the board, but nowhere for any of them to go.
const STUCK_BOARD = { 0: BLUE, 2: GREEN, 5: PURPLE, 6: GREEN, 9: BLUE };

// --- Slide 5, "score": a near-perfect board -- a single dot left -- as the
// still image of a great result. No motion; the copy carries the rank/Best idea.
const SCORE_BOARD = { 4: BLUE };

const STEPS = [
  {
    key: 'goal',
    heading: 'Get rid of as many dots as you can',
    body: 'Every puzzle starts full of dots. Clear the board down to as few as possible.',
    script: goalScript,
    freeze: () => resetBoard({ 3: BLUE, 9: BLUE }), // the clear's end state: just two dots left
  },
  {
    key: 'hop',
    heading: 'Remove a dot by hopping over it',
    body: 'Tap a dot, then tap an empty space two spots away. The dot you jump over is cleared.',
    script: hopScript,
    freeze: () => {
      resetBoard(HOP_START);
      board.selectedIndex = 6;
      board.targetIndices = [8];
    },
  },
  {
    key: 'colors',
    heading: 'A dot only hops its own color',
    body: 'You can jump over a dot of the same color, but never a different one.',
    script: colorsScript,
    freeze: () => {
      resetBoard(COLORS_SAME);
      board.selectedIndex = 6;
      board.targetIndices = [8];
    },
  },
  {
    key: 'ends',
    heading: 'The round ends when you run out of hops',
    body: "When no same-color hops are left, that's the end -- even if dots are still on the board.",
    freeze: () => resetBoard(STUCK_BOARD),
  },
  {
    key: 'score',
    heading: 'Fewer dots left, higher rank',
    body: 'Your rank is how few dots you leave behind. Every puzzle remembers your Best -- come back and beat it.',
    caption: 'Down to one — a perfect finish',
    freeze: () => resetBoard(SCORE_BOARD),
  },
];

const stepCount = STEPS.length;
const currentStep = ref(0);
const currentStepDef = computed(() => STEPS[currentStep.value]);
const isFirstStep = computed(() => currentStep.value === 0);
const isLastStep = computed(() => currentStep.value === stepCount - 1);

// The furthest slide the player reached, so the dismissed event can show where
// the walkthrough tends to lose people.
let furthestStep = 0;

let runner = null;

/** Tears down the previous slide's animation, resets the board to this slide's start, and either plays its loop or (reduced motion / static slides) freezes a still frame. */
function applyStep(index) {
  runner?.stop();
  runner = null;

  const step = STEPS[index];
  if (prefersReducedMotion || !step.script) {
    step.freeze();
    return;
  }

  runner = createDemoRunner();
  runner.run(step.script);
}

function goToStep(index) {
  if (index < 0 || index >= stepCount || index === currentStep.value) return;
  currentStep.value = index;
}

function next() {
  if (isLastStep.value) {
    emit('close', 'manual', furthestStep + 1);
    return;
  }
  goToStep(currentStep.value + 1);
}

function back() {
  goToStep(currentStep.value - 1);
}

watch(
  currentStep,
  (index) => {
    furthestStep = Math.max(furthestStep, index);
    applyStep(index);
    track(EVENTS.HOW_TO_PLAY_STEP_VIEWED, { step: index + 1, stepCount });
  },
  { immediate: true }
);

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('close', 'escape', furthestStep + 1);
  } else if (event.key === 'ArrowRight') {
    if (!isLastStep.value) goToStep(currentStep.value + 1);
  } else if (event.key === 'ArrowLeft') {
    back();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  cardRef.value?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  runner?.stop();
});
</script>

<template>
  <div class="how-to-backdrop" @click.self="emit('close', 'backdrop', furthestStep + 1)">
    <div ref="cardRef" class="how-to-card" role="dialog" aria-modal="true" aria-labelledby="how-to-title" tabindex="-1">
      <button type="button" class="close-button" aria-label="Close" @click="emit('close', 'manual', furthestStep + 1)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <p id="how-to-title" class="how-to-eyebrow">How to Play</p>

      <!-- The board is one persistent element across every slide (its state is
           swapped by applyStep), so it never remounts as you page through. -->
      <div class="mini-board" aria-hidden="true">
        <div class="mini-hole-plane" :style="{ '--hole-size': holeSizePercent + '%' }">
          <div
            v-for="(position, index) in holes"
            :key="index"
            class="hole"
            :class="{
              selected: board.selectedIndex === index,
              target: board.targetIndices.includes(index),
              rejected: board.rejectedIndex === index,
              shaking: board.shakeIndex === index,
            }"
            :style="{ left: position.left, top: position.top }"
          >
            <span
              v-if="shouldShowPeg(index)"
              class="peg"
              :class="{ dissolving: board.dissolvingIndex === index }"
              :style="{ backgroundColor: pegColorForHole(index) }"
            ></span>
          </div>
          <div v-if="board.travel" class="travel-slot" :style="{ left: board.travel.leftPercent + '%', top: board.travel.topPercent + '%' }">
            <span class="peg" :style="{ transform: `scale(${board.travel.scale})`, backgroundColor: pegHex(board.travel.colorIndex) }"></span>
          </div>
        </div>
      </div>

      <p v-if="currentStepDef.caption" class="board-caption">{{ currentStepDef.caption }}</p>

      <div class="step-copy">
        <h2 class="step-heading">{{ currentStepDef.heading }}</h2>
        <p class="step-body">{{ currentStepDef.body }}</p>
      </div>

      <div class="step-dots" role="tablist" aria-label="Walkthrough steps">
        <button
          v-for="(step, index) in STEPS"
          :key="step.key"
          type="button"
          class="step-dot"
          :class="{ active: index === currentStep }"
          role="tab"
          :aria-selected="index === currentStep"
          :aria-label="`Step ${index + 1} of ${stepCount}`"
          @click="goToStep(index)"
        ></button>
      </div>

      <div class="step-nav">
        <button v-if="!isFirstStep" type="button" class="nav-button secondary" @click="back">Back</button>
        <button type="button" class="nav-button primary" @click="next">{{ isLastStep ? "Let's play" : 'Next' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.how-to-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(6px, 3.5vmin, 20px);
  background: rgba(36, 27, 20, 0.55);
  /* Plain `ease` rather than `ease-out` -- ease-out front-loads most of the
     opacity change into the animation's first third, which on a full-screen
     darkening reads as an abrupt flash-then-hold rather than a fade. A more
     even ramp is what actually registers as "fading in" to the eye. */
  animation: how-to-backdrop-in 0.28s ease;
}

/* A fixed max-width card that scrolls (max-height + overflow-y) only on a
   genuinely short viewport (a small Android in landscape) rather than
   pre-shrinking every dimension to guarantee it fits. */
.how-to-card {
  position: relative;
  width: 100%;
  max-width: 380px;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 22px 22px 20px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-card);
  text-align: center;
  /* Starts ~40ms after the backdrop (via `backwards` holding it at the `from`
     keyframe during that delay) so the dim-in and the card's rise-and-settle
     read as two distinct beats, on a decelerate curve so the settle reads as
     intentional rather than sudden. */
  animation: how-to-card-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.04s backwards;
}

@keyframes how-to-backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes how-to-card-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .how-to-backdrop,
  .how-to-card {
    animation: none;
  }
}

.close-button {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-ink-dim);
  cursor: pointer;
  border-radius: 50%;
}

.close-button:hover {
  color: var(--color-ink);
}

.close-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.how-to-eyebrow {
  margin: 0 32px 12px 0;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink-dim);
  text-align: left;
}

/* --- The scaled-down real board. Square (aspect-ratio 1/1) with holes sized
   as a percent of its own width, exactly like Board.vue -- so it's a faithful
   miniature, not a reshaped approximation. Capped small so the whole card
   (board + copy + nav) sits above the fold on a phone. --- */
.mini-board {
  position: relative;
  width: clamp(150px, 52vw, 208px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  padding: clamp(8px, 3vw, 14px);
  background: var(--color-board-plate);
  border-radius: 16px;
}

/* Percentage left/top on an absolutely positioned child resolve against its
   containing block's PADDING box (whose size ignores how much of it is padding
   vs. content) -- so holes positioned directly against `.mini-board` would
   ignore its padding and crowd its rounded corners. This inner, padding-less
   plane is what makes the padding above read as a visible inset -- the same
   fix Board.vue's own .hole-plane applies. */
.mini-hole-plane {
  position: relative;
  width: 100%;
  height: 100%;
}

.hole {
  position: absolute;
  width: var(--hole-size, 15%);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid var(--color-hole-border);
  background: var(--color-hole);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.15s ease;
}

.hole.target {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    0 0 0 2px var(--color-accent);
}

/* An empty hole the selected peg just tried (and failed) to reach -- the red
   "nope" ring, using the same red as the Red peg color (logic/pegColors.js)
   as Board.vue does, so it reads as "stop", never as a legal-target ring. */
.hole.rejected {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    0 0 0 2px rgba(193, 66, 47, 0.85);
}

/* The peg that attempted an illegal hop wiggles -- a scaled-down copy of
   Board.vue's own `hole-shake`. */
.hole.shaking {
  animation: mini-shake 0.4s ease-in-out;
}

@keyframes mini-shake {
  0%,
  100% {
    transform: translate(-50%, -50%) translateX(0);
  }
  20% {
    transform: translate(-50%, -50%) translateX(-3px);
  }
  40% {
    transform: translate(-50%, -50%) translateX(3px);
  }
  60% {
    transform: translate(-50%, -50%) translateX(-2px);
  }
  80% {
    transform: translate(-50%, -50%) translateX(2px);
  }
}

.peg {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.18));
  transition:
    transform 0.15s ease,
    filter 0.15s ease,
    opacity 0.15s ease;
}

.hole.selected .peg {
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
  z-index: 2;
}

@media (prefers-reduced-motion: reduce) {
  .peg,
  .peg.dissolving {
    animation: none;
    transition: none;
  }

  .hole.shaking {
    animation: none;
  }
}

.board-caption {
  margin: 10px 0 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  color: var(--color-ink-dim);
}

/* A fixed min-height so the shorter/longer copy across slides doesn't make the
   card (and the nav below it) jump around as you page through. */
.step-copy {
  margin-top: 14px;
  min-height: 84px;
}

.step-heading {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.2rem;
  line-height: 1.2;
  color: var(--color-ink);
}

.step-body {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--color-ink-secondary);
}

.step-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 4px 0 16px;
}

.step-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-card-border);
  opacity: 0.4;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.step-dot.active {
  background: var(--color-peg);
  opacity: 1;
  transform: scale(1.25);
}

.step-dot:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.step-nav {
  display: flex;
  gap: 10px;
}

.nav-button {
  min-height: 48px;
  padding: 10px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.98rem;
  border-radius: 14px;
  cursor: pointer;
}

.nav-button.primary {
  flex: 1;
  color: var(--color-card-bg);
  background: var(--color-peg);
  border: var(--control-border-width) solid var(--color-peg);
  box-shadow: var(--frame-shadow-card);
}

.nav-button.primary:hover {
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.nav-button.secondary {
  flex: 0 0 auto;
  color: var(--color-ink-secondary);
  background: transparent;
  border: var(--control-border-width) solid var(--color-card-border);
}

.nav-button.secondary:hover {
  color: var(--color-ink);
  border-color: var(--color-ink);
}

.nav-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
