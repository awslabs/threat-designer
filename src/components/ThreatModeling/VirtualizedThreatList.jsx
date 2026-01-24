import { memo } from "react";
import { ThreatComponent } from "./ThreatCatalog";
import VirtualizedList from "./VirtualizedList";
import Box from "@cloudscape-design/components/box";

/**
 * VirtualizedThreatList - Optimized threat list renderer using Intersection Observer
 *
 * @param {Array} threatCatalogData - Array of threat objects (filtered)
 * @param {Array} allThreats - Array of all threat objects (unfiltered) for finding original indices
 * @param {Function} updateTM - Function to update threat model
 * @param {Function} onOpenAttackTree - Function to open attack tree
 * @param {Boolean} isReadOnly - Whether the threat model is read-only
 */
const VirtualizedThreatList = memo(function VirtualizedThreatList({
  threatCatalogData,
  allThreats,
  updateTM,
  onOpenAttackTree,
  isReadOnly,
}) {
  const renderThreat = (item, filteredIndex) => {
    // Find the original index in the unfiltered array
    // This ensures delete/edit operations work on the correct threat
    let originalIndex = filteredIndex;

    if (allThreats && Array.isArray(allThreats)) {
      // Try to find by ID first
      const foundIndex = allThreats.findIndex(
        (threat) => threat && threat.id && item.id && threat.id === item.id
      );

      // If found by ID, use that index
      if (foundIndex !== -1) {
        originalIndex = foundIndex;
      } else {
        // Fallback: try to find by name (in case IDs are missing or mismatched)
        const nameIndex = allThreats.findIndex(
          (threat) => threat && threat.name && item.name && threat.name === item.name
        );
        if (nameIndex !== -1) {
          originalIndex = nameIndex;
        }
      }
    }

    return (
      <ThreatComponent
        index={originalIndex}
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
          "notes",
        ]}
        isReadOnly={isReadOnly}
        onOpenAttackTree={onOpenAttackTree}
      />
    );
  };

  // Handle empty state when no threats match filters
  // Requirement 1.4: Display appropriate empty state message
  if (!threatCatalogData || threatCatalogData.length === 0) {
    return (
      <Box textAlign="center" color="inherit" padding={{ vertical: "xl" }}>
        <Box variant="strong" color="inherit">
          No threats match the current filters
        </Box>
        <Box variant="p" color="text-body-secondary" padding={{ top: "xs" }}>
          Try adjusting or clearing your filters to see more results
        </Box>
      </Box>
    );
  }

  return (
    <VirtualizedList
      items={threatCatalogData}
      renderItem={renderThreat}
      estimatedItemHeight={400}
      rootMargin="3000px"
      itemKey="id"
    />
  );
});

export default VirtualizedThreatList;
