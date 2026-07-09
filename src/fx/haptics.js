// ============================================================================
// fx/haptics.js
// ----------------------------------------------------------------------------
// A tiny, safe wrapper around the phone's vibration motor. Not every device
// or browser supports navigator.vibrate() (desktop browsers usually don't),
// so every function here checks for support first and just does nothing if
// it's missing -- callers never need to check that themselves.
//
// This is "juice" (feel-good polish, not a game rule), which is why it
// lives in /fx alongside the other optional-feeling touches (animation,
// sound, confetti) rather than in /logic.
// ============================================================================

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** A short, light buzz for a single peg jump. */
export function vibrateJump() {
  if (canVibrate()) {
    navigator.vibrate(15);
  }
}

/** A slightly longer, celebratory pattern for finishing the round. */
export function vibrateRoundOver() {
  if (canVibrate()) {
    navigator.vibrate([20, 40, 20, 40, 60]);
  }
}
