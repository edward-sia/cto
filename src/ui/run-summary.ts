import type { CodexUsage, RunState, TreeNode } from "../types/index.js";

export interface LeafCodexUsageSummary extends CodexUsage {
  nodeId: string;
  label: string;
  totalTokens: number;
}

export interface RunSummary {
  id: string;
  intent: string;
  status: RunState["status"];
  startedAt: string;
  completedAt?: string;
  leafCount: number;
  bestScore?: number;
  toolRequestCount: number;
  toolEvidenceCount: number;
  codexUsageTotal?: CodexUsage;
  codexUsageByLeaf: LeafCodexUsageSummary[];
}

export function summarizeRun(run: RunState): RunSummary {
  const allNodes = flattenNodes(run.root);
  const leaves = collectLeaves(run.root);
  const scoredComposites = leaves
    .map((leaf) => leaf.fitness?.composite ?? leaf.score?.composite)
    .filter((score): score is number => score !== undefined);

  const codexUsageByLeaf = leaves.flatMap((leaf) => {
    const usage = leaf.executionResult?.usage;
    if (!usage) {
      return [];
    }

    return [
      {
        nodeId: leaf.id,
        label: leaf.branchLabel || leaf.id,
        ...copyCodexUsage(usage),
        totalTokens: totalCodexTokens(usage),
      },
    ];
  });
  const derivedCodexUsageTotal = addCodexUsage(...codexUsageByLeaf);
  const codexUsageTotal = run.codexUsageTotal
    ? copyCodexUsage(run.codexUsageTotal)
    : derivedCodexUsageTotal;

  return {
    id: run.id,
    intent: run.intent,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    leafCount: leaves.length,
    bestScore: scoredComposites.length > 0 ? Math.max(...scoredComposites) : undefined,
    toolRequestCount: allNodes.reduce((count, node) => count + (node.toolRequests?.length ?? 0), 0),
    toolEvidenceCount: allNodes.reduce(
      (count, node) => count + (node.context.toolEvidence?.length ?? 0),
      0,
    ),
    codexUsageTotal,
    codexUsageByLeaf,
  };
}

function flattenNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap((child) => flattenNodes(child))];
}

function collectLeaves(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) {
    return [node];
  }

  return node.children.flatMap((child) => collectLeaves(child));
}

function addCodexUsage(...usages: CodexUsage[]): CodexUsage | undefined {
  if (usages.length === 0) {
    return undefined;
  }

  return usages.reduce<CodexUsage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens + usage.reasoningOutputTokens,
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
  );
}

function copyCodexUsage(usage: CodexUsage): CodexUsage {
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
  };
}

function totalCodexTokens(usage: CodexUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.reasoningOutputTokens;
}
