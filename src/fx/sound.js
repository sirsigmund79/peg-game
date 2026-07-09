// ============================================================================
// fx/sound.js
// ----------------------------------------------------------------------------
// Every sound in the game is synthesized on the fly with the Web Audio
// API -- there are no audio files to load. Each sound is a small "recipe"
// (waveform, a pitch sweep, an envelope, and an optional noise-burst layer
// for percussive texture) that gets turned into oscillator + noise nodes
// at play time.
//
// This is "juice" (feel-good polish, not a game rule), which is why it
// lives in /fx alongside haptics.js rather than in /logic. Like
// haptics.js, every function checks for browser support first and quietly
// does nothing if it's missing.
//
// Recipes are mutable at runtime (see soundState below) so components/
// SoundDevPanel.vue can let a developer tweak them live, test them, save
// the changes to localStorage, or revert to these defaults. The one
// exception is the round-over chime (see playRoundOverChime()) -- a fixed
// 4-note arpeggio rather than a tunable single-oscillator recipe.
// ============================================================================

import { reactive } from 'vue';
import { safeGet, safeSet } from '../logic/storage.js';

/**
 * Every sound's tunable parameters:
 *   type           oscillator waveform: 'sine' | 'triangle' | 'square' | 'sawtooth'
 *   frequencyStart Hz the pitch sweep starts at
 *   frequencyEnd   Hz the pitch sweep ends at (a chirp up or down)
 *   duration       total length in seconds
 *   volume         peak loudness, 0-1
 *   attack         seconds to ramp up to peak volume
 *   release        seconds to decay back to silence after the attack
 *   noiseAmount    0-1, how much filtered white noise to layer in for a
 *                  percussive "click"/"buzz" texture alongside the tone
 */
// NOTE: the round-over chime is deliberately not in here -- it's a fixed
// 4-note arpeggio (see playRoundOverChime() below), not a single swept
// tone, so it doesn't fit this one-oscillator recipe shape and isn't
// dev-panel-tunable.
export const DEFAULT_SOUND_PARAMS = {
  select: { type: 'sine', frequencyStart: 520, frequencyEnd: 760, duration: 0.09, volume: 0.35, attack: 0.004, release: 0.08, noiseAmount: 0.04 },
  move: { type: 'triangle', frequencyStart: 320, frequencyEnd: 170, duration: 0.15, volume: 0.45, attack: 0.002, release: 0.13, noiseAmount: 0.22 },
  invalid: { type: 'sawtooth', frequencyStart: 180, frequencyEnd: 110, duration: 0.18, volume: 0.28, attack: 0.001, release: 0.16, noiseAmount: 0.35 },
  undo: { type: 'sine', frequencyStart: 420, frequencyEnd: 260, duration: 0.12, volume: 0.3, attack: 0.004, release: 0.1, noiseAmount: 0.08 },
};

const STORAGE_KEY = 'dot-hop:sound-params';

/** Deep-clones a plain {sound: {param: value}} object -- used so DEFAULT_SOUND_PARAMS itself is never mutated. */
function cloneParams(params) {
  const clone = {};
  for (const [soundName, recipe] of Object.entries(params)) {
    clone[soundName] = { ...recipe };
  }
  return clone;
}

/** Merges saved params over the defaults, so a future sound added to DEFAULT_SOUND_PARAMS always has a value even for players with an old save. */
function loadInitialParams() {
  const saved = safeGet(STORAGE_KEY, null);
  const merged = cloneParams(DEFAULT_SOUND_PARAMS);
  if (saved) {
    for (const soundName of Object.keys(merged)) {
      if (saved[soundName]) Object.assign(merged[soundName], saved[soundName]);
    }
  }
  return merged;
}

// The live, currently-active params for every sound -- reactive so
// SoundDevPanel.vue's sliders can bind straight to it. Every playSound()
// call reads from here, so dragging a slider is instantly audible without
// needing to save first.
export const soundState = reactive(loadInitialParams());

/** Writes the current (possibly just-tweaked) params for every sound to localStorage. */
export function saveSoundParams() {
  safeSet(STORAGE_KEY, soundState);
}

/** Reverts one sound's params to its default, in memory and in storage. */
export function resetSoundParams(name) {
  Object.assign(soundState[name], DEFAULT_SOUND_PARAMS[name]);
  saveSoundParams();
}

/** Reverts every sound's params to its default, in memory and in storage. */
export function resetAllSoundParams() {
  for (const name of Object.keys(soundState)) {
    Object.assign(soundState[name], DEFAULT_SOUND_PARAMS[name]);
  }
  saveSoundParams();
}

// --- muting ---------------------------------------------------------------
// A single on/off switch, separate from the tunable recipes above -- it
// silences every playSound()/playRoundOverChime() call rather than
// changing what they'd sound like. Persisted on its own key so muting
// never disturbs a player's saved sound-tuning.

const MUTED_STORAGE_KEY = 'dot-hop:muted';

export const audioState = reactive({ muted: safeGet(MUTED_STORAGE_KEY, false) });

/** Flips muted on/off and persists the choice. Used by components/SoundToggleButton.vue. */
export function toggleMuted() {
  audioState.muted = !audioState.muted;
  safeSet(MUTED_STORAGE_KEY, audioState.muted);
}

// --- the actual synthesis -----------------------------------------------

let audioContext = null;

/** Lazily creates the AudioContext on first use -- browsers refuse to start one before a user gesture, and the first sound is always triggered by a tap. */
function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

/** A short burst of white noise run through a bandpass filter centered near the tone's pitch, for percussive "click"/"buzz" texture. */
function playNoiseBurst(ctx, destination, { frequencyStart, duration, volume, noiseAmount, now }) {
  if (noiseAmount <= 0) return;
  const bufferLength = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferLength; i++) data[i] = Math.random() * 2 - 1;

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = Math.max(80, frequencyStart);
  filter.Q.value = 0.7;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(volume * noiseAmount, now + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noiseSource.connect(filter).connect(noiseGain).connect(destination);
  noiseSource.start(now);
  noiseSource.stop(now + duration + 0.02);
}

/**
 * Plays a sound by name using its current (possibly dev-panel-tweaked)
 * params, or an explicit params object for live-previewing values that
 * haven't been applied to soundState yet.
 *
 * @param {string} name - a key in DEFAULT_SOUND_PARAMS, e.g. 'select'
 * @param {object} [paramsOverride] - use these params instead of soundState[name]
 */
export function playSound(name, paramsOverride) {
  if (audioState.muted) return;

  const params = paramsOverride ?? soundState[name];
  if (!params) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  const { type, frequencyStart, frequencyEnd, duration, volume, attack, release, noiseAmount } = params;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, frequencyStart), now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), now + duration);

  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0, now);
  toneGain.gain.linearRampToValueAtTime(volume, now + Math.max(0.001, attack));
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.001, attack) + Math.max(0.02, release));

  osc.connect(toneGain).connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.05);

  playNoiseBurst(ctx, masterGain, { frequencyStart, duration, volume, noiseAmount, now });
}

// A clean major-triad arpeggio (root, third, fifth, octave) that plays
// whenever a round ENDS, win or not -- kept as its own fixed function
// rather than a soundState recipe since it's four sequenced notes, not one
// swept tone.
const ROUND_OVER_CHIME_NOTES = [440, 550, 660, 880];
const ROUND_OVER_CHIME_NOTE_GAP = 0.08; // seconds between each note's start
const ROUND_OVER_CHIME_NOTE_LENGTH = 0.3; // seconds each note rings for

/**
 * Plays the round-over chime. `startDelay` (seconds) schedules it to begin
 * that far in the future on the audio clock -- useGame.js uses this to
 * start the chime right as the jump/"move" sound's tone finishes, rather
 * than stacking both sounds on top of each other.
 *
 * @param {number} [startDelay]
 */
export function playRoundOverChime(startDelay = 0) {
  if (audioState.muted) return;

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
