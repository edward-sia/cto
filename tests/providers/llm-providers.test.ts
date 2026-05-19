import { describe, expect, it, vi } from "vitest";
import {
  LLM_PROVIDER_IDS,
  AnthropicLLMClient,
  getLLMProviderDefinition,
  makeLLMClient,
  normalizeAnthropicResponse,
  normalizeOpenAICompatibleResponse,
  OpenAICompatibleLLMClient,
  parseLLMProvider,
  providerLabel,
} from "@cto/llm-providers";

describe("LLM provider registry", () => {
  it("supports EdenAI as a first-class OpenAI-compatible provider", () => {
    expect(LLM_PROVIDER_IDS).toContain("edenai");
    expect(parseLLMProvider("edenai")).toBe("edenai");
    expect(getLLMProviderDefinition("edenai")).toMatchObject({
      adapter: "openai-compatible",
      apiKeyEnv: "EDENAI_API_KEY",
      baseURL: "https://api.edenai.run/v3",
      defaultModel: "openai/gpt-4o",
    });
  });

  it("rejects missing EdenAI API keys outside dry-run mode", () => {
    const previous = process.env.EDENAI_API_KEY;
    delete process.env.EDENAI_API_KEY;
    try {
      expect(() => makeLLMClient({ provider: "edenai", dryRun: false })).toThrow(
        "EdenAI requires EDENAI_API_KEY"
      );
    } finally {
      if (previous === undefined) {
        delete process.env.EDENAI_API_KEY;
      } else {
        process.env.EDENAI_API_KEY = previous;
      }
    }
  });

  it("supports Claude as a first-class provider", () => {
    expect(LLM_PROVIDER_IDS).toContain("claude");
    expect(parseLLMProvider("claude")).toBe("claude");
    expect(getLLMProviderDefinition("claude")).toMatchObject({
      apiKeyEnv: "ANTHROPIC_API_KEY",
      baseURL: "https://api.anthropic.com",
      defaultModel: "claude-sonnet-4-5",
      anthropicVersion: "2023-06-01",
    });
  });

  it("rejects missing Anthropic API keys outside dry-run mode", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => makeLLMClient({ provider: "claude", dryRun: false })).toThrow(
        "Claude / Anthropic requires ANTHROPIC_API_KEY"
      );
    } finally {
      if (previous === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previous;
      }
    }
  });

  it("labels custom Claude API key environment variables", () => {
    expect(providerLabel({
      llmProvider: "claude",
      llmApiKeyEnv: "TEAM_ANTHROPIC_KEY",
      llmBaseURL: "https://api.anthropic.com",
    })).toBe("Claude / Anthropic via TEAM_ANTHROPIC_KEY (https://api.anthropic.com)");
  });

  it("sets minimal Gemini reasoning by default to avoid truncating short structured responses", () => {
    expect(getLLMProviderDefinition("gemini")).toMatchObject({
      reasoningEffort: "minimal",
    });
  });
});

describe("OpenAICompatibleLLMClient", () => {
  it("passes provider default reasoning effort when configured", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const client = new OpenAICompatibleLLMClient(
      { chat: { completions: { create } } } as never,
      { defaultReasoningEffort: "minimal" }
    );

    await client.createChatCompletion({
      model: "gemini-3-flash-preview",
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 128,
    });

    expect(create.mock.calls[0][0]).toEqual(expect.objectContaining({
      reasoning_effort: "minimal",
    }));
  });
});

describe("OpenAI-compatible response normalization", () => {
  it("normalizes standard OpenAI-compatible text and token usage", () => {
    const normalized = normalizeOpenAICompatibleResponse({
      choices: [{ message: { content: "Hello from a compatible provider" } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 40 },
      },
    });

    expect(normalized.text).toBe("Hello from a compatible provider");
    expect(normalized.usage.inputTokens).toBe(100);
    expect(normalized.usage.cachedInputTokens).toBe(40);
    expect(normalized.usage.outputTokens).toBe(20);
  });

  it("normalizes DeepSeek cache hit and miss fields", () => {
    const normalized = normalizeOpenAICompatibleResponse({
      choices: [{ message: { content: "DeepSeek response" } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 120,
        prompt_cache_hit_tokens: 750,
        prompt_cache_miss_tokens: 250,
      },
    });

    expect(normalized.usage.cachedInputTokens).toBe(750);
    expect(normalized.usage.cacheMissInputTokens).toBe(250);
  });

  it("normalizes OpenRouter cache write and cost fields", () => {
    const normalized = normalizeOpenAICompatibleResponse({
      choices: [{ message: { content: "OpenRouter response" } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 120,
        prompt_tokens_details: {
          cached_tokens: 500,
          cache_write_tokens: 300,
        },
        completion_tokens_details: { reasoning_tokens: 80 },
        cost: 0.002,
      },
    });

    expect(normalized.usage.cachedInputTokens).toBe(500);
    expect(normalized.usage.cacheWriteTokens).toBe(300);
    expect(normalized.usage.reasoningOutputTokens).toBe(80);
    expect(normalized.usage.providerCost).toBe(0.002);
  });
});

describe("Anthropic response normalization", () => {
  it("normalizes Claude content blocks and cache usage fields", () => {
    const normalized = normalizeAnthropicResponse({
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "Claude" },
      ],
      usage: {
        input_tokens: 1000,
        output_tokens: 120,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 500,
      },
    });

    expect(normalized.text).toBe("Hello Claude");
    expect(normalized.usage.inputTokens).toBe(1000);
    expect(normalized.usage.cachedInputTokens).toBe(500);
    expect(normalized.usage.cacheWriteTokens).toBe(300);
    expect(normalized.usage.outputTokens).toBe(120);
  });
});

describe("AnthropicLLMClient", () => {
  it("maps system messages to top-level system and sends Anthropic headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Mapped" }],
        usage: { input_tokens: 10, output_tokens: 2 },
      }),
    });
    const client = new AnthropicLLMClient({
      apiKey: "test-key",
      baseURL: "https://api.anthropic.com",
      anthropicVersion: "2023-06-01",
      fetchImpl,
    });

    const response = await client.createChatCompletion({
      model: "claude-sonnet-4-5",
      messages: [
        { role: "system", content: "System rules" },
        { role: "user", content: "Hello" },
      ],
      temperature: 0.2,
      maxTokens: 512,
    });

    expect(response.text).toBe("Mapped");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        }),
      })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.system).toBe("System rules");
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
  });
});
