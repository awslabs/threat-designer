/**
 * Convert tool name from snake_case or kebab-case to Title Case
 *
 * @param {string} name - Tool name (e.g., "web_search", "calculate-sum")
 * @returns {string} Formatted name (e.g., "Web Search", "Calculate Sum")
 *
 * @example
 * formatToolName("web_search") // "Web Search"
 * formatToolName("calculate-sum") // "Calculate Sum"
 * formatToolName("tavily_search") // "Tavily Search"
 */
export function formatToolName(name) {
  // Handle null, undefined, or non-string inputs
  if (name == null || typeof name !== "string") {
    return "";
  }

  // Handle empty string
  if (name.length === 0) {
    return "";
  }

  // Split by underscores and hyphens, filter out empty strings from consecutive separators
  const words = name.split(/[_-]+/).filter((word) => word.length > 0);

  // Handle case where input was only separators
  if (words.length === 0) {
    return "";
  }

  // Capitalize first letter of each word, lowercase the rest
  return words
    .map((word) => {
      if (word.length === 1) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export default formatToolName;
