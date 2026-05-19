import { describe, expect, it } from "vitest";
import { IntentDossierBuilder } from "../../src/analyzer/intent-dossier.js";
import type { LLMClient } from "@cto/llm-providers";

describe("IntentDossierBuilder", () => {
  it("returns a deterministic dossier in dry-run mode", async () => {
    const builder = new IntentDossierBuilder({} as OpenAI, "gpt-4o", true);

    const dossier = await builder.build("Build a REST API", {
      loadBearingClaims: ["Build a REST API"],
      undefinedTerms: [],
      inScope: ["API implementation"],
      outOfScope: ["mobile app"],
      knownUnknowns: ["auth provider"],
      feasibilityFlags: [],
      rationale: "dry-run",
    });

    expect(dossier.goal).toBe("Build a REST API");
    expect(dossier.acceptanceCriteria).toContain("Satisfies the original intent: Build a REST API");
    expect(dossier.nonGoals).toContain("mobile app");
    expect(dossier.knownUnknowns).toContain("auth provider");
  });

  it("falls back to a safe dossier when the model response is malformed", async () => {
    const llm: LLMClient = {
      createChatCompletion: async () => ({
        text: "not json",
        raw: {},
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
      }),
    };
    const builder = new IntentDossierBuilder(llm, "gpt-4o", false);

    const dossier = await builder.build("Ship a CLI", {
      loadBearingClaims: ["Ship a CLI"],
      undefinedTerms: [],
      inScope: ["CLI"],
      outOfScope: [],
      knownUnknowns: [],
      feasibilityFlags: [],
      rationale: "",
    });

    expect(dossier.goal).toBe("Ship a CLI");
    expect(dossier.acceptanceCriteria).toEqual(["Satisfies the original intent: Ship a CLI"]);
  });

  it("falls back and keeps usage when the model returns an incomplete dossier", async () => {
    const llm: LLMClient = {
      createChatCompletion: async () => ({
        text: "{}",
        raw: {},
        usage: { inputTokens: 12, cachedInputTokens: 4, cacheWriteTokens: 0, cacheMissInputTokens: 8, outputTokens: 3, reasoningOutputTokens: 0 },
      }),
    };
    const builder = new IntentDossierBuilder(llm, "gpt-4o", false);

    const dossier = await builder.build("Add export to CSV", {
      loadBearingClaims: ["Add export to CSV"],
      undefinedTerms: [],
      inScope: ["CSV export"],
      outOfScope: ["PDF export"],
      knownUnknowns: ["target table"],
      feasibilityFlags: ["existing data shape unknown"],
      rationale: "",
    });

    expect(dossier.goal).toBe("Add export to CSV");
    expect(dossier.acceptanceCriteria).toEqual(["Satisfies the original intent: Add export to CSV"]);
    expect(dossier.nonGoals).toEqual(["PDF export"]);
    expect(dossier.knownUnknowns).toEqual(["target table"]);
    expect(builder.llmUsage).toEqual({
      inputTokens: 12,
      cachedInputTokens: 4,
      cacheWriteTokens: 0,
      cacheMissInputTokens: 8,
      outputTokens: 3,
      reasoningOutputTokens: 0,
    });
  });
});
