import type { LLMProviderConfig } from "./types.js";

export const DEFAULT_LLM_PROVIDER_CONFIG: LLMProviderConfig = {
  providers: {
    openai: {
      adapter: "openai-compatible",
      label: "OpenAI",
      apiKeyEnv: "OPENAI_API_KEY",
      defaultModel: "gpt-4o",
    },
    openrouter: {
      adapter: "openai-compatible",
      label: "OpenRouter",
      apiKeyEnv: "OPENROUTER_API_KEY",
      baseURL: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-oss-120b:free",
      defaultHeaders: {
        "X-Title": "Cambrian Tree Orchestrator",
      },
    },
    gemini: {
      adapter: "openai-compatible",
      label: "Google Gemini",
      apiKeyEnv: "GEMINI_API_KEY",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      defaultModel: "gemini-3-flash-preview",
      reasoningEffort: "minimal",
      requestDefaults: {
        reasoningEffort: "minimal",
      },
    },
    deepseek: {
      adapter: "openai-compatible",
      label: "DeepSeek",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      baseURL: "https://api.deepseek.com",
      defaultModel: "deepseek-v4-pro",
    },
    claude: {
      adapter: "anthropic",
      label: "Claude / Anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      baseURL: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      anthropicVersion: "2023-06-01",
      requestDefaults: {
        anthropicVersion: "2023-06-01",
      },
    },
    edenai: {
      adapter: "openai-compatible",
      label: "EdenAI",
      apiKeyEnv: "EDENAI_API_KEY",
      baseURL: "https://api.edenai.run/v3",
      defaultModel: "openai/gpt-4o",
    },
  },
  modelTiers: {
    cheap: [
      { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
      { provider: "gemini", model: "gemini-3-flash-preview" },
    ],
    mid: [
      { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
      { provider: "deepseek", model: "deepseek-v4-pro" },
    ],
    strong: [
      { provider: "openai", model: "gpt-4o" },
      { provider: "claude", model: "claude-sonnet-4-5" },
    ],
  },
  fallback: {
    on: ["rate_limit", "timeout", "overloaded", "server_error"],
  },
};
