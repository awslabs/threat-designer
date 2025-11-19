import RootGoalNode from "./RootGoalNode";
import ANDGateNode from "./ANDGateNode";
import ORGateNode from "./ORGateNode";
import LeafAttackNode from "./LeafAttackNode";
import CountermeasureNode from "./CountermeasureNode";

// Node types mapping for React Flow
export const nodeTypes = {
  root: RootGoalNode,
  "and-gate": ANDGateNode,
  "or-gate": ORGateNode,
  "leaf-attack": LeafAttackNode,
  countermeasure: CountermeasureNode,
};

// Export individual components for direct use if needed
export { RootGoalNode, ANDGateNode, ORGateNode, LeafAttackNode, CountermeasureNode };
