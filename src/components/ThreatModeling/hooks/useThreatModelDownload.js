import { useCallback } from "react";
import { downloadDocument, downloadPDFDocument } from "../docs";
import createThreatModelingDocument from "../ResultsDocx";
import { createThreatModelingPDF } from "../ResutlPdf";

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
 */
export const useThreatModelDownload = (response, base64Content) => {
  /**
   * Handle document download in specified format
   * @param {string} format - The format to download ('docx', 'pdf', or 'json')
   */
  const handleDownload = useCallback(
    async (format = "docx") => {
      try {
        // Handle JSON export separately (no need for doc generation)
        if (format === "json") {
          downloadJSON(response?.item, response?.item?.title, base64Content);
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
