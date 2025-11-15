/**
 * Chart utility functions for threat model dashboard
 * Provides data transformation and aggregation for various chart visualizations
 */

/**
 * Transform threat data for STRIDE category chart
 * Handles missing/null stride_category attributes by counting them as "Uncategorized"
 * @param {Array} threats - Array of threat objects
 * @returns {Array} Array of objects with category and count properties
 */
export const aggregateByStride = (threats) => {
  if (!Array.isArray(threats)) {
    return [];
  }

  const categories = [
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
  ];

  const categoryCounts = categories.map((category) => ({
    category,
    count: threats.filter((t) => t?.stride_category === category).length,
  }));

  // Count threats with missing/null stride_category as "Uncategorized"
  const uncategorizedCount = threats.filter(
    (t) => !t?.stride_category || !categories.includes(t.stride_category)
  ).length;

  if (uncategorizedCount > 0) {
    categoryCounts.push({
      category: "Uncategorized",
      count: uncategorizedCount,
    });
  }

  return categoryCounts;
};

/**
 * Transform threat data for likelihood distribution chart
 * Handles missing/null likelihood attributes by counting them as "Not Assessed"
 * @param {Array} threats - Array of threat objects
 * @returns {Array} Array of objects with level and count properties
 */
export const aggregateByLikelihood = (threats) => {
  if (!Array.isArray(threats)) {
    return [];
  }

  const levels = ["High", "Medium", "Low"];

  const likelihoodCounts = levels.map((level) => ({
    level,
    count: threats.filter((t) => t?.likelihood === level).length,
  }));

  // Count threats with missing/null likelihood as "Not Assessed"
  const notAssessedCount = threats.filter(
    (t) => !t?.likelihood || !levels.includes(t.likelihood)
  ).length;

  if (notAssessedCount > 0) {
    likelihoodCounts.push({
      level: "Not Assessed",
      count: notAssessedCount,
    });
  }

  return likelihoodCounts;
};

/**
 * Transform threat data for target asset chart (sorted, top 10)
 * Handles missing/null target attributes by counting them as "Unknown Target"
 * @param {Array} threats - Array of threat objects
 * @returns {Array} Array of objects with target and count properties, sorted by count descending, limited to top 10
 */
export const aggregateByTarget = (threats) => {
  if (!Array.isArray(threats)) {
    return [];
  }

  const targetCounts = {};

  threats.forEach((threat) => {
    // Handle missing/null/empty target values
    const target = threat?.target && threat.target.trim() !== "" ? threat.target : "Unknown Target";
    targetCounts[target] = (targetCounts[target] || 0) + 1;
  });

  return Object.entries(targetCounts)
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
};

/**
 * Transform threat data for source distribution chart
 * Handles missing/null source attributes by counting them as "Unknown Source"
 * @param {Array} threats - Array of threat objects
 * @returns {Array} Array of objects with source and count properties, sorted by count descending
 */
export const aggregateBySource = (threats) => {
  if (!Array.isArray(threats)) {
    return [];
  }

  const sourceCounts = {};

  threats.forEach((threat) => {
    // Handle missing/null/empty source values
    const source = threat?.source && threat.source.trim() !== "" ? threat.source : "Unknown Source";
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  return Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Get color for likelihood level (consistent color mapping)
 * Uses colors matching the Badge severity colors used in threat catalog
 * @param {string} level - Likelihood level (High, Medium, Low)
 * @returns {string} Hex color code
 */
export const getLikelihoodColor = (level) => {
  // Using colors that match the Badge severity colors:
  // High: Red (colorChartsStatusHigh)
  // Medium: Orange (colorChartsStatusMedium)
  // Low: Light gray (matching severity-low badge color)
  // Not Assessed: Gray (colorChartsStatusNeutral)
  const colors = {
    High: "#ba2e0f", // Cloudscape colorChartsStatusHigh (red)
    Medium: "#cc5f21", // Cloudscape colorChartsStatusMedium (orange)
    Low: "#F2CD54", // Yellow (matching severity-low badge)
    "Not Assessed": "#8c8c94", // Cloudscape colorChartsStatusNeutral (gray)
  };

  return colors[level] || "#000000";
};

/**
 * Transform threat data for STRIDE category chart with likelihood breakdown
 * Returns data structured for stacked bar chart
 * @param {Array} threats - Array of threat objects
 * @returns {Object} Object with categories array and series data by likelihood
 */
export const aggregateByStrideWithLikelihood = (threats) => {
  if (!Array.isArray(threats)) {
    return { categories: [], series: [] };
  }

  const categories = [
    "Spoofing",
    "Tampering",
    "Repudiation",
    "Information Disclosure",
    "Denial of Service",
    "Elevation of Privilege",
  ];

  const likelihoodLevels = ["High", "Medium", "Low"];

  // Create series for each likelihood level
  const series = likelihoodLevels.map((level) => {
    const data = categories.map((category) => {
      const count = threats.filter(
        (t) => t?.stride_category === category && t?.likelihood === level
      ).length;
      return { x: category, y: count };
    });

    return {
      title: level,
      type: "bar",
      data,
      color: getLikelihoodColor(level),
    };
  });

  return { categories, series };
};

/**
 * Transform threat data for target asset chart with likelihood breakdown
 * Returns data structured for stacked bar chart (top 10 targets)
 * @param {Array} threats - Array of threat objects
 * @returns {Object} Object with targets array and series data by likelihood
 */
export const aggregateByTargetWithLikelihood = (threats) => {
  if (!Array.isArray(threats)) {
    return { targets: [], series: [] };
  }

  // First, get top 10 targets by total count
  const targetCounts = {};
  threats.forEach((threat) => {
    const target = threat?.target && threat.target.trim() !== "" ? threat.target : "Unknown Target";
    targetCounts[target] = (targetCounts[target] || 0) + 1;
  });

  const topTargets = Object.entries(targetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([target]) => target);

  const likelihoodLevels = ["High", "Medium", "Low"];

  // Create series for each likelihood level
  const series = likelihoodLevels.map((level) => {
    const data = topTargets.map((target) => {
      const count = threats.filter((t) => {
        const threatTarget = t?.target && t.target.trim() !== "" ? t.target : "Unknown Target";
        return threatTarget === target && t?.likelihood === level;
      }).length;
      return { x: target, y: count };
    });

    return {
      title: level,
      type: "bar",
      data,
      color: getLikelihoodColor(level),
    };
  });

  return { targets: topTargets, series };
};
