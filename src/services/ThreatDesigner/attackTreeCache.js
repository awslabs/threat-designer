/**
 * Attack Tree Cache (In-Memory)
 *
 * Manages an in-memory cache of attack tree IDs mapped to threat model/threat combinations.
 *
 * COMPOSITE KEY APPROACH:
 * Attack tree IDs are NOT stored as foreign keys on threat objects. Instead, they are
 * computed deterministically from the threat model ID and threat name. This cache helps
 * track the state of attack trees (in progress, completed, deleted) without requiring
 * backend round-trips or object updates.
 *
 * Cache is cleared when the threat model page unmounts to ensure fresh data on next load.
 *
 * Cache key format: "{threatModelId}_{normalized_threat_name}" (composite key)
 * Example: "abc123-def456-ghi789_sql_injection_attack"
 */

import { generateAttackTreeId } from "./attackTreeService.js";

// In-memory cache storage
const cache = new Map();

/**
 * Generate a cache key for a threat model/threat combination
 * Uses the same composite key format as the backend for consistency
 * @param {string} threatModelId - ID of the threat model
 * @param {string} threatName - Name of the threat
 * @returns {string} Cache key (composite key format)
 */
const getCacheKey = (threatModelId, threatName) => {
  try {
    // Use the same composite key generation as the backend (Requirement 5.1, 5.2, 5.3)
    return generateAttackTreeId(threatModelId, threatName);
  } catch (error) {
    console.error("Error generating cache key:", error);
    // Fallback to simple format if generation fails
    const normalizedName = threatName.trim().toLowerCase().replace(/\s+/g, "_");
    return `${threatModelId}_${normalizedName}`;
  }
};

/**
 * Store an attack tree ID in the cache
 * @param {string} threatModelId - ID of the threat model
 * @param {string} threatName - Name of the threat
 * @param {string} attackTreeId - ID of the attack tree
 */
export const cacheAttackTreeId = (threatModelId, threatName, attackTreeId) => {
  try {
    const key = getCacheKey(threatModelId, threatName);
    const cacheEntry = {
      attackTreeId,
      threatModelId,
      threatName,
      cachedAt: new Date().toISOString(),
    };
    cache.set(key, cacheEntry);
  } catch (error) {
    console.error("Error caching attack tree ID:", error);
    // Don't throw - caching is not critical
  }
};

/**
 * Retrieve an attack tree ID from the cache
 * @param {string} threatModelId - ID of the threat model
 * @param {string} threatName - Name of the threat
 * @returns {string|null|undefined}
 *   - string: Attack tree ID if found
 *   - null: Explicitly deleted (overrides stale props)
 *   - undefined: No cache entry (use props if available)
 */
export const getCachedAttackTreeId = (threatModelId, threatName) => {
  try {
    const key = getCacheKey(threatModelId, threatName);
    const cacheEntry = cache.get(key);

    if (!cacheEntry) {
      // No cache entry - we don't know the state
      return undefined;
    }

    // Check if this is a deletion marker
    if (cacheEntry.attackTreeId === null && cacheEntry.deletedAt) {
      return null; // Explicitly deleted
    }

    return cacheEntry.attackTreeId;
  } catch (error) {
    console.error("Error retrieving cached attack tree ID:", error);
    return undefined;
  }
};

/**
 * Remove an attack tree ID from the cache
 * Stores a special marker to indicate the attack tree was explicitly deleted
 * @param {string} threatModelId - ID of the threat model
 * @param {string} threatName - Name of the threat
 */
export const removeCachedAttackTreeId = (threatModelId, threatName) => {
  try {
    const key = getCacheKey(threatModelId, threatName);
    // Store a marker indicating explicit deletion (to override stale props)
    const deletionMarker = {
      attackTreeId: null,
      threatModelId,
      threatName,
      deletedAt: new Date().toISOString(),
    };
    cache.set(key, deletionMarker);
  } catch (error) {
    console.error("Error removing cached attack tree ID:", error);
    // Don't throw - cache cleanup is not critical
  }
};

/**
 * Clear all attack tree cache entries
 * Called when threat model page unmounts to ensure fresh data on next load
 */
export const clearAttackTreeCache = () => {
  try {
    cache.clear();
  } catch (error) {
    console.error("Error clearing attack tree cache:", error);
  }
};

/**
 * Clear cache entry for a specific threat model
 * Called when threat model page unmounts
 * @param {string} threatModelId - ID of the threat model
 */
export const clearThreatModelCache = (threatModelId) => {
  try {
    for (const [key, entry] of cache.entries()) {
      if (entry.threatModelId === threatModelId) {
        cache.delete(key);
      }
    }
  } catch (error) {
    console.error("Error clearing threat model cache:", error);
  }
};

/**
 * Handle 404 error by removing cache entry
 * Called when backend returns 404 for an attack tree
 * @param {string} threatModelId - ID of the threat model
 * @param {string} threatName - Name of the threat
 */
export const handleAttackTreeNotFound = (threatModelId, threatName) => {
  try {
    const key = getCacheKey(threatModelId, threatName);
    cache.delete(key);
  } catch (error) {
    console.error("Error handling attack tree not found:", error);
  }
};

/**
 * Get all cached attack tree entries (for debugging)
 * @returns {Array} Array of cache entries
 */
export const getAllCachedAttackTrees = () => {
  try {
    return Array.from(cache.values());
  } catch (error) {
    console.error("Error getting all cached attack trees:", error);
    return [];
  }
};
