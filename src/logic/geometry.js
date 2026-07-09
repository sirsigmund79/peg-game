// ============================================================================
// geometry.js
// ----------------------------------------------------------------------------
// This file describes the SHAPE of each game board: where the holes are, and
// which "jump triples" (peg jumps over a neighbor into an empty hole) are
// legal on that shape. It has NO Vue code in it at all -- it is just math,
// so you (or anyone) can read and test it without knowing anything about the
// screen. Other files (solver.js, boards.js, rules.js) build on top of this.
//
// A "geometry" object produced by this file always looks like:
//   {
//     cells: [ {x, y}, {x, y}, ... ]   // one entry per hole, in a fixed order
//     cellCount: 15                     // how many holes total
//     moves: [ {from, over, to}, ... ] // every possible jump on this board
//     neighborPairs: [ {a, b}, ... ]   // every pair of cells one step apart
//   }
// "from", "over", "to", "a", and "b" are all INDEXES into the `cells` array
// (not x/y coordinates). That keeps the rest of the app simple: a board
// state is just "which indexes currently have a peg in them". neighborPairs
// is only used for drawing the connector-line grid (Board.vue) -- it is not
// a game rule.
// ============================================================================

/**
 * Given a list of cells (each {x, y}) and a list of jump directions
 * (each {dx, dy}), work out every legal jump triple on that board.
 *
 * The rule for a legal jump is: starting at cell `from`, step one direction
 * to land on cell `over`, then step the SAME direction again to land on
 * cell `to`. The jump is only possible if both `over` and `to` are actual
 * cells that exist on the board (peg-filled/empty status is checked later,
 * in rules.js / solver.js -- this file only cares about the board's SHAPE).
 *
 * @param {{x:number, y:number}[]} cellList - every hole on the board
 * @param {{dx:number, dy:number}[]} directions - directions a peg can jump
 * @returns {{cells: object[], cellCount: number, moves: {from:number, over:number, to:number}[]}}
 */
function buildGeometry(cellList, directions, layoutStyle) {
  // Build a quick lookup so we can go from an (x, y) coordinate back to its
  // index in cellList. We use a plain string key like "3,2" because
  // JavaScript objects/Maps can't use {x,y} directly as a key.
  const indexByCoordinate = new Map();
  cellList.forEach((cell, index) => {
    indexByCoordinate.set(coordinateKey(cell.x, cell.y), index);
  });

  const moves = [];

  // For every cell, and every direction a peg could jump, see if a legal
  // jump exists starting from that cell in that direction.
  cellList.forEach((fromCell, fromIndex) => {
    directions.forEach((direction) => {
      const overX = fromCell.x + direction.dx;
      const overY = fromCell.y + direction.dy;
      const toX = fromCell.x + direction.dx * 2;
      const toY = fromCell.y + direction.dy * 2;

      const overIndex = indexByCoordinate.get(coordinateKey(overX, overY));
      const toIndex = indexByCoordinate.get(coordinateKey(toX, toY));

      // Both the "over" hole and the "to" hole must actually exist on the
      // board for this to be a possible jump.
      if (overIndex !== undefined && toIndex !== undefined) {
        moves.push({ from: fromIndex, over: overIndex, to: toIndex });
      }
    });
  });

  // Also work out which pairs of cells sit directly NEXT TO each other (one
  // step apart, not two) -- this is a different idea from a jump move, and
  // is only used for drawing the faint connector-line grid on screen (see
  // Board.vue). We dedupe with a Set since each pair would otherwise be
  // found twice: once from each cell's side.
  const neighborPairs = [];
  const seenPairKeys = new Set();
  cellList.forEach((fromCell, fromIndex) => {
    directions.forEach((direction) => {
      const neighborX = fromCell.x + direction.dx;
      const neighborY = fromCell.y + direction.dy;
      const neighborIndex = indexByCoordinate.get(coordinateKey(neighborX, neighborY));
      if (neighborIndex === undefined) return;

      const a = Math.min(fromIndex, neighborIndex);
      const b = Math.max(fromIndex, neighborIndex);
      const key = `${a}-${b}`;
      if (!seenPairKeys.has(key)) {
        seenPairKeys.add(key);
        neighborPairs.push({ a, b });
      }
    });
  });

  return {
    cells: cellList,
    cellCount: cellList.length,
    moves,
    neighborPairs,
    // A plain display hint, NOT a game rule: tells Board.vue whether to
    // shift each row sideways like a triangular lattice (triangle, hexagon,
    // star) or place cells at their raw coordinates (grid). Keeping this
    // here means Board.vue never has to guess a board's shape from its
    // cell list.
    layoutStyle,
  };
}

/** Turns an (x, y) pair into a string key like "3,2" for use in a Map. */
function coordinateKey(x, y) {
  return x + ',' + y;
}

// ----------------------------------------------------------------------------
// The triangular lattice: triangle, hexagon, and star (combined triangles)
// ----------------------------------------------------------------------------
// These three shapes all live on the SAME underlying grid of points -- a
// "triangular lattice", where every point has 6 neighbors instead of 4.
// We describe each point with a (x, y) pair (x = column, y = row) and 6
// jump directions: left, right, and the four diagonals toward the corners.
// This is the classic Cracker Barrel triangle's layout:
//        0
//       1 2
//      3 4 5
//     6 7 8 9
//   10 11 12 13 14
//
// A hexagon or a 6-pointed star is just a DIFFERENT-shaped slice of this
// same lattice -- same points, same 6 directions, different "which points
// are included" rule. See makeHexagonGeometry() and makeStarGeometry()
// below for how that boundary is worked out.
// ----------------------------------------------------------------------------

const TRIANGLE_DIRECTIONS = [
  { dx: 0, dy: 1 }, // right
  { dx: 0, dy: -1 }, // left
  { dx: 1, dy: 1 }, // down-right
  { dx: 1, dy: 0 }, // down-left
  { dx: -1, dy: 0 }, // up-right
  { dx: -1, dy: -1 }, // up-left
];

/**
 * Builds the geometry for a triangle board with the given number of rows.
 * The classic board (used by the daily puzzle) has 5 rows = 15 holes.
 * We use (col, row) as our (x, y) pair so buildGeometry()'s generic
 * direction math works unchanged.
 *
 * @param {number} rowCount
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeTriangleGeometry(rowCount) {
  const cellList = [];
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col <= row; col++) {
      // NOTE: we store (x, y) as (col, row) so that "col" lines up with the
      // dx of our direction vectors above, and "row" lines up with dy.
      cellList.push({ x: col, y: row });
    }
  }
  return buildGeometry(cellList, TRIANGLE_DIRECTIONS, 'triangular-lattice');
}

/**
 * Converts our (x, y) triangular-lattice coordinate into the standard
 * 3-axis "cube coordinate" (q, r, s) used to describe hexagon/triangle/star
 * shapes on this kind of lattice. q + r + s always equals 0 -- that's the
 * defining property of a cube coordinate, and it's what makes the
 * hexagon/star boundary math below work out so simply.
 *
 * NOTE: this exact formula (q=x, r=-y, s=y-x) was chosen -- and checked --
 * to match TRIANGLE_DIRECTIONS above; if those directions ever change, this
 * needs to be re-derived to match.
 */
function toCubeCoordinate(x, y) {
  const q = x;
  const r = -y;
  const s = y - x;
  return { q, r, s };
}

/**
 * Builds a hexagon-shaped board on the triangular lattice: every point
 * within `radius` steps of the center in every one of the 3 cube-coordinate
 * axes. Radius 2 gives the classic 19-hole hex peg board.
 *
 * @param {number} radius
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeHexagonGeometry(radius) {
  const cellList = [];
  for (let x = -radius * 2; x <= radius * 2; x++) {
    for (let y = -radius * 2; y <= radius * 2; y++) {
      const { q, r, s } = toCubeCoordinate(x, y);
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
        cellList.push({ x, y });
      }
    }
  }
  return buildGeometry(cellList, TRIANGLE_DIRECTIONS, 'triangular-lattice');
}

/**
 * Builds a 6-pointed star (two overlapping triangles -- "combined
 * triangles") on the triangular lattice. A single big triangle of "size" N
 * centered on the origin is `q >= -N && r >= -N && s >= -N`; its mirror
 * image (pointing the other way) is `q <= N && r <= N && s <= N`. Take
 * BOTH triangles' points (their union) and you get a hexagram; take only
 * the points they have in common (their intersection) and you'd get a
 * hexagon instead -- which is a fun way to see why hexagon() and star()
 * are close cousins.
 *
 * @param {number} size
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeStarGeometry(size) {
  const cellList = [];
  for (let x = -size * 3; x <= size * 3; x++) {
    for (let y = -size * 3; y <= size * 3; y++) {
      const { q, r, s } = toCubeCoordinate(x, y);
      const inUpwardTriangle = q >= -size && r >= -size && s >= -size;
      const inDownwardTriangle = q <= size && r <= size && s <= size;
      if (inUpwardTriangle || inDownwardTriangle) {
        cellList.push({ x, y });
      }
    }
  }
  return buildGeometry(cellList, TRIANGLE_DIRECTIONS, 'triangular-lattice');
}

// ----------------------------------------------------------------------------
// Grid boards (English cross, heart, and any future grid-shaped board)
// ----------------------------------------------------------------------------
// Grid boards use plain (x, y) coordinates and allow jumps in all 8
// directions: straight up/down/left/right, AND the 4 diagonals.
// ----------------------------------------------------------------------------

const GRID_DIRECTIONS = [
  { dx: 1, dy: 0 }, // right
  { dx: -1, dy: 0 }, // left
  { dx: 0, dy: 1 }, // down
  { dx: 0, dy: -1 }, // up
  { dx: 1, dy: 1 }, // down-right
  { dx: 1, dy: -1 }, // up-right
  { dx: -1, dy: 1 }, // down-left
  { dx: -1, dy: -1 }, // up-left
];

/**
 * Builds the geometry for any grid-shaped board (English cross, heart,
 * etc.) from a plain list of {x, y} cells.
 *
 * @param {{x:number, y:number}[]} cellList
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeGridGeometry(cellList) {
  return buildGeometry(cellList, GRID_DIRECTIONS, 'grid');
}

/**
 * Builds a plain square board: `size` x `size` holes.
 *
 * @param {number} size
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeSquareGeometry(size) {
  const cellList = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cellList.push({ x, y });
    }
  }
  return makeGridGeometry(cellList);
}

/**
 * Builds a diamond (rotated square): every point within `radius` steps of
 * the center, counting a step as 1 space in any of the 4 straight
 * directions (this is "Manhattan distance", also called "taxicab
 * distance" -- how far a taxi has to drive on a grid of city blocks).
 *
 * @param {number} radius
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeDiamondGeometry(radius) {
  const cellList = [];
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      if (Math.abs(x) + Math.abs(y) <= radius) {
        cellList.push({ x, y });
      }
    }
  }
  return makeGridGeometry(cellList);
}

/**
 * Builds an octagon: a `size` x `size` square with a small triangular
 * notch nipped off each of the 4 corners, so the outline has 8 sides
 * instead of 4. `cutDepth` controls how big each notch is (a corner cell
 * is removed if it's within `cutDepth` diagonal steps of that corner).
 *
 * @param {number} size
 * @param {number} cutDepth
 * @returns {ReturnType<typeof buildGeometry>}
 */
export function makeOctagonGeometry(size, cutDepth) {
  const cellList = [];
  const lastIndex = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distanceFromTopLeft = x + y;
      const distanceFromTopRight = lastIndex - x + y;
      const distanceFromBottomLeft = x + (lastIndex - y);
      const distanceFromBottomRight = lastIndex - x + (lastIndex - y);
      const inACorner =
        distanceFromTopLeft < cutDepth ||
        distanceFromTopRight < cutDepth ||
        distanceFromBottomLeft < cutDepth ||
        distanceFromBottomRight < cutDepth;
      if (!inACorner) {
        cellList.push({ x, y });
      }
    }
  }
  return makeGridGeometry(cellList);
}

/**
 * Finds the index of a cell at a given (x, y) inside a geometry's cell
 * list. Useful for boards.js when it needs to say "the empty hole is the
 * one at the center", without hardcoding a raw index number.
 *
 * @param {ReturnType<typeof buildGeometry>} geometry
 * @param {number} x
 * @param {number} y
 * @returns {number} the cell index, or -1 if there's no cell there
 */
export function findCellIndex(geometry, x, y) {
  return geometry.cells.findIndex((cell) => cell.x === x && cell.y === y);
}

/**
 * A "full board" mask: every hole filled with a peg. Combine this with
 * emptyHolesToMask() (in rules.js) to build a real starting position.
 *
 * We use BigInt for masks (see solver.js for why) so this returns a BigInt
 * with `cellCount` 1-bits.
 *
 * @param {number} cellCount
 * @returns {bigint}
 */
export function fullBoardMask(cellCount) {
  return (1n << BigInt(cellCount)) - 1n;
}
