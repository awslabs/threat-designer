import { useState, useEffect, memo, useMemo } from "react";
import "./ThreatModeling.css";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import { ThreatTableComponent } from "./ThreatDesignerTable";
import VirtualizedThreatList from "./VirtualizedThreatList";
import LazySection from "./LazySection";
import { ModalComponent } from "./ModalForm";
import { Button } from "@cloudscape-design/components";
import PropertyFilter from "@cloudscape-design/components/property-filter";
import { useParams } from "react-router";
import DescriptionSection from "./DescriptionSection";
import { useSplitPanel } from "../../SplitPanelContext";
import AttackTreeViewer from "./AttackTreeViewer";
import { filterThreats, generateFilterOptions } from "./filterUtils";
import { useAttackTreeMetadata } from "./hooks/useAttackTreeMetadata";

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
  const [query, setQuery] = useState({ tokens: [], operation: "and" });
  const { id = null } = useParams();
  const { handleHelpButtonClick } = useSplitPanel();

  // Fetch and manage attack tree metadata
  // Requirement 2.5: Handle API errors gracefully without blocking UI
  const {
    threatsWithTrees,
    isLoading: treesLoading,
    error: treesError,
    addThreatTree,
    removeThreatTree,
    refresh: refreshAttackTreeMetadata,
  } = useAttackTreeMetadata(id);

  // Log error but don't block UI - filter will simply not be available
  // Requirement 2.5: API errors are handled gracefully
  useEffect(() => {
    if (treesError) {
      console.warn(
        "Failed to load attack tree metadata. Attack tree filter will be unavailable.",
        treesError
      );
    }
  }, [treesError]);

  const handleModal = () => {
    setOpenModal(true);
  };

  // Clean up filter tokens when threat data changes
  // Remove tokens that reference values no longer in the data
  useEffect(() => {
    if (!query.tokens || query.tokens.length === 0) {
      return;
    }

    // Ensure we have valid threat data
    if (!threatCatalogData || !Array.isArray(threatCatalogData)) {
      return;
    }

    const validTokens = query.tokens.filter((token) => {
      // Always keep starred tokens as they're boolean
      if (token.propertyKey === "starred") {
        return true;
      }

      // Requirement 6.1: Remove attack tree filter tokens when metadata is loading
      // This ensures state is flushed on threat model reload
      if (token.propertyKey === "has_attack_tree" && treesLoading) {
        return false;
      }

      // Keep attack tree tokens when not loading
      if (token.propertyKey === "has_attack_tree") {
        return true;
      }

      // Check if the token value still exists in the current data
      const currentOptions = generateFilterOptions(threatCatalogData, token.propertyKey);
      return currentOptions.some((option) => option.value === token.value);
    });

    // Update query if tokens were removed
    if (validTokens.length !== query.tokens.length) {
      setQuery((prevQuery) => ({
        ...prevQuery,
        tokens: validTokens,
      }));
    }
  }, [threatCatalogData, query.tokens, treesLoading]);

  // Define filterable properties configuration
  // Requirement 6.1: Hide attack tree filter when metadata is loading or errored
  const filteringProperties = useMemo(() => {
    const baseProperties = [
      {
        key: "likelihood",
        propertyLabel: "Likelihood",
        groupValuesLabel: "Likelihood values",
        operators: ["=", "!="],
      },
      {
        key: "target",
        propertyLabel: "Target",
        groupValuesLabel: "Target values",
        operators: ["=", "!="],
      },
      {
        key: "source",
        propertyLabel: "Threat Source",
        groupValuesLabel: "Source values",
        operators: ["=", "!="],
      },
      {
        key: "stride_category",
        propertyLabel: "STRIDE Category",
        groupValuesLabel: "STRIDE categories",
        operators: ["=", "!="],
      },
      {
        key: "starred",
        propertyLabel: "Starred",
        groupValuesLabel: "Starred status",
        operators: ["=", "!="],
      },
    ];

    // Only add attack tree filter when metadata has loaded successfully
    // Requirement 6.1: Disable/hide attack tree filter when metadata is loading
    // Requirement 2.5: Hide filter when API errors occur
    if (!treesLoading && !treesError) {
      baseProperties.push({
        key: "has_attack_tree",
        propertyLabel: "Has Attack Tree",
        groupValuesLabel: "Attack Tree Status",
        operators: ["=", "!="],
      });
    }

    return baseProperties;
  }, [treesLoading, treesError]);

  // Generate filter options dynamically from threat data
  const filteringOptions = useMemo(() => {
    // Ensure we have valid threat data
    if (!threatCatalogData || !Array.isArray(threatCatalogData)) {
      return [];
    }

    const options = [];

    filteringProperties.forEach((property) => {
      // Special handling for starred property - provide boolean options
      if (property.key === "starred") {
        options.push(
          { propertyKey: "starred", value: "true" },
          { propertyKey: "starred", value: "false" }
        );
      } else if (property.key === "has_attack_tree") {
        // Only add attack tree options if metadata has loaded successfully
        // Requirement 2.5: Don't show options when there's an error
        if (!treesLoading && !treesError) {
          options.push(
            { propertyKey: "has_attack_tree", value: "true" },
            { propertyKey: "has_attack_tree", value: "false" }
          );
        }
      } else {
        // Generate options from threat data for other properties
        const propertyOptions = generateFilterOptions(threatCatalogData, property.key);
        options.push(...propertyOptions);
      }
    });

    return options;
  }, [threatCatalogData, treesLoading, treesError, filteringProperties]);

  // Filter threats based on query using utility function
  const filteredThreats = useMemo(() => {
    return filterThreats(threatCatalogData, query, threatsWithTrees);
  }, [threatCatalogData, query, threatsWithTrees]);

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
        onAttackTreeCreated={addThreatTree}
        onAttackTreeDeleted={removeThreatTree}
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
    // Refresh attack tree metadata when threat model changes
    if (id) {
      refreshAttackTreeMetadata();
    }
  }, [id, refreshTrail, refreshAttackTreeMetadata]);

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
        <div style={{ height: "25px" }}></div>
        <SpaceBetween size="m">
          <SpaceBetween direction="horizontal" size="s" alignItems="center">
            <Header counter={`(${filteredThreats.length})`} variant="h2">
              Threat Catalog
            </Header>
            <Button onClick={handleModal}>Add Threat</Button>
          </SpaceBetween>
          <PropertyFilter
            query={query}
            onChange={({ detail }) => setQuery(detail)}
            filteringProperties={filteringProperties}
            filteringOptions={filteringOptions}
            filteringPlaceholder="Filter threats"
            filteringAriaLabel="Filter threats"
            i18nStrings={{
              filteringAriaLabel: "Filter threats",
              dismissAriaLabel: "Dismiss",
              filteringPlaceholder: "Filter threats",
              groupValuesText: "Values",
              groupPropertiesText: "Properties",
              operatorsText: "Operators",
              operationAndText: "and",
              operationOrText: "or",
              operatorLessText: "Less than",
              operatorLessOrEqualText: "Less than or equal",
              operatorGreaterText: "Greater than",
              operatorGreaterOrEqualText: "Greater than or equal",
              operatorContainsText: "Contains",
              operatorDoesNotContainText: "Does not contain",
              operatorEqualsText: "Equals",
              operatorDoesNotEqualText: "Does not equal",
              editTokenHeader: "Edit filter",
              propertyText: "Property",
              operatorText: "Operator",
              valueText: "Value",
              cancelActionText: "Cancel",
              applyActionText: "Apply",
              allPropertiesLabel: "All properties",
              tokenLimitShowMore: "Show more",
              tokenLimitShowFewer: "Show fewer",
              clearFiltersText: "Clear filters",
              removeTokenButtonAriaLabel: (token) =>
                `Remove token ${token.propertyKey} ${token.operator} ${token.value}`,
              enteredTextLabel: (text) => `Use: "${text}"`,
            }}
          />
          <VirtualizedThreatList
            threatCatalogData={filteredThreats}
            allThreats={threatCatalogData}
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
