import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { TreeOrchestrator } from "../../src/orchestrator/orchestrator.js";
import type { Alternative, TreeNode } from "../../src/types/index.js";

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
      selectedAgents: ["product-manager", "tech-lead", "developer", "qa-engineer"],
      rationale: "Default panel (dry-run or analyzer fallback)",
    });
    expect(state.runMode).toBe("implementation");
    expect(state.selectedAgents).toEqual([
      "product-manager",
      "tech-lead",
      "developer",
      "qa-engineer",
    ]);
    expect(state.rankedResults?.length).toBeGreaterThan(0);
  });

  it("uses analyzer-selected agents even when none have the phase as primary", () => {
    const orchestrator = new TreeOrchestrator({} as OpenAI, { dryRun: true });
    (orchestrator as unknown as { runState: { selectedAgents: string[] } }).runState = {
      selectedAgents: ["tech-lead", "developer", "code-reviewer"],
    } as never;

    const agents = (orchestrator as unknown as {
      getAgentsForPhase: (p: string) => string[];
    }).getAgentsForPhase("requirements");

    expect(agents).not.toContain("product-manager");
    expect(agents).not.toContain("business-analyst");
    expect(agents).not.toContain("qa-engineer");
    expect(agents).toEqual(["tech-lead", "developer", "code-reviewer"]);
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
