// ============================================================================
// logic/story/boardMeetingChapters.js
// ----------------------------------------------------------------------------
// Content for the "Board Meeting" story-mode prototype (hidden behind
// "#/story" -- see components/StoryView.vue and App.vue). Every peg is a
// soul waiting to be "processed" by an under-resourced afterlife intake
// office; the player is the clerk. Each chapter is a different branch
// office the clerk gets rotated through, reskinned via `themeOverrides`
// (the same CSS variables composables/useTheme.js defines) but otherwise
// playing exactly like any other board.
//
// Pure data -- no Vue, no game logic. logic/story/story.js turns a chapter's
// `boardId` into an actual playable puzzle.
// ============================================================================

export const BOARD_MEETING_CHAPTERS = [
  {
    id: 'intake-desk',
    title: 'Branch Office: The Triangle (Intake)',
    boardId: 'triangle',
    themeOverrides: {
      '--color-page-bg': '#eef1ea',
      '--color-header-bg': '#4a5a52',
      '--color-header-text': '#ffffff',
      '--color-header-text-dim': '#c9d4cd',
      '--color-board-plate': '#dfd9c3',
      '--color-peg': '#3c6e5c',
      '--color-accent': '#3c6e5c',
    },
    intro: [
      "First day. You're the new clerk.",
      'Everyone here is a soul waiting to be "processed" and sent on. Processing just means: clear the board.',
      'Same rule as anywhere else -- a soul only trusts its own kind enough to be walked out by them. Jump your own color, clear as many as you can.',
    ],
    outroWin: [
      'Fully processed. All of them, gone on to wherever comes next.',
      'Your supervisor seems mildly disappointed you did it correctly on day one.',
    ],
    outroLeftover: [
      "Didn't clear everyone. That's fine -- nobody clears everyone.",
      "The ones still on the board aren't stuck. They're re-filed for next shift. Same seat, same queue number, no harm done.",
    ],
    flavor: {
      onFirstMove: 'First case, moving. Try not to think too hard about what "moving on" means.',
      onLastPeg: 'Down to one. That one always looks a little smug about it.',
    },
  },
  {
    id: 'ferry-terminal',
    title: 'Branch Office: The Crescent (Ferry Terminal)',
    boardId: 'crescent',
    themeOverrides: {
      '--color-page-bg': '#e8f2f2',
      '--color-header-bg': '#1d4e5c',
      '--color-header-text': '#ffffff',
      '--color-header-text-dim': '#bfe0e0',
      '--color-board-plate': '#a9cdd1',
      '--color-peg': '#0f3540',
      '--color-accent': '#0f3540',
    },
    intro: [
      "Transferred to the ferry terminal branch. Nobody explains why the afterlife needs a ferry terminal.",
      "The queue here is longer, but the rule hasn't changed: same color, same trust, same jump.",
    ],
    outroWin: [
      'Terminal cleared. The tide, or whatever passes for one back here, goes out.',
      'A form arrives congratulating you. It is addressed to your predecessor.',
    ],
    outroLeftover: [
      "A few are still waiting on the dock. Nothing wrong with that.",
      "Truth is, some of them like it here. One's been re-filed eleven shifts running and keeps requesting the same bench.",
    ],
    flavor: {
      onFirstMove: 'The dock creaks. Probably nothing.',
      onLastPeg: 'Last one on the pier. It is, unmistakably, judging your technique.',
    },
  },
  {
    id: 'frontier-outpost',
    title: 'Branch Office: The Boot (Frontier Outpost)',
    boardId: 'boot',
    themeOverrides: {
      '--color-page-bg': '#f7ecdd',
      '--color-header-bg': '#8a5a34',
      '--color-header-text': '#fff7ec',
      '--color-header-text-dim': '#e8ccae',
      '--color-board-plate': '#d9a066',
      '--color-peg': '#5e3a1e',
      '--color-accent': '#5e3a1e',
    },
    intro: [
      "The frontier outpost. Dust, a single fan, and a queue that has clearly been here a while.",
      "One of them -- the same one, every shift -- has been re-filed so many times the paperwork has its own paperwork. It's not stuck. It's a regular.",
      'Process what you can. Nobody\'s keeping score. (Somebody is keeping score.)',
    ],
    outroWin: [
      'Outpost cleared, including the regular -- who leaves a comment card that just says "rude."',
      'Somewhere, a supervisor updates a spreadsheet you will never be allowed to see.',
    ],
    outroLeftover: [
      "The regular is, once again, still here. This is understood to be intentional.",
      "Filed for next shift. The fan keeps spinning. Nothing here was ever in a hurry.",
    ],
    flavor: {
      onFirstMove: "Somewhere behind you, the regular sighs, deeply, on principle.",
      onLastPeg: 'One left. The fan slows down, like it also wants to see how this goes.',
    },
  },
];
