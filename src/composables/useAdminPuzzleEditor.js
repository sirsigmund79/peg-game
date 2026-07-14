// ============================================================================
// composables/useAdminPuzzleEditor.js
// ----------------------------------------------------------------------------
// The admin puzzle editor's orchestration layer: load ANY puzzle (pool or
// scheduled) into the existing level editor for editing, re-run the full
// solve/DAG/perceived-difficulty analysis in a worker (so it can't freeze
// the tab on the big boards this tool exists to fix), and save an edit back
// to logic/scheduledPuzzles.js via the local admin write endpoint.
//
// Deliberately a thin layer ON TOP of useEditor() rather than a rewrite of
// it -- cell editing, resizing, color count, Calculate Max/Watch Solve, and
// the local "My Puzzles" list all keep working completely unchanged.
// ============================================================================

import { reactive } from 'vue';
import { useEditor } from './useEditor.js';
import { buildCustomBoardFromDesign } from '../logic/customBoard.js';
import { resolvePuzzleForAdmin } from '../logic/puzzleAdminResolve.js';
import { buildDifficultyRecordFromAnalysis } from '../logic/puzzleDifficultyRecord.js';

const SAVE_ENDPOINT = '/__admin/save-scheduled-puzzle';

function countPegCells(cellStates) {
  return cellStates.filter((state) => typeof state === 'number').length;
}

/** Same construction useEditor.js's own (private) buildCurrentBoard does -- duplicated rather than exported, so useEditor.js stays untouched. */
function buildBoardFromEditorState(state) {
  if (state.shape === 'triangle') {
    return buildCustomBoardFromDesign({ shape: 'triangle', radius: state.triangleRadius, cellStates: state.cellStates });
  }
  return buildCustomBoardFromDesign({ shape: 'grid', rows: state.rows, cols: state.cols, cellStates: state.cellStates });
}

export function useAdminPuzzleEditor() {
  const editor = useEditor();

  const puzzleInfo = reactive({
    puzzleNumber: null,
    date: null,
    isScheduled: false,
    boardName: '',
  });

  const analysis = reactive({
    status: 'idle', // 'idle' | 'running' | 'done' | 'error' | 'cancelled'
    par: null,
    dagSummary: null,
    perceived: null,
    errorMessage: null,
    wallClockMs: null,
  });

  const save = reactive({
    status: 'idle', // 'idle' | 'saving' | 'saved' | 'error'
    errorMessage: null,
  });

  let activeWorker = null;

  function resetAnalysis() {
    analysis.status = 'idle';
    analysis.par = null;
    analysis.dagSummary = null;
    analysis.perceived = null;
    analysis.errorMessage = null;
    analysis.wallClockMs = null;
  }

  /** Loads any puzzle (pool-sourced or already scheduled) into the editor as an editable design. */
  function loadPuzzle(puzzleNumber) {
    const { date, isScheduled, boardName, design, par } = resolvePuzzleForAdmin(puzzleNumber);

    puzzleInfo.puzzleNumber = puzzleNumber;
    puzzleInfo.date = date;
    puzzleInfo.isScheduled = isScheduled;
    puzzleInfo.boardName = boardName;

    editor.loadSavedDesignIntoEditor({ ...design, name: boardName, par });
    resetAnalysis();
    save.status = 'idle';
    save.errorMessage = null;
  }

  /** Runs the full solve/DAG/perceived-difficulty analysis on the editor's CURRENT design, off the main thread. */
  function runAnalysis() {
    cancelAnalysis();

    const { geometry, holeColors } = buildBoardFromEditorState(editor.state);
    if (geometry.cellCount === 0) {
      analysis.status = 'error';
      analysis.errorMessage = 'Add some cells to the board first.';
      return;
    }

    analysis.status = 'running';
    analysis.errorMessage = null;
    editor.state.isBusy = true;
    const startedAt = Date.now();

    const worker = new Worker(new URL('../workers/puzzleAnalysisWorker.js', import.meta.url), { type: 'module' });
    activeWorker = worker;

    worker.onmessage = (event) => {
      if (activeWorker !== worker) return; // a stale response from a cancelled/superseded run
      const message = event.data;
      if (message.type === 'result') {
        analysis.status = 'done';
        analysis.par = message.par;
        analysis.dagSummary = message.dagSummary;
        analysis.perceived = message.perceived;
        analysis.wallClockMs = Date.now() - startedAt;
        if (message.par) editor.state.calculatedPar = message.par;
      } else {
        analysis.status = 'error';
        analysis.errorMessage = message.message;
      }
      editor.state.isBusy = false;
      worker.terminate();
      activeWorker = null;
    };
    worker.onerror = (event) => {
      if (activeWorker !== worker) return;
      analysis.status = 'error';
      analysis.errorMessage = event.message || 'The analysis worker crashed.';
      editor.state.isBusy = false;
      worker.terminate();
      activeWorker = null;
    };

    worker.postMessage({
      geometry,
      holeColors,
      colorCount: editor.state.colorCount,
      cellCount: geometry.cellCount,
    });
  }

  /** Cancels an in-flight analysis run, if any. */
  function cancelAnalysis() {
    if (!activeWorker) return;
    activeWorker.terminate();
    activeWorker = null;
    editor.state.isBusy = false;
    if (analysis.status === 'running') {
      analysis.status = 'cancelled';
    }
  }

  /**
   * Saves the editor's current design as a SCHEDULED_PUZZLES override for
   * the puzzle being edited, via the local admin write endpoint (dev-only,
   * see vite-plugins/puzzleAdminServer.js). If a re-run has completed since
   * the puzzle was loaded/last edited, its fresh difficulty numbers are
   * saved alongside it (into logic/puzzleDifficulty.js) in the SAME
   * request, so the grid (AdminPuzzlesView.vue) reflects them immediately
   * instead of showing whatever was there before the edit -- stale numbers
   * for a puzzle whose layout just changed would be actively misleading,
   * worse than the old "nothing shown yet" gap.
   */
  async function saveCurrentPuzzle(boardName, par) {
    if (!puzzleInfo.date) {
      save.status = 'error';
      save.errorMessage = 'No puzzle loaded.';
      return;
    }

    save.status = 'saving';
    save.errorMessage = null;

    const state = editor.state;
    const payload = {
      date: puzzleInfo.date,
      boardName,
      shape: state.shape,
      ...(state.shape === 'triangle' ? { radius: state.triangleRadius } : { rows: state.rows, cols: state.cols }),
      cellStates: state.cellStates,
      colorCount: state.colorCount,
      par,
    };

    if (analysis.status === 'done') {
      payload.difficultyRecord = buildDifficultyRecordFromAnalysis({
        puzzleNumber: puzzleInfo.puzzleNumber,
        date: puzzleInfo.date,
        boardName,
        pegCount: countPegCells(state.cellStates),
        storedPar: par,
        analysis,
        wallClockMs: analysis.wallClockMs,
      });
    }

    try {
      const response = await fetch(SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Save failed (${response.status})`);
      }
      save.status = 'saved';
      puzzleInfo.isScheduled = true;
      puzzleInfo.boardName = boardName;
    } catch (error) {
      save.status = 'error';
      save.errorMessage = error.message;
    }
  }

  return reactive({
    editor,
    puzzleInfo,
    analysis,
    save,
    loadPuzzle,
    runAnalysis,
    cancelAnalysis,
    saveCurrentPuzzle,
  });
}
