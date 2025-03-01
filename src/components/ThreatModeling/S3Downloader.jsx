import React, { useState, useEffect, useMemo } from "react";
import { getDownloadUrl } from "../../services/ThreatDesigner/stats";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { Spinner } from "@cloudscape-design/components";

// Cache to store downloaded images
const imageCache = new Map();

// Custom hook to handle image loading with caching
const useImageLoader = (fileName) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      // Check if image is already in cache
      if (imageCache.has(fileName)) {
        setImageUrl(imageCache.get(fileName));
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const blobData = await getDownloadUrl(fileName);
        const objectUrl = URL.createObjectURL(blobData);
        imageCache.set(fileName, objectUrl);
        setImageUrl(objectUrl);
        setLoading(false);
      } catch (error) {
        setLoading(false);
        setImageUrl("FAILED");
        console.error("Error downloading image:", error);
      }
    };

    loadImage();

    // Cleanup
    return () => {
      // Don't revoke URL if it's cached
      if (imageUrl && !imageCache.has(fileName)) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [fileName]);

  return { imageUrl, loading };
};

export const S3DownloaderComponent = React.memo(({ fileName }) => {
  const { imageUrl, loading } = useImageLoader(fileName);

  const content = useMemo(() => {
    if (loading || imageUrl === "FAILED") {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 190,
            width: "100%",
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
          <img style={{ width: "100%", height: 190 }} src={imageUrl} alt="Downloaded S3 Image" />
        )}
      </div>
    );
  }, [loading, imageUrl]);

  return content;
});
