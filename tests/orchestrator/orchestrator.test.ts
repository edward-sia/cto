import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { TreeOrchestrator } from "../../src/orchestrator/orchestrator.js";
import type { Alternative, LeafImplementationSketch, TreeNode } from "../../src/types/index.js";

describe("TreeOrchestrator", () => {
  it("stores dry-run task analysis and reports it through callbacks", async () => {
    const onAnalysisComplete = vi.fn();
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onAnalysisComplete }
    );

    const state = await orchestrator.run("Build a REST API");

    expect(onAnalysisComplete).toHaveBeenCalledOnce();
    expect(onAnalysisComplete).toHaveBeenCalledWith({
      runMode: "implementation",
      selectedAgents: [
        "product-manager",
        "business-analyst",
        "tech-lead",
        "developer",
        "code-reviewer",
        "qa-engineer",
      ],
      rationale: "Default panel (dry-run or analyzer fallback)",
    });
    expect(state.runMode).toBe("implementation");
    expect(state.selectedAgents).toEqual([
      "product-manager",
      "business-analyst",
      "tech-lead",
      "developer",
      "code-reviewer",
      "qa-engineer",
    ]);
    expect(state.rankedResults?.length).toBeGreaterThan(0);
  });

  it("reports the run state after the first save creates a run id", async () => {
    const observed: Array<{ id: string; status: string; rootId: string }> = [];
    const onRunStarted = vi.fn((run) => {
      observed.push({ id: run.id, status: run.status, rootId: run.root.id });
    });
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onRunStarted }
    );

    const state = await orchestrator.run("Build a REST API");

    expect(onRunStarted).toHaveBeenCalledOnce();
    expect(observed).toEqual([{
      id: state.id,
      status: "running",
      rootId: state.root.id,
    }]);
  });

  it("stores an intent dossier and computes leaf fitness in dry-run mode", async () => {
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
        verificationCommands: [],
        verificationTimeoutMs: 300_000,
      }
    );

    const state = await orchestrator.run("Build a REST API");
    const leaves = collectNodes(state.root).filter((node) => node.score);

    expect(state.root.context.intentDossier?.goal).toBe("Build a REST API");
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((leaf) => leaf.fitness)).toBe(true);
    expect(state.rankedResults?.every((result) => result.fitness)).toBe(true);
  });

  it("persists tool requests and evidence when tool use is enabled", async () => {
    const openai = {} as OpenAI;
    const orchestrator = new TreeOrchestrator(openai, {
      dryRun: true,
      maxDepth: 5,
      maxDebateRounds: 1,
      maxBranching: 2,
      pruneThreshold: 0,
      toolUse: {
        enabled: true,
        allowlist: ["docs-fetch"],
        maxRequestsPerNode: 4,
        maxRequestsPerRound: 2,
        maxRequestsPerRun: 10,
        maxEvidenceItemsInPrompt: 5,
        autoRunReadOnly: true,
      },
    });

    const state = await orchestrator.run("Build with tool research");
    const nodes = collectNodes(state.root);
    const nodeWithRequest = nodes.find((node) => (node.toolRequests ?? []).length > 0);

    expect(nodeWithRequest?.toolRequests?.[0].toolName).toBe("docs-fetch");
    expect(nodeWithRequest?.context.toolEvidence?.[0].summary).toContain("docs-fetch adapter");
  });

  it("stores the current working directory in root repository context", async () => {
    const orchestrator = new TreeOrchestrator({} as OpenAI, {
      dryRun: true,
      maxDepth: 1,
      maxDebateRounds: 1,
      workingDirectory: "/Users/esia/repos/codex-tree-orchestrator",
    });

    const state = await orchestrator.run("Help me research cli in the codebase using tool use");

    expect(state.root.context.repositoryContext).toEqual({
      workingDirectory: "/Users/esia/repos/codex-tree-orchestrator",
    });
  });

  it("enforces the tool request budget across the whole run", async () => {
    const orchestrator = new TreeOrchestrator({} as OpenAI, {
      dryRun: true,
      maxDepth: 5,
      maxDebateRounds: 1,
      maxBranching: 2,
      pruneThreshold: 0,
      toolUse: {
        enabled: true,
        allowlist: ["docs-fetch"],
        maxRequestsPerNode: 4,
        maxRequestsPerRound: 2,
        maxRequestsPerRun: 1,
        maxEvidenceItemsInPrompt: 5,
        autoRunReadOnly: true,
      },
    });

    const state = await orchestrator.run("Build with tool research");
    const requests = collectNodes(state.root).flatMap((node) => node.toolRequests ?? []);

    expect(requests.filter((request) => request.status === "completed")).toHaveLength(1);
    expect(requests.some((request) => request.reason === "Skipped because run budget is exhausted.")).toBe(true);
  });

  it("does not run verification commands during dry-run execution", async () => {
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
        verificationCommands: [
          {
            id: "verify-fail-if-run",
            command: "node -e \"process.exit(9)\"",
            required: true,
            timeoutMs: 30_000,
          },
        ],
        verificationTimeoutMs: 30_000,
      }
    );

    const state = await orchestrator.run("Build a REST API");
    const leaves = collectNodes(state.root).filter((node) => node.executionResult);

    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((leaf) => leaf.executionResult?.success)).toBe(true);
    expect(leaves.every((leaf) => leaf.executionResult?.verification === undefined)).toBe(true);
  });

  it("sketches every leaf but executes only the top ranked leaves by default", async () => {
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        maxDepth: 3,
        maxDebateRounds: 1,
        maxBranching: 2,
        pruneThreshold: 0,
        leafConcurrency: 2,
      }
    );

    const state = await orchestrator.run("Build a REST API");
    const leaves = collectNodes(state.root).filter((node) => node.children.length === 0 && node.status !== "pruned");
    const sketched = leaves.filter((leaf) => leaf.implementationSketch);
    const executed = leaves.filter((leaf) => leaf.executionResult);
    const skipped = leaves.filter((leaf) => leaf.skippedExecutionReason);

    expect(leaves).toHaveLength(4);
    expect(sketched).toHaveLength(4);
    expect(executed).toHaveLength(2);
    expect(skipped).toHaveLength(2);
    expect(state.rankedResults).toHaveLength(2);
  });

  it("selects the next skipped sketch as fallback when all top verified leaves fail", () => {
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        verificationCommands: [{ id: "verify", command: "npm test", required: true, timeoutMs: 1000 }],
      }
    );
    const root = {
      id: "root",
      parentId: null,
      depth: 0,
      phase: "requirements",
      status: "branched",
      context: { originalIntent: "x", ancestorSummaries: [] },
      children: [
        fakeLeaf("a", 8, undefined, 1),
        fakeLeaf("b", 7, undefined, 1),
        fakeLeaf("c", 6, "skipped", undefined),
      ],
      branchLabel: "",
      branchDescription: "",
      createdAt: "",
      updatedAt: "",
    } as TreeNode;

    const fallback = (orchestrator as unknown as {
      nextSketchFallback: (root: TreeNode, executed: TreeNode[]) => TreeNode | undefined;
    }).nextSketchFallback(root, root.children.slice(0, 2));

    expect(fallback?.id).toBe("c");
  });

  it("uses phase defaults when selected agents have no primary match for that phase", () => {
    const orchestrator = new TreeOrchestrator({} as OpenAI, { dryRun: true });
    (orchestrator as unknown as { runState: { selectedAgents: string[] } }).runState = {
      selectedAgents: ["tech-lead", "developer"],
    } as never;

    const agents = (orchestrator as unknown as {
      getAgentsForPhase: (p: string) => string[];
    }).getAgentsForPhase("requirements");

    expect(agents).toContain("product-manager");
    expect(agents).toContain("business-analyst");
    expect(agents).toContain("qa-engineer");
    expect(agents).not.toContain("tech-lead");
    expect(agents).not.toContain("developer");
  });

  it("falls back to default panel only when analyzer never selected agents", () => {
    const orchestrator = new TreeOrchestrator({} as OpenAI, { dryRun: true });
    (orchestrator as unknown as { runState: { selectedAgents?: string[] } }).runState = {
      selectedAgents: undefined,
    } as never;

    const agents = (orchestrator as unknown as {
      getAgentsForPhase: (p: string) => string[];
    }).getAgentsForPhase("requirements");

    expect(agents).toContain("product-manager");
    expect(agents).toContain("business-analyst");
    expect(agents).toContain("qa-engineer");
  });

  it("prunes alternatives whose confidence * relevanceToIntent is below threshold", () => {
    const alts: Alternative[] = [
      {
        id: "a",
        label: "On-topic high",
        description: "",
        proposedBy: "tech-lead",
        supportedBy: [],
        rationale: "",
        confidence: 0.9,
        relevanceToIntent: 0.9,
      },
      {
        id: "b",
        label: "Off-topic",
        description: "",
        proposedBy: "business-analyst",
        supportedBy: [],
        rationale: "",
        confidence: 0.9,
        relevanceToIntent: 0.2,
      },
    ];
    const threshold = 0.5;
    const effective = (a: Alternative) => a.confidence * a.relevanceToIntent;
    const kept = alts.filter((a) => effective(a) >= threshold);
    expect(kept.map((a) => a.id)).toEqual(["a"]);
  });

  it("records proceed decisions during the interactive plan gate", async () => {
    const onHumanPlanReview = vi.fn(async () => ({ action: "proceed" as const }));
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        interactivePlan: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onHumanPlanReview }
    );

    const state = await orchestrator.run("Build a REST API");
    const leaves = collectNodes(state.root).filter((node) => node.humanIntervention);

    expect(state.config.interactivePlan).toBe(true);
    expect(onHumanPlanReview).toHaveBeenCalledTimes(2);
    expect(leaves).toHaveLength(2);
    expect(leaves.every((leaf) => leaf.humanIntervention?.action === "proceed")).toBe(true);
    expect(state.rankedResults?.length).toBe(2);
  });

  it("persists a pending human-review request while waiting for the decision", async () => {
    let pendingDuringReview;
    const onHumanPlanReview = vi.fn(async (_node, state) => {
      pendingDuringReview = state.pendingHumanReview;
      return { action: "proceed" as const };
    });
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        interactivePlan: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onHumanPlanReview }
    );

    const state = await orchestrator.run("Build a REST API");

    expect(pendingDuringReview).toEqual({
      requestId: expect.stringMatching(/^review-/),
      nodeId: expect.stringMatching(/^node-/),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(state.pendingHumanReview).toBeUndefined();
  });

  it("prunes killed leaves and excludes them from execution", async () => {
    const onHumanPlanReview = vi
      .fn()
      .mockResolvedValueOnce({ action: "kill" as const })
      .mockResolvedValue({ action: "proceed" as const });
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        interactivePlan: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onHumanPlanReview }
    );

    const state = await orchestrator.run("Build a REST API");
    const nodes = collectNodes(state.root);
    const killed = nodes.find((node) => node.humanIntervention?.action === "kill");

    expect(killed).toBeDefined();
    expect(killed?.status).toBe("pruned");
    expect(state.leafNodeIds).not.toContain(killed?.id);
    expect(state.rankedResults?.some((result) => result.nodeId === killed?.id)).toBe(false);
    expect(state.rankedResults).toHaveLength(1);
  });

  it("creates a debated human revision child and executes that descendant instead of re-prompting it", async () => {
    const onHumanPlanReview = vi
      .fn()
      .mockResolvedValueOnce({ action: "revise" as const, prompt: "Prefer local-first storage." })
      .mockResolvedValue({ action: "proceed" as const });
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        interactivePlan: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onHumanPlanReview }
    );

    const state = await orchestrator.run("Build a REST API");
    const nodes = collectNodes(state.root);
    const revised = nodes.find((node) => node.humanIntervention?.action === "revise");
    const revisionChild = revised?.children[0];

    expect(onHumanPlanReview).toHaveBeenCalledTimes(2);
    expect(revised).toBeDefined();
    expect(revisionChild?.branchLabel).toBe("human-revision");
    expect(revisionChild?.branchDescription).toBe("Prefer local-first storage.");
    expect(revisionChild?.context.humanRevisionPrompt).toBe("Prefer local-first storage.");
    expect(revisionChild?.humanIntervention).toBeUndefined();
    expect(state.leafNodeIds).toContain(revisionChild?.id);
    expect(state.leafNodeIds).not.toContain(revised?.id);
  });

  it("pauses without execution when every candidate leaf is killed", async () => {
    const onHumanPlanReview = vi.fn(async () => ({ action: "kill" as const }));
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        interactivePlan: true,
        maxDepth: 2,
        maxDebateRounds: 1,
        leafConcurrency: 2,
      },
      { onHumanPlanReview }
    );

    const state = await orchestrator.run("Build a REST API");

    expect(state.status).toBe("paused");
    expect(state.leafNodeIds).toEqual([]);
    expect(state.rankedResults).toBeUndefined();
  });

  it("does not re-prompt reviewed leaves when resuming a paused interactive run", async () => {
    const initialReview = vi.fn(async () => ({ action: "kill" as const }));
    const firstOrchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        interactivePlan: true,
        maxDepth: 1,
        maxDebateRounds: 1,
        leafConcurrency: 2,
        pruneThreshold: 0,
      },
      { onHumanPlanReview: initialReview }
    );
    const pausedState = await firstOrchestrator.run("Build a REST API");

    const resumeReview = vi.fn(async () => ({ action: "proceed" as const }));
    const resumedOrchestrator = new TreeOrchestrator(
      {} as OpenAI,
      { dryRun: true },
      { onHumanPlanReview: resumeReview }
    );
    const resumedState = await resumedOrchestrator.resume(pausedState.id);

    expect(pausedState.status).toBe("paused");
    expect(resumeReview).not.toHaveBeenCalled();
    expect(resumedState.status).toBe("paused");
    expect(resumedState.leafNodeIds).toEqual([]);
  });
});

function collectNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap((child) => collectNodes(child))];
}

const fakeSketch = (id: string): LeafImplementationSketch => ({
  leafId: id,
  approach: "x",
  filesLikelyChanged: [],
  algorithmOrArchitecture: [],
  riskAreas: [],
  expectedTests: [],
  estimatedComplexity: "medium",
  confidence: 0.7,
  rationale: "test",
  criticEvaluation: {
    reversibility: { value: "reversible-with-effort", note: "" },
    blastRadius: { value: "low", note: "" },
    timeToSignal: { value: "medium", note: "" },
    counterCase: "",
    falsifier: "",
  },
});

function fakeLeaf(
  id: string,
  _rankHint: number,
  skippedExecutionReason?: string,
  requiredFailed?: number
): TreeNode {
  return {
    id,
    parentId: "root",
    depth: 1,
    phase: "validation",
    status: "consensus",
    context: { originalIntent: "x", ancestorSummaries: [] },
    children: [],
    branchLabel: id,
    branchDescription: id,
    implementationSketch: fakeSketch(id),
    skippedExecutionReason,
    executionResult: requiredFailed === undefined ? undefined : {
      threadId: id,
      success: true,
      filesChanged: [],
      output: "",
      durationMs: 1,
      verification: {
        passed: 0,
        failed: requiredFailed,
        requiredFailed,
        results: [],
      },
    },
    createdAt: "",
    updatedAt: "",
  };
}
