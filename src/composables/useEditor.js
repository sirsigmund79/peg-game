// ============================================================================
// composables/useEditor.js
// ----------------------------------------------------------------------------
// The state and actions behind the level editor: a grid of clickable cells
// the developer can shape into a custom multi-color board, a "Calculate
// Max" button that runs the solver on it, a "Watch Solve" button that
// plays out the best solution, and save/load for custom designs (kept in
// localStorage -- see logic/storage.js).
//
// This is a personal, LOCAL tool. A saved custom puzzle only exists on your
// own device -- it is never mixed into the shared daily puzzle (every
// player must see the exact same daily puzzle, and there's no server to
// hand a custom design out to other people).
// ============================================================================

import { reactive } from 'vue';
import { buildCustomBoardFromDesign, buildPlayablePuzzleFromDesign } from '../logic/customBoard.js';
import { createStartingMasks } from '../logic/rules.js';
import { calculateBestOutcome, watchSolve as playWatchSolveAnimation } from '../fx/watchSolve.js';
import { getPegColor } from '../logic/pegColors.js';
import { useGame } from './useGame.js';
import { safeGet, safeSet } from '../logic/storage.js';

const DEFAULT_ROWS = 9;
const DEFAULT_COLS = 9;
const DEFAULT_COLOR_COUNT = 3;
const MIN_COLOR_COUNT = 2;
const MAX_COLOR_COUNT = 4;

// A safety cap, not a game rule: solving runs on the main thread, so a
// truly huge hand-drawn board (lots of cells, lots of pegs) could take long
// enough to freeze the browser tab. 40 cells comfortably covers every
// built-in shape (the biggest is 37) with solves well under a second.
export const MAX_SOLVABLE_CELL_COUNT = 40;

const SAVED_PUZZLES_STORAGE_KEY = 'dot-hop:custom-puzzles';

function makeBlankCellStates(rows, cols) {
  return new Array(rows * cols).fill('none');
}

function loadSavedPuzzles() {
  return safeGet(SAVED_PUZZLES_STORAGE_KEY, []);
}

function persistSavedPuzzles(list) {
  safeSet(SAVED_PUZZLES_STORAGE_KEY, list);
}

/** Formats a per-color result array as e.g. "🔵1 🟣2" for status messages. */
function formatPerColor(perColor) {
  return perColor.map((count, colorIndex) => `${getPegColor(colorIndex).emoji}${count}`).join(' ');
}

export function useEditor() {
  const state = reactive({
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    colorCount: DEFAULT_COLOR_COUNT,
    cellStates: makeBlankCellStates(DEFAULT_ROWS, DEFAULT_COLS),
    calculatedPar: null,
    statusMessage: 'Click a cell to cycle through peg colors. Click past the last color to make it an empty hole. Click once more to remove it.',
    isBusy: false,
    previewGame: null, // set to a useGame() instance while Watch Solve is animating
    savedPuzzles: loadSavedPuzzles(),
  });

  /** Cycles one cell: none -> color 0 -> color 1 -> ... -> color (colorCount-1) -> empty -> none. */
  function cycleCell(row, col) {
    if (state.isBusy) return; // don't let editing happen mid-animation
    const index = row * state.cols + col;
    const current = state.cellStates[index];
    let next;
    if (current === 'none') {
      next = 0;
    } else if (typeof current === 'number') {
      next = current + 1 < state.colorCount ? current + 1 : 'empty';
    } else {
      next = 'none';
    }
    state.cellStates[index] = next;
    state.calculatedPar = null; // the board changed, so any old answer is stale
    state.statusMessage = '';
  }

  /** Changes how many peg colors the design uses (2-4), remapping any cell whose color is now out of range. */
  function setColorCount(newColorCount) {
    const clamped = Math.min(MAX_COLOR_COUNT, Math.max(MIN_COLOR_COUNT, newColorCount));
    if (clamped === state.colorCount) return;
    state.cellStates = state.cellStates.map((cellState) =>
      typeof cellState === 'number' ? Math.min(cellState, clamped - 1) : cellState
    );
    state.colorCount = clamped;
    state.calculatedPar = null;
    state.statusMessage = '';
  }

  /** Resizes the grid, keeping whatever cell states still fit in the new size. */
  function resizeGrid(newRows, newCols) {
    const nextCellStates = makeBlankCellStates(newRows, newCols);
    for (let row = 0; row < Math.min(newRows, state.rows); row++) {
      for (let col = 0; col < Math.min(newCols, state.cols); col++) {
        nextCellStates[row * newCols + col] = state.cellStates[row * state.cols + col];
      }
    }
    state.rows = newRows;
    state.cols = newCols;
    state.cellStates = nextCellStates;
    state.calculatedPar = null;
  }

  /** Clears every cell back to 'none'. */
  function clearGrid() {
    state.cellStates = makeBlankCellStates(state.rows, state.cols);
    state.calculatedPar = null;
    state.statusMessage = '';
  }

  /** Builds the current design into a real, solvable board. */
  function buildCurrentBoard() {
    return buildCustomBoardFromDesign({ rows: state.rows, cols: state.cols, cellStates: state.cellStates });
  }

  /** Runs the solver and reports the best possible outcome, without playing anything. */
  function calculateMax() {
    const { geometry, holeColors } = buildCurrentBoard();
    const emptyHoleCount = holeColors.filter((color) => color === -1).length;

    if (geometry.cellCount === 0) {
      state.statusMessage = 'Add some pegs to the board first.';
      return;
    }
    if (geometry.cellCount > MAX_SOLVABLE_CELL_COUNT) {
      state.statusMessage = `That's ${geometry.cellCount} cells -- too many to calculate live (limit is ${MAX_SOLVABLE_CELL_COUNT}). Try a smaller design.`;
      return;
    }
    if (emptyHoleCount === 0) {
      state.statusMessage = 'Click at least one cell to make it an empty starting hole.';
      return;
    }

    state.isBusy = true;
    const startingMasks = createStartingMasks(geometry.cellCount, holeColors, state.colorCount);
    const result = calculateBestOutcome(geometry, startingMasks);
    state.calculatedPar = result.perColor;
    state.statusMessage = `Best possible: ${formatPerColor(result.perColor)} left.`;
    state.isBusy = false;
  }

  /** Plays out the best solution on a temporary preview board. */
  async function watchSolve() {
    const { geometry, holeColors } = buildCurrentBoard();
    const emptyHoleCount = holeColors.filter((color) => color === -1).length;

    if (geometry.cellCount === 0 || emptyHoleCount === 0) {
      state.statusMessage = 'Design a board with at least one empty hole first.';
      return;
    }
    if (geometry.cellCount > MAX_SOLVABLE_CELL_COUNT) {
      state.statusMessage = `That's ${geometry.cellCount} cells -- too many to solve live (limit is ${MAX_SOLVABLE_CELL_COUNT}).`;
      return;
    }

    state.isBusy = true;
    const startingMasks = createStartingMasks(geometry.cellCount, holeColors, state.colorCount);
    const bestResult = calculateBestOutcome(geometry, startingMasks);
    state.calculatedPar = bestResult.perColor;

    const previewPuzzle = {
      puzzleNumber: null,
      date: null,
      boardId: 'custom-preview',
      boardName: 'Preview',
      geometry,
      holeColors,
      colorCount: state.colorCount,
      label: 'Watch solve',
      par: bestResult.perColor,
      cellCount: geometry.cellCount,
    };
    state.previewGame = useGame(previewPuzzle);
    state.statusMessage = 'Watching the best solution play out...';

    await playWatchSolveAnimation(state.previewGame);

    state.statusMessage = `Done! Finished with ${formatPerColor(state.previewGame.pegsRemaining)}.`;
    state.isBusy = false;
  }

  /** Closes the Watch Solve preview and goes back to editing. */
  function closePreview() {
    state.previewGame = null;
  }

  /** Saves the current design as a named custom puzzle (calculates par first if needed). */
  function saveCurrentDesign(name) {
    if (state.calculatedPar === null) {
      calculateMax();
    }
    if (state.calculatedPar === null) {
      return false; // calculateMax() couldn't run (board too big / empty) -- see statusMessage
    }

    const savedPuzzle = {
      id: `custom-${Date.now()}`,
      name: name && name.trim() ? name.trim() : 'Untitled design',
      rows: state.rows,
      cols: state.cols,
      colorCount: state.colorCount,
      cellStates: [...state.cellStates],
      par: state.calculatedPar,
      createdAt: new Date().toISOString(),
    };

    state.savedPuzzles = [...state.savedPuzzles, savedPuzzle];
    persistSavedPuzzles(state.savedPuzzles);
    state.statusMessage = `Saved "${savedPuzzle.name}" to My Puzzles.`;
    return true;
  }

  /** Removes a saved custom puzzle. */
  function deleteSavedPuzzle(puzzleId) {
    state.savedPuzzles = state.savedPuzzles.filter((puzzle) => puzzle.id !== puzzleId);
    persistSavedPuzzles(state.savedPuzzles);
  }

  /** Loads a saved design back into the grid for further editing. */
  function loadSavedDesignIntoEditor(savedPuzzle) {
    state.rows = savedPuzzle.rows;
    state.cols = savedPuzzle.cols;
    state.colorCount = savedPuzzle.colorCount;
    state.cellStates = [...savedPuzzle.cellStates];
    state.calculatedPar = savedPuzzle.par;
    state.statusMessage = `Loaded "${savedPuzzle.name}" for editing.`;
  }

  /**
   * Loads a saved design's shape back into the grid, but resets every
   * 'empty' cell back to color 0 first -- lets you reuse the same board
   * outline with a different starting hole (or set of holes) without
   * touching the original saved puzzle. Nothing is saved until you click
   * Save again, which creates a brand-new entry.
   */
  function duplicateSavedDesign(savedPuzzle) {
    state.rows = savedPuzzle.rows;
    state.cols = savedPuzzle.cols;
    state.colorCount = savedPuzzle.colorCount;
    state.cellStates = savedPuzzle.cellStates.map((cellState) => (cellState === 'empty' ? 0 : cellState));
    state.calculatedPar = null;
    state.statusMessage = `Duplicated "${savedPuzzle.name}" -- click a cell to pick a new starting hole, then Save.`;
  }

  /** Builds a real, playable puzzle object from a saved design -- hand this to useGame(). */
  function puzzleFromSavedDesign(savedPuzzle) {
    return buildPlayablePuzzleFromDesign(savedPuzzle);
  }

  /**
   * Copies a ready-to-paste logic/scheduledPuzzles.js entry for this saved
   * design to the clipboard (keyed by a placeholder date -- see that
   * file's header comment for how to actually schedule it). This is the
   * bridge between a LOCAL editor design and an actual shared daily
   * puzzle: since there's no server, "scheduling" means pasting this
   * snippet into the source and redeploying.
   */
  async function copyScheduleSnippet(savedPuzzle) {
    const snippet =
      `  "YYYY-MM-DD": { boardName: ${JSON.stringify(savedPuzzle.name)}, rows: ${savedPuzzle.rows}, ` +
      `cols: ${savedPuzzle.cols}, cellStates: ${JSON.stringify(savedPuzzle.cellStates)}, ` +
      `colorCount: ${savedPuzzle.colorCount}, par: ${JSON.stringify(savedPuzzle.par)} },`;

    try {
      await navigator.clipboard.writeText(snippet);
      state.statusMessage = 'Copied! Paste it into src/logic/scheduledPuzzles.js and replace "YYYY-MM-DD" with the date it should appear.';
    } catch {
      state.statusMessage = `Couldn't reach the clipboard -- copy this line into src/logic/scheduledPuzzles.js by hand:\n${snippet}`;
    }
  }

  return reactive({
    state,
    cycleCell,
    setColorCount,
    resizeGrid,
    clearGrid,
    calculateMax,
    watchSolve,
    closePreview,
    saveCurrentDesign,
    deleteSavedPuzzle,
    loadSavedDesignIntoEditor,
    duplicateSavedDesign,
    puzzleFromSavedDesign,
    copyScheduleSnippet,
  });
}
