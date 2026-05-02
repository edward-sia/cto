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
  toolEvidence: [
    {
      id: "evidence-1",
      requestId: "request-1",
      toolName: "repo-search",
      query: "buildInspector",
      requestedBy: "developer",
      additionalRequesters: [],
      nodeId: "node-scored",
      roundNumber: 1,
      summary: "Inspector builds serializable view models.",
      findings: ["Context is passed through."],
      decisionRelevance: ["Show tool evidence in the context tab."],
      constraintsDiscovered: ["Keep UI data serializable."],
      risksDiscovered: [],
      openQuestions: [],
      sources: [{ path: "src/ui/inspector.ts", retrievedAt: "2026-05-02T00:00:00.000Z" }],
      limitations: ["Fixture evidence."],
      confidence: 0.8,
      createdAt: "2026-05-02T00:00:01.000Z",
    },
  ],
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
    toolRequests: overrides.toolRequests ?? [
      {
        id: "request-1",
        toolName: "repo-search",
        query: "buildInspector",
        requestedBy: "developer",
        nodeId: "node-scored",
        roundNumber: 1,
        status: "completed",
        createdAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:00:01.000Z",
      },
    ],
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
    implementationSketch: overrides.implementationSketch,
    sketchScore: overrides.sketchScore,
    skippedExecutionReason: overrides.skippedExecutionReason,
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
    expect(inspector.tools.requestCount).toBe(1);
    expect(inspector.tools.evidenceCount).toBe(1);
    expect(inspector.tools.requests[0].query).toBe("buildInspector");
    expect(inspector.tools.evidence[0].summary).toContain("serializable view models");
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

  it("exposes sketch evidence for leaves skipped before execution", () => {
    const node = scoredNode({
      executionResult: undefined,
      score: undefined,
      implementationSketch: {
        leafId: "node-scored",
        approach: "Implement the lean API path.",
        filesLikelyChanged: ["src/api/**"],
        algorithmOrArchitecture: ["REST CRUD"],
        riskAreas: ["Auth scope unknown"],
        expectedTests: ["CRUD route tests"],
        estimatedComplexity: "medium",
        confidence: 0.8,
        rationale: "Low blast radius.",
      },
      sketchScore: {
        leafId: "node-scored",
        acceptanceCoverage: 8,
        verificationPlanQuality: 8,
        lowBlastRadius: 7,
        riskReduction: 7,
        complexityPenalty: 2,
        uncertaintyPenalty: 2,
        composite: 7.2,
        rationale: "Good coverage.",
      },
      skippedExecutionReason: "Skipped before Codex execution: sketch ranked below top 2.",
    });

    const inspector = buildInspector(node);

    expect(inspector.leaf?.implementationSketch?.approach).toContain("lean API");
    expect(inspector.leaf?.sketchScore?.composite).toBe(7.2);
    expect(inspector.leaf?.skippedExecutionReason).toContain("top 2");
  });
});
