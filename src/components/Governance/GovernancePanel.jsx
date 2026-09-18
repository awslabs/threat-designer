import { ShieldCheck } from "lucide-react";
import { SpacesPanel } from "../Spaces/SpacesPanel";
import { makeSpacesService } from "../../services/Spaces/spacesServiceFactory";

const governanceService = makeSpacesService("/governance/spaces");

const GOVERNANCE_VARIANT = {
  icon: ShieldCheck,
  title: "System Spaces",
  basePath: "/governance",
  newAriaLabel: "New system space",
  emptyText: "No system spaces yet",
  createTitle: "Create system space",
  createNamePlaceholder: "Org security standards",
  createNameDescription:
    "Applied to every threat model as a mandatory organization-wide knowledge base.",
};

/** Governance side panel: shared SpacesPanel pointed at the governance service. */
export function GovernancePanel() {
  return <SpacesPanel service={governanceService} variant={GOVERNANCE_VARIANT} />;
}
