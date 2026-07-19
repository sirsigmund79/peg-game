<!--
  ============================================================================
  components/DotsLeftOnBoard.vue
  ----------------------------------------------------------------------------
  The result screen's "Dots Left On Board" tally: one row per active peg
  color, each showing exactly as many pip slots as that color has surviving
  pegs, plus a "Goal" column alongside showing the puzzle's best-possible
  (par) pips for the same color -- the inline replacement for the old
  standalone "Best possible"/"Your score" numbers (see the now-retired
  ResultStatRow.vue). Filled by composables/useResultReveal.js's fly-to-tally
  reveal -- each "You" pip pops in the instant its peg physically lands here
  (see PlayView.vue's flying-peg overlay). The "Goal" pips have no reveal --
  they're a constant reference value, always shown filled.

  A CSS Grid (not per-row flex) is what keeps the "You" and "Goal" columns --
  and the divider between them -- lined up at the same horizontal position
  for every row, even though each color can have a different number of
  pegs remaining: grid column widths are shared across all rows, where
  independent per-row flex containers would each size to their own content.

  Exposes each color's "You" slot elements so the reveal composable can
  measure real on-screen fly-destination rects -- this component has no idea
  a fly animation exists; it just knows how to report where its own pips are.
  ============================================================================
-->
<script setup>
import { ref } from 'vue';
import { getPegColor } from '../logic/pegColors.js';

const props = defineProps({
  pegsRemaining: { type: Array, required: true }, // per-color -- also how many pip slots each "You" row gets
  par: { type: Array, required: true }, // per-color best-possible pips left, shown statically in the "Goal" column
  displayedScore: { type: Array, required: true }, // per-color, only meaningful while isRevealing
  isRevealing: { type: Boolean, default: false },
});

function filledCount(colorIndex) {
  return props.isRevealing ? (props.displayedScore[colorIndex] ?? 0) : props.pegsRemaining[colorIndex];
}

// pipEls[colorIndex][slotIndex] -> the pip's DOM element, so getSlotRect()
// below can hand back a real on-screen rect for that exact slot.
const pipEls = ref([]);

function setPipRef(colorIndex, slotIndex, el) {
  if (!pipEls.value[colorIndex]) pipEls.value[colorIndex] = [];
  pipEls.value[colorIndex][slotIndex] = el ?? null;
}

/** @returns {DOMRect|null} the on-screen rect of color `colorIndex`'s `slotIndex`-th "You" pip, or null if it doesn't exist (e.g. this tally hasn't mounted yet). */
function getSlotRect(colorIndex, slotIndex) {
  return pipEls.value[colorIndex]?.[slotIndex]?.getBoundingClientRect() ?? null;
}

defineExpose({ getSlotRect });
</script>

<template>
  <div class="dots-left">
    <h3 class="heading">Dots left on the board</h3>

    <span class="header-spacer" aria-hidden="true"></span>
    <span class="col-header">You</span>
    <span class="col-header goal-header">Goal</span>

    <template v-for="(count, colorIndex) in pegsRemaining" :key="colorIndex">
      <span class="row-label">{{ getPegColor(colorIndex).name }}</span>
      <span class="pips">
        <span
          v-for="slotIndex in count"
          :key="slotIndex"
          :ref="(el) => setPipRef(colorIndex, slotIndex - 1, el)"
          class="pip"
          :class="{ filled: slotIndex <= filledCount(colorIndex) }"
          :style="{ background: getPegColor(colorIndex).hex }"
        ></span>
      </span>
      <span class="pips goal-pips">
        <span
          v-for="slotIndex in par[colorIndex]"
          :key="slotIndex"
          class="pip goal"
          :style="{ background: getPegColor(colorIndex).hex }"
        ></span>
      </span>
    </template>
  </div>
</template>

<style scoped>
.dots-left {
  width: 100%;
  /* Left padding is 5px shy of the right/vertical padding on purpose: it's
     tuned (border-width + padding-left = 14px) to land the row labels at
     the exact same x-position as components/RankLadder.vue's rung icons
     (2px border + 12px padding = 14px there too) -- see .row-label below. */
  padding: 12px 16px 12px 11px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  /* Mirrors PlayView.vue's own result-extras-enter/ArchiveDayStrip.vue's
     strip-enter shape -- this appears once the board has finished shrinking
     (see composables/useResultReveal.js), so it gets the same "something
     just arrived" entrance every other result-screen element already uses. */
  animation: tally-enter 0.28s ease-out;
  display: grid;
  /* Every column sizes to its own content (the widest "You"/"Goal" pip row,
     or the longer color name) rather than stretching to fill the card --
     see the file header comment for why this needs to be a shared grid
     rather than independent per-row flex rows. Left-aligned (grid's own
     default `justify-content`) rather than centered, so the whole cluster
     hugs the card's left edge the same way the label/pips already do. */
  grid-template-columns: auto auto auto;
  column-gap: 14px;
  row-gap: 8px;
  align-items: center;
}

@keyframes tally-enter {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dots-left {
    animation: none;
  }
}

.heading {
  grid-column: 1 / -1;
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  color: var(--color-ink-secondary);
}

.col-header {
  /* Overrides the text-align: center inherited from PlayView.vue's
     .play-content -- without this, "You"/"Goal" center inside their
     column's full width instead of starting flush with the pips below. */
  text-align: left;
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-secondary);
}

/* The vertical rule between "You" and "Goal" -- repeated on every row (see
   .goal-pips below) rather than one element spanning every row, so it
   doesn't need to know the row count in advance. */
.goal-header,
.goal-pips {
  border-left: 1px solid rgba(36, 27, 20, 0.15);
  padding-left: 10px;
}

.row-label {
  /* Same override as .col-header above -- otherwise a shorter name like
     "Blue" centers inside the column (sized to the widest name, e.g.
     "Purple") instead of starting flush with "Purple"/"Green". */
  text-align: left;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--color-ink-secondary);
}

.pips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-height: 16px;
}

.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex: none;
  opacity: 0;
}

/* Popped in the instant its peg lands (see PlayView.vue's flying-peg
   overlay, driven by composables/useResultReveal.js). */
.pip.filled {
  opacity: 1;
  animation: pip-pop 0.3s ease-out;
}

/* The "Goal" column has no reveal to wait on -- it's a constant reference
   value, so it's always shown filled with no pop. */
.pip.goal {
  opacity: 1;
}

@keyframes pip-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pip.filled {
    animation: none;
  }
}
</style>
