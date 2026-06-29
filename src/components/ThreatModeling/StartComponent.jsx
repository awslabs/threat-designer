/* global FileReader */
import React, { useState } from "react";
import FileInput from "@cloudscape-design/components/file-input";
import FileTokenGroup from "@cloudscape-design/components/file-token-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Alert from "@cloudscape-design/components/alert";

// Validation constants
export const ALLOWED_EXTENSIONS = [".png", ".jpeg", ".jpg"];
export const MAX_FILE_SIZE_BYTES = 3.75 * 1024 * 1024; // 3.75 MB
export const MAX_FILE_SIZE_DISPLAY = "3.75 MB";
export const MAX_FILES = 3;
// One required primary diagram + up to MAX_AIDING_FILES optional aiding diagrams.
export const MAX_AIDING_FILES = MAX_FILES - 1;

/**
 * Validates a file for format and size constraints.
 * @param {File} file - The file object to validate
 * @returns {string[]} Array of error strings
 */
export function validateFile(file) {
  const errors = [];

  const fileName = file.name || "";
  const lastDotIndex = fileName.lastIndexOf(".");
  const extension = lastDotIndex !== -1 ? fileName.slice(lastDotIndex).toLowerCase() : "";

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    errors.push(`File format not supported. Accepted formats: PNG, JPEG`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(`File exceeds maximum size of ${MAX_FILE_SIZE_DISPLAY}`);
  }

  return errors;
}

export default function StartComponent({
  onBase64Change,
  value,
  setValue,
  error,
  setError,
  maxFiles,
  buttonText,
  constraintText,
  requiredErrorText = "You must upload at least one architecture diagram before moving to the next step",
}) {
  const [base64Files, setBase64Files] = useState([]);
  const [isReading, setIsReading] = useState(false);
  const [validationWarning, setValidationWarning] = useState("");

  const fileLimit = maxFiles || MAX_FILES;

  const handleFileChange = async ({ detail }) => {
    setError(false);
    setValidationWarning("");

    // Determine how many slots are available
    const availableSlots = fileLimit - value.length;
    if (availableSlots <= 0) {
      setValidationWarning(`Maximum of ${fileLimit} diagrams already selected.`);
      return;
    }

    // Separate valid and invalid files from the new selection
    const validFiles = [];
    const invalidReasons = [];

    for (const file of detail.value) {
      const errors = validateFile(file);
      if (errors.length > 0) {
        invalidReasons.push(`${file.name}: ${errors.join(", ")}`);
      } else {
        validFiles.push(file);
      }
    }

    // Notify user about rejected files
    if (invalidReasons.length > 0) {
      setValidationWarning(`Rejected: ${invalidReasons.join("; ")}`);
    }

    // Cap valid files to available slots
    const filesToAdd = validFiles.slice(0, availableSlots);
    if (validFiles.length > availableSlots) {
      const dropped = validFiles.length - availableSlots;
      const msg = `${dropped} valid file(s) dropped (max ${fileLimit} total).`;
      setValidationWarning((prev) => (prev ? `${prev} ${msg}` : msg));
    }

    if (filesToAdd.length === 0) {
      if (invalidReasons.length > 0) {
        setError(true);
      }
      return;
    }

    const updatedFiles = [...value, ...filesToAdd];
    setValue(updatedFiles);
    setIsReading(true);

    // Read ALL current files (including previously added) to keep base64Files in sync
    const filesPromises = updatedFiles.map((file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
          const base64WithPrefix = e.target.result;
          const base64Value = base64WithPrefix.split(",")[1];
          resolve({
            type: file.type,
            value: base64Value,
            name: file.name,
          });
        };

        reader.onerror = (fileError) => {
          console.error("Error reading file:", fileError);
          reject(fileError);
        };

        reader.readAsDataURL(file);
      });
    });

    try {
      const filesData = await Promise.all(filesPromises);
      setBase64Files(filesData);
      onBase64Change(filesData);
    } catch (fileError) {
      console.error("Error processing files:", fileError);
      setBase64Files([]);
      onBase64Change([]);
    } finally {
      setIsReading(false);
    }
  };

  const handleDismiss = (itemIndex) => {
    // Prevent dismiss while files are being read to avoid index desync
    if (isReading) return;

    const newFiles = value.filter((_, index) => index !== itemIndex);
    setValue(newFiles);
    setValidationWarning("");

    if (newFiles.length > 0) {
      const filesData = base64Files.filter((_, index) => index !== itemIndex);
      setBase64Files(filesData);
      onBase64Change(filesData);
    } else {
      setBase64Files([]);
      onBase64Change([]);
    }
  };

  return (
    <SpaceBetween size="s">
      <FileInput
        accept=".png, .jpeg, .jpg"
        onChange={handleFileChange}
        value={[]}
        multiple={fileLimit > 1}
        disabled={isReading}
        constraintText={
          constraintText ||
          `Select 1-${fileLimit} architecture diagrams (PNG/JPG).${fileLimit > 1 ? " You can select multiple files at once." : ""} Max ${MAX_FILE_SIZE_DISPLAY} per file.`
        }
        errorText={error && requiredErrorText}
      >
        {buttonText || (fileLimit > 1 ? "Choose files" : "Choose file")}
      </FileInput>
      {validationWarning && (
        <Alert type="warning" dismissible onDismiss={() => setValidationWarning("")}>
          {validationWarning}
        </Alert>
      )}
      {value.length > 0 && (
        <FileTokenGroup
          items={value.map((file) => ({ file }))}
          onDismiss={({ detail }) => handleDismiss(detail.fileIndex)}
          showFileSize
          showFileLastModified
          showFileThumbnail
          readOnly={isReading}
          i18nStrings={{
            removeFileAriaLabel: (fileIndex) => `Remove file ${fileIndex + 1}`,
            limitShowFewer: "Show fewer files",
            limitShowMore: "Show more files",
            errorIconAriaLabel: "Error",
          }}
        />
      )}
    </SpaceBetween>
  );
}
