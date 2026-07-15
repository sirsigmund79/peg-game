// ============================================================================
// services/analytics.js
// ----------------------------------------------------------------------------
// The single seam between this app and PostHog -- mirrors how
// services/viral.js centralizes sharing. Every other file that wants to
// record something imports `track()` (or one of the named helpers below) and
// a constant from EVENTS, never posthog-js directly. That keeps event names
// spelled consistently and means the rest of the app never has to think
// about "is PostHog even loaded right now" -- see docs/ANALYTICS.md for the
// full taxonomy and the dashboards/experiments built on top of it.
//
// No PostHog project is required for the app to run: without
// VITE_POSTHOG_KEY set (see .env.example), init() quietly no-ops and every
// track() call below becomes a cheap do-nothing.
// ============================================================================

import posthog from 'posthog-js';
import { getHistory } from '../logic/history.js';
import { getTodayPuzzleNumber } from '../logic/daily.js';
import { computeStreaks } from '../logic/streaks.js';
import { isGhostBaselineCaptured, markGhostBaselineCaptured } from '../logic/ghostSettings.js';

/** Every custom event name this app fires, in one place so call sites never hand-type a string. */
export const EVENTS = {
  PUZZLE_STARTED: 'puzzle_started',
  PUZZLE_FIRST_MOVE: 'puzzle_first_move',
  PUZZLE_UNDO_USED: 'puzzle_undo_used',
  PUZZLE_RESET_USED: 'puzzle_reset_used',
  PUZZLE_COMPLETED: 'puzzle_completed',
  PUZZLE_LEFT_INCOMPLETE: 'puzzle_left_incomplete',
  SHARE_CLICKED: 'share_clicked',
  SHARE_COPY_RESULT: 'share_copy_result',
  ARCHIVE_PUZZLE_SELECTED: 'archive_puzzle_selected',
  ARCHIVE_TEASER_DAY_SELECTED: 'archive_teaser_day_selected',
  ARCHIVE_TEASER_EXPLORE_CLICKED: 'archive_teaser_explore_clicked',
  STATS_NAV_CLICKED: 'stats_nav_clicked',
  STATS_ARCHIVE_CTA_CLICKED: 'stats_archive_cta_clicked',
  BADGE_UNLOCKED: 'badge_unlocked',
  GHOST_OUTLINE_BASELINE_CAPTURED: 'ghost_outline_baseline_captured',
};

let isInitialized = false;

/**
 * Boots PostHog, if (and only if) a project key is configured. Safe to call
 * unconditionally from main.js -- with no key set (e.g. a fresh clone with
 * no .env yet) this just logs once and every track() call below becomes a
 * no-op, so local dev never needs its own special-casing.
 */
export function initAnalytics() {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!apiKey) {
    console.info('[analytics] VITE_POSTHOG_KEY not set -- analytics disabled. See .env.example.');
    return;
  }

  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    // This app's router only ever touches location.hash (see
    // composables/useRouter.js), never the History API, so PostHog's
    // default pageview autocapture -- which listens for pushState/popstate
    // -- would never fire. App.vue calls trackPageview() manually instead.
    capture_pageview: false,
    // Left on: cheap, and useful later for ad-hoc click heatmaps via the
    // PostHog toolbar. No dashboard in docs/ANALYTICS.md depends on it --
    // every dashboard is built from the named events below.
    autocapture: true,
    // Session replay. This flag just stops the SDK itself from opting out --
    // recording only actually starts once "Record user sessions" is turned
    // on for the project in the PostHog dashboard (Project Settings ->
    // Recordings), which is a separate, account-level switch this code
    // can't reach.
    disable_session_recording: false,
  });

  // Lets every dashboard filter dev traffic out even if the user only ever
  // sets up one PostHog project instead of the two recommended in
  // docs/ANALYTICS.md.
  posthog.register({ app_env: import.meta.env.PROD ? 'production' : 'development' });

  window.addEventListener('error', (event) => {
    trackError(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    trackError(event.reason);
  });

  isInitialized = true;

  // One-time, not gated on Ghost Outline's own on/off flag (see
  // logic/featureFlags.js) -- every player gets a "before" snapshot banked
  // the moment this ships, regardless of when (or whether) the feature
  // itself ever launches for them. See captureGhostOutlineBaselineOnce()
  // below for why this can't just reuse the live lifetime_genius_rate.
  captureGhostOutlineBaselineOnce();
}

/** Fires a custom event. Safe to call even if init() never ran or PostHog's script got blocked. */
export function track(eventName, properties) {
  if (!isInitialized) return;
  posthog.capture(eventName, properties);
}

/**
 * Manual pageview capture (see the capture_pageview: false note above).
 *
 * @param {string} page - 'play' | 'archive' | 'story' | 'dev'
 * @param {object} [properties]
 */
export function trackPageview(page, properties) {
  if (!isInitialized) return;
  posthog.capture('$pageview', { page, ...properties });
}

/** Reports an uncaught error/rejection as a PostHog exception -- the only crash visibility this app has. */
export function trackError(error) {
  if (!isInitialized) return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  posthog.captureException(normalized);
}

/**
 * Recomputes this device's lifetime stats from logic/history.js (which
 * already records every completed daily puzzle locally). Returns null if
 * nothing has ever been completed (a brand-new player) rather than dividing
 * by zero. Shared by syncPlayerStatsToPostHog() (the live, ever-updating
 * numbers) and captureGhostOutlineBaselineOnce() (a one-time, frozen
 * snapshot of the same shape) so the calculation only lives in one place.
 */
function computeLifetimeStats() {
  const history = getHistory();
  const results = Object.values(history);
  if (results.length === 0) return null;

  const lifetimePuzzlesCompleted = results.length;
  const lifetimeWins = results.filter((result) => result.won).length;
  const { current, longest } = computeStreaks(Object.keys(history).map(Number), getTodayPuzzleNumber());

  return {
    lifetimePuzzlesCompleted,
    lifetimeWins,
    geniusRate: Number((lifetimeWins / lifetimePuzzlesCompleted).toFixed(3)),
    currentStreakDays: current,
    longestStreakDays: longest,
  };
}

/**
 * Pushes this device's lifetime stats as PostHog person properties. Call
 * after every puzzle_completed. Turns "power user" segmentation into a
 * plain person-property filter in PostHog instead of a custom cohort query
 * -- see Dashboard 5 in docs/ANALYTICS.md.
 */
export function syncPlayerStatsToPostHog() {
  if (!isInitialized) return;

  const stats = computeLifetimeStats();
  if (!stats) return;

  posthog.setPersonProperties({
    lifetime_puzzles_completed: stats.lifetimePuzzlesCompleted,
    lifetime_wins: stats.lifetimeWins,
    lifetime_genius_rate: stats.geniusRate,
    current_streak_days: stats.currentStreakDays,
    longest_streak_days: stats.longestStreakDays,
  });
}

/**
 * One-time, per-browser snapshot of this device's lifetime stats, taken
 * BEFORE Ghost Outline can have influenced anything -- see
 * logic/featureFlags.js. Unlike lifetime_genius_rate above (which keeps
 * updating forever), these `baseline_*` person properties are written via
 * PostHog's $set_once semantics (the second argument to
 * setPersonProperties()), so whatever they were the first time this ran is
 * what they stay -- the whole point is a frozen "before" value to segment
 * players by later (e.g. "was this originally a struggling player"),
 * something a continuously-updating number can't answer once players have
 * had the feature a while. Guarded by logic/ghostSettings.js's one-way
 * `baselineCaptured` flag so this can safely be called on every app boot
 * but only ever actually sends data once.
 */
export function captureGhostOutlineBaselineOnce() {
  if (!isInitialized || isGhostBaselineCaptured()) return;

  const stats = computeLifetimeStats();
  const properties = {
    baseline_genius_rate: stats?.geniusRate ?? null,
    baseline_lifetime_puzzles_completed: stats?.lifetimePuzzlesCompleted ?? 0,
    baseline_current_streak_days: stats?.currentStreakDays ?? 0,
    baseline_captured_at: new Date().toISOString(),
  };

  posthog.setPersonProperties({}, properties);
  track(EVENTS.GHOST_OUTLINE_BASELINE_CAPTURED, properties);
  markGhostBaselineCaptured();
}

/** Records, once per browser lifetime, that the player turned Ghost Outline off at least once -- see composables/useGhostOutline.js's setEnabled(). */
export function trackGhostOutlineDisabled() {
  if (!isInitialized) return;
  posthog.setPersonProperties({}, { ghost_outline_ever_disabled: true });
}

/** Records, once per browser lifetime, that the player turned Ghost Outline back on after having disabled it -- see composables/useGhostOutline.js's setEnabled(). */
export function trackGhostOutlineReEnabled() {
  if (!isInitialized) return;
  posthog.setPersonProperties({}, { ghost_outline_ever_re_enabled: true });
}
