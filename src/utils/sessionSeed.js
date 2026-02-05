/**
 * Session Seed Utility
 *
 * Manages a browser session seed that persists across page reloads
 * but is unique per browser session. Used to create consistent Sentry
 * session IDs for threat model operations.
 */

const SESSION_SEED_KEY = "threat_model_session_seed";

/**
 * Generate a random 8-character seed using UUID-style characters
 * @returns {string} 8-character random seed
 */
function generateSeed() {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Get or create the session seed
 * Stored in sessionStorage so it persists across page reloads
 * but is unique per browser tab/window
 *
 * @returns {string} 8-character session seed
 */
export function getSessionSeed() {
  let seed = sessionStorage.getItem(SESSION_SEED_KEY);

  if (!seed) {
    seed = generateSeed();
    sessionStorage.setItem(SESSION_SEED_KEY, seed);
  }

  return seed;
}

/**
 * Create a Sentry session header value
 * Format: {threatModelId}/{sessionSeed}
 *
 * @param {string} threatModelId - The threat model ID
 * @returns {string} Session header value
 */
export function createSentrySessionHeader(threatModelId) {
  const seed = getSessionSeed();
  return `${threatModelId}/${seed}`;
}

/**
 * Clear the session seed (useful for testing or logout)
 */
export function clearSessionSeed() {
  sessionStorage.removeItem(SESSION_SEED_KEY);
}
