import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { Critic } from "../../src/critic/critic.js";
import type { Alternative, NodeContext } from "../../src/types/index.js";

// Unit-level checks for the contract the orchestrator's diverging hook
// depends on. End-to-end orchestrator wiring is exercised in Task 12's
// integration test.
describe("Critic.evaluateAlternative contract used by orchestrator.processNode (DIVERGING)", () => {
  it("returns an evaluation matching the schema in dry-run", async () => {
    const critic = new Critic({
      openai: new OpenAI({ apiKey: "test" }),
      model: "gpt-test",
      dryRun: true,
    });
    const alt: Alternative = {
      id: "alt-1",
      label: "Approach A",
      description: "Lean approach",
      proposedBy: "tech-lead",
      supportedBy: [],
      rationale: "Speed of delivery",
      confidence: 0.7,
      relevanceToIntent: 0.9,
    };
    const ctx: NodeContext = { originalIntent: "x", ancestorSummaries: [] };
    const evaluation = await critic.evaluateAlternative(alt, ctx);
    expect(evaluation.reversibility.value).toBeDefined();
    expect(evaluation.blastRadius.value).toBeDefined();
    expect(evaluation.timeToSignal.value).toBeDefined();
    expect(typeof evaluation.counterCase).toBe("string");
    expect(typeof evaluation.falsifier).toBe("string");
  });
});
