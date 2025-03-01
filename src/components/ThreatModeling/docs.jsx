import axios from "axios";
import { Packer } from "docx";

export const downloadDocument = async (doc, title) => {
  try {
    // Generate blob from the document
    const blob = await Packer.toBlob(doc);

    // Create a URL for the blob
    const url = window.URL.createObjectURL(blob);

    // Create a temporary link element
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title}.docx`; // Name of the file to be downloaded

    // Append link to body, click it, and remove it
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download failed:", error);
    throw new Error("Failed to download document");
  }
};

export const downloadPDFDocument = (doc, title) => {
  try {
    doc.save(`${title}.pdf`);
  } catch (error) {
    console.error("Download failed:", error);
    throw new Error("Failed to download PDF document");
  }
};

export const uploadFile = async (base64File, presignedUrl, fileType) => {
  if (!base64File) {
    throw new Error("No file provided.");
  }

  try {
    const binaryData = atob(base64File);
    const arrayBuffer = new ArrayBuffer(binaryData.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < binaryData.length; i++) {
      uint8Array[i] = binaryData.charCodeAt(i);
    }
    const blob = new Blob([uint8Array], { type: fileType });

    await axios.put(presignedUrl, blob, {
      headers: {
        "Content-Type": fileType,
      },
    });

    return { success: true, message: "Upload successful!" };
  } catch (error) {
    console.error("Upload error:", error);
    throw new Error("Upload failed. Please try again.");
  }
};
