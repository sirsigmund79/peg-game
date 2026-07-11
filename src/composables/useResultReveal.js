// ============================================================================
// composables/useResultReveal.js
// ----------------------------------------------------------------------------
// The one-shot "something just happened" reveal that plays once a round
// finishes: the result area scrolls into view, then (unless reduced motion
// is on) the surviving pegs are walked one at a time -- top-left down to the
// bottom row -- each briefly pulsing while its color's score count ticks up,
// and only once every peg has been walked does the rank itself pop in.
//
// This only ever plays for the freshly-finished round ("This game"). It is
// NOT replayed when the result screen's This game/Best toggle switches (see
// components/PlayView.vue) -- if the player touches the toggle before the
// walk finishes on its own, `finishNow()` jumps straight to the fully-
// revealed state instead, so the toggle's swap always reads as instant.
//
// Extracted out of the now-retired ResultOverlay.vue so components/Board.vue
// can be the one component that owns rendering the board itself (see its
// `pulsingIndex` prop, which this composable's `pulsingHoleIndex` drives).
// ============================================================================

import { onBeforeUnmount, reactive, ref } from 'vue';
import { computeDisplayPositions } from '../logic/boardLayout.js';
import { getColorAt } from '../logic/rules.js';

const PEG_PULSE_STEP_MS = 300;

export function useResultReveal() {
  const rankRevealed = ref(false);
  const displayedScore = ref([]); // per color; null == not yet revealed, shown blank
  const scoreBumpKeys = ref([]); // bumped per-color to force the count-pop animation to replay
  const pulsingHoleIndex = ref(-1);

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let pulseTimeoutId = null;
  let lastPegsRemaining = null;
  // Bumped by cancel()/start() to invalidate any in-flight reveal. Clearing
  // `pulseTimeoutId` alone only stops the peg-walk phase -- it can't reach
  // into a still-pending waitForScrollSettle() call (that has its own
  // internal timer/listener), so a reveal cancelled during that earlier
  // phase would otherwise resume once the scroll settles and finish minutes
  // later, mutating state and resolving `start()` for a round that's no
  // longer current. Every await point below re-checks this before touching
  // any state.
  let generation = 0;

  function stopPulses() {
    if (pulseTimeoutId !== null) {
      clearTimeout(pulseTimeoutId);
      pulseTimeoutId = null;
    }
  }

  /** Aborts an in-flight reveal (e.g. the player hit Reset mid-walk). The abandoned `start()` call's promise then never resolves, so anything chained off it (like PlayView.vue bringing in ArchiveDayStrip) correctly never fires for the abandoned round. */
  function cancel() {
    generation += 1;
    stopPulses();
  }

  /** The result area can land off the bottom of a short screen -- bring it into view before anything animates, rather than having the reveal play out while the page is still scrolling underneath it. */
  function waitForScrollSettle(scrollTargetEl) {
    return new Promise((resolve) => {
      if (prefersReducedMotion || !scrollTargetEl) {
        scrollTargetEl?.scrollIntoView({ behavior: 'auto', block: 'start' });
        resolve();
        return;
      }
      let settleTimeoutId = null;
      const finish = () => {
        window.removeEventListener('scrollend', finish);
        clearTimeout(settleTimeoutId);
        resolve();
      };
      window.addEventListener('scrollend', finish, { once: true });
      // Fallback for browsers without 'scrollend' (e.g. Safari): assume the
      // smooth scroll has settled after a fixed delay.
      settleTimeoutId = setTimeout(finish, 600);
      scrollTargetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function runPegPulses(sequence, stepIndex) {
    return new Promise((resolve) => {
      function step(index) {
        if (index >= sequence.length) {
          pulsingHoleIndex.value = -1;
          resolve();
          return;
        }
        const entry = sequence[index];
        pulsingHoleIndex.value = entry.index;
        displayedScore.value[entry.color] = (displayedScore.value[entry.color] ?? 0) + 1;
        scoreBumpKeys.value[entry.color] += 1;
        pulseTimeoutId = setTimeout(() => step(index + 1), PEG_PULSE_STEP_MS);
      }
      step(stepIndex);
    });
  }

  /**
   * Kicks off the reveal for a just-finished round. Call this exactly once
   * per round (never on a This game/Best toggle switch -- see finishNow()).
   *
   * @param {object} params
   * @param {HTMLElement|null} params.scrollTargetEl - scrolled into view before the reveal starts
   * @param {object} params.geometry - the puzzle's board geometry (see logic/geometry.js)
   * @param {bigint[]} params.masks - the round's final masks, one per color
   * @param {number[]} params.par - the puzzle's per-color par, used to size the score arrays
   * @param {number[]} params.pegsRemaining - final per-color peg counts (used directly under reduced motion, or once finishNow() is called)
   */
  async function start({ scrollTargetEl, geometry, masks, par, pegsRemaining }) {
    cancel();
    const myGeneration = generation;
    lastPegsRemaining = pegsRemaining;
    displayedScore.value = par.map(() => null);
    scoreBumpKeys.value = par.map(() => 0);
    pulsingHoleIndex.value = -1;
    rankRevealed.value = false;

    await waitForScrollSettle(scrollTargetEl);
    if (myGeneration !== generation) return new Promise(() => {}); // abandoned while the scroll was still settling -- never resolve

    if (prefersReducedMotion) {
      displayedScore.value = [...pegsRemaining];
      rankRevealed.value = true;
      return;
    }

    const positions = computeDisplayPositions(geometry);
    const sequence = positions
      .map((position, index) => ({ index, x: position.x, y: position.y, color: getColorAt(masks, index) }))
      .filter((entry) => entry.color !== -1)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    await runPegPulses(sequence, 0);
    if (myGeneration !== generation) return new Promise(() => {}); // abandoned or skipped-to-end mid-walk -- never resolve
    rankRevealed.value = true;
  }

  /** Jumps straight to the fully-revealed state -- used when the player touches the This game/Best toggle before the walk finishes on its own, so the toggle always reads as an instant swap rather than fast-forwarding a still-playing animation. */
  function finishNow() {
    cancel();
    if (lastPegsRemaining) displayedScore.value = [...lastPegsRemaining];
    pulsingHoleIndex.value = -1;
    rankRevealed.value = true;
  }

  /**
   * Shows the fully-revealed state directly, with no reveal ever having
   * played -- used when components/PlayView.vue restores a round that
   * finished in an earlier visit (see logic/roundState.js). Unlike
   * finishNow() (which fast-forwards a walk that's already in flight from a
   * prior start() call), there's no scroll-into-view or peg-walk to skip
   * here; the result screen should simply already look done.
   *
   * @param {number[]} pegsRemaining - final per-color peg counts
   */
  function showImmediately(pegsRemaining) {
    cancel();
    displayedScore.value = [...pegsRemaining];
    pulsingHoleIndex.value = -1;
    rankRevealed.value = true;
  }

  onBeforeUnmount(cancel);

  // Wrapped in reactive() so callers can read/pass these through plain
  // `reveal.rankRevealed`-style property access (in templates AND script,
  // e.g. PlayView.vue) and always see the unwrapped current value -- a
  // plain object literal of refs only auto-unwraps for template bindings
  // referenced by their own top-level name, not for nested member access
  // like `reveal.pulsingHoleIndex`, which would otherwise hand callers the
  // Ref object itself instead of the number/boolean/array it holds.
  return reactive({ rankRevealed, displayedScore, scoreBumpKeys, pulsingHoleIndex, start, cancel, finishNow, showImmediately });
}
