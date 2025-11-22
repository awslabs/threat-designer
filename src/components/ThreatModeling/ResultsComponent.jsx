import React, { useState, useEffect, memo } from "react";
import "./ThreatModeling.css";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Badge from "@cloudscape-design/components/badge";
import { ThreatTableComponent } from "./ThreatDesignerTable";
import VirtualizedThreatList from "./VirtualizedThreatList";
import LazySection from "./LazySection";
import { ModalComponent } from "./ModalForm";
import { Button } from "@cloudscape-design/components";
import { useParams } from "react-router";
import DescriptionSection from "./DescriptionSection";
import { useSplitPanel } from "../../SplitPanelContext";
import AttackTreeViewer from "./AttackTreeViewer";
import { useSplitPanel } from "../../SplitPanelContext";
import AttackTreeViewer from "./AttackTreeViewer";

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
  isReadOnly = false,
}) {
  const [openModal, setOpenModal] = useState(false);
  const { id = null } = useParams();
  const { handleHelpButtonClick } = useSplitPanel();
  const { handleHelpButtonClick } = useSplitPanel();

  const handleModal = () => {
    setOpenModal(true);
  };

  const handleOpenAttackTree = (threatId, threatName) => {
    // Find the threat data to get description
    // Note: attack_tree_id is no longer stored on threat objects
    // It will be computed from threatModelId and threatName when needed
    const threat = threatCatalogData.find((t) => t.id === threatId || t.name === threatName);
    const threatDescription = threat?.description || "";
    // Pass null for attackTreeId - viewer will check cache or compute as needed
    const attackTreeId = null;

    const attackTreeContent = (
      <AttackTreeViewer
        key={`attack-tree-${id}-${threatName}`}
        threatModelId={id}
        threatName={threatName}
        threatDescription={threatDescription}
        attackTreeId={attackTreeId}
        isReadOnly={isReadOnly}
        onClose={() => handleHelpButtonClick(null, null)}
      />
    );

    // Open in side drawer with Beta badge
    const headerWithBadge = (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span>Attack Tree: {threatName}</span>
      </div>
    );
    // Pass isAttackTree flag to ensure 70% width
    handleHelpButtonClick(headerWithBadge, attackTreeContent, null, { isAttackTree: true });
  };

  useEffect(() => {
    refreshTrail(id);
  }, [id]);

  return (
    <div style={{ maxWidth: "100%", height: "auto", paddingLeft: 0 }}>
      <SpaceBetween size="xl">
        <LazySection estimatedHeight={600}>
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
        </LazySection>
        <LazySection estimatedHeight={600}>
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
        </LazySection>
        <div style={{ height: "25px" }}></div>
        <LazySection estimatedHeight={200}>
          <DescriptionSection
            description={description}
            updateTM={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Assumption"]}
            data={arrayToObjects("assumption", assumptions)}
            title="Assumptions"
            updateData={updateTM}
            type={"assumptions"}
            emptyMsg="No assumptions"
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Type", "Name", "Description"]}
            data={assets}
            title="Assets"
            updateData={updateTM}
            type={"assets"}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Flow_description", "Source_entity", "Target_entity"]}
            data={dataFlowData}
            title="Flows"
            type={"data_flows"}
            updateData={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Purpose", "Source_entity", "Target_entity"]}
            data={trustBoundaryData}
            title="Trust Boundary"
            type={"trust_boundaries"}
            updateData={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Category", "Description", "Example"]}
            data={threatSourceData}
            title="Threat Source"
            type={"threat_sources"}
            updateData={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={200}>
          <DescriptionSection
            description={description}
            updateTM={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Assumption"]}
            data={arrayToObjects("assumption", assumptions)}
            title="Assumptions"
            updateData={updateTM}
            type={"assumptions"}
            emptyMsg="No assumptions"
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Type", "Name", "Description"]}
            data={assets}
            title="Assets"
            updateData={updateTM}
            type={"assets"}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Flow_description", "Source_entity", "Target_entity"]}
            data={dataFlowData}
            title="Flows"
            type={"data_flows"}
            updateData={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Purpose", "Source_entity", "Target_entity"]}
            data={trustBoundaryData}
            title="Trust Boundary"
            type={"trust_boundaries"}
            updateData={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <LazySection estimatedHeight={300}>
          <ThreatTableComponent
            headers={["Category", "Description", "Example"]}
            data={threatSourceData}
            title="Threat Source"
            type={"threat_sources"}
            updateData={updateTM}
            isReadOnly={isReadOnly}
          />
        </LazySection>
        <div style={{ height: "25px" }}></div>
        <SpaceBetween size="m">
          <SpaceBetween direction="horizontal" size="xl">
            <Header counter={`(${threatCatalogData.length})`} variant="h2">
              Threat Catalog
            </Header>
            <Button onClick={handleModal}>Add Threat</Button>
          </SpaceBetween>
          <VirtualizedThreatList
            threatCatalogData={threatCatalogData}
            updateTM={updateTM}
            onOpenAttackTree={handleOpenAttackTree}
            isReadOnly={isReadOnly}
          />
          <VirtualizedThreatList
            threatCatalogData={threatCatalogData}
            updateTM={updateTM}
            onOpenAttackTree={handleOpenAttackTree}
            isReadOnly={isReadOnly}
          />
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
