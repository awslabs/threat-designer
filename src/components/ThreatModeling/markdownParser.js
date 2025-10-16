import { marked } from "marked";

/**
 * Process inline markdown tokens recursively
 * @param {Array} tokens - Markdown tokens to process
 * @param {Object} inheritedStyles - Styles to inherit
 * @returns {Array} Flattened tokens with style information
 */
export const flattenMarkdownTokens = (tokens) => {
  const result = [];

  const processToken = (token, inheritedStyles = {}) => {
    const currentStyles = { ...inheritedStyles };

    if (token.type === "text") {
      result.push({ type: "text", text: token.text, ...currentStyles });
    } else if (token.type === "strong") {
      currentStyles.bold = true;
      if (token.tokens) {
        token.tokens.forEach((t) => processToken(t, currentStyles));
      } else if (token.text) {
        result.push({ type: "text", text: token.text, ...currentStyles });
      }
    } else if (token.type === "em") {
      currentStyles.italic = true;
      if (token.tokens) {
        token.tokens.forEach((t) => processToken(t, currentStyles));
      } else if (token.text) {
        result.push({ type: "text", text: token.text, ...currentStyles });
      }
    } else if (token.type === "codespan") {
      result.push({ type: "code", text: token.text, ...currentStyles });
    } else if (token.type === "link") {
      currentStyles.link = token.href;
      if (token.tokens && token.tokens.length > 0) {
        token.tokens.forEach((t) => processToken(t, currentStyles));
      } else if (token.text) {
        result.push({ type: "text", text: token.text, ...currentStyles });
      }
    } else if (token.type === "del") {
      currentStyles.strike = true;
      if (token.tokens) {
        token.tokens.forEach((t) => processToken(t, currentStyles));
      } else if (token.text) {
        result.push({ type: "text", text: token.text, ...currentStyles });
      }
    } else if (token.tokens) {
      token.tokens.forEach((t) => processToken(t, currentStyles));
    }
  };

  tokens.forEach((token) => processToken(token));
  return result;
};

/**
 * Parse markdown table cell content for links and formatting
 * @param {string} cellText - Table cell content
 * @returns {Object} Parsed content with formatting info
 */
export const parseTableCellMarkdown = (cellText) => {
  if (!cellText || typeof cellText !== "string") {
    return { hasMarkdown: false, content: cellText || "" };
  }

  // Check for markdown link pattern [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
  const matches = [...cellText.matchAll(linkRegex)];

  if (matches.length > 0) {
    try {
      const tokens = marked.lexer(cellText);
      if (tokens.length > 0 && tokens[0].tokens) {
        return {
          hasMarkdown: true,
          tokens: tokens[0].tokens,
          links: matches.map((m) => ({ text: m[1], url: m[2], fullMatch: m[0] })),
        };
      }
    } catch (error) {
      console.error("Error parsing table cell markdown:", error);
    }
  }

  // Check for other inline markdown (bold, italic, code)
  if (cellText.includes("**") || cellText.includes("*") || cellText.includes("`")) {
    try {
      const tokens = marked.lexer(cellText);
      if (tokens.length > 0 && tokens[0].tokens) {
        return {
          hasMarkdown: true,
          tokens: tokens[0].tokens,
        };
      }
    } catch (error) {
      console.error("Error parsing table cell markdown:", error);
    }
  }

  return { hasMarkdown: false, content: cellText };
};

/**
 * Extract text content from markdown tokens
 * @param {Array} tokens - Markdown tokens
 * @returns {string} Plain text content
 */
export const extractTextFromTokens = (tokens) => {
  if (!tokens || tokens.length === 0) return "";

  const getText = (token) => {
    if (token.type === "text") return token.text;
    if (token.text) return token.text;
    if (token.tokens) return token.tokens.map(getText).join("");
    return "";
  };

  return tokens.map(getText).join("");
};

/**
 * Parse markdown table structure
 * @param {Object} tableToken - Markdown table token
 * @returns {Object} Structured table data
 */
export const parseMarkdownTable = (tableToken) => {
  if (!tableToken.header || !tableToken.rows) {
    return null;
  }

  const headers = tableToken.header.map((cell) => {
    if (cell.tokens && cell.tokens.length > 0) {
      return {
        text: extractTextFromTokens(cell.tokens),
        tokens: cell.tokens,
      };
    }
    return {
      text: cell.text || "",
      tokens: null,
    };
  });

  const rows = tableToken.rows.map((row) =>
    row.map((cell) => {
      if (cell.tokens && cell.tokens.length > 0) {
        return {
          text: extractTextFromTokens(cell.tokens),
          tokens: cell.tokens,
        };
      }
      return {
        text: cell.text || "",
        tokens: null,
      };
    })
  );

  return {
    headers,
    rows,
    align: tableToken.align || [],
  };
};

/**
 * Parse full markdown content to structured tokens
 * @param {string} markdown - Markdown string
 * @returns {Array} Structured token array
 */
export const parseMarkdown = (markdown) => {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  try {
    return marked.lexer(markdown);
  } catch (error) {
    console.error("Error parsing markdown:", error);
    return [];
  }
};
