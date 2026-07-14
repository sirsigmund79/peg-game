// ============================================================================
// composables/useReachabilityIndicator.js
// ----------------------------------------------------------------------------
// The opt-in "Genius still reachable" live indicator. Owns the whole
// lifecycle of a workers/reachabilityWorker.js instance: spawns it (only if
// the player has enabled the feature AND the puzzle's board is cheap enough
// to solve live -- see `puzzle.liveSolve`), re-checks it every time the
// board position changes, and respawns it whenever the puzzle/round itself
// changes (a fresh solver for a fresh board).
//
// Kept as its own composable (a sibling to useGame.js, the same way
// useResultReveal.js is) rather than folded into useGame.js, which stays
// focused on pure round state and has no worker/async concerns of its own.
//
// Call this ONCE per component, at setup time (like useResultReveal()) --
// NOT re-created every time components/PlayView.vue swaps in a new puzzle.
// It takes the actual `puzzle`/`game` REFS (the same ones PlayView.vue
// reassigns on a puzzle change) and watches them itself, which is what lets
// a single call site keep working correctly across puzzle changes: Vue's
// onBeforeUnmount can only be registered while a component is actively
// running its setup(), so calling this composable again later from inside a
// watcher (rather than watching from within one long-lived instance) would
// silently fail to register its cleanup hook.
// ============================================================================

import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import { isLiveReachabilityEnabled, setLiveReachabilityEnabled } from '../logic/settings.js';

// The whole round shares one solver instance inside the worker, so this
// budget is cumulative across every check that round, not per-move (see
// workers/reachabilityWorker.js). Kept well under the offline analysis
// tiers elsewhere in the codebase (1,000,000 / 5,000,000) since this has to
// stay fast enough to never be noticeable on a phone -- a starting point to
// validate against real low/mid-tier device timings before shipping, not a
// carefully-tuned final number (see the plan this feature was built from).
const NODE_BUDGET = 250_000;

function sum(numbers) {
  return numbers.reduce((total, value) => total + value, 0);
}

/**
 * @param {import('vue').Ref<object>} puzzleRef - the puzzle currently being played
 * @param {import('vue').Ref<object>} gameRef - the useGame() instance currently active for it
 */
export function useReachabilityIndicator(puzzleRef, gameRef) {
  const enabled = ref(isLiveReachabilityEnabled());
  // Whether THIS puzzle's board is cheap enough to solve live at all --
  // false only for English Cross (see logic/boards.js's `liveSolve`).
  const supported = ref(puzzleRef.value.liveSolve !== false);
  // 'reachable' | 'unreachable' | 'checking' | 'unavailable' | null
  // (null = disabled, unsupported for this board, or torn down)
  const status = ref(null);

  let worker = null;
  let nextRequestId = 0;
  let latestRequestId = -1;
  // Tracks which `game` instance the current worker was spawned for, so the
  // masks watcher below can tell "the board changed because the player
  // moved" apart from "the board changed because a new puzzle loaded".
  let trackedGame = null;

  function requestCheck(masks) {
    if (!worker) return;
    latestRequestId = nextRequestId;
    nextRequestId += 1;
    // `masks` comes from useGame.js's reactive `state`, so it arrives here
    // as a reactive Proxy-wrapped array -- structured clone (what
    // postMessage uses) can't clone a Proxy, so spread it into a genuine
    // plain array first.
    worker.postMessage({ type: 'check', masks: [...masks], requestId: latestRequestId });
  }

  function teardownWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    status.value = null;
  }

  function spawnWorker() {
    teardownWorker();
    const puzzle = puzzleRef.value;
    supported.value = puzzle.liveSolve !== false;
    if (!enabled.value || !supported.value) return;

    const activeWorker = new Worker(new URL('../workers/reachabilityWorker.js', import.meta.url), { type: 'module' });
    worker = activeWorker;

    activeWorker.onmessage = (event) => {
      if (worker !== activeWorker) return; // a stale response from a torn-down/superseded worker
      const message = event.data;
      if (message.requestId !== latestRequestId) return; // an answer for a position we've since moved past
      if (message.type === 'result') {
        status.value = message.reachable ? 'reachable' : 'unreachable';
      } else if (message.type === 'unavailable') {
        status.value = 'unavailable';
      }
      // 'error' -- leave `status` at its last known value rather than
      // surface a worker crash to the player; there's nothing actionable
      // for them to do about it, and the indicator is supplementary.
    };
    activeWorker.onerror = () => {
      if (worker !== activeWorker) return;
      status.value = 'unavailable';
    };

    activeWorker.postMessage({
      type: 'init',
      // `puzzle` is a reactive Proxy (it comes from a Vue ref) -- same
      // structured-clone problem as `masks` in requestCheck above, so build
      // genuine plain move objects rather than posting the Proxy array.
      moves: puzzle.geometry.moves.map((move) => ({ from: move.from, over: move.over, to: move.to })),
      cellCount: puzzle.cellCount,
      colorCount: puzzle.colorCount,
      targetTotal: sum(puzzle.par),
      nodeBudget: NODE_BUDGET,
    });

    // The one check genuinely worth a "checking..." affordance for -- the
    // very first one, before any pegs have been removed, is the most
    // expensive possible query for this round. Every later check (see the
    // watcher below) leaves `status` showing its last confirmed value while
    // the new answer is in flight instead, since by then it should resolve
    // well within a frame.
    status.value = 'checking';
    requestCheck(gameRef.value.state.masks);
  }

  // Fires immediately on mount (spawning the first round's worker), and
  // again both when the player makes a move WITHIN a round (masks change,
  // same `game` instance -- just re-check) and when PlayView.vue swaps in a
  // whole new puzzle (masks change because `game` itself changed -- respawn
  // against the new board instead).
  watch(
    () => gameRef.value.state.masks,
    (masks) => {
      if (gameRef.value !== trackedGame) {
        trackedGame = gameRef.value;
        spawnWorker();
      } else {
        requestCheck(masks);
      }
    },
    { immediate: true }
  );

  /** Turns the feature on/off, persisting the choice for future rounds too. */
  function setEnabled(value) {
    enabled.value = value;
    setLiveReachabilityEnabled(value);
    if (value) {
      spawnWorker();
    } else {
      teardownWorker();
    }
  }

  onBeforeUnmount(teardownWorker);

  return reactive({ supported, enabled, status, setEnabled });
}
