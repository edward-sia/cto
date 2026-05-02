import type { ModelAssignmentConfig, ModelStage, ModelTier, ModelTierConfig, RunConfig } from "../types/index.js";

export const DEFAULT_MODEL_ASSIGNMENTS: ModelAssignmentConfig = {
  analyzer: "cheap",
  decomposer: "cheap",
  dossier: "cheap",
  debate: "mid",
  moderator: "cheap",
  summarizer: "cheap",
  sketch: "mid",
  sketchJudge: "strong",
  judge: "strong",
  synthesis: "mid",
};

export function defaultModelTiers(model: string): ModelTierConfig {
  return {
    cheap: model,
    mid: model,
    strong: model,
  };
}

export function normalizeModelTiers(
  reasoningModel: string,
  tiers?: Partial<ModelTierConfig>
): ModelTierConfig {
  return {
    ...defaultModelTiers(reasoningModel),
    ...tiers,
  };
}

export function normalizeModelAssignments(
  assignments?: Partial<ModelAssignmentConfig>
): ModelAssignmentConfig {
  return {
    ...DEFAULT_MODEL_ASSIGNMENTS,
    ...assignments,
  };
}

export function modelForStage(
  config: Pick<RunConfig, "reasoningModel" | "judgeModel" | "modelTiers" | "modelAssignments">,
  stage: ModelStage
): string {
  const tier: ModelTier = config.modelAssignments?.[stage] ?? DEFAULT_MODEL_ASSIGNMENTS[stage];
  return config.modelTiers?.[tier] ?? (stage === "judge" ? config.judgeModel : config.reasoningModel);
}
