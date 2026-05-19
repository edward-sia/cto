import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLM_PROVIDER_CONFIG,
  LLMRouter,
  type LLMClient,
  type LLMProviderConfig,
  type NormalizedLLMResponse,
} from "@cto/llm-providers";
import { TaskAnalyzer } from "../../src/analyzer/task-analyzer.js";
import { parseJsonObject } from "../../src/utils/json.js";

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

describeLive("live CTO provider integration smoke tests", () => {
  for (const providerCase of LIVE_PROVIDERS) {
    const key = process.env[providerCase.keyEnv];
    const model = process.env[providerCase.modelEnv] ?? providerCase.defaultModel;
    const runIfKeyExists = key ? it : it.skip;

    runIfKeyExists(`${providerCase.provider} supports CTO-style structured JSON extraction`, async () => {
      const response = await createLiveRouter(providerCase).createChatCompletion({
        provider: providerCase.provider,
        model,
        maxTokens: 140,
        timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Return only this JSON object, with no markdown:
{"provider":"${providerCase.provider}","ok":true,"items":[1,2,3]}`,
          },
        ],
      });

      expectNormalizedProviderResponse(response, providerCase.provider, model);
      const parsed = parseJsonObject<{ provider: string; ok: boolean; items: number[] }>(response.text);
      expect(parsed).toEqual({
        provider: providerCase.provider,
        ok: true,
        items: [1, 2, 3],
      });
    });

    runIfKeyExists(`${providerCase.provider} can drive CTO TaskAnalyzer output`, async () => {
      const analyzer = new TaskAnalyzer(createLiveClient(providerCase), model, false);

      const result = await analyzer.analyze("Build a tiny CLI that prints hello");

      expect(result.runMode).toMatch(/^(implementation|exploration)$/);
      expect(result.selectedAgents.length).toBeGreaterThan(0);
      expect(result.rationale.length).toBeGreaterThan(0);
      expect(result.rationale).not.toBe("Default panel (dry-run or analyzer fallback)");
    });
  }
});

function createLiveClient(providerCase: LiveProviderCase): LLMClient {
  const router = createLiveRouter(providerCase);
  return {
    createChatCompletion: (request) =>
      router.createChatCompletion({
        ...request,
        provider: request.provider ?? providerCase.provider,
        timeoutMs: request.timeoutMs ?? LIVE_REQUEST_TIMEOUT_MS,
      }),
  };
}

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
