import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { LeafSketcher } from "../../src/execution/sketcher.js";
import type { TreeNode } from "../../src/types/index.js";

describe("LeafSketcher", () => {
  it("produces deterministic dry-run sketches and scores", async () => {
    const sketcher = new LeafSketcher({} as OpenAI, "mid", "strong", true);
    const leaf = {
      id: "node-a",
      parentId: null,
      depth: 1,
      phase: "implementation",
      status: "completed",
      context: {
        originalIntent: "Build a REST API",
        branchDecision: "Approach A: lean path",
        acceptanceCriteria: ["Supports CRUD"],
        ancestorSummaries: [],
      },
      children: [],
      branchLabel: "Approach A",
      branchDescription: "Lean path",
      createdAt: "",
      updatedAt: "",
    } as TreeNode;

    const sketch = await sketcher.sketch(leaf);
    const score = await sketcher.score(leaf, sketch);

    expect(sketch.leafId).toBe("node-a");
    expect(sketch.confidence).toBeGreaterThan(0.8);
    expect(score.leafId).toBe("node-a");
    expect(score.composite).toBeGreaterThan(0);
  });
});
