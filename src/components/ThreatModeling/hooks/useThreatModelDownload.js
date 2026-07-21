import { useCallback } from "react";
import { downloadDocument, downloadPDFDocument } from "../docs";
import createThreatModelingDocument from "../ResultsDocx";
import { createThreatModelingPDF } from "../ResutlPdf";
import * as XLSX from "xlsx";

/**
 * Helper function to convert string array to objects with a key
 * @param {string} key - The key to use for each object
 * @param {string[]} stringArray - Array of strings to convert
 * @returns {Object[]} Array of objects with the specified key
 */
const arrayToObjects = (key, stringArray) => {
  if (!stringArray || stringArray.length === 0) return [];
  return stringArray.map((value) => ({ [key]: value }));
};

/**
 * Helper function to download threat model data as JSON
 * @param {Object} data - The threat model data
 * @param {string} filename - The filename for the download
 * @param {Object} base64Diagram - The base64 encoded diagram
 */
const downloadJSON = (data, filename, base64Diagram) => {
  // Destructure to exclude unwanted fields
  const { job_id, owner, retry, s3_location, ...cleanData } = data || {};

  // Create a complete export object that includes the diagram
  const exportData = {
    ...cleanData,
    architecture_diagram: base64Diagram
      ? {
          type: base64Diagram.type,
          value: base64Diagram.value,
        }
      : null,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename || "threat-model"}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Helper function to sanitize text for Markdown table cells
 * - Escapes backslashes first so later escapes cannot be neutralized
 * - Escapes pipe characters that would break table structure
 * - Replaces newlines with spaces to keep content on single line
 * @param {string} text - The text to sanitize
 * @returns {string} Sanitized text safe for Markdown tables
 */
const sanitizeTableCell = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
};

/**
 * Helper function to sanitize text for Markdown headings
 * - Escapes backslashes first so later escapes cannot be neutralized
 * - Escapes # characters that would create unintended headings
 * @param {string} text - The text to sanitize
 * @returns {string} Sanitized text safe for Markdown headings
 */
const sanitizeHeading = (text) => {
  if (!text) return "";
  return String(text).replace(/\\/g, "\\\\").replace(/#/g, "\\#");
};

/**
 * Helper function to download threat model data as Markdown (.md)
 * AI-friendly format for use with LLMs and AI tools
 * @param {Object} data - The threat model data
 * @param {string} filename - The filename for the download
 */
const downloadMarkdown = (data, filename) => {
  // Destructure to exclude sensitive/internal fields (consistent with JSON export)
  const { job_id, owner, retry, s3_location, ...cleanData } = data || {};

  const lines = [];

  // Title and Description
  const title = sanitizeHeading(cleanData?.title || "Threat Model Report");
  lines.push(`# ${title}`);
  lines.push("");
  if (cleanData?.description) {
    lines.push(`## Description`);
    lines.push("");
    lines.push(cleanData.description);
    lines.push("");
  }

  // Metadata
  lines.push(`## Metadata`);
  lines.push("");
  lines.push(`- **Created:** ${cleanData?.timestamp || "N/A"}`);
  lines.push(`- **Reasoning Level:** ${cleanData?.retry || "N/A"}`);
  lines.push("");

  // Assumptions
  const assumptions = cleanData?.assumptions || [];
  if (assumptions.length > 0) {
    lines.push(`## Assumptions`);
    lines.push("");
    assumptions.forEach((assumption, index) => {
      const text = typeof assumption === "string" ? assumption : assumption.assumption || "";
      lines.push(`${index + 1}. ${text}`);
    });
    lines.push("");
  }

  // Assets
  const assets = cleanData?.assets?.assets || [];
  if (assets.length > 0) {
    lines.push(`## Assets`);
    lines.push("");
    lines.push(`| # | Asset Name | Type | Description | Criticality |`);
    lines.push(`|---|------------|------|-------------|-------------|`);
    assets.forEach((asset, index) => {
      const name = sanitizeTableCell(asset.name);
      const type = sanitizeTableCell(asset.type);
      const desc = sanitizeTableCell(asset.description);
      const criticality = sanitizeTableCell(asset.criticality);
      lines.push(`| ${index + 1} | ${name} | ${type} | ${desc} | ${criticality} |`);
    });
    lines.push("");
  }

  // Data Flows
  const dataFlows = cleanData?.system_architecture?.data_flows || [];
  if (dataFlows.length > 0) {
    lines.push(`## Data Flows`);
    lines.push("");
    lines.push(`| # | Source | Target | Description |`);
    lines.push(`|---|--------|--------|-------------|`);
    dataFlows.forEach((flow, index) => {
      const source = sanitizeTableCell(flow.source_entity || flow.source);
      const target = sanitizeTableCell(flow.target_entity || flow.destination);
      const desc = sanitizeTableCell(flow.flow_description || flow.description);
      lines.push(`| ${index + 1} | ${source} | ${target} | ${desc} |`);
    });
    lines.push("");
  }

  // Trust Boundaries
  const trustBoundaries = cleanData?.system_architecture?.trust_boundaries || [];
  if (trustBoundaries.length > 0) {
    lines.push(`## Trust Boundaries`);
    lines.push("");
    lines.push(`| # | Source | Target | Purpose |`);
    lines.push(`|---|--------|--------|---------|`);
    trustBoundaries.forEach((boundary, index) => {
      const source = sanitizeTableCell(boundary.source_entity || boundary.name);
      const target = sanitizeTableCell(boundary.target_entity || boundary.type);
      const purpose = sanitizeTableCell(boundary.purpose || boundary.description);
      lines.push(`| ${index + 1} | ${source} | ${target} | ${purpose} |`);
    });
    lines.push("");
  }

  // Threat Sources
  const threatSources = cleanData?.system_architecture?.threat_sources || [];
  if (threatSources.length > 0) {
    lines.push(`## Threat Sources`);
    lines.push("");
    threatSources.forEach((source, index) => {
      const sourceName = sanitizeHeading(source.category || source.name || "Unknown Source");
      lines.push(`### ${index + 1}. ${sourceName}`);
      lines.push("");
      if (source.description) {
        lines.push(source.description);
        lines.push("");
      }
      if (source.motivation) {
        lines.push(`- **Motivation:** ${source.motivation}`);
      }
      if (source.capability) {
        lines.push(`- **Capability:** ${source.capability}`);
      }
      lines.push("");
    });
  }

  // Threat Catalog (main section)
  const threats = cleanData?.threat_list?.threats || [];
  if (threats.length > 0) {
    lines.push(`## Threat Catalog`);
    lines.push("");
    lines.push(`Total Threats: ${threats.length}`);
    lines.push("");

    // Sort threats by likelihood (High to Low)
    const likelihoodOrder = {
      High: 3,
      Medium: 2,
      Low: 1,
    };
    const sortedThreats = [...threats].sort((a, b) => {
      const scoreA = likelihoodOrder[a?.likelihood] || 0;
      const scoreB = likelihoodOrder[b?.likelihood] || 0;
      return scoreB - scoreA;
    });

    sortedThreats.forEach((threat, index) => {
      // Sanitize threat name for heading (escape # characters)
      const threatName = sanitizeHeading(threat.name || "Unnamed Threat");
      lines.push(`### ${index + 1}. ${threatName}`);
      lines.push("");

      // Get column selections (if provided by export options)
      const exportColumns = cleanData?._exportColumns;
      const isColumnSelected = (key) => !exportColumns || exportColumns[key] !== false;

      // Risk information - only include selected columns
      const tableRows = [];
      if (isColumnSelected("strideCategory"))
        tableRows.push(
          `| **STRIDE Category** | ${sanitizeTableCell(threat.stride_category || "N/A")} |`
        );
      if (isColumnSelected("likelihood"))
        tableRows.push(`| **Likelihood** | ${sanitizeTableCell(threat.likelihood || "N/A")} |`);
      if (isColumnSelected("impact"))
        tableRows.push(`| **Impact** | ${sanitizeTableCell(threat.impact || "N/A")} |`);
      if (isColumnSelected("target"))
        tableRows.push(`| **Target** | ${sanitizeTableCell(threat.target || "N/A")} |`);
      if (isColumnSelected("source"))
        tableRows.push(`| **Source** | ${sanitizeTableCell(threat.source || "N/A")} |`);
      if (isColumnSelected("vector"))
        tableRows.push(`| **Attack Vector** | ${sanitizeTableCell(threat.vector || "N/A")} |`);

      if (tableRows.length > 0) {
        lines.push(`| Attribute | Value |`);
        lines.push(`|-----------|-------|`);
        tableRows.forEach((row) => lines.push(row));
        lines.push("");
      }

      // Description
      if (isColumnSelected("description") && threat.description) {
        lines.push(`**Description:**`);
        lines.push("");
        lines.push(threat.description);
        lines.push("");
      }

      // Prerequisites (array field)
      const prerequisites = threat.prerequisites || [];
      if (isColumnSelected("prerequisites") && prerequisites.length > 0) {
        lines.push(`**Prerequisites:**`);
        lines.push("");
        prerequisites.forEach((prereq) => {
          const sanitizedPrereq = String(prereq || "")
            .replace(/\n/g, " ")
            .replace(/\r/g, "");
          lines.push(`- ${sanitizedPrereq}`);
        });
        lines.push("");
      }

      // Mitigations (plural array field)
      const mitigations = threat.mitigations || [];
      if (isColumnSelected("mitigations") && mitigations.length > 0) {
        lines.push(`**Mitigations:**`);
        lines.push("");
        mitigations.forEach((mitigation) => {
          const sanitizedMitigation = String(mitigation || "")
            .replace(/\n/g, " ")
            .replace(/\r/g, "");
          lines.push(`- ${sanitizedMitigation}`);
        });
        lines.push("");
      }

      // Notes (user annotations)
      if (isColumnSelected("notes") && threat.notes) {
        lines.push(`**Notes:**`);
        lines.push("");
        lines.push(threat.notes);
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });
  }

  // Generate and download the file
  const markdownContent = lines.join("\n");
  const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename || "threat-model"}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Helper function to download threat model data as Excel (.xlsx)
 * Multi-sheet workbook with Summary, Threats, Assets, Data Flows, Trust Boundaries, Assumptions
 * @param {Object} data - The threat model data
 * @param {string} filename - The filename for the download
 */
const downloadXLS = (data, filename) => {
  const workbook = XLSX.utils.book_new();

  // Get column selections (if provided by export options)
  const exportColumns = data?._exportColumns;

  // Column mapping: key → { header, getValue }
  const columnDefs = {
    name: { header: "Name", getValue: (t) => t.name || "" },
    strideCategory: { header: "STRIDE Category", getValue: (t) => t.stride_category || "" },
    description: { header: "Description", getValue: (t) => t.description || "" },
    target: { header: "Target", getValue: (t) => t.target || "" },
    likelihood: { header: "Likelihood", getValue: (t) => t.likelihood || "" },
    impact: { header: "Impact", getValue: (t) => t.impact || "" },
    source: { header: "Source", getValue: (t) => t.source || "" },
    vector: { header: "Attack Vector", getValue: (t) => t.vector || "" },
    prerequisites: {
      header: "Prerequisites",
      getValue: (t) => (Array.isArray(t.prerequisites) ? t.prerequisites.join(", ") : ""),
    },
    mitigations: {
      header: "Mitigations",
      getValue: (t) => (Array.isArray(t.mitigations) ? t.mitigations.join(", ") : ""),
    },
    notes: { header: "Notes", getValue: (t) => t.notes || "" },
  };

  // Determine which columns to include
  const activeColumns = exportColumns
    ? Object.entries(exportColumns)
        .filter(([, selected]) => selected)
        .map(([key]) => key)
        .filter((key) => columnDefs[key])
    : Object.keys(columnDefs);

  // Sheet 1: Summary
  const summaryData = [
    ["Threat Model Summary"],
    [""],
    ["Title", data?.title || ""],
    ["Description", data?.description || ""],
    ["Created", data?.timestamp || ""],
    ["Reasoning Level", data?.retry || ""],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // Sheet 2: Threats (main data)
  const threats = data?.threat_list?.threats || [];
  if (threats.length > 0) {
    const threatHeaders = ["ID", ...activeColumns.map((key) => columnDefs[key].header)];
    const threatRows = threats.map((threat, index) => [
      index + 1,
      ...activeColumns.map((key) => columnDefs[key].getValue(threat)),
    ]);
    const threatSheet = XLSX.utils.aoa_to_sheet([threatHeaders, ...threatRows]);
    XLSX.utils.book_append_sheet(workbook, threatSheet, "Threats");
  }

  // Sheet 3: Assets
  const assets = data?.assets?.assets || [];
  if (assets.length > 0) {
    const assetHeaders = ["ID", "Asset Name", "Type", "Description", "Criticality"];
    const assetRows = assets.map((asset, index) => [
      index + 1,
      asset.name || "",
      asset.type || "",
      asset.description || "",
      asset.criticality || "",
    ]);
    const assetSheet = XLSX.utils.aoa_to_sheet([assetHeaders, ...assetRows]);
    XLSX.utils.book_append_sheet(workbook, assetSheet, "Assets");
  }

  // Sheet 4: Data Flows
  const dataFlows = data?.system_architecture?.data_flows || [];
  if (dataFlows.length > 0) {
    const flowHeaders = ["ID", "Source", "Target", "Description"];
    const flowRows = dataFlows.map((flow, index) => [
      index + 1,
      flow.source_entity || flow.source || "",
      flow.target_entity || flow.destination || "",
      flow.flow_description || flow.description || "",
    ]);
    const flowSheet = XLSX.utils.aoa_to_sheet([flowHeaders, ...flowRows]);
    XLSX.utils.book_append_sheet(workbook, flowSheet, "Data Flows");
  }

  // Sheet 5: Trust Boundaries
  const trustBoundaries = data?.system_architecture?.trust_boundaries || [];
  if (trustBoundaries.length > 0) {
    const boundaryHeaders = ["ID", "Source", "Target", "Purpose"];
    const boundaryRows = trustBoundaries.map((boundary, index) => [
      index + 1,
      boundary.source_entity || boundary.name || "",
      boundary.target_entity || boundary.type || "",
      boundary.purpose || boundary.description || "",
    ]);
    const boundarySheet = XLSX.utils.aoa_to_sheet([boundaryHeaders, ...boundaryRows]);
    XLSX.utils.book_append_sheet(workbook, boundarySheet, "Trust Boundaries");
  }

  // Sheet 6: Assumptions
  const assumptions = data?.assumptions || [];
  if (assumptions.length > 0) {
    const assumptionHeaders = ["ID", "Assumption"];
    const assumptionRows = assumptions.map((assumption, index) => [
      index + 1,
      typeof assumption === "string" ? assumption : assumption.assumption || "",
    ]);
    const assumptionSheet = XLSX.utils.aoa_to_sheet([assumptionHeaders, ...assumptionRows]);
    XLSX.utils.book_append_sheet(workbook, assumptionSheet, "Assumptions");
  }

  // Generate and download the file
  XLSX.writeFile(workbook, `${filename || "threat-model"}.xlsx`);
};

/**
 * Apply export options to filter threat model data
 * @param {Object} data - The full threat model data
 * @param {Object} options - Export options from ExportOptionsModal
 * @returns {Object} Filtered data based on selections
 */
const applyExportOptions = (data, options) => {
  if (!options || !data) return data;

  const { sections, columns, likelihoodFilter } = options;
  const filtered = { ...data };

  // Filter sections
  if (!sections.assumptions) {
    filtered.assumptions = [];
  }
  if (!sections.assets) {
    filtered.assets = null;
  }
  if (!sections.dataFlow) {
    filtered.system_architecture = {
      ...filtered.system_architecture,
      data_flows: [],
    };
  }
  if (!sections.trustBoundary) {
    filtered.system_architecture = {
      ...filtered.system_architecture,
      trust_boundaries: [],
    };
  }
  if (!sections.threatSource) {
    filtered.system_architecture = {
      ...filtered.system_architecture,
      threat_sources: [],
    };
  }
  if (!sections.threatCatalog) {
    filtered.threat_list = { threats: [] };
  }

  // Filter threats by likelihood
  if (sections.threatCatalog && filtered.threat_list?.threats) {
    const selectedLevels = Object.entries(likelihoodFilter || {})
      .filter(([, selected]) => selected)
      .map(([level]) => level);

    // Only filter if not all levels are selected
    if (selectedLevels.length < Object.keys(likelihoodFilter || {}).length) {
      filtered.threat_list = {
        ...filtered.threat_list,
        threats: filtered.threat_list.threats.filter((threat) =>
          selectedLevels.includes(threat.likelihood)
        ),
      };
    }
  }

  // Filter threat columns (used by Excel and Markdown exports)
  if (sections.threatCatalog && columns) {
    filtered._exportColumns = columns;
  }

  // Track whether architecture diagram should be included
  filtered._includeArchitectureDiagram = sections.architectureDiagram !== false;

  return filtered;
};

/**
 * Custom hook for handling threat model document downloads
 *
 * @param {Object} response - The threat model response data
 * @param {Object} base64Content - The base64 encoded architecture diagram
 * @returns {Object} Hook interface with handleDownload function
 *
 * @example
 * const { handleDownload } = useThreatModelDownload(response, base64Content);
 * handleDownload('pdf'); // Download as PDF (full)
 * handleDownload('pdf', options); // Download as PDF with export options
 */
export const useThreatModelDownload = (response, base64Content) => {
  /**
   * Handle document download in specified format
   * @param {string} format - The format to download ('docx', 'pdf', 'json', 'xls', or 'md')
   * @param {Object} [options] - Optional export options from ExportOptionsModal
   */
  const handleDownload = useCallback(
    async (format = "docx", options = null) => {
      try {
        // Handle JSON export separately (always full dump, no filtering)
        if (format === "json") {
          downloadJSON(response?.item, response?.item?.title, base64Content);
          return;
        }

        // Apply export options to filter data
        const filteredData = applyExportOptions(response?.item, options);
        const includeArchDiagram = filteredData?._includeArchitectureDiagram !== false;
        const diagramContent = includeArchDiagram ? base64Content : null;

        // Handle Excel export
        if (format === "xls") {
          downloadXLS(filteredData, filteredData?.title);
          return;
        }

        // Handle Markdown export
        if (format === "md") {
          downloadMarkdown(filteredData, filteredData?.title);
          return;
        }

        // Generate DOCX and PDF documents with filtered data
        const doc = await createThreatModelingDocument(
          filteredData?.title,
          filteredData?.description,
          diagramContent,
          arrayToObjects("assumption", filteredData?.assumptions),
          filteredData?.assets?.assets,
          filteredData?.system_architecture?.data_flows,
          filteredData?.system_architecture?.trust_boundaries,
          filteredData?.system_architecture?.threat_sources,
          filteredData?.threat_list?.threats
        );

        const pdfDoc = await createThreatModelingPDF(
          diagramContent,
          filteredData?.title,
          filteredData?.description,
          arrayToObjects("assumption", filteredData?.assumptions),
          filteredData?.assets?.assets,
          filteredData?.system_architecture?.data_flows,
          filteredData?.system_architecture?.trust_boundaries,
          filteredData?.system_architecture?.threat_sources,
          filteredData?.threat_list?.threats
        );

        // Download the requested format
        if (format === "docx") {
          await downloadDocument(doc, filteredData?.title);
        } else if (format === "pdf") {
          downloadPDFDocument(pdfDoc, filteredData?.title);
        }
      } catch (error) {
        console.error(`Error generating ${format} document:`, error);
      }
    },
    [response, base64Content]
  );

  return {
    handleDownload,
  };
};
