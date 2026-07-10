<!--
  ============================================================================
  components/ArchiveDayStrip.vue
  ----------------------------------------------------------------------------
  The "more obvious archive callout" shown on the result screen, once
  ResultOverlay.vue's own reveal animation has finished (see PlayView.vue's
  `showArchiveStrip`, set from ResultOverlay's `@revealed`). A horizontal
  strip of the last 5 archive days -- always anchored on TODAY's puzzle
  number, not whichever puzzle was just played, so this reads as "the
  archive's most recent days" rather than shifting around when replaying an
  old day -- each shown as a small tile with its own peg-dot glyph (real
  colors, via PuzzleGlyph.vue's `holeColors` prop) instead of a generic icon,
  plus a final "Explore the Archive" tile.

  On a touch device this scrolls/swipes with snap, peeking the next tile,
  the same feel as the NYT Games home screen this is modeled on. On a real
  mouse (see the `(hover: hover) and (pointer: fine)` query below -- the
  same "is this a mouse, not a finger" signal Controls.vue/ResultOverlay.vue
  already use) the tiles instead compress to fit the strip's own width with
  no scrolling at all, since a desktop player has no swipe gesture to
  discover the extra tiles with.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { getTodayPuzzleNumber, getPuzzleForNumber } from '../logic/daily.js';
import { getHistory } from '../logic/history.js';
import { getRankForOverPar } from '../logic/rules.js';
import { useRouter } from '../composables/useRouter.js';
import { EVENTS, track } from '../services/analytics.js';
import PuzzleGlyph from './PuzzleGlyph.vue';

const RECENT_DAY_COUNT = 5;

const { navigate } = useRouter();
const todayNumber = getTodayPuzzleNumber();
const history = getHistory();

const recentDays = computed(() => {
  const days = [];
  for (let offset = 0; offset < RECENT_DAY_COUNT; offset++) {
    const puzzleNumber = todayNumber - offset;
    if (puzzleNumber < 0) break;

    const puzzle = getPuzzleForNumber(puzzleNumber);
    const [year, month, day] = puzzle.date.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' });
    const savedResult = history[puzzleNumber];

    days.push({
      puzzleNumber,
      isToday: offset === 0,
      weekday,
      geometry: puzzle.geometry,
      emptyHoles: puzzle.emptyHoles,
      holeColors: puzzle.holeColors,
      result: savedResult ? getRankForOverPar(savedResult.overPar) : null,
    });
  }
  return days;
});

function playDay(puzzleNumber) {
  track(EVENTS.ARCHIVE_TEASER_DAY_SELECTED, {
    puzzle_number: puzzleNumber,
    days_ago: todayNumber - puzzleNumber,
    already_played: Boolean(history[puzzleNumber]),
  });
  navigate(`/play/${puzzleNumber}`);
}

function goToArchive() {
  track(EVENTS.ARCHIVE_TEASER_EXPLORE_CLICKED, {});
  navigate('/archive');
}
</script>

<template>
  <section class="archive-day-strip">
    <h2 class="strip-heading">Catch up on recent days</h2>
    <div class="strip-track">
      <button
        v-for="entry in recentDays"
        :key="entry.puzzleNumber"
        type="button"
        class="day-tile"
        :class="{ today: entry.isToday }"
        @click="playDay(entry.puzzleNumber)"
      >
        <span class="day-label">{{ entry.isToday ? 'Today' : entry.weekday }}</span>
        <PuzzleGlyph :geometry="entry.geometry" :empty-holes="entry.emptyHoles" :hole-colors="entry.holeColors" :size="40" class="day-glyph" />
        <span v-if="entry.result" class="day-result">
          <span aria-hidden="true">{{ entry.result.emoji }}</span>{{ entry.result.rank }}
        </span>
        <span v-else class="day-play">Play</span>
      </button>

      <button type="button" class="day-tile cta-tile" @click="goToArchive">
        <span class="cta-icon" aria-hidden="true">📅</span>
        <span class="cta-label">Explore the Archive</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.archive-day-strip {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 0 20px 20px;
  /* A one-shot entrance, matching ResultOverlay.vue's modal-enter -- this
     only ever mounts once ResultOverlay's own reveal has finished (see
     PlayView.vue), so it reads as the next distinct "beat" after that. */
  animation: strip-enter 0.35s ease-out;
}

@keyframes strip-enter {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .archive-day-strip {
    animation: none;
  }
}

.strip-heading {
  margin: 0 0 10px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: center;
  color: var(--color-ink-secondary);
}

.strip-track {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 4px;
  /* Hide the scrollbar so this reads as a swipeable strip, not a plain
     scroll region -- the peeking next tile is the "there's more" cue. */
  scrollbar-width: none;
}

.strip-track::-webkit-scrollbar {
  display: none;
}

.day-tile {
  flex: 0 0 94px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px 10px;
  font-family: var(--font-ui);
  text-align: center;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
}

.day-tile.today {
  background: var(--color-header-bg);
}

.day-label {
  font-weight: 800;
  font-size: 0.72rem;
  color: var(--color-ink);
}

.day-tile.today .day-label {
  color: var(--color-header-text);
}

.day-glyph {
  color: var(--color-ink-secondary);
}

.day-tile.today .day-glyph {
  color: var(--color-header-text-dim);
}

.day-result,
.day-play {
  font-weight: 700;
  font-size: 0.68rem;
  color: var(--color-ink-secondary);
}

.day-result {
  display: flex;
  align-items: center;
  gap: 3px;
}

.day-tile.today .day-result,
.day-tile.today .day-play {
  color: var(--color-header-text-dim);
}

.cta-tile {
  background: var(--color-accent);
  justify-content: center;
}

.cta-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.cta-label {
  font-weight: 800;
  font-size: 0.72rem;
  color: var(--color-card-bg);
}

@media (hover: hover) and (pointer: fine) {
  .strip-track {
    overflow-x: visible;
  }

  .day-tile {
    flex: 1 1 0;
    min-width: 0;
  }
}
</style>
