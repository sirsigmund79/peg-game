// ============================================================================
// puzzleDesignConversion.js
// ----------------------------------------------------------------------------
// The admin puzzle editor needs every puzzle to be editable in the SAME
// "design" format (see customBoard.js's BoardDesign typedef) the level
// editor already works with -- but only logic/scheduledPuzzles.js entries
// are already in that shape. A pool-sourced puzzle (logic/puzzlePool.js) is
// `{boardId, holeColors}`, referencing a fixed BOARD_CATALOG shape, with no
// 'none'-padded canvas of its own. This file is the missing reverse
// conversion: geometry cells + holeColors -> a BoardDesign, so ANY puzzle
// (pool or scheduled) can be loaded into the editor for editing.
//
// No Vue code lives here.
// ============================================================================

import { listHexCanvasCells } from './geometry.js';

function coordinateKey(x, y) {
  return x + ',' + y;
}

/** Same (q=x, r=-y, s=y-x) cube-coordinate convention geometry.js uses internally, duplicated here per this codebase's small-helper-duplication convention (see puzzlePerceivedDifficulty.js for the same pattern). */
function toCubeCoordinate(x, y) {
  return { q: x, r: -y, s: y - x };
}

/** The smallest hex-canvas radius (see geometry.js's listHexCanvasCells) that contains every one of `cells`. */
function findMinimalTriangularRadius(cells) {
  let radius = 0;
  for (const { x, y } of cells) {
    const { q, r, s } = toCubeCoordinate(x, y);
    radius = Math.max(radius, Math.abs(q), Math.abs(r), Math.abs(s));
  }
  return radius;
}

/**
 * Converts a triangular-lattice board (geometry.layoutStyle === 'triangular-lattice')
 * into an editable design: the smallest hex canvas that contains every real
 * cell, with every cell outside the actual board marked 'none'.
 *
 * @param {{cells:{x:number,y:number}[]}} geometry
 * @param {number[]} holeColors - holeColors[i] aligned to geometry.cells[i]
 * @returns {{shape:'triangle', radius:number, cellStates:(string|number)[]}}
 */
function convertTriangularBoardToDesign(geometry, holeColors) {
  const radius = findMinimalTriangularRadius(geometry.cells);
  const stateByCoordinate = new Map();
  geometry.cells.forEach((cell, index) => {
    const color = holeColors[index];
    stateByCoordinate.set(coordinateKey(cell.x, cell.y), color === -1 ? 'empty' : color);
  });

  const cellStates = listHexCanvasCells(radius).map((cell) => stateByCoordinate.get(coordinateKey(cell.x, cell.y)) ?? 'none');
  return { shape: 'triangle', radius, cellStates };
}

/**
 * Converts a grid board (geometry.layoutStyle === 'grid') into an editable
 * design: the board's own bounding box as the rows x cols canvas, with every
 * cell outside the actual board marked 'none'.
 *
 * @param {{cells:{x:number,y:number}[]}} geometry
 * @param {number[]} holeColors
 * @returns {{shape:'grid', rows:number, cols:number, cellStates:(string|number)[]}}
 */
function convertGridBoardToDesign(geometry, holeColors) {
  const xs = geometry.cells.map((cell) => cell.x);
  const ys = geometry.cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = Math.max(...ys) - minY + 1;

  const cellStates = new Array(rows * cols).fill('none');
  geometry.cells.forEach((cell, index) => {
    const row = cell.y - minY;
    const col = cell.x - minX;
    const color = holeColors[index];
    cellStates[row * cols + col] = color === -1 ? 'empty' : color;
  });

  return { shape: 'grid', rows, cols, cellStates };
}

/**
 * Converts ANY puzzle's geometry + holeColors into an editable BoardDesign
 * (see customBoard.js). Dispatches on `geometry.layoutStyle`, same flag
 * every board (built-in or custom) already carries.
 *
 * @param {{layoutStyle:string, cells:{x:number,y:number}[]}} geometry
 * @param {number[]} holeColors
 * @returns {import('./customBoard.js').BoardDesign}
 */
export function convertBoardToDesign(geometry, holeColors) {
  return geometry.layoutStyle === 'triangular-lattice'
    ? convertTriangularBoardToDesign(geometry, holeColors)
    : convertGridBoardToDesign(geometry, holeColors);
}
