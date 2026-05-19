import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLM_PROVIDER_CONFIG,
  getLLMProviderDefinition,
  listLLMProviderIds,
} from "../src/index.js";

describe("provider-native config", () => {
  it("defines built-in providers without CTO stage concepts", () => {
    expect(listLLMProviderIds(DEFAULT_LLM_PROVIDER_CONFIG)).toEqual([
      "openai",
      "openrouter",
      "gemini",
      "deepseek",
      "claude",
      "edenai",
    ]);
    expect(getLLMProviderDefinition("gemini", DEFAULT_LLM_PROVIDER_CONFIG)).toMatchObject({
      adapter: "openai-compatible",
      apiKeyEnv: "GEMINI_API_KEY",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      defaultModel: "gemini-3-flash-preview",
      requestDefaults: {
        reasoningEffort: "minimal",
      },
    });
    expect(JSON.stringify(DEFAULT_LLM_PROVIDER_CONFIG)).not.toContain("debate");
    expect(JSON.stringify(DEFAULT_LLM_PROVIDER_CONFIG)).not.toContain("judge");
  });

  it("defines EdenAI through the OpenAI-compatible gateway endpoint", () => {
    expect(getLLMProviderDefinition("edenai", DEFAULT_LLM_PROVIDER_CONFIG)).toMatchObject({
      adapter: "openai-compatible",
      label: "EdenAI",
      apiKeyEnv: "EDENAI_API_KEY",
      baseURL: "https://api.edenai.run/v3",
      defaultModel: "openai/gpt-4o",
    });
  });

  it("represents cheap, mid, and strong tiers as ordered fallback candidate lists", () => {
    expect(DEFAULT_LLM_PROVIDER_CONFIG.modelTiers.cheap).toEqual([
      { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
      { provider: "gemini", model: "gemini-3-flash-preview" },
    ]);
    expect(DEFAULT_LLM_PROVIDER_CONFIG.modelTiers.mid.length).toBeGreaterThan(1);
    expect(DEFAULT_LLM_PROVIDER_CONFIG.modelTiers.strong).toEqual([
      { provider: "openai", model: "gpt-4o" },
      { provider: "claude", model: "claude-sonnet-4-5" },
    ]);
  });
});
