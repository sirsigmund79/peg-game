<!--
  ============================================================================
  components/StatsView.vue
  ----------------------------------------------------------------------------
  A read-only summary of this device's lifetime Dot Hop stats -- reachable
  from the header's trophy icon (see App.vue). Everything shown here is
  already being tracked for other reasons (the badge system, PostHog) and is
  just being surfaced to the player directly:
    - current streak: logic/streaks.js, over logic/history.js's completed
      puzzle numbers (a puzzle only counts once it's been played to a
      terminal result, not just attempted).
    - dots hopped / unique puzzles played: logic/badgeStats.js's lifetime
      counters -- "played" means playedThroughPuzzleIds, which (like the
      streak) only counts a puzzle once no matter how many times it's been
      replayed -- see that file for exactly what counts as "played through"
      (includes mid-round give-ups, not just wins).
    - the rank breakdown: logic/bestResults.js's per-puzzle BEST-EVER result
      (not logic/history.js's latest-attempt one), converted to rank copy via
      logic/rules.js's getRankForOverPar/RANK_TIERS and tallied per tier. A
      puzzle only ever contributes to whichever ONE tier its best result
      landed in, so replays never inflate a count -- they just have a chance
      to move a puzzle up a tier.
  Read once at mount, like ArchiveView.vue does with getHistory() -- these
  stores are plain localStorage, not reactive, and this page has no controls
  that would change them while it's open.

  The rank bars are colored with a single-hue ordinal ramp (light -> dark
  green, worst -> best tier) rather than one arbitrary hue per tier --
  RANK_TIERS is an ORDERED progression (swapping two tiers would change its
  meaning), so color should show that order, not just tell tiers apart. The
  ramp's dark end is the site's own brand green (--color-header-bg's hex),
  landing on Genius -- the one tier this game already treats as the hero
  moment (see logic/rules.js's RANK_TIERS comment) -- so the fullest, most
  saturated bar is also the best one. Every step (see RANK_BAR_COLORS below)
  was chosen by mixing that green toward white and checked with the dataviz
  skill's validator (`--ordinal`): monotone lightness, >=0.06 OKLCH L between
  adjacent steps, and the lightest step still clearing 2:1 contrast against
  the white card behind it. Bar length is never the ONLY way a count reads,
  either -- every row also prints its count as text, so a light bar for a
  small count is never the sole signal.
  ============================================================================
-->
<script setup>
import { getBadgeStats } from '../logic/badgeStats.js';
import { getHistory } from '../logic/history.js';
import { getTodayPuzzleNumber } from '../logic/daily.js';
import { computeStreaks } from '../logic/streaks.js';
import { getAllBestResults } from '../logic/bestResults.js';
import { RANK_TIERS, getRankForOverPar } from '../logic/rules.js';
import { useRouter } from '../composables/useRouter.js';
import { useGhostOutline } from '../composables/useGhostOutline.js';
import { EVENTS, track } from '../services/analytics.js';

const { navigate } = useRouter();
const { ghost, discover } = useGhostOutline();

function handleArchiveCtaClick() {
  track(EVENTS.STATS_ARCHIVE_CTA_CLICKED, {});
  navigate('/archive');
}

const badgeStats = getBadgeStats();
const { current: currentStreak } = computeStreaks(Object.keys(getHistory()).map(Number), getTodayPuzzleNumber());

const headlineStats = [
  { value: currentStreak, label: 'Day streak' },
  { value: badgeStats.pegsCleared.total, label: 'Dots hopped' },
  { value: badgeStats.playedThroughPuzzleIds.length, label: 'Puzzles played' },
];

// One color per RANK_TIERS slot, in the same worst -> best order -- see the
// file header above for how this ramp was derived and validated.
const RANK_BAR_COLORS = ['#9fbea9', '#7eab8d', '#559a6f', '#1c8c52'];

const rankCounts = new Map(RANK_TIERS.map((tier) => [tier.rank, 0]));
Object.values(getAllBestResults()).forEach(({ overPar }) => {
  const { rank } = getRankForOverPar(overPar);
  rankCounts.set(rank, rankCounts.get(rank) + 1);
});

const rankBars = RANK_TIERS.map((tier, index) => ({
  rank: tier.rank,
  count: rankCounts.get(tier.rank),
  colorHex: RANK_BAR_COLORS[index],
}));

// At least 1 so an all-zero board (no best results recorded yet) doesn't
// divide by zero -- every bar just renders at 0% width in that case.
const maxRankCount = Math.max(1, ...rankBars.map((bar) => bar.count));
</script>

<template>
  <div class="stats-view">
    <p class="stats-intro">Revel in the glory of your Dot Hop stats.</p>

    <div class="headline-row">
      <div v-for="stat in headlineStats" :key="stat.label" class="headline-tile">
        <span class="headline-value">{{ stat.value }}</span>
        <span class="headline-label">{{ stat.label }}</span>
      </div>
    </div>

    <div class="rank-card">
      <h2 class="rank-heading">How you've finished</h2>
      <div v-for="bar in rankBars" :key="bar.rank" class="rank-row">
        <span class="rank-label">{{ bar.rank }}</span>
        <div class="rank-track">
          <div class="rank-fill" :style="{ width: `${(bar.count / maxRankCount) * 100}%`, background: bar.colorHex }"></div>
        </div>
        <span class="rank-count">{{ bar.count }}</span>
      </div>
    </div>

    <div class="archive-section">
      <h2 class="archive-heading">Want to get your numbers up?</h2>
      <button type="button" class="archive-cta" @click="handleArchiveCtaClick">
        <span class="archive-cta-icon" aria-hidden="true">📅</span>
        <span class="archive-cta-label">Check out the Archive</span>
      </button>
    </div>

    <!-- The discovery mechanism for Ghost Outline (see
         composables/useGhostOutline.js): always here for anyone who scrolls
         this far, but the in-game toggle (components/GhostToggle.vue) stays
         hidden until this is tapped once. Not a live mirror of the feature's
         on/off state -- see that composable's header comment. -->
    <div v-if="ghost.flagEnabled" class="ghost-secret">
      <button v-if="!ghost.discovered" type="button" class="ghost-secret-teaser" @click="discover()">
        <span class="ghost-secret-icon" aria-hidden="true">👻</span>
        <span class="ghost-secret-text">psst... want to try a super secret experimental feature?</span>
      </button>
      <div v-else class="ghost-secret-found">
        <span class="ghost-secret-icon" aria-hidden="true">👻</span>
        <p class="ghost-secret-text">
          <strong>Ghost Outline:</strong> when you select a peg in-game, its possible jumps get a preview ring --
          dotted if you've already made that exact jump from that exact board today, solid if you haven't. Just a
          memory aid, never a hint. Find the toggle for it beneath the board.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-view {
  flex: 1;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 12px 16px 32px;
}

.stats-intro {
  margin: 0 0 16px;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--color-ink-secondary);
  text-align: center;
}

.headline-row {
  display: flex;
  gap: 10px;
}

.headline-tile {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 8px;
  text-align: center;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
}

.headline-value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.8rem;
  line-height: 1;
  color: var(--color-header-bg);
}

.headline-label {
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-ink-dim);
}

.rank-card {
  margin-top: 14px;
  padding: 16px;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
}

.rank-heading {
  margin: 0 0 14px;
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.rank-row {
  display: grid;
  grid-template-columns: 6.4em 1fr auto;
  align-items: center;
  gap: 10px;
}

.rank-row + .rank-row {
  margin-top: 10px;
}

.rank-label {
  min-width: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--color-ink-secondary);
  overflow-wrap: break-word;
}

.rank-track {
  height: 14px;
  background: rgba(36, 27, 20, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.rank-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease-out;
}

.rank-count {
  min-width: 1.4em;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 0.82rem;
  text-align: right;
  color: var(--color-ink-dim);
}

.archive-section {
  margin-top: 14px;
  text-align: center;
}

.archive-heading {
  margin: 0 0 10px;
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--color-ink);
}

.archive-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 16px;
  /* Same green as ResultFooter.vue's "Challenge A Friend" button --
     var(--color-peg), not var(--color-accent) (a darker green used for
     smaller/secondary chrome elsewhere) -- so this reads as the same kind
     of primary call-to-action. */
  background: var(--color-peg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
  cursor: pointer;
}

.archive-cta-icon {
  font-size: 1.3rem;
  line-height: 1;
}

.archive-cta-label {
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--color-card-bg);
}

.ghost-secret {
  margin-top: 28px;
  text-align: center;
}

.ghost-secret-teaser {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.55;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s ease;
}

.ghost-secret-teaser:hover,
.ghost-secret-teaser:focus-visible {
  opacity: 0.9;
}

.ghost-secret-found {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 360px;
  margin: 0 auto;
  padding: 14px;
  text-align: left;
  background: var(--color-card-bg);
  border: var(--frame-border);
  border-radius: 14px;
  box-shadow: var(--frame-shadow-card);
}

.ghost-secret-icon {
  flex: none;
  font-size: 1.1rem;
  line-height: 1.3;
}

.ghost-secret-text {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--color-ink-secondary);
}
</style>
