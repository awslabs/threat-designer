import React, { useState, memo } from "react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import { Container } from "@cloudscape-design/components";
import Textarea from "@cloudscape-design/components/textarea";
import ButtonGroup from "@cloudscape-design/components/button-group";
import TextContent from "../HelpPanel/IndividualContent/TextContent";
import { colorTextEmpty } from "@cloudscape-design/design-tokens";

const DescriptionSection = memo(({ description, updateTM }) => {
  const [value, setValue] = useState(description);
  const [editMode, setEditMode] = useState(false);

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleConfirm = () => {
    setEditMode(false);
    updateTM("description", undefined, value);
  };

  const handleCancel = () => {
    setEditMode(false);
    setValue(description);
  };

  return (
    <div>
      <SpaceBetween direction="horizontal" size="m">
        <Header>Description</Header>
        <ButtonGroup
          onItemClick={({ detail }) => {
            if (detail.id === "edit") {
              handleEdit();
            }
            if (detail.id === "confirm") {
              handleConfirm();
            }
            if (detail.id === "cancel") {
              handleCancel();
            }
          }}
          ariaLabel="actions"
          items={
            editMode
              ? [
                  {
                    type: "icon-button",
                    id: "confirm",
                    iconName: "check",
                    text: "Confirm",
                  },
                  {
                    type: "icon-button",
                    id: "cancel",
                    iconName: "close",
                    text: "Cancel",
                  },
                ]
              : [
                  {
                    type: "icon-button",
                    id: "edit",
                    iconName: "edit",
                    text: "Edit",
                  },
                ]
          }
          variant="icon"
        />
      </SpaceBetween>
      {!editMode ? (
        <Container disableHeaderPaddings disableContentPaddings>
          <div style={{ marginLeft: "24px", marginRight: "24px" }}>
            {value ? (
              <TextContent content={value} />
            ) : (
              <div
                style={{
                  height: "70px",
                  display: "flex",
                  alignItems: "center",
                  color: `${colorTextEmpty}`,
                  justifyContent: "center",
                }}
              >
                <b>No description provided</b>
              </div>
            )}
          </div>
        </Container>
      ) : (
        <Textarea
          placeholder="Description"
          rows={4}
          value={value}
          readOnly={!editMode}
          onChange={({ detail }) => setValue(detail.value)}
        />
      )}
    </div>
  );
});

export default DescriptionSection;
