/**
 * Utility functions for filtering threat catalog data
 * Supports PropertyFilter component with AND/OR operations
 */

/**
 * Matches a threat value against a filter value using the specified operator
 * @param {*} threatValue - The value from the threat object
 * @param {string} operator - The comparison operator ('=', '!=', ':')
 * @param {*} filterValue - The value to compare against
 * @returns {boolean} True if the values match according to the operator
 */
export function matchesOperator(threatValue, operator, filterValue) {
  switch (operator) {
    case "=":
      return threatValue === filterValue;
    case "!=":
      return threatValue !== filterValue;
    case ":":
      // Contains operator for string matching (case-insensitive)
      return String(threatValue).toLowerCase().includes(String(filterValue).toLowerCase());
    default:
      return false;
  }
}

/**
 * Helper function to check if a threat has an attack tree
 * @param {Object} threat - The threat object
 * @param {Set<string>} threatsWithTrees - Set of threat names with attack trees
 * @returns {boolean} True if threat has an attack tree
 */
export function hasAttackTree(threat, threatsWithTrees) {
  // Handle threats with undefined/null names gracefully
  // Requirement 6.3: Handle threats with undefined or null names
  if (!threat || !threat.name || typeof threat.name !== "string") {
    return false;
  }

  // Handle missing or invalid threatsWithTrees parameter
  if (!threatsWithTrees || !(threatsWithTrees instanceof Set)) {
    return false;
  }

  return threatsWithTrees.has(threat.name);
}

/**
 * Checks if a threat matches a single filter token
 * Implements property-specific filtering behavior:
 * - likelihood: exact match filtering
 * - target: array support with "any element matches" logic
 * - source: array support with "any element matches" logic
 * - stride_category: exact match filtering
 * - starred: boolean logic with undefined/null treated as false
 * - has_attack_tree: boolean logic based on threatsWithTrees Set
 *
 * @param {Object} threat - The threat object to check
 * @param {Object} token - The filter token with propertyKey, operator, and value
 * @param {Set<string>} threatsWithTrees - Set of threat names with attack trees (optional)
 * @returns {boolean} True if the threat matches the token
 */
export function matchesToken(threat, token, threatsWithTrees = new Set()) {
  // Handle malformed threat data gracefully
  // Requirement 1.4: Handle malformed threat data
  if (!threat || typeof threat !== "object") {
    return false;
  }

  // Handle malformed token data
  if (!token || !token.propertyKey || !token.operator) {
    return false;
  }

  const { propertyKey, operator, value } = token;
  const threatValue = threat[propertyKey];

  // Property-specific filtering: attack tree status
  if (propertyKey === "has_attack_tree") {
    const hasTree = hasAttackTree(threat, threatsWithTrees);
    // Convert filter value to boolean for comparison
    const filterBoolean = value === "true" || value === true;
    return matchesOperator(hasTree, operator, filterBoolean);
  }

  // Property-specific filtering: starred boolean logic
  // Requirement 7.2, 7.3: Handle starred filtering with boolean logic
  if (propertyKey === "starred") {
    // Treat undefined/null as false for starred property
    const normalizedValue = threatValue === true ? true : false;
    // Convert filter value to boolean for comparison
    const filterBoolean = value === "true" || value === true;
    return matchesOperator(normalizedValue, operator, filterBoolean);
  }

  // Handle undefined/null values for non-starred properties
  if (threatValue === undefined || threatValue === null) {
    // For other properties, undefined/null only matches != operator
    return operator === "!=";
  }

  // Property-specific filtering: target and source array support
  if (propertyKey === "target" || propertyKey === "source") {
    // Normalize to array for consistent handling
    const values = Array.isArray(threatValue) ? threatValue : [threatValue];
    // Match if ANY element in the array matches the filter
    return values.some((item) => matchesOperator(item, operator, value));
  }

  // Property-specific filtering: likelihood and stride_category exact match
  if (propertyKey === "likelihood" || propertyKey === "stride_category") {
    // Use exact match comparison
    return matchesOperator(threatValue, operator, value);
  }

  // Default: handle any other properties with standard matching
  // Handle array values for any other properties
  if (Array.isArray(threatValue)) {
    return threatValue.some((item) => matchesOperator(item, operator, value));
  }

  return matchesOperator(threatValue, operator, value);
}

/**
 * Filters threat catalog data based on PropertyFilter query
 * @param {Array} threats - Array of threat objects
 * @param {Object} query - PropertyFilter query object with tokens and operation
 * @param {Set<string>} threatsWithTrees - Set of threat names with attack trees (optional)
 * @returns {Array} Filtered array of threats
 */
export function filterThreats(threats, query, threatsWithTrees = new Set()) {
  // Handle malformed threats array gracefully
  // Requirement 1.4: Handle malformed threat data
  if (!threats || !Array.isArray(threats)) {
    return [];
  }

  // Empty query or no tokens returns all threats
  // Requirement 1.5: Filter clearing restores full catalog display
  if (!query || !query.tokens || query.tokens.length === 0) {
    return threats;
  }

  const { tokens, operation } = query;

  // Filter out invalid tokens (malformed filter data)
  const validTokens = tokens.filter((token) => token && token.propertyKey && token.operator);

  // If no valid tokens after filtering, return all threats
  if (validTokens.length === 0) {
    return threats;
  }

  return threats.filter((threat) => {
    // Skip malformed threat objects
    if (!threat || typeof threat !== "object") {
      return false;
    }

    // Check each token against the threat
    // Pass threatsWithTrees through filter chain
    const matches = validTokens.map((token) => matchesToken(threat, token, threatsWithTrees));

    // Apply logical operation
    if (operation === "and") {
      // AND: all tokens must match
      return matches.every((match) => match === true);
    } else {
      // OR: at least one token must match
      return matches.some((match) => match === true);
    }
  });
}

/**
 * Generates filter options from threat catalog data for a specific property
 * @param {Array} threats - Array of threat objects
 * @param {string} propertyKey - The property to extract options for
 * @returns {Array} Array of unique option objects with propertyKey and value
 */
export function generateFilterOptions(threats, propertyKey) {
  // Handle malformed threats array gracefully
  if (!threats || !Array.isArray(threats)) {
    return [];
  }

  // Handle invalid property key
  if (!propertyKey || typeof propertyKey !== "string") {
    return [];
  }

  const uniqueValues = new Set();

  threats.forEach((threat) => {
    // Skip malformed threat objects
    if (!threat || typeof threat !== "object") {
      return;
    }

    const value = threat[propertyKey];

    // Skip undefined/null values
    if (value === undefined || value === null) {
      return;
    }

    // Handle array values - add each item separately
    if (Array.isArray(value)) {
      value.forEach((item) => {
        // Only add non-null, non-undefined items
        if (item !== undefined && item !== null) {
          uniqueValues.add(item);
        }
      });
    } else {
      // Handle single values
      uniqueValues.add(value);
    }
  });

  // Convert Set to array
  let valuesArray = Array.from(uniqueValues);

  // Sort likelihood values in priority order: High, Medium, Low
  if (propertyKey === "likelihood") {
    const likelihoodOrder = ["Critical", "High", "Medium", "Low"];
    valuesArray.sort((a, b) => {
      const indexA = likelihoodOrder.indexOf(a);
      const indexB = likelihoodOrder.indexOf(b);
      // If value not in order array, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  // Convert to option objects
  return valuesArray.map((value) => ({
    propertyKey,
    value,
  }));
}
