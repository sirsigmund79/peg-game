<!--
  ============================================================================
  components/ResultFooter.vue
  ----------------------------------------------------------------------------
  "Challenge A Friend" and "Reset", side by side, lifted out of the now-retired
  ResultOverlay.vue. Share always copies a spoiler-safe result line (built
  by the caller via services/viral.js -- see the `shareText` prop, sourced
  from whichever result record components/PlayView.vue's This game/Best
  toggle is currently showing) to the clipboard, THEN also opens the
  device's native share sheet if one is available (see
  services/viral.js's shareResult(), built on the Web Share API) -- so on a
  phone this is a couple of taps to send straight to a contact or messaging
  app, with the clipboard copy as the reliable fallback everywhere else.
  Reset starts the same puzzle over (see composables/useGame.js's reset());
  it lives here rather than in components/Controls.vue once the round is
  over, since PlayView.vue hides Controls at that point in favor of this
  row.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { shareResult } from '../services/viral.js';
import { EVENTS, track } from '../services/analytics.js';

const props = defineProps({
  shareText: { type: String, required: true },
  puzzleNumber: { type: Number, default: null },
  rank: { type: String, required: true },
  won: { type: Boolean, required: true },
  overPar: { type: Number, required: true },
  resultSource: { type: String, required: true }, // 'this' | 'best' -- which toggle view was showing when Share was clicked
});

defineEmits(['reset']);

const shareStatusMessage = ref('');

async function handleShareClick() {
  track(EVENTS.SHARE_CLICKED, {
    puzzle_number: props.puzzleNumber ?? null,
    rank: props.rank,
    won: props.won,
    over_par: props.overPar,
    result_source: props.resultSource,
  });
  const { copied, shared } = await shareResult(props.shareText);
  shareStatusMessage.value = copied ? 'Copied to clipboard!' : "Couldn't copy -- try again, or share a screenshot instead.";
  track(EVENTS.SHARE_COPY_RESULT, { puzzle_number: props.puzzleNumber ?? null, success: copied, shared, result_source: props.resultSource });
}
</script>

<template>
  <footer class="result-footer">
    <div class="result-actions">
      <button type="button" class="share-button" @click="handleShareClick">Challenge A Friend 💬</button>
      <button type="button" class="reset-button" @click="$emit('reset')">Reset</button>
    </div>
    <p v-if="shareStatusMessage" class="share-status" role="status">{{ shareStatusMessage }}</p>
  </footer>
</template>

<style scoped>
.result-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Challenge A Friend and Reset sit side by side on the result screen, styled
   differently from each other so they read as "the main thing" (share,
   solid-filled) vs. "the other option" (reset, outlined) -- the same
   solid/outline pairing components/Controls.vue uses for Reset/Undo during
   play. */
.result-actions {
  display: flex;
  gap: 12px;
}

.share-button,
.reset-button {
  flex: 1;
  min-height: 52px;
  padding: 8px 20px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 1rem;
  border-width: var(--control-border-width);
  border-style: solid;
  border-radius: 14px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

/* Matches components/Controls.vue's ".control-button.solid" property-for-
   property, so this reads as the same "primary" control language. */
.share-button {
  color: var(--color-card-bg);
  background: var(--color-peg);
  border-color: var(--color-peg);
  box-shadow: var(--frame-shadow-card);
}

/* Matches components/Controls.vue's ".control-button.outline" -- the
   "secondary" control language. */
.reset-button {
  color: var(--color-accent);
  background: transparent;
  border-color: var(--color-accent);
}

/* See components/Controls.vue for why this is gated on (hover: hover) --
   otherwise a tap leaves the button stuck looking pressed on touch. */
@media (hover: hover) {
  .share-button:hover {
    background: var(--color-ink);
    border-color: var(--color-ink);
  }

  .reset-button:hover {
    background: var(--color-accent);
    color: var(--color-card-bg);
  }
}

.share-button:focus-visible,
.reset-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.share-status {
  margin: 0;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--color-ink-dim);
}
</style>
