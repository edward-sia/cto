import { AnthropicAdapter } from "./adapters/anthropic.js";
import { HuggingFaceAdapter } from "./adapters/huggingface.js";
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { DEFAULT_LLM_PROVIDER_CONFIG } from "./config.js";
import { classifyLLMError, errorMessage, LLMProviderError } from "./errors.js";
import { getLLMProviderDefinition } from "./registry.js";
import type {
  LLMAttempt,
  LLMClient,
  LLMCompletionRequest,
  LLMProviderAdapter,
  LLMProviderConfig,
  ModelCandidate,
  ModelTier,
  NormalizedLLMResponse,
} from "./types.js";

export const TIER_MODEL_PREFIX = "tier:";

export interface LLMRouterOptions {
  config?: LLMProviderConfig;
  adapters?: Record<string, LLMProviderAdapter>;
  env?: Record<string, string | undefined>;
  dryRun?: boolean;
  defaultProvider?: string;
  providerOverrides?: Record<string, { apiKeyEnv?: string; baseURL?: string }>;
}

export class LLMRouter implements LLMClient {
  private readonly config: LLMProviderConfig;
  private readonly adapters: Record<string, LLMProviderAdapter>;
  private readonly env: Record<string, string | undefined>;

  constructor(private readonly options: LLMRouterOptions = {}) {
    this.config = options.config ?? DEFAULT_LLM_PROVIDER_CONFIG;
    this.adapters = options.adapters ?? defaultAdapters();
    this.env = options.env ?? process.env;
  }

  async createChatCompletion(request: LLMCompletionRequest): Promise<NormalizedLLMResponse> {
    const route = this.resolveRoute(request);
    const attempts: LLMAttempt[] = [];

    for (const candidate of route.candidates) {
      const definition = getLLMProviderDefinition(candidate.provider, this.config);
      const override = this.options.providerOverrides?.[candidate.provider];
      const apiKeyEnv = override?.apiKeyEnv ?? definition.apiKeyEnv;
      const apiKey = this.env[apiKeyEnv];

      if (!apiKey && !this.options.dryRun) {
        const attempt = {
          provider: candidate.provider,
          model: candidate.model,
          status: "failed" as const,
          errorClass: "auth_error" as const,
          message: `${definition.label} requires ${apiKeyEnv}`,
        };
        attempts.push(attempt);
        throw new LLMProviderError(attempt.message, "auth_error", attempts);
      }

      const adapter = this.adapters[definition.adapter];
      if (!adapter) {
        const attempt = {
          provider: candidate.provider,
          model: candidate.model,
          status: "failed" as const,
          errorClass: "invalid_request" as const,
          message: `No adapter registered for ${definition.adapter}`,
        };
        attempts.push(attempt);
        throw new LLMProviderError(attempt.message, "invalid_request", attempts);
      }

      try {
        const response = await adapter.complete({
          request: {
            ...request,
            provider: candidate.provider,
            model: candidate.model,
            reasoningEffort: candidate.reasoningEffort ?? request.reasoningEffort ?? definition.requestDefaults?.reasoningEffort ?? definition.reasoningEffort,
            maxTokens: request.maxTokens ?? definition.requestDefaults?.maxTokens,
          },
          provider: definition,
          candidate,
          apiKey: apiKey ?? "dry-run-placeholder",
          baseURL: override?.baseURL ?? definition.baseURL,
          headers: definition.defaultHeaders,
        });
        const successAttempt = {
          provider: candidate.provider,
          model: candidate.model,
          status: "success" as const,
        };
        return {
          ...response,
          provider: candidate.provider,
          model: candidate.model,
          requestedTier: route.tier,
          attempts: [...attempts, successAttempt],
        };
      } catch (error) {
        const errorClass = classifyLLMError(error);
        const attempt = {
          provider: candidate.provider,
          model: candidate.model,
          status: "failed" as const,
          errorClass,
          message: errorMessage(error),
        };
        attempts.push(attempt);
        const canFallback = route.candidates.indexOf(candidate) < route.candidates.length - 1
          && this.config.fallback.on.includes(errorClass);
        if (!canFallback) {
          throw new LLMProviderError(attempt.message, errorClass, attempts, { cause: error });
        }
      }
    }

    throw new LLMProviderError("No provider candidate produced a response.", "unknown", attempts);
  }

  private resolveRoute(request: LLMCompletionRequest): { tier?: ModelTier; candidates: ModelCandidate[] } {
    const tier = request.tier ?? tierFromModelToken(request.model);
    if (tier) {
      return {
        tier,
        candidates: this.config.modelTiers[tier],
      };
    }

    const provider = request.provider ?? this.options.defaultProvider ?? "openai";
    const definition = getLLMProviderDefinition(provider, this.config);
    return {
      candidates: [{
        provider,
        model: request.model ?? definition.defaultModel,
        reasoningEffort: request.reasoningEffort,
      }],
    };
  }
}

export function defaultAdapters(): Record<string, LLMProviderAdapter> {
  return {
    "openai-compatible": new OpenAICompatibleAdapter(),
    anthropic: new AnthropicAdapter(),
    huggingface: new HuggingFaceAdapter(),
  };
}

export function tierModelToken(tier: ModelTier): string {
  return `${TIER_MODEL_PREFIX}${tier}`;
}

export function tierFromModelToken(model: string | undefined): ModelTier | undefined {
  if (!model?.startsWith(TIER_MODEL_PREFIX)) return undefined;
  const tier = model.slice(TIER_MODEL_PREFIX.length);
  return tier === "cheap" || tier === "mid" || tier === "strong" ? tier : undefined;
}
