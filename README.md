# Dot Hop

A daily peg-solitaire puzzle (like the wooden triangle game on every Cracker
Barrel table), Wordle-style: everyone gets the same puzzle each day, worked
out purely from the date -- no server, no accounts.

**Status:** core play loop, a flat "minimal" theme (NYT Games-style: color
means something instead of decorating), haptics, a Wordle-style result
modal with clipboard sharing, a never-repeating puzzle pool across 8 board
shapes, and a level editor are all built and working. Jump/win animation,
sound, confetti, retro and space-age skins, and the monetization/backend
stubs have not been built yet.

## Running it

```
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). While
running in dev mode, you'll see **Play**/**Editor** tabs and a black
**DEV MODE** panel -- see "Dev mode" and "Level editor" below.

To build a static production bundle:

```
npm run build
```

The output goes to `dist/` and can be hosted on any static file host
(Netlify, Vercel, Cloudflare Pages, GitHub Pages, etc.) -- there is no
backend to deploy for core play.

## Checking the solver

The game's solver is the thing that guarantees every daily puzzle is
actually winnable down to 1 peg. You can re-run its self-check any time:

```
node scripts/check-solver.js
```

This confirms every board shape, spot-checks the puzzle pool, replays the
English cross's precomputed solution, and -- the big one -- proves that no
two days in a full pool cycle ever show the same puzzle. It should always
say `ALL CHECKS PASSED`.

## How "never repeats" actually works

`logic/puzzlePool.js` is a big, checked-in list of solver-verified starting
positions (currently **2,444** of them, across all 8 board shapes -- about
**6.7 years** of daily puzzles). It's generated offline by:

```
node scripts/generate-puzzle-pool.js
```

`logic/daily.js` assigns each day a different pool entry using a shuffled-
but-fixed order (a small number-theory trick -- see the comments in that
file), so no puzzle repeats until the entire pool has been used once. Only
re-run the generator if you change a board SHAPE (e.g. a different hexagon
radius) -- it can take several minutes, since it's solving thousands of
candidate boards.

## Dev mode

`npm run dev` shows **Play**/**Editor** tabs and a dev-only panel below the
controls that lets you jump to any puzzle number, jump back to today, or
jump forward to the next puzzle of a given shape -- handy for testing
shapes that don't come up often. All of this is gated by Vite's
`import.meta.env.DEV` flag, so it's automatically left out of
`npm run build`; there's no separate switch to remember to turn off.

There's also a red **"⚠ Watch Solve (temporary)"** button on the Play
screen in dev mode -- it auto-plays the rest of the current puzzle using
the solver. This was added for testing and is meant to be deleted later
(see the TODO comment at the top of `components/TemporaryWatchSolveButton.vue`).

## Analytics

The game is instrumented with [PostHog](https://posthog.com) -- see
[`docs/ANALYTICS.md`](docs/ANALYTICS.md) for the full event list, dashboards
worth building, future experiment ideas, and setup instructions (copy
`.env.example` to `.env.local` and add a PostHog project key to enable it
locally; without a key, the app runs exactly as before).

## Level editor

The **Editor** tab (dev mode only) lets you hand-design a board on a
clickable grid: click a cell to add a peg, click again to make it an empty
starting hole, click once more to remove it from the board entirely.

- **Calculate Max** runs the solver and reports the best possible outcome.
- **Watch Solve** plays that solution out on a preview board.
- **Save** stores the design in this browser's local storage ("My
  Puzzles"), where you can Play, Edit, or Delete it later.

Custom designs are **personal and local only** -- they never become an
actual shared daily puzzle. Every player has to see the exact same daily
puzzle, and there's no backend to hand a hand-made design out to anyone
else. If you want to explore the same design on another device, there's no
built-in export yet -- that would be a reasonable thing to add later.

## What each file does

```
index.html                          Page shell Vite loads into the browser (also loads the theme's web fonts)
src/
  main.js                           Boots the Vue app into #app
  App.vue                           Top-level screen: theme, Play/Editor tabs, loads a puzzle, lays out the pieces
  style.css                         Base page styles (real colors come from CSS variables set by useTheme.js)

  logic/                            PURE JAVASCRIPT -- no Vue in here. The "brain" of the game.
    geometry.js                     Board shapes: triangle/hexagon/star (triangular lattice) + grid boards (square/diamond/octagon/heart/cross)
    solver.js                       Memoized search: finds par (best possible outcome); optional node budget for offline use
    rules.js                        Applying a move, checking legality, detecting game-over, scoring rank
    boards.js                       The board catalog: one geometry per shape
    puzzlePool.js                   GENERATED: every solver-verified starting position, across all shapes
    daily.js                        Turns today's date into a specific pool entry, in a never-repeating order
    customBoard.js                  Turns an editor design into a real, playable board
    boardLayout.js                  Shared hole position/size math used by Board.vue and MiniBoard.vue

  composables/                      Small reactive state holders that connect logic -> screen
    useGame.js                      One playable round: current board, selection, undo stack, win state
    useTheme.js                     The active theme's colors/fonts, applied as CSS variables
    useEditor.js                    Level editor state: the grid, Calculate Max, Watch Solve, saved designs

  components/
    Board.vue                       Draws holes + pegs, positions them, handles taps -- also becomes the result screen's mini board (see `compact`/`masksOverride` props)
    MiniBoard.vue                   Small read-only board snapshot used by StoryMapView.vue's chapter map
    StatBar.vue                     Pegs left / moves / target chips above the board
    Controls.vue                    Undo + Reset buttons
    ResultHeader.vue                Result screen header: rank (sized by tier) + shy-of-GENIUS callout + date
    ResultToggle.vue                Result screen's "This game" / "Best" segmented control
    ResultStatRow.vue               Result screen's best-possible / actual score row
    ResultFooter.vue                Result screen's share + reset buttons
    DevPanel.vue                    Dev-only puzzle picker
    EditorGrid.vue                  The clickable design grid
    EditorView.vue                  Full editor screen: grid + toolbar + My Puzzles list
    TemporaryWatchSolveButton.vue   TEMPORARY dev tool -- auto-solves the current puzzle (see "Dev mode" above)

  fx/                                "Juice" -- optional-feeling polish, kept isolated from game logic
    haptics.js                       Safe navigator.vibrate() wrapper for jump/win buzzes
    watchSolve.js                    Shared "plan + play the best solution" logic (editor + temporary button)

  services/
    viral.js                         Builds the spoiler-safe share text and copies it to the clipboard

scripts/
  check-solver.js                   Command-line self-check: verifies every shape, the pool, and the no-repeat guarantee
  generate-puzzle-pool.js           Offline generator for logic/puzzlePool.js (run after changing a board shape)
  precompute-english-cross.js       One-time offline solve used to generate the English cross data
                                     baked into boards.js (that board is too big to solve live)
```

## Design notes

- **Boards are bitmasks.** A board position is one `BigInt` where bit `i` is
  1 if hole `i` has a peg. This makes the solver's search both fast and easy
  to memoize (see `logic/solver.js`).
- **Grid boards (heart, cross, square, diamond, octagon) allow diagonal
  jumps** -- all 8 directions, not just the 4 straight ones.
- **Triangle, hexagon, and star share one "triangular lattice" coordinate
  system** (6 jump directions) -- a hexagon and a star are just different
  boundary shapes cut from the same underlying grid of points as the
  triangle. See the big comment in `logic/geometry.js` for the cube-
  coordinate math behind this.
- **The English cross (33 holes) is solved offline**, not live, because its
  search tree is too large to solve on every page load. Its answer is baked
  into `logic/boards.js` and double-checked by `scripts/check-solver.js`.
- **The daily puzzle is a pure function of the date.** `logic/daily.js` never
  needs a network call or a database -- given a puzzle number, it always
  produces the same puzzle, and the pool guarantees ~6.7 years pass before
  any repeat.
- **There is no in-game hint.** The only way to recover from a bad move is
  Undo (unlimited) or Reset. (The temporary Watch Solve button is a dev
  tool, not a player-facing hint system.)
