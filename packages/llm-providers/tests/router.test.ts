import { describe, expect, it, vi } from "vitest";
import {
  LLMProviderError,
  LLMRouter,
  type LLMProviderAdapter,
  type LLMProviderConfig,
} from "../src/index.js";

function testConfig(): LLMProviderConfig {
  return {
    providers: {
      first: {
        adapter: "test",
        label: "First Provider",
        apiKeyEnv: "FIRST_API_KEY",
        defaultModel: "first-default",
      },
      second: {
        adapter: "test",
        label: "Second Provider",
        apiKeyEnv: "SECOND_API_KEY",
        defaultModel: "second-default",
      },
    },
    modelTiers: {
      cheap: [{ provider: "first", model: "first-cheap" }],
      mid: [
        { provider: "first", model: "first-mid" },
        { provider: "second", model: "second-mid" },
      ],
      strong: [{ provider: "second", model: "second-strong" }],
    },
    fallback: {
      on: ["rate_limit", "timeout", "overloaded", "server_error"],
    },
  };
}

describe("LLMRouter", () => {
  it("falls through tier candidates when the first provider is rate limited", async () => {
    const complete = vi.fn<LLMProviderAdapter["complete"]>()
      .mockRejectedValueOnce(Object.assign(new Error("too many requests"), { status: 429 }))
      .mockResolvedValueOnce({
        text: "fallback ok",
        raw: { ok: true },
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          cacheMissInputTokens: 10,
          outputTokens: 2,
          reasoningOutputTokens: 0,
        },
      });
    const router = new LLMRouter({
      config: testConfig(),
      adapters: {
        test: { complete },
      },
      env: {
        FIRST_API_KEY: "first-key",
        SECOND_API_KEY: "second-key",
      },
    });

    const response = await router.createChatCompletion({
      tier: "mid",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response.text).toBe("fallback ok");
    expect(response.provider).toBe("second");
    expect(response.model).toBe("second-mid");
    expect(response.requestedTier).toBe("mid");
    expect(response.attempts).toEqual([
      expect.objectContaining({ provider: "first", model: "first-mid", status: "failed", errorClass: "rate_limit" }),
      expect.objectContaining({ provider: "second", model: "second-mid", status: "success" }),
    ]);
  });

  it("does not fall back when a candidate fails with an invalid model error", async () => {
    const complete = vi.fn<LLMProviderAdapter["complete"]>()
      .mockRejectedValue(Object.assign(new Error("invalid model"), { status: 404 }));
    const router = new LLMRouter({
      config: testConfig(),
      adapters: {
        test: { complete },
      },
      env: {
        FIRST_API_KEY: "first-key",
        SECOND_API_KEY: "second-key",
      },
    });

    await expect(router.createChatCompletion({
      tier: "mid",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      errorClass: "invalid_model",
      attempts: [
        expect.objectContaining({ provider: "first", model: "first-mid", status: "failed" }),
      ],
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("supports direct provider and model calls without tier fallback", async () => {
    const complete = vi.fn<LLMProviderAdapter["complete"]>().mockResolvedValue({
      text: "direct ok",
      raw: {},
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        cacheMissInputTokens: 1,
        outputTokens: 1,
        reasoningOutputTokens: 0,
      },
    });
    const router = new LLMRouter({
      config: testConfig(),
      adapters: {
        test: { complete },
      },
      env: {
        SECOND_API_KEY: "second-key",
      },
    });

    const response = await router.createChatCompletion({
      provider: "second",
      model: "custom-frontier",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response.text).toBe("direct ok");
    expect(response.provider).toBe("second");
    expect(response.model).toBe("custom-frontier");
    expect(response.requestedTier).toBeUndefined();
    expect(response.attempts).toEqual([
      expect.objectContaining({ provider: "second", model: "custom-frontier", status: "success" }),
    ]);
  });

  it("classifies missing API keys as auth errors and does not call adapters", async () => {
    const complete = vi.fn<LLMProviderAdapter["complete"]>();
    const router = new LLMRouter({
      config: testConfig(),
      adapters: {
        test: { complete },
      },
      env: {},
    });

    await expect(router.createChatCompletion({
      provider: "first",
      model: "first-default",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toBeInstanceOf(LLMProviderError);
    await expect(router.createChatCompletion({
      provider: "first",
      model: "first-default",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toMatchObject({
      errorClass: "auth_error",
    });
    expect(complete).not.toHaveBeenCalled();
  });
});

