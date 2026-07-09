<!--
  ============================================================================
  components/ArchiveView.vue
  ----------------------------------------------------------------------------
  Every daily puzzle, newest first, grouped by month -- pick one to play
  it. If this device has already finished a given day, its rank badge
  (the same GENIUS / Purty smart / ... wording as the in-game result
  screen, see logic/rules.js's getRankForOverPar()) shows instead of a
  bare "Play" button, using logic/history.js's locally-recorded results.

  Also includes a look-ahead window of upcoming puzzles past today (see
  ARCHIVE_FUTURE_WINDOW_DAYS below) -- with the epoch this recent, the
  purely-historical window is still almost empty, and there's no lock
  keeping a player from opening "#/play/<future number>" directly anyway
  (see logic/daily.js), so showing them here just makes that reachable
  from the UI instead of only by guessing a URL.

  Navigating to a puzzle just changes the URL to "#/play/<number>" (see
  composables/useRouter.js) -- components/PlayView.vue does the actual
  loading when it sees that.
  ============================================================================
-->
<script setup>
import { computed } from 'vue';
import { getTodayPuzzleNumber, getPuzzleForNumber } from '../logic/daily.js';
import { getHistory } from '../logic/history.js';
import { getRankForOverPar } from '../logic/rules.js';
import { useRouter } from '../composables/useRouter.js';
import PuzzleGlyph from './PuzzleGlyph.vue';

const { navigate } = useRouter();
const todayNumber = getTodayPuzzleNumber();

// Beta cap: the full archive would otherwise go back to puzzle #0. Keep it
// to a short, recent window for now -- see this component's other callers
// if this ever needs to grow back into a real full history.
const ARCHIVE_PAST_WINDOW_DAYS = 20;
const oldestPuzzleNumber = Math.max(0, todayNumber - (ARCHIVE_PAST_WINDOW_DAYS - 1));

// How many days past today to also list. 30 would only turn up 3 triangle
// puzzles (they're the rarest shape in the pool, ~8% of it) -- 40 is the
// smallest look-ahead that's guaranteed at least 4 of every shape.
const ARCHIVE_FUTURE_WINDOW_DAYS = 40;
const newestPuzzleNumber = todayNumber + ARCHIVE_FUTURE_WINDOW_DAYS;

// Read once rather than per-row -- logic/history.js's getResultForPuzzle()
// would otherwise re-read and re-parse the whole saved history from
// localStorage hundreds of times over for a list this long.
const history = getHistory();

/** Every day from the future look-ahead back to puzzle #0, bucketed by calendar month for a scannable list. */
const monthGroups = computed(() => {
  const byMonth = new Map(); // "YYYY-MM" -> { label, entries }

  for (let puzzleNumber = newestPuzzleNumber; puzzleNumber >= oldestPuzzleNumber; puzzleNumber--) {
    const puzzle = getPuzzleForNumber(puzzleNumber);
    const monthKey = puzzle.date.slice(0, 7);

    if (!byMonth.has(monthKey)) {
      const [year, month] = monthKey.split('-').map(Number);
      const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      byMonth.set(monthKey, { label, entries: [] });
    }

    const savedResult = history[puzzleNumber];
    byMonth.get(monthKey).entries.push({
      puzzleNumber,
      day: Number(puzzle.date.slice(8, 10)),
      geometry: puzzle.geometry,
      emptyHoles: puzzle.emptyHoles,
      pegCount: puzzle.cellCount - puzzle.emptyHoles.length,
      isToday: puzzleNumber === todayNumber,
      isUpcoming: puzzleNumber > todayNumber,
      result: savedResult ? { ...savedResult, ...getRankForOverPar(savedResult.overPar) } : null,
    });
  }

  return [...byMonth.values()];
});

function playPuzzle(puzzleNumber) {
  navigate(`/play/${puzzleNumber}`);
}
</script>

<template>
  <div class="archive-view">
    <p class="archive-intro">
      The last {{ ARCHIVE_PAST_WINDOW_DAYS }} days, plus the next {{ ARCHIVE_FUTURE_WINDOW_DAYS }} upcoming. Pick a day to
      play or replay it.
    </p>

    <section v-for="group in monthGroups" :key="group.label" class="month-group">
      <h2 class="month-label">{{ group.label }}</h2>
      <ul class="entry-list">
        <li v-for="entry in group.entries" :key="entry.puzzleNumber">
          <button
            type="button"
            class="entry"
            :class="{ today: entry.isToday, played: entry.result, upcoming: entry.isUpcoming }"
            :aria-label="`${entry.isToday ? 'Today' : 'Day ' + entry.day}, ${entry.pegCount} pegs`"
            @click="playPuzzle(entry.puzzleNumber)"
          >
            <span class="entry-day">{{ entry.isToday ? 'Today' : entry.day }}</span>
            <PuzzleGlyph :geometry="entry.geometry" :empty-holes="entry.emptyHoles" class="entry-glyph" />
            <span class="entry-pegs">{{ entry.pegCount }} pegs</span>
            <span v-if="entry.result" class="entry-result">
              <span aria-hidden="true">{{ entry.result.emoji }}</span>
              {{ entry.result.rank }}
            </span>
            <span v-else class="entry-play">{{ entry.isUpcoming ? 'Preview' : 'Play' }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.archive-view {
  flex: 1;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 12px 16px 32px;
}

.archive-intro {
  margin: 0 0 18px;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--color-ink-secondary);
  text-align: center;
}

.month-group {
  margin-bottom: 20px;
}

.month-label {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--color-header-bg);
}

.entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  font-family: var(--font-ui);
  text-align: left;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 12px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
}

.entry.today {
  background: var(--color-header-bg);
}

.entry.upcoming {
  border-style: dashed;
  opacity: 0.8;
}

.entry-day {
  flex: 0 0 52px;
  font-weight: 800;
  font-size: 0.85rem;
  color: var(--color-ink);
}

.entry.today .entry-day {
  color: var(--color-header-text);
}

.entry-glyph {
  color: var(--color-ink-secondary);
}

.entry.today .entry-glyph {
  color: var(--color-header-text-dim);
}

.entry-pegs {
  flex: 1;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--color-ink-secondary);
}

.entry.today .entry-pegs {
  color: var(--color-header-text-dim);
}

.entry-play {
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--color-accent);
}

.entry.today .entry-play {
  color: var(--color-header-text);
}

.entry-result {
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--color-ink-secondary);
}
</style>
