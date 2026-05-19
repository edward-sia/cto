import type { LLMUsage } from "./types.js";

export function emptyUsage(): LLMUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    cacheMissInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
}

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: number;
}

interface UsageBearing {
  usage?: ChatCompletionUsage | null;
  cost?: number | null;
}

export function addUsageFromResponse(target: LLMUsage, response: UsageBearing): void {
  if (response.cost !== undefined && response.cost !== null) {
    target.providerCost = (target.providerCost ?? 0) + response.cost;
  }
  const u = response.usage;
  if (!u) return;
  const cached =
    u.prompt_cache_hit_tokens ??
    u.cache_read_input_tokens ??
    u.prompt_tokens_details?.cached_tokens ??
    0;
  const prompt = u.prompt_tokens ?? u.input_tokens ?? 0;

  target.inputTokens += prompt;
  target.cachedInputTokens += cached;
  target.cacheWriteTokens = (target.cacheWriteTokens ?? 0) + (u.prompt_tokens_details?.cache_write_tokens ?? u.cache_creation_input_tokens ?? 0);
  target.cacheMissInputTokens = (target.cacheMissInputTokens ?? 0) + (u.prompt_cache_miss_tokens ?? Math.max(0, prompt - cached));
  target.outputTokens += u.completion_tokens ?? u.output_tokens ?? 0;
  target.reasoningOutputTokens = (target.reasoningOutputTokens ?? 0) + (u.completion_tokens_details?.reasoning_tokens ?? 0);
  if (u.cost !== undefined) {
    target.providerCost = (target.providerCost ?? 0) + u.cost;
  }
}
