import type { LLMUsage } from "../types/index.js";

export function emptyUsage(): LLMUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface UsageBearing {
  usage?: ChatCompletionUsage | null;
}

export function addUsageFromResponse(target: LLMUsage, response: UsageBearing): void {
  const u = response.usage;
  if (!u) return;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = u.prompt_tokens ?? 0;
  // OpenAI's prompt_tokens INCLUDES cached_tokens. Track both so the caller can
  // compute uncached as (inputTokens - cachedInputTokens) for billing.
  target.inputTokens += prompt;
  target.cachedInputTokens += cached;
  target.outputTokens += u.completion_tokens ?? 0;
}

export function addUsage(target: LLMUsage, source: LLMUsage): void {
  target.inputTokens += source.inputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.outputTokens += source.outputTokens;
}

export function totalUsageTokens(u: LLMUsage): number {
  return u.inputTokens + u.outputTokens;
}
