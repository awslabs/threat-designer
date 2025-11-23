import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../../config.js";

/**
 * Custom hook to manage attack tree metadata
 *
 * This hook fetches and maintains local state about which threats have associated
 * attack trees. It provides methods to update the state when attack trees are
 * created or deleted, and automatically refreshes when the threat model changes.
 *
 * @param {string} threatModelId - The threat model ID
 * @returns {Object} Hook state and methods
 * @property {Set<string>} threatsWithTrees - Set of threat names with attack trees
 * @property {boolean} isLoading - Whether metadata is being fetched
 * @property {Error|null} error - Error if fetch failed
 * @property {Function} addThreatTree - Add threat to local state
 * @property {Function} removeThreatTree - Remove threat from local state
 * @property {Function} refresh - Manually refresh metadata
 */
export function useAttackTreeMetadata(threatModelId) {
  const [threatsWithTrees, setThreatsWithTrees] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch attack tree metadata from the backend
   */
  const fetchMetadata = useCallback(async () => {
    if (!threatModelId) {
      setThreatsWithTrees(new Set());
      setIsLoading(false);
      setError(null);
      return;
    }

    // Requirement 3.4: Flush local state when fetching fresh data
    // Requirement 6.4: Ensure state is flushed on threat model reload
    setIsLoading(true);
    setError(null);
    setThreatsWithTrees(new Set()); // Clear state before fetching

    try {
      // Get authentication headers
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        throw new Error("No authentication token available");
      }

      const headers = {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      };

      // Fetch metadata from backend
      const baseUrl = config.controlPlaneAPI;
      const response = await axios.get(
        `${baseUrl}/threat-models/${threatModelId}/attack-trees/metadata`,
        { headers }
      );

      // Update state with threat names from response
      const threatNames = response.data.threats_with_attack_trees || [];
      setThreatsWithTrees(new Set(threatNames));
    } catch (err) {
      console.error("Error fetching attack tree metadata:", err);
      setError(err);
      setThreatsWithTrees(new Set()); // Empty set on error
    } finally {
      setIsLoading(false);
    }
  }, [threatModelId]);

  /**
   * Add a threat name to the local state
   * @param {string} threatName - The threat name to add
   */
  const addThreatTree = useCallback((threatName) => {
    if (!threatName) {
      console.warn("Cannot add undefined or null threat name");
      return;
    }
    setThreatsWithTrees((prev) => new Set([...prev, threatName]));
  }, []);

  /**
   * Remove a threat name from the local state
   * @param {string} threatName - The threat name to remove
   */
  const removeThreatTree = useCallback((threatName) => {
    if (!threatName) {
      console.warn("Cannot remove undefined or null threat name");
      return;
    }
    setThreatsWithTrees((prev) => {
      const next = new Set(prev);
      next.delete(threatName);
      return next;
    });
  }, []);

  // Fetch metadata on mount and when threatModelId changes
  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  return {
    threatsWithTrees,
    isLoading,
    error,
    addThreatTree,
    removeThreatTree,
    refresh: fetchMetadata,
  };
}
