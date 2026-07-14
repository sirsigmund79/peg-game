// ============================================================================
// puzzlePerceivedDifficulty.js
// ----------------------------------------------------------------------------
// puzzleDag.js measures STRUCTURAL difficulty: how many of a state's options
// are traps. This measures something different and independent: whether a
// player who never looks ahead -- just applies one simple, obvious rule every
// turn -- stumbles onto the optimal solution anyway. A puzzle can have a high
// trap ratio and still be trivial in practice if the danger never LOOKS
// dangerous, and vice versa. This is never folded into totalDifficulty or
// used to adjust DAG-derived buckets -- it answers a different question and
// stays a separate number.
//
// Two independent signals live here:
//   perceivedDifficulty -- how many of a fixed set of naive, lookahead-free
//     strategies fail to stumble onto the optimal outcome.
//   symmetryScore -- structural, no solving at all: does some non-identity
//     rotation/reflection of the board map the puzzle's own colors onto
//     itself? A symmetric-looking puzzle often FEELS easier/more legible
//     than an equally-hard asymmetric one, independent of trap_ratio.
//
// No Vue code lives here. Plain math/search, same as solver.js/puzzleDag.js.
// ============================================================================

import { findLegalMoves, applyMove, countPegsRemaining, getColorAt } from './rules.js';

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// Naive-heuristic simulation
// ----------------------------------------------------------------------------
// Each strategy is a deterministic `pick(masks, legalMoves)` rule with no
// lookahead and no branching -- it only ever looks at what's true on the
// board RIGHT NOW, so a whole playthrough is one linear pass.
// ----------------------------------------------------------------------------

/** Always take the board's own move-list order -- a pure baseline/control. */
function pickFirstLegalMove(masks, legalMoves) {
  return legalMoves[0];
}

/**
 * Take the move whose `over` peg currently has the fewest same-color legal
 * partners right now (i.e. the fewest OTHER legal moves that also jump over
 * that same hole) -- mimics "clear the piece that looks most stuck first".
 */
function pickMostConstrainedOverPeg(masks, legalMoves) {
  let best = legalMoves[0];
  let bestDegree = Infinity;
  for (const move of legalMoves) {
    let degree = 0;
    for (const other of legalMoves) {
      if (other.over === move.over) degree += 1;
    }
    if (degree < bestDegree) {
      bestDegree = degree;
      best = move;
    }
  }
  return best;
}

/** Take the move whose color currently has the most pegs remaining -- mimics "go where the crowd is". */
function pickLargestColorFirst(masks, legalMoves) {
  const pegCounts = countPegsRemaining(masks);
  let best = legalMoves[0];
  let bestCount = -1;
  for (const move of legalMoves) {
    const color = getColorAt(masks, move.from);
    if (pegCounts[color] > bestCount) {
      bestCount = pegCounts[color];
      best = move;
    }
  }
  return best;
}

function toCubeCoordinate(x, y) {
  return { q: x, r: -y, s: y - x };
}

/** Board-shape-aware "closeness" so a skewed triangular-lattice (x,y) isn't treated as if it were Cartesian. */
function makeDistanceFromCentroid(geometry) {
  const centroid = geometry.cells.reduce(
    (sum, cell) => ({ x: sum.x + cell.x / geometry.cellCount, y: sum.y + cell.y / geometry.cellCount }),
    { x: 0, y: 0 }
  );

  if (geometry.layoutStyle === 'triangular-lattice') {
    const centroidCube = toCubeCoordinate(centroid.x, centroid.y);
    return (cellIndex) => {
      const cube = toCubeCoordinate(geometry.cells[cellIndex].x, geometry.cells[cellIndex].y);
      return (Math.abs(cube.q - centroidCube.q) + Math.abs(cube.r - centroidCube.r) + Math.abs(cube.s - centroidCube.s)) / 2;
    };
  }

  return (cellIndex) => {
    const cell = geometry.cells[cellIndex];
    return Math.max(Math.abs(cell.x - centroid.x), Math.abs(cell.y - centroid.y));
  };
}

/** Take the move landing closest to the board's static centroid. */
function pickCentroidSeeking(masks, legalMoves, distanceFromCentroid) {
  let best = legalMoves[0];
  let bestDistance = Infinity;
  for (const move of legalMoves) {
    const distance = distanceFromCentroid(move.to);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = move;
    }
  }
  return best;
}

function runHeuristic(pick, moveList, startingMasks) {
  let masks = startingMasks;
  while (true) {
    const legalMoves = findLegalMoves(masks, moveList);
    if (legalMoves.length === 0) break;
    masks = applyMove(masks, pick(masks, legalMoves));
  }
  return countPegsRemaining(masks);
}

/**
 * Runs all four naive strategies from `startingMasks` to a terminal state and
 * compares each against `target` (the solver-proven per-color best).
 *
 * @param {object} geometry - from geometry.js (needs .moves, .cells, .cellCount, .layoutStyle)
 * @param {bigint[]} startingMasks
 * @param {number[]|null} target - null when the solver didn't complete (no target to compare against)
 * @returns {{perceivedDifficulty: number|null, heuristicResults: {name:string, succeeded:boolean|null, finalPerColor:number[]|null}[]}}
 */
export function runPerceivedDifficultyBattery(geometry, startingMasks, target) {
  const distanceFromCentroid = makeDistanceFromCentroid(geometry);
  const heuristics = [
    { name: 'firstLegalMove', pick: pickFirstLegalMove },
    { name: 'mostConstrainedOverPeg', pick: pickMostConstrainedOverPeg },
    { name: 'largestColorFirst', pick: pickLargestColorFirst },
    { name: 'centroidSeeking', pick: (masks, legalMoves) => pickCentroidSeeking(masks, legalMoves, distanceFromCentroid) },
  ];

  if (!target) {
    return {
      perceivedDifficulty: null,
      heuristicResults: heuristics.map(({ name }) => ({ name, succeeded: null, finalPerColor: null })),
    };
  }

  const heuristicResults = heuristics.map(({ name, pick }) => {
    const finalPerColor = runHeuristic(pick, geometry.moves, startingMasks);
    return { name, succeeded: arraysEqual(finalPerColor, target), finalPerColor };
  });

  const successCount = heuristicResults.filter((result) => result.succeeded).length;
  return { perceivedDifficulty: 1 - successCount / heuristics.length, heuristicResults };
}

// ----------------------------------------------------------------------------
// Symmetry check -- purely structural, no solving involved at all.
// ----------------------------------------------------------------------------

function coordinateKey(x, y) {
  return x + ',' + y;
}

/** Grid boards: reflections/rotations about the bounding box's center. Invalid ones (e.g. rot90 on a non-square box) get discarded generically below, not hardcoded per shape. */
function makeGridTransforms(cells) {
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

  return [
    { name: 'hFlip', apply: ({ x, y }) => ({ x: 2 * centerX - x, y }) },
    { name: 'vFlip', apply: ({ x, y }) => ({ x, y: 2 * centerY - y }) },
    { name: 'rot180', apply: ({ x, y }) => ({ x: 2 * centerX - x, y: 2 * centerY - y }) },
    { name: 'rot90', apply: ({ x, y }) => ({ x: centerX - (y - centerY), y: centerY + (x - centerX) }) },
    { name: 'rot270', apply: ({ x, y }) => ({ x: centerX + (y - centerY), y: centerY - (x - centerX) }) },
    { name: 'diag', apply: ({ x, y }) => ({ x: centerX + (y - centerY), y: centerY + (x - centerX) }) },
    { name: 'antiDiag', apply: ({ x, y }) => ({ x: centerX - (y - centerY), y: centerY - (x - centerX) }) },
  ];
}

// Cube-coordinate rotate-60-degrees and the one base reflection this
// codebase's triangular lattice needs -- same (q=x, r=-y, s=y-x) convention
// geometry.js already uses internally for hexagon/star boundary math.
function rotateCube({ q, r, s }) {
  return { q: -r, r: -s, s: -q };
}
function reflectCube({ q, r, s }) {
  return { q, r: s, s: r };
}
function cubeToPoint({ q, r }) {
  return { x: q, y: -r };
}

/** Triangular-lattice boards: the full 12-element symmetry group (6 rotations x reflect-or-not), minus the identity rotation. */
function makeTriangularTransforms() {
  const transforms = [];
  for (let steps = 1; steps <= 5; steps++) {
    transforms.push({
      name: `rotate${steps * 60}`,
      apply: (point) => {
        let cube = toCubeCoordinate(point.x, point.y);
        for (let i = 0; i < steps; i++) cube = rotateCube(cube);
        return cubeToPoint(cube);
      },
    });
  }
  for (let steps = 0; steps <= 5; steps++) {
    transforms.push({
      name: `reflect${steps * 60}`,
      apply: (point) => {
        let cube = reflectCube(toCubeCoordinate(point.x, point.y));
        for (let i = 0; i < steps; i++) cube = rotateCube(cube);
        return cubeToPoint(cube);
      },
    });
  }
  return transforms;
}

/**
 * Returns the fraction of holes whose color matches after this transform, or
 * null if the transform either doesn't map the board's own cell set onto
 * itself, or does but only as the identity permutation (e.g. a "vertical
 * flip" on a board that's only ever one row tall maps every cell to itself --
 * that's not a real symmetry of THIS board's shape, whatever the transform is
 * called in the abstract).
 */
function scoreTransform(cells, indexByCoordinate, holeColors, apply) {
  const permutation = new Array(cells.length);
  let isIdentity = true;
  for (let index = 0; index < cells.length; index++) {
    const transformed = apply(cells[index]);
    const mappedIndex = indexByCoordinate.get(coordinateKey(transformed.x, transformed.y));
    if (mappedIndex === undefined) return null;
    permutation[index] = mappedIndex;
    if (mappedIndex !== index) isIdentity = false;
  }
  if (isIdentity) return null;

  let matches = 0;
  for (let index = 0; index < cells.length; index++) {
    if (holeColors[permutation[index]] === holeColors[index]) matches += 1;
  }
  return matches / cells.length;
}

/**
 * Best-scoring non-identity board automorphism's color-match fraction, or
 * `null` if this board shape has no non-trivial symmetry to test against at
 * all (expected and fine -- most hand-carved editor boards won't; the
 * regular catalog shapes mostly will).
 *
 * @param {object} geometry
 * @param {number[]} holeColors
 * @returns {number|null}
 */
export function computeSymmetryScore(geometry, holeColors) {
  const indexByCoordinate = new Map();
  geometry.cells.forEach((cell, index) => indexByCoordinate.set(coordinateKey(cell.x, cell.y), index));

  const transforms =
    geometry.layoutStyle === 'triangular-lattice' ? makeTriangularTransforms() : makeGridTransforms(geometry.cells);

  let bestScore = null;
  for (const transform of transforms) {
    const score = scoreTransform(geometry.cells, indexByCoordinate, holeColors, transform.apply);
    if (score === null) continue;
    if (bestScore === null || score > bestScore) bestScore = score;
  }
  return bestScore;
}

/**
 * Runs the full perceived-difficulty battery for one puzzle.
 *
 * @param {object} geometry
 * @param {bigint[]} startingMasks
 * @param {number[]} holeColors
 * @param {number[]|null} target - solver.findBest(startingMasks).perColor, or null if incomplete
 */
export function analyzePerceivedDifficulty(geometry, startingMasks, holeColors, target) {
  const { perceivedDifficulty, heuristicResults } = runPerceivedDifficultyBattery(geometry, startingMasks, target);
  const symmetryScore = computeSymmetryScore(geometry, holeColors);
  return { perceivedDifficulty, heuristicResults, symmetryScore };
}
