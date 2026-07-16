# Analytics: dashboards, experiments, and how this is instrumented

Dot Hopper had zero analytics before this. This doc covers what's now tracked,
the dashboards worth building from it, and a slate of future experiments —
sized for a solo indie dev running one PostHog project, not a studio
analytics team. If you haven't set up PostHog yet, start at "Setup" below.

## Setup

1. Create a PostHog Cloud account (free tier is plenty for this game's
   volume) at posthog.com.
2. Create **two projects**: `Dot Hopper` (production) and `Dot Hopper Dev` (local
   testing). This is the cleanest way to keep your own testing out of real
   player dashboards — no filters to remember everywhere.
   - If you'd rather run one project, every event carries an `app_env`
     property (`"production"` / `"development"`) — add `app_env =
     production` as a base filter on each insight instead.
3. Copy `.env.example` to `.env.local` and paste the **Dot Hopper Dev**
   project's API key into `VITE_POSTHOG_KEY`. `npm run dev` now sends events
   there.
4. In your Cloudflare Pages project settings, add `VITE_POSTHOG_KEY` (the
   **Dot Hopper** production key) and `VITE_POSTHOG_HOST` as build environment
   variables. These are read at build time (`import.meta.env`, via Vite), so
   a Pages rebuild is required after setting them.
5. **Known limitation, not a bug**: ad blockers and privacy-focused browsers
   commonly block `*.posthog.com`/`i.posthog.com` requests outright — likely
   a non-trivial share of a puzzle-game audience. Every dashboard below will
   undercount real traffic somewhat. If it matters later, PostHog documents
   a same-origin reverse-proxy setup for Cloudflare that fixes most of this
   without any app code changes — worth doing once traffic is real, not
   before.

## What's tracked

Everything fires through `src/services/analytics.js` — the single seam
between this app and PostHog, mirroring how `src/services/viral.js`
centralizes sharing. Two ground rules shaped what's here:

- **No per-move events.** A round involves dozens of taps; firing an event
  per tap would burn quota for no analytical payoff nobody asked for. Move
  count, undo count, and reset count are accumulated in
  `composables/useGame.js`'s state and attached as *properties* on the
  round-level events below instead.
- **No accounts, so no PII, and no `identify()` calls.** Every player is
  PostHog's own anonymous, localStorage-persisted `distinct_id`. Lifetime
  stats (streaks, totals) are pushed as **person properties**, computed from
  `logic/history.js`'s already-existing local play history — see
  `syncPlayerStatsToPostHog()`.

**Filtering out internal traffic.** Open the app with `?internal` anywhere in
the URL (e.g. `https://dothopper.example/?internal`) and every event that
browser sends for the rest of the session carries `is_internal: true` (see
`initAnalytics()`) — filter it out of real-player dashboards with an
`is_internal is not true` base filter. Simpler than a second PostHog project
for this specifically, since it's just for internal/tester traffic, not the
dev-vs-production split `app_env` already covers.

| Event | Fired when | Key properties |
|---|---|---|
| `$pageview` (manual) | Any route change (`App.vue`) | `page`, `puzzle_number` |
| `puzzle_started` | A round is created (`useGame.js`) | `puzzle_number`, `puzzle_date`, `board_shape`, `color_count`, `par_total`, `source` (`daily`\|`link`\|`custom`), `already_played` |
| `puzzle_first_move` | First jump of a round | `puzzle_number` |
| `puzzle_undo_used` | Undo pressed | `puzzle_number`, `move_count_before_undo` |
| `puzzle_reset_used` | Reset pressed after ≥1 move | `puzzle_number`, `move_count_before_reset`, `repeat_move_count`, `cumulative_move_count`, `ghost_outline_used` |
| `puzzle_completed` | Round ends, any outcome | `puzzle_number`, `puzzle_date`, `board_shape`, `color_count`, `won`, `rank`, `over_par`, `move_count`, `undo_count`, `reset_count`, `duration_ms`, `source`, `repeat_move_count`, `cumulative_move_count`, `ghost_outline_used` |
| `puzzle_left_incomplete` | Player leaves mid-round (route away, tab hidden, or tab closed) — fires once per round | `puzzle_number`, `move_count`, `time_spent_ms`, `repeat_move_count`, `cumulative_move_count`, `ghost_outline_used` |
| `share_clicked` | "Challenge A Friend" tapped | `puzzle_number`, `rank`, `won`, `over_par` |
| `share_copy_result` | Clipboard copy resolves | `puzzle_number`, `success` |
| `archive_puzzle_selected` | A day picked from the archive | `puzzle_number`, `days_ago`, `already_played`, `is_today` |
| `stats_nav_clicked` | Header's Stats icon tapped (`App.vue`) | — |
| `stats_archive_cta_clicked` | "Check out the Archive" tapped on the stats page (`StatsView.vue`) | — |
| `badge_unlocked` | A badge's unlock condition (see `logic/badges.js`) is newly satisfied | `badge_id`, `puzzle_number` |
| `ghost_outline_baseline_captured` | Once per browser, on the first app boot after this instrumentation ships (`initAnalytics()`) | `baseline_genius_rate`, `baseline_lifetime_puzzles_completed`, `baseline_current_streak_days` |
| `how_to_play_shown` | The How to Play modal opens, via the header's "?" button — never shown automatically (`useHowToPlay.js`) | — |
| `how_to_play_dismissed` | The How to Play modal closes | `source` (`manual`\|`backdrop`\|`escape`) |
| `$exception` | Any uncaught error/rejection | message, stack, `app_env` |

Person properties (set on every `puzzle_completed`, from
`syncPlayerStatsToPostHog()`): `lifetime_puzzles_completed`, `lifetime_wins`,
`lifetime_genius_rate`, `current_streak_days`, `longest_streak_days`.

Person properties set **once** (PostHog `$set_once` — locked in forever at
whatever they were the first time, never touched again):
- `baseline_genius_rate`, `baseline_lifetime_puzzles_completed`,
  `baseline_current_streak_days`, `baseline_captured_at` — see
  `captureGhostOutlineBaselineOnce()` in `services/analytics.js`. A frozen
  "before Ghost Outline could have influenced anything" snapshot, since the
  live `lifetime_genius_rate` above keeps updating forever and can't answer
  "was this originally a struggling player" once someone's used the feature
  a while.
- `ghost_outline_ever_disabled` — set the first time a player ever turns
  their own Ghost Outline toggle off.
- `ghost_outline_ever_re_enabled` — set the first time a player turns it
  back on after having disabled it. Can only ever be set after
  `ghost_outline_ever_disabled` already is (the toggle starts on by
  default), so together these two answer "did they ever touch it" and "did
  they come back to it."

**Launching Ghost Outline for real players**: it ships fully dark behind
`GHOST_OUTLINE_ENABLED` in `logic/featureFlags.js` — a hardcoded constant,
not a PostHog Feature Flag. Flip it to `true` and deploy; that's the entire
rollout mechanism, no PostHog dashboard configuration needed. Because it's
one constant in one build, it goes from 0% to 100% of players in a single
instant — see Dashboard 6 below for why that's actually convenient for
analysis, not a limitation.

**Deliberately not instrumented:** the level editor and `#/dev` tools are
excluded from production builds entirely (`import.meta.env.DEV`), so there's
no prod data to gain.

Also: shared result links now carry a `?ref=share` query param (see
`services/viral.js`) — the only way to tell "a visit that came from someone
sharing their score" apart from any other visit, since PostHog can see
`$current_url`/`$referrer` but has no other signal that a link came from
this specific button.

## Dashboards

Five, in rough priority order — the earlier ones answer "is this alive and
working," the later ones answer "who are my best players and is the growth
loop working."

### 1. Vitals — is the game alive and not silently broken?

**Why:** this app has no server and, until now, no error monitoring at all.
A broken puzzle (a solver edge case, a render crash on some device) would
have failed completely silently. This is the smoke-detector dashboard.

**Insights to add:**
- Trend: unique users on `$pageview`, daily, split by new vs. returning.
- Trend: `$exception` count, daily. Any nonzero sustained rate is a bug to
  chase down immediately.
- Breakdown: `$pageview` by `$browser` and `$device_type` (built-in
  PostHog properties) — tells you what to test on.
- Breakdown: `$pageview` by `$geoip_country_name` — useful context for
  everything else (e.g. timezone spread of "today's puzzle").

**Success looks like:** DAU flat-to-rising week over week; `$exception`
trend at or near zero. A spike in errors right after a deploy is your
signal to roll back or hotfix.

**Setup:** New dashboard → add a Trends insight for each bullet above
(Insights → New → Trends, pick the event, add the breakdown from the
dropdown). No funnel/retention config needed for this one.

### 2. Core Loop Funnel — are people finishing puzzles, and where do they get stuck?

**Why:** this is the actual product. If people open a puzzle and bounce
before making a move, or make a few moves and quit, the daily habit never
has a chance to form. Per-shape breakdowns catch a specific puzzle shape
being miscalibrated (too hard relative to its par) before it does real
damage to retention.

**Insights to add:**
- Funnel: `puzzle_started → puzzle_first_move → puzzle_completed`,
  breakdown by `board_shape`.
- Trend: win rate (`puzzle_completed` where `won = true`, as % of all
  `puzzle_completed`).
- Trend: average `over_par` on `puzzle_completed`.
- Trend: `puzzle_undo_used` and `puzzle_reset_used` counts per
  `puzzle_completed` (a rough "friction per round" ratio).

**Success looks like:** completion rate stable or rising across every
`board_shape`, not just on average — a shape sitting well below the rest is
a difficulty-tuning bug in that shape's puzzle pool, not noise.

**Setup:** Insights → New → Funnel, add the three events in order, set
"Breakdown by" to the `board_shape` event property. Save all four to one
dashboard.

### 3. Daily Habit Retention — is the Wordle-style loop actually forming?

**Why:** this game's entire premise is a daily habit, same as Wordle. If D7
retention isn't climbing release over release, nothing else here matters as
much — this is the single most important number for a daily puzzle game.

**Insights to add:**
- Retention: anchor event `puzzle_completed`, retention event
  `puzzle_completed`, D1/D7/D30 windows, cohorted by first-seen week.
- Trend/histogram: `current_streak_days` person property distribution (how
  many players are on a 2+/7+/30+ day streak right now).

**Success looks like:** the D7 retention curve trending up release over
release. Because daily player counts will be small early on, treat any
single week's number as noisy — look at the trend over months, not one
week's blip.

**Setup:** Insights → New → Retention, set both "performed event" and
"returned to perform event" to `puzzle_completed`. For the streak
histogram, Insights → New → Trends → pick "person property" `
current_streak_days` and use a bar chart with bucketed values.

### 4. Virality / Growth Loop — is sharing bringing people back?

**Why:** with no ad budget, the share button is the entire acquisition
channel. This tells you whether it's pulling its weight, and the
`?ref=share` marker on the outbound link is what makes inbound traffic from
a share attributable at all — without it, a session from a shared link is
indistinguishable from any other visit.

**Insights to add:**
- Funnel: `puzzle_completed → share_clicked → share_copy_result` (filtered
  to `success = true` on the last step).
- Trend: `$pageview` count where `$current_url` contains `ref=share` — a
  rough proxy for "visits caused by someone sharing their score."

**Success looks like:** a rising share-click rate (% of completions that
share), and `ref=share` visits growing over time — that's your K-factor
proxy with zero backend required to compute it.

**Setup:** Funnel insight as above. For the second insight, Insights → New
→ Trends on `$pageview`, add a property filter `$current_url` **contains**
`ref=share`.

### 5. Power Users — who are the superfans, and what do they do differently?

**Why:** in a game with no ads and no IAP, your best players are your
highest-leverage audience — they're the ones worth building features for,
and the ones most likely to keep sharing/returning. This dashboard uses
person properties directly, no funnel math required, because
`syncPlayerStatsToPostHog()` already turns local play history into
filterable PostHog properties.

**Insights to add:**
- Histogram: `lifetime_puzzles_completed` person property, to see the
  distribution and pick a "power user" cutoff (e.g. top quartile).
- Once you have a cutoff, save a Cohort: `lifetime_puzzles_completed >= N`.
- Compare that cohort vs. everyone else on: `archive_puzzle_selected` rate,
  `share_clicked` rate, `current_streak_days`.

**Use it to decide:** if power users are disproportionately the ones
browsing the archive and sharing, features that serve them directly (a
bigger archive window, visible streak badges, a "genius rate" stat) are the
highest-leverage next build — you're already seeing what your most engaged
players value.

**Setup:** Insights → New → Trends → person property
`lifetime_puzzles_completed`, histogram view. People & Cohorts → New Cohort
→ filter on that same property. Then re-run the funnel/retention insights
above with "Add filter → Cohort" to compare.

### 6. Ghost Outline — did it work?

**Why:** this game's traffic is too low for a between-group A/B test to
reach significance in any reasonable time, so this is a **within-user
before/after** comparison instead — the same players, compared to their own
past selves. Because `GHOST_OUTLINE_ENABLED` (`logic/featureFlags.js`) is
one hardcoded constant shipped in one build, every player gets it at the
exact same instant — there's no staggered rollout to account for, which
makes this simpler than it sounds: an ordinary calendar-time Trends chart,
split at the deploy date, **is** the before/after comparison. No "days since
each player's own exposure" bookkeeping needed.

**A note on sample size**, same caveat as "Future experiments" below: with
small daily numbers, look at trends over weeks, not days, before drawing any
conclusion from a bend in a line.

**Insights to add:**
- Formula insight on `puzzle_completed`: `sum(repeat_move_count) /
  sum(cumulative_move_count)`, trended daily or weekly. **Don't** average a
  precomputed ratio across events instead — that over-weights low-move
  puzzles. Optionally filter to `ghost_outline_used = true` to isolate
  puzzles where the feature was actually visible.
- Trend: `reset_count` (average, on `puzzle_completed`) — "resets per
  puzzle," before vs. after the flip date.
- Trend: `lifetime_genius_rate` distribution, before vs. after.
- Retention insight (same setup as Dashboard 3), compared before vs. after
  the flip date.
- Trend: `duration_ms` average and `puzzle_completed` count per day, before
  vs. after — the "time on site / puzzles played" pair.
- Two saved Cohorts off `baseline_genius_rate` (e.g. `< 0.2` vs. `>= 0.2`) —
  re-run every insight above filtered to each cohort separately, to see
  whether players who were originally struggling benefit more.
- Trend: count of `ghost_outline_ever_disabled` / `ghost_outline_ever_re_enabled`
  person properties being `true`, as a rough friction signal — "% of players
  who ever turned it off" is a cheap proxy for "did this actually bother
  people," independent of whether it moved the metrics above.

**If you want more statistical rigor than a trend line later:** every
number needed for a proper paired before/after test (per-user, not just
per-population) already exists in the raw event stream — export
`puzzle_completed` (with `repeat_move_count`, `cumulative_move_count`,
`reset_count`, `duration_ms`) to CSV and run a paired analysis
(e.g. Wilcoxon signed-rank on each player's own before vs. after average) in
a spreadsheet or notebook. Not necessary to set up now — the data just needs
to keep accumulating so it's there if wanted later.

**Setup:** Insights → New → Trends, Formula mode for the ratio; plain Trends
for the rest. People & Cohorts → New Cohort → filter on `baseline_genius_rate`
for the two segments.

## Future experiments

PostHog's feature flags + Experiments product covers all of these — each
needs a feature flag created first, then an Experiment attached to it with
the metric below as the primary goal.

**A note on sample size first:** this is a low-traffic indie game. An
experiment needs enough daily completions per variant to detect a real
difference — with small daily numbers, that means running for **weeks**,
not days. Don't call a winner off a few days of data; let PostHog's built-in
significance calculation actually clear before deciding.

1. **Share CTA copy/design** — vary the "Challenge A Friend 💬" button's copy or
   emphasis. *Hypothesis:* clearer/more enticing copy increases the share
   rate. *Primary metric:* `share_clicked` ÷ `puzzle_completed`.
   *Secondary:* downstream `ref=share` visit volume (Dashboard 4). No new
   instrumentation needed — both metrics already exist.

2. **First-time onboarding** — a one-time tutorial overlay for brand-new
   players (nothing like this exists today). *Hypothesis:* a quick
   explainer reduces early bounce and improves habit formation.
   *Primary metric:* D1 retention. *Secondary:* `puzzle_completed` rate on
   a player's very first puzzle. *Requires:* building the onboarding UI,
   plus a way to detect "first session" (derivable from `getHistory()`
   being empty at session start — no new event needed, just a property on
   the flag targeting).

3. **Result-reveal pacing** — vary `RESULT_HOLD_MS` in `PlayView.vue` and
   the peg-pulse timing in `useResultReveal.js`. *Hypothesis:* a snappier
   reveal increases
   share rate by getting to the shareable moment faster.
   *Primary metric:* `share_clicked` rate. No new instrumentation needed.

4. **Rank-tier copy/thresholds** — vary the `RANK_TIERS` copy/emoji in
   `logic/rules.js` (e.g. a 5th tier, punchier names). *Hypothesis:* a
   result that feels better to receive gets shared more.
   *Primary metric:* `share_clicked` rate. No new instrumentation needed.

5. **"Catch up" nudge** — a banner prompting players who've missed recent
   days to visit the archive. *Hypothesis:* surfacing missed days directly
   drives back-catalog engagement and reinforces the daily habit.
   *Primary metric:* `archive_puzzle_selected` rate. *Secondary:* D7
   retention. *Requires:* building the nudge UI; the outcome metrics
   already exist.

For each: create the flag in PostHog (Feature Flags → New), attach an
Experiment to it (Experiments → New, pick the flag, set the primary metric
from the table above), and let it run to significance before reading
results.
