export type MockUser = {
  userId: string;
  given_name: string;
  family_name: string;
  email?: string;
};

export type ThreatModelStatus = "START" | "PROCESSING" | "FINALIZE" | "COMPLETE" | "FAILED";

export type CatalogItem = {
  job_id: string;
  title: string;
  summary?: string;
  timestamp?: string;
  is_owner?: boolean;
  stats?: { high?: number; medium?: number; low?: number };
};

export type CatalogList = {
  data: CatalogItem[];
  cursor?: string | null;
  hasNextPage?: boolean;
};
