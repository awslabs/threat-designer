import { memo } from "react";
import { ThreatComponent } from "./ThreatCatalog";
import VirtualizedList from "./VirtualizedList";

/**
 * VirtualizedThreatList - Optimized threat list renderer using Intersection Observer
 *
 * @param {Array} threatCatalogData - Array of threat objects
 * @param {Function} updateTM - Function to update threat model
 * @param {Function} onOpenAttackTree - Function to open attack tree
 * @param {Boolean} isReadOnly - Whether the threat model is read-only
 */
const VirtualizedThreatList = memo(function VirtualizedThreatList({
  threatCatalogData,
  updateTM,
  onOpenAttackTree,
  isReadOnly,
}) {
  const renderThreat = (item, index) => (
    <ThreatComponent
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
      isReadOnly={isReadOnly}
      onOpenAttackTree={onOpenAttackTree}
    />
  );

  return (
    <VirtualizedList
      items={threatCatalogData}
      renderItem={renderThreat}
      estimatedItemHeight={400}
      rootMargin="1000px"
      itemKey="id"
    />
  );
});

export default VirtualizedThreatList;
