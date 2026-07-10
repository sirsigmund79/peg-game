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
    intro: [
      "Word's gotten round the meadow: everyone's meeting at the old treehouse tonight.",
      "Not everyone's found their way through the tall grass yet -- same-color friends know the way for each other. Walk them through.",
    ],
    outroWin: ["Every last one found their way out of the meadow.", "Onward -- the orchard's just past that fence."],
    outroLeftover: [
      "A few are still finding their footing in the grass. No rush -- the path waits for them.",
      "Onward -- the orchard's just past that fence.",
    ],
    flavor: {
      onFirstMove: 'First hop through the grass. Off we go.',
      onLastPeg: 'Just the one left, taking their time about it.',
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
    intro: [
      "The orchard's heavy with fruit and half-asleep in the afternoon sun.",
      "Somewhere under these trees, everyone's trying to find their own kind before the light goes.",
    ],
    outroWin: ["Orchard's empty -- everyone's headed for the river."],
    outroLeftover: ["A couple are still napping under the branches. They'll catch up."],
    flavor: {
      onFirstMove: 'An apple drops somewhere. Unrelated, probably.',
      onLastPeg: 'One left, and it is in absolutely no hurry.',
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
    intro: [
      'The river forks here, and so does the path.',
      "Clear the way and you'll see both roads onward -- the long way past the bridge, or a shortcut straight to the treehouse for the bold.",
    ],
    outroWin: ["The riverbank's clear. Both paths onward are yours now -- take your pick."],
    outroLeftover: ["A few are still wading at the edge, unbothered. Both paths onward are still yours to take."],
    flavor: {
      onFirstMove: 'The water\'s cold. Everyone says so. Everyone gets in anyway.',
      onLastPeg: "Last one at the water's edge, working up the nerve.",
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
    intro: [
      "The old bridge creaks, but it's held for longer than anyone can remember.",
      'Everyone crossing wants a same-color hand to hold. Get them all across.',
    ],
    outroWin: ["Bridge is clear. The bramble patch is just on the other side."],
    outroLeftover: ["A few are still halfway across, taking it slow. The bridge isn't going anywhere."],
    flavor: {
      onFirstMove: 'The bridge creaks underfoot. Everyone pretends not to notice.',
      onLastPeg: 'One left on the bridge, admiring the view.',
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
    intro: [
      "The bramble patch is thick, thorny, and somehow everyone's favorite shortcut anyway.",
      'Same-color friends can guide each other through without a scratch. Get everyone clear.',
    ],
    outroWin: ["Bramble's clear, thorns and all. The treehouse lights are already up ahead."],
    outroLeftover: [
      'A few are still tangled up in there, in no real hurry to leave. The treehouse lights are still up ahead, whenever they\'re ready.',
    ],
    flavor: {
      onFirstMove: "Something rustles in the brambles. It's fine. Probably.",
      onLastPeg: 'One left in the thorns, apparently quite comfortable.',
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
    intro: [
      'The treehouse, lit up gold, right where the whole forest said it would be.',
      "Whoever's left just needs one last hand finding their way up. This is the last of it -- make it count.",
    ],
    outroWin: [
      "Everyone's up in the treehouse. The whole forest showed up, in the end.",
      "Somewhere below, the meadow's already humming with word of next season's gathering.",
    ],
    outroLeftover: [
      "Most everyone's made it up into the treehouse. A few are still finding the ladder -- there's no version of tonight where they're not welcome whenever they get there.",
    ],
    flavor: {
      onFirstMove: 'Up the ladder. Last leg of the trail.',
      onLastPeg: 'One left below the treehouse, looking up at all those lit windows.',
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
