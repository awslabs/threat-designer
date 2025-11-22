/**
 * Data validation utilities for attack tree visualization
 *
 * Validates the structure and integrity of attack tree data
 * to ensure it can be safely rendered.
 */

/**
 * Validates attack tree data structure
 * @param {Object} data - Attack tree data with nodes and edges
 * @returns {Object} Validation result with isValid flag and error message
 */
export const validateAttackTreeData = (data) => {
  // Check if data exists
  if (!data) {
    return {
      isValid: false,
      error: "Attack tree data is null or undefined",
    };
  }

  // Check if nodes array exists
  if (!data.nodes || !Array.isArray(data.nodes)) {
    return {
      isValid: false,
      error: "Attack tree data must contain a nodes array",
    };
  }

  // Check if edges array exists
  if (!data.edges || !Array.isArray(data.edges)) {
    return {
      isValid: false,
      error: "Attack tree data must contain an edges array",
    };
  }

  // Check if nodes array is not empty
  if (data.nodes.length === 0) {
    return {
      isValid: false,
      error: "Attack tree must contain at least one node",
    };
  }

  // Validate node IDs are unique
  const nodeIds = new Set();
  const duplicateIds = [];

  for (const node of data.nodes) {
    if (!node.id) {
      return {
        isValid: false,
        error: "All nodes must have an id property",
      };
    }

    if (nodeIds.has(node.id)) {
      duplicateIds.push(node.id);
    } else {
      nodeIds.add(node.id);
    }

    // Validate node has required properties
    if (!node.type) {
      return {
        isValid: false,
        error: `Node ${node.id} is missing required type property`,
      };
    }

    if (!node.data) {
      return {
        isValid: false,
        error: `Node ${node.id} is missing required data property`,
      };
    }
  }

  // Report duplicate node IDs
  if (duplicateIds.length > 0) {
    return {
      isValid: false,
      error: `Duplicate node IDs found: ${duplicateIds.join(", ")}`,
    };
  }

  // Validate edges reference valid node IDs
  for (const edge of data.edges) {
    if (!edge.id) {
      return {
        isValid: false,
        error: "All edges must have an id property",
      };
    }

    if (!edge.source) {
      return {
        isValid: false,
        error: `Edge ${edge.id} is missing required source property`,
      };
    }

    if (!edge.target) {
      return {
        isValid: false,
        error: `Edge ${edge.id} is missing required target property`,
      };
    }

    // Check if source node exists
    if (!nodeIds.has(edge.source)) {
      return {
        isValid: false,
        error: `Edge ${edge.id} references non-existent source node: ${edge.source}`,
      };
    }

    // Check if target node exists
    if (!nodeIds.has(edge.target)) {
      return {
        isValid: false,
        error: `Edge ${edge.id} references non-existent target node: ${edge.target}`,
      };
    }
  }

  // All validations passed
  return {
    isValid: true,
    error: null,
  };
};

/**
 * Validates node type-specific data
 * @param {Object} node - Node to validate
 * @returns {Object} Validation result
 */
export const validateNodeData = (node) => {
  const { type, data } = node;

  switch (type) {
    case "root":
      if (!data.label) {
        return {
          isValid: false,
          error: `Root node ${node.id} is missing label`,
        };
      }
      break;

    case "and-gate":
    case "or-gate":
      if (!data.label) {
        return {
          isValid: false,
          error: `Gate node ${node.id} is missing label`,
        };
      }
      if (!data.gateType) {
        return {
          isValid: false,
          error: `Gate node ${node.id} is missing gateType`,
        };
      }
      break;

    case "leaf-attack":
      if (!data.label) {
        return {
          isValid: false,
          error: `Leaf attack node ${node.id} is missing label`,
        };
      }
      if (typeof data.feasibility !== "number") {
        return {
          isValid: false,
          error: `Leaf attack node ${node.id} is missing or has invalid feasibility`,
        };
      }
      if (!data.skillLevel) {
        return {
          isValid: false,
          error: `Leaf attack node ${node.id} is missing skillLevel`,
        };
      }
      if (!data.impactSeverity) {
        return {
          isValid: false,
          error: `Leaf attack node ${node.id} is missing impactSeverity`,
        };
      }
      break;

    case "countermeasure":
      if (!data.label) {
        return {
          isValid: false,
          error: `Countermeasure node ${node.id} is missing label`,
        };
      }
      if (typeof data.effectiveness !== "number") {
        return {
          isValid: false,
          error: `Countermeasure node ${node.id} is missing or has invalid effectiveness`,
        };
      }
      break;

    default:
      return {
        isValid: false,
        error: `Unknown node type: ${type}`,
      };
  }

  return {
    isValid: true,
    error: null,
  };
};
