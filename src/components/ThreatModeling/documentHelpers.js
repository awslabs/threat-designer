/**
 * Document structure and configuration helpers
 */

export const SECTION_TITLES = {
  DESCRIPTION: "Description",
  ASSUMPTIONS: "Assumptions",
  ASSETS: "Assets",
  DATA_FLOW: "Data Flow",
  TRUST_BOUNDARY: "Trust Boundary",
  THREAT_SOURCE: "Threat Source",
  THREAT_CATALOG: "Threat Catalog",
  ARCHITECTURE_DIAGRAM: "Architecture Diagram",
};

export const TABLE_COLUMNS = {
  ASSUMPTIONS: ["assumption"],
  ASSETS: ["type", "name", "description"],
  DATA_FLOW: ["flow_description", "source_entity", "target_entity"],
  TRUST_BOUNDARY: ["purpose", "source_entity", "target_entity"],
  THREAT_SOURCE: ["category", "description", "example"],
  THREAT_CATALOG: [
    "name",
    "stride_category",
    "description",
    "target",
    "impact",
    "likelihood",
    "mitigations",
  ],
};

/**
 * Format table header text
 * @param {string} header - Header string (snake_case or camelCase)
 * @returns {string} Formatted header (Title Case)
 */
export const formatTableHeader = (header) => {
  return header
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Get document sections configuration
 * @param {Object} data - All document data
 * @returns {Array} Array of section configurations
 */
export const getDocumentSections = (data) => {
  const {
    description,
    assumptions,
    assets,
    dataFlowData,
    trustBoundaryData,
    threatSourceData,
    threatCatalogData,
  } = data;

  return [
    {
      type: "text",
      title: SECTION_TITLES.DESCRIPTION,
      content: description,
      show: !!description,
    },
    {
      type: "table",
      title: SECTION_TITLES.ASSUMPTIONS,
      columns: TABLE_COLUMNS.ASSUMPTIONS,
      data: assumptions,
      show: assumptions?.length > 0,
    },
    {
      type: "table",
      title: SECTION_TITLES.ASSETS,
      columns: TABLE_COLUMNS.ASSETS,
      data: assets,
      show: assets?.length > 0,
    },
    {
      type: "table",
      title: SECTION_TITLES.DATA_FLOW,
      columns: TABLE_COLUMNS.DATA_FLOW,
      data: dataFlowData,
      show: dataFlowData?.length > 0,
    },
    {
      type: "table",
      title: SECTION_TITLES.TRUST_BOUNDARY,
      columns: TABLE_COLUMNS.TRUST_BOUNDARY,
      data: trustBoundaryData,
      show: trustBoundaryData?.length > 0,
    },
    {
      type: "table",
      title: SECTION_TITLES.THREAT_SOURCE,
      columns: TABLE_COLUMNS.THREAT_SOURCE,
      data: threatSourceData,
      show: threatSourceData?.length > 0,
    },
    {
      type: "table",
      title: SECTION_TITLES.THREAT_CATALOG,
      columns: TABLE_COLUMNS.THREAT_CATALOG,
      data: threatCatalogData,
      show: threatCatalogData?.length > 0,
      landscape: true,
    },
  ].filter((section) => section.show);
};

/**
 * Process image data for document inclusion
 * @param {string|Object} base64Data - Image data
 * @returns {string} Processed image data
 */
export const processImageData = (base64Data) => {
  if (!base64Data) return null;

  let imageData = base64Data;

  if (typeof base64Data === "object" && base64Data?.value) {
    imageData = base64Data.value;
  }

  if (typeof imageData === "string" && imageData.includes("base64,")) {
    imageData = imageData.split("base64,")[1];
  }

  return imageData;
};

/**
 * Handle array content in table cells
 * @param {Array} items - Array of items
 * @returns {string} Formatted string with bullets
 */
export const formatArrayCellContent = (items) => {
  if (!Array.isArray(items)) return items || "";
  return items.map((item) => `• ${item}`).join("\n");
};
