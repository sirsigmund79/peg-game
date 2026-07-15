// ============================================================================
// logic/__tests__/ghostSettings.test.js
// ----------------------------------------------------------------------------
// Covers logic/ghostSettings.js's persisted booleans: `enabled` (the real
// feature switch, on by default), and the one-way (off by default,
// never flips back) flags -- `discovered`, `baselineCaptured`,
// `everDisabled`, `everReEnabled`.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isGhostEnabled,
  setGhostEnabled,
  isGhostDiscovered,
  markGhostDiscovered,
  isGhostBaselineCaptured,
  markGhostBaselineCaptured,
  isGhostEverDisabled,
  markGhostEverDisabled,
  isGhostEverReEnabled,
  markGhostEverReEnabled,
} from '../ghostSettings.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('isGhostEnabled', () => {
  it('defaults to true when nothing has been saved', () => {
    expect(isGhostEnabled()).toBe(true);
  });

  it('reflects a saved value', () => {
    setGhostEnabled(false);
    expect(isGhostEnabled()).toBe(false);
    setGhostEnabled(true);
    expect(isGhostEnabled()).toBe(true);
  });
});

describe('isGhostDiscovered / markGhostDiscovered', () => {
  it('defaults to false when nothing has been saved', () => {
    expect(isGhostDiscovered()).toBe(false);
  });

  it('flips permanently true once marked, and calling it again is a no-op', () => {
    markGhostDiscovered();
    expect(isGhostDiscovered()).toBe(true);
    markGhostDiscovered();
    expect(isGhostDiscovered()).toBe(true);
  });

  it('is independent of the enabled flag', () => {
    setGhostEnabled(false);
    markGhostDiscovered();
    expect(isGhostEnabled()).toBe(false);
    expect(isGhostDiscovered()).toBe(true);
  });
});

describe('isGhostBaselineCaptured / markGhostBaselineCaptured', () => {
  it('defaults to false when nothing has been saved', () => {
    expect(isGhostBaselineCaptured()).toBe(false);
  });

  it('flips permanently true once marked, and calling it again is a no-op', () => {
    markGhostBaselineCaptured();
    expect(isGhostBaselineCaptured()).toBe(true);
    markGhostBaselineCaptured();
    expect(isGhostBaselineCaptured()).toBe(true);
  });

  it('is independent of the other flags', () => {
    markGhostDiscovered();
    expect(isGhostBaselineCaptured()).toBe(false);
  });
});

describe('isGhostEverDisabled / markGhostEverDisabled', () => {
  it('defaults to false when nothing has been saved', () => {
    expect(isGhostEverDisabled()).toBe(false);
  });

  it('flips permanently true once marked, and calling it again is a no-op', () => {
    markGhostEverDisabled();
    expect(isGhostEverDisabled()).toBe(true);
    markGhostEverDisabled();
    expect(isGhostEverDisabled()).toBe(true);
  });
});

describe('isGhostEverReEnabled / markGhostEverReEnabled', () => {
  it('defaults to false when nothing has been saved', () => {
    expect(isGhostEverReEnabled()).toBe(false);
  });

  it('flips permanently true once marked, and calling it again is a no-op', () => {
    markGhostEverReEnabled();
    expect(isGhostEverReEnabled()).toBe(true);
    markGhostEverReEnabled();
    expect(isGhostEverReEnabled()).toBe(true);
  });

  it('is independent of everDisabled -- both can be tracked separately', () => {
    markGhostEverReEnabled();
    expect(isGhostEverDisabled()).toBe(false);
    expect(isGhostEverReEnabled()).toBe(true);
  });
});
