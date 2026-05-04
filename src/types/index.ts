/**
 * Core type definitions for the Cambrian Tree Orchestrator.
 *
 * Mental model: a chess engine for software development.
 * - TreeNode = a board position
 * - Agent = an advisor who evaluates the position
 * - DebateRound = one pass of all advisors speaking
 * - Branch = a fork where the game could go multiple ways
 * - LeafResult = the endgame position (actual code via Codex)
 * - JudgeScore = how well the endgame matches the opening intent
 */

import type { DomainFacts } from "../ground-truth/types.js";
export type { DomainFacts };

import type {
  CriticChoiceEvaluation,
  CriticCoverageAudit,
  CoverageDimension,
} from "../critic/types.js";
export type {
  CriticChoiceEvaluation,
  CriticCoverageAudit,
  CoverageGap,
  CoverageDimension,
  AxisValue,
  Reversibility,
  BlastRadius,
  TimeToSignal,
} from "../critic/types.js";
export {
  REVERSIBILITY_VALUES,
  BLAST_RADIUS_VALUES,
  TIME_TO_SIGNAL_VALUES,
} from "../critic/types.js";

// ─── Agent Roles ─────────────────────────────────────────────────────────────

export const AGENT_ROLES = [
  "product-manager",
  "business-analyst",
  "tech-lead",
  "developer",
  "code-reviewer",
  "qa-engineer",
  "researcher",
  "data-engineer",
  "data-analyst",
  "security-engineer",
  "ml-engineer",
  "devops-engineer",
  "ux-designer",
  "frontend-engineer",
  "api-integration-architect",
  "performance-engineer",
  "technical-writer",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_DISPLAY_NAMES: Record<AgentRole, string> = {
  "product-manager": "Product Manager",
  "business-analyst": "Business Analyst",
  "tech-lead": "Tech Lead",
  "developer": "Developer",
  "code-reviewer": "Code Reviewer",
  "qa-engineer": "QA Engineer",
  "researcher": "Researcher",
  "data-engineer": "Data Engineer",
  "data-analyst": "Data Analyst",
  "security-engineer": "Security Engineer",
  "ml-engineer": "ML Engineer",
  "devops-engineer": "DevOps Engineer",
  "ux-designer": "UX Designer",
  "frontend-engineer": "Frontend Engineer",
  "api-integration-architect": "API / Integration Architect",
  "performance-engineer": "Performance Engineer",
  "technical-writer": "Technical Writer",
};

// ─── Tree Structure ──────────────────────────────────────────────────────────

export type TreePhase =
  | "requirements"
  | "architecture"
  | "implementation"
  | "validation";

export const PHASE_AGENTS: Record<TreePhase, AgentRole[]> = {
  requirements: ["product-manager", "business-analyst", "qa-engineer"],
  architecture: [
    "tech-lead",
    "business-analyst",
    "code-reviewer",
    "qa-engineer",
  ],
  implementation: ["developer", "tech-lead", "code-reviewer"],
  validation: [
    "product-manager",
    "business-analyst",
    "developer",
    "code-reviewer",
    "qa-engineer",
  ],
};

export type NodeStatus =
  | "pending"
  | "debating"
  | "branched"
  | "consensus"
  | "executing"
  | "completed"
  | "scored"
  | "pruned";

export interface DebateMessage {
  role: AgentRole;
  content: string;
  proposedAlternative?: string;
  timestamp: string;
}

export interface DebateRound {
  roundNumber: number;
  messages: DebateMessage[];
  outcome: "consensus" | "diverging" | "continue";
  alternatives: Alternative[];
}

export interface Alternative {
  id: string;
  label: string;
  description: string;
  proposedBy: AgentRole;
  supportedBy: AgentRole[];
  rationale: string;
  confidence: number;
  relevanceToIntent: number;
  criticEvaluation?: CriticChoiceEvaluation;
}

export interface CompactDebateAlternative {
  id: string;
  label: string;
  summary: string;
  supportingAgents: AgentRole[];
  risks: string[];
  verificationIdeas: string[];
  confidence: number;
  relevanceToIntent: number;
}

export interface CompactDebateState {
  acceptedFacts: string[];
  lockedDecisions: string[];
  liveAlternatives: CompactDebateAlternative[];
  killedAlternatives: Array<{ label: string; reason: string }>;
  unresolvedQuestions: string[];
  risks: string[];
  verificationIdeas: string[];
  evidenceFindings: string[];
  evidenceConstraints: string[];
  evidenceRisks: string[];
  evidenceOpenQuestions: string[];
  lastRoundSummary: string;
}

export interface DebateTranscript {
  rounds: DebateRound[];
  finalOutcome: "consensus" | "branched";
  summary: string;
  tokenUsage: number;
  llmUsage: LLMUsage;
  contextUpdates: Partial<NodeContext>;
  compactState?: CompactDebateState;
  toolRequests?: ToolRequest[];
}

export interface HumanIntervention {
  action: "proceed" | "revise" | "kill";
  prompt?: string;
  createdAt: string;
}

export type HumanPlanDecision =
  | { action: "proceed" }
  | { action: "revise"; prompt: string }
  | { action: "kill" };

export interface PendingHumanReview {
  requestId: string;
  nodeId: string;
  createdAt: string;
}

export interface IntentDecomposition {
  loadBearingClaims: string[];
  undefinedTerms: Array<{ term: string; needsResolution: string }>;
  inScope: string[];
  outOfScope: string[];
  knownUnknowns: string[];
  feasibilityFlags: string[];
  rationale: string;
}

export interface IntentDossier {
  goal: string;
  userValue: string;
  nonGoals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  requiredChecks: string[];
  riskAreas: string[];
  knownUnknowns: string[];
  successSignals: string[];
  failureModes: string[];
  requiredCoverageDimensions: CoverageDimension[];
}

export interface VerificationCommand {
  id: string;
  command: string;
  required: boolean;
  timeoutMs: number;
}

export interface VerificationResult {
  commandId: string;
  command: string;
  exitCode: number | null;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface VerificationSummary {
  passed: number;
  failed: number;
  requiredFailed: number;
  results: VerificationResult[];
}

export interface FitnessScore {
  verification: number;
  functionalCompleteness: number;
  maintainability: number;
  simplicity: number;
  intentAlignment: number;
  riskReduction: number;
  costEfficiency: number;
  uncertaintyPenalty: number;
  composite: number;
  evidence: string[];
  failures: string[];
}

export interface PruneSchedulePoint {
  depth: number;
  threshold: number;
}

export const TOOL_NAMES = [
  "web-search",
  "web-fetch",
  "docs-fetch",
  "repo-map",
  "repo-search",
  "repo-read",
  "package-info",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolUseConfig {
  enabled: boolean;
  allowlist: ToolName[];
  maxRequestsPerNode: number;
  maxRequestsPerRound: number;
  maxRequestsPerRun: number;
  maxEvidenceItemsInPrompt: number;
  autoRunReadOnly: boolean;
}

export interface ToolRequest {
  id: string;
  toolName: ToolName;
  query: string;
  requestedBy: AgentRole;
  nodeId: string;
  roundNumber: number;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  reason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ParsedToolRequest {
  toolName: ToolName;
  query: string;
}

export interface ToolEvidenceSource {
  title?: string;
  url?: string;
  path?: string;
  quote?: string;
  retrievedAt: string;
}

export interface ToolEvidence {
  id: string;
  requestId: string;
  toolName: ToolName;
  query: string;
  requestedBy: AgentRole;
  additionalRequesters: AgentRole[];
  nodeId: string;
  roundNumber: number;
  summary: string;
  findings: string[];
  decisionRelevance: string[];
  constraintsDiscovered: string[];
  risksDiscovered: string[];
  openQuestions: string[];
  sources: ToolEvidenceSource[];
  limitations: string[];
  confidence: number;
  createdAt: string;
}

export interface NodeContext {
  originalIntent: string;
  intentDecomposition?: IntentDecomposition;
  intentDossier?: IntentDossier;
  domainFacts?: DomainFacts;
  repositoryContext?: {
    workingDirectory: string;
  };
  toolEvidence?: ToolEvidence[];
  prd?: string;
  acceptanceCriteria?: string[];
  architectureDecisions?: string[];
  branchDecision?: string;
  humanRevisionPrompt?: string;
  implementationSpec?: string;
  testStrategy?: string;
  ancestorSummaries: string[];
  coverageAudit?: CriticCoverageAudit;
}

export interface LLMUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export type ModelTier = "cheap" | "mid" | "strong";

export type ModelStage =
  | "analyzer"
  | "decomposer"
  | "dossier"
  | "debate"
  | "moderator"
  | "summarizer"
  | "sketch"
  | "sketchJudge"
  | "judge"
  | "synthesis";

export type ModelTierConfig = Record<ModelTier, string>;

export type ModelAssignmentConfig = Record<ModelStage, ModelTier>;

export interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
}

export interface CacheEntry<T> {
  key: string;
  kind: string;
  value: T;
  createdAt: string;
  model?: string;
  promptVersion?: string;
  repoFingerprint?: string;
  artifactHash?: string;
}

export interface CodexExecutionResult {
  threadId: string;
  success: boolean;
  filesChanged: string[];
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
    output: string;
  };
  verification?: VerificationSummary;
  output: string;
  durationMs: number;
  usage?: CodexUsage;
}

export interface LeafImplementationSketch {
  leafId: string;
  approach: string;
  filesLikelyChanged: string[];
  algorithmOrArchitecture: string[];
  riskAreas: string[];
  expectedTests: string[];
  estimatedComplexity: "low" | "medium" | "high";
  confidence: number;
  rationale: string;
  criticEvaluation: CriticChoiceEvaluation;
}

export interface LeafSketchScore {
  leafId: string;
  acceptanceCoverage: number;
  verificationPlanQuality: number;
  lowBlastRadius: number;
  riskReduction: number;
  complexityPenalty: number;
  uncertaintyPenalty: number;
  composite: number;
  rationale: string;
}

export interface JudgeScore {
  functionalCompleteness: number;
  architecturalQuality: number;
  testCoverage: number;
  intentAlignment: number;
  realWorldFit: number;
  simplicity: number;
  uncertainty: number;
  evidence: string[];
  failures: string[];
  composite: number;
  rationale: string;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  depth: number;
  phase: TreePhase;
  status: NodeStatus;
  context: NodeContext;
  debate?: DebateTranscript;
  children: TreeNode[];
  branchLabel: string;
  branchDescription: string;
  humanIntervention?: HumanIntervention;
  toolRequests?: ToolRequest[];
  executionResult?: CodexExecutionResult;
  implementationSketch?: LeafImplementationSketch;
  sketchScore?: LeafSketchScore;
  skippedExecutionReason?: string;
  score?: JudgeScore;
  fitness?: FitnessScore;
  createdAt: string;
  updatedAt: string;
}

export type LLMProvider = "openai" | "openrouter" | "gemini" | "deepseek";

export interface RunConfig {
  maxDepth: number;
  maxBranching: number;
  maxDebateRounds: number;
  llmProvider: LLMProvider;
  llmBaseURL?: string;
  llmApiKeyEnv?: string;
  reasoningModel: string;
  judgeModel: string;
  modelTiers?: ModelTierConfig;
  modelAssignments?: ModelAssignmentConfig;
  workingDirectory: string;
  phaseDepths: Record<TreePhase, [number, number]>;
  dryRun: boolean;
  interactivePlan: boolean;
  toolUse?: ToolUseConfig;
  enableDeterministicCache?: boolean;
  enableSketchRanking?: boolean;
  sketchExecutionTopN?: number;
  tokenBudget?: number;
  leafConcurrency: number;
  pruneThreshold: number;
  pruneSchedule?: PruneSchedulePoint[];
  verificationCommands: VerificationCommand[];
  verificationTimeoutMs: number;
  cloudEnv?: string;
  cloudAttempts?: number;
}

export interface RunState {
  id: string;
  config: RunConfig;
  intent: string;
  root: TreeNode;
  leafNodeIds: string[];
  rankedResults?: Array<{
    nodeId: string;
    path: string[];
    score: JudgeScore;
    fitness?: FitnessScore;
  }>;
  startedAt: string;
  completedAt?: string;
  totalTokensUsed: number;
  llmUsage?: LLMUsage;
  codexUsageTotal?: CodexUsage;
  cacheStats?: CacheStats;
  pendingHumanReview?: PendingHumanReview;
  status: "running" | "completed" | "failed" | "paused";
  runMode?: "implementation" | "exploration";
  selectedAgents?: AgentRole[];
}

export interface AgentInput {
  priorRoundsHistory: DebateMessage[];
  currentRoundSoFar: DebateMessage[];
  compactDebateState?: CompactDebateState;
  toolEvidencePromptLimit?: number;
  enabledTools?: ToolName[];
  context: NodeContext;
  phase: TreePhase;
  roundNumber: number;
}

export interface AgentOutput {
  message: string;
  proposedAlternatives?: Array<{
    label: string;
    description: string;
    rationale: string;
  }>;
  supportedAlternativeId?: string;
  contextUpdates?: Partial<NodeContext>;
  toolRequests?: ParsedToolRequest[];
}

export interface ModeratorAssessment {
  outcome: "consensus" | "diverging" | "continue";
  alternatives: Alternative[];
  summary: string;
}

export interface TaskAnalysis {
  runMode: "implementation" | "exploration";
  selectedAgents: AgentRole[];
  rationale: string;
}
