import OpenAI from "openai";
import type { LLMProvider, RunConfig } from "../types/index.js";

export interface LLMProviderDefinition {
  id: LLMProvider;
  label: string;
  apiKeyEnv: string;
  baseURL?: string;
  defaultModel: string;
}

export const LLM_PROVIDERS: Record<LLMProvider, LLMProviderDefinition> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "qwen/qwen3-coder:free",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-3-flash-preview",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
  },
};

export const LLM_PROVIDER_IDS = Object.keys(LLM_PROVIDERS) as LLMProvider[];

export interface LLMClientOptions {
  provider: LLMProvider;
  dryRun: boolean;
  apiKeyEnv?: string;
  baseURL?: string;
}

export function parseLLMProvider(raw: string | undefined): LLMProvider {
  const provider = (raw ?? "openai").toLowerCase();
  if (provider in LLM_PROVIDERS) return provider as LLMProvider;
  throw new Error(`Unsupported provider "${raw}". Supported providers: ${LLM_PROVIDER_IDS.join(", ")}`);
}

export function getLLMProviderDefinition(provider: LLMProvider): LLMProviderDefinition {
  return LLM_PROVIDERS[provider];
}

export function resolveProviderModel(provider: LLMProvider, requestedModel: string, modelWasExplicit: boolean): string {
  if (modelWasExplicit) return requestedModel;
  return getLLMProviderDefinition(provider).defaultModel;
}

export function makeLLMClient(options: LLMClientOptions): OpenAI {
  const provider = getLLMProviderDefinition(options.provider);
  const apiKeyEnv = options.apiKeyEnv ?? provider.apiKeyEnv;
  const apiKey = process.env[apiKeyEnv];
  const baseURL = options.baseURL ?? provider.baseURL;

  if (!apiKey && !options.dryRun) {
    throw new Error(
      `${provider.label} requires ${apiKeyEnv}. Set it in your environment, or pass --dry-run to skip LLM calls.`
    );
  }

  return new OpenAI({
    apiKey: apiKey ?? "dry-run-placeholder",
    ...(baseURL ? { baseURL } : {}),
    ...(options.provider === "openrouter"
      ? {
          defaultHeaders: {
            "X-Title": process.env.OPENROUTER_APP_NAME ?? "Cambrian Tree Orchestrator",
            ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
          },
        }
      : {}),
  });
}

export function providerLabel(config: Pick<RunConfig, "llmProvider" | "llmBaseURL" | "llmApiKeyEnv">): string {
  const provider = getLLMProviderDefinition(config.llmProvider ?? "openai");
  const base = config.llmBaseURL ?? provider.baseURL;
  const baseSuffix = base ? ` (${base})` : "";
  const keySuffix = config.llmApiKeyEnv && config.llmApiKeyEnv !== provider.apiKeyEnv
    ? ` via ${config.llmApiKeyEnv}`
    : "";
  return `${provider.label}${keySuffix}${baseSuffix}`;
}
