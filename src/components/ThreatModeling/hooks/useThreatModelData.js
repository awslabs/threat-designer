import { useState, useRef, useCallback } from "react";
import {
  getThreatModelingResults,
  getDownloadUrl,
  getThreatModelingTrail,
} from "../../../services/ThreatDesigner/stats";
import {
  getCachedImageBlob,
  setCachedImageBlob,
} from "../../../services/ThreatDesigner/presignedUrlCache";

/**
 * Convert blob to base64 format
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<{type: string, value: string}>} Base64 encoded data with type
 */
const blobToBase64 = (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.replace("data:", "").replace(/^.+,/, "");
      resolve({
        type: blob.type,
        value: base64String,
      });
    };
    reader.readAsDataURL(blob);
  });
};

/**
 * Custom hook for managing threat model data, including fetching, updating, and session initialization
 *
 * @param {string} threatModelId - The ID of the threat model
 * @param {Function} updateSessionContext - Function to update session context in Sentry
 * @param {boolean} sentryEnabled - Whether Sentry integration is enabled
 * @param {Function} setIsVisible - Function to control Sentry visibility
 * @returns {Object} Hook interface with state and functions
 */
export const useThreatModelData = (
  threatModelId,
  updateSessionContext,
  sentryEnabled,
  setIsVisible
) => {
  // State variables
  const [response, setResponse] = useState(null);
  const [base64Content, setBase64Content] = useState([]);
  const [tmStatus, setTmStatus] = useState("START");
  const [tmDetail, setTmDetail] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [iteration, setIteration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(true);

  // Refs for tracking changes and versions
  const previousResponse = useRef(null);
  const lastKnownServerTimestamp = useRef(null);

  /**
   * Initialize threat model session context for Sentry agent
   * Calculates statistics and sends context to backend
   *
   * @param {Object} threatModelData - The threat model data to initialize session with
   */
  const initializeThreatModelSession = useCallback(
    async (threatModelData) => {
      const threats = threatModelData.threat_list.threats || [];

      // Calculate likelihood distribution
      const likelihoodCounts = threats.reduce((acc, threat) => {
        acc[threat.likelihood] = (acc[threat.likelihood] || 0) + 1;
        return acc;
      }, {});

      // Calculate STRIDE distribution
      const strideCounts = threats.reduce((acc, threat) => {
        acc[threat.stride_category] = (acc[threat.stride_category] || 0) + 1;
        return acc;
      }, {});

      // Get unique assets
      const uniqueAssets = [...new Set(threats.map((threat) => threat.target))];

      // Calculate threat sources
      const sourceCounts = threats.reduce((acc, threat) => {
        acc[threat.source] = (acc[threat.source] || 0) + 1;
        return acc;
      }, {});

      // Strip notes field from threats to reduce payload size
      const threatsWithoutNotes = threats.map(({ notes, ...threat }) => threat);

      const sessionContext = {
        diagram: threatModelData.s3_location,
        threatModel: {
          threat_model_id: threatModelId,
          threats: threatsWithoutNotes,
          assets: threatModelData.assets,
          summary: threatModelData.summary,
          assumptions: threatModelData.assumptions,
          system_architecture: threatModelData.system_architecture,
          description: threatModelData.description,
          title: threatModelData.title,
          application_type: threatModelData.application_type || "hybrid",
          threat_catalog_summary: {
            nr_threats: {
              total: threats.length,
              high: likelihoodCounts.High || 0,
              medium: likelihoodCounts.Medium || 0,
              low: likelihoodCounts.Low || 0,
            },
            likelihood_distribution: likelihoodCounts,
            stride_distribution: strideCounts,
            assets: {
              total_unique_assets: uniqueAssets.length,
            },
            threat_sources: sourceCounts,
          },
        },
      };

      // Only update session context if Sentry is enabled
      if (sentryEnabled) {
        try {
          await updateSessionContext(threatModelId, sessionContext);
          setIsVisible(true);
        } catch (error) {
          console.error(`Failed to initialize session ${threatModelId}:`, error);
          // Still show Sentry even if context update fails
          setIsVisible(true);
        }
      }
    },
    [threatModelId, updateSessionContext, sentryEnabled, setIsVisible]
  );

  /**
   * Update threat modeling data based on type and index
   * Handles updates for threat_sources, trust_boundaries, data_flows, assets, threats, assumptions, and description
   *
   * @param {string} type - The type of data to update
   * @param {number} index - The index of the item to update (-1 for new items)
   * @param {*} newItem - The new item data (null to delete)
   */
  const updateThreatModeling = useCallback(
    (type, index, newItem) => {
      const newState = { ...response };

      const updateArray = (array, index, newItem) => {
        if (newItem === null) {
          return array.filter((_, i) => i !== index);
        } else if (index === -1) {
          return [newItem, ...array];
        } else {
          return array.map((item, i) => (i === index ? newItem : item));
        }
      };

      const updateAssumptions = (array, index, newItem) => {
        if (newItem === undefined || newItem === null) {
          return array.filter((_, i) => i !== index);
        } else if (index === -1) {
          return [newItem, ...array];
        } else {
          return array.map((item, i) => (i === index ? newItem : item));
        }
      };

      switch (type) {
        case "threat_sources":
        case "trust_boundaries":
        case "data_flows":
          newState.item.system_architecture[type] = updateArray(
            newState.item.system_architecture[type],
            index,
            newItem
          );
          break;

        case "assets":
          newState.item.assets.assets = updateArray(newState.item.assets.assets, index, newItem);
          break;

        case "threats":
          newState.item.threat_list.threats = updateArray(
            newState.item.threat_list.threats,
            index,
            newItem
          );
          break;

        case "assumptions":
          newState.item.assumptions = updateAssumptions(
            newState.item.assumptions,
            index,
            newItem?.assumption
          );
          break;

        case "description":
          newState.item.description = newItem;
          break;

        default:
          throw new Error(`Invalid type: ${type}`);
      }

      initializeThreatModelSession(newState.item);
      setResponse(newState);
    },
    [response, initializeThreatModelSession]
  );

  /**
   * Refresh the threat modeling trail data
   *
   * @param {string} idValue - The threat model ID to refresh trail for
   * @param {Function} setTrail - Function to update trail state
   */
  const handleRefresh = useCallback(async (idValue, setTrail) => {
    if (!idValue) {
      return;
    }

    try {
      const statusResponse = await getThreatModelingTrail(idValue);
      setTrail(statusResponse.data);
    } catch (error) {
      console.error("Error fetching threat modeling trail:", error);
    }
  }, []);

  /**
   * Fetch threat model results and architecture diagram
   *
   * @returns {Promise<void>}
   */
  const fetchThreatModelData = useCallback(async () => {
    if (!threatModelId) return;

    setLoading(true);
    try {
      const resultsResponse = await getThreatModelingResults(threatModelId);

      // Check if image blob is already cached
      let architectureDiagram;
      const cachedBlobUrl = getCachedImageBlob(threatModelId);

      if (cachedBlobUrl) {
        // Convert cached blob URL back to blob for base64 conversion
        const response = await fetch(cachedBlobUrl);
        architectureDiagram = await response.blob();
      } else {
        // getDownloadUrl makes API call, gets presigned URL, and downloads blob
        architectureDiagram = await getDownloadUrl(threatModelId);

        // Cache the blob URL for future use
        const objectUrl = URL.createObjectURL(architectureDiagram);
        setCachedImageBlob(threatModelId, objectUrl);
      }

      const base64Data = await blobToBase64(architectureDiagram);

      setBase64Content(base64Data);
      setResponse(resultsResponse.data);
      setIsOwner(resultsResponse.data.item.is_owner !== false);

      if (!previousResponse.current) {
        previousResponse.current = JSON.parse(JSON.stringify(resultsResponse.data));
      }

      lastKnownServerTimestamp.current = resultsResponse.data.item.last_modified_at;
      await initializeThreatModelSession(resultsResponse.data.item);
    } catch (error) {
      console.error("Error getting threat modeling results:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [threatModelId, initializeThreatModelSession]);

  return {
    // State
    response,
    base64Content,
    tmStatus,
    tmDetail,
    sessionId,
    iteration,
    loading,
    isOwner,

    // Refs
    previousResponse,
    lastKnownServerTimestamp,

    // Functions
    updateThreatModeling,
    initializeThreatModelSession,
    handleRefresh,
    fetchThreatModelData,

    // Setters (needed for external updates)
    setResponse,
    setBase64Content,
    setTmStatus,
    setTmDetail,
    setSessionId,
    setIteration,
    setLoading,
    setIsOwner,
  };
};
