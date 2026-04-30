import { describe, expect, it } from "vitest";
import { computeFitnessScore } from "../../src/judge/fitness.js";
import type { CodexExecutionResult, JudgeScore } from "../../src/types/index.js";

const baseJudge: JudgeScore = {
  functionalCompleteness: 8,
  architecturalQuality: 7,
  testCoverage: 7,
  intentAlignment: 8,
  realWorldFit: 7,
  simplicity: 8,
  uncertainty: 0.2,
  evidence: ["judge evidence"],
  failures: [],
  composite: 7.6,
  rationale: "good",
};

const baseResult: CodexExecutionResult = {
  threadId: "t",
  success: true,
  filesChanged: [],
  output: "done",
  durationMs: 1000,
};

describe("computeFitnessScore", () => {
  it("rewards passing verification", () => {
    const result: CodexExecutionResult = {
      ...baseResult,
      verification: {
        passed: 2,
        failed: 0,
        requiredFailed: 0,
        results: [
          { commandId: "test", command: "npm test", exitCode: 0, passed: true, durationMs: 10, stdout: "ok", stderr: "" },
          { commandId: "typecheck", command: "npm run typecheck", exitCode: 0, passed: true, durationMs: 10, stdout: "ok", stderr: "" },
        ],
      },
    };

    const fitness = computeFitnessScore(baseJudge, result);

    expect(fitness.verification).toBe(10);
    expect(fitness.composite).toBeGreaterThan(7);
    expect(fitness.evidence).toContain("Verification passed: npm test");
  });

  it("caps composite when required verification fails", () => {
    const result: CodexExecutionResult = {
      ...baseResult,
      verification: {
        passed: 0,
        failed: 1,
        requiredFailed: 1,
        results: [
          { commandId: "test", command: "npm test", exitCode: 1, passed: false, durationMs: 10, stdout: "", stderr: "fail" },
        ],
      },
    };

    const fitness = computeFitnessScore(baseJudge, result);

    expect(fitness.verification).toBe(0);
    expect(fitness.composite).toBeLessThanOrEqual(4);
    expect(fitness.failures).toContain("Verification failed: npm test");
  });

  it("handles legacy judge scores missing uncertainty, evidence, and failures", () => {
    const legacyJudge = {
      functionalCompleteness: 8,
      architecturalQuality: 7,
      testCoverage: 7,
      intentAlignment: 8,
      realWorldFit: 7,
      simplicity: 8,
      composite: 7.6,
      rationale: "legacy",
    } as JudgeScore;

    const fitness = computeFitnessScore(legacyJudge, baseResult);

    expect(fitness.uncertaintyPenalty).toBe(5);
    expect(fitness.evidence).toEqual([]);
    expect(fitness.failures).toEqual([]);
    expect(Number.isFinite(fitness.composite)).toBe(true);
  });

  it("returns zero composite and verification for failed execution", () => {
    const result: CodexExecutionResult = {
      ...baseResult,
      success: false,
      output: "execution failed",
    };

    const fitness = computeFitnessScore(baseJudge, result);

    expect(fitness.verification).toBe(0);
    expect(fitness.composite).toBe(0);
  });

  it("uses neutral verification when no verification results or failed test results exist", () => {
    const fitness = computeFitnessScore(baseJudge, baseResult);

    expect(fitness.verification).toBe(5);
  });

  it("does not cap optional failed verification when required verification passes", () => {
    const result: CodexExecutionResult = {
      ...baseResult,
      verification: {
        passed: 1,
        failed: 1,
        requiredFailed: 0,
        results: [
          { commandId: "test", command: "npm test", exitCode: 0, passed: true, durationMs: 10, stdout: "ok", stderr: "" },
          {
            commandId: "lint",
            command: "npm run lint",
            exitCode: 1,
            passed: false,
            durationMs: 10,
            stdout: "",
            stderr: "optional fail",
          },
        ],
      },
    };

    const fitness = computeFitnessScore(baseJudge, result);

    expect(fitness.verification).toBe(5);
    expect(fitness.composite).toBeGreaterThan(4);
    expect(fitness.failures).toContain("Verification failed: npm run lint");
  });

  it("handles verification without a results array", () => {
    const result = {
      ...baseResult,
      verification: {
        passed: 0,
        failed: 0,
        requiredFailed: 0,
      },
    } as CodexExecutionResult;

    const fitness = computeFitnessScore(baseJudge, result);

    expect(fitness.verification).toBe(5);
    expect(Number.isFinite(fitness.composite)).toBe(true);
  });
});
