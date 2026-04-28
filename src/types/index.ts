/**
 * Core type definitions for the Codex Tree Orchestrator.
 *
 * Mental model: a chess engine for software development.
 * - TreeNode = a board position
 * - Agent = an advisor who evaluates the position
 * - DebateRound = one pass of all advisors speaking
 * - Branch = a fork where the game could go multiple ways
 * - LeafResult = the endgame position (actual code via Codex)
 * - JudgeScore = how well the endgame matches the opening intent
 */

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
};

// ─── Tree Structure ──────────────────────────────────────────────────────────

export type TreePhase =
  | "requirements"
  | "architecture"
  | "implementation"
  | "validation";

export const PHASE_AGENTS: Record<TreePhase, AgentRole[]> = {
  requirements: ["product-manager", "business-analyst", "qa-engineer"],
  architecture: ["tech-lead", "business-analyst", "code-reviewer", "qa-engineer"],
  implementation: ["developer", "tech-lead", "code-reviewer"],
  validation: ["qa-engineer", "code-reviewer", "developer"],
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
}

export interface DebateTranscript {
  rounds: DebateRound[];
  finalOutcome: "consensus" | "branched";
  summary: string;
  tokenUsage: number;
  contextUpdates: Partial<NodeContext>;
}

export interface NodeContext {
  originalIntent: string;
  prd?: string;
  acceptanceCriteria?: string[];
  architectureDecisions?: string[];
  branchDecision?: string;
  implementationSpec?: string;
  testStrategy?: string;
  ancestorSummaries: string[];
}

export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
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
  output: string;
  durationMs: number;
  usage?: CodexUsage;
}

export interface JudgeScore {
  functionalCompleteness: number;
  architecturalQuality: number;
  testCoverage: number;
  intentAlignment: number;
  simplicity: number;
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
  executionResult?: CodexExecutionResult;
  score?: JudgeScore;
  createdAt: string;
  updatedAt: string;
}

export interface RunConfig {
  maxDepth: number;
  maxBranching: number;
  maxDebateRounds: number;
  reasoningModel: string;
  judgeModel: string;
  workingDirectory: string;
  phaseDepths: Record<TreePhase, [number, number]>;
  dryRun: boolean;
  tokenBudget?: number;
  leafConcurrency: number;
  pruneThreshold: number;
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
  }>;
  startedAt: string;
  completedAt?: string;
  totalTokensUsed: number;
  codexUsageTotal?: CodexUsage;
  status: "running" | "completed" | "failed" | "paused";
  runMode?: "implementation" | "exploration";
  selectedAgents?: AgentRole[];
}

export interface AgentInput {
  priorRoundsHistory: DebateMessage[];
  currentRoundSoFar: DebateMessage[];
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
