/* global FileReader */
import React, { useState } from "react";
import FileInput from "@cloudscape-design/components/file-input";
import FileTokenGroup from "@cloudscape-design/components/file-token-group";
import SpaceBetween from "@cloudscape-design/components/space-between";

// Validation constants
export const ALLOWED_EXTENSIONS = [".png", ".jpeg", ".jpg"];
export const MAX_FILE_SIZE_BYTES = 3.75 * 1024 * 1024; // 3.75 MB
export const MAX_FILE_SIZE_DISPLAY = "3.75 MB";
export const MAX_FILES = 3;

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

export default function StartComponent({ onBase64Change, value, setValue, error, setError }) {
  const [base64Files, setBase64Files] = useState([]);

  const handleFileChange = async ({ detail }) => {
    setError(false);

    // Append new files to existing ones, limit to MAX_FILES
    const newFiles = [...value, ...detail.value];
    const limitedFiles = newFiles.slice(0, MAX_FILES);

    // Validate all files
    const invalidFiles = limitedFiles.filter((file) => validateFile(file).length > 0);
    if (invalidFiles.length > 0) {
      setError(true);
      return;
    }

    setValue(limitedFiles);

    if (limitedFiles.length > 0) {
      const filesPromises = limitedFiles.map((file) => {
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
      }
    } else {
      setBase64Files([]);
      onBase64Change([]);
    }
  };

  const handleDismiss = (itemIndex) => {
    const newFiles = value.filter((_, index) => index !== itemIndex);
    setValue(newFiles);

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
        multiple
        constraintText={`Select 1-${MAX_FILES} architecture diagrams (PNG/JPG). You can select multiple files at once. Max ${MAX_FILE_SIZE_DISPLAY} per file.`}
        errorText={
          error &&
          "You must upload at least one architecture diagram before moving to the next step"
        }
      />
      {value.length > 0 && (
        <FileTokenGroup
          items={value.map((file) => ({
            file,
            dismissLabel: `Remove ${file.name}`,
          }))}
          onDismiss={({ detail }) => handleDismiss(detail.itemIndex)}
          showFileSize
          showFileLastModified
          showFileThumbnail
          i18nStrings={{
            limitShowFewer: "Show fewer files",
            limitShowMore: "Show more files",
            errorIconAriaLabel: "Error",
          }}
        />
      )}
    </SpaceBetween>
  );
}
