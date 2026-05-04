import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { Critic } from "../../src/critic/critic.js";
import type { Alternative, NodeContext, TreeNode } from "../../src/types/index.js";

const openai = new OpenAI({ apiKey: "test" });

const baseContext: NodeContext = {
  originalIntent: "Add tracing to the checkout pipeline",
  ancestorSummaries: [],
};

function makeAlternative(overrides: Partial<Alternative> = {}): Alternative {
  return {
    id: "alt-1",
    label: "OpenTelemetry",
    description: "Standard OTel SDK",
    proposedBy: "tech-lead",
    supportedBy: [],
    rationale: "Industry standard",
    confidence: 0.8,
    relevanceToIntent: 0.9,
    ...overrides,
  };
}

function makeLeaf(): TreeNode {
  return {
    id: "leaf-1",
    parentId: null,
    depth: 2,
    phase: "implementation",
    status: "pending",
    branchLabel: "OTel",
    branchDescription: "Use OpenTelemetry",
    context: baseContext,
    children: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("Critic dry-run", () => {
  const critic = new Critic({ openai, model: "gpt-test", dryRun: true });

  it("auditCoverage returns an empty-gap audit", async () => {
    const audit = await critic.auditCoverage(baseContext, "consensus summary");
    expect(audit.coverageGaps).toEqual([]);
    expect(audit.premortem).toMatch(/dry-run/i);
    expect(audit.followUpRoundFired).toBe(false);
  });

  it("evaluateAlternative returns a populated evaluation", async () => {
    const evaluation = await critic.evaluateAlternative(makeAlternative(), baseContext);
    expect(evaluation.reversibility.value).toMatch(/one-way|reversible-with-effort|freely-reversible/);
    expect(evaluation.counterCase.length).toBeGreaterThan(0);
    expect(evaluation.falsifier.length).toBeGreaterThan(0);
  });

  it("evaluateSketch returns a sketch with embedded evaluation", async () => {
    const sketch = await critic.evaluateSketch(makeLeaf());
    expect(sketch.leafId).toBe("leaf-1");
    expect(sketch.criticEvaluation.blastRadius.value).toMatch(/low|medium|high/);
    expect(sketch.approach.length).toBeGreaterThan(0);
  });
});
