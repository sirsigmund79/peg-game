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
  board rendered alongside it); only its `compact` prop and the elements
  around it change. Its own `compact` size transition plus the existing
  round-over settle/ripple flourish (see Board.vue) are what make it read as
  "the same board sliding into the result card." Once every surviving peg
  has flown from that compact board into components/DotsLeftOnBoard.vue's
  tally (see composables/useResultReveal.js's fly sequence), the board
  collapses out of the layout via its own `cleared` prop, and
  components/RankLadder.vue takes the space it leaves behind. The result
  screen always shows the most recent attempt -- there's no toggle to view
  an older best, and the ladder itself is purely per-playthrough (a better
  tier earned on an earlier attempt this same puzzle gets no special
  treatment if this round didn't reach it too); see useGame.js's
  `justAchievedNewBest` for the one place history still matters here, the
  "New best!" pill.

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
import { buildShareText } from '../services/viral.js';
import { EVENTS, track } from '../services/analytics.js';
import { useGhostOutline } from '../composables/useGhostOutline.js';
import { useDevPanels } from '../composables/useDevPanels.js';
import Board from './Board.vue';
import StatBar from './StatBar.vue';
import Controls from './Controls.vue';
import GhostToggle from './GhostToggle.vue';
import ResultHeader from './ResultHeader.vue';
import DotsLeftOnBoard from './DotsLeftOnBoard.vue';
import RankLadder from './RankLadder.vue';
import ResultFooter from './ResultFooter.vue';
import ArchiveDayStrip from './ArchiveDayStrip.vue';
import NextPuzzleCountdown from './NextPuzzleCountdown.vue';
import TemporaryWatchSolveButton from './TemporaryWatchSolveButton.vue';
import SearchTreeVisualizer from './SearchTreeVisualizer.vue';
import PuzzleDifficultyProfile from './PuzzleDifficultyProfile.vue';
import BreadthDepthThumbnails from './BreadthDepthThumbnails.vue';
import DevPanelToggles from './DevPanelToggles.vue';

const isDevBuild = import.meta.env.DEV;

const { route } = useRouter();
const { ghost } = useGhostOutline();
const { devPanels } = useDevPanels();

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
const reveal = useResultReveal();
// Template refs to the two components composables/useResultReveal.js's fly
// sequence needs real on-screen positions from -- see activateResult()
// below, which hands their exposed getRootRect()/getSlotRect() straight
// through to reveal.start().
const boardRef = ref(null);
const tallyRef = ref(null);

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
  showResult.value = true;
  showArchiveStrip.value = true;
  reveal.showImmediately(game.value.pegsRemaining);
}

applyRestoredResultIfAny();

function activateResult() {
  showResult.value = true;
  reveal.start({
    // Passed as the refs themselves (not `.value`) -- tallyRef in
    // particular is still null here, since DotsLeftOnBoard.vue only mounts
    // once reveal.tallyReady flips true partway through start() below; the
    // fly sequence reads `.value` lazily, well after that's happened.
    boardRef,
    tallyRef,
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

// The result screen always shows the just-finished round -- no toggle, no
// separate "best" record to switch to; see components/ResultHeader.vue,
// DotsLeftOnBoard.vue, RankLadder.vue, and ResultFooter.vue, all driven
// straight off `game` below.

const shareText = computed(() =>
  buildShareText({
    pegsRemaining: game.value.pegsRemaining,
    puzzleNumber: puzzle.value.puzzleNumber,
    formattedDate: formattedDate.value,
    rank: game.value.rank.rank,
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
      <!-- Wraps the date together with the result card -- purely a layout
           grouping now that neither the reveal nor ArchiveDayStrip.vue
           scrolls the page (the result screen is condensed enough to fit
           above the fold on its own). -->
      <div class="result-anchor">
        <p v-if="formattedDate" class="puzzle-line">{{ formattedDate }}</p>

        <div class="result-group" :class="{ 'with-divider': showResult }">
          <div class="game-area">
            <StatBar v-if="!showResult" :pegs-remaining="game.pegsRemaining" :move-count="game.state.moveCount" :par="game.par" />
            <ResultHeader v-else :record="game.rank" :revealed="reveal.rankRevealed" />

            <Board
              ref="boardRef"
              :game="game"
              :compact="showResult"
              :flown-hole-indexes="reveal.flownHoleIndexes"
              :cleared="reveal.boardCleared"
            />

            <!-- Appears once the board has finished shrinking (see
                 composables/useResultReveal.js's `tallyReady`) -- each pip
                 pops in as its peg physically lands here, flown from the
                 board above via the fixed-position overlay near the end of
                 this template. -->
            <DotsLeftOnBoard
              v-if="showResult && reveal.tallyReady"
              ref="tallyRef"
              :pegs-remaining="game.pegsRemaining"
              :par="game.par"
              :displayed-score="reveal.displayedScore"
              :is-revealing="!reveal.boardCleared"
            />

            <!-- Mounts once every peg has landed and the board has
                 collapsed out of the layout (see `ladderReady`) -- takes the
                 vertical space the board leaves behind. -->
            <RankLadder
              v-if="showResult && reveal.ladderReady"
              :new-best="game.justAchievedNewBest"
              :over-par="game.overPar"
              :revealed="reveal.ladderReady"
              :instant="reveal.instant"
            />

            <!-- Only shown while a round is actually being played -- once the
                 result screen takes over (see `showResult` above) this copy
                 has nothing left to explain. -->
            <p v-if="!showResult" class="tagline">Hop same-color dots to clear the board</p>
          </div>

          <!-- A single fade+scale entrance for the footer row that appears
               once the round ends -- deliberately NOT wrapping .game-area
               above, since Board.vue stays the same persistent element
               throughout (see its `compact` prop) and must never itself
               flicker opacity:0 as part of this. -->
          <div v-if="showResult" class="result-extras">
            <ResultFooter
              :share-text="shareText"
              :puzzle-number="puzzle.puzzleNumber"
              :rank="game.rank.rank"
              :won="game.hasWon"
              :over-par="game.overPar"
              @reset="game.reset()"
            />
          </div>
        </div>
      </div>

      <template v-if="isDevBuild">
        <DevPanelToggles />
        <div class="dev-search-tools">
          <SearchTreeVisualizer v-if="devPanels.searchTree" :geometry="game.geometry" :masks="game.state.masks" :par="game.par" />
          <PuzzleDifficultyProfile v-if="devPanels.difficulty" :geometry="game.geometry" :masks="game.state.masks" :par="game.par" />
          <BreadthDepthThumbnails v-if="devPanels.breadthDepth" :game="game" />
        </div>
        <TemporaryWatchSolveButton v-if="devPanels.watchSolve" :game="game" />
      </template>
    </div>

    <GhostToggle v-if="ghost.flagEnabled && ghost.discovered && !game.roundOver" />
    <Controls
      v-if="!game.roundOver"
      :can-undo="game.state.undoStack.length > 0"
      :round-over="game.roundOver"
      @undo="game.undo()"
      @reset="game.reset()"
    />

    <ArchiveDayStrip v-if="showArchiveStrip && puzzle.puzzleNumber != null" :key="puzzle.puzzleNumber" />
    <NextPuzzleCountdown v-if="showArchiveStrip && puzzle.puzzleNumber != null" class="next-puzzle-countdown" />

    <!-- Each surviving peg's flight from the (compact) board to its tally
         slot -- see composables/useResultReveal.js's `flyingPegs`, driven by
         fx/jumpAnimation.js's rAF tween. Positioned in real viewport pixels
         (position: fixed), so this can live anywhere in the tree; kept at
         the end so it paints above everything else on the result screen. -->
    <div
      v-for="peg in reveal.flyingPegs"
      :key="peg.id"
      class="flying-peg"
      aria-hidden="true"
      :style="{
        left: peg.x + 'px',
        top: peg.y + 'px',
        width: peg.size + 'px',
        height: peg.size + 'px',
        transform: `translate(-50%, -50%) scale(${peg.scale})`,
        backgroundColor: peg.colorHex,
      }"
    ></div>
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

/* Wraps .puzzle-line (the date) and .result-group together -- purely a
   layout grouping now (see the template comment above). */
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

.dev-search-tools {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  margin-top: 4px;
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

/* Pulls up into ArchiveDayStrip.vue's own bottom padding so the two read as
   one group, then leaves a little breathing room of its own since this is
   the last thing on the result screen. */
.next-puzzle-countdown {
  margin: -12px 0 20px;
}

/* One surviving peg mid-flight from the board to its tally slot -- see
   composables/useResultReveal.js's `flyingPegs`. `left`/`top` are already
   real viewport pixels (from getBoundingClientRect()), which is why this is
   `position: fixed` rather than anchored to a local containing block. */
.flying-peg {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 20;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));
}
</style>
