import { describe, expect, it } from "vitest";
import {
  FIXED_CORE_DIMENSIONS,
  combineCoverageDimensions,
} from "../../src/critic/dimensions.js";
import type { CoverageDimension } from "../../src/critic/types.js";

describe("FIXED_CORE_DIMENSIONS", () => {
  it("contains the five fixed-core entries by id", () => {
    const ids = FIXED_CORE_DIMENSIONS.map((d) => d.id).sort();
    expect(ids).toEqual([
      "assumptions",
      "correctness",
      "fit-for-stakeholder",
      "operability",
      "second-order-effects",
    ]);
  });

  it("marks every fixed-core dimension as fixed-core", () => {
    expect(FIXED_CORE_DIMENSIONS.every((d) => d.source === "fixed-core")).toBe(true);
  });
});

describe("combineCoverageDimensions", () => {
  it("returns just the fixed core when no intent-derived dimensions are provided", () => {
    expect(combineCoverageDimensions([]).map((d) => d.id)).toEqual(
      FIXED_CORE_DIMENSIONS.map((d) => d.id)
    );
  });

  it("appends intent-derived dimensions after the core, dedupes by id", () => {
    const intentDerived: CoverageDimension[] = [
      { id: "security", label: "Security / Threat Model", description: "Authn, authz, secrets.", source: "intent-derived" },
      { id: "operability", label: "duplicate", description: "ignored", source: "intent-derived" },
    ];
    const combined = combineCoverageDimensions(intentDerived);
    expect(combined.map((d) => d.id)).toEqual([
      "correctness",
      "fit-for-stakeholder",
      "operability",
      "assumptions",
      "second-order-effects",
      "security",
    ]);
    const op = combined.find((d) => d.id === "operability");
    expect(op?.source).toBe("fixed-core");
    expect(op?.label).not.toBe("duplicate");
  });
});
