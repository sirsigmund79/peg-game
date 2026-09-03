// ============================================================================
// services/__tests__/viral.test.js
// ----------------------------------------------------------------------------
// Covers services/viral.js's share text -- the one string this game sends out
// into the world, where a wrong claim is a wrong claim in public.
//
// The mode line gets the most attention: it has to appear for a Pro attempt,
// and has to stay off every other share rather than announcing the plain state
// of the game. Whether an attempt COUNTS as Pro is decided upstream by
// useGame.js's `proRound` latch; this file only checks that buildShareText
// reports faithfully whatever it is handed.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { buildShareText } from '../viral.js';

const BASE = {
  pegsRemaining: [1, 2],
  puzzleNumber: 842,
  formattedDate: 'September 3, 2026',
  rank: 'Genius',
};

describe('buildShareText', () => {
  it('leaves the mode line out by default', () => {
    expect(buildShareText(BASE)).not.toContain('Pro mode');
  });

  it('leaves the mode line out for an attempt that was not Pro', () => {
    expect(buildShareText({ ...BASE, proMode: false })).not.toContain('Pro mode');
  });

  it('names Pro mode for an attempt that was', () => {
    expect(buildShareText({ ...BASE, proMode: true })).toContain('Pro mode — no Undo');
  });

  it('puts the mode line between the pegs and the link', () => {
    const lines = buildShareText({ ...BASE, proMode: true }).split('\n');
    const modeIndex = lines.findIndex((line) => line.startsWith('Pro mode'));
    const linkIndex = lines.findIndex((line) => line.startsWith('https://'));
    expect(modeIndex).toBeGreaterThan(0);
    expect(linkIndex).toBe(modeIndex + 1);
    expect(lines[modeIndex - 1]).toMatch(/[🔵🟣🟢🟡🟠🔴⚪🟤]/u);
  });

  it('keeps the mode line above Tries when both are shown', () => {
    const lines = buildShareText({ ...BASE, proMode: true, tries: 3 }).split('\n');
    expect(lines.findIndex((line) => line.startsWith('Pro mode')))
      .toBeLessThan(lines.findIndex((line) => line.startsWith('Tries:')));
  });

  it('still names the mode for a custom design, which has no day to link to', () => {
    const text = buildShareText({
      pegsRemaining: [1], puzzleNumber: null, formattedDate: null, rank: null, proMode: true,
    });
    expect(text).toContain('Pro mode — no Undo');
    expect(text).toContain('?ref=share');
  });

  it('never reveals a move, whatever the mode', () => {
    const text = buildShareText({ ...BASE, proMode: true, tries: 3 });
    expect(text).not.toMatch(/\bfrom\b|\bover\b|->/);
  });
});
