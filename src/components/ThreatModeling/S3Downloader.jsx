import React, { useState, useEffect, useMemo } from "react";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { Spinner } from "@cloudscape-design/components";
import axios from "axios";
import {
  getCachedImageBlob,
  setCachedImageBlob,
} from "../../services/ThreatDesigner/presignedUrlCache";

const useImageLoader = (threatModelId, presignedUrl) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      // Check cache first
      const cachedBlob = getCachedImageBlob(threatModelId);
      if (cachedBlob) {
        setImageUrl(cachedBlob);
        setLoading(false);
        return;
      }

      // If no presigned URL is provided, don't load anything
      if (!presignedUrl) {
        setLoading(true);
        return;
      }

      setLoading(true);
      try {
        const fileResponse = await axios.get(presignedUrl, {
          responseType: "blob",
        });
        const blobData = fileResponse.data;

        const objectUrl = URL.createObjectURL(blobData);
        setCachedImageBlob(threatModelId, objectUrl);
        setImageUrl(objectUrl);
        setLoading(false);
      } catch (error) {
        setLoading(false);
        setImageUrl("FAILED");
        console.error("Error downloading image:", error);
      }
    };

    loadImage();

    return () => {
      // Don't revoke URLs that are in the cache
      const cachedBlob = getCachedImageBlob(threatModelId);
      if (imageUrl && !cachedBlob) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [threatModelId, presignedUrl]);

  return { imageUrl, loading };
};

export const S3DownloaderComponent = React.memo(({ threatModelId, presignedUrl }) => {
  const { imageUrl, loading } = useImageLoader(threatModelId, presignedUrl);

  const content = useMemo(() => {
    if (loading || imageUrl === "FAILED") {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 250,
            width: "100%",
            borderRight: `1px solid #EEEEEE"`,
            background: "#EEEEEE",
          }}
        >
          {loading && <Spinner size="large" />}
          {imageUrl === "FAILED" && (
            <StatusIndicator type="error">Failed to load architecture diagram</StatusIndicator>
          )}
        </div>
      );
    }

    return (
      <div>
        {imageUrl && (
          <div
            style={{
              display: "inline-block",
              borderRight: `1px solid #EEEEEE"`,
              background: "#EEEEEE",
            }}
          >
            <img
              style={{
                width: "100%",
                height: 250,
                objectFit: "contain",
                objectPosition: "center",
                mixBlendMode: "multiply",
              }}
              src={imageUrl}
              alt="Downloaded S3 Image"
            />
          </div>
        )}
      </div>
    );
  }, [loading, imageUrl]);

  return content;
});
