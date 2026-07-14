<!--
  ============================================================================
  components/AdminPuzzlesView.vue
  ----------------------------------------------------------------------------
  The admin puzzle management view: a month-paginated grid of every puzzle
  (past days already shown to players, future days including any
  hand-scheduled overrides -- see logic/scheduledPuzzles.js). Replaces the
  old flat-table AllPuzzlesDevPanel.vue with something scannable at a glance
  and clickable straight into a full edit menu (AdminPuzzleEditPanel.vue) --
  change the layout, re-run the solve/difficulty analysis, edit metadata,
  and save, all without leaving this page.

  Difficulty columns come from logic/puzzleDifficulty.js (a generated
  snapshot -- see scripts/analyze-puzzle-difficulty.js). A day outside that
  snapshot's coverage just shows blank stats; opening it in the edit panel
  and clicking "Re-run solve + difficulty" computes fresh numbers live.

  DRAG-AND-DROP: drag one day's card onto another to SWAP their puzzle
  content (both days trade places; nothing about either puzzle's layout
  changes, just which date it appears on) via
  vite-plugins/puzzleAdminServer.js's swap endpoint -- one atomic write, not
  two independent saves. Each day's PUZZLE_DIFFICULTY record (if any) trades
  along with its content -- see puzzleAdminResolve.js's
  buildSwappedDifficultyRecords -- so the difficulty badge always describes
  the puzzle actually shown, not whichever one used to live on that date.
  Restricted to today/future days only: a past day's puzzle content is locked
  once it's been played, so it can't be dragged (source OR target) -- see the
  isPast checks below.

  IMPORTANT: only ever rendered inside DevToolsView.vue, which App.vue only
  routes to when `import.meta.env.DEV` is true -- never ships to players.

  Chrome is its own dark "field notebook" skin, distinct from the Moose
  theme players see (see AdminPuzzleEditPanel.vue's header for the same
  note) -- deliberately not restyled to match the actual game.
  ============================================================================
-->
<script setup>
import { ref, reactive, computed } from 'vue';
import { getTodayPuzzleNumber, getPuzzleForNumber, getPuzzleNumberForDate } from '../logic/daily.js';
import { SCHEDULED_PUZZLES } from '../logic/scheduledPuzzles.js';
import { PUZZLE_DIFFICULTY } from '../logic/puzzleDifficulty.js';
import { resolvePuzzleForAdmin, buildScheduledEntryPayload, buildSwappedDifficultyRecords } from '../logic/puzzleAdminResolve.js';
import PuzzleGlyph from './PuzzleGlyph.vue';
import AdminPuzzleEditPanel from './AdminPuzzleEditPanel.vue';

const todayNumber = getTodayPuzzleNumber();
const today = new Date();
const cursorYear = ref(today.getFullYear());
const cursorMonth = ref(today.getMonth()); // 0-indexed

const difficultyByPuzzleNumber = new Map(PUZZLE_DIFFICULTY.map((record) => [record.puzzleNumber, record]));

const BUCKET_CLASS = {
  Easy: 'bucket-easy',
  Medium: 'bucket-medium',
  Genius: 'bucket-genius',
  Unknown: 'bucket-unknown',
};

const monthLabel = computed(() =>
  new Date(cursorYear.value, cursorMonth.value, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
);

function goToPrevMonth() {
  const target = new Date(cursorYear.value, cursorMonth.value - 1, 1);
  cursorYear.value = target.getFullYear();
  cursorMonth.value = target.getMonth();
}
function goToNextMonth() {
  const target = new Date(cursorYear.value, cursorMonth.value + 1, 1);
  cursorYear.value = target.getFullYear();
  cursorMonth.value = target.getMonth();
}
function goToCurrentMonth() {
  cursorYear.value = today.getFullYear();
  cursorMonth.value = today.getMonth();
}

/** Every day in the currently-viewed calendar month, joined with its difficulty record if one exists. */
const days = computed(() => {
  const firstOfMonth = new Date(cursorYear.value, cursorMonth.value, 1);
  const lastOfMonth = new Date(cursorYear.value, cursorMonth.value + 1, 0);
  const startPuzzleNumber = Math.max(0, getPuzzleNumberForDate(firstOfMonth));
  const endPuzzleNumber = getPuzzleNumberForDate(lastOfMonth);

  const list = [];
  for (let puzzleNumber = startPuzzleNumber; puzzleNumber <= endPuzzleNumber; puzzleNumber++) {
    const puzzle = getPuzzleForNumber(puzzleNumber);
    const difficulty = difficultyByPuzzleNumber.get(puzzleNumber) ?? null;

    list.push({
      puzzleNumber,
      date: puzzle.date,
      dayOfMonth: Number(puzzle.date.slice(8, 10)),
      boardName: puzzle.boardName,
      geometry: puzzle.geometry,
      emptyHoles: puzzle.emptyHoles,
      holeColors: puzzle.holeColors,
      pegCount: puzzle.cellCount - puzzle.emptyHoles.length,
      isToday: puzzleNumber === todayNumber,
      isPast: puzzleNumber < todayNumber,
      isScheduled: Boolean(SCHEDULED_PUZZLES[puzzle.date]),
      difficulty,
    });
  }
  return list;
});

const selectedPuzzleNumber = ref(null);
function openEditPanel(puzzleNumber) {
  selectedPuzzleNumber.value = puzzleNumber;
}
function closeEditPanel() {
  selectedPuzzleNumber.value = null;
}

// --- Drag-and-drop swap (today/future only -- see file header) -----------
const draggedPuzzleNumber = ref(null);
const dragOverPuzzleNumber = ref(null);
const swap = reactive({ status: 'idle', errorMessage: null }); // 'idle' | 'swapping' | 'error'

function handleDragStart(day) {
  if (day.isPast) return;
  draggedPuzzleNumber.value = day.puzzleNumber;
}
function handleDragOver(day) {
  if (day.isPast || draggedPuzzleNumber.value === null || draggedPuzzleNumber.value === day.puzzleNumber) return;
  dragOverPuzzleNumber.value = day.puzzleNumber;
}
function handleDragLeave(day) {
  if (dragOverPuzzleNumber.value === day.puzzleNumber) dragOverPuzzleNumber.value = null;
}
function handleDragEnd() {
  draggedPuzzleNumber.value = null;
  dragOverPuzzleNumber.value = null;
}

/** Swaps two days' puzzle content (and their difficulty records) in one atomic write -- neither puzzle's layout changes, just which date it appears on. */
async function handleDrop(day) {
  const sourcePuzzleNumber = draggedPuzzleNumber.value;
  dragOverPuzzleNumber.value = null;
  draggedPuzzleNumber.value = null;
  if (sourcePuzzleNumber === null || day.isPast || sourcePuzzleNumber === day.puzzleNumber) return;

  swap.status = 'swapping';
  swap.errorMessage = null;
  try {
    const source = resolvePuzzleForAdmin(sourcePuzzleNumber);
    const target = resolvePuzzleForAdmin(day.puzzleNumber);
    const entries = [
      buildScheduledEntryPayload(target.date, source), // target's date now shows source's content
      buildScheduledEntryPayload(source.date, target), // source's date now shows target's content
    ];
    // Difficulty numbers belong to the content, not the day -- trade the two
    // days' PUZZLE_DIFFICULTY records along with it (see puzzleAdminResolve.js).
    const difficultyEntries = buildSwappedDifficultyRecords(
      { puzzleNumber: sourcePuzzleNumber, date: source.date, record: difficultyByPuzzleNumber.get(sourcePuzzleNumber) ?? null },
      { puzzleNumber: day.puzzleNumber, date: target.date, record: difficultyByPuzzleNumber.get(day.puzzleNumber) ?? null }
    );

    const response = await fetch('/__admin/swap-scheduled-puzzles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries, difficultyEntries }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `Swap failed (${response.status})`);

    swap.status = 'idle';
    // scheduledPuzzles.js changed -- Vite's dev-server file watcher will
    // trigger a full page reload on its own (see puzzleAdminServer.js doc),
    // so there's no stale in-memory puzzleCache/PUZZLE_DIFFICULTY to fix up here.
  } catch (error) {
    swap.status = 'error';
    swap.errorMessage = error.message;
  }
}

function formatBestPossible(bestPossible) {
  return bestPossible === null || bestPossible === undefined ? '–' : String(bestPossible);
}

function flagTitle(difficulty) {
  const parts = [];
  if (difficulty.mismatch) parts.push(difficulty.mismatch);
  for (const failure of difficulty.acceptanceFailures ?? []) parts.push(`${failure.check}: ${failure.detail}`);
  return parts.join('\n');
}
</script>

<template>
  <div class="admin-puzzles-view">
    <p class="dev-label">dev &middot; puzzle admin &middot; not built for production</p>

    <div class="month-nav">
      <button type="button" class="nav-button" @click="goToPrevMonth">&larr;</button>
      <h2>{{ monthLabel }}</h2>
      <button type="button" class="nav-button" @click="goToNextMonth">&rarr;</button>
      <button type="button" class="nav-button today-button" @click="goToCurrentMonth">today</button>
    </div>

    <p class="drag-hint">drag today/future onto another to swap puzzle content — past days locked</p>
    <p v-if="swap.status === 'swapping'" class="status-message">swapping…</p>
    <p v-if="swap.status === 'error'" class="status-message error">{{ swap.errorMessage }}</p>

    <div class="day-grid">
      <div
        v-for="day in days"
        :key="day.puzzleNumber"
        class="day-card"
        :class="{
          today: day.isToday,
          past: day.isPast,
          scheduled: day.isScheduled,
          draggable: !day.isPast,
          dragging: draggedPuzzleNumber === day.puzzleNumber,
          'drag-over': dragOverPuzzleNumber === day.puzzleNumber,
        }"
        :draggable="!day.isPast"
        @click="openEditPanel(day.puzzleNumber)"
        @dragstart="handleDragStart(day)"
        @dragover.prevent="handleDragOver(day)"
        @dragleave="handleDragLeave(day)"
        @drop="handleDrop(day)"
        @dragend="handleDragEnd"
      >
        <div class="day-card-header">
          <span class="day-number">{{ day.dayOfMonth }}</span>
          <span class="puzzle-number">№{{ day.puzzleNumber }}</span>
        </div>

        <PuzzleGlyph :geometry="day.geometry" :empty-holes="day.emptyHoles" :hole-colors="day.holeColors" :size="48" class="glyph" />

        <div class="day-card-name">
          {{ day.boardName }}
          <span class="entry-tag" :class="{ muted: !day.isScheduled }">{{ day.isScheduled ? 'scheduled' : 'pool' }}</span>
        </div>

        <div class="day-card-stats">
          <span>{{ day.pegCount }}p</span>
          <span v-if="day.difficulty">best {{ formatBestPossible(day.difficulty.bestPossible) }}</span>
        </div>

        <div class="day-card-footer">
          <span v-if="day.difficulty" class="bucket-tag" :class="BUCKET_CLASS[day.difficulty.difficultyBucket]">
            {{ day.difficulty.difficultyBucket }}
          </span>
          <span v-else class="bucket-tag bucket-unknown">–</span>
          <span v-if="day.difficulty && flagTitle(day.difficulty)" class="flag-mark" :title="flagTitle(day.difficulty)">!</span>
        </div>
      </div>
    </div>

    <AdminPuzzleEditPanel v-if="selectedPuzzleNumber !== null" :puzzle-number="selectedPuzzleNumber" @close="closeEditPanel" />
  </div>
</template>

<style scoped>
.admin-puzzles-view {
  max-width: 100%;
  margin: 24px auto 0;
  padding: 16px 18px;
  background: #191410;
  color: #e8ddc9;
  border: 1px solid #3a3024;
  border-radius: 3px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 0.82rem;
}

.dev-label {
  margin: 0 0 14px;
  color: #6e6250;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.month-nav h2 {
  margin: 0;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-size: 1.15rem;
  min-width: 170px;
  text-align: center;
  color: #e8ddc9;
}

.nav-button {
  padding: 6px 12px;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-weight: 600;
  font-size: 0.75rem;
  border-radius: 2px;
  border: 1px solid #4a4030;
  background: transparent;
  color: #e8ddc9;
  cursor: pointer;
}

.nav-button:hover {
  border-color: #a2937a;
}

.today-button {
  margin-left: auto;
  text-transform: lowercase;
  color: #cfae74;
  border-color: #4a4030;
}

.drag-hint {
  margin: 0 0 10px;
  color: #6e6250;
  font-size: 0.66rem;
  font-style: italic;
}

.status-message {
  font-size: 0.72rem;
  color: #a2937a;
  margin: 0 0 10px;
}

.status-message.error {
  color: #c1685a;
}

.day-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.day-card {
  background: #211a13;
  border: 1px solid #3a3024;
  border-radius: 2px;
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.day-card:hover {
  border-color: #a2937a;
}

.day-card.today {
  border-color: #b3833f;
}

.day-card.past {
  opacity: 0.8;
}

.day-card.scheduled {
  background: #1a2119;
}

.day-card.draggable {
  cursor: grab;
}

.day-card.dragging {
  opacity: 0.4;
}

.day-card.drag-over {
  border-color: #b3833f;
  border-style: dashed;
  background: #2e2515;
}

.day-card-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.66rem;
  color: #6e6250;
}

.day-number {
  font-weight: 700;
  color: #e8ddc9;
}

.glyph {
  margin: 2px 0;
}

.day-card-name {
  font-size: 0.72rem;
  font-weight: 700;
}

.entry-tag {
  display: block;
  font-size: 0.6rem;
  color: #8fbf9e;
  font-weight: 400;
  letter-spacing: 0.02em;
}

.entry-tag.muted {
  color: #6e6250;
}

.day-card-stats {
  display: flex;
  gap: 8px;
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 0.66rem;
  color: #a2937a;
}

.day-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bucket-tag {
  padding: 1px 6px;
  border: 1px solid currentColor;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.bucket-tag.bucket-easy {
  color: #8fbf9e;
}

.bucket-tag.bucket-medium {
  color: #cfae74;
}

.bucket-tag.bucket-genius {
  color: #c1685a;
}

.bucket-tag.bucket-unknown {
  color: #6e6250;
}

.flag-mark {
  color: #c1685a;
  font-weight: 800;
  font-style: normal;
  cursor: help;
  border: 1px solid currentColor;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  border-radius: 50%;
}
</style>
