// ============================================================================
// composables/useNextPuzzleCountdown.js
// ----------------------------------------------------------------------------
// A live "HH:MM:SS" countdown to the next daily puzzle's local-midnight
// unlock -- the same cutover logic/daily.js's getTodayPuzzleNumber() uses,
// so it hits zero at exactly the moment "today" flips over. Shared by
// components/NextPuzzleCountdown.vue (in turn used by ArchiveView.vue and
// PlayView.vue) so nowhere has to duplicate the ticking/teardown logic.
// ============================================================================

import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useNextPuzzleCountdown() {
  const nextPuzzleAt = (() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
  })();

  const now = ref(Date.now());
  let tickIntervalId = null;

  onMounted(() => {
    tickIntervalId = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onUnmounted(() => {
    clearInterval(tickIntervalId);
  });

  /** "HH:MM:SS" remaining until tomorrow's puzzle unlocks, floored at zero. */
  const countdown = computed(() => {
    const remainingSeconds = Math.max(0, Math.floor((nextPuzzleAt - now.value) / 1000));
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, '0')).join(':');
  });

  return { countdown };
}
