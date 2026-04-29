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
    expect(u).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
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
    expect(u).toEqual({ inputTokens: 1000, cachedInputTokens: 600, outputTokens: 200 });
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
    expect(u).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });

  it("addUsage merges two LLMUsage records", () => {
    const a = { inputTokens: 100, cachedInputTokens: 40, outputTokens: 30 };
    const b = { inputTokens: 50, cachedInputTokens: 20, outputTokens: 10 };
    addUsage(a, b);
    expect(a).toEqual({ inputTokens: 150, cachedInputTokens: 60, outputTokens: 40 });
  });

  it("totalUsageTokens returns input + output (cached is part of input)", () => {
    expect(totalUsageTokens({ inputTokens: 1000, cachedInputTokens: 600, outputTokens: 200 })).toBe(1200);
  });
});
