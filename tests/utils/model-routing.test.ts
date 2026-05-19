import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ASSIGNMENTS,
  defaultModelTiers,
  modelForStage,
  normalizeModelAssignments,
  normalizeModelTiers,
} from "../../src/utils/model-routing.js";
import type { RunConfig } from "../../src/types/index.js";

describe("model routing", () => {
  it("defaults every tier to the selected reasoning model", () => {
    expect(defaultModelTiers("provider-default")).toEqual({
      cheap: "provider-default",
      mid: "provider-default",
      strong: "provider-default",
    });
  });

  it("allows internal tier overrides without changing unspecified tiers", () => {
    expect(normalizeModelTiers("base-model", { cheap: "small-model" })).toEqual({
      cheap: "small-model",
      mid: "base-model",
      strong: "base-model",
    });
  });

  it("routes stages through configured tiers", () => {
    const config = {
      reasoningModel: "reasoning",
      judgeModel: "judge",
      modelTiers: {
        cheap: "cheap-model",
        mid: "mid-model",
        strong: "strong-model",
      },
      modelAssignments: normalizeModelAssignments({
        analyzer: "cheap",
        debate: "mid",
        judge: "strong",
      }),
    } as Pick<RunConfig, "reasoningModel" | "judgeModel" | "modelTiers" | "modelAssignments">;

    expect(modelForStage(config, "analyzer")).toBe("cheap-model");
    expect(modelForStage(config, "debate")).toBe("mid-model");
    expect(modelForStage(config, "judge")).toBe("strong-model");
  });

  it("returns a tier route token when a stage uses provider-native fallback candidates", () => {
    const config = {
      reasoningModel: "reasoning",
      judgeModel: "judge",
      modelTiers: {
        cheap: "cheap-model",
        mid: [
          { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
          { provider: "deepseek", model: "deepseek-v4-pro" },
        ],
        strong: "strong-model",
      },
      modelAssignments: normalizeModelAssignments({
        debate: "mid",
      }),
    } as Pick<RunConfig, "reasoningModel" | "judgeModel" | "modelTiers" | "modelAssignments">;

    expect(modelForStage(config, "debate")).toBe("tier:mid");
  });

  it("falls back when saved config does not include optional routing fields", () => {
    const config = {
      reasoningModel: "reasoning",
      judgeModel: "judge",
    } as Pick<RunConfig, "reasoningModel" | "judgeModel" | "modelTiers" | "modelAssignments">;

    expect(modelForStage(config, "debate")).toBe("reasoning");
    expect(modelForStage(config, "judge")).toBe("judge");
  });

  it("keeps the intended default stage assignments", () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS.analyzer).toBe("cheap");
    expect(DEFAULT_MODEL_ASSIGNMENTS.moderator).toBe("cheap");
    expect(DEFAULT_MODEL_ASSIGNMENTS.debate).toBe("mid");
    expect(DEFAULT_MODEL_ASSIGNMENTS.judge).toBe("strong");
  });
});
