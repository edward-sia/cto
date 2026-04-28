import type { RunState, TreeNode } from "../types/index.js";

export interface RunSummary {
  id: string;
  intent: string;
  status: RunState["status"];
  startedAt: string;
  completedAt?: string;
  leafCount: number;
  bestScore?: number;
}

export function summarizeRun(run: RunState): RunSummary {
  const leaves = collectLeaves(run.root);
  const scoredComposites = leaves
    .map((leaf) => leaf.score?.composite)
    .filter((score): score is number => score !== undefined);

  return {
    id: run.id,
    intent: run.intent,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    leafCount: leaves.length,
    bestScore: scoredComposites.length > 0 ? Math.max(...scoredComposites) : undefined,
  };
}

function collectLeaves(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) {
    return [node];
  }

  return node.children.flatMap((child) => collectLeaves(child));
}
