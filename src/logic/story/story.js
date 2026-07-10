// ============================================================================
// logic/story/story.js
// ----------------------------------------------------------------------------
// Turns a Forest Trail node (see forestTrailLevels.js) into an actual
// playable puzzle, and tracks which nodes have had every hidden friend
// found so the map (components/StoryMapView.vue) knows what's unlocked. No
// Vue code here -- components/StoryChapterView.vue and StoryMapView.vue
// are the reactive wrappers.
// ============================================================================

import { BOARD_CATALOG } from '../boards.js';
import { PUZZLE_POOL } from '../puzzlePool.js';
import { getEmptyHolesFromColors } from '../rules.js';
import { safeGet, safeSet, safeRemove } from '../storage.js';
import { FOREST_TRAIL_NODES, TRAIL_EDGES } from './forestTrailLevels.js';

const STORY_PROGRESS_KEY = 'dotHop.story.forestTrail.progress';

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
    // Winning a Forest Trail node means revealing every hidden friend, not
    // matching par -- see useGame.js's hasWon. Every index here was picked
    // from a real solver-reconstructed solution (see forestTrailLevels.js's
    // header comment), so it's guaranteed reachable by at least one line
    // of play.
    friendHoles: node.friends.map((friend) => friend.index),
  };
}

/** @returns {{completed: Object<string, {won: boolean}>}} */
function readProgress() {
  return safeGet(STORY_PROGRESS_KEY, { completed: {} });
}

/**
 * @param {string} nodeId
 * @returns {{won: boolean}|null} the node's recorded result, or null if unplayed.
 */
export function getBestResult(nodeId) {
  return readProgress().completed[nodeId] ?? null;
}

/**
 * Records a node's result. `won` is sticky once true -- a later, worse
 * replay of an already-won node can never re-lock anything downstream.
 * There's no par/rank to weigh here anymore: finding every hidden friend
 * either happened or it didn't.
 *
 * @param {string} nodeId
 * @param {{won: boolean}} result
 */
export function recordNodeResult(nodeId, result) {
  const progress = readProgress();
  const existing = progress.completed[nodeId];
  progress.completed[nodeId] = { won: result.won || (existing?.won ?? false) };
  safeSet(STORY_PROGRESS_KEY, progress);
}

/**
 * A node is unlocked if it has no incoming trail edge (the trailhead), or
 * any edge feeding into it comes from a node whose friends have all been
 * found. Riverside has two outgoing edges (to Old Bridge, and the shortcut
 * to Treehouse) -- winning Riverside unlocks both at once.
 *
 * @param {string} nodeId
 * @returns {boolean}
 */
export function isNodeUnlocked(nodeId) {
  const incomingEdges = TRAIL_EDGES.filter((edge) => edge.to === nodeId);
  if (incomingEdges.length === 0) return true;
  return incomingEdges.some((edge) => getBestResult(edge.from)?.won === true);
}

/** Clears all saved story progress. */
export function resetStoryProgress() {
  safeRemove(STORY_PROGRESS_KEY);
}
