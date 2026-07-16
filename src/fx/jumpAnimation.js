// ============================================================================
// fx/jumpAnimation.js
// ----------------------------------------------------------------------------
// The peg-jump arc tween: a single source of truth shared by the real board
// (components/Board.vue) and the How to Play modal's demo boards
// (components/HowToPlayModal.vue), so the tutorial's demo jumps use the
// EXACT same duration/easing/arc height as real gameplay instead of a
// hand-tuned approximation that can quietly drift out of sync with it.
//
// This is "juice" (feel-good polish, not a game rule), which is why it lives
// in /fx alongside haptics.js and sound.js rather than in /logic.
// ============================================================================

export const JUMP_DURATION_MS = 320;
export const ARC_HEIGHT_PERCENT = 7; // how high (in board %) the peg lifts mid-flight

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Runs one RAF-driven arc tween from `fromPos` to `toPos` (each an {x, y} in
 * 0-100 board-percent space). Calls `onFrame({ leftPercent, topPercent,
 * scale })` every frame and `onDone()` once, at the end.
 *
 * @param {{x:number,y:number}} fromPos
 * @param {{x:number,y:number}} toPos
 * @param {number} [duration] - ms
 * @param {number} [arcHeight] - board-percent
 * @param {(frame: {leftPercent:number, topPercent:number, scale:number}) => void} onFrame
 * @param {() => void} [onDone]
 * @returns {() => void} cancel -- stops the tween mid-flight; `onDone` is NOT called.
 */
export function animateArc({ fromPos, toPos, duration = JUMP_DURATION_MS, arcHeight = ARC_HEIGHT_PERCENT, onFrame, onDone }) {
  let rafId = null;
  const startTime = performance.now();

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = easeInOutQuad(t);
    const lift = Math.sin(eased * Math.PI); // 0 at both ends, peaks mid-flight

    onFrame({
      leftPercent: fromPos.x + (toPos.x - fromPos.x) * eased,
      topPercent: fromPos.y + (toPos.y - fromPos.y) * eased - lift * arcHeight,
      // A subtle grow-then-shrink, echoing the "lifted toward the player"
      // language used for peg selection -- the peg reads as briefly closer
      // to the viewer at the peak of its arc, not just sliding sideways.
      scale: 1 + lift * 0.22,
    });

    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = null;
      onDone?.();
    }
  }
  rafId = requestAnimationFrame(step);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}
