# Dot Hopper

A daily peg-solitaire puzzle (like the wooden triangle game on every Cracker
Barrel table), Wordle-style: everyone gets the same puzzle each day, worked
out purely from the date -- no server, no accounts.

**Status:** core play loop, multi-color pegs (a peg can only jump over
another peg of its own color), jump/win animation, haptics, sound, a
Wordle-style result modal with clipboard sharing, an archive of past days, a
stats page, a badge/streak system, a never-repeating puzzle pool across 13
board shapes, hand-scheduled puzzles, a level editor, and PostHog analytics
are all built and working. Confetti, retro/space-age skins, and the
monetization/backend stubs have not been built yet.

## Running it

```
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). See "Dev
mode" below for what's different in a dev build.

To build a static production bundle:

```
npm run build
```

The output goes to `dist/` and can be hosted on any static file host
(Netlify, Vercel, Cloudflare Pages, GitHub Pages, etc.) -- there is no
backend to deploy for core play.

## Checking the solver

The game's solver is the thing that guarantees every daily puzzle is
actually winnable down to par. You can re-run its self-check any time:

```
node scripts/check-solver.js
```

This confirms every board shape, spot-checks the puzzle pool, replays the
English cross's precomputed solution, checks every daily puzzle's par is
structurally sane, checks the per-color "no boring color" quality rules, and
-- the big one -- proves that no two days in a full pool cycle ever show the
same puzzle. It should always say `ALL CHECKS PASSED`.

## How "never repeats" actually works, and the puzzle-generation commands

`logic/puzzlePool.js` is a checked-in list of solver-verified starting
positions (currently **~400** of them, across all 13 board shapes -- kept
deliberately small; see below). `logic/daily.js` assigns each day a
different pool entry using a shuffled-but-fixed order (a coprime-multiplier
number trick -- see the big comment in that file for exactly how, and why),
so no puzzle repeats until the entire pool has been used once.

The pool started out with **5,602** entries (~15 years of coverage) -- more
than a game that shows one puzzle a day actually needs, and not something
that could ever incorporate what's learned from real players. It's now
refreshed periodically instead. Because the "never repeats" shuffle's output
depends on the pool's exact *size*, shrinking it can't be a simple
truncation -- doing that naively would silently change what puzzle an
already-shown day "was". `logic/frozenDailyPuzzles.js` is the fix: a
permanent, append-only record of exactly what every already-elapsed day
showed, checked by `daily.js` before it ever touches the (currently
smaller) pool.

The commands, in the order you'd normally use them:

```
node scripts/generate-puzzle-pool.js     # make a large fresh candidate batch
node scripts/freeze-and-shrink-pool.js   # lock in history, trim the pool back down
node scripts/check-solver.js             # confirm everything above still holds
```

- **`generate-puzzle-pool.js`** solves thousands of candidate starting
  positions and writes every survivor to `logic/puzzlePool.js`. Re-run it
  when a board *shape* changes (e.g. a different hexagon radius), or
  whenever you want a large fresh batch to draw from -- e.g. after updating
  its quality rules with something learned from real players. Takes several
  minutes.
- **`freeze-and-shrink-pool.js`** is the one to run periodically going
  forward: it freezes every day up through today (plus a small safety
  buffer) into `logic/frozenDailyPuzzles.js`, then trims the working pool
  back down to ~400 entries (excluding whatever a freshly-frozen day just
  used, and always keeping English Cross's one entry). Safe to re-run any
  time -- it only ever *adds* to the frozen record, never edits or removes
  an entry.
- **`precompute-english-cross.js`** is a one-off: English Cross's own
  33-hole search tree is too large to solve live, so its one starting
  position is solved once, offline, and hand-pasted into `logic/boards.js`.
  Only re-run this if that board's own geometry ever changes.

## Dev mode

`npm run dev` adds a **Dev** page at `#/dev` (there's no nav link to it --
it's discoverable, not advertised) with four panels: a puzzle-archive jumper
(jump to any puzzle number, jump to today, or jump forward to the next
puzzle of a given shape), the puzzle-scheduling admin grid (see below),
lifetime badge-stat counters, and the level editor (see "Level editor"
below). All of it is gated by Vite's `import.meta.env.DEV` flag, so it's
automatically left out of `npm run build`; there's no separate switch to
remember to turn off.

There's also a red **"⚠ Watch Solve (temporary)"** button on the Play
screen in dev mode -- it auto-plays the rest of the current puzzle using the
solver. This was added for testing and is meant to be deleted later (see the
TODO comment at the top of `components/TemporaryWatchSolveButton.vue`).

## Puzzle scheduling (admin tools)

Since there's no backend, "scheduling" a puzzle for a specific date just
means committing an entry to `logic/scheduledPuzzles.js` and redeploying --
a scheduled date always wins over the normal pool pick, which is also how a
past archive day can be swapped for a hand-designed puzzle after the fact.
The Dev page's admin grid (`components/AdminPuzzlesView.vue`, opening
`AdminPuzzleEditPanel.vue`) is a month-paginated calendar for browsing,
drag-to-swapping, re-solving, and hand-editing these -- built because
scheduling by hand-editing a JS object doesn't scale much past a handful of
dates. Two independent difficulty scorers (`logic/puzzleDag.js`, structural;
`logic/puzzlePerceivedDifficulty.js`, heuristic) feed a difficulty badge into
that grid to help pick good candidates.

## Badges and streaks

`logic/badgeStats.js` tracks lifetime counters (pegs cleared, playthroughs,
resets, GENIUS finishes) that both power the Stats page's headline numbers
and feed `logic/badges.js`'s six unlock conditions (checked by
`logic/badgeUnlocks.js`). There's no player-facing badge UI yet -- an unlock
today is just a PostHog event -- `components/BadgeStatsDevPanel.vue` (dev
mode only) is a raw counter dump for debugging, not a preview of that
eventual UI. `logic/streaks.js` derives the current/longest day-streak from
`logic/history.js`'s local play history.

## Analytics

The game is instrumented with [PostHog](https://posthog.com) -- see
[`docs/ANALYTICS.md`](docs/ANALYTICS.md) for the full event list, dashboards
worth building, future experiment ideas, and setup instructions (copy
`.env.example` to `.env.local` and add a PostHog project key to enable it
locally; without a key, the app runs exactly as before).

## Ghost Outline (built, not yet launched)

A memory-aid feature: when you select a peg, its legal jumps get a preview
ring, dotted if you've already made that exact jump from that exact board
state today. It's fully built and tested but ships completely dark --
`logic/featureFlags.js`'s `GHOST_OUTLINE_ENABLED` is a single hardcoded
`false`. Flipping it to `true` and deploying is the entire launch mechanism;
no separate rollout system. The underlying "was this jump a repeat"
tracking (`logic/ghostMoves.js`) and its analytics already run
unconditionally regardless of the flag, so there's a real "before" baseline
banked by whenever it does launch.

## Level editor

The editor (Dev page, or opened from the admin grid) lets you hand-design a
board on a clickable grid: click a cell to add a peg, click again to make it
an empty starting hole, click once more to remove it from the board
entirely.

- **Calculate Max** runs the solver and reports the best possible outcome.
- **Watch Solve** plays that solution out on a preview board.
- **Save** stores the design in this browser's local storage ("My
  Puzzles"), where you can Play, Edit, Delete, or "Copy for scheduling" it
  later (see "Puzzle scheduling" above).

Designs saved this way are **personal and local only** -- they never become
an actual shared daily puzzle on their own. Every player has to see the
exact same daily puzzle; the only path from editor design to real daily
puzzle is through `logic/scheduledPuzzles.js`.

## What each file does

```
index.html                          Page shell Vite loads into the browser
src/
  main.js                           Boots the Vue app into #app, starts analytics
  App.vue                           Page shell: theme, header nav, routes to whichever page the URL points to
  style.css                         Base page styles (real colors come from CSS variables set by useTheme.js)

  logic/                            PURE JAVASCRIPT -- no Vue in here. The "brain" of the game.
    geometry.js                     Board shapes: triangular lattice (triangle/hexagon/star) + grid boards (8-directional)
    solver.js                       Memoized search: finds par (best achievable outcome) per color
    rules.js                        Applying a jump, checking legality (same-color-only), detecting game-over, scoring rank
    pegColors.js                    The fixed peg-color palette and how starting pegs get split into color regions
    boards.js                       The board catalog: one geometry per shape (13 currently)
    puzzlePool.js                   GENERATED: solver-verified starting positions (see "How never repeats" above)
    frozenDailyPuzzles.js           GENERATED: permanent record of already-shown days, immune to pool shrinks
    daily.js                        Turns a puzzle number into a specific puzzle: scheduled -> frozen -> pool, in that order
    scheduledPuzzles.js             Hand-authored puzzle overrides, keyed by date
    customBoard.js                  Turns an editor design into a real, playable/solvable board
    boardLayout.js                  Shared hole position/size math used by Board.vue and PuzzleGlyph.vue
    storage.js                      Tiny safe localStorage wrapper every other *Settings/*State module builds on
    history.js / bestResults.js / roundState.js
                                     Per-puzzle local play history, best-ever result, and "resume the result screen" state
    streaks.js                      Current/longest day-streak, derived from history.js
    attemptBoundary.js              The rule for whether a Reset counts as "giving up" on an attempt
    badges.js / badgeStats.js / badgeUnlocks.js
                                     Six lifetime badge conditions, the raw counters they're computed from, and unlock-diffing (see "Badges" above)
    ghostMoves.js / ghostSettings.js
                                     Ghost Outline's per-state "already tried this jump" tracking and its persisted settings (see "Ghost Outline" above)
    featureFlags.js                 The one hardcoded on/off switch for Ghost Outline
    puzzleDag.js / puzzlePerceivedDifficulty.js / puzzleDifficulty.js / puzzleDifficultyRecord.js
                                     Two independent difficulty scorers (structural + perceived) and where their output is stored (see "Puzzle scheduling" above)
    puzzleDesignConversion.js / puzzleAdminResolve.js
                                     Editor-design <-> board conversion, and the admin grid's drag-to-swap relabeling logic

  composables/                      Small reactive state holders that connect logic -> screen
    useGame.js                      One playable round: current board, selection, undo stack, win state, analytics
    useTheme.js                     The active theme's colors/fonts, applied as CSS variables
    useRouter.js                    A deliberately tiny hash-based router (no vue-router dependency)
    usePendingPuzzle.js             One-shot hand-off of a custom design from the editor to PlayView.vue
    useEditor.js / useAdminPuzzleEditor.js
                                     Level editor state, and the admin grid's edit-panel state
    useGhostOutline.js              Reactive singleton for Ghost Outline's flag/enabled/discovered state
    useResultReveal.js              The result screen's sequential score-reveal animation sequencing

  components/
    Board.vue                       Draws holes + pegs, positions them, animates jumps, handles taps -- also becomes the result screen's mini board
    PuzzleGlyph.vue                 Small pointillist puzzle preview used by the archive
    StatBar.vue                     Pegs left / moves / target chips above the board
    Controls.vue                    Undo + Reset buttons
    GhostToggle.vue                 Ghost Outline's beneath-the-board on/off toggle (see "Ghost Outline" above)
    ResultHeader.vue / DotsLeftOnBoard.vue / RankLadder.vue / ResultFooter.vue
                                     Result screen: rank header, dots-left tally (with inline Goal), rank ladder, share + reset
    PlayView.vue                    The actual game screen -- loads a puzzle, plays it, shows the result
    ArchiveView.vue / ArchiveDayStrip.vue
                                     Browse/replay past days, and the result screen's "nearby days" strip
    StatsView.vue                   Lifetime stats page (streak, dots hopped, rank breakdown, Ghost Outline's secret toggle)
    DevToolsView.vue                Dev-only page hosting the four panels below (see "Dev mode" above)
    DevPanel.vue                    Dev-only puzzle-number jumper
    AdminPuzzlesView.vue / AdminPuzzleEditPanel.vue
                                     Dev-only puzzle-scheduling admin grid and its full edit panel (see "Puzzle scheduling" above)
    BadgeStatsDevPanel.vue          Dev-only raw badge-counter dump
    EditorGrid.vue / EditorTriangleGrid.vue / EditorView.vue
                                     The clickable design grid (square + triangular variants) and the full editor screen
    TemporaryWatchSolveButton.vue   TEMPORARY dev tool -- auto-solves the current puzzle (see "Dev mode" above)

  fx/                                "Juice" -- optional-feeling polish, kept isolated from game logic
    haptics.js                       Safe navigator.vibrate() wrapper for jump/win buzzes
    sound.js                         Round-over chime
    watchSolve.js                    Shared "plan + play the best solution" logic (editor + temporary button)

  services/
    analytics.js                     The single seam to PostHog -- see docs/ANALYTICS.md
    viral.js                         Builds the spoiler-safe share text and copies it to the clipboard

  workers/
    puzzleAnalysisWorker.js          Runs the difficulty scorers off the main thread for the admin grid

scripts/
  check-solver.js                   Command-line self-check (see "Checking the solver" above)
  generate-puzzle-pool.js           Offline generator for a large candidate batch (see "How never repeats" above)
  freeze-and-shrink-pool.js         Freezes history, trims the working pool back down (see "How never repeats" above)
  precompute-english-cross.js       One-time offline solve baked into boards.js (see "How never repeats" above)
  analyze-puzzle-difficulty.js      Offline batch run of the two difficulty scorers, for the admin grid

vite-plugins/
  puzzleAdminServer.js              Dev-only Vite plugin: lets the admin grid write scheduledPuzzles.js straight to disk
```

## Design notes

- **A peg can only jump over another peg of its own color.** Board state is
  one `BigInt` bitmask *per color* (bit `i` set = a peg of that color at
  hole `i`), not one mask for the whole board -- see `logic/rules.js`.
- **Grid boards (heart, cross, square, diamond, octagon, ...) allow diagonal
  jumps** -- all 8 directions, not just the 4 straight ones.
- **Triangle, hexagon, and star share one "triangular lattice" coordinate
  system** (6 jump directions) -- a hexagon and a star are just different
  boundary shapes cut from the same underlying grid of points as the
  triangle. See the big comment in `logic/geometry.js` for the cube-
  coordinate math behind this. (Star is built but currently excluded from
  the catalog -- see the comment in `logic/boards.js`.)
- **The English cross (33 holes) is solved offline**, not live, because its
  search tree is too large to solve on every page load. Its answer is baked
  into `logic/boards.js` and double-checked by `scripts/check-solver.js`.
- **The daily puzzle is a pure function of a puzzle number** -- but not of
  the pool alone. `logic/daily.js` checks a hand-scheduled override, then a
  permanently frozen historical record, before ever falling back to the
  (periodically-refreshed, currently smaller) pool. See "How never repeats
  actually works" above for why.
- **There is no in-game hint.** The only ways to recover from a bad move are
  Undo (unlimited), Reset, and (once launched) Ghost Outline's "have I tried
  this before" memory aid -- never a hint about which move is actually good.
