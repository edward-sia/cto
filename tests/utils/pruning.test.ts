import { describe, expect, it } from "vitest";
import { getPruneThresholdForDepth, parsePruneSchedule } from "../../src/utils/pruning.js";

describe("parsePruneSchedule", () => {
  it("parses comma-separated depth threshold pairs", () => {
    expect(parsePruneSchedule("0:0.45,1:0.6,3:0.8")).toEqual([
      { depth: 0, threshold: 0.45 },
      { depth: 1, threshold: 0.6 },
      { depth: 3, threshold: 0.8 },
    ]);
  });

  it("trims whitespace around depth and threshold values", () => {
    expect(parsePruneSchedule("0: 0.45, 2: 0.7")).toEqual([
      { depth: 0, threshold: 0.45 },
      { depth: 2, threshold: 0.7 },
    ]);
  });

  it("rejects malformed entries", () => {
    expect(() => parsePruneSchedule("0:0.4,bad")).toThrow("Invalid prune schedule entry");
  });

  it("rejects missing depth or threshold values", () => {
    expect(() => parsePruneSchedule("0:")).toThrow("Invalid prune schedule entry");
    expect(() => parsePruneSchedule(":0.5")).toThrow("Invalid prune schedule entry");
    expect(() => parsePruneSchedule("0:   ")).toThrow("Invalid prune schedule entry");
    expect(() => parsePruneSchedule("   :0.5")).toThrow("Invalid prune schedule entry");
  });

  it("rejects extra colon segments", () => {
    expect(() => parsePruneSchedule("0:0.5:extra")).toThrow("Invalid prune schedule entry");
  });

  it("rejects empty entries", () => {
    expect(() => parsePruneSchedule("0:0.4,,1:0.5")).toThrow("Invalid prune schedule entry");
  });

  it("rejects thresholds outside 0 to 1", () => {
    expect(() => parsePruneSchedule("0:1.5")).toThrow("threshold must be between 0 and 1");
  });

  it("rejects duplicate depths", () => {
    expect(() => parsePruneSchedule("1:0.4,1:0.8")).toThrow("Duplicate prune schedule depth");
  });
});

describe("getPruneThresholdForDepth", () => {
  it("uses the nearest schedule point at or below the depth", () => {
    const schedule = [
      { depth: 0, threshold: 0.45 },
      { depth: 2, threshold: 0.7 },
      { depth: 4, threshold: 0.85 },
    ];

    expect(getPruneThresholdForDepth(0, 0.5, schedule)).toBe(0.45);
    expect(getPruneThresholdForDepth(1, 0.5, schedule)).toBe(0.45);
    expect(getPruneThresholdForDepth(3, 0.5, schedule)).toBe(0.7);
    expect(getPruneThresholdForDepth(6, 0.5, schedule)).toBe(0.85);
  });

  it("falls back to the global threshold when no schedule is provided", () => {
    expect(getPruneThresholdForDepth(2, 0.65, undefined)).toBe(0.65);
  });

  it("falls back to the global threshold when no schedule point is at or below the depth", () => {
    expect(getPruneThresholdForDepth(0, 0.5, [{ depth: 2, threshold: 0.8 }])).toBe(0.5);
  });
});
