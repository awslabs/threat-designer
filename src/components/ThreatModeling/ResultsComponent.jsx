import React, { useState, useEffect, memo } from "react";
import "./ThreatModeling.css";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import { ThreatTableComponent } from "./ThreatDesignerTable";
import { ThreatComponent } from "./ThreatCatalog";
import { ModalComponent } from "./ModalForm";
import { Button } from "@cloudscape-design/components";
import { useParams } from "react-router";
import DescriptionSection from "./DescriptionSection";

const arrayToObjects = (key, stringArray) => {
  return stringArray.map((value) => ({ [key]: value }));
};

const ThreatModelingOutput = memo(function ThreatModelingOutput({
  description,
  assumptions,
  architectureDiagramBase64,
  dataFlowData,
  trustBoundaryData,
  threatSourceData,
  threatCatalogData,
  assets,
  updateTM,
  refreshTrail,
}) {
  const [openModal, setOpenModal] = useState(false);
  const { id = null } = useParams();

  const handleModal = () => {
    setOpenModal(true);
  };

  useEffect(() => {
    refreshTrail(id);
  }, [id]);

  return (
    <div style={{ maxWidth: "100%", height: "auto", paddingLeft: 0 }}>
      <SpaceBetween size="xl">
        <section>
          {architectureDiagramBase64 && (
            <div
              style={{
                display: "inline-block",
                background: "#FAFAF9",
              }}
            >
              <img
                src={`data:${architectureDiagramBase64?.type};base64,${architectureDiagramBase64?.value}`}
                alt="Architecture Diagram"
                style={{
                  maxWidth: "800px",
                  maxHeight: "800px",
                  objectFit: "contain",
                  objectPosition: "center",
                  mixBlendMode: "multiply",
                }}
              />
            </div>
          )}
        </section>

        <DescriptionSection description={description} updateTM={updateTM} />

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
          title="Flows"
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
          <SpaceBetween direction="horizontal" size="xl">
            <Header counter={`(${threatCatalogData.length})`} variant="h2">
              Threat Catalog
            </Header>
            <Button onClick={handleModal}>Add Threat</Button>
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
                "source",
                "vector",
                "prerequisites",
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
          "source",
          "vector",
          "prerequisites",
          "mitigations",
        ]}
        data={[]}
        visible={openModal}
        setVisible={setOpenModal}
        index={-1}
        updateData={updateTM}
        action={"add"}
        type={"threats"}
        hasColumn={true}
        columnConfig={{
          left: ["name", "description", "likelihood", "stride_category", "impact", "target"],
          right: ["source", "vector", "prerequisites", "mitigations"],
        }}
      />
    </div>
  );
});

export default ThreatModelingOutput;
