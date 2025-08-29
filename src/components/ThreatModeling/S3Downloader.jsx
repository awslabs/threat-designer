import React, { useState, useEffect, useMemo } from "react";
import { getDownloadUrl } from "../../services/ThreatDesigner/stats";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { Spinner } from "@cloudscape-design/components";

const imageCache = new Map();

const useImageLoader = (fileName) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
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

    return () => {
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
