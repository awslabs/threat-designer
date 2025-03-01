import React, { useState } from "react";
import FileUpload from "@cloudscape-design/components/file-upload";

export default function StartComponent({ onBase64Change, value, setValue, error, setError }) {
  const [base64, setBase64] = useState(null);

  const handleFileChange = async ({ detail }) => {
    setError(false);
    setValue(detail.value);

    if (detail.value.length > 0) {
      const file = detail.value[0];
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
      setBase64(null);
      onBase64Change(null);
    }
  };

  return (
    <FileUpload
      accept=".png, .jpeg"
      onChange={handleFileChange}
      value={value}
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
      errorText={error && "You must upload an architecture diagram before moving to the next step"}
    />
  );
}
