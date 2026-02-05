/**
 * Timeline Parser Module
 *
 * Parses thinking content into discrete segments and builds timeline steps
 * for the UnifiedThinkingBlock component.
 *
 * @module timelineParser
 */

/**
 * @typedef {Object} ThinkingSegment
 * @property {string} id - Unique identifier for the segment
 * @property {string} content - The text content of the segment
 * @property {'paragraph' | 'header' | 'list'} type - The type of segment
 */

/**
 * @typedef {Object} TimelineStep
 * @property {string} id - Unique identifier for the step
 * @property {'thinking' | 'tool'} type - The type of step
 * @property {ThinkingSegment} [segment] - For thinking steps, the segment data
 * @property {string} [toolName] - For tool steps, the tool name
 * @property {string} [toolContent] - For tool steps, the tool content/result
 * @property {boolean} [isToolComplete] - For tool steps, whether the tool has completed
 * @property {string} [toolError] - For tool steps, any error message
 */

/**
 * Parse thinking content into discrete segments.
 *
 * Splits content by double newlines into paragraphs, identifies segment types
 * (paragraph, header, list), filters empty/whitespace-only segments, and
 * preserves markdown formatting within each segment.
 *
 * @param {string} content - Raw thinking content string
 * @returns {ThinkingSegment[]} Array of ThinkingSegment objects
 *
 * @example
 * parseThinkingContent("First paragraph\n\nSecond paragraph")
 * // Returns: [
 * //   { id: 'segment-0', content: 'First paragraph', type: 'paragraph' },
 * //   { id: 'segment-1', content: 'Second paragraph', type: 'paragraph' }
 * // ]
 *
 * @example
 * parseThinkingContent("# Header\n\n- Item 1\n- Item 2")
 * // Returns: [
 * //   { id: 'segment-0', content: '# Header', type: 'header' },
 * //   { id: 'segment-1', content: '- Item 1\n- Item 2', type: 'list' }
 * // ]
 */
export function parseThinkingContent(content) {
  // Handle null, undefined, or non-string inputs (Requirement 2.4)
  if (content == null || typeof content !== "string") {
    return [];
  }

  // Handle empty or whitespace-only content (Requirement 2.4)
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return [];
  }

  const segments = [];

  // Split by double newlines (paragraph breaks) (Requirement 2.1)
  const paragraphs = trimmedContent.split(/\n\n+/);

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // Filter empty/whitespace-only segments (Requirement 2.4)
    if (!trimmed) {
      continue;
    }

    // Detect segment type
    let type = "paragraph";

    // Check for markdown headers (Requirement 2.2)
    if (trimmed.startsWith("#")) {
      type = "header";
    }
    // Check for bullet lists (-, *, +) or numbered lists (Requirement 2.3)
    else if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) {
      type = "list";
    }

    // Preserve markdown formatting within each segment (Requirement 2.5)
    segments.push({
      id: `segment-${segments.length}`,
      content: trimmed,
      type,
    });
  }

  return segments;
}

/**
 * Build timeline steps from content blocks.
 *
 * Accepts contentBlocks array as input, parses thinking blocks into segments,
 * creates TimelineStep objects for each segment and tool, and preserves
 * chronological order.
 *
 * @param {Array<{type: string, content: string, id?: string, toolName?: string, isComplete: boolean, error?: string}>} contentBlocks - Array of content blocks from props
 * @returns {TimelineStep[]} Array of TimelineStep objects in chronological order
 *
 * @example
 * buildTimelineSteps([
 *   { type: 'think', content: 'Analyzing...', isComplete: true },
 *   { type: 'tool', toolName: 'web_search', content: '{}', isComplete: true }
 * ])
 * // Returns timeline steps for the thinking segment and tool
 */
export function buildTimelineSteps(contentBlocks) {
  // Handle null, undefined, or non-array inputs
  if (!Array.isArray(contentBlocks)) {
    return [];
  }

  const steps = [];

  for (const block of contentBlocks) {
    // Handle thinking blocks - parse into segments (Requirement 1.3)
    if (block.type === "think" && block.content) {
      const segments = parseThinkingContent(block.content);
      for (const segment of segments) {
        steps.push({
          id: `think-${steps.length}`,
          type: "thinking",
          segment,
        });
      }
    }
    // Handle tool blocks - create single step per tool (Requirement 1.4)
    else if (block.type === "tool") {
      steps.push({
        id: `tool-${steps.length}`,
        type: "tool",
        toolName: block.toolName,
        toolContent: block.content,
        isToolComplete: block.isComplete,
        toolError: block.error,
      });
    }
  }

  return steps;
}

export default {
  parseThinkingContent,
  buildTimelineSteps,
};
