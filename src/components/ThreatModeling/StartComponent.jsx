import React, { useState } from "react";
import FileUpload from "@cloudscape-design/components/file-upload";

// Validation constants
export const ALLOWED_EXTENSIONS = [".png", ".jpeg", ".jpg"];
export const MAX_FILE_SIZE_BYTES = 3.75 * 1024 * 1024; // 3.75 MB
export const MAX_FILE_SIZE_DISPLAY = "3.75 MB";

/**
 * Validates a file for format and size constraints.
 * @param {File} file - The file object to validate
 * @returns {string[]} Array of error strings for Cloudscape fileErrors format
 */
export function validateFile(file) {
  const errors = [];

  // Check file extension
  const fileName = file.name || "";
  const lastDotIndex = fileName.lastIndexOf(".");
  const extension = lastDotIndex !== -1 ? fileName.slice(lastDotIndex).toLowerCase() : "";

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    errors.push(`File format not supported. Accepted formats: PNG, JPEG`);
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(`File exceeds maximum size of ${MAX_FILE_SIZE_DISPLAY}`);
  }

  return errors;
}

export default function StartComponent({ onBase64Change, value, setValue, error, setError }) {
  const [base64, setBase64] = useState(null);
  const [fileErrors, setFileErrors] = useState([]);

  const handleFileChange = async ({ detail }) => {
    setValue(detail.value);

    if (detail.value.length > 0) {
      const file = detail.value[0];

      // Validate the file and update errors state
      const validationErrors = validateFile(file);

      // Only set fileErrors if there are actual errors, otherwise clear them
      // fileErrors format: array of arrays, one per file
      if (validationErrors.length > 0) {
        setFileErrors([validationErrors]);
        setError(true);
        // Don't process the file if validation fails
        setBase64(null);
        onBase64Change(null);
        return;
      }

      // Clear errors and error state when file is valid
      setFileErrors([]);
      setError(false);

      const reader = new FileReader();

      reader.onload = (e) => {
        const base64WithPrefix = e.target.result;
        const base64Value = base64WithPrefix.split(",")[1];
        setBase64({
          type: detail.value[0].type,
          value: base64Value,
          name: detail.value[0].name,
        });
        onBase64Change({
          type: detail.value[0].type,
          value: base64Value,
          name: detail.value[0].name,
        });
      };

      reader.onerror = (error) => {
        console.error("Error reading file:", error);
      };

      reader.readAsDataURL(file);
    } else {
      // Clear errors when file is removed
      setFileErrors([]);
      setError(false);
      setBase64(null);
      onBase64Change(null);
    }
  };

  return (
    <FileUpload
      accept=".png, .jpeg, .jpg"
      onChange={handleFileChange}
      value={value}
      fileErrors={fileErrors}
      i18nStrings={{
        uploadButtonText: (e) => (e ? "Choose files" : "Choose file"),
        dropzoneText: (e) => (e ? "Drop files to upload" : "Drop file to upload"),
        removeFileAriaLabel: (e) => `Remove file ${e + 1}`,
        limitShowFewer: "Show fewer files",
        limitShowMore: "Show more files",
        errorIconAriaLabel: "Error",
      }}
      showFileLastModified
      showFileSize
      showFileThumbnail
      tokenLimit={1}
      errorText={
        error &&
        fileErrors.length === 0 &&
        "You must upload an architecture diagram before moving to the next step"
      }
    />
  );
}
