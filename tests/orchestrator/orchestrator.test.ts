import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { TreeOrchestrator } from "../../src/orchestrator/orchestrator.js";

describe("TreeOrchestrator", () => {
  it("stores dry-run task analysis and reports it through callbacks", async () => {
    const onAnalysisComplete = vi.fn();
    const orchestrator = new TreeOrchestrator(
      {} as OpenAI,
      {
        dryRun: true,
        maxDepth: 2,
        maxDebateRounds: 1,
        leafConcurrency: 2,
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
});
