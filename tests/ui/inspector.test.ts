import { describe, expect, it } from "vitest";
import type { DebateTranscript, NodeContext, TreeNode } from "../../src/types/index.js";
import { buildInspector } from "../../src/ui/inspector.js";

const context: NodeContext = {
  originalIntent: "Build a saved-run UI",
  prd: "Users can inspect persisted orchestration runs.",
  acceptanceCriteria: ["Shows summary", "Shows selected node detail"],
  architectureDecisions: ["Keep UI data as serializable view models"],
  branchDecision: "Use local file-store data",
  implementationSpec: "Expose summary and inspector adapters.",
  testStrategy: "Unit-test fixtures around scored leaves.",
  ancestorSummaries: ["Root clarified saved run browsing.", "Branch selected view-model layer."],
};

const debate: DebateTranscript = {
  rounds: [
    {
      roundNumber: 1,
      messages: [
        {
          role: "product-manager",
          content: "Prioritize fast scanability.",
          timestamp: "2026-04-28T01:00:00.000Z",
        },
      ],
      outcome: "consensus",
      alternatives: [],
    },
  ],
  finalOutcome: "consensus",
  summary: "Panel agreed on serializable view models.",
  tokenUsage: 432,
  contextUpdates: {
    implementationSpec: "Expose summary and inspector adapters.",
  },
};

function scoredNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: overrides.id ?? "node-scored",
    parentId: overrides.parentId ?? "node-parent",
    depth: overrides.depth ?? 2,
    phase: overrides.phase ?? "implementation",
    status: overrides.status ?? "scored",
    context: overrides.context ?? context,
    children: overrides.children ?? [],
    branchLabel: overrides.branchLabel ?? "Persisted view models",
    branchDescription: overrides.branchDescription ?? "Create serializable data for the saved-run UI.",
    debate: overrides.debate ?? debate,
    executionResult:
      "executionResult" in overrides
        ? overrides.executionResult
        : {
        threadId: "thread-123",
        success: true,
        filesChanged: ["src/ui/run-summary.ts", "src/ui/inspector.ts"],
        output: "Implemented Task 2.",
        durationMs: 1200,
        testResults: {
          passed: 4,
          failed: 0,
          skipped: 0,
          output: "vitest passed",
        },
      },
    score:
      "score" in overrides
        ? overrides.score
        : {
        functionalCompleteness: 0.95,
        architecturalQuality: 0.9,
        testCoverage: 0.92,
        intentAlignment: 0.96,
        simplicity: 0.88,
        composite: 0.93,
        rationale: "Meets the UI adapter requirements.",
      },
    createdAt: overrides.createdAt ?? "2026-04-28T01:10:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T01:20:00.000Z",
  };
}

describe("buildInspector", () => {
  it("exposes header, summary, debate, context, and leaf details for a scored node", () => {
    const node = scoredNode();

    const inspector = buildInspector(node);

    expect(inspector.header).toEqual({
      id: "node-scored",
      label: "Persisted view models",
      phase: "implementation",
      status: "scored",
      depth: 2,
    });
    expect(inspector.summary).toEqual({
      branchDescription: "Create serializable data for the saved-run UI.",
      debateSummary: "Panel agreed on serializable view models.",
      ancestorPath: ["Root clarified saved run browsing.", "Branch selected view-model layer."],
      createdAt: "2026-04-28T01:10:00.000Z",
      updatedAt: "2026-04-28T01:20:00.000Z",
    });
    expect(inspector.debate).toEqual({
      rounds: debate.rounds,
      finalOutcome: "consensus",
      tokenUsage: 432,
    });
    expect(inspector.context).toBe(context);
    expect(inspector.leaf).toEqual({
      executionResult: node.executionResult,
      score: node.score,
      filesChanged: ["src/ui/run-summary.ts", "src/ui/inspector.ts"],
    });
  });

  it("labels a root node, defaults missing debate rounds, and omits leaf when unexecuted and unscored", () => {
    const root = scoredNode({
      id: "node-root",
      parentId: null,
      depth: 0,
      phase: "requirements",
      status: "pending",
      branchLabel: "",
      branchDescription: "",
      debate: {
        finalOutcome: "branched",
        summary: "No rounds persisted.",
        tokenUsage: 0,
        contextUpdates: {},
        rounds: undefined as never,
      },
      executionResult: undefined,
      score: undefined,
    });

    const inspector = buildInspector(root);

    expect(inspector.header.label).toBe("root");
    expect(inspector.debate.rounds).toEqual([]);
    expect(inspector.leaf).toBeUndefined();
  });

  it("defaults leaf filesChanged to an empty array when only a score exists", () => {
    const node = scoredNode({
      executionResult: undefined,
      score: {
        functionalCompleteness: 0.8,
        architecturalQuality: 0.8,
        testCoverage: 0.8,
        intentAlignment: 0.8,
        simplicity: 0.8,
        composite: 0.8,
        rationale: "Score only.",
      },
    });

    const inspector = buildInspector(node);

    expect(inspector.leaf?.executionResult).toBeUndefined();
    expect(inspector.leaf?.score?.composite).toBe(0.8);
    expect(inspector.leaf?.filesChanged).toEqual([]);
  });
});
