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

  Board/hole colors below are CSS variables (e.g. var(--color-hole)) set by
  composables/useTheme.js, so re-skinning the game never means editing this
  file. A PEG's color is different: it carries game meaning (which pegs it
  can jump over), so it's NOT theme-driven -- it comes from the fixed
  palette in logic/pegColors.js instead, applied as an inline style.
  ============================================================================
-->
<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import { computeDisplayPositions, computeHoleDiameterPercent } from '../logic/boardLayout.js';
import { getPegColor } from '../logic/pegColors.js';
import { getColorAt } from '../logic/rules.js';

const props = defineProps({
  // A useGame() instance -- see composables/useGame.js. Passed as a whole
  // object so this component always sees live, up-to-date game state.
  game: {
    type: Object,
    required: true,
  },
  // Shrinks the board from its full-size gameplay dimensions down to the
  // result screen's card size (see components/PlayView.vue) -- set once the
  // round is over and its own settle/ripple flourish has played. Purely a
  // CSS size change; this component's identity (and thus its DOM node)
  // never changes, so there's only ever one board on screen -- see the
  // compact CSS rules below for why plain padding on .board wouldn't work.
  compact: {
    type: Boolean,
    default: false,
  },
  // A specific bigint[] mask snapshot to render INSTEAD of the live game's
  // own state.masks -- used to show a saved "Best" attempt (see
  // logic/bestResults.js) that may differ from whatever `game` currently
  // holds. Left null, this component reads live state exactly as before.
  masksOverride: {
    type: Array,
    default: null,
  },
  // Hole index to briefly pulse -- drives the result screen's sequential
  // score-reveal walk. -1 means no hole is currently pulsing.
  pulsingIndex: {
    type: Number,
    default: -1,
  },
});

const holePositions = computed(() => computeDisplayPositions(props.game.geometry));
const holeDiameterPercent = computed(() => computeHoleDiameterPercent(props.game.geometry, holePositions.value));

// Staggers the end-of-round ripple (see the `.board.round-over .hole`
// rules below) so it visibly radiates outward from the board's center
// rather than firing on every hole at once -- distance is computed in the
// same 0-100 board-percent space `computeDisplayPositions()` already
// places holes in, so no extra geometry is needed.
const RIPPLE_STAGGER_SPAN_MS = 220;
const boardCenterDistances = computed(() => holePositions.value.map((position) => Math.hypot(position.x - 50, position.y - 50)));
const maxRippleDistance = computed(() => Math.max(1, ...boardCenterDistances.value)); // guards a single-hole board

function rippleDelayMs(index) {
  return Math.round((boardCenterDistances.value[index] / maxRippleDistance.value) * RIPPLE_STAGGER_SPAN_MS);
}

// Whichever masks array is actually on screen right now -- `masksOverride`
// if given (a static snapshot, e.g. the result screen's "Best" view), else
// the live game's own state. Reading hole contents through this ONE array
// (rather than branching per-function between `masksOverride` and
// `props.game.holeHasPeg`/`getHoleColor`) means every helper below shares
// the exact same source of truth instead of re-deriving the same branch six
// different ways.
const activeMasks = computed(() => props.masksOverride ?? props.game.state.masks);

// True only for the live, playable board -- false whenever a static
// snapshot is being shown instead (masksOverride set). Selection, taps, and
// the jump-arc animation all gate on this, so a snapshot view can never be
// nudged into looking interactive, and a future jump on the underlying live
// `game` (e.g. from a dev tool) can't animate across a snapshot that isn't
// actually showing that game's current state.
const interactive = computed(() => props.masksOverride === null);

function isSelected(index) {
  return interactive.value && props.game.state.selectedHole === index;
}

function isValidTarget(index) {
  return interactive.value && props.game.validTargetHoles.includes(index);
}

/** Whether hole `index`'s ring should render dotted -- Ghost Outline's "you already made this exact jump from this exact board state today" cue (see logic/ghostMoves.js). Purely a memory aid; never a hint about which move is good. */
function isGhostRepeat(index) {
  return interactive.value && props.game.ghostRepeatedTargetHoles.includes(index);
}

/** Whether hole `index` has a peg right now, per `activeMasks`. */
function holeHasPeg(index) {
  return getColorAt(activeMasks.value, index) !== -1;
}

/** The color index of the peg at hole `index` right now, per `activeMasks`. */
function holeColorIndex(index) {
  return getColorAt(activeMasks.value, index);
}

/** Builds a human-readable label for screen readers, per hole. */
function holeAriaLabel(index) {
  const filled = holeHasPeg(index);
  if (!filled) return `Empty hole ${index}`;
  return `${getPegColor(holeColorIndex(index)).name} peg at hole ${index}`;
}

/**
 * The hex color to fill hole `index`'s peg with (from the fixed palette in
 * logic/pegColors.js). During a jump animation, the `over` hole's peg has
 * already been removed from live state (it's just dissolving on screen),
 * so its color falls back to the one captured for the whole animation --
 * see animatingColorHex above.
 */
function pegColorAt(index) {
  const move = animatingMove.value;
  if (move && index === move.over) {
    return animatingColorHex.value;
  }
  return getPegColor(holeColorIndex(index)).hex;
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
// Captured ONCE when the animation starts (see animateJump() below), since
// by the time this fires the game's state has already updated -- the
// `over`/`from` holes are already empty, so their color can no longer be
// read live. A legal jump always requires `from` and `over` to be the SAME
// color, and the landed peg at `to` keeps that color, so reading it there
// (post-jump) is correct for both the traveling peg and the dissolving one.
const animatingColorHex = ref(null);
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
  animatingColorHex.value = pegColorAt(move.to);

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
    // never start the arc tween for them. A static snapshot (masksOverride
    // set) never animates either, even if the underlying `game` it's
    // attached to happens to record a move -- there's no guarantee that
    // move has anything to do with the snapshot currently on screen.
    if (move && interactive.value && !prefersReducedMotion) animateJump(move);
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
  return holeHasPeg(index);
}

/** Whether hole `index` is the jumped-over peg currently fading out. */
function isDissolving(index) {
  return animatingMove.value?.over === index;
}

/** Taps are ignored once a specific (non-live) board snapshot is being shown -- e.g. the result screen's "Best" view -- since there's no live game to act on. Live play still delegates to game.selectHole(), which itself already no-ops once the round is over. */
function handleHoleClick(index) {
  if (!interactive.value) return;
  props.game.selectHole(index);
}
</script>

<template>
  <div
    class="board"
    :class="{ 'round-over': game.roundOver, compact }"
    :style="{ '--hole-size': holeDiameterPercent + '%' }"
  >
    <div class="hole-plane">
      <button
        v-for="(position, index) in holePositions"
        :key="index"
        type="button"
        class="hole"
        :class="{
          filled: shouldShowPeg(index),
          selected: isSelected(index),
          target: isValidTarget(index),
          'target-repeat': isGhostRepeat(index),
          pulsing: index === pulsingIndex,
        }"
        :style="{ left: position.left, top: position.top, '--ripple-delay': rippleDelayMs(index) + 'ms' }"
        :aria-label="holeAriaLabel(index)"
        :aria-pressed="interactive ? isSelected(index) : undefined"
        :tabindex="interactive ? undefined : -1"
        @click="handleHoleClick(index)"
      >
        <span
          v-if="shouldShowPeg(index)"
          class="peg"
          :class="{ dissolving: isDissolving(index) }"
          :style="{ backgroundColor: pegColorAt(index) }"
          aria-hidden="true"
        ></span>
      </button>

      <!-- The peg physically mid-jump -- positioned independently of any
           hole so it can arc smoothly between two of them. -->
      <div
        v-if="animatingMove"
        class="travel-slot"
        aria-hidden="true"
        :style="{ left: travel.leftPercent + '%', top: travel.topPercent + '%' }"
      >
        <span class="peg" :style="{ transform: `scale(${travel.scale})`, backgroundColor: animatingColorHex }"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  box-sizing: border-box;
  position: relative;
  /* The hero element: sized off both viewport width and height so it
     reliably fills roughly two-thirds of a mobile screen's vertical
     space, no matter how tall the header/stats/controls end up being. */
  width: min(95vw, 66dvh);
  max-width: 460px;
  padding: 0;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  background: var(--color-board-plate);
  border: var(--frame-border);
  border-radius: var(--frame-radius-board);
  box-shadow: var(--frame-shadow-board);
  /* Shrinks into the result screen's card size/position (see the `compact`
     prop) by animating its own size -- the same board element, never a
     second one, "moves" purely because it stays centered (margin: 0 auto)
     while sibling elements above/below it (see PlayView.vue) come and go
     around it. */
  transition:
    width 0.4s ease,
    max-width 0.4s ease,
    height 0.4s ease,
    padding 0.4s ease;
}

.board.compact {
  width: 240px;
  max-width: 240px;
  /* Pinned explicitly rather than left to `aspect-ratio` above -- some
     browsers resolve `aspect-ratio` against the content box even under
     `box-sizing: border-box` while this size is still settling out of its
     width transition, which briefly (or, on some engines, permanently)
     skews the board a few pixels taller than wide and pushes the bottom
     row of holes past the board's own rounded corner/border. Fixing both
     dimensions here sidesteps that outright. */
  height: 240px;
  padding: 20px;
}

.board.compact .hole {
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .board {
    transition: none;
  }
}

/* The actual positioning context for holes/travel-slot -- deliberately
   NOT `.board` itself. Percentage top/left offsets on an absolutely
   positioned element resolve against its containing block's PADDING box,
   whose size is fixed by width/border alone and is untouched by how much
   of it padding vs. content occupies -- so if `.board`'s own padding grew
   in compact mode, the holes would never actually appear inset from its
   edge. Giving `.hole-plane` its own `position: relative` box (sized to
   fill whatever content area `.board`'s padding leaves it) is what makes
   the compact padding above actually read as a visible inset. */
.hole-plane {
  position: relative;
  width: 100%;
  height: 100%;
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

/* The rest of the end-of-round flourish: every remaining peg gets a
   highlight pulse, staggered via --ripple-delay (set per-hole above) so it
   reads as one wave radiating outward from the board's center. Brief and
   self-reversing -- it leaves no lasting style change once it finishes.
   Scoped to :not(.compact): `round-over` never turns back off, but
   `compact` turns on ~800ms later (see PlayView.vue's RESULT_HOLD_MS) --
   so this still fires exactly once, at full size, the instant the round
   ends. Without the :not(.compact) guard, switching the result screen's
   This game/Best toggle later (which adds/removes individual .peg
   elements as the shown board snapshot changes) would re-trigger this
   pulse on every newly-inserted peg, which the toggle is explicitly meant
   NOT to do. */
.board.round-over:not(.compact) .hole.filled .peg:not(.dissolving) {
  animation: peg-pulse 0.5s ease-out;
  animation-delay: var(--ripple-delay, 0ms);
}

@keyframes peg-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 var(--color-accent);
  }
  40% {
    transform: scale(1.12);
    box-shadow: 0 0 8px 3px var(--color-accent);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 var(--color-accent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .board.round-over:not(.compact) .hole.filled .peg:not(.dissolving) {
    animation: none;
  }
}

/* The result screen's sequential score-reveal walk (see
   composables/useResultReveal.js) briefly pulses one hole at a time as it
   ticks that peg's color count up -- this is the "it's this one's turn"
   cue. */
.hole.pulsing .peg {
  animation: hole-pulse 0.3s ease-out;
}

@keyframes hole-pulse {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hole.pulsing .peg {
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
  /* This button's hit-box is a square, even though border-radius makes it
     *look* circular -- the browser's own tap/focus affordances don't know
     that. Left alone, tapping a hole leaves a square color haze (iOS
     Safari's tap-highlight) and/or a square focus ring, both squared off to
     the true button box rather than clipped to the visible circle. Kill
     both here and rebuild focus-visible below using box-shadow, which (like
     the recess shadow above) always follows border-radius correctly. */
  -webkit-tap-highlight-color: transparent;
  outline: none;
}

.hole.target {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    0 0 0 2px var(--color-accent);
}

/* Ghost Outline (see logic/ghostMoves.js): a jump already taken from this
   exact board state today gets a dashed ring instead of the normal solid
   one -- box-shadow can't render a dash pattern, so this drops the outer
   box-shadow ring above and draws an actual dashed border on a
   pseudo-element instead. Purely a memory aid ("have I tried this"), never
   a signal about whether the move is good. */
.hole.target.target-repeat {
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
}

.hole.target.target-repeat::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 2px dashed var(--color-accent);
  pointer-events: none;
}

.hole:focus-visible {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    0 0 0 3px var(--color-accent);
}

.peg {
  width: 72%;
  height: 72%;
  border-radius: 50%;
  /* background-color is set inline per-peg from logic/pegColors.js -- see
     pegColorAt() above -- since a peg's color carries game meaning and
     isn't theme-driven. */
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
