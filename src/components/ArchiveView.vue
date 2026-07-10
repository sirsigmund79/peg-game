<!--
  ============================================================================
  components/ArchiveView.vue
  ----------------------------------------------------------------------------
  Every past daily puzzle, newest first, grouped by month -- pick one to
  play it. If this device has already finished a given day, its rank badge
  (the same GENIUS / Purty smart / ... wording as the in-game result
  screen, see logic/rules.js's getRankForOverPar()) shows instead of a
  bare "Play" button, using logic/history.js's locally-recorded results.

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
import { EVENTS, track } from '../services/analytics.js';
import PuzzleGlyph from './PuzzleGlyph.vue';

const { navigate } = useRouter();
const todayNumber = getTodayPuzzleNumber();

// Beta cap: the full archive would otherwise go back to puzzle #0. Keep it
// to a short, recent window for now -- see this component's other callers
// if this ever needs to grow back into a real full history. Sized to 50
// (was 20) so the whole backfilled history since the epoch (see
// logic/daily.js) fits, with room to spare as more real days pass.
const ARCHIVE_WINDOW_DAYS = 50;
const oldestPuzzleNumber = Math.max(0, todayNumber - (ARCHIVE_WINDOW_DAYS - 1));

// Read once rather than per-row -- logic/history.js's getResultForPuzzle()
// would otherwise re-read and re-parse the whole saved history from
// localStorage hundreds of times over for a list this long.
const history = getHistory();

/** Every day from today back to puzzle #0, bucketed by calendar month for a scannable list. */
const monthGroups = computed(() => {
  const byMonth = new Map(); // "YYYY-MM" -> { label, entries }

  for (let puzzleNumber = todayNumber; puzzleNumber >= oldestPuzzleNumber; puzzleNumber--) {
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
      result: savedResult ? { ...savedResult, ...getRankForOverPar(savedResult.overPar) } : null,
    });
  }

  return [...byMonth.values()];
});

function playPuzzle(puzzleNumber) {
  track(EVENTS.ARCHIVE_PUZZLE_SELECTED, {
    puzzle_number: puzzleNumber,
    days_ago: todayNumber - puzzleNumber,
    already_played: Boolean(history[puzzleNumber]),
    is_today: puzzleNumber === todayNumber,
  });
  navigate(`/play/${puzzleNumber}`);
}
</script>

<template>
  <div class="archive-view">
    <p class="archive-intro">The last {{ ARCHIVE_WINDOW_DAYS }} days of puzzles. Pick a day to play or replay it.</p>

    <section v-for="group in monthGroups" :key="group.label" class="month-group">
      <h2 class="month-label">{{ group.label }}</h2>
      <ul class="entry-list">
        <li v-for="entry in group.entries" :key="entry.puzzleNumber">
          <button
            type="button"
            class="entry"
            :class="{ today: entry.isToday, played: entry.result }"
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
            <span v-else class="entry-play">Play</span>
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
