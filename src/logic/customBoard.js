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

import { makeGridGeometry } from './geometry.js';
import { getEmptyHolesFromColors } from './rules.js';

/**
 * A design is a flat `rows` x `cols` grid where each cell is one of:
 *   'none'  -- not part of the board at all
 *   'empty' -- part of the board, starts as an empty hole
 *   a number (0..colorCount-1) -- part of the board, starts with a peg of that color
 *
 * @typedef {{rows: number, cols: number, cellStates: (string|number)[]}} BoardDesign
 */

/**
 * Converts a design into a playable/solvable board.
 *
 * @param {BoardDesign} design
 * @returns {{geometry: object, holeColors: number[], activeGridIndexes: number[]}}
 *   `activeGridIndexes` maps each geometry cell index back to its position
 *   in the original `cellStates` array (grid index = row * cols + col) --
 *   used to draw solver results back onto the editor grid.
 */
export function buildCustomBoardFromDesign(design) {
  const cellList = [];
  const holeColors = [];
  const activeGridIndexes = [];

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

  const geometry = makeGridGeometry(cellList);
  return { geometry, holeColors, activeGridIndexes };
}

/**
 * Builds a full puzzle object (the same shape logic/daily.js produces) from
 * a saved custom design, so it can be handed straight to useGame().
 *
 * @param {{name: string, rows: number, cols: number, cellStates: (string|number)[], colorCount: number, par: number[]}} savedPuzzle
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
  };
}

/**
 * Builds a full puzzle object from a scheduled (date-keyed) design -- see
 * logic/scheduledPuzzles.js. Unlike buildPlayablePuzzleFromDesign(), this
 * fills in the real puzzleNumber/date, since a scheduled puzzle *is* that
 * day's actual daily puzzle, not a one-off editor preview.
 *
 * @param {{boardName: string, rows: number, cols: number, cellStates: (string|number)[], colorCount: number, par: number[]}} scheduledDesign
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
  };
}
