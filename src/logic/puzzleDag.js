// ============================================================================
// puzzleDag.js
// ----------------------------------------------------------------------------
// solver.js answers "what's the best possible outcome from this position".
// This file answers a different question: "of every move available at every
// position between the start and that best outcome, how many are traps (they
// still let you reach a WORSE-than-best final state), and how early/severe do
// those traps get". That's difficulty measured structurally, not by a
// heuristic proxy.
//
// THE DAG
// Starting from a puzzle's opening position, every legal move either keeps
// the best-possible outcome reachable ("safe") or throws it away ("a trap").
// We only ever expand further through safe moves -- once a move is a trap,
// there's no point mapping out everything reachable beyond it, we already
// know it's off the optimal path. That pruning is what keeps this tractable:
// the "all" graph (every state + edge reachable, safe or not) stays
// proportional to the SAFE subgraph plus one fringe layer of trap targets,
// not the full reachable state space -- which solver.js already had to
// fully explore once anyway to prove what "best possible" even is.
//
// Board positions strictly lose one peg per move, so no position can ever
// repeat -- that's what guarantees this terminates and what turns the
// traversal into a genuine DAG (not a tree): two different move orders that
// land on the identical position just merge into the same node.
//
// No Vue code lives here. Plain math/search, same as solver.js.
// ============================================================================

import { createSolver, SolverBudgetExceededError } from './solver.js';
import { findLegalMoves, applyMove, countPegsRemaining } from './rules.js';

/** Thrown when DAG expansion (not the underlying solve) exceeds `dagNodeBudget` -- see buildPuzzleDag. */
export class DagBudgetExceededError extends Error {}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Packs a multi-color masks array into one combined bigint key, same scheme as solver.js's own memo key. */
function encodeStateKey(masks, cellCount) {
  const cellCountBig = BigInt(cellCount);
  let key = 0n;
  for (let color = 0; color < masks.length; color++) {
    key |= masks[color] << (BigInt(color) * cellCountBig);
  }
  return key;
}

/** Picks up to `width` random items from `items` without replacement (used only by the sampling fallback). */
function pickSample(items, width, rng) {
  if (items.length <= width) return items;
  const pool = [...items];
  const chosen = [];
  for (let i = 0; i < width && pool.length > 0; i++) {
    const index = Math.floor(rng() * pool.length);
    chosen.push(pool[index]);
    pool.splice(index, 1);
  }
  return chosen;
}

/**
 * Builds the safe/trap DAG for one puzzle's starting position.
 *
 * @param {{from:number, over:number, to:number}[]} moveList - from geometry.js
 * @param {number} cellCount
 * @param {bigint[]} startingMasks
 * @param {{nodeBudget?: number, dagNodeBudget?: number, sampleWidth?: number|null, rng?: () => number}} [options]
 *   `nodeBudget` bounds the underlying solve (same meaning as solver.js's own
 *   option) -- if this is exceeded, `target` is never known, so no DAG can be
 *   built at all (`dagComplete: false`). `dagNodeBudget` is a SEPARATE cap on
 *   the DAG's own size: even a puzzle whose optimum is cheap to prove can
 *   still have an enormous SAFE subgraph (lots of equally-good move orders),
 *   so this bounds that independently. It's ALSO what catches the case where
 *   classifying an edge needs fresh search findBest(startingMasks)'s own
 *   early-exit optimization skipped while proving the optimum (that proof
 *   only visits enough of the reachable space to establish the VALUE, not
 *   every legal move at every state) -- either way, exceeding this throws
 *   DagBudgetExceededError, and callers should catch that and retry with
 *   `sampleWidth` set (see the "fall back to sampling" note in the module
 *   header). `sampleWidth`, when set, caps how many safe children get
 *   expanded at EVERY node (instead of all of them), which naturally yields
 *   several independent sampled optimal-path trajectories instead of the
 *   full DAG, and can never blow up regardless of `dagNodeBudget`.
 */
export function buildPuzzleDag(moveList, cellCount, startingMasks, options = {}) {
  const { nodeBudget = Infinity, dagNodeBudget = Infinity, sampleWidth = null, rng = Math.random } = options;

  // Piggyback the "no dot permanently isolated" acceptance check on the ONE
  // full exhaustive traversal findBest(startingMasks) already has to do to
  // prove optimality, instead of paying for a second traversal -- see
  // solver.js's onStateExpanded doc.
  const everLegalHoles = new Set();
  const solver = createSolver(moveList, cellCount, {
    nodeBudget,
    onStateExpanded(masks, legalMoves) {
      for (const move of legalMoves) {
        everLegalHoles.add(move.from);
        everLegalHoles.add(move.over);
      }
    },
  });

  const startingTotal = countPegsRemaining(startingMasks).reduce((sum, count) => sum + count, 0);

  let target = null;
  let dagComplete = true;
  try {
    target = solver.findBest(startingMasks).perColor;
  } catch (error) {
    if (!(error instanceof SolverBudgetExceededError)) throw error;
    dagComplete = false;
  }

  if (!dagComplete) {
    return {
      target: null,
      dagComplete: false,
      sampled: false,
      nodesVisited: solver.getNodesVisited(),
      startingTotal,
      bestPossibleTotal: null,
      startingMasks,
      solver,
      allNodes: new Map(),
      allEdges: [],
      dagNodeKeys: new Set(),
      dagEdges: [],
      everLegalHoles,
    };
  }

  const bestPossibleTotal = target.reduce((sum, count) => sum + count, 0);
  const allNodes = new Map(); // key -> { depth, totalPegs }
  const allEdges = []; // { fromKey, toKey, move, isSafe }
  const dagNodeKeys = new Set();
  let dagNodesExpanded = 0;
  let sampled = false;

  // findBest() calls from here on are OFTEN cache hits (the
  // findBest(startingMasks) call above already proved the optimum, visiting
  // most of the reachable space along the way) but not guaranteed to be --
  // see the try/catch below for why.
  function explore(masks, depth) {
    const key = encodeStateKey(masks, cellCount);
    if (allNodes.has(key)) return; // merge: already expanded via a different move order

    dagNodesExpanded += 1;
    if (sampleWidth === null && dagNodesExpanded > dagNodeBudget) {
      throw new DagBudgetExceededError(`DAG exceeded ${dagNodeBudget} nodes`);
    }

    const totalPegs = countPegsRemaining(masks).reduce((sum, count) => sum + count, 0);
    allNodes.set(key, { depth, totalPegs });
    dagNodeKeys.add(key);

    const legalMoves = findLegalMoves(masks, moveList);
    const safeChildren = [];
    for (const move of legalMoves) {
      const nextMasks = applyMove(masks, move);
      const nextKey = encodeStateKey(nextMasks, cellCount);
      // NOT guaranteed to be a cache hit: findBest(startingMasks) proves the
      // optimum using an early-exit shortcut (it stops evaluating a state's
      // remaining moves the instant one reaches the theoretical floor), so
      // it does NOT necessarily visit every legal move at every reachable
      // state -- only enough to prove the value. Classifying is_safe for
      // EVERY edge can need genuinely fresh search the original proof
      // skipped. Treat that the same as the DAG simply being too big.
      let nextResult;
      try {
        nextResult = solver.findBest(nextMasks);
      } catch (error) {
        if (!(error instanceof SolverBudgetExceededError)) throw error;
        throw new DagBudgetExceededError('underlying solve exceeded its budget while classifying an edge, not just proving the initial optimum');
      }
      const isSafe = arraysEqual(nextResult.perColor, target);
      allEdges.push({ fromKey: key, toKey: nextKey, move, isSafe });
      if (isSafe) {
        safeChildren.push(nextMasks);
      } else if (!allNodes.has(nextKey)) {
        // Trap targets aren't expanded further, but they're still recorded
        // in allNodes (just not dagNodeKeys) -- a "reveal everything" view
        // needs to be able to draw the trap leaf itself, not just the edge
        // pointing at it.
        const trapTotalPegs = countPegsRemaining(nextMasks).reduce((sum, count) => sum + count, 0);
        allNodes.set(nextKey, { depth: depth + 1, totalPegs: trapTotalPegs });
      }
    }

    const childrenToExpand = sampleWidth === null ? safeChildren : pickSample(safeChildren, sampleWidth, rng);
    if (childrenToExpand.length < safeChildren.length) sampled = true;
    for (const child of childrenToExpand) explore(child, depth + 1);
  }

  explore(startingMasks, 0);

  return {
    target,
    dagComplete: true,
    sampled,
    nodesVisited: solver.getNodesVisited(),
    startingTotal,
    bestPossibleTotal,
    startingMasks,
    solver,
    allNodes,
    allEdges,
    dagNodeKeys,
    dagEdges: allEdges.filter((edge) => edge.isSafe),
    everLegalHoles,
  };
}

/**
 * Per-state branching, computed directly from allEdges/dagEdges -- no
 * further traversal needed.
 *
 * @returns {Map<bigint, {rawBranching:number, safeBranching:number, trapRatio:number}>}
 */
export function computeBranchingMetrics(dag) {
  const rawCounts = new Map();
  const safeCounts = new Map();
  for (const edge of dag.allEdges) {
    rawCounts.set(edge.fromKey, (rawCounts.get(edge.fromKey) ?? 0) + 1);
    if (edge.isSafe) safeCounts.set(edge.fromKey, (safeCounts.get(edge.fromKey) ?? 0) + 1);
  }

  const metrics = new Map();
  for (const key of dag.dagNodeKeys) {
    const raw = rawCounts.get(key) ?? 0;
    const safe = safeCounts.get(key) ?? 0;
    metrics.set(key, { rawBranching: raw, safeBranching: safe, trapRatio: raw === 0 ? 0 : (raw - safe) / raw });
  }
  return metrics;
}

function buildDagAdjacency(dag) {
  const adjacency = new Map();
  for (const edge of dag.dagEdges) {
    if (!adjacency.has(edge.fromKey)) adjacency.set(edge.fromKey, []);
    adjacency.get(edge.fromKey).push(edge.toKey);
  }
  return adjacency;
}

function reachableWithin(adjacency, startKey, steps) {
  const seen = new Set([startKey]);
  let frontier = [startKey];
  for (let step = 0; step < steps && frontier.length > 0; step++) {
    const next = [];
    for (const node of frontier) {
      for (const child of adjacency.get(node) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Groups a state's dag_edges children together when they reach a common
 * descendant within `lookahead` moves -- catches independent moves taken in
 * a different order (e.g. two unrelated pairs cleared A-then-B vs B-then-A)
 * that land on the identical final state.
 *
 * @param {Map<bigint, bigint[]>} dagAdjacency - from buildDagAdjacency
 * @param {bigint} fromKey
 * @param {number} [lookahead]
 * @returns {bigint[][]} groups of child keys
 */
export function findTranspositionGroups(dagAdjacency, fromKey, lookahead = 2) {
  const children = dagAdjacency.get(fromKey) ?? [];
  if (children.length <= 1) return children.map((child) => [child]);

  const reachSets = children.map((child) => reachableWithin(dagAdjacency, child, lookahead));

  const parent = children.map((_, index) => index);
  function find(index) {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  }
  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      let intersects = false;
      for (const node of reachSets[i]) {
        if (reachSets[j].has(node)) {
          intersects = true;
          break;
        }
      }
      if (intersects) union(i, j);
    }
  }

  const groups = new Map();
  children.forEach((child, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(child);
  });
  return [...groups.values()];
}

/** effective_branching(state) for every dag_node = number of transposition groups, not raw child count. */
export function computeEffectiveBranching(dag, lookahead = 2) {
  const adjacency = buildDagAdjacency(dag);
  const effective = new Map();
  for (const key of dag.dagNodeKeys) {
    effective.set(key, findTranspositionGroups(adjacency, key, lookahead).length);
  }
  return effective;
}

/**
 * raw_branching x trap_ratio x remaining_depth, averaged across dag_nodes.
 * remaining_depth = currentTotalPegs - bestPossibleTotal (equivalent to
 * max_depth - pegs_cleared_so_far, since max_depth is fixed at
 * startingTotal - bestPossibleTotal and every move clears exactly one peg).
 */
export function computeTotalDifficulty(dag, branchingMetrics) {
  if (dag.dagNodeKeys.size === 0) return 0;
  let sum = 0;
  for (const key of dag.dagNodeKeys) {
    const node = dag.allNodes.get(key);
    const metrics = branchingMetrics.get(key);
    const remainingDepth = node.totalPegs - dag.bestPossibleTotal;
    sum += metrics.rawBranching * metrics.trapRatio * remainingDepth;
  }
  return sum / dag.dagNodeKeys.size;
}

/**
 * How many DISTINCT move sequences reach an optimal (best-possible) outcome
 * -- i.e. how many different ways there are to solve this puzzle perfectly,
 * not just how many states/edges are in its safe DAG. Counted bottom-up:
 * every terminal safe state (no outgoing safe edges) counts as 1 route, and
 * every other state's route count is the sum of its children's -- valid
 * because peg count strictly decreases along every edge, so processing
 * dag_nodes in order of INCREASING remaining pegs guarantees every child is
 * already counted before its parent needs it (no separate topological sort
 * required, the peg count IS the topological order).
 *
 * Returns a BigInt -- this can grow astronomically on a branchy board (it's
 * a count of PATHS through a graph, not states or edges, so it compounds
 * multiplicatively at every real decision point) and routinely exceeds what
 * a plain JS number can represent exactly.
 *
 * @param {ReturnType<typeof buildPuzzleDag>} dag
 * @returns {bigint}
 */
export function countOptimalPaths(dag) {
  if (dag.dagNodeKeys.size === 0) return 0n;

  const adjacency = buildDagAdjacency(dag);
  const nodesByIncreasingPegs = [...dag.dagNodeKeys].sort(
    (a, b) => dag.allNodes.get(a).totalPegs - dag.allNodes.get(b).totalPegs
  );

  const routeCount = new Map();
  for (const key of nodesByIncreasingPegs) {
    const children = adjacency.get(key) ?? [];
    if (children.length === 0) {
      routeCount.set(key, 1n);
      continue;
    }
    let sum = 0n;
    for (const child of children) sum += routeCount.get(child);
    routeCount.set(key, sum);
  }

  const startKey = nodesByIncreasingPegs.find((key) => dag.allNodes.get(key).depth === 0);
  return routeCount.get(startKey) ?? 0n;
}

// ----------------------------------------------------------------------------
// Acceptance checks -- for the puzzle generator (reject/regenerate on
// failure) and for retroactively flagging already-scheduled puzzles.
// ----------------------------------------------------------------------------

/**
 * How many pegs a color must actually remove to be "worth playing", mirroring
 * generate-puzzle-pool.js's own existing bar (1 removal at 3 starting pegs, 2
 * at 4+) rather than a new stricter standard -- generalized down to 1-2
 * starting pegs (0 required; a lone peg can never move at all, that's
 * expected, not a defect) since hand-authored scheduledPuzzles.js entries
 * never went through that script's filter and can have colors that small.
 */
function requiredRemovalForColor(startingCount) {
  if (startingCount <= 1) return 0;
  if (startingCount <= 3) return 1;
  return 2;
}

/** Flags any color whose best-possible residue is worse than the pool generator's own removal bar for that starting count. */
export function checkResidueCap(startingPerColor, parPerColor) {
  const failures = [];
  startingPerColor.forEach((startingCount, color) => {
    if (startingCount === 0) return;
    const removed = startingCount - parPerColor[color];
    const required = requiredRemovalForColor(startingCount);
    if (removed < required) {
      failures.push({
        check: 'residueCap',
        detail: `color ${color} removes only ${removed} of ${startingCount} starting pegs (needs >= ${required})`,
      });
    }
  });
  return failures;
}

/** Flags any starting peg whose hole never has a legal move at any reachable state (safe or not). */
export function checkNoIsolatedDots(holeColors, everLegalHoles) {
  const failures = [];
  holeColors.forEach((color, index) => {
    if (color === -1) return;
    if (!everLegalHoles.has(index)) {
      failures.push({ check: 'noIsolatedDots', detail: `hole ${index} (color ${color}) never has a legal move` });
    }
  });
  return failures;
}

/** Confirms best_score_from's own move chain actually terminates AT the proven target, not just that a number was returned. */
export function checkSolvabilitySanity(solver, startingMasks, target) {
  if (!target) {
    return [{ check: 'solvabilitySanity', detail: 'solver did not complete -- no target to verify against' }];
  }
  let masks = startingMasks;
  while (true) {
    const step = solver.findBest(masks);
    if (!step.move) break;
    masks = applyMove(masks, step.move);
  }
  const finalPerColor = countPegsRemaining(masks);
  if (!arraysEqual(finalPerColor, target)) {
    return [
      {
        check: 'solvabilitySanity',
        detail: `solver's own move chain ends at [${finalPerColor}], not the proven target [${target}]`,
      },
    ];
  }
  return [];
}

/**
 * Ties everything above together into the flat JSON-serializable summary a
 * puzzle's generated difficulty record actually needs.
 *
 * @param {ReturnType<typeof buildPuzzleDag>} dag
 * @param {number[]} holeColors
 */
export function summarizeDagForPuzzle(dag, holeColors) {
  if (!dag.dagComplete) {
    return {
      dagComplete: false,
      sampled: false,
      nodesVisited: dag.nodesVisited,
      dagNodeCount: 0,
      dagEdgeCount: 0,
      avgRawBranching: null,
      avgSafeBranching: null,
      avgEffectiveBranching: null,
      avgTrapRatio: null,
      totalDifficulty: null,
      optimalPathCount: null,
      acceptanceFailures: [{ check: 'solverIncomplete', detail: 'solve exceeded node budget before proving best-possible' }],
    };
  }

  const branchingMetrics = computeBranchingMetrics(dag);
  const effectiveBranching = computeEffectiveBranching(dag);
  const totalDifficulty = computeTotalDifficulty(dag, branchingMetrics);

  let rawSum = 0;
  let safeSum = 0;
  let effectiveSum = 0;
  let trapSum = 0;
  for (const key of dag.dagNodeKeys) {
    const metrics = branchingMetrics.get(key);
    rawSum += metrics.rawBranching;
    safeSum += metrics.safeBranching;
    trapSum += metrics.trapRatio;
    effectiveSum += effectiveBranching.get(key);
  }
  const nodeCount = dag.dagNodeKeys.size || 1;

  const startingPerColor = countPegsRemaining(dag.startingMasks);
  const acceptanceFailures = [
    ...checkResidueCap(startingPerColor, dag.target),
    ...checkNoIsolatedDots(holeColors, dag.everLegalHoles),
    ...checkSolvabilitySanity(dag.solver, dag.startingMasks, dag.target),
  ];

  return {
    dagComplete: true,
    sampled: dag.sampled,
    nodesVisited: dag.nodesVisited,
    dagNodeCount: dag.dagNodeKeys.size,
    dagEdgeCount: dag.dagEdges.length,
    avgRawBranching: rawSum / nodeCount,
    avgSafeBranching: safeSum / nodeCount,
    avgEffectiveBranching: effectiveSum / nodeCount,
    avgTrapRatio: trapSum / nodeCount,
    totalDifficulty,
    // A string, not a bigint -- bigint can't survive JSON.stringify (the
    // batch script writes this straight into the generated puzzleDifficulty.js),
    // and this count routinely exceeds what a plain number can hold exactly
    // on a branchy board. When `sampled` is true, this is only the count
    // over the SAMPLED subset of the DAG, not the true total -- a lower
    // bound, not the real figure.
    optimalPathCount: countOptimalPaths(dag).toString(),
    acceptanceFailures,
  };
}
