import React from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";

export const ThreatModelActions = ({
  onSave,
  onDelete,
  onReplay,
  onTrail,
  onDownload,
  isLightningMode,
}) => {
  const handleItemClick = (itemClickDetails) => {
    const itemId = itemClickDetails.detail.id;

    switch (itemId) {
      case "sv":
        onSave();
        break;
      case "rm":
        onDelete();
        break;
      case "re":
        onReplay();
        break;
      case "tr":
        onTrail();
        break;
      case "cp-doc":
        onDownload("docx");
        break;
      case "cp-pdf":
        onDownload("pdf");
        break;
      case "cp-json":
        onDownload("json");
        break;
      default:
        break;
    }
  };

  return (
    <SpaceBetween direction="horizontal" size="xs">
      <ButtonDropdown
        variant="primary"
        expandableGroups
        fullWidth
        onItemClick={handleItemClick}
        items={[
          { text: "Save", id: "sv", disabled: false },
          { text: "Delete", id: "rm", disabled: false },
          { text: "Replay", id: "re", disabled: false },
          // Hide Trail button in Lightning Mode (reasoning trail not supported)
          ...(!isLightningMode ? [{ text: "Trail", id: "tr", disabled: false }] : []),
          {
            text: "Download",
            id: "download",
            items: [
              { text: "PDF", id: "cp-pdf", disabled: false },
              { text: "DOCX", id: "cp-doc", disabled: false },
              { text: "JSON", id: "cp-json", disabled: false },
            ],
          },
        ]}
      >
        Actions
      </ButtonDropdown>
    </SpaceBetween>
  );
};
