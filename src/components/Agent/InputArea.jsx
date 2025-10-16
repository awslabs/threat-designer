import React, { useEffect, useContext, useCallback, useRef, useState } from "react";
import { Bulb } from "./CustomStyles";
import PromptInput from "@cloudscape-design/components/prompt-input";
import { SpaceBetween } from "@cloudscape-design/components";
import { CustomDropdownButton } from "./CustomButton";
import { WebSocketContext } from "./WebSocketContext";
import FileInput from "@cloudscape-design/components/file-input";
import FileTokenGroup from "@cloudscape-design/components/file-token-group";
import { v4 as uuidv4 } from "uuid";

const InputArea = ({
  inputValue,
  handleInputChange,
  handleSendMessage,
  streaming,
  handleReasoningSelect,
  fileValue,
  setFileValue,
  sessionEstablished,
}) => {
  const { sendMessage, subscribe } = useContext(WebSocketContext);
  const fileIdMapRef = useRef(new Map());
  const presignedCallbacksRef = useRef(new Map());
  const [disabled, setDisabled] = useState(true);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target.result.split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Register a callback for when a presigned URL is received
  const registerPresignedUrlCallback = useCallback((fileId, callback) => {
    presignedCallbacksRef.current.set(fileId, callback);
  }, []);

  // Extract S3 key from presigned URL
  const extractS3KeyFromUrl = useCallback((url) => {
    try {
      const parsedUrl = new URL(url);
      // The path part of the URL without the leading slash is typically the S3 key
      return parsedUrl.pathname.substring(1);
    } catch (error) {
      console.error("Failed to extract S3 key from URL:", error);
      return null;
    }
  }, []);

  // Upload file to presigned URL
  const uploadFile = useCallback(async (base64Content, presignedUrl, contentType) => {
    // Convert base64 to binary
    const binaryData = atob(base64Content);
    const byteArray = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      byteArray[i] = binaryData.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: contentType });

    // Upload to presigned URL
    const response = await fetch(presignedUrl, {
      method: "PUT",
      body: blob,
      headers: {
        "Content-Type": contentType,
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    return response;
  }, []);

  // Request a presigned URL for a file
  const requestPresignedUrl = useCallback(
    (fileId, fileType) => {
      sendMessage({
        action: "agent",
        type: "generate_presigned",
        object_id: fileId,
        contentType: fileType,
      });
    },
    [sendMessage]
  );

  // Subscribe to WebSocket messages for presigned URL responses
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === "presigned_url" && message.object_id) {
        const callback = presignedCallbacksRef.current.get(message.object_id);
        if (callback) {
          callback(message);
          // Optional: Remove the callback after it's used
          presignedCallbacksRef.current.delete(message.object_id);
        }
      }
    });

    return () => unsubscribe();
  }, [subscribe]);

  useEffect(() => {
    const processNewFiles = async () => {
      // Find files that don't have an ID yet
      const newFiles = fileValue.filter((fileItem) => {
        // Check if this file already has an ID in our map
        return !fileIdMapRef.current.has(fileItem.file);
      });

      if (newFiles.length === 0) return;

      // Process each new file
      for (const fileItem of newFiles) {
        const file = fileItem.file;
        const fileId = uuidv4();

        // Store the ID in our map
        fileIdMapRef.current.set(file, fileId);

        // Update file status to loading
        setFileValue((prev) =>
          prev.map((item) => (item.file === file ? { ...item, loading: true } : item))
        );

        try {
          // Convert file to base64
          const base64Content = await fileToBase64(file);

          // Register callback for this file ID
          registerPresignedUrlCallback(fileId, async (urlData) => {
            try {
              // Extract S3 key from the presigned URL
              const s3Key = extractS3KeyFromUrl(urlData.url);
              // Upload the file
              await uploadFile(base64Content, urlData.url, file.type);

              // Update file status to success and store S3 key
              setFileValue((prev) =>
                prev.map((item) =>
                  item.file === file
                    ? {
                        ...item,
                        loading: false,
                        successText: "Upload successful",
                        success: true,
                        s3Key: s3Key, // Store the S3 key
                      }
                    : item
                )
              );
            } catch (error) {
              console.error(`Upload failed for ${file.name}:`, error);

              // Update file status to error
              setFileValue((prev) =>
                prev.map((item) =>
                  item.file === file
                    ? {
                        ...item,
                        loading: false,
                        errorText: error.message || "Upload failed",
                      }
                    : item
                )
              );
            }
          });

          // Request the presigned URL
          requestPresignedUrl(fileId, file.type);
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);

          // Update file status to error
          setFileValue((prev) =>
            prev.map((item) =>
              item.file === file
                ? {
                    ...item,
                    loading: false,
                    errorText: error.message || "File processing failed",
                  }
                : item
            )
          );
        }
      }
    };

    processNewFiles();
  }, [
    fileValue,
    registerPresignedUrlCallback,
    requestPresignedUrl,
    extractS3KeyFromUrl,
    uploadFile,
  ]);

  useEffect(() => {
    if (sessionEstablished) {
      if (streaming) {
        setDisabled(true);
      } else {
        setDisabled(false);
      }
    } else {
      setDisabled(true);
    }
  }, [sessionEstablished, streaming]);

  return (
    <PromptInput
      value={inputValue}
      minRows={3}
      maxRows={10}
      actionButtonAriaLabel="Send message"
      actionButtonIconName="send"
      disableActionButton={inputValue.length === 0}
      onChange={handleInputChange}
      onSubmit={handleSendMessage}
      onAction={handleSendMessage}
      placeholder="Type your message..."
      expandToViewport={false}
      disabled={sessionEstablished ? (streaming ? true : false) : true}
      secondaryActions={
        <SpaceBetween direction="horizontal">
          <CustomDropdownButton
            icon={Bulb}
            onSelect={handleReasoningSelect}
            tooltip={"Reasoning Effort"}
            disabled={streaming}
          />
          <FileInput
            disableActionButton
            variant="icon"
            multiple={true}
            value={fileValue.map((item) => item.file)}
            onChange={({ detail }) => {
              if (detail.value.length > 0) {
                // Create a new array to hold updated file items
                const updatedFileItems = [...fileValue];

                detail.value.forEach((file) => {
                  // Check if a file with the same name already exists
                  const existingFileIndex = updatedFileItems.findIndex(
                    (item) => item.file.name === file.name
                  );

                  if (existingFileIndex !== -1) {
                    // Replace the existing file
                    updatedFileItems[existingFileIndex] = { file };
                  } else {
                    // Add as a new file
                    updatedFileItems.push({ file });
                  }
                });

                setFileValue(updatedFileItems);
              }
            }}
          />
        </SpaceBetween>
      }
      secondaryContent={
        fileValue.length > 0 && (
          <FileTokenGroup
            onDismiss={({ detail }) => {
              const fileToRemove = fileValue[detail.fileIndex];

              // Remove from fileValue
              setFileValue((value) => value.filter((_, index) => detail.fileIndex !== index));

              // Remove from uploadedFiles if it was uploaded
              const fileId = fileIdMapRef.current.get(fileToRemove.file);
              if (fileId) {
                fileIdMapRef.current.delete(fileToRemove.file);
              }
            }}
            items={fileValue.map((fileItem) => ({
              file: fileItem.file,
              ...(fileItem.loading ? { loading: true } : {}),
              ...(fileItem.errorText ? { errorText: fileItem.errorText } : {}),
              ...(fileItem.warningText ? { warningText: fileItem.warningText } : {}),
              ...(fileItem.successText ? { successText: fileItem.successText } : {}),
              ...(fileItem.s3Key
                ? {
                    description: `S3 Key: ${fileItem.s3Key}`,
                  }
                : {}),
            }))}
            alignment="horizontal"
            i18nStrings={{
              removeFileAriaLabel: (e) => `Remove file ${e + 1}`,
              limitShowFewer: "Show fewer files",
              limitShowMore: "Show more files",
              errorIconAriaLabel: "Error",
              warningIconAriaLabel: "Warning",
            }}
            showFileLastModified
            showFileSize
          />
        )
      }
    />
  );
};

export default InputArea;
