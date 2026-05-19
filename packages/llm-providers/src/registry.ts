import { DEFAULT_LLM_PROVIDER_CONFIG } from "./config.js";
import type { LLMProviderConfig, LLMProviderDefinition } from "./types.js";

export const LLM_PROVIDER_IDS = Object.keys(DEFAULT_LLM_PROVIDER_CONFIG.providers);

export function listLLMProviderIds(config: LLMProviderConfig = DEFAULT_LLM_PROVIDER_CONFIG): string[] {
  return Object.keys(config.providers);
}

export function parseLLMProvider(raw: string | undefined, config: LLMProviderConfig = DEFAULT_LLM_PROVIDER_CONFIG): string {
  const provider = (raw ?? "openai").toLowerCase();
  if (provider in config.providers) return provider;
  throw new Error(`Unsupported provider "${raw}". Supported providers: ${listLLMProviderIds(config).join(", ")}`);
}

export function getLLMProviderDefinition(
  provider: string,
  config: LLMProviderConfig = DEFAULT_LLM_PROVIDER_CONFIG
): LLMProviderDefinition {
  const definition = config.providers[provider];
  if (!definition) {
    throw new Error(`Unsupported provider "${provider}". Supported providers: ${listLLMProviderIds(config).join(", ")}`);
  }
  return definition;
}

export function resolveProviderModel(
  provider: string,
  requestedModel: string,
  modelWasExplicit: boolean,
  config: LLMProviderConfig = DEFAULT_LLM_PROVIDER_CONFIG
): string {
  if (modelWasExplicit) return requestedModel;
  return getLLMProviderDefinition(provider, config).defaultModel;
}

export function providerLabel(
  runConfig: { llmProvider?: string; llmBaseURL?: string; llmApiKeyEnv?: string },
  config: LLMProviderConfig = DEFAULT_LLM_PROVIDER_CONFIG
): string {
  const provider = getLLMProviderDefinition(runConfig.llmProvider ?? "openai", config);
  const base = runConfig.llmBaseURL ?? provider.baseURL;
  const baseSuffix = base ? ` (${base})` : "";
  const keySuffix = runConfig.llmApiKeyEnv && runConfig.llmApiKeyEnv !== provider.apiKeyEnv
    ? ` via ${runConfig.llmApiKeyEnv}`
    : "";
  return `${provider.label}${keySuffix}${baseSuffix}`;
}

