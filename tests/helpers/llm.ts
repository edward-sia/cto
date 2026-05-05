import { vi } from "vitest";
import type { LLMClient, NormalizedLLMResponse } from "../../src/providers/llm-provider.js";
import type { LLMUsage } from "../../src/types/index.js";

export function makeMockLLM(
  text: string,
  usage: Partial<LLMUsage> = {}
): LLMClient & { createChatCompletion: ReturnType<typeof vi.fn> } {
  return {
    createChatCompletion: vi.fn().mockResolvedValue({
      text,
      raw: {},
      usage: {
        inputTokens: usage.inputTokens ?? 100,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        cacheMissInputTokens: usage.cacheMissInputTokens ?? 100,
        outputTokens: usage.outputTokens ?? 20,
        reasoningOutputTokens: usage.reasoningOutputTokens ?? 0,
        providerCost: usage.providerCost,
      },
    } satisfies NormalizedLLMResponse),
  };
}

export function makeFailingLLM(error: Error): LLMClient & { createChatCompletion: ReturnType<typeof vi.fn> } {
  return {
    createChatCompletion: vi.fn().mockRejectedValue(error),
  };
}
