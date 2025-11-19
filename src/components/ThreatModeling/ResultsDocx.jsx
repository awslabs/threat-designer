import {
  Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  BorderStyle,
  WidthType,
  HeadingLevel,
  PageOrientation,
  SectionType,
  ImageRun,
  ExternalHyperlink,
} from "docx";
import {
  flattenMarkdownTokens,
  parseTableCellMarkdown,
  extractTextFromTokens,
  parseMarkdownTable,
  parseMarkdown,
} from "./markdownParser";
import {
  SECTION_TITLES,
  getDocumentSections,
  formatTableHeader,
  processImageData,
  formatArrayCellContent,
} from "./documentHelpers";

/**
 * Extract mime type + raw base64 from a data URL or raw base64 string.
 * - "data:image/png;base64,AAAA..."  -> { mimeType: "image/png", base64: "AAAA..." }
 * - "AAAA..."                        -> { mimeType: null,        base64: "AAAA..." }
 */
const normalizeBase64Image = (raw) => {
  if (!raw) return { mimeType: null, base64: "" };

  const trimmed = raw.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.\-]+);base64,(.*)$/s);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: null, base64: trimmed };
};

/**
 * Ensure we have a data URL for fetch() in the browser.
 */
const ensureDataUrl = (rawBase64, mimeType = "image/png") => {
  if (!rawBase64) return null;
  const trimmed = rawBase64.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${mimeType};base64,${trimmed}`;
};

/**
 * Convert a plain base64 string to Uint8Array in the browser.
 */
const base64ToUint8Array = (base64) => {
  if (!base64) return new Uint8Array();
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// ---------- Text / markdown helpers ----------

const createTextRuns = (tokens, baseSize = null) => {
  if (!tokens || tokens.length === 0) {
    return [new TextRun(" ")];
  }

  const flattened = flattenMarkdownTokens(tokens);
  const runs = [];

  flattened.forEach((token) => {
    if (token.text === undefined || token.text === null) return;

    const runOptions = {
      text: token.text,
    };

    if (baseSize) {
      runOptions.size = baseSize;
    }

    if (token.bold) runOptions.bold = true;
    if (token.italic) runOptions.italics = true;
    if (token.strike) runOptions.strike = true;

    if (token.type === "code") {
      runOptions.font = "Courier New";
    }

    if (token.link) {
      runOptions.color = "0563C1";
      runOptions.underline = {};
    }

    const textRun = new TextRun(runOptions);

    if (token.link) {
      runs.push({
        isHyperlink: true,
        link: token.link,
        run: textRun,
      });
    } else {
      runs.push(textRun);
    }
  });

  return runs.length > 0 ? runs : [new TextRun(" ")];
};

const createParagraphWithHyperlinks = (textRuns, options = {}) => {
  const children = [];

  textRuns.forEach((item) => {
    if (item && item.isHyperlink) {
      children.push(
        new ExternalHyperlink({
          children: [item.run],
          link: item.link,
        })
      );
    } else if (item) {
      children.push(item);
    }
  });

  return new Paragraph({
    children: children.length > 0 ? children : [new TextRun(" ")],
    ...options,
  });
};

const createTableCellChildren = (content, isHeader = false) => {
  const baseSize = isHeader ? 28 : 24;

  if (Array.isArray(content)) {
    return content.map((item) => {
      const parsed = parseTableCellMarkdown(item);

      if (parsed.hasMarkdown && parsed.tokens) {
        const runs = createTextRuns(parsed.tokens, baseSize);
        const children = [];

        children.push(new TextRun({ text: "• ", bold: isHeader, size: baseSize }));

        runs.forEach((run) => {
          if (run.isHyperlink) {
            children.push(
              new ExternalHyperlink({
                children: [run.run],
                link: run.link,
              })
            );
          } else {
            children.push(run);
          }
        });

        return new Paragraph({
          children,
        });
      }

      return new Paragraph({
        children: [
          new TextRun({
            text: `• ${item}`,
            bold: isHeader,
            size: baseSize,
          }),
        ],
      });
    });
  }

  const parsed = parseTableCellMarkdown(content?.toString() || "");

  if (parsed.hasMarkdown && parsed.tokens) {
    const runs = createTextRuns(parsed.tokens, baseSize);
    const children = [];

    runs.forEach((run) => {
      if (run.isHyperlink) {
        children.push(
          new ExternalHyperlink({
            children: [run.run],
            link: run.link,
          })
        );
      } else {
        children.push(run);
      }
    });

    return [
      new Paragraph({
        children: children.length > 0 ? children : [new TextRun(" ")],
      }),
    ];
  }

  return [
    new Paragraph({
      children: [
        new TextRun({
          text: parsed.content,
          bold: isHeader,
          size: baseSize,
        }),
      ],
    }),
  ];
};

const parseMarkdownToDocx = (markdown) => {
  if (!markdown || markdown.trim().length === 0) {
    return [new Paragraph({ text: "" })];
  }

  try {
    const tokens = parseMarkdown(markdown);
    const children = [];

    tokens.forEach((token) => {
      try {
        switch (token.type) {
          case "heading": {
            const headingLevels = {
              1: HeadingLevel.HEADING_2,
              2: HeadingLevel.HEADING_3,
              3: HeadingLevel.HEADING_4,
              4: HeadingLevel.HEADING_5,
              5: HeadingLevel.HEADING_6,
              6: HeadingLevel.HEADING_6,
            };
            if (token.tokens && token.tokens.length > 0) {
              const runs = createTextRuns(token.tokens);
              children.push(
                createParagraphWithHyperlinks(runs, {
                  heading: headingLevels[token.depth],
                  spacing: { before: 240, after: 120 },
                })
              );
            } else if (token.text) {
              children.push(
                new Paragraph({
                  text: token.text,
                  heading: headingLevels[token.depth],
                  spacing: { before: 240, after: 120 },
                })
              );
            }
            break;
          }

          case "paragraph":
            if (token.tokens && token.tokens.length > 0) {
              const runs = createTextRuns(token.tokens);
              children.push(
                createParagraphWithHyperlinks(runs, {
                  spacing: { before: 100, after: 100 },
                })
              );
            }
            break;

          case "list":
            if (token.items && token.items.length > 0) {
              token.items.forEach((item) => {
                if (item.tokens && item.tokens.length > 0) {
                  const firstToken = item.tokens[0];
                  if (firstToken && firstToken.tokens) {
                    const runs = createTextRuns(firstToken.tokens);
                    children.push(
                      createParagraphWithHyperlinks(runs, {
                        bullet: { level: 0 },
                        spacing: { before: 50, after: 50 },
                      })
                    );
                  } else if (firstToken && firstToken.text) {
                    children.push(
                      new Paragraph({
                        text: firstToken.text,
                        bullet: { level: 0 },
                        spacing: { before: 50, after: 50 },
                      })
                    );
                  }
                } else if (item.text) {
                  children.push(
                    new Paragraph({
                      text: item.text,
                      bullet: { level: 0 },
                      spacing: { before: 50, after: 50 },
                    })
                  );
                }
              });
            }
            break;

          case "code":
            if (token.text && token.text.trim()) {
              const lines = token.text.split("\n");
              lines.forEach((line) => {
                children.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: line || " ",
                        font: "Courier New",
                        size: 20,
                      }),
                    ],
                    spacing: { before: 40, after: 40 },
                  })
                );
              });
            }
            break;

          case "blockquote":
            if (token.tokens && token.tokens.length > 0) {
              token.tokens.forEach((subToken) => {
                if (subToken.type === "paragraph" && subToken.tokens) {
                  const runs = createTextRuns(subToken.tokens);
                  children.push(
                    createParagraphWithHyperlinks(runs, {
                      italics: true,
                      indent: { left: 720 },
                      spacing: { before: 100, after: 100 },
                    })
                  );
                }
              });
            } else if (token.text && token.text.trim()) {
              children.push(
                new Paragraph({
                  text: token.text,
                  italics: true,
                  indent: { left: 720 },
                  spacing: { before: 100, after: 100 },
                })
              );
            }
            break;

          case "table": {
            const tableData = parseMarkdownTable(token);
            if (tableData) {
              children.push(
                createMarkdownTable(
                  tableData.headers.map((h) => h.text),
                  tableData.rows.map((r) => r.map((c) => c.text))
                )
              );
              children.push(
                new Paragraph({
                  text: "",
                  spacing: { before: 100, after: 100 },
                })
              );
            }
            break;
          }

          case "space":
            children.push(
              new Paragraph({
                text: "",
                spacing: { before: 100, after: 100 },
              })
            );
            break;

          case "hr":
            children.push(
              new Paragraph({
                text: "",
                border: {
                  bottom: {
                    color: "999999",
                    space: 1,
                    style: BorderStyle.SINGLE,
                    size: 6,
                  },
                },
                spacing: { before: 200, after: 200 },
              })
            );
            break;

          default:
            break;
        }
      } catch (error) {
        console.error("Error parsing markdown token:", error, token);
      }
    });

    return children.length > 0 ? children : [new Paragraph({ text: "" })];
  } catch (error) {
    console.error("Error parsing markdown:", error);
    return [new Paragraph({ text: markdown })];
  }
};

const createMarkdownTable = (headers, rows) => {
  const tableRows = [
    new TableRow({
      children: headers.map(
        (header) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: header,
                    bold: true,
                    size: 24,
                  }),
                ],
              }),
            ],
            shading: {
              fill: "F0F0F0",
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
            },
          })
      ),
    }),
    ...rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                children: createTableCellChildren(cell, false),
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1 },
                  bottom: { style: BorderStyle.SINGLE, size: 1 },
                  left: { style: BorderStyle.SINGLE, size: 1 },
                  right: { style: BorderStyle.SINGLE, size: 1 },
                },
              })
          ),
        })
    ),
  ];

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: tableRows,
  });
};

// ---------- Image section (React/browser) ----------

const addArchitectureDiagram = async (architectureDiagramBase64, children) => {
  if (!architectureDiagramBase64) return;

  children.push(
    new Paragraph({
      text: SECTION_TITLES.ARCHITECTURE_DIAGRAM,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 100 },
    })
  );

  try {
    const processed = processImageData
      ? processImageData(architectureDiagramBase64)
      : architectureDiagramBase64;

    const { mimeType, base64 } = normalizeBase64Image(processed);

    // Extract format from MIME type (e.g., "image/png" -> "png")
    let format = "png";
    if (mimeType) {
      const formatMatch = mimeType.match(/image\/(.+)/);
      if (formatMatch) {
        format = formatMatch[1].toLowerCase();
        // Normalize jpeg to jpg
        if (format === "jpeg") format = "jpg";
      }
    }

    // Use Uint8Array directly; docx supports it and it avoids ArrayBuffer quirks.
    const bytes = base64ToUint8Array(base64);

    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: bytes,
            transformation: {
              width: 400,
              height: 300,
            },
            // Provide filename with extension so docx library can register the correct content type
            type: format,
          }),
        ],
        spacing: { before: 100, after: 200 },
      })
    );
  } catch (err) {
    console.error("Error adding architecture diagram:", err);
    children.push(
      new Paragraph({
        text: "[Architecture diagram could not be displayed]",
        spacing: { before: 100, after: 200 },
      })
    );
  }
};

// ---------- Tables / sections ----------

const createTableRow = (cells, isHeader = false) => {
  return new TableRow({
    children: cells.map(
      (content) =>
        new TableCell({
          children: createTableCellChildren(content, isHeader),
          shading: isHeader ? { fill: "428BCA" } : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          },
        })
    ),
  });
};

const createTable = (columns, data) => {
  const formattedHeaders = columns.map(formatTableHeader);

  const rows = [
    createTableRow(formattedHeaders, true),
    ...data.map((row) => createTableRow(columns.map((col) => row[col]))),
  ];

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows,
  });
};

// ---------- Main document factory ----------

const createThreatModelingDocument = async (
  title,
  description,
  architectureDiagramBase64,
  assumptions,
  assets,
  dataFlowData,
  trustBoundaryData,
  threatSourceData,
  threatCatalogData
) => {
  const spacer = new Paragraph({
    text: "",
    spacing: { before: 100, after: 100 },
  });

  try {
    const mainChildren = [
      new Paragraph({
        text: title || "Document",
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }),
    ];

    if (architectureDiagramBase64) {
      await addArchitectureDiagram(architectureDiagramBase64, mainChildren);
    }

    const sections = getDocumentSections({
      description,
      assumptions,
      assets,
      dataFlowData,
      trustBoundaryData,
      threatSourceData,
      threatCatalogData,
    });

    const mainSections = sections.filter((s) => !s.landscape);
    const landscapeSections = sections.filter((s) => s.landscape);

    mainSections.forEach((section) => {
      if (section.type === "text") {
        mainChildren.push(
          new Paragraph({
            text: section.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
          })
        );

        const markdownParagraphs = parseMarkdownToDocx(section.content);
        if (markdownParagraphs && markdownParagraphs.length > 0) {
          mainChildren.push(...markdownParagraphs);
        }

        mainChildren.push(spacer);
      } else if (section.type === "table") {
        mainChildren.push(
          new Paragraph({
            text: section.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 200 },
          }),
          createTable(section.columns, section.data),
          spacer
        );
      }
    });

    const documentSections = [
      {
        properties: {},
        children: mainChildren,
      },
    ];

    landscapeSections.forEach((section) => {
      documentSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
          },
        },
        children: [
          new Paragraph({
            text: section.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 200 },
          }),
          createTable(section.columns, section.data),
        ],
      });
    });

    const doc = new Document({
      sections: documentSections,
      styles: {
        paragraphStyles: [
          {
            id: "Title",
            name: "Title",
            run: {
              size: 36,
              bold: true,
              color: "000000",
            },
          },
          {
            id: "Heading1",
            name: "Heading 1",
            run: {
              size: 32,
              bold: true,
              color: "2E74B5",
            },
          },
          {
            id: "Hyperlink",
            name: "Hyperlink",
            basedOn: "Normal",
            run: {
              color: "0563C1",
              underline: {
                type: "single",
              },
            },
          },
        ],
      },
    });

    return doc;
  } catch (error) {
    console.error("Document creation failed:", error);
    throw new Error(`Failed to create document: ${error.message}`);
  }
};

export default createThreatModelingDocument;
