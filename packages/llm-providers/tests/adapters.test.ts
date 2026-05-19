import { describe, expect, it, vi } from "vitest";
import {
  AnthropicLLMClient,
  normalizeAnthropicResponse,
  normalizeOpenAICompatibleResponse,
  OpenAICompatibleLLMClient,
} from "../src/index.js";

describe("OpenAI-compatible adapter", () => {
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

  it("normalizes text, cache, reasoning, and provider cost fields", () => {
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

    expect(normalized.text).toBe("OpenRouter response");
    expect(normalized.usage.inputTokens).toBe(1000);
    expect(normalized.usage.cachedInputTokens).toBe(500);
    expect(normalized.usage.cacheWriteTokens).toBe(300);
    expect(normalized.usage.reasoningOutputTokens).toBe(80);
    expect(normalized.usage.providerCost).toBe(0.002);
  });

  it("normalizes EdenAI-style top-level provider cost fields", () => {
    const normalized = normalizeOpenAICompatibleResponse({
      choices: [{ message: { content: "EdenAI response" } }],
      cost: 0.0015,
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
      },
    });

    expect(normalized.text).toBe("EdenAI response");
    expect(normalized.usage.inputTokens).toBe(50);
    expect(normalized.usage.outputTokens).toBe(10);
    expect(normalized.usage.providerCost).toBe(0.0015);
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
});

describe("Anthropic adapter", () => {
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
