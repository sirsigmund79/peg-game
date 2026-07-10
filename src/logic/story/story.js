// ============================================================================
// logic/story/story.js
// ----------------------------------------------------------------------------
// Turns a Forest Trail node (see forestTrailLevels.js) into an actual
// playable puzzle, and tracks which nodes have been cleared (and how well)
// so the map (components/StoryMapView.vue) knows what's unlocked. No Vue
// code here -- components/StoryChapterView.vue and StoryMapView.vue are the
// reactive wrappers.
// ============================================================================

import { BOARD_CATALOG } from '../boards.js';
import { PUZZLE_POOL } from '../puzzlePool.js';
import { getEmptyHolesFromColors } from '../rules.js';
import { safeGet, safeSet, safeRemove } from '../storage.js';
import { FOREST_TRAIL_NODES, TRAIL_EDGES } from './forestTrailLevels.js';

const STORY_PROGRESS_KEY = 'dotHop.story.forestTrail.progress';

// A node is "decently cleared" once it's better than the worst rank tier
// ("Eg-no-ra-moose", the RANK_TIERS entry with overPar: null in
// logic/rules.js) -- i.e. any real match (overPar 0, 1, or 2).
const DECENT_CLEAR_MAX_OVER_PAR = 2;

/** @param {string} id @returns {object|undefined} */
export function getNodeById(id) {
  return FOREST_TRAIL_NODES.find((node) => node.id === id);
}

/**
 * Builds a full puzzle object (the same shape logic/daily.js produces) for
 * a node, using the FIRST solver-verified pool entry for that node's board
 * shape -- no new puzzle design or solving needed, just reusing a
 * known-good starting position.
 *
 * @param {{boardId: string, title: string}} node
 * @returns {object}
 */
export function getChapterPuzzle(node) {
  const board = BOARD_CATALOG[node.boardId];
  const entry = PUZZLE_POOL.find((poolEntry) => poolEntry.boardId === node.boardId);
  const emptyHoles = getEmptyHolesFromColors(entry.holeColors);
  const holeWord = emptyHoles.length === 1 ? 'hole' : 'holes';
  return {
    puzzleNumber: null, // not a daily puzzle -- useGame.js skips recordResult() for these
    date: null,
    boardId: board.id,
    boardName: node.title,
    geometry: board.geometry,
    holeColors: entry.holeColors,
    colorCount: entry.par.length,
    emptyHoles,
    label: `${emptyHoles.length} empty ${holeWord}`,
    par: entry.par,
    cellCount: board.geometry.cellCount,
  };
}

/** @returns {{completed: Object<string, {overPar: number, won: boolean}>}} */
function readProgress() {
  return safeGet(STORY_PROGRESS_KEY, { completed: {} });
}

/**
 * @param {string} nodeId
 * @returns {{overPar: number, won: boolean}|null} the node's recorded result, or null if unplayed.
 */
export function getBestResult(nodeId) {
  return readProgress().completed[nodeId] ?? null;
}

/**
 * Records a node's result. Keeps the BEST (lowest overPar) result seen
 * across replays, so a worse retry can't accidentally re-lock anything.
 *
 * @param {string} nodeId
 * @param {{overPar: number, won: boolean}} result
 */
export function recordNodeResult(nodeId, result) {
  const progress = readProgress();
  const existing = progress.completed[nodeId];
  if (!existing || result.overPar < existing.overPar) {
    progress.completed[nodeId] = result;
    safeSet(STORY_PROGRESS_KEY, progress);
  }
}

/**
 * A node is unlocked if it has no incoming trail edge (the trailhead), or
 * any edge feeding into it comes from a node that's been decently cleared.
 * Riverside has two outgoing edges (to Old Bridge, and the shortcut to
 * Treehouse) -- clearing Riverside decently unlocks both at once.
 *
 * @param {string} nodeId
 * @returns {boolean}
 */
export function isNodeUnlocked(nodeId) {
  const incomingEdges = TRAIL_EDGES.filter((edge) => edge.to === nodeId);
  if (incomingEdges.length === 0) return true;
  return incomingEdges.some((edge) => {
    const result = getBestResult(edge.from);
    return result !== null && result.overPar <= DECENT_CLEAR_MAX_OVER_PAR;
  });
}

/** Clears all saved story progress. */
export function resetStoryProgress() {
  safeRemove(STORY_PROGRESS_KEY);
}
