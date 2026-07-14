// ============================================================================
// vite-plugins/__tests__/puzzleAdminServer.test.js
// ----------------------------------------------------------------------------
// upsertScheduledPuzzleEntry is the one piece of this plugin that actually
// touches a git-tracked source file -- if it's wrong, an admin save could
// clobber unrelated puzzle entries or corrupt scheduledPuzzles.js outright.
// Tested against the REAL current file content (not a synthetic fixture),
// so this breaks immediately if scheduledPuzzles.js's format ever drifts
// from the one-entry-per-line convention this splice depends on.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { upsertScheduledPuzzleEntry, upsertPuzzleDifficultyRecord, removePuzzleDifficultyRecord } from '../puzzleAdminServer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REAL_FILE_TEXT = readFileSync(join(__dirname, '..', '..', 'src', 'logic', 'scheduledPuzzles.js'), 'utf8');
const REAL_DIFFICULTY_FILE_TEXT = readFileSync(join(__dirname, '..', '..', 'src', 'logic', 'puzzleDifficulty.js'), 'utf8');

describe('upsertScheduledPuzzleEntry', () => {
  it('replaces only the one line for an existing date, leaving every other line byte-identical', () => {
    const newEntryLine = '  "2026-07-11": { boardName: "Edited", shape: "grid", rows: 1, cols: 1, cellStates: [0], colorCount: 1, par: [1] },';
    const result = upsertScheduledPuzzleEntry(REAL_FILE_TEXT, '2026-07-11', newEntryLine);

    const originalLines = REAL_FILE_TEXT.split(/\r\n|\n/);
    const resultLines = result.split(/\r\n|\n/);

    expect(resultLines).toHaveLength(originalLines.length); // no lines added or removed
    const changedLines = resultLines.filter((line, index) => line !== originalLines[index]);
    expect(changedLines).toEqual([newEntryLine]);
  });

  it('inserts a new line for a date not yet scheduled, just before the closing "};"', () => {
    const newEntryLine = '  "2026-12-25": { boardName: "Xmas", shape: "grid", rows: 1, cols: 1, cellStates: [0], colorCount: 1, par: [1] },';
    const result = upsertScheduledPuzzleEntry(REAL_FILE_TEXT, '2026-12-25', newEntryLine);

    const originalLines = REAL_FILE_TEXT.split(/\r\n|\n/);
    const resultLines = result.split(/\r\n|\n/);

    expect(resultLines).toHaveLength(originalLines.length + 1);
    expect(resultLines).toContain(newEntryLine);
    // Still valid: the closing brace of the object comes right after it.
    const insertedIndex = resultLines.indexOf(newEntryLine);
    expect(resultLines[insertedIndex + 1].trim()).toBe('};');
    // Every original line is still present, untouched, in the same relative order.
    expect(resultLines.filter((line) => line !== newEntryLine)).toEqual(originalLines);
  });

  it('preserves the file\'s CRLF line endings throughout, not just on unmodified lines', () => {
    expect(REAL_FILE_TEXT).toContain('\r\n'); // sanity check on the fixture itself
    const newEntryLine = '  "2026-07-11": { boardName: "Edited", shape: "grid", rows: 1, cols: 1, cellStates: [0], colorCount: 1, par: [1] },';
    const result = upsertScheduledPuzzleEntry(REAL_FILE_TEXT, '2026-07-11', newEntryLine);
    const lines = result.split('\n');
    // Every line except the very last should end with '\r' if the file is CRLF throughout.
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i].endsWith('\r')).toBe(true);
    }
  });

  it('produces valid, importable JS after an insert', async () => {
    const newEntryLine = '  "2026-12-25": { boardName: "Xmas", shape: "grid", rows: 1, cols: 1, cellStates: [0], colorCount: 1, par: [1] },';
    const result = upsertScheduledPuzzleEntry(REAL_FILE_TEXT, '2026-12-25', newEntryLine);
    const asDataUrl = 'data:text/javascript;base64,' + Buffer.from(result).toString('base64');
    const mod = await import(asDataUrl);
    expect(mod.SCHEDULED_PUZZLES['2026-12-25']).toEqual({
      boardName: 'Xmas',
      shape: 'grid',
      rows: 1,
      cols: 1,
      cellStates: [0],
      colorCount: 1,
      par: [1],
    });
  });
});

describe('upsertPuzzleDifficultyRecord', () => {
  it('replaces only the one line for an existing puzzleNumber, leaving every other line byte-identical', () => {
    const record = { puzzleNumber: 45, date: '2026-07-13', totalDifficulty: 1.23 };
    const result = upsertPuzzleDifficultyRecord(REAL_DIFFICULTY_FILE_TEXT, record);

    const originalLines = REAL_DIFFICULTY_FILE_TEXT.split(/\r\n|\n/);
    const resultLines = result.split(/\r\n|\n/);

    expect(resultLines).toHaveLength(originalLines.length);
    const changedLines = resultLines.filter((line, index) => line !== originalLines[index]);
    expect(changedLines).toEqual([`  ${JSON.stringify(record)},`]);
  });

  it('inserts a new record in ascending puzzleNumber order between its neighbors, not just anywhere', () => {
    // The real file's puzzleNumbers run 0..135 with no gaps -- 136 doesn't
    // exist yet, so this exercises the "insert before closing ];" path.
    const record = { puzzleNumber: 136, date: '2026-11-16', totalDifficulty: 0.5 };
    const result = upsertPuzzleDifficultyRecord(REAL_DIFFICULTY_FILE_TEXT, record);

    const originalLines = REAL_DIFFICULTY_FILE_TEXT.split(/\r\n|\n/);
    const resultLines = result.split(/\r\n|\n/);
    const newLine = `  ${JSON.stringify(record)},`;

    expect(resultLines).toHaveLength(originalLines.length + 1);
    const insertedIndex = resultLines.indexOf(newLine);
    expect(insertedIndex).toBeGreaterThan(-1);
    expect(resultLines[insertedIndex + 1].trim()).toBe('];'); // right before the array's close
    expect(resultLines.filter((line) => line !== newLine)).toEqual(originalLines);
  });

  it('inserts a record with a puzzleNumber that falls BETWEEN two existing ones in sorted position', () => {
    // Every real puzzleNumber is a plain integer with no decimals, so there
    // is no actual gap to insert into -- fabricate a smaller, dense fixture
    // instead to exercise the "insert before a higher puzzleNumber" branch
    // specifically (not just "insert at the very end").
    const fileText = [
      'export const PUZZLE_DIFFICULTY = [',
      '  {"puzzleNumber":0,"totalDifficulty":1},',
      '  {"puzzleNumber":2,"totalDifficulty":3},',
      '];',
      '',
    ].join('\r\n');

    const record = { puzzleNumber: 1, totalDifficulty: 2 };
    const result = upsertPuzzleDifficultyRecord(fileText, record);
    const lines = result.split(/\r\n|\n/);

    expect(lines).toEqual([
      'export const PUZZLE_DIFFICULTY = [',
      '  {"puzzleNumber":0,"totalDifficulty":1},',
      '  {"puzzleNumber":1,"totalDifficulty":2},',
      '  {"puzzleNumber":2,"totalDifficulty":3},',
      '];',
      '',
    ]);
  });

  it('produces valid, importable JS after an insert', async () => {
    const record = { puzzleNumber: 136, date: '2026-11-16', totalDifficulty: 0.5 };
    const result = upsertPuzzleDifficultyRecord(REAL_DIFFICULTY_FILE_TEXT, record);
    const asDataUrl = 'data:text/javascript;base64,' + Buffer.from(result).toString('base64');
    const mod = await import(asDataUrl);
    expect(mod.PUZZLE_DIFFICULTY.find((r) => r.puzzleNumber === 136)).toEqual(record);
    expect(mod.PUZZLE_DIFFICULTY).toHaveLength(137);
  });
});

describe('removePuzzleDifficultyRecord', () => {
  it('deletes only the one line for an existing puzzleNumber, leaving every other line byte-identical', () => {
    const result = removePuzzleDifficultyRecord(REAL_DIFFICULTY_FILE_TEXT, 45);

    const originalLines = REAL_DIFFICULTY_FILE_TEXT.split(/\r\n|\n/);
    const resultLines = result.split(/\r\n|\n/);

    expect(resultLines).toHaveLength(originalLines.length - 1);
    const removedLine = originalLines.find((line) => line.trim().startsWith('{"puzzleNumber":45,'));
    expect(resultLines).not.toContain(removedLine);
    expect(resultLines.every((line) => originalLines.includes(line))).toBe(true);
  });

  it('is a no-op when the puzzleNumber has no record', () => {
    const result = removePuzzleDifficultyRecord(REAL_DIFFICULTY_FILE_TEXT, 999999);
    expect(result).toBe(REAL_DIFFICULTY_FILE_TEXT);
  });

  it('produces valid, importable JS after a delete', async () => {
    const result = removePuzzleDifficultyRecord(REAL_DIFFICULTY_FILE_TEXT, 45);
    const asDataUrl = 'data:text/javascript;base64,' + Buffer.from(result).toString('base64');
    const mod = await import(asDataUrl);
    expect(mod.PUZZLE_DIFFICULTY.find((r) => r.puzzleNumber === 45)).toBeUndefined();
  });
});
