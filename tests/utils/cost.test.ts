import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_CONFIG } from "../../src/orchestrator/orchestrator.js";
import { estimateRunCost, formatCostEstimate } from "../../src/utils/cost.js";

describe("cost estimate", () => {
  it("accounts for sketch-first execution by narrowing expected Codex calls", () => {
    const estimate = estimateRunCost({
      ...DEFAULT_RUN_CONFIG,
      maxDepth: 3,
      maxBranching: 3,
      sketchExecutionTopN: 2,
      enableSketchRanking: true,
    });

    expect(estimate.expectedLeaves).toBeGreaterThan(2);
    expect(estimate.expectedExecutedLeaves).toBe(2);
    expect(estimate.expectedSketchInputTokens).toBeGreaterThan(0);
    expect(formatCostEstimate(estimate, DEFAULT_RUN_CONFIG)).toContain("ranked leaf executions");
  });
});
