import { describe, expect, it } from "vitest";
import {
  CriticChoiceEvaluationSchema,
  CriticCoverageAuditSchema,
} from "../../src/schemas/index.js";

describe("CriticChoiceEvaluation schema", () => {
  it("accepts a fully populated evaluation", () => {
    const parsed = CriticChoiceEvaluationSchema.parse({
      reversibility: { value: "reversible-with-effort", note: "Migration adds a column; reverting needs a backfill." },
      blastRadius: { value: "medium", note: "Affects all checkout API consumers." },
      timeToSignal: { value: "fast", note: "Synthetic monitor reports within 5 minutes." },
      counterCase: "Adds latency under sustained traffic spikes.",
      falsifier: "p99 latency exceeds 250ms in staging.",
    });
    expect(parsed.reversibility.value).toBe("reversible-with-effort");
    expect(parsed.blastRadius.note).toContain("checkout");
  });

  it("rejects an invalid reversibility enum value", () => {
    const result = CriticChoiceEvaluationSchema.safeParse({
      reversibility: { value: "permanent", note: "n" },
      blastRadius: { value: "medium", note: "n" },
      timeToSignal: { value: "fast", note: "n" },
      counterCase: "x",
      falsifier: "y",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["reversibility", "value"]);
    }
  });

  it("rejects an empty note on an axis", () => {
    const result = CriticChoiceEvaluationSchema.safeParse({
      reversibility: { value: "freely-reversible", note: "" },
      blastRadius: { value: "medium", note: "n" },
      timeToSignal: { value: "fast", note: "n" },
      counterCase: "x",
      falsifier: "y",
    });
    expect(result.success).toBe(false);
  });
});

describe("CriticCoverageAudit schema", () => {
  it("accepts an audit with no gaps", () => {
    const parsed = CriticCoverageAuditSchema.parse({
      coverageGaps: [],
      premortem: "If this fails in 6 months it would be due to undocumented retry semantics.",
      auditedAt: new Date().toISOString(),
      followUpRoundFired: false,
    });
    expect(parsed.coverageGaps).toEqual([]);
    expect(parsed.followUpRoundFired).toBe(false);
  });

  it("accepts an audit listing gaps", () => {
    const parsed = CriticCoverageAuditSchema.parse({
      coverageGaps: [
        { dimension: "operability", reason: "No discussion of how this is monitored in prod." },
      ],
      premortem: "Operators will be unable to triage failures.",
      auditedAt: new Date().toISOString(),
      followUpRoundFired: true,
    });
    expect(parsed.coverageGaps).toHaveLength(1);
    expect(parsed.coverageGaps[0].dimension).toBe("operability");
  });
});
