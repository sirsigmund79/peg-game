// ============================================================================
// vite-plugins/puzzleAdminServer.js
// ----------------------------------------------------------------------------
// This game has no backend at all -- every puzzle is a static, git-tracked
// JS module, and the browser has zero write access to disk anywhere in this
// project. The admin puzzle editor needs real save-and-it's-done ergonomics
// (see components/AdminPuzzleEditPanel.vue and, for drag-to-swap,
// components/AdminPuzzlesView.vue), so this plugin adds two local HTTP
// endpoints, reachable ONLY while `npm run dev` is running (configureServer
// hooks never run for `vite build`/`vite preview` -- this never ships to
// players): one to save a single edited puzzle, one to swap two days'
// puzzle content in one atomic write.
//
// SCOPE, DELIBERATELY NARROW: this only ever writes to
// src/logic/scheduledPuzzles.js and (optionally, alongside a save -- see
// upsertPuzzleDifficultyRecord below) src/logic/puzzleDifficulty.js --
// never the generated src/logic/puzzlePool.js. Every edit (whether the
// puzzle originally came from the pool or was already scheduled) becomes a
// SCHEDULED_PUZZLES override for that date, the exact mechanism daily.js
// already uses to let one date's puzzle win over the normal pool pick (see
// daily.js's getPuzzleForNumber).
//
// The write itself is a TARGETED SPLICE, not a full-file regeneration: find
// the existing single-line entry for this date (or none, if it's new),
// replace/insert just that one line, leave the header comment and every
// other entry byte-for-byte untouched. Depends on scheduledPuzzles.js's
// current one-entry-per-line convention (the same convention useEditor.js's
// copyScheduleSnippet already generates) holding.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULED_PUZZLES_PATH = join(__dirname, '..', 'src', 'logic', 'scheduledPuzzles.js');
const PUZZLE_DIFFICULTY_PATH = join(__dirname, '..', 'src', 'logic', 'puzzleDifficulty.js');
const SAVE_ENDPOINT_PATH = '/__admin/save-scheduled-puzzle';
const SWAP_ENDPOINT_PATH = '/__admin/swap-scheduled-puzzles';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Missing request body');
  if (!DATE_PATTERN.test(payload.date)) throw new Error(`Invalid date "${payload.date}" -- expected YYYY-MM-DD`);
  if (typeof payload.boardName !== 'string' || !payload.boardName.trim()) throw new Error('boardName is required');
  if (!Array.isArray(payload.cellStates)) throw new Error('cellStates must be an array');
  if (!Array.isArray(payload.par)) throw new Error('par must be an array');
  if (!Number.isInteger(payload.colorCount)) throw new Error('colorCount must be an integer');
  const shape = payload.shape || 'grid';
  if (shape === 'triangle') {
    if (!Number.isInteger(payload.radius)) throw new Error('radius is required for a triangle design');
  } else if (!Number.isInteger(payload.rows) || !Number.isInteger(payload.cols)) {
    throw new Error('rows and cols are required for a grid design');
  }
}

/** Same entry format useEditor.js's copyScheduleSnippet already generates, so hand-pasted and admin-saved entries always look identical. */
function buildEntryLine(payload) {
  const shape = payload.shape || 'grid';
  const sizeFields = shape === 'triangle' ? `radius: ${payload.radius}, ` : `rows: ${payload.rows}, cols: ${payload.cols}, `;
  return (
    `  ${JSON.stringify(payload.date)}: { boardName: ${JSON.stringify(payload.boardName)}, shape: ${JSON.stringify(shape)}, ` +
    `${sizeFields}cellStates: ${JSON.stringify(payload.cellStates)}, ` +
    `colorCount: ${payload.colorCount}, par: ${JSON.stringify(payload.par)} },`
  );
}

/**
 * Replaces the existing line for `date` inside SCHEDULED_PUZZLES with
 * `entryLine`, or inserts it just before the object's closing `};` if this
 * date isn't scheduled yet. Every other line is returned byte-identical.
 *
 * @param {string} fileText
 * @param {string} date
 * @param {string} entryLine
 * @returns {string}
 */
export function upsertScheduledPuzzleEntry(fileText, date, entryLine) {
  // Preserve the file's existing line-ending convention (this repo's files
  // are CRLF) -- splitting on a plain '\n' but joining back with '\n' would
  // leave every OTHER line's trailing '\r' in place while the one line we
  // touch has none, silently mixing line endings in the file.
  const lineEnding = fileText.includes('\r\n') ? '\r\n' : '\n';
  const lines = fileText.split(/\r\n|\n/);
  const datePrefix = `${JSON.stringify(date)}:`;
  const existingIndex = lines.findIndex((line) => line.trim().startsWith(datePrefix));

  if (existingIndex !== -1) {
    lines[existingIndex] = entryLine;
    return lines.join(lineEnding);
  }

  // scheduledPuzzles.js has exactly one top-level object (SCHEDULED_PUZZLES)
  // and nothing after it, so the first line that's just "};" is its closing
  // brace -- see the file's own contents.
  const closingIndex = lines.findIndex((line) => line.trim() === '};');
  if (closingIndex === -1) {
    throw new Error('Could not find the closing "};" of SCHEDULED_PUZZLES in scheduledPuzzles.js');
  }
  lines.splice(closingIndex, 0, entryLine);
  return lines.join(lineEnding);
}

/** Validates one entry payload and splices it into `fileText`, returning the updated text. Shared by both the single-save and swap handlers so multiple entries can be applied to the SAME in-memory text before one write. */
function applyScheduledPuzzleUpdate(fileText, payload) {
  validatePayload(payload);
  return upsertScheduledPuzzleEntry(fileText, payload.date, buildEntryLine(payload));
}

/**
 * Replaces (or inserts, in sorted order) one puzzle's record inside
 * PUZZLE_DIFFICULTY -- the same one-record-per-line convention
 * scripts/analyze-puzzle-difficulty.js writes (a single JSON.stringify(record)
 * per line). Lets a live admin re-run's fresh numbers show up in
 * AdminPuzzlesView.vue's grid immediately, without waiting for (or
 * clobbering) the next full batch regeneration -- see
 * logic/puzzleDifficultyRecord.js for how the record itself, including its
 * difficultyBucket, is built to stay consistent with that batch output.
 *
 * @param {string} fileText
 * @param {{puzzleNumber: number}} record
 * @returns {string}
 */
function puzzleNumberOfDifficultyLine(line) {
  const match = line.trim().match(/^\{"puzzleNumber":(\d+),/);
  return match ? Number(match[1]) : null;
}

export function upsertPuzzleDifficultyRecord(fileText, record) {
  const lineEnding = fileText.includes('\r\n') ? '\r\n' : '\n';
  const lines = fileText.split(/\r\n|\n/);
  const newLine = `  ${JSON.stringify(record)},`;

  const existingIndex = lines.findIndex((line) => puzzleNumberOfDifficultyLine(line) === record.puzzleNumber);
  if (existingIndex !== -1) {
    lines[existingIndex] = newLine;
    return lines.join(lineEnding);
  }

  // Not present yet -- insert in ascending puzzleNumber order, matching how
  // the batch script always writes it, so the file stays easy to scan.
  const insertBeforeIndex = lines.findIndex((line) => {
    const puzzleNumber = puzzleNumberOfDifficultyLine(line);
    return puzzleNumber !== null && puzzleNumber > record.puzzleNumber;
  });
  if (insertBeforeIndex !== -1) {
    lines.splice(insertBeforeIndex, 0, newLine);
    return lines.join(lineEnding);
  }

  // Higher than every existing puzzleNumber -- insert right before the
  // closing "];" of PUZZLE_DIFFICULTY.
  const closingIndex = lines.findIndex((line) => line.trim() === '];');
  if (closingIndex === -1) {
    throw new Error('Could not find the closing "];" of PUZZLE_DIFFICULTY in puzzleDifficulty.js');
  }
  lines.splice(closingIndex, 0, newLine);
  return lines.join(lineEnding);
}

/** Deletes puzzleNumber's PUZZLE_DIFFICULTY line entirely (a no-op if it has none) -- used when a swap moves in content that's never been analyzed, so the slot doesn't keep showing a bucket that belonged to the puzzle that used to live there. */
export function removePuzzleDifficultyRecord(fileText, puzzleNumber) {
  const lineEnding = fileText.includes('\r\n') ? '\r\n' : '\n';
  const lines = fileText.split(/\r\n|\n/);
  const existingIndex = lines.findIndex((line) => puzzleNumberOfDifficultyLine(line) === puzzleNumber);
  if (existingIndex === -1) return fileText;
  lines.splice(existingIndex, 1);
  return lines.join(lineEnding);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function puzzleAdminServerPlugin() {
  return {
    name: 'puzzle-admin-server',
    configureServer(server) {
      server.middlewares.use(SAVE_ENDPOINT_PATH, (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
          return;
        }

        readRequestBody(req)
          .then((rawBody) => {
            const payload = JSON.parse(rawBody);
            const fileText = readFileSync(SCHEDULED_PUZZLES_PATH, 'utf8');
            const nextFileText = applyScheduledPuzzleUpdate(fileText, payload);
            writeFileSync(SCHEDULED_PUZZLES_PATH, nextFileText, 'utf8');

            // Optional: a completed re-run's fresh difficulty numbers,
            // saved into puzzleDifficulty.js in the SAME request so the
            // admin grid never shows stale stats for a puzzle whose layout
            // (and thus real difficulty) just changed.
            if (payload.difficultyRecord && Number.isInteger(payload.difficultyRecord.puzzleNumber)) {
              const difficultyFileText = readFileSync(PUZZLE_DIFFICULTY_PATH, 'utf8');
              const nextDifficultyFileText = upsertPuzzleDifficultyRecord(difficultyFileText, payload.difficultyRecord);
              writeFileSync(PUZZLE_DIFFICULTY_PATH, nextDifficultyFileText, 'utf8');
            }

            sendJson(res, 200, { ok: true });
          })
          .catch((error) => {
            sendJson(res, 400, { ok: false, error: error.message });
          });
      });

      // Swaps two days' puzzle content in ONE read-modify-write cycle, so a
      // drag-and-drop reorder (AdminPuzzlesView.vue) either fully succeeds or
      // fully fails -- never leaves the file with one date updated and the
      // other not, the way two independent save calls could.
      server.middlewares.use(SWAP_ENDPOINT_PATH, (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
          return;
        }

        readRequestBody(req)
          .then((rawBody) => {
            const { entries, difficultyEntries } = JSON.parse(rawBody);
            if (!Array.isArray(entries) || entries.length !== 2) {
              throw new Error('Expected exactly 2 entries to swap');
            }
            if (entries[0].date === entries[1].date) {
              throw new Error('Cannot swap a puzzle with itself');
            }

            let fileText = readFileSync(SCHEDULED_PUZZLES_PATH, 'utf8');
            for (const entry of entries) {
              fileText = applyScheduledPuzzleUpdate(fileText, entry);
            }
            writeFileSync(SCHEDULED_PUZZLES_PATH, fileText, 'utf8');

            // Difficulty numbers describe a puzzle's CONTENT, not its date --
            // move (or clear) each side's PUZZLE_DIFFICULTY record in the
            // SAME request, so the grid's bucket travels with the puzzle
            // instead of staying pinned to the day it used to occupy. See
            // logic/puzzleAdminResolve.js's buildSwappedDifficultyRecords,
            // which computes this array client-side.
            if (Array.isArray(difficultyEntries)) {
              let difficultyFileText = readFileSync(PUZZLE_DIFFICULTY_PATH, 'utf8');
              for (const { puzzleNumber, record } of difficultyEntries) {
                difficultyFileText = record
                  ? upsertPuzzleDifficultyRecord(difficultyFileText, record)
                  : removePuzzleDifficultyRecord(difficultyFileText, puzzleNumber);
              }
              writeFileSync(PUZZLE_DIFFICULTY_PATH, difficultyFileText, 'utf8');
            }

            sendJson(res, 200, { ok: true });
          })
          .catch((error) => {
            sendJson(res, 400, { ok: false, error: error.message });
          });
      });
    },
  };
}
