import React, { useState, useEffect } from "react";
import "./ThreatModeling.css";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import { ThreatTableComponent } from "./ThreatDesignerTable";
import { ThreatComponent } from "./ThreatCatalog";
import { ModalComponent } from "./ModalForm";
import { Button } from "@cloudscape-design/components";
import Textarea from "@cloudscape-design/components/textarea";
import ButtonGroup from "@cloudscape-design/components/button-group";

const arrayToObjects = (key, stringArray) => {
  return stringArray.map((value) => ({ [key]: value }));
};

export default function ThreatModelingOutput({
  title,
  description,
  assumptions,
  architectureDiagramBase64,
  dataFlowData,
  trustBoundaryData,
  threatSourceData,
  threatCatalogData,
  assets,
  updateTM,
}) {
  const [openModal, setOpenModal] = useState(false);
  const handleModal = () => {
    setOpenModal(true);
  };
  const [value, setValue] = useState("");
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    setValue(description);
  }, []);

  return (
    <div style={{ maxWidth: "100%", height: "auto", paddingLeft: 0 }}>
      <SpaceBetween size="xl">
        <section>
          {architectureDiagramBase64 && (
            <img
              src={`data:${architectureDiagramBase64?.type};base64,${architectureDiagramBase64?.value}`}
              alt="Architecture Diagram"
              style={{
                maxWidth: "800px",
                maxHeight: "800px",
                objectFit: "contain",
              }}
            />
          )}
        </section>
        <div>
          <SpaceBetween direction="horizontal" size="m">
            <Header>Description</Header>
            <ButtonGroup
              onItemClick={({ detail }) => {
                if (detail.id === "edit") {
                  setEditMode(true);
                }
                if (detail.id === "confirm") {
                  setEditMode(false);
                  updateTM("description", undefined, value);
                }
                if (detail.id === "cancel") {
                  setEditMode(false);
                  setValue(description);
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
          <Textarea
            placeholder="Description"
            rows={4}
            value={value}
            readOnly={!editMode}
            onChange={({ detail }) => setValue(detail.value)}
          />
        </div>
        <div style={{ height: "25px" }}></div>
        <ThreatTableComponent
          headers={["Assumption"]}
          data={arrayToObjects("assumption", assumptions)}
          title="Assumptions"
          updateData={updateTM}
          type={"assumptions"}
          emptyMsg="No assumptions"
        />
        <ThreatTableComponent
          headers={["Type", "Name", "Description"]}
          data={assets}
          title="Assets"
          updateData={updateTM}
          type={"assets"}
        />
        <ThreatTableComponent
          headers={["Flow_description", "Source_entity", "Target_entity"]}
          data={dataFlowData}
          title="Data Flow"
          type={"data_flows"}
          updateData={updateTM}
        />
        <ThreatTableComponent
          headers={["Purpose", "Source_entity", "Target_entity"]}
          data={trustBoundaryData}
          title="Trust Boundary"
          type={"trust_boundaries"}
          updateData={updateTM}
        />
        <ThreatTableComponent
          headers={["Category", "Description", "Example"]}
          data={threatSourceData}
          title="Threat Source"
          type={"threat_sources"}
          updateData={updateTM}
        />
        <div style={{ height: "25px" }}></div>
        <SpaceBetween size="m">
          <SpaceBetween direction="horizontal" size="xs">
            <Header counter={`(${threatCatalogData.length})`} variant="h2">
              Threat Catalog
            </Header>
            <Button variant="link" onClick={handleModal}>
              Add Threat
            </Button>
          </SpaceBetween>
          {threatCatalogData.map((item, index) => (
            <ThreatComponent
              key={index}
              index={index}
              data={item}
              type={"threats"}
              updateData={updateTM}
              headers={[
                "name",
                "description",
                "likelihood",
                "stride_category",
                "impact",
                "target",
                "mitigations",
              ]}
            />
          ))}
        </SpaceBetween>
      </SpaceBetween>
      <ModalComponent
        headers={[
          "name",
          "description",
          "likelihood",
          "stride_category",
          "impact",
          "target",
          "mitigations",
        ]}
        data={[]}
        visible={openModal}
        setVisible={setOpenModal}
        index={-1}
        updateData={updateTM}
        action={"add"}
        type={"threats"}
      />
    </div>
  );
}
