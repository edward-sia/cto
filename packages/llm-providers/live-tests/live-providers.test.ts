import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLM_PROVIDER_CONFIG,
  LLMRouter,
  type LLMProviderConfig,
  type NormalizedLLMResponse,
} from "../src/index.js";

type ProviderId = "openai" | "openrouter" | "gemini" | "deepseek" | "claude" | "edenai";

interface LiveProviderCase {
  provider: ProviderId;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
}

const LIVE_ENABLED = process.env.CTO_LIVE_PROVIDER_TESTS === "1";
const LIVE_PROVIDER_FILTER = process.env.CTO_LIVE_PROVIDER_FILTER
  ?.split(",")
  .map((provider) => provider.trim())
  .filter(Boolean);
const LIVE_REQUEST_TIMEOUT_MS = Number(process.env.CTO_LIVE_PROVIDER_TIMEOUT_MS ?? 20_000);

const LIVE_PROVIDERS: LiveProviderCase[] = [
  {
    provider: "openai",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "CTO_LIVE_OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
  },
  {
    provider: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "CTO_LIVE_OPENROUTER_MODEL",
    defaultModel: DEFAULT_LLM_PROVIDER_CONFIG.providers.openrouter.defaultModel,
  },
  {
    provider: "gemini",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "CTO_LIVE_GEMINI_MODEL",
    defaultModel: DEFAULT_LLM_PROVIDER_CONFIG.providers.gemini.defaultModel,
  },
  {
    provider: "deepseek",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "CTO_LIVE_DEEPSEEK_MODEL",
    defaultModel: DEFAULT_LLM_PROVIDER_CONFIG.providers.deepseek.defaultModel,
  },
  {
    provider: "claude",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "CTO_LIVE_CLAUDE_MODEL",
    defaultModel: DEFAULT_LLM_PROVIDER_CONFIG.providers.claude.defaultModel,
  },
  {
    provider: "edenai",
    keyEnv: "EDENAI_API_KEY",
    modelEnv: "CTO_LIVE_EDENAI_MODEL",
    defaultModel: DEFAULT_LLM_PROVIDER_CONFIG.providers.edenai.defaultModel,
  },
].filter((providerCase) => !LIVE_PROVIDER_FILTER?.length || LIVE_PROVIDER_FILTER.includes(providerCase.provider));

const describeLive = LIVE_ENABLED ? describe : describe.skip;

describeLive("live provider contract smoke tests", () => {
  for (const providerCase of LIVE_PROVIDERS) {
    const key = process.env[providerCase.keyEnv];
    const model = process.env[providerCase.modelEnv] ?? providerCase.defaultModel;
    const runIfKeyExists = key ? it : it.skip;

    runIfKeyExists(`${providerCase.provider} returns normalized text, usage, and attempts`, async () => {
      const response = await createLiveRouter(providerCase).createChatCompletion({
        provider: providerCase.provider,
        model,
        maxTokens: 80,
        timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: "Reply with one short sentence: live provider contract ok.",
          },
        ],
      });

      expectNormalizedProviderResponse(response, providerCase.provider, model);
      expect(response.text.trim().length).toBeGreaterThan(0);
    });

  }
});

function createLiveRouter(providerCase: LiveProviderCase): LLMRouter {
  return new LLMRouter({
    config: liveConfigFor(providerCase),
    defaultProvider: providerCase.provider,
    providerOverrides: {
      [providerCase.provider]: {
        apiKeyEnv: providerCase.keyEnv,
      },
    },
  });
}

function liveConfigFor(providerCase: LiveProviderCase): LLMProviderConfig {
  const provider = DEFAULT_LLM_PROVIDER_CONFIG.providers[providerCase.provider];
  return {
    providers: {
      [providerCase.provider]: provider,
    },
    modelTiers: {
      cheap: [{ provider: providerCase.provider, model: process.env[providerCase.modelEnv] ?? providerCase.defaultModel }],
      mid: [{ provider: providerCase.provider, model: process.env[providerCase.modelEnv] ?? providerCase.defaultModel }],
      strong: [{ provider: providerCase.provider, model: process.env[providerCase.modelEnv] ?? providerCase.defaultModel }],
    },
    fallback: DEFAULT_LLM_PROVIDER_CONFIG.fallback,
  };
}

function expectNormalizedProviderResponse(
  response: NormalizedLLMResponse,
  provider: ProviderId,
  model: string
): void {
  expect(response.provider).toBe(provider);
  expect(response.model).toBe(model);
  expect(response.raw).toBeDefined();
  expect(response.usage.inputTokens).toBeGreaterThanOrEqual(0);
  expect(response.usage.cachedInputTokens).toBeGreaterThanOrEqual(0);
  expect(response.usage.outputTokens).toBeGreaterThanOrEqual(0);
  expect(response.attempts).toEqual([
    expect.objectContaining({
      provider,
      model,
      status: "success",
    }),
  ]);
}
