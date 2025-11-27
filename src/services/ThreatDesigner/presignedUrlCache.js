/**
 * Shared cache for presigned URLs and image blobs
 * This cache is shared across all components to avoid redundant API calls
 */

// Cache for presigned URLs - maps threat_model_id to presigned URL
const presignedUrlCache = new Map();

// Cache for image blobs - maps threat_model_id to blob URL
const imageBlobCache = new Map();

/**
 * Get a presigned URL from cache
 * @param {string} threatModelId - The threat model ID
 * @returns {string|null} The cached presigned URL or null if not found
 */
export const getCachedPresignedUrl = (threatModelId) => {
  return presignedUrlCache.get(threatModelId) || null;
};

/**
 * Set a presigned URL in cache
 * @param {string} threatModelId - The threat model ID
 * @param {string} presignedUrl - The presigned URL to cache
 */
export const setCachedPresignedUrl = (threatModelId, presignedUrl) => {
  presignedUrlCache.set(threatModelId, presignedUrl);
};

/**
 * Get an image blob URL from cache
 * @param {string} threatModelId - The threat model ID
 * @returns {string|null} The cached blob URL or null if not found
 */
export const getCachedImageBlob = (threatModelId) => {
  return imageBlobCache.get(threatModelId) || null;
};

/**
 * Set an image blob URL in cache
 * @param {string} threatModelId - The threat model ID
 * @param {string} blobUrl - The blob URL to cache
 */
export const setCachedImageBlob = (threatModelId, blobUrl) => {
  imageBlobCache.set(threatModelId, blobUrl);
};

/**
 * Clear all caches
 */
export const clearAllCaches = () => {
  // Revoke all blob URLs before clearing
  imageBlobCache.forEach((blobUrl) => {
    URL.revokeObjectURL(blobUrl);
  });

  presignedUrlCache.clear();
  imageBlobCache.clear();
};

/**
 * Clear cache for a specific threat model
 * @param {string} threatModelId - The threat model ID
 */
export const clearCacheForThreatModel = (threatModelId) => {
  const blobUrl = imageBlobCache.get(threatModelId);
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
  }

  presignedUrlCache.delete(threatModelId);
  imageBlobCache.delete(threatModelId);
};
