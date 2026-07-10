// ============================================================================
// logic/story/forestTrailLevels.js
// ----------------------------------------------------------------------------
// Content for the "Forest Trail" story-mode prototype (hidden behind
// "#/story" -- see components/StoryView.vue, StoryMapView.vue,
// StoryChapterView.vue). Woodland friends are gathering at the old
// treehouse for the season's end, and the player clears the way, stop by
// stop, along the trail.
//
// FOREST_TRAIL_NODES is the map's levels; TRAIL_EDGES is the path drawn
// between them. Riverside forks: the normal trail continues through Old
// Bridge and Bramble Patch, or a shortcut edge cuts straight to the
// Treehouse Gathering (the hardest board, and the finale either way) --
// see logic/story/story.js's isNodeUnlocked() for how that fork actually
// unlocks both branches at once.
//
// Each node's `friends` are the animals hidden under specific starting
// pegs -- clearing a friend's hole (by any legal jump, same rules as
// always) reveals them; winning means every friend on that board is
// revealed by the time no moves remain (see logic/story/story.js's
// getChapterPuzzle(), and useGame.js's hasWon). Every friend index below
// was picked from a REAL solver-reconstructed solution for that node's
// exact puzzle (see the "friend-hole candidates" step in the story-mode
// plan) -- an originally-occupied hole that a genuine winning line of play
// leaves empty -- so every node is guaranteed solvable, not just
// plausible-looking.
//
// Pure data -- no Vue, no game logic.
// ============================================================================

export const FOREST_TRAIL_NODES = [
  {
    id: 'meadow',
    mapLabel: 'Meadow',
    title: 'The Meadow',
    boardId: 'triangle',
    position: { x: 22, y: 8 },
    themeOverrides: {
      '--color-page-bg': '#f3f9e8',
      '--color-header-bg': '#5a9e2f',
      '--color-board-plate': '#bfe38a',
      '--color-peg': '#5a9e2f',
      '--color-accent': '#5a9e2f',
    },
    friends: [{ index: 7, emoji: '🐰' }],
    intro: [
      "Word's gotten round the meadow: everyone's meeting at the old treehouse tonight.",
      "There's a rabbit hiding somewhere under the grass, waiting for a same-color friend to clear the way. Find them.",
    ],
    outroWin: ["The rabbit's out and stretching in the sun.", "Onward -- the orchard's just past that fence."],
    outroLeftover: [
      "Still just grass and quiet out there. The rabbit's in no rush -- the path waits for them.",
    ],
    flavor: {
      onFirstMove: 'First hop through the grass. Off we go.',
      onLastPeg: 'Just the one peg left between here and a rabbit.',
    },
  },
  {
    id: 'orchard',
    mapLabel: 'Orchard',
    title: 'The Orchard',
    boardId: 'heart',
    position: { x: 72, y: 22 },
    themeOverrides: {
      '--color-page-bg': '#fdf1f4',
      '--color-header-bg': '#c9698f',
      '--color-board-plate': '#f5c6d6',
      '--color-peg': '#c9698f',
      '--color-accent': '#c9698f',
    },
    friends: [
      { index: 3, emoji: '🐿️' },
      { index: 13, emoji: '🐿️' },
    ],
    intro: [
      "The orchard's heavy with fruit and half-asleep in the afternoon sun.",
      'A couple of squirrels have squirreled themselves away under the branches. Clear their way out.',
    ],
    outroWin: ["Both squirrels are out and climbing -- orchard's empty, everyone's headed for the river."],
    outroLeftover: ['One squirrel found their way. The other is still napping under the branches -- no hurry.'],
    flavor: {
      onFirstMove: 'An apple drops somewhere. Unrelated, probably.',
      onLastPeg: 'One peg left between a squirrel and the afternoon sun.',
    },
  },
  {
    id: 'riverside',
    mapLabel: 'Riverside',
    title: 'The Riverside',
    boardId: 'crescent',
    position: { x: 28, y: 38 },
    themeOverrides: {
      '--color-page-bg': '#eef6fa',
      '--color-header-bg': '#2e7ea3',
      '--color-board-plate': '#a9d7e8',
      '--color-peg': '#2e7ea3',
      '--color-accent': '#2e7ea3',
    },
    friends: [
      { index: 6, emoji: '🐸' },
      { index: 16, emoji: '🐸' },
    ],
    intro: [
      'The river forks here, and so does the path.',
      "Two frogs are tucked in under the rocks, waiting on same-color friends to clear their way to the water.",
    ],
    outroWin: [
      "Both frogs make the leap into the river. The riverbank's clear -- both paths onward are yours now, take your pick.",
    ],
    outroLeftover: ["One frog made it to the water. The other's still tucked under its rock, unbothered."],
    flavor: {
      onFirstMove: "The water's cold. Everyone says so. Everyone gets in anyway.",
      onLastPeg: "Last peg at the water's edge, working up the nerve.",
    },
  },
  {
    id: 'oldBridge',
    mapLabel: 'Old Bridge',
    title: 'The Old Bridge',
    boardId: 'anvil',
    position: { x: 74, y: 54 },
    themeOverrides: {
      '--color-page-bg': '#f5efe2',
      '--color-header-bg': '#7a5a34',
      '--color-board-plate': '#c9a876',
      '--color-peg': '#7a5a34',
      '--color-accent': '#7a5a34',
    },
    friends: [
      { index: 3, emoji: '🦉' },
      { index: 8, emoji: '🦉' },
      { index: 13, emoji: '🦉' },
    ],
    intro: [
      "The old bridge creaks, but it's held for longer than anyone can remember.",
      "Three owls are roosted under the boards, blinking, waiting for same-color friends to clear a path up.",
    ],
    outroWin: ["All three owls blink awake on the railing. Bridge is clear -- the bramble patch is just on the other side."],
    outroLeftover: ["A couple of owls made it up. At least one's still roosted below, in no hurry at all."],
    flavor: {
      onFirstMove: 'The bridge creaks underfoot. Everyone pretends not to notice.',
      onLastPeg: 'One peg left between here and an owl.',
    },
  },
  {
    id: 'bramble',
    mapLabel: 'Bramble Patch',
    title: 'The Bramble Patch',
    boardId: 'boot',
    position: { x: 30, y: 70 },
    themeOverrides: {
      '--color-page-bg': '#f6effa',
      '--color-header-bg': '#7d4a96',
      '--color-board-plate': '#d3b3e0',
      '--color-peg': '#7d4a96',
      '--color-accent': '#7d4a96',
    },
    friends: [
      { index: 2, emoji: '🦔' },
      { index: 9, emoji: '🦔' },
      { index: 14, emoji: '🦔' },
    ],
    intro: [
      "The bramble patch is thick, thorny, and somehow everyone's favorite shortcut anyway.",
      "Three hedgehogs have curled up right in the thorns -- fitting, honestly. Same-color friends can guide them out without a scratch.",
    ],
    outroWin: ["All three hedgehogs uncurl and waddle clear. Bramble's done, thorns and all -- the treehouse lights are already up ahead."],
    outroLeftover: [
      "A couple of hedgehogs made it out. At least one's still curled up in there, in no real hurry to leave.",
    ],
    flavor: {
      onFirstMove: "Something rustles in the brambles. It's fine. Probably.",
      onLastPeg: 'One peg left between here and a very patient hedgehog.',
    },
  },
  {
    id: 'treehouse',
    mapLabel: 'Treehouse',
    title: 'The Treehouse Gathering',
    boardId: 'hexagon',
    position: { x: 55, y: 88 },
    themeOverrides: {
      '--color-page-bg': '#fdf3e3',
      '--color-header-bg': '#b5651d',
      '--color-board-plate': '#f0b23a',
      '--color-peg': '#b5651d',
      '--color-accent': '#b5651d',
    },
    friends: [
      { index: 3, emoji: '🐝' },
      { index: 6, emoji: '🐝' },
      { index: 13, emoji: '🐝' },
      { index: 17, emoji: '🐝' },
    ],
    intro: [
      'The treehouse, lit up gold, right where the whole forest said it would be.',
      "A whole hive's worth of bees is tucked into the honeycomb-shaped hollows out front. Clear the way for every last one -- this is the last of it, make it count.",
    ],
    outroWin: [
      "Every bee finds its way home, humming. The whole forest showed up, in the end.",
      "Somewhere below, the meadow's already humming with word of next season's gathering.",
    ],
    outroLeftover: [
      "Most of the hive made it in. A few bees are still waiting on their hollow -- there's no version of tonight where they're not welcome whenever they get there.",
    ],
    flavor: {
      onFirstMove: 'Up the ladder. Last leg of the trail.',
      onLastPeg: 'One peg left between here and a very patient bee.',
    },
  },
];

// The path drawn on the map. Riverside forks: the normal route continues to
// Old Bridge, while the `shortcut` edge cuts straight to the finale -- both
// edges originate at Riverside, so clearing Riverside decently unlocks both
// at once (see logic/story/story.js's isNodeUnlocked()).
export const TRAIL_EDGES = [
  { from: 'meadow', to: 'orchard' },
  { from: 'orchard', to: 'riverside' },
  { from: 'riverside', to: 'oldBridge' },
  { from: 'oldBridge', to: 'bramble' },
  { from: 'bramble', to: 'treehouse' },
  { from: 'riverside', to: 'treehouse', shortcut: true },
];
