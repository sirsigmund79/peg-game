<!--
  ============================================================================
  components/SoundDevPanel.vue
  ----------------------------------------------------------------------------
  A developer-only tool for tuning the game's synthesized sound effects
  (see fx/sound.js) -- one section per sound, with a slider for every
  tunable parameter, a Test button to hear it immediately, a Save button to
  persist the whole set to localStorage, and per-sound / global Reset
  buttons to revert to the built-in defaults.

  IMPORTANT: this panel only ever renders in a local dev build. App.vue only
  mounts it when `import.meta.env.DEV` is true, which Vite sets to true for
  `npm run dev` and false for `npm run build` -- so this never ships to
  real players. There is no separate "flag" to remember to turn off.

  Sliders bind straight to fx/sound.js's `soundState`, so every change is
  audible the moment you hit Test -- Save just persists whatever's
  currently live to localStorage; nothing here needs its own draft/staging
  copy of the params.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { soundState, playSound, playRoundOverChime, saveSoundParams, resetSoundParams, resetAllSoundParams } from '../fx/sound.js';

const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];

// Every slider's [min, max, step] -- kept here (rather than hardcoded per
// input) so all seven sliders across all five sounds share one definition.
const PARAM_RANGES = {
  frequencyStart: { min: 40, max: 1400, step: 5, unit: 'Hz' },
  frequencyEnd: { min: 40, max: 1400, step: 5, unit: 'Hz' },
  duration: { min: 0.02, max: 0.8, step: 0.01, unit: 's' },
  volume: { min: 0, max: 1, step: 0.01, unit: '' },
  attack: { min: 0.001, max: 0.2, step: 0.001, unit: 's' },
  release: { min: 0.02, max: 0.6, step: 0.01, unit: 's' },
  noiseAmount: { min: 0, max: 1, step: 0.01, unit: '' },
};

const saveStatus = ref('');

function handleSave() {
  saveSoundParams();
  saveStatus.value = 'Saved!';
  setTimeout(() => {
    saveStatus.value = '';
  }, 1500);
}
</script>

<template>
  <div class="sound-panel">
    <p class="dev-label">DEV MODE -- sound tuning (not shown in production build)</p>

    <div v-for="(recipe, name) in soundState" :key="name" class="sound-block">
      <div class="sound-header">
        <strong class="sound-name">{{ name }}</strong>
        <button type="button" class="dev-button" @click="playSound(name)">Test</button>
        <button type="button" class="dev-button" @click="resetSoundParams(name)">Reset</button>
      </div>

      <label class="sound-row">
        <span>type</span>
        <select v-model="recipe.type" class="dev-select">
          <option v-for="wave in WAVEFORMS" :key="wave" :value="wave">{{ wave }}</option>
        </select>
      </label>

      <label v-for="(range, param) in PARAM_RANGES" :key="param" class="sound-row">
        <span>{{ param }}</span>
        <input v-model.number="recipe[param]" type="range" :min="range.min" :max="range.max" :step="range.step" />
        <span class="sound-value">{{ recipe[param] }}{{ range.unit }}</span>
      </label>
    </div>

    <div class="sound-block">
      <div class="sound-header">
        <strong class="sound-name">round-over</strong>
        <button type="button" class="dev-button" @click="playRoundOverChime()">Test</button>
      </div>
      <p class="fixed-note">Fixed 4-note arpeggio chime, not tunable -- see fx/sound.js's playRoundOverChime().</p>
    </div>

    <div class="dev-row">
      <button type="button" class="dev-button" @click="handleSave">Save all</button>
      <button type="button" class="dev-button" @click="resetAllSoundParams">Reset all to default</button>
      <span v-if="saveStatus" class="save-status">{{ saveStatus }}</span>
    </div>
  </div>
</template>

<style scoped>
.sound-panel {
  max-width: 420px;
  margin: 16px auto 0;
  padding: 12px 14px;
  background: #222;
  color: #eee;
  border-radius: 10px;
  font-family: monospace;
  font-size: 0.8rem;
}

.dev-label {
  margin: 0 0 10px;
  color: #ffb27a;
  font-weight: bold;
}

.sound-block {
  padding: 8px 0;
  border-top: 1px solid #444;
}

.sound-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.sound-name {
  flex: 1;
  text-transform: uppercase;
  color: #8ad0ff;
}

.sound-row {
  display: grid;
  grid-template-columns: 90px 1fr 56px;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.sound-value {
  text-align: right;
  color: #aaa;
}

.fixed-note {
  margin: 0;
  color: #999;
  font-style: italic;
}

.dev-select {
  font-family: monospace;
  padding: 2px 4px;
}

.dev-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.dev-button {
  padding: 6px 10px;
  cursor: pointer;
  font-family: monospace;
}

.save-status {
  color: #8aff9e;
}
</style>
