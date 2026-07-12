<!--
  ============================================================================
  components/ArchiveDayStrip.vue
  ----------------------------------------------------------------------------
  The "more obvious archive callout" shown on the result screen, once the
  just-finished round's own reveal animation has finished (see
  composables/useResultReveal.js and PlayView.vue's `showArchiveStrip`, set
  once that reveal's promise resolves -- or immediately, if the player
  touches the This game/Best toggle before it finishes on its own). A
  horizontal strip of the last few archive days -- always anchored on
  TODAY's puzzle number, not whichever puzzle was just played, so this reads
  as "the archive's most recent days" rather than shifting around when
  replaying an old day -- each shown as a tile with its own peg-dot glyph
  (real colors, via PuzzleGlyph.vue's `holeColors` prop) instead of a
  generic icon, plus a final "Explore the Archive" tile. Kept to a small day
  count (see RECENT_DAY_COUNT below) so each tile stays roomy enough for its
  rank text to wrap without spilling past its own border.

  On a touch device this scrolls/swipes with snap, peeking the next tile,
  the same feel as the NYT Games home screen this is modeled on. On a real
  mouse (see the `(hover: hover) and (pointer: fine)` query below -- the
  same "is this a mouse, not a finger" signal Controls.vue/ResultFooter.vue
  already use) the tiles instead compress to fit the strip's own width with
  no scrolling at all, since a desktop player has no swipe gesture to
  discover the extra tiles with.

  The result screen's own scroll (see useResultReveal.js's
  waitForScrollSettle) only brings that screen into view -- it fires before
  this strip even mounts, so on a short screen the strip can still land
  below the fold. Once mounted, this scrolls itself the rest of the way
  down, capped by the `keepVisibleEl` prop (the date-plus-result-card
  anchor, passed from components/PlayView.vue as `resultGroupRef`) so the
  scroll never pushes that anchor's own top -- the puzzle's date -- above
  the viewport. On a screen too short to fit both the whole result card and
  this whole strip, the date (and the card below it) wins; the strip may
  still end up partly below the fold, same as before this clamp existed,
  rather than trading one cut-off element for another.
  ============================================================================
-->
<script setup>
import { computed, onMounted, ref } from 'vue';
import { getTodayPuzzleNumber, getPuzzleForNumber } from '../logic/daily.js';
import { getHistory } from '../logic/history.js';
import { getRankForOverPar } from '../logic/rules.js';
import { useRouter } from '../composables/useRouter.js';
import { EVENTS, track } from '../services/analytics.js';
import PuzzleGlyph from './PuzzleGlyph.vue';

const RECENT_DAY_COUNT = 3;

const props = defineProps({
  // The date-plus-result-card anchor (see PlayView.vue's `resultGroupRef`)
  // -- its top edge (the puzzle's date) is never scrolled above the
  // viewport's top by the reveal-into-view below.
  keepVisibleEl: {
    type: Object,
    default: null,
  },
});

const { navigate } = useRouter();
const todayNumber = getTodayPuzzleNumber();
const history = getHistory();

const stripRef = ref(null);
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A small top margin (rather than 0) so the rank doesn't end up scrolled
// flush against the very edge of the viewport.
const KEEP_VISIBLE_TOP_MARGIN_PX = 12;

onMounted(() => {
  const strip = stripRef.value;
  if (!strip) return;

  const stripRect = strip.getBoundingClientRect();
  // How far down we'd need to scroll to bring the strip's bottom fully
  // into view (0 if it's already on screen) -- the same amount
  // `scrollIntoView({block: 'end'})` would scroll by.
  const wantedScroll = Math.max(0, stripRect.bottom - window.innerHeight);
  if (wantedScroll === 0) return;

  const keepVisibleRect = props.keepVisibleEl?.getBoundingClientRect();
  // Never scroll further than the point where the keep-visible element's
  // own top would be pushed above the margin -- if it's already past that
  // point (a very short screen), don't scroll at all rather than push it
  // further off.
  const maxScroll = keepVisibleRect ? Math.max(0, keepVisibleRect.top - KEEP_VISIBLE_TOP_MARGIN_PX) : wantedScroll;
  const scrollAmount = Math.min(wantedScroll, maxScroll);
  if (scrollAmount <= 0) return;

  window.scrollBy({ top: scrollAmount, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
});

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
  <section ref="stripRef" class="archive-day-strip">
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
        <PuzzleGlyph :geometry="entry.geometry" :empty-holes="entry.emptyHoles" :hole-colors="entry.holeColors" :size="68" class="day-glyph" />
        <span v-if="entry.result" class="day-result"><span aria-hidden="true">{{ entry.result.emoji }}</span> {{ entry.result.rank }}</span>
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
  /* A one-shot entrance, matching PlayView.vue's own .result-extras-enter --
     this only ever mounts once the result screen's own reveal has finished
     (see composables/useResultReveal.js), so it reads as the next distinct
     "beat" after that. */
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
  flex: 0 0 124px;
  min-height: 148px;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 10px;
  font-family: var(--font-ui);
  text-align: center;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
}

/* Every direct child of a tile is text that must be free to wrap onto a new
   line rather than push the tile wider (or spill past its border) --
   without this, a flex item's default min-width:auto lets its content's
   un-wrapped width win over the tile's own width. */
.day-tile > * {
  min-width: 0;
  max-width: 100%;
}

.day-tile.today {
  background: var(--color-header-bg);
}

.day-label {
  font-weight: 800;
  font-size: 0.8rem;
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
  font-size: 0.72rem;
  line-height: 1.3;
  color: var(--color-ink-secondary);
  overflow-wrap: break-word;
}

.day-tile.today .day-result,
.day-tile.today .day-play {
  color: var(--color-header-text-dim);
}

.cta-tile {
  background: var(--color-accent);
}

.cta-icon {
  font-size: 1.6rem;
  line-height: 1;
}

.cta-label {
  font-weight: 800;
  font-size: 0.8rem;
  line-height: 1.3;
  color: var(--color-card-bg);
  overflow-wrap: break-word;
}

@media (hover: hover) and (pointer: fine) {
  .strip-track {
    overflow-x: visible;
  }

  .day-tile {
    flex: 1 1 0;
  }
}
</style>
