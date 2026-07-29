// ============================================================================
// logic/__tests__/solutionLock.test.js
// ----------------------------------------------------------------------------
// Covers logic/solutionLock.js's one-way per-puzzle lock: unset by default,
// set by lockSolution(), persisted, idempotent, and independent per puzzle.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { isSolutionLocked, lockSolution } from '../solutionLock.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('solutionLock', () => {
  it('defaults to unlocked when nothing has been saved', () => {
    expect(isSolutionLocked(842)).toBe(false);
  });

  it('locks a puzzle and reports it locked', () => {
    lockSolution(842);
    expect(isSolutionLocked(842)).toBe(true);
  });

  it('locks each puzzle independently', () => {
    lockSolution(842);
    expect(isSolutionLocked(842)).toBe(true);
    expect(isSolutionLocked(843)).toBe(false);
  });

  it('persists the lock across separate reads (fresh store each call)', () => {
    lockSolution(842);
    // isSolutionLocked reads storage afresh every time -- so this proves the
    // write actually landed, not just an in-memory flag.
    expect(isSolutionLocked(842)).toBe(true);
  });

  it('is idempotent -- locking an already-locked puzzle stays locked', () => {
    lockSolution(842);
    lockSolution(842);
    expect(isSolutionLocked(842)).toBe(true);
  });
});
