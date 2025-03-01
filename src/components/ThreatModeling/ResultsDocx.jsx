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
  ImageRun,
} from "docx";

const WORD_DOCX_WIDTH = 500; // Define a max width for Word document images

const processBase64Image = async (base64String) => {
  try {
    // Validate and clean the base64 string
    if (!base64String) {
      throw new Error("Empty base64 string");
    }

    // Handle both formats: with and without data URI prefix
    let base64Data = base64String;
    if (base64String.includes("base64,")) {
      base64Data = base64String.split("base64,")[1];
    }

    // Clean the base64 string
    base64Data = base64Data.trim().replace(/\s/g, "");

    // Validate base64 characters
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error("Invalid base64 characters");
    }

    try {
      // Convert base64 to array buffer
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = bytes.buffer;

      // Create temporary image to get dimensions
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = (e) => reject(new Error("Failed to load image: " + e.message));
        img.src = base64String.includes("data:image")
          ? base64String
          : `data:image/png;base64,${base64Data}`;
      });

      // Calculate dimensions
      const width = Math.min(img.naturalWidth, WORD_DOCX_WIDTH);
      const height = (img.naturalHeight / img.naturalWidth) * width;

      return {
        buffer,
        width,
        height,
      };
    } catch (e) {
      throw new Error(`Base64 conversion failed: ${e.message}`);
    }
  } catch (error) {
    console.error("Error processing base64 image:", error);
    throw error;
  }
};

const createImageParagraph = async (imageData) => {
  try {
    const { buffer, width, height } = await processBase64Image(imageData);

    return new Paragraph({
      children: [
        new ImageRun({
          data: buffer,
          transformation: {
            width,
            height,
          },
        }),
      ],
      spacing: { before: 200, after: 200 },
    });
  } catch (error) {
    console.error("Error creating image paragraph:", error);
    throw error;
  }
};

// Update the handleArchitectureDiagram function
const handleArchitectureDiagram = async (architectureDiagramBase64) => {
  if (!architectureDiagramBase64) return null;

  try {
    let imageData = architectureDiagramBase64;

    // Handle object format
    if (typeof architectureDiagramBase64 === "object" && architectureDiagramBase64?.value) {
      const type = architectureDiagramBase64.type || "image/png";
      imageData = `data:${type};base64,${architectureDiagramBase64.value}`;
    }

    // Validate image data
    if (typeof imageData !== "string") {
      throw new Error("Invalid image data format");
    }

    // Create image paragraph
    const imageParagraph = await createImageParagraph(imageData);

    return [
      new Paragraph({
        text: "Architecture Diagram",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 },
      }),
      imageParagraph,
    ];
  } catch (error) {
    console.error("Error handling architecture diagram:", error);
    return [
      new Paragraph({
        text: "Architecture Diagram (Image could not be inserted)",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 },
      }),
      new Paragraph({
        text: `Error: ${error.message}`,
        spacing: { before: 100, after: 100 },
      }),
    ];
  }
};

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
  // Helper function to create table rows
  const createTableRow = (cells, isHeader = false) => {
    return new TableRow({
      children: cells.map(
        (text) =>
          new TableCell({
            children: Array.isArray(text)
              ? text.map(
                  (item) =>
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `• ${item}`,
                          bold: isHeader,
                          size: isHeader ? 28 : 24,
                        }),
                      ],
                    })
                )
              : [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: text?.toString() || "",
                        bold: isHeader,
                        size: isHeader ? 28 : 24,
                      }),
                    ],
                  }),
                ],
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
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

  const createTable = (headers, data) => {
    const formattedHeaders = headers.map((header) =>
      header
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    );

    const rows = [
      createTableRow(formattedHeaders, true),
      ...data.map((row) =>
        createTableRow(
          headers.map((header) => (Array.isArray(row[header]) ? row[header] : row[header]))
        )
      ),
    ];

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      rows,
      margins: {
        top: 0,
        bottom: 0,
        right: 0,
        left: 0,
      },
    });
  };

  const spacer = new Paragraph({
    text: "",
    spacing: { before: 100, after: 100 },
  });
  try {
    const children = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }),
    ];
    // // Handle architecture diagram
    // const diagramSection = await handleArchitectureDiagram(architectureDiagramBase64);
    // if (diagramSection) {
    //   children.push(...diagramSection);
    // }

    // Description
    if (description?.length > 0) {
      children.push(
        new Paragraph({
          text: "Description",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          text: description,
          spacing: { before: 100, after: 200 },
        })
      );
    }

    // Assumptions section
    if (assumptions?.length > 0) {
      children.push(
        new Paragraph({
          text: "Assumptions",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        createTable(["assumption"], assumptions),
        spacer
      );
    }

    // Assets Section
    if (assets?.length > 0) {
      children.push(
        new Paragraph({
          text: "Assets",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        createTable(["type", "name", "description"], assets),
        spacer
      );
    }

    // Data Flow Section
    if (dataFlowData?.length > 0) {
      children.push(
        new Paragraph({
          text: "Data Flow",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        createTable(["flow_description", "source_entity", "target_entity"], dataFlowData),
        spacer
      );
    }

    // Trust Boundary Section
    if (trustBoundaryData?.length > 0) {
      children.push(
        new Paragraph({
          text: "Trust Boundary",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        createTable(["purpose", "source_entity", "target_entity"], trustBoundaryData),
        spacer
      );
    }

    // Threat Source Section
    if (threatSourceData?.length > 0) {
      children.push(
        new Paragraph({
          text: "Threat Source",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        createTable(["category", "description", "example"], threatSourceData),
        spacer
      );
    }

    // Threat Catalog Section
    if (threatCatalogData?.length > 0) {
      children.push(
        new Paragraph({
          text: "Threat Catalog",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 },
        }),
        createTable(
          [
            "name",
            "stride_category",
            "description",
            "target",
            "impact",
            "likelihood",
            "mitigations",
          ],
          threatCatalogData
        )
      );
    }

    const doc = new Document({
      sections: [
        {
          children: children,
        },
      ],
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
        ],
      },
    });

    return doc;
  } catch (error) {
    console.error("Document creation failed:", error);
    throw new Error("Failed to create document. Please try again.");
  }
};

export default createThreatModelingDocument;
