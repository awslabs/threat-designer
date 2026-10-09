import SpacesCatalog from "../Spaces/SpacesCatalog";
import { makeSpacesService } from "../../services/Spaces/spacesServiceFactory";

const governanceService = makeSpacesService("/governance/spaces");

const GOVERNANCE_LABELS = {
  basePath: "/governance",
  entity: "system space",
  createTitle: "Create system space",
  createNamePlaceholder: "Org security standards",
  createNameDescription:
    "Applied to every threat model as a mandatory organization-wide knowledge base.",
  emptyTitle: "No system space selected",
  emptyBody:
    "System spaces are queried for every threat model. Select one from the panel or create a new one.",
  emptyCreateButton: "Create System Space",
  deleteTitle: "Delete system space",
  deleteButton: "Delete system space",
  deleteConfirmSuffix:
    "It will no longer be applied to new threat models and all its files will be removed.",
  filesEmptyBody: "Upload documents to build the organization-wide knowledge base.",
  detailFallbackDescription: "Applied to every threat model.",
};

/**
 * Governance system-space catalog. Thin wrapper over the shared SpacesCatalog:
 * same UI, pointed at the governance service, with sharing disabled and no
 * single-space GET (governance resolves metadata from the list).
 */
export default function GovernanceCatalog() {
  return (
    <SpacesCatalog
      service={governanceService}
      labels={GOVERNANCE_LABELS}
      sharingEnabled={false}
      hasSingleGet={false}
    />
  );
}
