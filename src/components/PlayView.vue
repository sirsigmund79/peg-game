<!--
  ============================================================================
  components/PlayView.vue
  ----------------------------------------------------------------------------
  The actual game screen -- exactly what a player sees, with nothing else
  competing for their attention. Loads a puzzle (today's by default), lets
  them play it, and shows the result once they finish.

  WHICH puzzle it loads comes from the URL (see composables/useRouter.js):
    "#/"             -> today's puzzle
    "#/play/842"     -> puzzle #842 specifically (used by ArchiveView.vue
                        and the dev puzzle-jumper to send a player here)
  ...or, one-shot, from composables/usePendingPuzzle.js if the level editor
  (dev-only, see components/EditorView.vue) just handed off a custom
  design -- see resolvePuzzle() below.

  Once the round ends, this ALSO orchestrates the whole result screen --
  components/Board.vue is deliberately kept as a single, stable sibling in
  `.game-area` the entire time (never unmounted/remounted, never a second
  board rendered alongside it); only its `compact`/`masksOverride` props and
  the elements around it change. Its own `compact` size transition plus the
  existing round-over settle/ripple flourish (see Board.vue) are what make it
  read as "the same board sliding into the result card," not a swap between
  two different boards. See composables/useResultReveal.js for the one-shot
  reveal sequencing (score count-up, rank pop-in), and logic/bestResults.js
  for the "This game" vs "Best" toggle's persisted data.

  The only dev-only thing left on this page is the small "Watch Solve"
  button: unlike the puzzle-archive picker, sound tuner, and level editor
  (all moved to components/DevToolsView.vue), it operates on THIS live
  round's state, so it has to live wherever that state does.
  ============================================================================
-->
<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { getTodaysPuzzle, getPuzzleForNumber } from '../logic/daily.js';
import { useGame } from '../composables/useGame.js';
import { useResultReveal } from '../composables/useResultReveal.js';
import { useRouter } from '../composables/useRouter.js';
import { pendingCustomPuzzle } from '../composables/usePendingPuzzle.js';
import { getRankForOverPar } from '../logic/rules.js';
import { getBestForPuzzle } from '../logic/bestResults.js';
import { buildShareText } from '../services/viral.js';
import { EVENTS, track } from '../services/analytics.js';
import { useGhostOutline } from '../composables/useGhostOutline.js';
import Board from './Board.vue';
import StatBar from './StatBar.vue';
import Controls from './Controls.vue';
import GhostToggle from './GhostToggle.vue';
import ResultHeader from './ResultHeader.vue';
import ResultToggle from './ResultToggle.vue';
import ResultStatRow from './ResultStatRow.vue';
import ResultFooter from './ResultFooter.vue';
import ArchiveDayStrip from './ArchiveDayStrip.vue';
import TemporaryWatchSolveButton from './TemporaryWatchSolveButton.vue';

const isDevBuild = import.meta.env.DEV;

const { route } = useRouter();
const { ghost } = useGhostOutline();

/** Figures out which puzzle to load: a hand-off from the editor, a specific "#/play/N", or today's. */
function resolvePuzzle() {
  if (pendingCustomPuzzle.value) {
    const custom = pendingCustomPuzzle.value;
    pendingCustomPuzzle.value = null;
    return custom;
  }
  const numberSegment = route.segments[1];
  const puzzleNumber = numberSegment !== undefined ? Number.parseInt(numberSegment, 10) : NaN;
  if (Number.isFinite(puzzleNumber)) return getPuzzleForNumber(puzzleNumber);
  return getTodaysPuzzle();
}

/** Analytics-only: where the puzzle useGame() is about to load came from -- mirrors resolvePuzzle()'s own branching. */
function resolveSource() {
  if (pendingCustomPuzzle.value) return 'custom';
  return route.segments[1] !== undefined ? 'link' : 'daily';
}

// `puzzle` and `game` are plain refs (not computed) because loading a new
// puzzle -- whether today's, an archive pick, or a custom design -- always
// needs a brand-new game with an empty undo history, not a recalculation
// of the same one.
const puzzle = ref(resolvePuzzle());
const game = ref(useGame(puzzle.value, { source: resolveSource() }));

/**
 * Fires puzzle_left_incomplete exactly once per round, iff the player made
 * at least one move but the round never finished -- the direct "drop-off"
 * signal docs/ANALYTICS.md's Core Loop Funnel dashboard is built on, rather
 * than only inferring abandonment from a funnel gap.
 */
function reportIncompleteIfNeeded() {
  const currentGame = game.value;
  if (!currentGame || currentGame.roundOver || currentGame.state.incompleteReported) return;
  if (currentGame.state.moveCount === 0) return;
  currentGame.state.incompleteReported = true;
  track(EVENTS.PUZZLE_LEFT_INCOMPLETE, {
    puzzle_number: puzzle.value.puzzleNumber ?? null,
    move_count: currentGame.state.moveCount,
    time_spent_ms: Date.now() - currentGame.state.roundStartedAt,
    repeat_move_count: currentGame.state.repeatMoveCount,
    cumulative_move_count: currentGame.state.cumulativeMoveCount,
    ghost_outline_used: currentGame.state.ghostOutlineUsedThisPuzzle,
  });
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') reportIncompleteIfNeeded();
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', reportIncompleteIfNeeded);
});

/** Puzzle dates are plain "YYYY-MM-DD" local dates (see logic/daily.js) -- format for display without letting the browser reinterpret it in another timezone. */
const formattedDate = computed(() => {
  if (!puzzle.value.date) return null;
  const [year, month, day] = puzzle.value.date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
});

// --- the result screen: shown once the round ends, held back a beat so the
// board's own end-of-round flourish plays before the layout changes -- see
// the roundOver watcher below.

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const RESULT_HOLD_MS = 800;
// Matches Board.vue's own `.board` transition duration for the compact
// (result-card) size -- the archive strip below waits this long before
// appearing so it comes in right as the board finishes shrinking, not
// mid-shrink.
const BOARD_SHRINK_MS = 400;
const showResult = ref(false);
// ArchiveDayStrip.vue (the archive callout below Undo/Reset) comes in as
// soon as the board has shrunk down to its result-card size -- see
// activateResult() below -- rather than waiting on the score count-up/rank
// pop reveal (see composables/useResultReveal.js), which can run for
// several more seconds depending on how many pegs are left. The rank's own
// layout space is reserved from the moment the board shrinks (see
// ResultHeader.vue -- it stays opacity:0 but in-flow until revealed), so
// bringing the archive strip in this early doesn't shift anything out from
// under the still-playing reveal.
const showArchiveStrip = ref(false);
// Bound to `.result-anchor` below, which wraps BOTH `.puzzle-line` (the
// date) and `.result-group` (rank/board/stats) -- so the reveal's
// scroll-into-view (see activateResult() below) and ArchiveDayStrip.vue's
// own supplementary scroll-down (its `keepVisibleEl` prop) both treat the
// date as part of what must stay on screen, not just the rank underneath it.
const resultGroupRef = ref(null);
const reveal = useResultReveal();

// 'this' (the attempt just played) or 'best' (the best-ever result for this
// puzzle day -- see logic/bestResults.js). Always defaults to 'this' the
// moment a round ends, even on a replay that beat -- or fell short of -- an
// earlier best.
const viewMode = ref('this');

let resultHoldTimeoutId = null;
let archiveStripTimeoutId = null;

function clearResultHold() {
  if (resultHoldTimeoutId !== null) {
    clearTimeout(resultHoldTimeoutId);
    resultHoldTimeoutId = null;
  }
  if (archiveStripTimeoutId !== null) {
    clearTimeout(archiveStripTimeoutId);
    archiveStripTimeoutId = null;
  }
}

// Bumped every time a round's result becomes current (see activateResult()
// below) so `bestRecord` (further down) re-reads logic/bestResults.js's
// localStorage-backed store instead of returning a value it cached from an
// earlier attempt at this same puzzle. Vue's computed() only re-runs when a
// TRACKED reactive dependency changes -- and getBestForPuzzle() reads plain
// localStorage, which isn't reactive at all -- so without this, replaying
// the same puzzle (Reset, from the archive) and beating your previous best
// would leave the "Best" toggle showing the stale old result until the
// puzzle itself changes.
const resultVersion = ref(0);

/**
 * If `game` was just created already sitting on a round that finished in an
 * earlier visit (see useGame.js's `restoredFinished`, backed by
 * logic/roundState.js), jump straight to the result screen -- fully
 * revealed, no reveal animation, no RESULT_HOLD_MS delay -- since nothing
 * "just happened" here; the player is simply returning to a puzzle they
 * already solved.
 */
function applyRestoredResultIfAny() {
  if (!game.value.restoredFinished) return;
  resultVersion.value += 1;
  showResult.value = true;
  viewMode.value = 'this';
  showArchiveStrip.value = true;
  reveal.showImmediately(game.value.pegsRemaining);
}

applyRestoredResultIfAny();

function activateResult() {
  resultVersion.value += 1;
  showResult.value = true;
  viewMode.value = 'this';
  reveal.start({
    scrollTargetEl: resultGroupRef.value,
    geometry: game.value.geometry,
    masks: game.value.state.masks,
    par: game.value.par,
    pegsRemaining: game.value.pegsRemaining,
  });
  if (prefersReducedMotion) {
    showArchiveStrip.value = true;
  } else {
    archiveStripTimeoutId = setTimeout(() => {
      showArchiveStrip.value = true;
      archiveStripTimeoutId = null;
    }, BOARD_SHRINK_MS);
  }
}

/** Handles a This game/Best toggle click. If the just-finished round's own reveal (score count-up, rank pop) hasn't finished playing yet, skip straight to its end first -- so the toggle always reads as an instant swap, never a mid-flight jump-cut. Also makes sure the archive strip is showing (normally already true by this point -- see the BOARD_SHRINK_MS timeout above -- but a toggle tapped in that first instant shouldn't have to wait out the rest of it). */
function handleViewModeChange(mode) {
  if (!reveal.rankRevealed) {
    reveal.finishNow();
  }
  showArchiveStrip.value = true;
  viewMode.value = mode;
}

watch(
  () => game.value.roundOver,
  (isOver) => {
    clearResultHold();
    if (!isOver) {
      reveal.cancel();
      showResult.value = false;
      showArchiveStrip.value = false;
      return;
    }
    if (prefersReducedMotion) {
      activateResult();
      return;
    }
    resultHoldTimeoutId = setTimeout(() => {
      activateResult();
      resultHoldTimeoutId = null;
    }, RESULT_HOLD_MS);
  }
);

// If the URL changes while this page is already mounted (an archive/dev
// link to a different puzzle number, or browser back/forward), load
// whatever it now points to.
watch(
  () => route.path,
  () => {
    reportIncompleteIfNeeded();
    clearResultHold();
    reveal.cancel();
    showResult.value = false;
    showArchiveStrip.value = false;
    puzzle.value = resolvePuzzle();
    game.value = useGame(puzzle.value, { source: resolveSource() });
    applyRestoredResultIfAny();
  }
);

// --- This game / Best -- a single result record drives everything the
// result screen shows (rank, shy-of-GENIUS callout, board, stats, share
// text), so switching the toggle is just switching which record populates
// it; see components/ResultHeader.vue, ResultStatRow.vue, ResultFooter.vue,
// and Board.vue's `masksOverride` prop.

const bestRecord = computed(() => {
  resultVersion.value; // re-derive whenever a new round's result is recorded -- see activateResult() above
  return puzzle.value.puzzleNumber != null ? getBestForPuzzle(puzzle.value.puzzleNumber) : undefined;
});

const thisGameRecord = computed(() => ({
  overPar: game.value.overPar,
  pegsRemaining: game.value.pegsRemaining,
  masks: game.value.state.masks,
  won: game.value.hasWon,
}));

const displayedRecord = computed(() => (viewMode.value === 'best' && bestRecord.value ? bestRecord.value : thisGameRecord.value));

const displayedTier = computed(() => getRankForOverPar(displayedRecord.value.overPar));

const shareText = computed(() =>
  buildShareText({
    pegsRemaining: displayedRecord.value.pegsRemaining,
    puzzleNumber: puzzle.value.puzzleNumber,
    formattedDate: formattedDate.value,
    rank: displayedTier.value.rank,
  })
);

onBeforeUnmount(() => {
  clearResultHold();
  reportIncompleteIfNeeded();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('pagehide', reportIncompleteIfNeeded);
});
</script>

<template>
  <div class="play-view">
    <!-- Everything except Controls is centered as one group in the space
         above the utility zone -- Controls is a separate flex sibling
         (not part of this group) so it always pins to the bottom of the
         screen in thumb-reach, no matter how tall the rest of this ends
         up being. -->
    <div class="play-content">
      <!-- Wraps the date together with the result card so the reveal's
           scroll-into-view and ArchiveDayStrip.vue's supplementary scroll
           (see resultGroupRef above) both treat the date as part of what
           must stay on screen, not just the card underneath it. -->
      <div ref="resultGroupRef" class="result-anchor">
        <p v-if="formattedDate" class="puzzle-line">{{ formattedDate }}</p>

        <div class="result-group" :class="{ 'with-divider': showResult }">
          <div class="game-area">
            <StatBar v-if="!showResult" :pegs-remaining="game.pegsRemaining" :move-count="game.state.moveCount" :par="game.par" />
            <ResultHeader
              v-else
              :record="displayedTier"
              :over-par="displayedRecord.overPar"
              :revealed="viewMode === 'best' || reveal.rankRevealed"
            />

            <!-- Sits directly below the rank/shy-pill and above the board --
                 same zone as the rank reveal, so the score count-up (see
                 composables/useResultReveal.js) and the rank pop-in read as
                 one connected moment instead of making a player's eyes jump
                 down past the board and back. Appears the instant
                 `showResult` flips true, same as ResultHeader right above it
                 -- no separate fade-in shell of its own. -->
            <ResultStatRow
              v-if="showResult"
              :par="game.par"
              :pegs-remaining="displayedRecord.pegsRemaining"
              :displayed-score="reveal.displayedScore"
              :score-bump-keys="reveal.scoreBumpKeys"
              :is-revealing="viewMode === 'this' && !reveal.rankRevealed"
            />

            <Board
              :game="game"
              :compact="showResult"
              :masks-override="showResult && viewMode === 'best' ? displayedRecord.masks : null"
              :pulsing-index="viewMode === 'this' ? reveal.pulsingHoleIndex : -1"
            />

            <!-- Only shown while a round is actually being played -- once the
                 result screen takes over (see `showResult` above) this copy
                 has nothing left to explain. -->
            <p v-if="!showResult" class="tagline">Hop same-color dots to clear the board</p>
          </div>

          <!-- A single fade+scale entrance for the toggle/footer row that
               appears once the round ends -- deliberately NOT wrapping
               .game-area above, since Board.vue stays the same persistent
               element throughout (see its `compact` prop) and must never
               itself flicker opacity:0 as part of this. ResultStatRow now
               lives in .game-area instead of here (see above), above the
               board in the same zone as the rank reveal. -->
          <div v-if="showResult" class="result-extras">
            <ResultToggle v-if="puzzle.puzzleNumber != null" :model-value="viewMode" @update:model-value="handleViewModeChange" />
            <ResultFooter
              :share-text="shareText"
              :puzzle-number="puzzle.puzzleNumber"
              :rank="displayedTier.rank"
              :won="displayedRecord.won"
              :over-par="displayedRecord.overPar"
              :result-source="viewMode"
              @reset="game.reset()"
            />
          </div>
        </div>
      </div>

      <TemporaryWatchSolveButton v-if="isDevBuild" :game="game" />
    </div>

    <GhostToggle v-if="ghost.flagEnabled && ghost.discovered && !game.roundOver" />
    <Controls
      v-if="!game.roundOver"
      :can-undo="game.state.undoStack.length > 0"
      :round-over="game.roundOver"
      @undo="game.undo()"
      @reset="game.reset()"
    />

    <ArchiveDayStrip
      v-if="showArchiveStrip && puzzle.puzzleNumber != null"
      :key="puzzle.puzzleNumber"
      :keep-visible-el="resultGroupRef"
    />
  </div>
</template>

<style scoped>
.play-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}

.play-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 6px 10px;
  text-align: center;
}

/* Wraps .puzzle-line (the date) and .result-group together -- see
   resultGroupRef in the script above -- so the reveal's scroll-into-view
   and ArchiveDayStrip.vue's supplementary scroll-down both keep the date on
   screen, not just the result card underneath it. */
.result-anchor {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.puzzle-line {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.03em;
  color: var(--color-ink-dim);
}

.tagline {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.72rem;
  color: var(--color-ink-dim);
}

.game-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
}

.result-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.result-extras {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  /* A one-shot "something just happened" entrance for the toggle/footer
     row -- the equivalent of the now-retired ResultOverlay.vue's
     whole-modal fade+scale-in, scoped to just this new content so the
     persistent Board element above (see its `compact` prop) never itself
     flickers through opacity:0 as part of it. */
  animation: result-extras-enter 0.35s ease-out;
}

@keyframes result-extras-enter {
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
  .result-extras {
    animation: none;
  }
}

/* Once the round is over, this whole group (header/stats/board through the
   toggle/Share+Reset row) reads as one self-contained, screenshot-
   able "shareable card" -- separated with real breathing room from
   ArchiveDayStrip.vue's "Catch up on recent days" strip below it, rather
   than the two visually running together. */
.result-group.with-divider {
  padding-bottom: 24px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(36, 27, 20, 0.12);
}
</style>
