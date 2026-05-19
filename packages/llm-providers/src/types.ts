export type LLMMessageRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export type LLMReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

export type ModelTier = "cheap" | "mid" | "strong";

export interface ModelCandidate {
  provider: string;
  model: string;
  reasoningEffort?: LLMReasoningEffort;
}

export type LLMProviderAdapterKind = "openai-compatible" | "anthropic" | "huggingface" | (string & {});

export interface LLMProviderRequestDefaults {
  reasoningEffort?: LLMReasoningEffort;
  anthropicVersion?: string;
  maxTokens?: number;
}

export interface LLMProviderDefinition {
  adapter: LLMProviderAdapterKind;
  label: string;
  apiKeyEnv: string;
  defaultModel: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  requestDefaults?: LLMProviderRequestDefaults;
  anthropicVersion?: string;
  reasoningEffort?: LLMReasoningEffort;
}

export interface LLMProviderConfig {
  providers: Record<string, LLMProviderDefinition>;
  modelTiers: Record<ModelTier, ModelCandidate[]>;
  fallback: {
    on: LLMErrorClass[];
  };
}

export interface LLMUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens?: number;
  cacheMissInputTokens?: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  providerCost?: number;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  model?: string;
  provider?: string;
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: LLMReasoningEffort;
  timeoutMs?: number;
}

export interface LLMAttempt {
  provider: string;
  model: string;
  status: "success" | "failed";
  errorClass?: LLMErrorClass;
  message?: string;
}

export interface NormalizedLLMResponse {
  text: string;
  raw: unknown;
  usage: LLMUsage;
  provider?: string;
  model?: string;
  requestedTier?: ModelTier;
  attempts?: LLMAttempt[];
}

export interface LLMClient {
  createChatCompletion(request: LLMCompletionRequest): Promise<NormalizedLLMResponse>;
}

export type LLMErrorClass =
  | "rate_limit"
  | "timeout"
  | "overloaded"
  | "server_error"
  | "auth_error"
  | "invalid_model"
  | "invalid_request"
  | "context_length"
  | "schema_error"
  | "parse_error"
  | "unknown";

export interface LLMProviderAdapterInput {
  request: LLMCompletionRequest & { model: string; provider: string };
  provider: LLMProviderDefinition;
  candidate: ModelCandidate;
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export interface LLMProviderAdapter {
  complete(input: LLMProviderAdapterInput): Promise<NormalizedLLMResponse>;
}
