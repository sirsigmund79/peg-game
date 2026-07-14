// ============================================================================
// fx/sound.js
// ----------------------------------------------------------------------------
// The game's one remaining sound: a synthesized round-over chime, played
// whenever a round ENDS (win or not). It's built on the fly with the Web
// Audio API -- there's no audio file to load.
//
// This is "juice" (feel-good polish, not a game rule), which is why it
// lives in /fx alongside haptics.js rather than in /logic. Like
// haptics.js, it checks for browser support first and quietly does
// nothing if it's missing.
// ============================================================================

let audioContext = null;

/** Lazily creates the AudioContext on first use -- browsers refuse to start one before a user gesture, and the first sound is always triggered by a tap. */
function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

// A clean major-triad arpeggio (root, third, fifth, octave).
const ROUND_OVER_CHIME_NOTES = [440, 550, 660, 880];
const ROUND_OVER_CHIME_NOTE_GAP = 0.08; // seconds between each note's start
const ROUND_OVER_CHIME_NOTE_LENGTH = 0.3; // seconds each note rings for

/**
 * Plays the round-over chime. `startDelay` (seconds) schedules it to begin
 * that far in the future on the audio clock.
 *
 * @param {number} [startDelay]
 */
export function playRoundOverChime(startDelay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime + startDelay;
  ROUND_OVER_CHIME_NOTES.forEach((freq, index) => {
    const noteStart = now + index * ROUND_OVER_CHIME_NOTE_GAP;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.2, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + ROUND_OVER_CHIME_NOTE_LENGTH);

    osc.connect(gain).connect(ctx.destination);
    osc.start(noteStart);
    osc.stop(noteStart + ROUND_OVER_CHIME_NOTE_LENGTH);
  });
}
