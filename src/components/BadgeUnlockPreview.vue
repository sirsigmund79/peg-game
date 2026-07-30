<!--
  ============================================================================
  components/BadgeUnlockPreview.vue
  ----------------------------------------------------------------------------
  Dev-only (see PlayView.vue's `isDevBuild` gate, and the `badgePreview` key
  in composables/useDevPanels.js): a chip per badge that fires its unlock card
  into the live result screen on demand.

  The point is that a badge unlock is otherwise almost impossible to look at
  -- it happens once, on a threshold you can't hit to order, and then never
  again on that device. This plays the real BadgeUnlockCard.vue, in its real
  slot on the real result screen, with its real entrance animation; PlayView
  keeps previews in their own list so nothing here can be mistaken for (or
  interfere with) a badge the player actually earned.

  Clicking the same chip twice stacks a second copy rather than replacing the
  first -- that's what makes the entrance animation replayable, and it doubles
  as the way to see how a multi-badge finish stacks up.

  Plain/utilitarian styling, matching components/DevPanelToggles.vue.
  ============================================================================
-->
<script setup>
import { BADGE_DEFINITIONS } from '../logic/badges.js';

defineProps({
  // How many preview cards are currently on screen -- only drives the Clear
  // chip's disabled state.
  count: { type: Number, default: 0 },
});

const emit = defineEmits(['preview', 'clear']);
</script>

<template>
  <div class="badge-preview-dev">
    <p class="dev-label">DEV MODE -- preview a badge unlock (not shown in production build)</p>

    <div class="dev-chips">
      <button
        v-for="badge in BADGE_DEFINITIONS"
        :key="badge.id"
        type="button"
        class="dev-chip"
        @click="emit('preview', badge)"
      >
        {{ badge.icon }} {{ badge.name }}
      </button>
      <button type="button" class="dev-chip clear" :disabled="count === 0" @click="emit('clear')">
        Clear ({{ count }})
      </button>
    </div>
  </div>
</template>

<style scoped>
.badge-preview-dev {
  max-width: 460px;
  margin: 12px auto 0;
}

.dev-label {
  margin: 0 0 8px;
  font-family: monospace;
  font-size: 0.66rem;
  font-weight: bold;
  color: #b23b3b;
  text-align: center;
}

.dev-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.dev-chip {
  font-family: monospace;
  font-size: 0.68rem;
  color: #fff;
  background: #6b6b6b;
  border: none;
  border-radius: 999px;
  padding: 4px 9px;
  cursor: pointer;
  opacity: 0.85;
}

.dev-chip:hover {
  opacity: 1;
}

.dev-chip.clear {
  background: #3b5fb2;
}

.dev-chip:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
