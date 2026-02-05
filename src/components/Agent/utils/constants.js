export const HEIGHT_DEBOUNCE_MS = 16; // ~1 frame at 60fps for faster response during streaming

export const WEB_SEARCH_TOOLS = ["tavily_search", "remote_web_search"];
export const WEB_EXTRACT_TOOLS = ["tavily_extract", "webFetch"];
export const THREAT_TOOLS = ["add_threats", "edit_threats", "delete_threats", "remove_threat"];

export const TOOL_CATEGORIES = {
  WEB_SEARCH: "web_search",
  WEB_EXTRACT: "web_extract",
  THREAT: "threat",
  GENERIC: "generic",
};
