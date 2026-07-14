// ============================================================================
// logic/__tests__/puzzleDifficultyRecord.test.js
// ----------------------------------------------------------------------------
// buildDifficultyRecordFromAnalysis is what makes a live admin re-run's
// numbers show up correctly in AdminPuzzlesView.vue's grid after saving --
// wrong mismatch detection or bucket classification here would silently
// mislabel a puzzle. Bucket cutoffs come from the REAL puzzleDifficulty.js's
// own DIFFICULTY_META (not a synthetic fixture), so this breaks immediately
// if that file's cutoffs and this test's expectations ever drift apart.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { buildDifficultyRecordFromAnalysis } from '../puzzleDifficultyRecord.js';
import { DIFFICULTY_META } from '../puzzleDifficulty.js';

function makeAnalysis({ par, dagOverrides = {}, perceivedOverrides = {} }) {
  return {
    par,
    dagSummary: {
      dagComplete: true,
      sampled: false,
      nodesVisited: 100,
      dagNodeCount: 10,
      dagEdgeCount: 20,
      avgRawBranching: 2,
      avgSafeBranching: 1.5,
      avgEffectiveBranching: 1,
      avgTrapRatio: 0.25,
      totalDifficulty: DIFFICULTY_META.easyCutoff - 1, // deliberately below the Easy cutoff
      optimalPathCount: '4',
      acceptanceFailures: [],
      ...dagOverrides,
    },
    perceived: {
      perceivedDifficulty: 0.5,
      heuristicResults: [],
      symmetryScore: null,
      ...perceivedOverrides,
    },
  };
}

const BASE_INPUT = {
  puzzleNumber: 200,
  date: '2027-01-01',
  boardName: 'Test Puzzle',
  pegCount: 12,
  wallClockMs: 42,
};

describe('buildDifficultyRecordFromAnalysis', () => {
  it('reports no mismatch when the saved par matches what the solver proved', () => {
    const record = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [2, 1],
      analysis: makeAnalysis({ par: [2, 1] }),
    });
    expect(record.mismatch).toBeNull();
    expect(record.bestPossible).toBe(3);
    expect(record.solverBest).toBe(3);
  });

  it('flags solver_found_better when the solver proves a lower total than the saved par', () => {
    const record = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [3, 2], // admin is about to save this (5 total)
      analysis: makeAnalysis({ par: [2, 1] }), // but the solver proved 3 is achievable
    });
    expect(record.mismatch).toBe('solver_found_better');
  });

  it('flags solver_worse_than_stored when the solver cannot match the saved par', () => {
    const record = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [1, 1], // admin is about to save this (2 total)
      analysis: makeAnalysis({ par: [2, 2] }), // solver only proved 4
    });
    expect(record.mismatch).toBe('solver_worse_than_stored');
  });

  it('flags solver_incomplete (not a numeric comparison) when the re-run never completed', () => {
    const record = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [1, 1],
      analysis: makeAnalysis({ par: null, dagOverrides: { dagComplete: false, totalDifficulty: null } }),
    });
    expect(record.mismatch).toBe('solver_incomplete');
    expect(record.solverBest).toBeNull();
  });

  it('classifies the bucket using the REAL puzzleDifficulty.js cutoffs, not a recomputed set', () => {
    const easy = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [1],
      analysis: makeAnalysis({ par: [1], dagOverrides: { totalDifficulty: DIFFICULTY_META.easyCutoff - 0.01 } }),
    });
    expect(easy.difficultyBucket).toBe('Easy');

    const genius = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [1],
      analysis: makeAnalysis({ par: [1], dagOverrides: { totalDifficulty: DIFFICULTY_META.mediumCutoff + 0.01 } }),
    });
    expect(genius.difficultyBucket).toBe('Genius');
  });

  it('always sets boardId to "scheduled", regardless of whether the puzzle started pool-sourced', () => {
    const record = buildDifficultyRecordFromAnalysis({
      ...BASE_INPUT,
      storedPar: [1],
      analysis: makeAnalysis({ par: [1] }),
    });
    expect(record.boardId).toBe('scheduled');
  });
});
