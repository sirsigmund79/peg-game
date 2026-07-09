// ============================================================================
// storage.js
// ----------------------------------------------------------------------------
// A tiny, safe wrapper around the browser's localStorage. Some embeds and
// privacy modes block storage entirely, and reading/writing there can throw
// an error in those cases -- every function here catches that so the rest
// of the app never has to think about it. If storage isn't available, we
// just quietly act like nothing was ever saved.
// ============================================================================

/**
 * Reads and JSON-parses a value from localStorage.
 *
 * @param {string} key
 * @param {*} fallbackValue - returned if the key is missing or storage fails
 * @returns {*}
 */
export function safeGet(key, fallbackValue) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallbackValue;
    return JSON.parse(raw);
  } catch (error) {
    return fallbackValue;
  }
}

/**
 * JSON-stringifies and writes a value to localStorage.
 *
 * @param {string} key
 * @param {*} value
 * @returns {boolean} true if the write succeeded
 */
export function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Removes a key from localStorage.
 *
 * @param {string} key
 */
export function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // Nothing to do -- if storage is unavailable, there was nothing saved.
  }
}
