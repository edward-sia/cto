import { DEFAULT_LLM_PROVIDER_CONFIG } from "./config.js";
import { getLLMProviderDefinition } from "./registry.js";
import { LLMRouter } from "./router.js";
import type { LLMClient, LLMProviderConfig } from "./types.js";

export interface LLMClientOptions {
  provider: string;
  dryRun: boolean;
  apiKeyEnv?: string;
  baseURL?: string;
  config?: LLMProviderConfig;
  skipProviderKeyCheck?: boolean;
}

export function makeLLMClient(options: LLMClientOptions): LLMClient {
  const config = options.config ?? DEFAULT_LLM_PROVIDER_CONFIG;
  const provider = getLLMProviderDefinition(options.provider, config);
  const apiKeyEnv = options.apiKeyEnv ?? provider.apiKeyEnv;
  const apiKey = process.env[apiKeyEnv];

  if (!apiKey && !options.dryRun && !options.skipProviderKeyCheck) {
    throw new Error(
      `${provider.label} requires ${apiKeyEnv}. Set it in your environment, or pass --dry-run to skip LLM calls.`
    );
  }

  return new LLMRouter({
    config,
    dryRun: options.dryRun,
    defaultProvider: options.provider,
    providerOverrides: {
      [options.provider]: {
        apiKeyEnv,
        baseURL: options.baseURL,
      },
    },
  });
}
