// ============================================================================
// composables/useResultReveal.js
// ----------------------------------------------------------------------------
// The one-shot "something just happened" reveal that plays once a round
// finishes: once the board has settled into its compact result-card size,
// each surviving peg flies from its hole to its color's next open slot in
// the "Dots Left On Board" tally (see components/DotsLeftOnBoard.vue),
// landing with a subtle, grounded settle -- no arc, no ripple. Once every
// peg has landed, the board collapses out of the layout and
// components/RankLadder.vue's own entrance takes over (see its `revealed`
// prop, driven by `ladderReady` below).
//
// This only ever plays once, for the freshly-finished round -- the result
// screen always just shows the most recent attempt.
//
// Extracted out of the now-retired ResultOverlay.vue so components/Board.vue
// can be the one component that owns rendering the board itself (see its
// `flownHoleIndexes`/`cleared` props, which this composable drives).
// ============================================================================

import { onBeforeUnmount, reactive, ref } from 'vue';
import { computeDisplayPositions } from '../logic/boardLayout.js';
import { getColorAt } from '../logic/rules.js';
import { getPegColor } from '../logic/pegColors.js';
import { animateArc, JUMP_DURATION_MS } from '../fx/jumpAnimation.js';

// Mirrors components/PlayView.vue's BOARD_SHRINK_MS -- the fly sequence
// can't measure real hole positions until the board's own compact-size
// transition has actually finished settling.
const BOARD_SHRINK_WAIT_MS = 400;
// Mirrors components/DotsLeftOnBoard.vue's own tally-enter CSS duration --
// pegs don't start flying until the tally box they're flying INTO has
// finished arriving, so their landing spots are stable to measure.
const TALLY_ENTER_WAIT_MS = 280;
const FLY_STAGGER_MS = 45;
// A straight, grounded drop (arcHeight: 0) rather than the jump's hop --
// same rAF tween helper as a real peg jump, just without the arc, so it
// reads as "the same kind of motion, dropped flat" rather than a whole new
// animation style. Deliberately a bit slower than JUMP_DURATION_MS itself
// (a real in-game jump) -- this is a whole tally's worth of pegs landing in
// sequence, not a single move, so each one gets more room to read.
const FLY_DURATION_MS = JUMP_DURATION_MS * 1.3;
// Once every peg has landed, components/Board.vue's `.board.cleared`
// transition (0.22s height/padding/border, 0.18s opacity -- see that
// file) needs a moment to visually clear before the ladder takes its place.
const BOARD_COLLAPSE_WAIT_MS = 160;

export function useResultReveal() {
  const rankRevealed = ref(false);
  const tallyReady = ref(false); // components/DotsLeftOnBoard.vue mounts (and plays its own entrance) once this flips true
  const ladderReady = ref(false);
  // True whenever the CURRENT reveal was reached via an instant path
  // (showImmediately()'s restored round, or reduced motion) rather than the
  // animated start() sequence -- components/RankLadder.vue reads this to
  // know it should skip its own stamp/climb entrance too, since it can't
  // otherwise tell "just restored" apart from "just finished" (both hand it
  // `revealed: true` on their very first render).
  const instant = ref(false);
  const displayedScore = ref([]); // per color; null == not yet revealed, shown blank
  const flyingPegs = ref([]); // [{id, x, y, scale, size, colorHex}], viewport-pixel positions -- see PlayView.vue's overlay
  const flownHoleIndexes = ref([]); // hole indexes whose peg has already departed -- see Board.vue's prop of the same name
  const boardCleared = ref(false);

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let nextFlyingPegId = 0;
  let pendingTimeoutIds = [];
  let activeCancelArcs = [];
  // Bumped by cancel()/start() to invalidate any in-flight reveal. Every
  // await point below re-checks this before touching any state, so a
  // reveal cancelled mid-flight (e.g. the player hit Reset) can't resume
  // later and mutate state or resolve `start()` for a round that's no
  // longer current.
  let generation = 0;

  function wait(ms) {
    return new Promise((resolve) => {
      pendingTimeoutIds.push(setTimeout(resolve, ms));
    });
  }

  function stopFlySequence() {
    pendingTimeoutIds.forEach(clearTimeout);
    pendingTimeoutIds = [];
    activeCancelArcs.forEach((cancelOne) => cancelOne());
    activeCancelArcs = [];
    flyingPegs.value = [];
  }

  /** Aborts an in-flight reveal (e.g. the player hit Reset mid-flight) and resets every prop this drives on components/Board.vue back to its default -- without this, a Reset mid-flight (or right after a fully-revealed round) would leave `cleared`/`flownHoleIndexes` stuck on, permanently hiding the board it should be showing for the new round. The abandoned `start()` call's promise then never resolves, so anything chained off it correctly never fires for the abandoned round. */
  function cancel() {
    generation += 1;
    stopFlySequence();
    flownHoleIndexes.value = [];
    boardCleared.value = false;
  }

  /**
   * Flies every surviving peg from its (already-compact) board hole to its
   * color's next tally slot, staggered slightly. Resolves once every peg
   * has landed.
   *
   * @param {{index:number,x:number,y:number,color:number}[]} sequence - top-left to bottom-right, one entry per surviving peg
   * @param {import('vue').Ref<{getRootRect: () => DOMRect|null}|null>} boardRef
   * @param {import('vue').Ref<{getSlotRect: (colorIndex:number, slotIndex:number) => DOMRect|null}|null>} tallyRef
   */
  function runFlySequence(sequence, boardRef, tallyRef) {
    return new Promise((resolve) => {
      if (sequence.length === 0) {
        resolve();
        return;
      }
      const boardRect = boardRef?.value?.getRootRect?.();
      if (!boardRect) {
        // No real board to measure from (shouldn't normally happen) -- just
        // fill the tally directly rather than leaving the reveal stuck.
        sequence.forEach((entry) => {
          displayedScore.value[entry.color] = (displayedScore.value[entry.color] ?? 0) + 1;
        });
        resolve();
        return;
      }

      const nextSlotIndexByColor = {};
      let remaining = sequence.length;

      sequence.forEach((entry, sequenceIndex) => {
        const timeoutId = setTimeout(() => {
          flownHoleIndexes.value = [...flownHoleIndexes.value, entry.index];

          const fromX = boardRect.left + (entry.x / 100) * boardRect.width;
          const fromY = boardRect.top + (entry.y / 100) * boardRect.height;
          const slotIndex = nextSlotIndexByColor[entry.color] ?? 0;
          nextSlotIndexByColor[entry.color] = slotIndex + 1;
          const slotRect = tallyRef?.value?.getSlotRect?.(entry.color, slotIndex);
          const toX = slotRect ? slotRect.left + slotRect.width / 2 : fromX;
          const toY = slotRect ? slotRect.top + slotRect.height / 2 : fromY;
          const size = slotRect ? slotRect.width : 16;

          const pegId = nextFlyingPegId++;
          const colorHex = getPegColor(entry.color).hex;
          flyingPegs.value = [...flyingPegs.value, { id: pegId, x: fromX, y: fromY, scale: 1, size, colorHex }];

          const cancelThisArc = animateArc({
            fromPos: { x: fromX, y: fromY },
            toPos: { x: toX, y: toY },
            duration: FLY_DURATION_MS,
            arcHeight: 0, // straight, grounded settle -- no hop
            onFrame: ({ leftPercent, topPercent, scale }) => {
              flyingPegs.value = flyingPegs.value.map((peg) =>
                peg.id === pegId ? { ...peg, x: leftPercent, y: topPercent, scale } : peg
              );
            },
            onDone: () => {
              activeCancelArcs = activeCancelArcs.filter((cancelOne) => cancelOne !== cancelThisArc);
              flyingPegs.value = flyingPegs.value.filter((peg) => peg.id !== pegId);
              displayedScore.value[entry.color] = (displayedScore.value[entry.color] ?? 0) + 1;
              remaining -= 1;
              if (remaining === 0) resolve();
            },
          });
          activeCancelArcs.push(cancelThisArc);
        }, sequenceIndex * FLY_STAGGER_MS);
        pendingTimeoutIds.push(timeoutId);
      });
    });
  }

  /**
   * Kicks off the reveal for a just-finished round. Call this exactly once
   * per round.
   *
   * @param {object} params
   * @param {import('vue').Ref} params.boardRef - template ref to components/Board.vue (exposes getRootRect())
   * @param {import('vue').Ref} params.tallyRef - template ref to components/DotsLeftOnBoard.vue (exposes getSlotRect()); still null when this is called -- that component only mounts partway through this function, once `tallyReady` flips true, so its `.value` is read lazily
   * @param {object} params.geometry - the puzzle's board geometry (see logic/geometry.js)
   * @param {bigint[]} params.masks - the round's final masks, one per color
   * @param {number[]} params.par - the puzzle's per-color par, used to size the score arrays
   * @param {number[]} params.pegsRemaining - final per-color peg counts, used directly under reduced motion
   */
  async function start({ boardRef, tallyRef, geometry, masks, par, pegsRemaining }) {
    cancel();
    const myGeneration = generation;
    displayedScore.value = par.map(() => null);
    flyingPegs.value = [];
    flownHoleIndexes.value = [];
    boardCleared.value = false;
    rankRevealed.value = false;
    tallyReady.value = false;
    ladderReady.value = false;
    instant.value = false;

    if (prefersReducedMotion) {
      displayedScore.value = [...pegsRemaining];
      boardCleared.value = true;
      rankRevealed.value = true;
      tallyReady.value = true;
      ladderReady.value = true;
      instant.value = true;
      return;
    }

    // The rank name itself is no longer a suspense payoff gated behind a
    // score walk -- components/RankLadder.vue's climb owns that job now.
    rankRevealed.value = true;

    await wait(BOARD_SHRINK_WAIT_MS);
    if (myGeneration !== generation) return new Promise(() => {}); // abandoned while the board was still shrinking -- never resolve

    // components/DotsLeftOnBoard.vue mounts (and plays its own tally-enter
    // CSS animation) here; the fly sequence below waits out that same
    // duration so its slot rects are settled before anything measures them.
    tallyReady.value = true;
    await wait(TALLY_ENTER_WAIT_MS);
    if (myGeneration !== generation) return new Promise(() => {});

    const positions = computeDisplayPositions(geometry);
    const sequence = positions
      .map((position, index) => ({ index, x: position.x, y: position.y, color: getColorAt(masks, index) }))
      .filter((entry) => entry.color !== -1)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    await runFlySequence(sequence, boardRef, tallyRef);
    if (myGeneration !== generation) return new Promise(() => {}); // abandoned or skipped-to-end mid-flight -- never resolve

    boardCleared.value = true;
    await wait(BOARD_COLLAPSE_WAIT_MS);
    if (myGeneration !== generation) return new Promise(() => {});

    ladderReady.value = true;
  }

  /**
   * Shows the fully-revealed state directly, with no reveal ever having
   * played -- used when components/PlayView.vue restores a round that
   * finished in an earlier visit (see logic/roundState.js). There's nothing
   * to skip here; the result screen should simply already look done.
   *
   * @param {number[]} pegsRemaining - final per-color peg counts
   */
  function showImmediately(pegsRemaining) {
    cancel();
    displayedScore.value = [...pegsRemaining];
    boardCleared.value = true;
    rankRevealed.value = true;
    tallyReady.value = true;
    ladderReady.value = true;
    instant.value = true;
  }

  onBeforeUnmount(cancel);

  // Wrapped in reactive() so callers can read/pass these through plain
  // `reveal.rankRevealed`-style property access (in templates AND script,
  // e.g. PlayView.vue) and always see the unwrapped current value -- a
  // plain object literal of refs only auto-unwraps for template bindings
  // referenced by their own top-level name, not for nested member access
  // like `reveal.flyingPegs`, which would otherwise hand callers the Ref
  // object itself instead of the number/boolean/array it holds.
  return reactive({
    rankRevealed,
    tallyReady,
    ladderReady,
    instant,
    displayedScore,
    flyingPegs,
    flownHoleIndexes,
    boardCleared,
    start,
    cancel,
    showImmediately,
  });
}
