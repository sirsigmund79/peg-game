// ============================================================================
// logic/story/story.js
// ----------------------------------------------------------------------------
// Turns a "Board Meeting" chapter (see boardMeetingChapters.js) into an
// actual playable puzzle, and tracks which chapter the player is on. No Vue
// code here -- components/StoryView.vue is the reactive wrapper.
// ============================================================================

import { BOARD_CATALOG } from '../boards.js';
import { PUZZLE_POOL } from '../puzzlePool.js';
import { getEmptyHolesFromColors } from '../rules.js';
import { safeGet, safeSet, safeRemove } from '../storage.js';

const STORY_PROGRESS_KEY = 'dotHop.story.boardMeeting.chapterIndex';

/**
 * Builds a full puzzle object (the same shape logic/daily.js produces) for
 * a chapter, using the FIRST solver-verified pool entry for that chapter's
 * board shape -- no new puzzle design or solving needed, just reusing a
 * known-good starting position.
 *
 * @param {{boardId: string, title: string}} chapter
 * @returns {object}
 */
export function getChapterPuzzle(chapter) {
  const board = BOARD_CATALOG[chapter.boardId];
  const entry = PUZZLE_POOL.find((poolEntry) => poolEntry.boardId === chapter.boardId);
  const emptyHoles = getEmptyHolesFromColors(entry.holeColors);
  const holeWord = emptyHoles.length === 1 ? 'hole' : 'holes';
  return {
    puzzleNumber: null, // not a daily puzzle -- useGame.js skips recordResult() for these
    date: null,
    boardId: board.id,
    boardName: chapter.title,
    geometry: board.geometry,
    holeColors: entry.holeColors,
    colorCount: entry.par.length,
    emptyHoles,
    label: `${emptyHoles.length} empty ${holeWord}`,
    par: entry.par,
    cellCount: board.geometry.cellCount,
  };
}

/** @returns {number} the chapter index the player last reached (0 if none saved). */
export function getStoryProgress() {
  return safeGet(STORY_PROGRESS_KEY, 0);
}

/** @param {number} chapterIndex */
export function setStoryProgress(chapterIndex) {
  safeSet(STORY_PROGRESS_KEY, chapterIndex);
}

/** Clears saved progress, so the story restarts from chapter 0. */
export function resetStoryProgress() {
  safeRemove(STORY_PROGRESS_KEY);
}
