<!--
  ============================================================================
  components/HowToPlayModal.vue
  ----------------------------------------------------------------------------
  The whole "how do I play this" story in one glance -- deliberately not a
  paginated, multi-step carousel: Dot Hopper only has a couple of things a
  player can't already guess (a peg can only jump its own color; the round
  ends the instant no jump is left), so a single card with three small
  real-styled demos teaches it faster than clicking through several screens
  would. Opens itself once, automatically, the very first time a browser
  ever loads the game; after that, reached only via the header's "?" button
  (see composables/useHowToPlay.js's openIfFirstVisit(), driven from
  App.vue).

  Each demo is a genuinely tiny, DECORATIVE version of the real board (not
  an abstract stand-in): same hole/peg shapes, same peg colors, same
  selected/target/blocked ring treatment as Board.vue, and -- critically --
  the exact same jump-arc tween (fx/jumpAnimation.js, shared with Board.vue
  itself) and the exact same dissolve CSS values, so a tutorial jump looks
  and times out identically to a real one. Demos 1 and 2 play themselves on
  a loop via a small async script (select -> hold -> jump/block -> hold ->
  reset) rather than hand-authored CSS @keyframes, because the real board's
  own animation is JS-driven (an arc tween, not a fixed keyframe curve) --
  matching that requires the same kind of driver, not a CSS approximation
  of it. Demo 3 is deliberately NOT animated at all -- no jump, no
  selection, nothing moving -- it's a single still frame of a finished
  board, since its whole job is showing what "no hop left" LOOKS like, not
  re-teaching the jump mechanic a third time.
  ============================================================================
-->
<script setup>
import { onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { getPegColor } from '../logic/pegColors.js';
import { animateArc } from '../fx/jumpAnimation.js';

const emit = defineEmits(['close']);
const cardRef = ref(null);

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close', 'escape');
}

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// --- a tiny animation driver shared by demos 1 and 2 below (demo 3 has no
// motion at all -- see the file header comment): `sleep()` for scripted
// holds, `jump()` for a real arc-tween-plus-dissolve move (reusing
// fx/jumpAnimation.js), and `run()` to loop a script forever until `stop()`.
// Each demo gets its OWN runner (own cancellation state), since they animate
// independently and on their own clocks.

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
   * Runs one real jump -- arc tween + dissolve -- against a demo's own
   * reactive `state`. Mirrors useGame.js/Board.vue exactly: the peg DATA
   * moves instantly (from and over clear, to fills), the same instant a
   * real jump's underlying board state updates -- the arc/dissolve below
   * is purely a cosmetic overlay on top of that, same as the real game,
   * using `dissolvingIndex`/`arrivingIndex` to keep rendering the
   * jumped-over peg (fading out) and hide the landed one (until the
   * travel-slot peg visually arrives) -- see shouldShowPeg()/pegColorForHole().
   */
  function jump({ state, holes, move, colorIndex }) {
    return new Promise((resolve) => {
      if (cancelled) {
        resolve();
        return;
      }
      const fromPos = holes[move.from];
      const toPos = holes[move.to];

      state.dissolvingColorIndex = state.pegs[move.over];
      state.dissolvingIndex = move.over;
      state.arrivingIndex = move.to;
      state.pegs[move.from] = null;
      state.pegs[move.over] = null;
      state.pegs[move.to] = colorIndex;

      state.travel = { leftPercent: fromPos.x, topPercent: fromPos.y, scale: 1, colorIndex };
      cancelArc = animateArc({
        fromPos,
        toPos,
        onFrame: ({ leftPercent, topPercent, scale }) => {
          if (state.travel) Object.assign(state.travel, { leftPercent, topPercent, scale });
        },
        onDone: () => {
          cancelArc = null;
          state.travel = null;
          state.dissolvingIndex = -1;
          state.dissolvingColorIndex = null;
          state.arrivingIndex = -1;
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

function makeDemoState(initialPegs) {
  return reactive({
    pegs: [...initialPegs], // colorIndex, or null for an empty hole -- one entry per hole position below
    selectedIndex: -1,
    targetIndices: [],
    blockedIndices: [],
    dissolvingIndex: -1, // hole whose peg data is already gone but still rendering, fading out -- see jump() above
    dissolvingColorIndex: null, // that hole's color, captured before its data was cleared
    arrivingIndex: -1, // hole whose peg data has already landed but stays hidden until the travel-slot peg visually arrives
    travel: null, // { leftPercent, topPercent, scale, colorIndex } while a peg is mid-arc, else null
  });
}

/** Whether hole `index` should currently render a peg -- see jump() above for why this isn't just `state.pegs[index] !== null`. */
function shouldShowPeg(state, index) {
  if (state.arrivingIndex === index) return false;
  if (state.dissolvingIndex === index) return true;
  return state.pegs[index] !== null;
}

/** The color to render hole `index`'s peg with -- falls back to the captured dissolving color once the real data's already been cleared. */
function pegColorForHole(state, index) {
  const colorIndex = state.dissolvingIndex === index ? state.dissolvingColorIndex : state.pegs[index];
  return colorIndex === null || colorIndex === undefined ? null : getPegColor(colorIndex).hex;
}

const BLUE = 0;
const PURPLE = 1;
const GREEN = 2;

// --- Demo 1: a legal jump. Blue hops blue into the open, glowing spot;
// purple (a different color) just sits there, untouched. ---

const demo1Holes = [
  { x: 12, y: 50 },
  { x: 38, y: 50 },
  { x: 64, y: 50 },
  { x: 90, y: 50 },
];
const demo1 = makeDemoState([BLUE, BLUE, null, PURPLE]);
const demo1Runner = createDemoRunner();

async function demo1Script({ sleep, jump }) {
  demo1.pegs = [BLUE, BLUE, null, PURPLE];
  demo1.selectedIndex = -1;
  demo1.targetIndices = [];
  await sleep(650);
  demo1.selectedIndex = 0;
  demo1.targetIndices = [2];
  await sleep(850);
  demo1.selectedIndex = -1;
  demo1.targetIndices = [];
  await jump({ state: demo1, holes: demo1Holes, move: { from: 0, over: 1, to: 2 }, colorIndex: BLUE });
  await sleep(950);
}

// --- Demo 2: a blocked jump. Blue selects, but its only empty neighbor is
// past a PURPLE peg -- so that open spot greys out instead of glowing,
// exactly like Board.vue's new `.hole.blocked` treatment for a selected
// peg's out-of-reach open spaces. ---

const demo2Holes = [
  { x: 18, y: 50 },
  { x: 50, y: 50 },
  { x: 82, y: 50 },
];
const demo2 = makeDemoState([BLUE, PURPLE, null]);
const demo2Runner = createDemoRunner();

async function demo2Script({ sleep }) {
  demo2.pegs = [BLUE, PURPLE, null];
  demo2.selectedIndex = -1;
  demo2.blockedIndices = [];
  await sleep(650);
  demo2.selectedIndex = 0;
  await sleep(300); // a beat between "selected" and the open spot greying in -- two distinct events, not one
  demo2.blockedIndices = [2];
  await sleep(1150);
  demo2.selectedIndex = -1;
  demo2.blockedIndices = [];
  await sleep(550);
}

// --- Demo 3: the round ending, shown as one plain still frame -- no
// selection, no jump, nothing moving. A bigger, three-color board sitting
// in a genuinely stuck position: re-checking every row/column by hand
// confirms no same-color pair anywhere has an empty landing spot two away,
// so there's truly no hop left on it.
//
// Layout (2 rows x 4 cols), by hole index:
//   0:empty 1:empty 2:blue  3:purple
//   4:green 5:purple 6:green 7:empty
const demo3Holes = [
  { x: 12, y: 26 },
  { x: 38, y: 26 },
  { x: 64, y: 26 },
  { x: 90, y: 26 },
  { x: 12, y: 76 },
  { x: 38, y: 76 },
  { x: 64, y: 76 },
  { x: 90, y: 76 },
];
const demo3Pegs = [null, null, BLUE, PURPLE, GREEN, PURPLE, GREEN, null];

function pegHex(colorIndex) {
  return colorIndex === null ? null : getPegColor(colorIndex).hex;
}

/** A demo's reduced-motion fallback: skip the loop entirely and freeze on the single most explanatory static frame (same "selected, and here's what that means" moment each script pauses on mid-loop). */
function freeze(state, { pegs, selectedIndex = -1, targetIndices = [], blockedIndices = [] }) {
  state.pegs = [...pegs];
  state.selectedIndex = selectedIndex;
  state.targetIndices = targetIndices;
  state.blockedIndices = blockedIndices;
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  cardRef.value?.focus();

  if (prefersReducedMotion) {
    freeze(demo1, { pegs: [BLUE, BLUE, null, PURPLE], selectedIndex: 0, targetIndices: [2] });
    freeze(demo2, { pegs: [BLUE, PURPLE, null], selectedIndex: 0, blockedIndices: [2] });
    // demo3 is already a static frame -- nothing to freeze.
    return;
  }

  demo1Runner.run(demo1Script);
  demo2Runner.run(demo2Script);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  demo1Runner.stop();
  demo2Runner.stop();
});
</script>

<template>
  <div class="how-to-backdrop" @click.self="emit('close', 'backdrop')">
    <div ref="cardRef" class="how-to-card" role="dialog" aria-modal="true" aria-labelledby="how-to-title" tabindex="-1">
      <button type="button" class="close-button" aria-label="Close" @click="emit('close', 'manual')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <h2 id="how-to-title" class="how-to-title">How to Play</h2>

      <ul class="how-to-intro">
        <li><b>Clear dots to increase your ranking.</b></li>
        <li>Tap a dot, then tap an open spot to hop it.</li>
        <li>Run out of hops, and the round ends.</li>
      </ul>
      <div class="how-to-divider"></div>

      <section class="demo-block">
        <h3 class="demo-heading">You can only hop dots of the same color</h3>
        <div class="mini-board" aria-hidden="true">
          <div class="mini-hole-plane">
            <div
              v-for="(position, index) in demo1Holes"
              :key="index"
              class="hole"
              :class="{
                selected: demo1.selectedIndex === index,
                target: demo1.targetIndices.includes(index),
              }"
              :style="{ left: position.x + '%', top: position.y + '%' }"
            >
              <span
                v-if="shouldShowPeg(demo1, index)"
                class="peg"
                :class="{ dissolving: demo1.dissolvingIndex === index }"
                :style="{ backgroundColor: pegColorForHole(demo1, index) }"
              ></span>
            </div>
            <div v-if="demo1.travel" class="travel-slot" :style="{ left: demo1.travel.leftPercent + '%', top: demo1.travel.topPercent + '%' }">
              <span class="peg" :style="{ transform: `scale(${demo1.travel.scale})`, backgroundColor: pegHex(demo1.travel.colorIndex) }"></span>
            </div>
          </div>
        </div>
      </section>

      <section class="demo-block">
        <h3 class="demo-heading">Different colors block the hop</h3>
        <div class="mini-board short" aria-hidden="true">
          <div class="mini-hole-plane">
            <div
              v-for="(position, index) in demo2Holes"
              :key="index"
              class="hole"
              :class="{
                selected: demo2.selectedIndex === index,
                blocked: demo2.blockedIndices.includes(index),
              }"
              :style="{ left: position.x + '%', top: position.y + '%' }"
            >
              <span v-if="demo2.pegs[index] !== null" class="peg" :style="{ backgroundColor: pegHex(demo2.pegs[index]) }"></span>
            </div>
          </div>
        </div>
      </section>

      <section class="demo-block">
        <h3 class="demo-heading">Round ends when there are no valid hops</h3>
        <div class="mini-board tall" aria-hidden="true">
          <div class="mini-hole-plane">
            <div v-for="(position, index) in demo3Holes" :key="index" class="hole" :style="{ left: position.x + '%', top: position.y + '%' }">
              <span v-if="demo3Pegs[index] !== null" class="peg" :style="{ backgroundColor: pegHex(demo3Pegs[index]) }"></span>
            </div>
          </div>
        </div>
      </section>

      <button type="button" class="how-to-cta" @click="emit('close', 'manual')">Let's play</button>
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

/* Sized for comfortable reading first -- fixed, generous padding/type
   rather than shrinking everything down to guarantee it fits above the
   fold. `max-height` + `overflow-y: auto` below is just a safety net for a
   genuinely short viewport (a small Android in landscape); it scrolls
   there instead of clipping, rather than every dimension pre-shrinking via
   `vmin` to avoid ever needing that scroll. */
.how-to-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 24px 22px 20px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-card);
  text-align: left;
  /* Starts ~40ms after the backdrop (via `backwards` holding it at the
     `from` keyframe during that delay) so the dim-in and the card's
     rise-and-settle read as two distinct beats instead of one flat pop --
     and a decelerate curve (quick start, gentle settle) rather than
     `ease-out`'s more linear-feeling glide, since that settle is what
     actually makes an entrance read as intentional rather than sudden. */
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

.how-to-title {
  /* Leaves room for the close button (top: 12px, 32px tall) without the
     title text running under it -- title stays left-aligned, this is
     purely a right-side clearance. */
  margin: 0 32px 14px 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.35rem;
  color: var(--color-ink);
}

.how-to-intro {
  margin: 0;
  padding-left: 1.15em;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  line-height: 1.5;
}

.how-to-intro li {
  color: var(--color-ink-secondary);
}

.how-to-intro li + li {
  margin-top: 4px;
}

.how-to-intro li::marker {
  color: var(--color-accent);
}

.how-to-divider {
  height: 1px;
  margin: 18px 0 16px;
  background: var(--color-card-border);
  opacity: 0.15;
}

.demo-block {
  margin-bottom: 18px;
}

.demo-heading {
  margin: 0 0 8px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.how-to-cta {
  width: 100%;
  min-height: 48px;
  padding: 10px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.98rem;
  color: var(--color-card-bg);
  background: var(--color-peg);
  border: var(--control-border-width) solid var(--color-peg);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
  /* A full-width primary action reads centered everywhere else in this app
     (e.g. Controls.vue's Reset button) -- keeping it here too, even though
     the card's BODY copy above is left-aligned. */
  text-align: center;
}

.how-to-cta:hover {
  background: var(--color-ink);
  border-color: var(--color-ink);
}

.how-to-cta:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* --- Mini demo boards. Structurally the same idea as Board.vue's own
   .board/.hole-plane/.hole/.peg -- an absolutely-positioned plane so a
   travel-slot peg can arc between two holes' exact coordinates -- and the
   selected/target/blocked/dissolving values below are hand-kept identical
   to Board.vue's (Vue's scoped styles can't be shared directly
   across components), so a tutorial jump looks pixel-for-pixel like a real
   one. If Board.vue's own ring/scale/timing values ever change, match them
   here too. --- */

/* `--hole-size` drives both the holes' diameter AND the board's own height
   (height: calc() below, off that same variable). Scaled off `vw` (the
   card's own width is what actually constrains these, now that the card
   is free to grow tall and scroll rather than needing to shrink to fit a
   short viewport) with a floor that keeps holes legible on a narrow phone
   and a ceiling bounded by the card's own max-width. */
.mini-board {
  position: relative;
  width: 100%;
  --hole-size: clamp(30px, 9vw, 46px);
  height: calc(var(--hole-size) * 1.6);
  padding: 0 clamp(12px, 4vw, 18px);
  background: var(--color-board-plate);
  border-radius: 14px;
}

.mini-board.short {
  --hole-size: clamp(28px, 8vw, 42px);
}

.mini-board.tall {
  --hole-size: clamp(20px, 6vw, 34px);
  height: calc(var(--hole-size) * 2.8);
}

/* Percentage left/top on an absolutely positioned child resolve against its
   containing block's PADDING box (whose size ignores how much of it is
   padding vs. content) -- so holes positioned directly against
   `.mini-board` would ignore its padding and crowd its rounded corners.
   This inner, padding-less plane is what makes the padding above actually
   read as a visible inset -- exactly the same fix Board.vue's own
   .hole-plane applies, for the same reason. */
.mini-hole-plane {
  position: relative;
  width: 100%;
  height: 100%;
}

.hole {
  position: absolute;
  width: var(--hole-size);
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

.hole.blocked {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    inset 0 0 0 999px rgba(36, 27, 20, 0.14);
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

/* Only demo 1 ever renders a `.travel-slot` (demo 3 is a still frame, demo
   2 has no jump at all) -- no `.mini-board.tall` variant needed here. */
.travel-slot {
  position: absolute;
  width: var(--hole-size);
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
}
</style>
