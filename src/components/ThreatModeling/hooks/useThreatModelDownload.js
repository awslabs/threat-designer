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
 * - Escapes pipe characters that would break table structure
 * - Replaces newlines with spaces to keep content on single line
 * @param {string} text - The text to sanitize
 * @returns {string} Sanitized text safe for Markdown tables
 */
const sanitizeTableCell = (text) => {
  if (!text) return "";
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
};

/**
 * Helper function to sanitize text for Markdown headings
 * - Escapes # characters that would create unintended headings
 * @param {string} text - The text to sanitize
 * @returns {string} Sanitized text safe for Markdown headings
 */
const sanitizeHeading = (text) => {
  if (!text) return "";
  return String(text).replace(/#/g, "\\#");
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
    lines.push(`| # | Asset Name | Type | Description | Sensitivity |`);
    lines.push(`|---|------------|------|-------------|-------------|`);
    assets.forEach((asset, index) => {
      const name = sanitizeTableCell(asset.name);
      const type = sanitizeTableCell(asset.type);
      const desc = sanitizeTableCell(asset.description);
      const sensitivity = sanitizeTableCell(asset.sensitivity);
      lines.push(`| ${index + 1} | ${name} | ${type} | ${desc} | ${sensitivity} |`);
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

    // Sort threats by risk score (High to Low)
    const riskScoreOrder = {
      High: 5,
      "Medium/High": 4,
      Medium: 3,
      "Low/Medium": 2,
      Low: 1,
    };
    const sortedThreats = [...threats].sort((a, b) => {
      const scoreA = riskScoreOrder[a?.risk_score] || 0;
      const scoreB = riskScoreOrder[b?.risk_score] || 0;
      return scoreB - scoreA;
    });

    sortedThreats.forEach((threat, index) => {
      // Sanitize threat name for heading (escape # characters)
      const threatName = sanitizeHeading(threat.threat_name || threat.name || "Unnamed Threat");
      lines.push(`### ${index + 1}. ${threatName}`);
      lines.push("");

      // Risk information - sanitize values for table cells
      lines.push(`| Attribute | Value |`);
      lines.push(`|-----------|-------|`);
      lines.push(`| **STRIDE Category** | ${sanitizeTableCell(threat.stride_category || "N/A")} |`);
      lines.push(`| **Risk Score** | ${sanitizeTableCell(threat.risk_score || "N/A")} |`);
      lines.push(`| **Likelihood** | ${sanitizeTableCell(threat.likelihood || "N/A")} |`);
      lines.push(`| **Impact** | ${sanitizeTableCell(threat.impact || "N/A")} |`);
      lines.push(`| **Target** | ${sanitizeTableCell(threat.target || "N/A")} |`);
      lines.push(`| **Source** | ${sanitizeTableCell(threat.source || "N/A")} |`);
      lines.push(`| **Attack Vector** | ${sanitizeTableCell(threat.vector || "N/A")} |`);
      lines.push(`| **Status** | ${sanitizeTableCell(threat.status || "To do")} |`);
      lines.push("");

      // Description
      if (threat.description) {
        lines.push(`**Description:**`);
        lines.push("");
        lines.push(threat.description);
        lines.push("");
      }

      // Affected Assets
      const affectedAssets = threat.affected_assets || [];
      if (affectedAssets.length > 0) {
        lines.push(`**Affected Assets:**`);
        lines.push("");
        affectedAssets.forEach((asset) => {
          const sanitizedAsset = String(asset || "")
            .replace(/\n/g, " ")
            .replace(/\r/g, "");
          lines.push(`- ${sanitizedAsset}`);
        });
        lines.push("");
      }

      // Prerequisites (array field)
      const prerequisites = threat.prerequisites || [];
      if (prerequisites.length > 0) {
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
      if (mitigations.length > 0) {
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

      // ISO27001 Controls
      const isoControls = threat.iso_controls || [];
      if (isoControls.length > 0) {
        lines.push(`**ISO27001 Controls:**`);
        lines.push("");
        if (Array.isArray(isoControls)) {
          isoControls.forEach((control) => {
            const sanitizedControl = String(control || "")
              .replace(/\n/g, " ")
              .replace(/\r/g, "");
            lines.push(`- ${sanitizedControl}`);
          });
        } else {
          const sanitizedControl = String(isoControls || "")
            .replace(/\n/g, " ")
            .replace(/\r/g, "");
          lines.push(`- ${sanitizedControl}`);
        }
        lines.push("");
      }

      // Comments (user notes)
      if (threat.comments) {
        lines.push(`**Comments:**`);
        lines.push("");
        lines.push(threat.comments);
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
    const threatHeaders = [
      "ID",
      "Threat Name",
      "Category",
      "Description",
      "Risk Score",
      "Likelihood",
      "Impact",
      "Mitigation",
      "ISO27001 Controls",
      "Affected Assets",
      "Status",
      "Comments",
    ];
    const threatRows = threats.map((threat, index) => [
      index + 1,
      threat.threat_name || threat.name || "",
      threat.stride_category || "",
      threat.description || "",
      threat.risk_score || "",
      threat.likelihood || "",
      threat.impact || "",
      Array.isArray(threat.mitigations) ? threat.mitigations.join(", ") : threat.mitigation || "",
      Array.isArray(threat.iso_controls)
        ? threat.iso_controls.join(", ")
        : threat.iso_controls || "",
      Array.isArray(threat.affected_assets)
        ? threat.affected_assets.join(", ")
        : threat.affected_assets || "",
      threat.status || "",
      threat.comments || "",
    ]);
    const threatSheet = XLSX.utils.aoa_to_sheet([threatHeaders, ...threatRows]);
    XLSX.utils.book_append_sheet(workbook, threatSheet, "Threats");
  }

  // Sheet 3: Assets
  const assets = data?.assets?.assets || [];
  if (assets.length > 0) {
    const assetHeaders = ["ID", "Asset Name", "Type", "Description", "Sensitivity"];
    const assetRows = assets.map((asset, index) => [
      index + 1,
      asset.name || "",
      asset.type || "",
      asset.description || "",
      asset.sensitivity || "",
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
 * Custom hook for handling threat model document downloads
 *
 * @param {Object} response - The threat model response data
 * @param {Object} base64Content - The base64 encoded architecture diagram
 * @returns {Object} Hook interface with handleDownload function
 *
 * @example
 * const { handleDownload } = useThreatModelDownload(response, base64Content);
 * handleDownload('pdf'); // Download as PDF
 * handleDownload('docx'); // Download as DOCX
 * handleDownload('json'); // Download as JSON
 * handleDownload('xls'); // Download as Excel
 * handleDownload('md'); // Download as Markdown
 */
export const useThreatModelDownload = (response, base64Content) => {
  /**
   * Handle document download in specified format
   * @param {string} format - The format to download ('docx', 'pdf', 'json', 'xls', or 'md')
   */
  const handleDownload = useCallback(
    async (format = "docx") => {
      try {
        // Handle JSON export separately (no need for doc generation)
        if (format === "json") {
          downloadJSON(response?.item, response?.item?.title, base64Content);
          return;
        }

        // Handle Excel export separately
        if (format === "xls") {
          downloadXLS(response?.item, response?.item?.title);
          return;
        }

        // Handle Markdown export separately
        if (format === "md") {
          downloadMarkdown(response?.item, response?.item?.title);
          return;
        }

        // Generate both DOCX and PDF documents
        const doc = await createThreatModelingDocument(
          response?.item?.title,
          response?.item?.description,
          base64Content,
          arrayToObjects("assumption", response?.item?.assumptions),
          response?.item?.assets?.assets,
          response?.item?.system_architecture?.data_flows,
          response?.item?.system_architecture?.trust_boundaries,
          response?.item?.system_architecture?.threat_sources,
          response?.item?.threat_list?.threats
        );

        const pdfDoc = await createThreatModelingPDF(
          base64Content,
          response?.item?.title,
          response?.item?.description,
          arrayToObjects("assumption", response?.item?.assumptions),
          response?.item?.assets?.assets,
          response?.item?.system_architecture?.data_flows,
          response?.item?.system_architecture?.trust_boundaries,
          response?.item?.system_architecture?.threat_sources,
          response?.item?.threat_list?.threats
        );

        // Download the requested format
        if (format === "docx") {
          await downloadDocument(doc, response?.item?.title);
        } else if (format === "pdf") {
          downloadPDFDocument(pdfDoc, response?.item?.title);
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
