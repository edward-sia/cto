import { describe, expect, it } from "vitest";
import { rankSketches } from "../../src/critic/sketch-ranker.js";
import type { LeafImplementationSketch } from "../../src/types/index.js";

function makeSketch(
  id: string,
  overrides: Partial<LeafImplementationSketch> = {}
): LeafImplementationSketch {
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
      blastRadius: { value: "medium", note: "" },
      timeToSignal: { value: "medium", note: "" },
      counterCase: "",
      falsifier: "",
    },
    ...overrides,
  };
}

describe("rankSketches", () => {
  it("prefers freely-reversible + low blast + fast signal", () => {
    const safe = makeSketch("safe", {
      criticEvaluation: {
        reversibility: { value: "freely-reversible", note: "" },
        blastRadius: { value: "low", note: "" },
        timeToSignal: { value: "fast", note: "" },
        counterCase: "",
        falsifier: "",
      },
    });
    const risky = makeSketch("risky", {
      criticEvaluation: {
        reversibility: { value: "one-way", note: "" },
        blastRadius: { value: "high", note: "" },
        timeToSignal: { value: "slow", note: "" },
        counterCase: "",
        falsifier: "",
      },
    });
    const ranked = rankSketches([risky, safe]);
    expect(ranked.map((s) => s.leafId)).toEqual(["safe", "risky"]);
  });

  it("breaks ties on complexity (low first), then confidence (high first)", () => {
    const a = makeSketch("a", { estimatedComplexity: "high", confidence: 0.9 });
    const b = makeSketch("b", { estimatedComplexity: "low", confidence: 0.7 });
    const c = makeSketch("c", { estimatedComplexity: "low", confidence: 0.95 });
    const ranked = rankSketches([a, b, c]);
    expect(ranked.map((s) => s.leafId)).toEqual(["c", "b", "a"]);
  });

  it("is stable for already-sorted input", () => {
    const sorted = [
      makeSketch("a", {
        criticEvaluation: {
          reversibility: { value: "freely-reversible", note: "" },
          blastRadius: { value: "low", note: "" },
          timeToSignal: { value: "fast", note: "" },
          counterCase: "",
          falsifier: "",
        },
      }),
      makeSketch("b"),
    ];
    expect(rankSketches(sorted).map((s) => s.leafId)).toEqual(["a", "b"]);
  });
});
