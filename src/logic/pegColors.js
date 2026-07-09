// ============================================================================
// pegColors.js
// ----------------------------------------------------------------------------
// The fixed, theme-independent identity palette for peg colors. Unlike the
// board/hole/UI chrome (still themed via composables/useTheme.js), a peg's
// color now carries GAME MEANING -- it decides what it can jump over -- so
// it stays the same regardless of visual theme, and always matches the
// circle emoji used in the share text (services/viral.js).
//
// Colors are ordered blue -> purple -> green -> red on purpose: a puzzle
// with fewer colors only ever uses a PREFIX of this list (see
// getColorCountForCellCount below), so the two smallest/most-common color
// counts (2 and 3) never pair red with green -- a common colorblind
// confusion -- and only the biggest boards (4 colors) introduce red.
// ============================================================================

export const PEG_COLORS = [
  { id: 0, name: 'Blue', hex: '#2a5eea', emoji: '🔵' },
  { id: 1, name: 'Purple', hex: '#7c4fa0', emoji: '🟣' },
  { id: 2, name: 'Green', hex: '#1c8c52', emoji: '🟢' },
  { id: 3, name: 'Red', hex: '#c1432f', emoji: '🔴' },
];

/**
 * @param {number} colorIndex
 * @returns {{id: number, name: string, hex: string, emoji: string}}
 */
export function getPegColor(colorIndex) {
  return PEG_COLORS[colorIndex];
}

/**
 * How many peg colors a puzzle should use, based on board size: fewer
 * colors for smaller boards, more for larger ones.
 *
 * @param {number} cellCount
 * @returns {number} 2, 3, or 4
 */
export function getColorCountForCellCount(cellCount) {
  if (cellCount <= 16) return 2;
  if (cellCount <= 25) return 3;
  return 4;
}

/**
 * Splits a board's occupied holes into `colorCount` spatially-CONTIGUOUS
 * regions -- a "graph Voronoi" partition grown outward from `colorCount`
 * seed holes via breadth-first search over the board's adjacency graph
 * (geometry.neighborPairs). Used by the offline archive generators
 * (scripts/generate-puzzle-pool.js, scripts/precompute-english-cross.js)
 * to decide which starting peg gets which color -- deterministic given the
 * same seeded `rng`, so regenerating the archive reproduces the exact same
 * puzzles.
 *
 * Contiguous regions matter for solvability: a peg can only jump over its
 * own color, so if colors were scattered uniformly at random across the
 * whole board, same-color pegs would rarely end up close enough (exactly 2
 * cells apart) to ever jump at all, and every puzzle would deadlock almost
 * immediately. Clustering each color into its own connected neighborhood
 * gives it roughly the same jump density the classic single-color game had.
 *
 * An occupied cell can end up with none of its own occupied neighbors left
 * (every geometry-adjacent cell happens to be one of the chosen empty
 * holes) -- see the leftover-assignment pass at the end of this function for
 * how that's still given a real color instead of being silently left empty.
 *
 * @param {{cellCount: number, neighborPairs: {a:number, b:number}[]}} geometry
 * @param {number[]} emptyHoles - indexes of holes that start empty
 * @param {number} colorCount
 * @param {() => number} rng - a seeded random source returning [0, 1)
 * @returns {number[]} holeColors -- see createStartingMasks() in rules.js
 */
export function assignHoleColors(geometry, emptyHoles, colorCount, rng) {
  const cellCount = geometry.cellCount;
  const emptySet = new Set(emptyHoles);
  const occupied = [];
  for (let index = 0; index < cellCount; index++) {
    if (!emptySet.has(index)) occupied.push(index);
  }

  const adjacency = new Map();
  occupied.forEach((index) => adjacency.set(index, []));
  for (const { a, b } of geometry.neighborPairs) {
    if (adjacency.has(a) && adjacency.has(b)) {
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    }
  }

  function bfsDistances(sources) {
    const distance = new Map();
    const queue = [...sources];
    sources.forEach((source) => distance.set(source, 0));
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const neighbor of adjacency.get(current)) {
        if (!distance.has(neighbor)) {
          distance.set(neighbor, distance.get(current) + 1);
          queue.push(neighbor);
        }
      }
    }
    return distance;
  }

  // Spread the seeds out via farthest-point sampling, so regions don't all
  // crowd into one corner of the board.
  const seeds = [occupied[Math.floor(rng() * occupied.length)]];
  while (seeds.length < colorCount) {
    const distances = bfsDistances(seeds);
    let farthest = occupied[0];
    let farthestDistance = -1;
    for (const cell of occupied) {
      const distance = distances.get(cell) ?? -1;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = cell;
      }
    }
    seeds.push(farthest);
  }

  // Multi-source BFS from the seeds -- every occupied cell is colored like
  // whichever seed's wavefront reaches it first.
  const holeColors = new Array(cellCount).fill(-1);
  const visited = new Set();
  const queue = [];
  seeds.forEach((seed, color) => {
    holeColors[seed] = color;
    visited.add(seed);
    queue.push(seed);
  });
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const color = holeColors[current];
    for (const neighbor of adjacency.get(current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        holeColors[neighbor] = color;
        queue.push(neighbor);
      }
    }
  }

  // An occupied cell with zero occupied neighbors (every geometry-adjacent
  // cell happens to be one of the chosen empty holes) has no path to any
  // seed, so the BFS above never visits it -- left alone, it would stay at
  // -1, indistinguishable from an intentionally-empty hole and silently
  // dropping a peg that was supposed to exist. Assign any such leftovers to
  // whichever color currently has the fewest pegs, so every occupied cell
  // always ends up with a real color.
  const colorCounts = new Array(colorCount).fill(0);
  holeColors.forEach((color) => {
    if (color !== -1) colorCounts[color]++;
  });
  for (const index of occupied) {
    if (holeColors[index] !== -1) continue;
    let smallest = 0;
    for (let color = 1; color < colorCount; color++) {
      if (colorCounts[color] < colorCounts[smallest]) smallest = color;
    }
    holeColors[index] = smallest;
    colorCounts[smallest]++;
  }

  return holeColors;
}
