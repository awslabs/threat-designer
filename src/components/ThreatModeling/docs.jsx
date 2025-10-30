import axios from "axios";
import { Packer } from "docx";

export const downloadDocument = async (doc, title) => {
  try {
    const blob = await Packer.toBlob(doc);

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${title}.docx`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

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

/**
 * Compress base64 image by reducing quality
 * @param {string} base64 - Base64 encoded image
 * @param {string} mimeType - Image MIME type
 * @param {number} quality - Compression quality (0-1)
 * @returns {Promise<string>} Compressed base64 image
 */
const compressImage = async (base64, mimeType, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Limit max dimensions to reduce size
      const maxWidth = 1920;
      const maxHeight = 1920;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to compressed base64
      const compressedBase64 = canvas.toDataURL(mimeType, quality).split(",")[1];
      resolve(compressedBase64);
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
};

export const uploadFile = async (base64File, presignedUrl, fileType) => {
  if (!base64File) {
    throw new Error("No file provided.");
  }

  try {
    // Check if this is Lightning Mode (presignedUrl starts with "lightning://")
    if (presignedUrl.startsWith("lightning://")) {
      // Extract the key from the URL
      const key = presignedUrl.replace("lightning://upload/", "");

      let dataToStore = base64File;

      // Try to compress image if it's an image type
      if (fileType && fileType.startsWith("image/")) {
        try {
          console.log("Compressing image for Lightning Mode storage...");
          dataToStore = await compressImage(base64File, fileType, 0.7);
          console.log(`Image compressed: ${base64File.length} -> ${dataToStore.length} bytes`);
        } catch (compressionError) {
          console.warn("Image compression failed, using original:", compressionError);
          // Fall back to original if compression fails
        }
      }

      // Try to store in sessionStorage
      try {
        sessionStorage.setItem(
          `tm_uploaded_files_${key}`,
          JSON.stringify({
            data: dataToStore,
            type: fileType,
            timestamp: Date.now(),
          })
        );

        return { success: true, message: "Upload successful!" };
      } catch (storageError) {
        // If quota exceeded, try with more aggressive compression
        if (
          storageError.name === "QuotaExceededError" &&
          fileType &&
          fileType.startsWith("image/")
        ) {
          console.warn("SessionStorage quota exceeded, trying aggressive compression...");
          try {
            const aggressiveCompressed = await compressImage(base64File, fileType, 0.4);
            sessionStorage.setItem(
              `tm_uploaded_files_${key}`,
              JSON.stringify({
                data: aggressiveCompressed,
                type: fileType,
                timestamp: Date.now(),
              })
            );
            console.log("Successfully stored with aggressive compression");
            return { success: true, message: "Upload successful (compressed)!" };
          } catch (retryError) {
            console.error("Failed even with aggressive compression:", retryError);
            // Store a placeholder indicating the image was too large
            sessionStorage.setItem(
              `tm_uploaded_files_${key}`,
              JSON.stringify({
                data: null,
                type: fileType,
                timestamp: Date.now(),
                error: "Image too large for sessionStorage",
              })
            );
            console.warn("Image too large, proceeding without image data");
            return {
              success: true,
              message: "Upload successful (image too large, proceeding without it)",
            };
          }
        }
        throw storageError;
      }
    }

    // Remote Mode: Upload to S3 using presigned URL
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
