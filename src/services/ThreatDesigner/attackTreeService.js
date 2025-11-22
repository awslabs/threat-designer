/**
 * Attack Tree Service
 *
 * This service handles attack tree generation, status polling, and retrieval.
 *
 * COMPOSITE KEY APPROACH:
 * Attack tree IDs are computed deterministically as composite keys from the threat model ID
 * and normalized threat name. This eliminates the need to store attack_tree_id as a foreign
 * key on threat objects.
 *
 * Format: {threat_model_id}_{normalized_threat_name}
 * Example: abc123-def456-ghi789_sql_injection_attack
 *
 * Normalization rules:
 * - Convert to lowercase
 * - Replace spaces with underscores
 * - Remove special characters (keep only alphanumeric, underscore, hyphen)
 *
 * The frontend computes the ID before making API calls, ensuring consistency with the backend.
 */

import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const baseUrl = config.controlPlaneAPI + "/attack-tree";

/**
 * Generate a deterministic attack tree ID from threat model ID and threat name.
 *
 * This function creates a composite key that uniquely identifies an attack tree
 * without requiring storage of the ID on the threat object. The normalization
 * logic matches the backend implementation exactly.
 *
 * @param {string} threatModelId - UUID of the parent threat model
 * @param {string} threatName - Name of the threat
 * @returns {string} Composite key in format: {threat_model_id}_{normalized_threat_name}
 * @throws {Error} If threatModelId or threatName is invalid
 */
export const generateAttackTreeId = (threatModelId, threatName) => {
  // Validate inputs
  if (!threatModelId || typeof threatModelId !== "string") {
    throw new Error("threatModelId must be a non-empty string");
  }

  if (!threatName || typeof threatName !== "string") {
    throw new Error("threatName must be a non-empty string");
  }

  // Normalize threat name: lowercase and replace spaces with underscores
  let normalizedName = threatName.trim().toLowerCase().replace(/\s+/g, "_");

  // Remove any characters that aren't alphanumeric, underscore, or hyphen
  normalizedName = normalizedName.replace(/[^a-z0-9_-]/g, "");

  if (!normalizedName) {
    throw new Error("threatName must contain at least one alphanumeric character");
  }

  // Create composite key
  const compositeKey = `${threatModelId}_${normalizedName}`;

  console.log("Generated composite attack tree ID:", {
    threatModelId,
    threatName,
    normalizedName,
    compositeKey,
  });

  return compositeKey;
};

/**
 * Get authentication headers for API requests
 */
const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();

    if (!idToken) {
      throw new Error("No authentication token available");
    }

    return {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    };
  } catch (error) {
    console.error("Error getting auth headers:", error);
    throw error;
  }
};

/**
 * Trigger attack tree generation for a threat
 *
 * @param {string} threatModelId - ID of the parent threat model
 * @param {string} threatName - Name of the threat
 * @param {string} threatDescription - Description of the threat
 * @returns {Promise<{attack_tree_id: string, status: string}>}
 * @throws {Error} - Throws error with specific message for different failure scenarios
 */
export const generateAttackTree = async (threatModelId, threatName, threatDescription) => {
  try {
    // Compute attack tree ID before making API call
    const attackTreeId = generateAttackTreeId(threatModelId, threatName);
    console.log("Computed attack tree ID for generation:", attackTreeId);

    const headers = await getAuthHeaders();
    const response = await axios.post(
      baseUrl,
      {
        threat_model_id: threatModelId,
        threat_name: threatName,
        threat_description: threatDescription,
      },
      { headers }
    );

    // Backend should return the same ID, but we use our computed one for consistency
    return {
      ...response.data,
      attack_tree_id: attackTreeId,
    };
  } catch (error) {
    console.error("Error generating attack tree:", error);

    // Handle specific error cases
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Authentication failed - please sign in again");
    }

    if (error.response?.status === 400) {
      const message = error.response?.data?.message || "Invalid request parameters";
      throw new Error(`Failed to create attack tree: ${message}`);
    }

    if (error.response?.status >= 500) {
      throw new Error("Server error - please try again later");
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error("Request timeout - please check your connection and try again");
    }

    // Generic error with original message if available
    throw new Error(
      error.response?.data?.message || error.message || "Failed to generate attack tree"
    );
  }
};

/**
 * Check the status of attack tree generation
 *
 * @param {string} attackTreeId - ID of the attack tree
 * @returns {Promise<{attack_tree_id: string, status: string, detail?: string, error?: string}>}
 * @throws {Error} - Throws error with specific message for different failure scenarios
 */
export const getAttackTreeStatus = async (attackTreeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${baseUrl}/${attackTreeId}/status`, { headers });
    return response.data;
  } catch (error) {
    console.error("Error fetching attack tree status:", error);

    // Handle specific error cases
    if (error.response?.status === 404) {
      throw new Error("Attack tree not found - it may have been deleted");
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Authentication failed - please sign in again");
    }

    if (error.response?.status >= 500) {
      throw new Error("Server error - please try again later");
    }

    // Generic error
    throw new Error(
      error.response?.data?.message || error.message || "Failed to fetch attack tree status"
    );
  }
};

/**
 * Fetch a completed attack tree
 *
 * @param {string} attackTreeId - ID of the attack tree
 * @returns {Promise<{attack_tree_id: string, threat_model_id: string, threat_name: string, attack_tree: object}>}
 * @throws {Error} - Throws error with specific message for different failure scenarios
 */
export const fetchAttackTree = async (attackTreeId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${baseUrl}/${attackTreeId}`, { headers });
    return response.data;
  } catch (error) {
    console.error("Error fetching attack tree:", error);

    // Handle specific error cases
    if (error.response?.status === 404) {
      throw new Error("Attack tree not found - it may have been deleted");
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Authentication failed - please sign in again");
    }

    if (error.response?.status >= 500) {
      throw new Error("Server error - please try again later");
    }

    // Generic error
    throw new Error(
      error.response?.data?.message || error.message || "Failed to fetch attack tree"
    );
  }
};

/**
 * Update an existing attack tree
 *
 * @param {string} attackTreeId - ID of the attack tree to update
 * @param {object} attackTreeData - Attack tree data with nodes and edges
 * @returns {Promise<{attack_tree_id: string, updated_at: string, message: string}>}
 * @throws {Error} - Throws error with specific message for different failure scenarios
 */
export const updateAttackTree = async (attackTreeId, attackTreeData) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.put(`${baseUrl}/${attackTreeId}`, attackTreeData, { headers });
    return response.data;
  } catch (error) {
    console.error("Error updating attack tree:", error);

    // Handle specific error cases
    if (error.response?.status === 404) {
      throw new Error("Attack tree not found - it may have been deleted");
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Authentication failed - please sign in again");
    }

    if (error.response?.status === 400) {
      // Validation error - extract message from backend response
      const message =
        error.response?.data?.message || error.response?.data?.error || "Validation failed";
      throw new Error(message);
    }

    if (error.response?.status >= 500) {
      throw new Error("Server error - please try again later");
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error("Request timeout - please check your connection and try again");
    }

    // Generic error
    throw new Error(
      error.response?.data?.message || error.message || "Failed to update attack tree"
    );
  }
};

/**
 * Delete an attack tree
 *
 * @param {string} attackTreeId - ID of the attack tree to delete
 * @returns {Promise<void>}
 * @throws {Error} - Throws error with specific message for different failure scenarios
 */
export const deleteAttackTree = async (attackTreeId) => {
  try {
    const headers = await getAuthHeaders();
    await axios.delete(`${baseUrl}/${attackTreeId}`, { headers });
  } catch (error) {
    console.error("Error deleting attack tree:", error);

    // Handle specific error cases
    if (error.response?.status === 404) {
      throw new Error("Attack tree not found - it may have already been deleted");
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Authentication failed - please sign in again");
    }

    if (error.response?.status >= 500) {
      throw new Error("Server error - please try again later");
    }

    // Generic error
    throw new Error(
      error.response?.data?.message || error.message || "Failed to delete attack tree"
    );
  }
};

/**
 * Poll for attack tree completion
 *
 * @param {string} attackTreeId - ID of the attack tree
 * @param {Function} onStatusUpdate - Callback for status updates
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 60)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 5000)
 * @param {AbortSignal} signal - Optional abort signal to cancel polling
 * @returns {Promise<object>} - The completed attack tree data
 * @throws {Error} - Throws error with specific message for different failure scenarios
 */
export const pollAttackTreeStatus = async (
  attackTreeId,
  onStatusUpdate = null,
  maxAttempts = 60,
  intervalMs = 5000,
  signal = null
) => {
  console.log(`Starting polling for attack tree ${attackTreeId}, signal:`, signal);
  const timeoutMinutes = Math.floor((maxAttempts * intervalMs) / 60000);
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Check if polling was cancelled
    if (signal?.aborted) {
      console.log(`Polling cancelled for attack tree ${attackTreeId}`);
      throw new Error("Polling cancelled");
    }

    try {
      console.log(`Poll attempt ${attempts + 1}/${maxAttempts} for ${attackTreeId}`);
      const status = await getAttackTreeStatus(attackTreeId);
      console.log(`Status for ${attackTreeId}:`, status.status);

      if (onStatusUpdate) {
        onStatusUpdate(status);
      }

      // Normalize status to lowercase for comparison
      const normalizedStatus = status.status?.toLowerCase();

      if (normalizedStatus === "completed") {
        console.log(`Attack tree ${attackTreeId} completed, fetching data`);
        // Fetch the completed attack tree
        try {
          return await fetchAttackTree(attackTreeId);
        } catch (fetchError) {
          // Handle fetch errors specifically
          console.error("Error fetching completed attack tree:", fetchError);
          throw new Error(
            `Failed to retrieve attack tree data: ${fetchError.message || "Unknown error"}`
          );
        }
      }

      if (normalizedStatus === "failed") {
        console.log(`Attack tree ${attackTreeId} failed`);
        // Provide detailed error message from backend
        const errorDetail = status.error || status.detail || "Attack tree generation failed";
        throw new Error(errorDetail);
      }

      if (normalizedStatus === "not_found") {
        console.log(`Attack tree ${attackTreeId} not found - does not exist yet`);
        // Throw a specific error that the component can catch and handle
        throw new Error("ATTACK_TREE_NOT_FOUND");
      }

      // Wait before next poll (with cancellation support)
      console.log(`Waiting ${intervalMs}ms before next poll...`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, intervalMs);

        if (signal) {
          const abortHandler = () => {
            clearTimeout(timeout);
            reject(new Error("Polling cancelled"));
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      });

      attempts++;
    } catch (error) {
      // Don't log cancellation as an error
      if (error.message !== "Polling cancelled") {
        console.error("Error polling attack tree status:", error);
      }

      // Handle network errors specifically
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new Error("Network timeout - please check your connection and try again");
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error("Authentication failed - please sign in again");
      }

      if (error.response?.status === 404) {
        throw new Error("Attack tree not found - it may have been deleted");
      }

      if (error.response?.status >= 500) {
        throw new Error("Server error - please try again later");
      }

      throw error;
    }
  }

  // Timeout error with helpful message
  throw new Error(
    `Attack tree generation timed out after ${timeoutMinutes} minutes. ` +
      `The operation is taking longer than expected. Please try again or contact support if the issue persists.`
  );
};
