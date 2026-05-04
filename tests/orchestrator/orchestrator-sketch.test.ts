import { describe, expect, it } from "vitest";
import { rankSketches } from "../../src/critic/sketch-ranker.js";
import type { LeafImplementationSketch } from "../../src/types/index.js";

function dryRunSketch(id: string, value: "low" | "medium" | "high"): LeafImplementationSketch {
  return {
    leafId: id,
    approach: "x",
    filesLikelyChanged: [],
    algorithmOrArchitecture: [],
    riskAreas: [],
    expectedTests: [],
    estimatedComplexity: "medium",
    confidence: 0.7,
    rationale: "",
    criticEvaluation: {
      reversibility: { value: "reversible-with-effort", note: "" },
      blastRadius: { value, note: "" },
      timeToSignal: { value: "medium", note: "" },
      counterCase: "",
      falsifier: "",
    },
  };
}

describe("rankSketches against a leaf set", () => {
  it("ranks lower blast radius first", () => {
    const ranked = rankSketches([
      dryRunSketch("hi", "high"),
      dryRunSketch("lo", "low"),
      dryRunSketch("md", "medium"),
    ]);
    expect(ranked.map((s) => s.leafId)).toEqual(["lo", "md", "hi"]);
  });
});
