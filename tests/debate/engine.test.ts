import { describe, expect, it } from "vitest";
import { ModeratorAssessmentSchema } from "../../src/schemas/index.js";

describe("ModeratorAssessmentSchema", () => {
  it("parses valid moderator output with relevanceToIntent", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
          relevanceToIntent: 0.9,
        },
      ],
      summary: "two paths",
    };
    const parsed = ModeratorAssessmentSchema.parse(raw);
    expect(parsed.alternatives[0].relevanceToIntent).toBe(0.9);
  });

  it("defaults relevanceToIntent to 0.5 when omitted (backward compat)", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
        },
      ],
      summary: "two paths",
    };
    const parsed = ModeratorAssessmentSchema.parse(raw);
    expect(parsed.alternatives[0].relevanceToIntent).toBe(0.5);
  });

  it("rejects relevanceToIntent outside [0,1]", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
          relevanceToIntent: 1.5,
        },
      ],
      summary: "two paths",
    };
    expect(() => ModeratorAssessmentSchema.parse(raw)).toThrow();
  });
});
