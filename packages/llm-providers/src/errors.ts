import type { LLMAttempt, LLMErrorClass } from "./types.js";

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly errorClass: LLMErrorClass,
    readonly attempts: LLMAttempt[] = [],
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "LLMProviderError";
  }
}

export function classifyLLMError(error: unknown): LLMErrorClass {
  if (error instanceof LLMProviderError) return error.errorClass;
  const maybe = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    name?: string;
    message?: string;
  };
  const status = maybe.status ?? maybe.statusCode;
  const code = typeof maybe.code === "string" ? maybe.code.toLowerCase() : "";
  const message = maybe.message?.toLowerCase() ?? "";
  const name = maybe.name?.toLowerCase() ?? "";

  if (status === 429 || code.includes("rate")) return "rate_limit";
  if (name === "aborterror" || code.includes("timeout") || code === "etimedout" || message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (status === 401 || status === 402 || status === 403 || message.includes("api key") || message.includes("unauthorized") || message.includes("insufficient balance") || message.includes("credit balance")) return "auth_error";
  if (message.includes("context length") || message.includes("maximum context") || message.includes("too many tokens")) return "context_length";
  if (status === 404 || message.includes("invalid model") || message.includes("model not found")) return "invalid_model";
  if (status === 529 || message.includes("overloaded")) return "overloaded";
  if (status !== undefined && status >= 500) return "server_error";
  if (status === 400 || message.includes("invalid request")) return "invalid_request";
  return "unknown";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
