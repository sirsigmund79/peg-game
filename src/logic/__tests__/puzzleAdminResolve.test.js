// ============================================================================
// src/logic/__tests__/puzzleAdminResolve.test.js
// ----------------------------------------------------------------------------
// buildSwappedDifficultyRecords is the one bit of logic keeping
// AdminPuzzlesView.vue's difficulty badges honest across a drag-to-swap: a
// bug here means a puzzle's bucket stays pinned to the day it used to
// occupy instead of following its content to the new day.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { buildSwappedDifficultyRecords } from '../puzzleAdminResolve.js';

describe('buildSwappedDifficultyRecords', () => {
  it('trades both records, relabeling puzzleNumber/date to the NEW slot while leaving content fields untouched', () => {
    const sourceRecord = { puzzleNumber: 5, date: '2026-06-03', difficultyBucket: 'Easy', bestPossible: 3 };
    const targetRecord = { puzzleNumber: 9, date: '2026-06-07', difficultyBucket: 'Genius', bestPossible: 6 };

    const [sourceSlotUpdate, targetSlotUpdate] = buildSwappedDifficultyRecords(
      { puzzleNumber: 5, date: '2026-06-03', record: sourceRecord },
      { puzzleNumber: 9, date: '2026-06-07', record: targetRecord }
    );

    // Source's day (5) now shows target's content, so it inherits target's numbers.
    expect(sourceSlotUpdate).toEqual({
      puzzleNumber: 5,
      record: { puzzleNumber: 5, date: '2026-06-03', difficultyBucket: 'Genius', bestPossible: 6 },
    });
    // Target's day (9) now shows source's content, so it inherits source's numbers.
    expect(targetSlotUpdate).toEqual({
      puzzleNumber: 9,
      record: { puzzleNumber: 9, date: '2026-06-07', difficultyBucket: 'Easy', bestPossible: 3 },
    });
  });

  it('clears the OTHER slot when one side has no record, instead of leaving its old bucket behind', () => {
    const sourceRecord = { puzzleNumber: 5, date: '2026-06-03', difficultyBucket: 'Easy', bestPossible: 3 };

    const [sourceSlotUpdate, targetSlotUpdate] = buildSwappedDifficultyRecords(
      { puzzleNumber: 5, date: '2026-06-03', record: sourceRecord },
      { puzzleNumber: 9, date: '2026-06-07', record: null } // never analyzed
    );

    // Source's day now shows the unanalyzed content -- no record to show.
    expect(sourceSlotUpdate).toEqual({ puzzleNumber: 5, record: null });
    // Target's day now shows source's (analyzed) content, relabeled to itself.
    expect(targetSlotUpdate).toEqual({
      puzzleNumber: 9,
      record: { puzzleNumber: 9, date: '2026-06-07', difficultyBucket: 'Easy', bestPossible: 3 },
    });
  });

  it('returns null for both slots when neither side was ever analyzed', () => {
    const result = buildSwappedDifficultyRecords(
      { puzzleNumber: 5, date: '2026-06-03', record: null },
      { puzzleNumber: 9, date: '2026-06-07', record: null }
    );

    expect(result).toEqual([
      { puzzleNumber: 5, record: null },
      { puzzleNumber: 9, record: null },
    ]);
  });
});
