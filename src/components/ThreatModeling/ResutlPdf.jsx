import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { flattenMarkdownTokens, parseTableCellMarkdown, parseMarkdown } from "./markdownParser";
import {
  SECTION_TITLES,
  getDocumentSections,
  formatTableHeader,
  processImageData,
  formatArrayCellContent,
} from "./documentHelpers";

// PDF-specific token processing
const processInlineTokensForPDF = (tokens) => {
  const flattened = flattenMarkdownTokens(tokens);
  return flattened.map((token) => ({
    text: token.text,
    bold: token.bold,
    italic: token.italic,
    code: token.type === "code",
    link: token.link,
    strike: token.strike,
  }));
};

// Parse markdown and extract text with formatting info
const parseMarkdownForPDF = (markdown) => {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  try {
    const tokens = parseMarkdown(markdown);
    const segments = [];

    tokens.forEach((token) => {
      switch (token.type) {
        case "heading":
          if (token.tokens && token.tokens.length > 0) {
            segments.push({
              type: "heading",
              level: token.depth,
              content: processInlineTokensForPDF(token.tokens),
            });
          } else if (token.text) {
            segments.push({
              type: "heading",
              level: token.depth,
              content: [{ text: token.text }],
            });
          }
          break;

        case "paragraph":
          if (token.tokens && token.tokens.length > 0) {
            segments.push({
              type: "paragraph",
              content: processInlineTokensForPDF(token.tokens),
            });
          }
          break;

        case "list":
          if (token.items && token.items.length > 0) {
            const items = token.items.map((item) => {
              if (item.tokens && item.tokens.length > 0) {
                const allContent = [];
                item.tokens.forEach((subToken) => {
                  if (subToken.tokens) {
                    allContent.push(...processInlineTokensForPDF(subToken.tokens));
                  } else if (subToken.text) {
                    allContent.push({ text: subToken.text });
                  }
                });
                return allContent.length > 0 ? allContent : [{ text: item.text || "" }];
              }
              return [{ text: item.text || "" }];
            });
            segments.push({
              type: "list",
              ordered: token.ordered,
              items: items,
            });
          }
          break;

        case "code":
          if (token.text && token.text.trim()) {
            segments.push({
              type: "code",
              content: token.text,
              lang: token.lang,
            });
          }
          break;

        case "blockquote":
          if (token.tokens && token.tokens.length > 0) {
            token.tokens.forEach((subToken) => {
              if (subToken.type === "paragraph" && subToken.tokens) {
                segments.push({
                  type: "blockquote",
                  content: processInlineTokensForPDF(subToken.tokens),
                });
              }
            });
          } else if (token.text && token.text.trim()) {
            segments.push({
              type: "blockquote",
              content: [{ text: token.text }],
            });
          }
          break;

        case "table":
          if (token.header && token.rows) {
            const headers = token.header.map((cell) => {
              if (cell.tokens && cell.tokens.length > 0) {
                return processInlineTokensForPDF(cell.tokens);
              }
              return [{ text: cell.text || "" }];
            });

            const rows = token.rows.map((row) =>
              row.map((cell) => {
                if (cell.tokens && cell.tokens.length > 0) {
                  return processInlineTokensForPDF(cell.tokens);
                }
                return [{ text: cell.text || "" }];
              })
            );

            segments.push({
              type: "table",
              headers: headers,
              rows: rows,
              align: token.align || [],
            });
          }
          break;

        case "space":
          segments.push({ type: "space" });
          break;

        case "hr":
          segments.push({ type: "hr" });
          break;

        default:
          break;
      }
    });

    return segments;
  } catch (error) {
    console.error("Error parsing markdown for PDF:", error);
    return [{ type: "paragraph", content: [{ text: markdown }] }];
  }
};

// [Rest of the PDF rendering functions remain the same - renderFormattedText, etc.]
// ... (keeping all the existing PDF rendering logic)

const renderFormattedText = (doc, segments, startY, margin, textWidth, pageHeight) => {
  // ... (keep existing implementation)
  let yPos = startY;
  const lineHeight = 6;
  const pageMargin = 20;

  const checkPageBreak = (requiredSpace = 15) => {
    if (yPos + requiredSpace > pageHeight - pageMargin) {
      doc.addPage();
      return 20;
    }
    return yPos;
  };

  const renderContentSegments = (content, xOffset = 0, baseFontSize = 10, maxWidth = null) => {
    if (!content || content.length === 0) {
      yPos += lineHeight;
      return;
    }

    const effectiveMaxWidth = maxWidth || textWidth - xOffset;
    let currentX = margin + xOffset;
    let lineStartY = yPos;

    for (let i = 0; i < content.length; i++) {
      const segment = content[i];

      let fontStyle = "normal";
      if (segment.bold && segment.italic) fontStyle = "bolditalic";
      else if (segment.bold) fontStyle = "bold";
      else if (segment.italic) fontStyle = "italic";

      if (segment.code) {
        doc.setFont("courier", fontStyle);
        doc.setFontSize(baseFontSize - 1);
      } else {
        doc.setFont("helvetica", fontStyle);
        doc.setFontSize(baseFontSize);
      }

      if (segment.link) {
        doc.setTextColor(0, 102, 204);
      } else if (segment.code) {
        doc.setTextColor(139, 0, 0);
      } else {
        doc.setTextColor(0, 0, 0);
      }

      const words = segment.text.split(/(\s+)/);

      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        if (!word) continue;

        const wordWidth = doc.getTextWidth(word);

        if (currentX + wordWidth > margin + textWidth && currentX > margin + xOffset) {
          yPos += lineHeight;
          yPos = checkPageBreak();
          currentX = margin + xOffset;
          lineStartY = yPos;
        }

        if (segment.link) {
          doc.textWithLink(word, currentX, yPos, { url: segment.link });
        } else {
          doc.text(word, currentX, yPos);
        }

        currentX += wordWidth;
      }
    }

    yPos += lineHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
  };

  const convertSegmentsToText = (segments) => {
    if (!segments || segments.length === 0) return "";
    return segments.map((seg) => seg.text).join("");
  };

  segments.forEach((segment) => {
    switch (segment.type) {
      case "heading":
        yPos = checkPageBreak(25);
        const headingSizes = { 1: 18, 2: 16, 3: 14, 4: 12, 5: 11, 6: 10 };
        const fontSize = headingSizes[segment.level] || 12;
        yPos += segment.level === 1 ? 8 : 4;

        doc.setFontSize(fontSize);
        doc.setFont("helvetica", "bold");

        const headingText = segment.content.map((c) => c.text).join("");
        const headingLines = doc.splitTextToSize(headingText, textWidth);

        headingLines.forEach((line) => {
          doc.text(line, margin, yPos);
          yPos += fontSize * 0.5 + 2;
        });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        yPos += segment.level === 1 ? 6 : 4;
        break;

      case "paragraph":
        yPos = checkPageBreak();
        renderContentSegments(segment.content, 0, 10);
        yPos += 2;
        break;

      case "list":
        segment.items.forEach((item, idx) => {
          yPos = checkPageBreak(15);
          const bullet = segment.ordered ? `${idx + 1}. ` : "• ";

          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          const bulletWidth = doc.getTextWidth(bullet);
          doc.text(bullet, margin, yPos);

          const itemStartY = yPos;
          renderContentSegments(item, bulletWidth, 10, textWidth - bulletWidth);
        });
        yPos += 2;
        break;

      case "code":
        yPos = checkPageBreak(25);
        yPos += 3;

        let codeContent = segment.content;
        const charMap = {
          "├": "|",
          "│": "|",
          "└": "`",
          "─": "-",
          "┌": "+",
          "┐": "+",
          "┘": "+",
          "┴": "+",
          "┬": "+",
          "┤": "+",
          "┼": "+",
        };

        Object.keys(charMap).forEach((unicodeChar) => {
          codeContent = codeContent.replace(new RegExp(unicodeChar, "g"), charMap[unicodeChar]);
        });

        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(248, 248, 248);

        const codeLines = codeContent.split("\n");
        const codePadding = 4;
        const codeLineHeight = 4.5;

        const codeBlockHeight = codeLines.length * codeLineHeight + codePadding * 2;

        doc.rect(margin, yPos - codePadding + 1, textWidth, codeBlockHeight, "F");

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.rect(margin, yPos - codePadding + 1, textWidth, codeBlockHeight, "S");

        codeLines.forEach((line) => {
          if (yPos + codeLineHeight > pageHeight - pageMargin) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line || " ", margin + 3, yPos);
          yPos += codeLineHeight;
        });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        yPos += codePadding + 4;
        break;

      case "blockquote":
        yPos = checkPageBreak(15);
        const quoteStartY = yPos;
        const quotePadding = 12;

        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);

        const quoteContentStartY = yPos;
        renderContentSegments(segment.content, quotePadding, 10, textWidth - quotePadding);

        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(3);
        doc.line(margin + 4, quoteContentStartY - 2, margin + 4, yPos - lineHeight);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        yPos += 3;
        break;

      case "table":
        yPos = checkPageBreak(30);

        const tableHeaders = segment.headers.map((header) => convertSegmentsToText(header));
        const tableRows = segment.rows.map((row) => row.map((cell) => convertSegmentsToText(cell)));

        const numColumns = tableHeaders.length;
        const columnStyles = {};

        if (numColumns === 2) {
          columnStyles[0] = { cellWidth: 30 };
          columnStyles[1] = { cellWidth: "auto" };
        } else if (numColumns === 3) {
          columnStyles[0] = { cellWidth: 25 };
          columnStyles[1] = { cellWidth: "auto" };
          columnStyles[2] = { cellWidth: "auto" };
        } else {
          for (let i = 0; i < numColumns; i++) {
            columnStyles[i] = { cellWidth: "auto" };
          }
        }

        doc.autoTable({
          startY: yPos,
          head: [tableHeaders],
          body: tableRows,
          columnStyles: columnStyles,
          styles: {
            fontSize: 9,
            cellPadding: 4,
            overflow: "linebreak",
            cellWidth: "wrap",
            valign: "top",
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
            minCellHeight: 10,
          },
          headStyles: {
            fontSize: 10,
            fontStyle: "bold",
            halign: "left",
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            cellPadding: 4,
          },
          bodyStyles: {
            textColor: [0, 0, 0],
          },
          alternateRowStyles: {
            fillColor: [250, 250, 250],
          },
          margin: { left: margin, right: margin },
          tableWidth: "auto",
          theme: "grid",
        });

        yPos = doc.lastAutoTable.finalY + 8;
        break;

      case "space":
        yPos += 5;
        break;

      case "hr":
        yPos = checkPageBreak(10);
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, textWidth + margin, yPos);
        yPos += 8;
        break;

      default:
        break;
    }
  });

  return yPos;
};

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
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = pageWidth - margin * 2;

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageWidth / 2, yPos, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  yPos += 15;

  // Architecture Diagram
  if (architectureDiagramBase64) {
    try {
      let imageData = architectureDiagramBase64;
      if (typeof architectureDiagramBase64 === "object" && architectureDiagramBase64?.value) {
        imageData = `data:${architectureDiagramBase64.type};base64,${architectureDiagramBase64.value}`;
      }

      if (yPos > pageHeight - 80) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(SECTION_TITLES.ARCHITECTURE_DIAGRAM, margin, yPos);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      yPos += 10;

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageData;
      });

      const maxImgWidth = textWidth;
      const maxImgHeight = pageHeight - yPos - 30;

      let imgWidth = img.width;
      let imgHeight = img.height;

      if (imgWidth > maxImgWidth) {
        const scale = maxImgWidth / imgWidth;
        imgWidth = maxImgWidth;
        imgHeight = imgHeight * scale;
      }

      if (imgHeight > maxImgHeight) {
        const scale = maxImgHeight / imgHeight;
        imgHeight = maxImgHeight;
        imgWidth = imgWidth * scale;
      }

      if (yPos + imgHeight > pageHeight - 20) {
        doc.addPage();
        yPos = 20;
      }

      doc.addImage(imageData, "JPEG", margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 12;
    } catch (error) {
      console.error("Error adding architecture diagram to PDF:", error);
      doc.setFontSize(10);
      doc.setTextColor(255, 0, 0);
      doc.text("Error: Could not load architecture diagram", margin, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 10;
    }
  }

  // Helper functions using shared utilities
  const addMarkdownSection = (sectionTitle, markdown) => {
    if (!markdown) return;

    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(sectionTitle, margin, yPos);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    yPos += 10;

    const segments = parseMarkdownForPDF(markdown);
    yPos = renderFormattedText(doc, segments, yPos, margin, textWidth, pageHeight);
    yPos += 6;
  };

  const addTableSection = (sectionTitle, data, columns, forceLandscape = false) => {
    if (!data || data.length === 0) return;

    if (forceLandscape) {
      doc.addPage("a4", "landscape");
      const landscapeWidth = doc.internal.pageSize.getWidth();
      const landscapeTextWidth = landscapeWidth - margin * 2;
      yPos = 20;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(sectionTitle, margin, yPos);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      yPos += 10;

      // Better column width distribution for landscape tables
      const numColumns = columns.length;
      const columnStyles = {};

      // Special handling for threat catalog (7 columns)
      if (numColumns === 7) {
        columnStyles[0] = { cellWidth: 45 }; // name
        columnStyles[1] = { cellWidth: 30 }; // stride_category
        columnStyles[2] = { cellWidth: 70 }; // description
        columnStyles[3] = { cellWidth: 35 }; // target
        columnStyles[4] = { cellWidth: 25 }; // impact
        columnStyles[5] = { cellWidth: 25 }; // likelihood
        columnStyles[6] = { cellWidth: 50 }; // mitigations
      } else {
        // Default auto for other landscape tables
        for (let i = 0; i < numColumns; i++) {
          columnStyles[i] = { cellWidth: "auto" };
        }
      }

      doc.autoTable({
        startY: yPos,
        styles: {
          fontSize: 8,
          cellPadding: 3,
          overflow: "linebreak",
          cellWidth: "wrap",
          valign: "top",
          halign: "left",
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        columnStyles: columnStyles,
        headStyles: {
          fontSize: 9,
          fontStyle: "bold",
          halign: "left",
          cellPadding: 3,
          fillColor: [66, 139, 202],
          textColor: [255, 255, 255],
          valign: "middle",
        },
        bodyStyles: {
          textColor: [0, 0, 0],
          minCellHeight: 12,
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        head: [columns.map(formatTableHeader)],
        body: data.map((row) =>
          columns.map((col) =>
            Array.isArray(row[col]) ? formatArrayCellContent(row[col]) : row[col] || ""
          )
        ),
        didDrawCell: (data) => {
          if (data.section === "body") {
            const cellValue = data.cell.raw;
            if (typeof cellValue === "string") {
              const parsed = parseTableCellMarkdown(cellValue);

              if (parsed.hasMarkdown && parsed.links && parsed.links.length > 0) {
                const link = parsed.links[0];
                const cellX = data.cell.x + 2;
                const cellY = data.cell.y + data.cell.height / 2 + 1;

                doc.setTextColor(0, 102, 204);
                doc.setFontSize(8);
                doc.textWithLink(link.text, cellX, cellY, { url: link.url });
                doc.setTextColor(0, 0, 0);
              }
            }
          }
        },
        margin: { left: margin, right: margin },
        tableWidth: "auto",
        theme: "grid",
      });

      yPos = doc.lastAutoTable.finalY + 10;
    } else {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(sectionTitle, margin, yPos);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      yPos += 10;

      // Better column width distribution for portrait tables
      const numColumns = columns.length;
      const columnStyles = {};

      if (numColumns === 1) {
        // Single column (like assumptions)
        columnStyles[0] = { cellWidth: textWidth };
      } else if (numColumns === 2) {
        columnStyles[0] = { cellWidth: 40 };
        columnStyles[1] = { cellWidth: textWidth - 40 };
      } else if (numColumns === 3) {
        // For assets table: type, name, description
        columnStyles[0] = { cellWidth: 30 }; // type
        columnStyles[1] = { cellWidth: 40 }; // name
        columnStyles[2] = { cellWidth: textWidth - 70 }; // description
      } else {
        // Default distribution for other tables
        const equalWidth = textWidth / numColumns;
        for (let i = 0; i < numColumns; i++) {
          columnStyles[i] = { cellWidth: equalWidth };
        }
      }

      doc.autoTable({
        startY: yPos,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          overflow: "linebreak",
          cellWidth: "wrap",
          valign: "top",
          halign: "left",
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        columnStyles: columnStyles,
        headStyles: {
          fontSize: 10,
          fontStyle: "bold",
          halign: "left",
          cellPadding: 3,
          fillColor: [66, 139, 202],
          textColor: [255, 255, 255],
          valign: "middle",
        },
        bodyStyles: {
          textColor: [0, 0, 0],
          minCellHeight: 12,
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        head: [columns.map(formatTableHeader)],
        body: data.map((row) =>
          columns.map((col) =>
            Array.isArray(row[col]) ? formatArrayCellContent(row[col]) : row[col] || ""
          )
        ),
        didDrawCell: (data) => {
          if (data.section === "body") {
            const cellValue = data.cell.raw;
            if (typeof cellValue === "string") {
              const parsed = parseTableCellMarkdown(cellValue);

              if (parsed.hasMarkdown && parsed.links && parsed.links.length > 0) {
                const link = parsed.links[0];
                const cellX = data.cell.x + 2;
                const cellY = data.cell.y + data.cell.height / 2 + 1;

                doc.setTextColor(0, 102, 204);
                doc.setFontSize(9);
                doc.textWithLink(link.text, cellX, cellY, { url: link.url });
                doc.setTextColor(0, 0, 0);
              }
            }
          }
        },
        margin: { left: margin, right: margin },
        tableWidth: "auto",
        theme: "grid",
      });

      yPos = doc.lastAutoTable.finalY + 10;
    }
  };

  // Add all sections using shared configuration
  const sections = getDocumentSections({
    description,
    assumptions,
    assets,
    dataFlowData,
    trustBoundaryData,
    threatSourceData,
    threatCatalogData,
  });

  sections.forEach((section) => {
    if (section.type === "text") {
      addMarkdownSection(section.title, section.content);
    } else if (section.type === "table") {
      addTableSection(section.title, section.data, section.columns, section.landscape);
    }
  });

  return doc;
};
