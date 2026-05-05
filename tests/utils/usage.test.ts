import { describe, expect, it } from "vitest";
import {
  addUsage,
  addUsageFromResponse,
  emptyUsage,
  totalUsageTokens,
} from "../../src/utils/usage.js";

describe("usage helpers", () => {
  it("emptyUsage starts at zero on every field", () => {
    const u = emptyUsage();
    expect(u).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    });
  });

  it("addUsageFromResponse extracts prompt/completion/cached tokens", () => {
    const u = emptyUsage();
    addUsageFromResponse(u, {
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 600 },
      },
    });
    expect(u.inputTokens).toBe(1000);
    expect(u.cachedInputTokens).toBe(600);
    expect(u.outputTokens).toBe(200);
  });

  it("addUsageFromResponse extracts DeepSeek cache hit and miss tokens", () => {
    const u = emptyUsage();
    addUsageFromResponse(u, {
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_cache_hit_tokens: 700,
        prompt_cache_miss_tokens: 300,
      },
    });

    expect(u.inputTokens).toBe(1000);
    expect(u.cachedInputTokens).toBe(700);
    expect(u.cacheMissInputTokens).toBe(300);
    expect(u.outputTokens).toBe(200);
  });

  it("addUsageFromResponse extracts OpenRouter cache write and reasoning tokens", () => {
    const u = emptyUsage();
    addUsageFromResponse(u, {
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 600, cache_write_tokens: 250 },
        completion_tokens_details: { reasoning_tokens: 75 },
        cost: 0.0012,
      },
    });

    expect(u.cachedInputTokens).toBe(600);
    expect(u.cacheWriteTokens).toBe(250);
    expect(u.reasoningOutputTokens).toBe(75);
    expect(u.providerCost).toBe(0.0012);
  });

  it("addUsageFromResponse extracts Anthropic native usage tokens", () => {
    const u = emptyUsage();
    addUsageFromResponse(u, {
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 500,
      },
    });

    expect(u.inputTokens).toBe(1000);
    expect(u.cachedInputTokens).toBe(500);
    expect(u.cacheWriteTokens).toBe(300);
    expect(u.outputTokens).toBe(200);
  });

  it("addUsageFromResponse accumulates across multiple responses", () => {
    const u = emptyUsage();
    addUsageFromResponse(u, {
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    addUsageFromResponse(u, {
      usage: {
        prompt_tokens: 300,
        completion_tokens: 80,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    });
    expect(u.inputTokens).toBe(400);
    expect(u.cachedInputTokens).toBe(200);
    expect(u.outputTokens).toBe(130);
  });

  it("addUsageFromResponse is a no-op when usage is missing", () => {
    const u = emptyUsage();
    addUsageFromResponse(u, { usage: null });
    addUsageFromResponse(u, {});
    expect(u).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    });
  });

  it("addUsage merges two LLMUsage records", () => {
    const a = {
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheWriteTokens: 10,
      cacheMissInputTokens: 60,
      outputTokens: 30,
      reasoningOutputTokens: 5,
    };
    const b = {
      inputTokens: 50,
      cachedInputTokens: 20,
      cacheWriteTokens: 4,
      cacheMissInputTokens: 30,
      outputTokens: 10,
      reasoningOutputTokens: 2,
    };
    addUsage(a, b);
    expect(a).toEqual({
      inputTokens: 150,
      cachedInputTokens: 60,
      cacheWriteTokens: 14,
      cacheMissInputTokens: 90,
      outputTokens: 40,
      reasoningOutputTokens: 7,
    });
  });

  it("totalUsageTokens returns input + output (cached is part of input)", () => {
    expect(totalUsageTokens({
      inputTokens: 1000,
      cachedInputTokens: 600,
      cacheWriteTokens: 0,
      cacheMissInputTokens: 400,
      outputTokens: 200,
      reasoningOutputTokens: 0,
    })).toBe(1200);
  });
});
