import { describe, expect, it } from "vitest";
import { getPhaseForDepth } from "../../src/utils/phase.js";

describe("getPhaseForDepth", () => {
  it("always assigns requirements to the root node regardless of maxDepth", () => {
    expect(getPhaseForDepth(0, 2)).toBe("requirements");
    expect(getPhaseForDepth(0, 4)).toBe("requirements");
    expect(getPhaseForDepth(0, 8)).toBe("requirements");
  });

  it("does not assign requirements to depth-1 nodes in a maxDepth=2 tree", () => {
    expect(getPhaseForDepth(1, 2)).not.toBe("requirements");
  });

  it("scales phases proportionally across a maxDepth=8 tree", () => {
    expect(getPhaseForDepth(0, 8)).toBe("requirements");
    expect(getPhaseForDepth(1, 8)).toBe("requirements");
    expect(getPhaseForDepth(2, 8)).toBe("architecture");
    expect(getPhaseForDepth(3, 8)).toBe("architecture");
    expect(getPhaseForDepth(4, 8)).toBe("implementation");
    expect(getPhaseForDepth(5, 8)).toBe("implementation");
    expect(getPhaseForDepth(6, 8)).toBe("validation");
    expect(getPhaseForDepth(7, 8)).toBe("validation");
  });

  it("clamps depths beyond maxDepth to the last phase", () => {
    expect(getPhaseForDepth(10, 8)).toBe("validation");
  });

  it("handles maxDepth=1 by assigning requirements at depth 0", () => {
    expect(getPhaseForDepth(0, 1)).toBe("requirements");
  });
});
