// ============================================================================
// boards.js
// ----------------------------------------------------------------------------
// This file is the "board catalog": every board SHAPE the game knows how to
// play. It only describes shapes (geometry) -- it does NOT decide which
// starting configs are good puzzles. That's a separate, much bigger list
// generated offline by scripts/generate-puzzle-pool.js and stored in
// logic/puzzlePool.js. daily.js combines the two: it picks a config from
// the pool, then looks up that config's board shape here.
//
// No Vue code lives here -- just shapes and IDs.
// ============================================================================

import {
  makeTriangleGeometry,
  makeGridGeometry,
  makeHexagonGeometry,
  makeStarGeometry,
  makeSquareGeometry,
  makeDiamondGeometry,
  makeOctagonGeometry,
  findCellIndex,
} from './geometry.js';

// ----------------------------------------------------------------------------
// Triangle (15 holes) -- the everyday board
// ----------------------------------------------------------------------------
export const TRIANGLE_GEOMETRY = makeTriangleGeometry(5);

// ----------------------------------------------------------------------------
// Heart (16 holes) -- straight + diagonal jumps
// ----------------------------------------------------------------------------
const HEART_CELLS = [
  { x: 1, y: 0 }, { x: 3, y: 0 },
  { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 },
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
  { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
  { x: 2, y: 4 },
];
export const HEART_GEOMETRY = makeGridGeometry(HEART_CELLS);

// ----------------------------------------------------------------------------
// Anvil (15 holes) -- a squat 5x4 block, notched unevenly top-left/top-right
// ----------------------------------------------------------------------------
const ANVIL_CELLS = [
  { x: 1, y: 0 }, { x: 2, y: 0 },
  { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
  { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
];
export const ANVIL_GEOMETRY = makeGridGeometry(ANVIL_CELLS);

// ----------------------------------------------------------------------------
// Ribbon (16 holes) -- a thick diagonal band, 4 cells wide the whole way
// ----------------------------------------------------------------------------
const RIBBON_CELLS = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
  { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 },
  { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
  { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 },
];
export const RIBBON_GEOMETRY = makeGridGeometry(RIBBON_CELLS);

// ----------------------------------------------------------------------------
// Boot (14 holes) -- a narrow ankle over a wide foot, like a chunky "L"
// ----------------------------------------------------------------------------
const BOOT_CELLS = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
  { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
  { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
];
export const BOOT_GEOMETRY = makeGridGeometry(BOOT_CELLS);

// ----------------------------------------------------------------------------
// Hexagon (19 holes) -- straight + diagonal jumps, on the triangular lattice
// ----------------------------------------------------------------------------
export const HEXAGON_GEOMETRY = makeHexagonGeometry(2);

// ----------------------------------------------------------------------------
// Kidney (23 holes) -- a 6x5 block with a staggered bite out of one corner
// ----------------------------------------------------------------------------
const KIDNEY_CELLS = [];
for (let y = 0; y < 5; y++) {
  for (let x = 0; x < 6; x++) {
    if (y === 0 && x >= 2) continue; // top-right: widest bite
    if (y === 1 && x >= 4) continue;
    if (y === 2 && x >= 5) continue;
    KIDNEY_CELLS.push({ x, y });
  }
}
export const KIDNEY_GEOMETRY = makeGridGeometry(KIDNEY_CELLS);

// ----------------------------------------------------------------------------
// Crescent (22 holes) -- a thick, asymmetric arc across a 7x5 box
// ----------------------------------------------------------------------------
const CRESCENT_CELLS = [
  { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
  { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
  { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
];
export const CRESCENT_GEOMETRY = makeGridGeometry(CRESCENT_CELLS);

// ----------------------------------------------------------------------------
// Star / "combined triangles" (37 holes) -- two overlapping triangles
// ----------------------------------------------------------------------------
export const STAR_GEOMETRY = makeStarGeometry(2);

// ----------------------------------------------------------------------------
// Square (25 holes) -- straight + diagonal jumps
// ----------------------------------------------------------------------------
export const SQUARE_GEOMETRY = makeSquareGeometry(5);

// ----------------------------------------------------------------------------
// Diamond (25 holes) -- straight + diagonal jumps
// ----------------------------------------------------------------------------
export const DIAMOND_GEOMETRY = makeDiamondGeometry(3);

// ----------------------------------------------------------------------------
// Octagon (37 holes) -- straight + diagonal jumps
// ----------------------------------------------------------------------------
export const OCTAGON_GEOMETRY = makeOctagonGeometry(7, 2);

// ----------------------------------------------------------------------------
// Broken Square (29 holes) -- a 6x6 block missing a 2x3 notch from one
// corner and a single-cell nick from the opposite corner
// ----------------------------------------------------------------------------
function buildBrokenSquareCells() {
  const cells = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const isTopRightNotch = x >= 4 && y <= 2;
      const isBottomLeftNick = x === 0 && y === 5;
      if (!isTopRightNotch && !isBottomLeftNick) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}
export const BROKEN_SQUARE_GEOMETRY = makeGridGeometry(buildBrokenSquareCells());

// ----------------------------------------------------------------------------
// English cross (33 holes) -- the "boss" board (straight + diagonal jumps)
// ----------------------------------------------------------------------------
// A 7x7 grid with the four 2x2 corners removed. This board's search tree is
// too big to solve live on every page load (see solver.js notes), so its
// par is PRECOMPUTED OFFLINE (below) instead of enumerated by
// scripts/generate-puzzle-pool.js like the other shapes.
function buildEnglishCrossCells() {
  const cells = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const isRemovedCorner = (x < 2 || x > 4) && (y < 2 || y > 4);
      if (!isRemovedCorner) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}
export const ENGLISH_CROSS_GEOMETRY = makeGridGeometry(buildEnglishCrossCells());
export const ENGLISH_CROSS_EMPTY_HOLES = [findCellIndex(ENGLISH_CROSS_GEOMETRY, 3, 3)];

// Filled in by scripts/precompute-english-cross.js -- holeColors[i] is the
// color index (0..3) of the peg starting at hole i, or -1 for the one
// starting empty hole (the center).
export const ENGLISH_CROSS_HOLE_COLORS = [
  3, 3, 3, 3, 3, 0, 1, 1, 1, 3, 0, 0, 0, 1, 1, 1, -1, 0, 0, 0, 1, 1, 1, 2, 0, 0, 0, 2, 2, 0, 2, 2, 2,
];

// Filled in by scripts/precompute-english-cross.js. `par` is the fewest
// pegs of each color (index-aligned with color) the solver proved
// achievable, and `solutionMoves` is a full sequence of {from, over, to}
// triples that takes the board from its start down to that result.
export const ENGLISH_CROSS_PRECOMPUTED = {
  par: [2, 1, 2, 2],
  solutionMoves: [
    { from: 4, over: 9, to: 16 },
    { from: 18, over: 10, to: 4 },
    { from: 12, over: 11, to: 10 },
    { from: 25, over: 17, to: 9 },
    { from: 9, over: 10, to: 11 },
    { from: 7, over: 8, to: 9 },
    { from: 20, over: 14, to: 8 },
    { from: 6, over: 13, to: 20 },
    { from: 26, over: 19, to: 12 },
    { from: 29, over: 24, to: 17 },
    { from: 27, over: 28, to: 29 },
    { from: 12, over: 11, to: 10 },
    { from: 9, over: 8, to: 7 },
    { from: 0, over: 3, to: 8 },
    { from: 15, over: 22, to: 27 },
    { from: 32, over: 29, to: 24 },
    { from: 23, over: 24, to: 25 },
    { from: 4, over: 10, to: 18 },
    { from: 17, over: 18, to: 19 },
    { from: 27, over: 21, to: 13 },
    { from: 2, over: 1, to: 0 },
    { from: 20, over: 13, to: 6 },
    { from: 8, over: 16, to: 24 },
    { from: 6, over: 7, to: 8 },
    { from: 30, over: 31, to: 32 },
  ],
};

// ----------------------------------------------------------------------------
// The catalog itself -- maps a board id to its shape. daily.js and the
// level editor both look boards up by id.
//
// `liveSolve: true` means it's cheap enough to run the solver on it at
// page-load time (used by the editor's "Calculate Max" / "Watch Solve",
// and as a sanity double-check elsewhere). `liveSolve: false` (English
// cross only) means: trust the precomputed par above instead of re-solving
// on every load -- its search tree is the one exception that's too slow
// for that pattern (see solver.js notes).
// ----------------------------------------------------------------------------
// NOTE: the star shape (STAR_GEOMETRY, still built above) is deliberately
// left out of the catalog for now -- pulled during the multi-color beta
// since it doesn't need "hundreds of puzzles" worth of every shape yet.
// Re-adding it later is a one-line change: add back
// `star: { id: 'star', name: 'Star', geometry: STAR_GEOMETRY, liveSolve: true },`
// below, then rerun scripts/generate-puzzle-pool.js (it already supports
// this shape -- see SHAPES_TO_ENUMERATE there).
export const BOARD_CATALOG = {
  triangle: { id: 'triangle', name: 'Triangle', geometry: TRIANGLE_GEOMETRY, liveSolve: true },
  heart: { id: 'heart', name: 'Heart', geometry: HEART_GEOMETRY, liveSolve: true },
  anvil: { id: 'anvil', name: 'Anvil', geometry: ANVIL_GEOMETRY, liveSolve: true },
  ribbon: { id: 'ribbon', name: 'Ribbon', geometry: RIBBON_GEOMETRY, liveSolve: true },
  boot: { id: 'boot', name: 'Boot', geometry: BOOT_GEOMETRY, liveSolve: true },
  hexagon: { id: 'hexagon', name: 'Hexagon', geometry: HEXAGON_GEOMETRY, liveSolve: true },
  kidney: { id: 'kidney', name: 'Kidney', geometry: KIDNEY_GEOMETRY, liveSolve: true },
  crescent: { id: 'crescent', name: 'Crescent', geometry: CRESCENT_GEOMETRY, liveSolve: true },
  square: { id: 'square', name: 'Square', geometry: SQUARE_GEOMETRY, liveSolve: true },
  diamond: { id: 'diamond', name: 'Diamond', geometry: DIAMOND_GEOMETRY, liveSolve: true },
  octagon: { id: 'octagon', name: 'Octagon', geometry: OCTAGON_GEOMETRY, liveSolve: true },
  brokenSquare: { id: 'brokenSquare', name: 'Broken Square', geometry: BROKEN_SQUARE_GEOMETRY, liveSolve: true },
  englishCross: {
    id: 'englishCross',
    name: 'English Cross',
    geometry: ENGLISH_CROSS_GEOMETRY,
    liveSolve: false,
    precomputed: ENGLISH_CROSS_PRECOMPUTED,
  },
};
