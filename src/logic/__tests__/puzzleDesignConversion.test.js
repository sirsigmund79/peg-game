// ============================================================================
// logic/__tests__/puzzleDesignConversion.test.js
// ----------------------------------------------------------------------------
// The admin puzzle editor's entire "load a pool puzzle for editing" path
// depends on this conversion being lossless -- if it silently changed which
// cells are connected, an edited-and-resaved puzzle could quietly become a
// different (and possibly worse) board than the one being fixed. Round-trips
// every real BOARD_CATALOG shape (both grid and triangular-lattice) through
// convertBoardToDesign -> buildCustomBoardFromDesign and confirms the
// rebuilt geometry is isomorphic to the original: same cell count, same
// move count, and the same (translated) set of {position: color} pairs --
// translation-invariant because grid boards like diamond are centered at
// the origin with negative coordinates, while a design's canvas always
// starts at (0,0).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { convertBoardToDesign } from '../puzzleDesignConversion.js';
import { buildCustomBoardFromDesign } from '../customBoard.js';
import { BOARD_CATALOG } from '../boards.js';

/** Translated (zero-based bounding box), sorted "x,y:color" pairs -- position-and-color content independent of the board's own coordinate origin or cell ordering. */
function normalizedCellSet(geometry, holeColors) {
  const xs = geometry.cells.map((cell) => cell.x);
  const ys = geometry.cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return geometry.cells
    .map((cell, index) => `${cell.x - minX},${cell.y - minY}:${holeColors[index]}`)
    .sort()
    .join('|');
}

const GRID_BOARD_IDS = ['heart', 'anvil', 'ribbon', 'boot', 'kidney', 'crescent', 'square', 'diamond', 'octagon', 'brokenSquare'];
const TRIANGULAR_BOARD_IDS = ['triangle', 'hexagon'];

describe('convertBoardToDesign', () => {
  it.each(GRID_BOARD_IDS)('round-trips the grid board "%s" losslessly', (boardId) => {
    const geometry = BOARD_CATALOG[boardId].geometry;
    const holeColors = geometry.cells.map((_, index) => (index === 0 ? -1 : index % 2));

    const design = convertBoardToDesign(geometry, holeColors);
    expect(design.shape).toBe('grid');

    const rebuilt = buildCustomBoardFromDesign(design);
    expect(rebuilt.geometry.cellCount).toBe(geometry.cellCount);
    expect(rebuilt.geometry.moves).toHaveLength(geometry.moves.length);
    expect(normalizedCellSet(rebuilt.geometry, rebuilt.holeColors)).toBe(normalizedCellSet(geometry, holeColors));
  });

  it.each(TRIANGULAR_BOARD_IDS)('round-trips the triangular-lattice board "%s" losslessly', (boardId) => {
    const geometry = BOARD_CATALOG[boardId].geometry;
    const holeColors = geometry.cells.map((_, index) => (index === 0 ? -1 : index % 2));

    const design = convertBoardToDesign(geometry, holeColors);
    expect(design.shape).toBe('triangle');

    const rebuilt = buildCustomBoardFromDesign(design);
    expect(rebuilt.geometry.cellCount).toBe(geometry.cellCount);
    expect(rebuilt.geometry.moves).toHaveLength(geometry.moves.length);
    expect(normalizedCellSet(rebuilt.geometry, rebuilt.holeColors)).toBe(normalizedCellSet(geometry, holeColors));
  });

  it('marks every cell outside the actual board as "none", not just the ones touched by holeColors', () => {
    // Anvil (15 holes) sits inside a 5x3 bounding box but isn't a full
    // rectangle -- convertBoardToDesign's canvas must include genuine gaps.
    const geometry = BOARD_CATALOG.anvil.geometry;
    const holeColors = geometry.cells.map(() => 0);
    const design = convertBoardToDesign(geometry, holeColors);
    const noneCount = design.cellStates.filter((state) => state === 'none').length;
    expect(design.rows * design.cols - noneCount).toBe(geometry.cellCount);
    expect(noneCount).toBeGreaterThan(0);
  });

  it('picks the minimal triangular radius that still contains every real cell', () => {
    // Hexagon (radius 2, 19 holes) -- a bigger radius would still round-trip
    // correctly but would pad the design with more 'none' cells than needed.
    const geometry = BOARD_CATALOG.hexagon.geometry;
    const holeColors = geometry.cells.map(() => 0);
    const design = convertBoardToDesign(geometry, holeColors);
    expect(design.radius).toBe(2);
  });
});
