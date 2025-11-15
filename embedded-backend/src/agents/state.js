/**
 * Module containing state classes and data models for the threat designer application.
 *
 * This module defines the agent state structure and all data models used in threat modeling,
 * converted from Python Pydantic models to JavaScript with Zod schemas for validation.
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph/web";
import { z } from "zod";

// ============================================================================
// CONSTANTS
// ============================================================================

const SUMMARY_MAX_WORDS_DEFAULT = 40;
const THREAT_DESCRIPTION_MIN_WORDS = 35;
const THREAT_DESCRIPTION_MAX_WORDS = 50;
const MITIGATION_MIN_ITEMS = 2;
const MITIGATION_MAX_ITEMS = 5;

/**
 * Tool usage limits for Auto mode
 *
 * These constants control the validation cycle mechanism in threat generation:
 *
 * MAX_ADD_THREATS_USES: Maximum number of times the add_threats tool can be invoked
 * before requiring gap_analysis validation. Set to 3 to enforce frequent validation
 * cycles and ensure iterative catalog refinement.
 *
 * MAX_GAP_ANALYSIS_USES: Maximum number of times the gap_analysis tool can be invoked
 * during a threat modeling session. Set to 4 to allow more validation cycles.
 *
 * Validation Cycle Mechanism:
 * - The agent can call add_threats up to MAX_ADD_THREATS_USES times (3)
 * - When this limit is reached, the agent must call gap_analysis to validate the catalog
 * - A successful gap_analysis resets the add_threats counter (tool_use) back to 0
 * - The gap_analysis counter (gap_tool_use) increments with each successful invocation
 * - When gap_analysis reaches MAX_GAP_ANALYSIS_USES (4), no more validations are allowed
 * - If gap_analysis fails, counters are NOT reset and the agent can retry
 *
 * Theoretical Maximum Threats:
 * The maximum number of threats that can be added is:
 * MAX_ADD_THREATS_USES * (MAX_GAP_ANALYSIS_USES + 1) = 3 * (4 + 1) = 15 threats
 *
 * This assumes the agent adds the maximum threats before each gap_analysis call,
 * plus one final batch after the last gap_analysis.
 */
export const MAX_ADD_THREATS_USES = 3;
export const MAX_GAP_ANALYSIS_USES = 4;

const AssetType = {
  ASSET: "Asset",
  ENTITY: "Entity",
};

const StrideCategory = {
  SPOOFING: "Spoofing",
  TAMPERING: "Tampering",
  REPUDIATION: "Repudiation",
  INFORMATION_DISCLOSURE: "Information Disclosure",
  DENIAL_OF_SERVICE: "Denial of Service",
  ELEVATION_OF_PRIVILEGE: "Elevation of Privilege",
};

const LikelihoodLevel = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

// ============================================================================
// ZOD SCHEMAS FOR DATA MODELS
// ============================================================================

/**
 * Schema for summary state
 */
export const SummaryStateSchema = z.object({
  summary: z
    .string()
    .describe(`A short headline summary of max ${SUMMARY_MAX_WORDS_DEFAULT} words`),
});

/**
 * Schema for system assets or entities
 */
export const AssetsSchema = z.object({
  type: z
    .enum([AssetType.ASSET, AssetType.ENTITY])
    .describe(`Type, one of ${AssetType.ASSET} or ${AssetType.ENTITY}`),
  name: z.string().describe("The name of the asset"),
  description: z.string().describe("The description of the asset or entity"),
});

/**
 * Schema for collection of assets
 */
export const AssetsListSchema = z.object({
  assets: z.array(AssetsSchema).describe("The list of assets"),
});

/**
 * Schema for data flow between entities
 */
export const DataFlowSchema = z.object({
  flow_description: z.string().describe("The description of the data flow"),
  source_entity: z.string().describe("The source entity/asset of the data flow"),
  target_entity: z.string().describe("The target entity/asset of the data flow"),
});

/**
 * Schema for trust boundaries
 */
export const TrustBoundarySchema = z.object({
  purpose: z.string().describe("The purpose of the trust boundary"),
  source_entity: z.string().describe("The source entity/asset of the trust boundary"),
  target_entity: z.string().describe("The target entity/asset of the trust boundary"),
});

/**
 * Schema for threat sources
 */
export const ThreatSourceSchema = z.object({
  category: z.string().describe("Actor Category"),
  description: z.string().describe("One sentence describing their relevance to this architecture"),
  example: z.string().describe("Brief list of 1-2 specific actor types"),
});

/**
 * Schema for collection of flows, boundaries, and threat sources
 */
export const FlowsListSchema = z.object({
  data_flows: z.array(DataFlowSchema).describe("The list of data flows"),
  trust_boundaries: z.array(TrustBoundarySchema).describe("The list of trust boundaries"),
  threat_sources: z.array(ThreatSourceSchema).describe("The list of threat actors"),
});

/**
 * Schema for individual threat
 */
export const ThreatSchema = z.object({
  name: z
    .string()
    .describe(
      "A concise, descriptive name for the threat that clearly identifies the security concern"
    ),
  stride_category: z
    .enum([
      StrideCategory.SPOOFING,
      StrideCategory.TAMPERING,
      StrideCategory.REPUDIATION,
      StrideCategory.INFORMATION_DISCLOSURE,
      StrideCategory.DENIAL_OF_SERVICE,
      StrideCategory.ELEVATION_OF_PRIVILEGE,
    ])
    .describe(
      `The STRIDE category classification: One of ${Object.values(StrideCategory).join(", ")}`
    ),
  description: z
    .string()
    .describe(
      `A comprehensive description of the threat scenario, including how it could be executed and its potential consequences. ` +
        `Must be between ${THREAT_DESCRIPTION_MIN_WORDS} and ${THREAT_DESCRIPTION_MAX_WORDS} words. ` +
        `Follow threat grammar: [Threat Actor] + [Action] + [Asset/Target] + [Negative Outcome]`
    ),
  target: z
    .string()
    .describe(
      "The specific asset, component, system, or data element that could be compromised by this threat"
    ),
  impact: z
    .string()
    .describe(
      "The potential business, technical, or operational consequences if this threat is successfully exploited. " +
        "Consider confidentiality, integrity, and availability impacts"
    ),
  likelihood: z
    .enum([LikelihoodLevel.LOW, LikelihoodLevel.MEDIUM, LikelihoodLevel.HIGH])
    .describe(
      "The probability of threat occurrence based on factors like attacker motivation, capability, opportunity, and existing controls"
    ),
  mitigations: z
    .array(z.string())
    .min(MITIGATION_MIN_ITEMS)
    .max(MITIGATION_MAX_ITEMS)
    .describe(
      "Specific security controls, countermeasures, or design changes that can prevent, detect, or reduce the impact of this threat"
    ),
  source: z.string().describe("The threat actor or agent who could execute this threat"),
  prerequisites: z
    .array(z.string())
    .default([])
    .describe(
      "Required conditions, access levels, knowledge, or system states that must exist for this threat to be viable"
    ),
  vector: z
    .string()
    .describe(
      "The attack vector or pathway through which the threat could be delivered or executed"
    ),
  starred: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      "User-defined flag for prioritization or tracking. Ignored by automated threat modeling agents"
    ),
});

/**
 * Schema for collection of threats
 */
export const ThreatsListSchema = z.object({
  threats: z.array(ThreatSchema).describe("The list of threats"),
});

/**
 * Schema for gap analysis continuation decision
 */
export const ContinueThreatModelingSchema = z.object({
  stop: z
    .boolean()
    .describe(
      "Should continue evaluation further threats or the catalog is comprehensive and complete."
    ),
  gap: z
    .string()
    .optional()
    .default("")
    .describe(
      "The identited list of gaps discovered to improve the threat catalog. Required only when 'stop' is False. "
    ),
  rating: z
    .number()
    .int()
    .describe(
      "Rating of the gap analysis, 1-10, 10 being the most comprehensive and complete."
    ),
});

// ============================================================================
// DATA MODEL CLASSES
// ============================================================================

/**
 * Model representing the summary of a threat catalog
 */
export class SummaryState {
  constructor(data) {
    const validated = SummaryStateSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Model representing system assets or entities in threat modeling
 */
export class Assets {
  constructor(data) {
    const validated = AssetsSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Collection of system assets for threat modeling
 */
export class AssetsList {
  constructor(data) {
    const validated = AssetsListSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Model representing data flow between entities in a system architecture
 */
export class DataFlow {
  constructor(data) {
    const validated = DataFlowSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Model representing trust boundaries between entities in system architecture
 */
export class TrustBoundary {
  constructor(data) {
    const validated = TrustBoundarySchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Model representing sources of threats in the system
 */
export class ThreatSource {
  constructor(data) {
    const validated = ThreatSourceSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Collection of data flows, trust boundaries, and threat sources
 */
export class FlowsList {
  constructor(data) {
    const validated = FlowsListSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Model representing an identified security threat using the STRIDE methodology
 */
export class Threat {
  constructor(data) {
    const validated = ThreatSchema.parse(data);
    Object.assign(this, validated);
  }
}

/**
 * Collection of identified security threats
 */
export class ThreatsList {
  constructor(data) {
    const validated = ThreatsListSchema.parse(data);
    Object.assign(this, validated);
  }

  /**
   * Combine two ThreatsList instances, avoiding duplicates based on name
   * @param {ThreatsList} other - Another ThreatsList to combine with
   * @returns {ThreatsList} Combined threats list
   */
  add(other) {
    const existingNames = new Set(this.threats.map((t) => t.name));
    const newThreats = other.threats.filter((t) => !existingNames.has(t.name));
    const combinedThreats = [...this.threats, ...newThreats];
    return new ThreatsList({ threats: combinedThreats });
  }
}

/**
 * Tool to share the gap analysis for threat modeling
 */
export class ContinueThreatModeling {
  constructor(data) {
    const validated = ContinueThreatModelingSchema.parse(data);
    Object.assign(this, validated);
  }
}

// ============================================================================
// AGENT STATE DEFINITION
// ============================================================================

/**
 * Custom reducer for threat_list that combines ThreatsList instances
 * @param {ThreatsList} x - Current state
 * @param {ThreatsList} y - New state
 * @returns {ThreatsList} Combined state
 */
function threatListReducer(x, y) {
  if (!x) return y;
  if (!y) return x;

  // Merge threat lists, avoiding duplicates
  const existingNames = new Set(x.threats.map((t) => t.name));
  const newThreats = y.threats.filter((t) => !existingNames.has(t.name));

  return {
    threats: [...x.threats, ...newThreats],
  };
}

/**
 * Custom reducer for gap array that appends new gaps
 * @param {Array<string>} x - Current state
 * @param {Array<string>} y - New state
 * @returns {Array<string>} Combined state
 */
function gapReducer(x, y) {
  if (!x) return y || [];
  if (!y) return x;
  return [...x, ...y];
}

/**
 * Default reducer that replaces old value with new value
 * @param {*} x - Current state
 * @param {*} y - New state
 * @returns {*} New state or current state if new is undefined
 */
function defaultReducer(x, y) {
  return y ?? x;
}

/**
 * Container for the internal state of the threat modeling agent
 *
 * This uses LangGraph's Annotation.Root to define the state structure
 * with appropriate reducers for each field.
 */
export const AgentState = Annotation.Root({
  job_id: Annotation({ reducer: defaultReducer }),
  summary: Annotation({ reducer: defaultReducer }),
  assets: Annotation({ reducer: defaultReducer }),
  image_data: Annotation({ reducer: defaultReducer }),
  system_architecture: Annotation({ reducer: defaultReducer }),
  description: Annotation({ reducer: defaultReducer }),
  assumptions: Annotation({ reducer: defaultReducer }),
  threat_list: Annotation({ reducer: threatListReducer }),
  iteration: Annotation({ reducer: defaultReducer }),
  retry: Annotation({ reducer: defaultReducer }),
  s3_location: Annotation({ reducer: defaultReducer }),
  title: Annotation({ reducer: defaultReducer }),
  owner: Annotation({ reducer: defaultReducer }),
  stop: Annotation({ reducer: defaultReducer }),
  gap: Annotation({ reducer: gapReducer }),
  replay: Annotation({ reducer: defaultReducer }),
  instructions: Annotation({ reducer: defaultReducer }),
});

/**
 * Container for the internal state of the threat subgraph (Auto mode)
 *
 * This extends MessagesAnnotation to include message tracking for the agentic
 * threat generation workflow. It includes tool usage counters and all necessary
 * fields from AgentState required for threat generation.
 */
export const ThreatState = Annotation.Root({
  ...MessagesAnnotation.spec,
  threat_list: Annotation({ reducer: threatListReducer }),
  tool_use: Annotation({
    reducer: defaultReducer,
    default: () => 0,
  }),
  gap_tool_use: Annotation({
    reducer: defaultReducer,
    default: () => 0,
  }),
  gap_called_since_reset: Annotation({
    reducer: defaultReducer,
    default: () => false,
  }),
  assets: Annotation({ reducer: defaultReducer }),
  image_data: Annotation({ reducer: defaultReducer }),
  system_architecture: Annotation({ reducer: defaultReducer }),
  description: Annotation({ reducer: defaultReducer }),
  assumptions: Annotation({ reducer: defaultReducer }),
  gap: Annotation({ reducer: gapReducer }),
  instructions: Annotation({ reducer: defaultReducer }),
  job_id: Annotation({ reducer: defaultReducer }),
  retry: Annotation({ reducer: defaultReducer }),
  iteration: Annotation({ reducer: defaultReducer }),
  replay: Annotation({ reducer: defaultReducer }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  AssetType,
  StrideCategory,
  LikelihoodLevel,
  SUMMARY_MAX_WORDS_DEFAULT,
  THREAT_DESCRIPTION_MIN_WORDS,
  THREAT_DESCRIPTION_MAX_WORDS,
  MITIGATION_MIN_ITEMS,
  MITIGATION_MAX_ITEMS,
};
