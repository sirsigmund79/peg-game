<!--
  ============================================================================
  components/SoundToggleButton.vue
  ----------------------------------------------------------------------------
  A small speaker-icon button that mutes/unmutes every synthesized sound
  (see fx/sound.js's audioState/toggleMuted) -- a slash is drawn across the
  speaker glyph while muted. Lives in App.vue's header so it's reachable
  from every page, not just mid-game.
  ============================================================================
-->
<script setup>
import { audioState, toggleMuted } from '../fx/sound.js';
</script>

<template>
  <button
    type="button"
    class="sound-toggle"
    :aria-pressed="audioState.muted"
    :aria-label="audioState.muted ? 'Unmute sound' : 'Mute sound'"
    :title="audioState.muted ? 'Unmute sound' : 'Mute sound'"
    @click="toggleMuted()"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <template v-if="!audioState.muted">
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </template>
      <line v-else x1="23" y1="1" x2="1" y2="23" />
    </svg>
  </button>
</template>

<style scoped>
.sound-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid var(--color-header-text-dim);
  background: transparent;
  color: var(--color-header-text-dim);
  cursor: pointer;
}

@media (hover: hover) {
  .sound-toggle:hover {
    color: var(--color-header-text);
    border-color: var(--color-header-text);
  }
}

.sound-toggle:focus-visible {
  outline: 2px solid var(--color-header-text);
  outline-offset: 2px;
}
</style>
