import React from "react";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

export const createThreatModelingPDF = async (
  architectureDiagramBase64,
  title,
  description,
  assumptions,
  assets,
  dataFlowData,
  trustBoundaryData,
  threatSourceData,
  threatCatalogData
) => {
  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(14); // Changed from 20 to 14
  doc.text(title, 105, yPos, { align: "center" });
  yPos += 20;

  // Architecture diagram section remains the same except for font size changes
  if (architectureDiagramBase64) {
    try {
      let imageData = architectureDiagramBase64;
      if (typeof architectureDiagramBase64 === "object" && architectureDiagramBase64?.value) {
        imageData = `data:${architectureDiagramBase64.type};base64,${architectureDiagramBase64.value}`;
      }

      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14); // Changed from 16 to 14
      doc.text("Architecture Diagram", 14, yPos);
      yPos += 10;

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageData;
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const maxWidth = pageWidth - 28;
      const scale = 0.8;
      const imgWidth = Math.min(maxWidth * scale, img.width * scale);
      const imgHeight = (img.height * imgWidth) / img.width;

      doc.addImage(imageData, "JPEG", 14, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    } catch (error) {
      console.error("Error adding architecture diagram to PDF:", error);
      doc.setFontSize(10); // Error message in size 10
      doc.setTextColor(255, 0, 0);
      doc.text("Error: Could not load architecture diagram", 14, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 15;
    }
  }

  // Helper function to add section
  const addSection = (title, data, columns) => {
    if (data?.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text(title, 14, yPos); // Changed from 10 to 14 to align with table
      yPos += 5;

      doc.autoTable({
        startY: yPos,
        styles: { fontSize: 10 },
        headStyles: {
          fontSize: 10,
          halign: "left", // Ensures header text aligns to the left
        },
        head: [
          columns.map((col) =>
            col
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          ),
        ],
        body: data.map((row) =>
          columns.map((col) =>
            Array.isArray(row[col]) ? row[col].map((item) => `• ${item}`).join("\n") : row[col]
          )
        ),
        margin: { left: 14 }, // Aligns with the section title
        margin: { top: 10 },
      });

      yPos = doc.lastAutoTable.finalY + 15;
    }
  };

  // Helper function to add text paragraph section
  const addTextSection = (title, text) => {
    if (text) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14); // Section title at 14
      doc.text(title, 14, yPos);
      yPos += 5;

      doc.setFontSize(10); // Description text at 10
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const maxWidth = pageWidth - margin * 2;
      const lines = doc.splitTextToSize(text, maxWidth);

      doc.text(lines, margin, yPos);
      yPos += lines.length * 7 + 10;
    }
  };

  // Add sections
  if (description) {
    addTextSection("Description", description);
  }

  if (assumptions?.length > 0) {
    addSection("Assumptions", assumptions, ["assumption"]);
  }

  if (assets?.length > 0) {
    addSection("Assets", assets, ["type", "name", "description"]);
  }

  if (dataFlowData?.length > 0) {
    addSection("Data Flow", dataFlowData, ["flow_description", "source_entity", "target_entity"]);
  }

  if (trustBoundaryData?.length > 0) {
    addSection("Trust Boundary", trustBoundaryData, ["purpose", "source_entity", "target_entity"]);
  }

  if (threatSourceData?.length > 0) {
    addSection("Threat Source", threatSourceData, ["category", "description", "example"]);
  }

  if (threatCatalogData?.length > 0) {
    addSection("Threat Catalog", threatCatalogData, [
      "name",
      "stride_category",
      "description",
      "target",
      "impact",
      "likelihood",
      "mitigations",
    ]);
  }

  return doc;
};
