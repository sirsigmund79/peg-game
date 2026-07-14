// ============================================================================
// customBoard.js
// ----------------------------------------------------------------------------
// Turns an editor "design" (a simple grid of cell states from
// components/EditorGrid.vue) into a real board geometry + starting
// hole-colors list -- the exact same shape logic/boards.js produces for the
// built-in boards. This is the bridge that lets a hand-drawn layout be
// solved, watched, played, and saved exactly like any other board.
//
// No Vue code lives here -- composables/useEditor.js is the Vue-aware
// wrapper around this.
// ============================================================================

import { makeGridGeometry, makeCustomTriangularGeometry, listHexCanvasCells } from './geometry.js';
import { getEmptyHolesFromColors } from './rules.js';

/**
 * A design is a flat grid of cells where each cell is one of:
 *   'none'  -- not part of the board at all
 *   'empty' -- part of the board, starts as an empty hole
 *   a number (0..colorCount-1) -- part of the board, starts with a peg of that color
 *
 * `shape` picks how that flat array is laid out and connected:
 *   'grid'     (default, omitted `shape` means this) -- a `rows` x `cols`
 *              rectangle, 8-directional (straight + diagonal) jumps. This is
 *              the general-purpose designer -- fine for approximating most
 *              outlines, but a hand-drawn triangle on it needs a "doubled
 *              column" spacing trick to look evenly staggered, which quietly
 *              drops the within-row jumps a real triangle has (see
 *              buildCustomBoardFromDesign below).
 *   'triangle' -- a real triangular-lattice board, on a hexagon-shaped
 *              CANVAS of the given `radius` (see logic/geometry.js's
 *              listHexCanvasCells() -- radius 0 is a single cell, each step
 *              out adds a ring of 6*radius more), cellStates in that same
 *              order, 6-directional jumps. Individual cells can still be
 *              'none' to carve ANY shape out of that canvas -- a triangle,
 *              the hexagon itself, a star (two overlapping triangles), or
 *              anything else the lattice can represent -- only the canvas
 *              SIZE is fixed by `radius`, not which cells are used.
 *
 * @typedef {{shape?: 'grid'|'triangle', rows?: number, cols?: number, radius?: number, cellStates: (string|number)[]}} BoardDesign
 */

/**
 * Converts a design into a playable/solvable board.
 *
 * @param {BoardDesign} design
 * @returns {{geometry: object, holeColors: number[], activeGridIndexes: number[]}}
 *   `activeGridIndexes` maps each geometry cell index back to its position
 *   in the original `cellStates` array -- used to draw solver results back
 *   onto the editor grid.
 */
export function buildCustomBoardFromDesign(design) {
  const cellCoordinatesByIndex = design.shape === 'triangle' ? listHexCanvasCells(design.radius) : null;

  const cellList = [];
  const holeColors = [];
  const activeGridIndexes = [];

  if (design.shape === 'triangle') {
    cellCoordinatesByIndex.forEach((coordinate, index) => {
      const cellState = design.cellStates[index];
      if (cellState === 'none') return;

      cellList.push(coordinate);
      activeGridIndexes.push(index);
      holeColors.push(cellState === 'empty' ? -1 : cellState);
    });
  } else {
    for (let row = 0; row < design.rows; row++) {
      for (let col = 0; col < design.cols; col++) {
        const gridIndex = row * design.cols + col;
        const cellState = design.cellStates[gridIndex];
        if (cellState === 'none') continue;

        cellList.push({ x: col, y: row });
        activeGridIndexes.push(gridIndex);
        holeColors.push(cellState === 'empty' ? -1 : cellState);
      }
    }
  }

  const geometry = design.shape === 'triangle' ? makeCustomTriangularGeometry(cellList) : makeGridGeometry(cellList);
  return { geometry, holeColors, activeGridIndexes };
}

/**
 * Builds a full puzzle object (the same shape logic/daily.js produces) from
 * a saved custom design, so it can be handed straight to useGame().
 *
 * @param {{name: string} & BoardDesign & {colorCount: number, par: number[]}} savedPuzzle
 * @returns {object}
 */
export function buildPlayablePuzzleFromDesign(savedPuzzle) {
  const { geometry, holeColors } = buildCustomBoardFromDesign(savedPuzzle);
  return {
    puzzleNumber: null,
    date: null,
    boardId: 'custom',
    boardName: savedPuzzle.name || 'Custom design',
    geometry,
    holeColors,
    colorCount: savedPuzzle.colorCount,
    emptyHoles: getEmptyHolesFromColors(holeColors),
    label: 'Your design',
    par: savedPuzzle.par,
    cellCount: geometry.cellCount,
    // Hand-drawn designs have no BOARD_CATALOG entry to read a `liveSolve`
    // flag from, and are typically editor-sized (not the big built-in
    // shapes englishCross's `liveSolve: false` exists for) -- default to
    // true. The live Genius-reachability worker's own node budget (see
    // workers/reachabilityWorker.js) is the real safety net if a design
    // turns out to be unexpectedly large, not this flag.
    liveSolve: true,
  };
}

/**
 * Builds a full puzzle object from a scheduled (date-keyed) design -- see
 * logic/scheduledPuzzles.js. Unlike buildPlayablePuzzleFromDesign(), this
 * fills in the real puzzleNumber/date, since a scheduled puzzle *is* that
 * day's actual daily puzzle, not a one-off editor preview.
 *
 * @param {{boardName: string} & BoardDesign & {colorCount: number, par: number[]}} scheduledDesign
 * @param {number} puzzleNumber
 * @param {string} date - ISO date (YYYY-MM-DD)
 * @returns {object}
 */
export function buildDailyPuzzleFromDesign(scheduledDesign, puzzleNumber, date) {
  const { geometry, holeColors } = buildCustomBoardFromDesign(scheduledDesign);
  const emptyHoles = getEmptyHolesFromColors(holeColors);
  const holeWord = emptyHoles.length === 1 ? 'hole' : 'holes';
  return {
    puzzleNumber,
    date,
    boardId: 'scheduled',
    boardName: scheduledDesign.boardName || 'Custom design',
    geometry,
    holeColors,
    colorCount: scheduledDesign.colorCount,
    emptyHoles,
    label: `${emptyHoles.length} empty ${holeWord}`,
    par: scheduledDesign.par,
    cellCount: geometry.cellCount,
    // See the matching note in buildPlayablePuzzleFromDesign above -- no
    // BOARD_CATALOG entry to read `liveSolve` from for a hand-drawn design.
    liveSolve: true,
  };
}
