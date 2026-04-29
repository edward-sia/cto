import { describe, expect, it } from "vitest";
import type { RunState, TreeNode } from "../../src/types/index.js";
import { summarizeRun } from "../../src/ui/run-summary.js";

function node(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: overrides.id ?? "node-root",
    parentId: overrides.parentId ?? null,
    depth: overrides.depth ?? 0,
    phase: overrides.phase ?? "requirements",
    status: overrides.status ?? "pending",
    context: overrides.context ?? {
      originalIntent: "Ship a saved-run UI",
      ancestorSummaries: [],
    },
    children: overrides.children ?? [],
    branchLabel: overrides.branchLabel ?? "",
    branchDescription: overrides.branchDescription ?? "",
    createdAt: overrides.createdAt ?? "2026-04-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T00:00:00.000Z",
    debate: overrides.debate,
    executionResult: overrides.executionResult,
    score: overrides.score,
  };
}

function run(overrides: Partial<RunState>): RunState {
  return {
    id: overrides.id ?? "run-123",
    intent:
      overrides.intent ??
      "Create a persisted run browser that shows the full original user intent without truncation.",
    status: overrides.status ?? "completed",
    startedAt: overrides.startedAt ?? "2026-04-28T01:00:00.000Z",
    completedAt: overrides.completedAt,
    root: overrides.root ?? node({}),
    leafNodeIds: overrides.leafNodeIds ?? [],
    totalTokensUsed: overrides.totalTokensUsed ?? 0,
    codexUsageTotal: overrides.codexUsageTotal,
    config:
      overrides.config ?? {
        maxDepth: 3,
        maxBranching: 2,
        maxDebateRounds: 2,
        reasoningModel: "gpt-5",
        judgeModel: "gpt-5",
        workingDirectory: "/repo",
        phaseDepths: {
          requirements: [0, 0],
          architecture: [1, 1],
          implementation: [2, 2],
          validation: [3, 3],
        },
        dryRun: false,
        leafConcurrency: 4,
        pruneThreshold: 0.4,
      },
  };
}

describe("summarizeRun", () => {
  it("returns run metadata, actual leaf count, and best scored leaf composite", () => {
    const lowScoredLeaf = node({
      id: "node-low",
      parentId: "node-branch",
      depth: 2,
      score: {
        functionalCompleteness: 0.7,
        architecturalQuality: 0.8,
        testCoverage: 0.4,
        intentAlignment: 0.9,
        simplicity: 0.6,
        composite: 0.68,
        rationale: "Some coverage gaps.",
      },
    });
    const highScoredLeaf = node({
      id: "node-high",
      parentId: "node-branch",
      depth: 2,
      score: {
        functionalCompleteness: 0.9,
        architecturalQuality: 0.85,
        testCoverage: 0.8,
        intentAlignment: 0.95,
        simplicity: 0.75,
        composite: 0.87,
        rationale: "Best balanced solution.",
      },
    });
    const unscoredLeaf = node({ id: "node-unscored", parentId: "node-root", depth: 1 });
    const branch = node({
      id: "node-branch",
      parentId: "node-root",
      depth: 1,
      children: [lowScoredLeaf, highScoredLeaf],
    });
    const root = node({ id: "node-root", children: [branch, unscoredLeaf] });

    const summary = summarizeRun(
      run({
        id: "run-saved-ui",
        root,
        leafNodeIds: ["stale-leaf-id"],
        completedAt: "2026-04-28T02:30:00.000Z",
      }),
    );

    expect(summary).toEqual({
      id: "run-saved-ui",
      intent:
        "Create a persisted run browser that shows the full original user intent without truncation.",
      status: "completed",
      startedAt: "2026-04-28T01:00:00.000Z",
      completedAt: "2026-04-28T02:30:00.000Z",
      leafCount: 3,
      bestScore: 0.87,
      codexUsageTotal: undefined,
      codexUsageByLeaf: [],
    });
  });

  it("omits bestScore and completedAt when the run has no scored leaves or completion time", () => {
    const summary = summarizeRun(
      run({
        status: "running",
        root: node({ children: [node({ id: "node-a", parentId: "node-root", depth: 1 })] }),
      }),
    );

    expect(summary.bestScore).toBeUndefined();
    expect(summary.completedAt).toBeUndefined();
    expect(summary.leafCount).toBe(1);
  });

  it("reuses persisted aggregate Codex usage and exposes simple per-leaf rows", () => {
    const leaf = node({
      id: "node-leaf",
      parentId: "node-root",
      depth: 1,
      branchLabel: "Patch UI",
      executionResult: {
        threadId: "thread-1",
        success: true,
        filesChanged: ["src/ui/page.ts"],
        output: "Implemented",
        durationMs: 1234,
        usage: {
          inputTokens: 1_000,
          cachedInputTokens: 250,
          outputTokens: 300,
          reasoningOutputTokens: 125,
        },
      },
    });
    const root = node({ id: "node-root", children: [leaf] });

    const summary = summarizeRun(
      run({
        root,
        codexUsageTotal: {
          inputTokens: 9_000,
          cachedInputTokens: 4_000,
          outputTokens: 2_000,
          reasoningOutputTokens: 500,
        },
      }),
    );

    expect(summary.codexUsageTotal).toEqual({
      inputTokens: 9_000,
      cachedInputTokens: 4_000,
      outputTokens: 2_000,
      reasoningOutputTokens: 500,
    });
    expect(summary.codexUsageByLeaf).toEqual([
      {
        nodeId: "node-leaf",
        label: "Patch UI",
        totalTokens: 1_425,
        inputTokens: 1_000,
        cachedInputTokens: 250,
        outputTokens: 300,
        reasoningOutputTokens: 125,
      },
    ]);
  });

  it("derives aggregate Codex usage from leaves when old run state has no total", () => {
    const root = node({
      id: "node-root",
      children: [
        node({
          id: "node-a",
          parentId: "node-root",
          depth: 1,
          executionResult: {
            threadId: "thread-a",
            success: true,
            filesChanged: [],
            output: "",
            durationMs: 100,
            usage: {
              inputTokens: 100,
              cachedInputTokens: 30,
              outputTokens: 20,
              reasoningOutputTokens: 10,
            },
          },
        }),
        node({
          id: "node-b",
          parentId: "node-root",
          depth: 1,
          executionResult: {
            threadId: "thread-b",
            success: true,
            filesChanged: [],
            output: "",
            durationMs: 100,
            usage: {
              inputTokens: 200,
              cachedInputTokens: 80,
              outputTokens: 40,
              reasoningOutputTokens: 15,
            },
          },
        }),
      ],
    });

    const summary = summarizeRun(run({ root }));

    expect(summary.codexUsageTotal).toEqual({
      inputTokens: 300,
      cachedInputTokens: 110,
      outputTokens: 60,
      reasoningOutputTokens: 25,
    });
  });
});
