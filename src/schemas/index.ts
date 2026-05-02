import { z } from "zod";
import { AGENT_ROLES, TOOL_NAMES } from "../types/index.js";

export const AlternativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  proposedBy: z.string(),
  supportedBy: z.array(z.string()).default([]),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
  relevanceToIntent: z.number().min(0).max(1).default(0.5),
});

export const CompactDebateAlternativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
  supportingAgents: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  verificationIdeas: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  relevanceToIntent: z.number().min(0).max(1).default(0.5),
});

export const CompactDebateStateSchema = z.object({
  acceptedFacts: z.array(z.string()).default([]),
  lockedDecisions: z.array(z.string()).default([]),
  liveAlternatives: z.array(CompactDebateAlternativeSchema).default([]),
  killedAlternatives: z.array(z.object({ label: z.string(), reason: z.string() })).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  verificationIdeas: z.array(z.string()).default([]),
  evidenceFindings: z.array(z.string()).default([]),
  evidenceConstraints: z.array(z.string()).default([]),
  evidenceRisks: z.array(z.string()).default([]),
  evidenceOpenQuestions: z.array(z.string()).default([]),
  lastRoundSummary: z.string().default(""),
});

export const IntentDecompositionSchema = z.object({
  loadBearingClaims: z.array(z.string()).default([]),
  undefinedTerms: z
    .array(
      z.object({
        term: z.string(),
        needsResolution: z.string(),
      })
    )
    .default([]),
  inScope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  knownUnknowns: z.array(z.string()).default([]),
  feasibilityFlags: z.array(z.string()).default([]),
  rationale: z.string().default(""),
});

export const IntentDossierSchema = z.object({
  goal: z.string().default(""),
  userValue: z.string().default(""),
  nonGoals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  requiredChecks: z.array(z.string()).default([]),
  riskAreas: z.array(z.string()).default([]),
  knownUnknowns: z.array(z.string()).default([]),
  successSignals: z.array(z.string()).default([]),
  failureModes: z.array(z.string()).default([]),
});

export const VerificationCommandSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  required: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(300_000),
});

export const PruneSchedulePointSchema = z.object({
  depth: z.number().int().min(0),
  threshold: z.number().min(0).max(1),
});

export const ToolNameSchema = z.enum(TOOL_NAMES);
export const AgentRoleSchema = z.enum(AGENT_ROLES);

export const ToolUseConfigSchema = z.object({
  enabled: z.boolean(),
  allowlist: z.array(ToolNameSchema),
  maxRequestsPerNode: z.number().int().min(0),
  maxRequestsPerRound: z.number().int().min(0),
  maxRequestsPerRun: z.number().int().min(0),
  maxEvidenceItemsInPrompt: z.number().int().min(0),
  autoRunReadOnly: z.boolean(),
});

export const ToolRequestSchema = z.object({
  id: z.string().min(1),
  toolName: ToolNameSchema,
  query: z.string().min(1),
  requestedBy: AgentRoleSchema,
  nodeId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  status: z.enum(["pending", "running", "completed", "skipped", "failed"]),
  reason: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export const ParsedToolRequestSchema = z.object({
  toolName: ToolNameSchema,
  query: z.string().min(1),
});

export const ToolEvidenceSourceSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  quote: z.string().optional(),
  retrievedAt: z.string(),
});

export const ToolEvidenceSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  toolName: ToolNameSchema,
  query: z.string().min(1),
  requestedBy: AgentRoleSchema,
  additionalRequesters: z.array(AgentRoleSchema).default([]),
  nodeId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  summary: z.string(),
  findings: z.array(z.string()).default([]),
  decisionRelevance: z.array(z.string()).default([]),
  constraintsDiscovered: z.array(z.string()).default([]),
  risksDiscovered: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  sources: z.array(ToolEvidenceSourceSchema).default([]),
  limitations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});

export const ModeratorAssessmentSchema = z.object({
  outcome: z.enum(["consensus", "diverging", "continue"]),
  alternatives: z.array(AlternativeSchema).default([]),
  summary: z.string(),
});

export const JudgeScoreSchema = z.object({
  functionalCompleteness: z.number().min(0).max(10),
  architecturalQuality: z.number().min(0).max(10),
  testCoverage: z.number().min(0).max(10),
  intentAlignment: z.number().min(0).max(10),
  realWorldFit: z.number().min(0).max(10),
  simplicity: z.number().min(0).max(10),
  uncertainty: z.number().min(0).max(1).default(0.5),
  evidence: z.array(z.string()).default([]),
  failures: z.array(z.string()).default([]),
  composite: z.number(),
  rationale: z.string(),
});

export const LeafImplementationSketchSchema = z.object({
  leafId: z.string(),
  approach: z.string(),
  filesLikelyChanged: z.array(z.string()).default([]),
  algorithmOrArchitecture: z.array(z.string()).default([]),
  riskAreas: z.array(z.string()).default([]),
  expectedTests: z.array(z.string()).default([]),
  estimatedComplexity: z.enum(["low", "medium", "high"]).default("medium"),
  confidence: z.number().min(0).max(1).default(0.5),
  rationale: z.string().default(""),
});

export const LeafSketchScoreSchema = z.object({
  leafId: z.string(),
  acceptanceCoverage: z.number().min(0).max(10),
  verificationPlanQuality: z.number().min(0).max(10),
  lowBlastRadius: z.number().min(0).max(10),
  riskReduction: z.number().min(0).max(10),
  complexityPenalty: z.number().min(0).max(10),
  uncertaintyPenalty: z.number().min(0).max(10),
  composite: z.number(),
  rationale: z.string(),
});

export const TaskAnalysisSchema = z.object({
  runMode: z.enum(["implementation", "exploration"]),
  selectedAgents: z.array(z.string()),
  rationale: z.string(),
});

export const SchemaFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
});

export const SchemaDefinitionSchema = z.object({
  name: z.string(),
  fields: z.array(SchemaFieldSchema),
});

export const ApiEndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string(),
});

export const DomainFactsSchema = z.object({
  domain: z.string().min(1),
  schemas: z.array(SchemaDefinitionSchema).optional(),
  apiEndpoints: z.array(ApiEndpointSchema).optional(),
  constraints: z.array(z.string()).default([]),
  knownAbsences: z.array(z.string()).default([]),
  rawContext: z.string().optional(),
});
