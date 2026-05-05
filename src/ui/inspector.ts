import type {
  CodexExecutionResult,
  DebateRound,
  DebateTranscript,
  FitnessScore,
  JudgeScore,
  LeafImplementationSketch,
  NodeContext,
  ToolEvidence,
  ToolRequest,
  TreeNode,
} from "../types/index.js";

export interface InspectorViewModel {
  header: {
    id: string;
    label: string;
    phase: TreeNode["phase"];
    status: TreeNode["status"];
    depth: number;
  };
  summary: {
    branchDescription: string;
    debateSummary?: string;
    ancestorPath: string[];
    createdAt: string;
    updatedAt: string;
  };
  debate: {
    rounds: DebateRound[];
    finalOutcome?: DebateTranscript["finalOutcome"];
    tokenUsage?: number;
  };
  context: NodeContext;
  tools: {
    requestCount: number;
    evidenceCount: number;
    requests: ToolRequest[];
    evidence: ToolEvidence[];
  };
  leaf?: {
    executionResult?: CodexExecutionResult;
    score?: JudgeScore;
    fitness?: FitnessScore;
    implementationSketch?: LeafImplementationSketch;
    skippedExecutionReason?: string;
    filesChanged: string[];
  };
}

export function buildInspector(node: TreeNode): InspectorViewModel {
  return {
    header: {
      id: node.id,
      label: node.branchLabel || "root",
      phase: node.phase,
      status: node.status,
      depth: node.depth,
    },
    summary: {
      branchDescription: node.branchDescription,
      debateSummary: node.debate?.summary,
      ancestorPath: node.context.ancestorSummaries,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
    debate: {
      rounds: node.debate?.rounds ?? [],
      finalOutcome: node.debate?.finalOutcome,
      tokenUsage: node.debate?.tokenUsage,
    },
    context: node.context,
    tools: {
      requestCount: node.toolRequests?.length ?? 0,
      evidenceCount: node.context.toolEvidence?.length ?? 0,
      requests: node.toolRequests ?? [],
      evidence: node.context.toolEvidence ?? [],
    },
    leaf:
      node.executionResult != null || node.score != null || node.implementationSketch != null || node.skippedExecutionReason != null
        ? {
            executionResult: node.executionResult,
            score: node.score,
            ...(node.implementationSketch ? { implementationSketch: node.implementationSketch } : {}),
            ...(node.skippedExecutionReason ? { skippedExecutionReason: node.skippedExecutionReason } : {}),
            ...(node.fitness ? { fitness: node.fitness } : {}),
            filesChanged: node.executionResult?.filesChanged ?? [],
          }
        : undefined,
  };
}
