// ============================================================================
// logic/boardLayout.js
// ----------------------------------------------------------------------------
// Shared "how do we draw this board shape on screen" math, used by both
// Board.vue (the real, playable board) and PuzzleGlyph.vue (the small
// pointillist puzzle preview in the archive) -- so hole positioning and
// sizing rules can never quietly drift apart between them.
//
// No Vue code lives here -- these are plain functions over a
// logic/geometry.js geometry object.
// ============================================================================

// We give the board a little breathing room around the edges so pegs at
// the very edge of the shape aren't cut off or touching the wall.
const EDGE_PADDING_PERCENT = 10;

// The largest a hole is ever allowed to be -- what every board looked like
// before per-board sizing existed, so a sparse board (like the 15-hole
// triangle) still looks exactly as it always has.
const HOLE_SIZE_MAX_PERCENT = 15;

// How much of the tightest neighbor-to-neighbor gap a hole may fill -- the
// rest stays as visible board between adjacent pegs.
const HOLE_SIZE_GAP_FACTOR = 0.8;

/**
 * Turns every hole's raw (x, y) board coordinate into a 0-100 position
 * usable as CSS left%/top% for that hole. This is display math only (not a
 * game rule), which is why it lives here instead of in logic/geometry.js.
 *
 * @param {object} geometry - from logic/geometry.js
 * @returns {{x:number, y:number, left:string, top:string}[]}
 */
export function computeDisplayPositions(geometry) {
  const cells = geometry.cells;

  // Triangular-lattice boards (triangle, hexagon, star) store (x, y) as
  // (col, row) -- that's perfect for generating jump directions, but drawn
  // as-is it comes out skewed. Shifting each row left by half its row
  // number turns it back into the proper, evenly-spaced shape.
  const displayCells =
    geometry.layoutStyle === 'triangular-lattice'
      ? cells.map((cell) => ({ x: cell.x - cell.y / 2, y: cell.y }))
      : cells;

  const xValues = displayCells.map((cell) => cell.x);
  const yValues = displayCells.map((cell) => cell.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);

  // Guard against a board that's a single row/column wide, so we don't
  // divide by zero.
  const widthSpan = Math.max(1, maxX - minX);
  const heightSpan = Math.max(1, maxY - minY);

  const usablePercent = 100 - EDGE_PADDING_PERCENT * 2;

  return displayCells.map((cell) => {
    const x = EDGE_PADDING_PERCENT + ((cell.x - minX) / widthSpan) * usablePercent;
    const y = EDGE_PADDING_PERCENT + ((cell.y - minY) / heightSpan) * usablePercent;
    return { x, y, left: x + '%', top: y + '%' };
  });
}

/**
 * A board with more holes packed into the same space (e.g. the 37-hole
 * star) needs smaller holes than a sparse one (e.g. the 15-hole triangle)
 * -- otherwise neighboring pegs touch or overlap. Rather than hardcoding a
 * size per board shape, this measures the actual on-screen distance
 * between every pair of holes that's a legal single-step neighbor (using
 * geometry.neighborPairs) and sizes every hole off the TIGHTEST of those
 * gaps, capped so it never grows past what a sparse board already looked
 * like.
 *
 * @param {object} geometry
 * @param {{x:number, y:number}[]} positions - from computeDisplayPositions()
 * @returns {number} a hole diameter, as a percent of the board's own width/height
 */
export function computeHoleDiameterPercent(geometry, positions) {
  let tightestGapPercent = Infinity;
  for (const { a, b } of geometry.neighborPairs) {
    const dx = positions[a].x - positions[b].x;
    const dy = positions[a].y - positions[b].y;
    const gapPercent = Math.sqrt(dx * dx + dy * dy);
    if (gapPercent < tightestGapPercent) tightestGapPercent = gapPercent;
  }

  if (!Number.isFinite(tightestGapPercent)) return HOLE_SIZE_MAX_PERCENT; // no neighbor pairs at all (e.g. a single-hole board)
  return Math.min(HOLE_SIZE_MAX_PERCENT, tightestGapPercent * HOLE_SIZE_GAP_FACTOR);
}
