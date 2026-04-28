import type {
  CodexExecutionResult,
  DebateRound,
  DebateTranscript,
  JudgeScore,
  NodeContext,
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
  leaf?: {
    executionResult?: CodexExecutionResult;
    score?: JudgeScore;
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
    leaf:
      node.executionResult || node.score
        ? {
            executionResult: node.executionResult,
            score: node.score,
            filesChanged: node.executionResult?.filesChanged ?? [],
          }
        : undefined,
  };
}
