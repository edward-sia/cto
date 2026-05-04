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
});
