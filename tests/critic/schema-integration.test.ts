import { describe, expect, it } from "vitest";
import {
  IntentDossierSchema,
  AlternativeSchema,
  LeafImplementationSketchSchema,
} from "../../src/schemas/index.js";

describe("IntentDossier with requiredCoverageDimensions", () => {
  it("defaults requiredCoverageDimensions to []", () => {
    const parsed = IntentDossierSchema.parse({
      goal: "g",
      userValue: "u",
      acceptanceCriteria: ["c"],
    });
    expect(parsed.requiredCoverageDimensions).toEqual([]);
  });

  it("accepts intent-derived dimension entries", () => {
    const parsed = IntentDossierSchema.parse({
      goal: "g",
      userValue: "u",
      acceptanceCriteria: ["c"],
      requiredCoverageDimensions: [
        { id: "security", label: "Security", description: "PII handling", source: "intent-derived" },
      ],
    });
    expect(parsed.requiredCoverageDimensions[0].id).toBe("security");
  });
});

describe("Alternative.criticEvaluation", () => {
  it("is optional", () => {
    const parsed = AlternativeSchema.parse({
      id: "alt-1",
      label: "A",
      description: "x",
      proposedBy: "tech-lead",
      rationale: "r",
    });
    expect(parsed.criticEvaluation).toBeUndefined();
  });
});

describe("LeafImplementationSketch.criticEvaluation", () => {
  it("requires criticEvaluation", () => {
    expect(() =>
      LeafImplementationSketchSchema.parse({
        leafId: "leaf-1",
        approach: "a",
      })
    ).toThrow(/criticEvaluation/i);
  });

  it("accepts a fully populated sketch", () => {
    const parsed = LeafImplementationSketchSchema.parse({
      leafId: "leaf-1",
      approach: "Use OTel SDK",
      filesLikelyChanged: ["src/tracing.ts"],
      algorithmOrArchitecture: ["wrap fetch"],
      riskAreas: ["sampling"],
      expectedTests: ["sampling test"],
      estimatedComplexity: "medium",
      confidence: 0.8,
      rationale: "well-supported",
      criticEvaluation: {
        reversibility: { value: "freely-reversible", note: "Feature flag controlled." },
        blastRadius: { value: "low", note: "Tracing only." },
        timeToSignal: { value: "fast", note: "Synthetic monitor." },
        counterCase: "OTel collector adds latency.",
        falsifier: "p99 > 250ms in staging.",
      },
    });
    expect(parsed.criticEvaluation.reversibility.value).toBe("freely-reversible");
    expect(parsed.criticEvaluation.timeToSignal.note).toContain("Synthetic");
  });
});
