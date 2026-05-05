import OpenAI from "openai";
import type { LLMProvider, LLMUsage, RunConfig } from "../types/index.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";

export type LLMMessageRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export interface LLMCompletionRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: LLMReasoningEffort;
}

export interface NormalizedLLMResponse {
  text: string;
  raw: unknown;
  usage: LLMUsage;
}

export interface LLMClient {
  createChatCompletion(request: LLMCompletionRequest): Promise<NormalizedLLMResponse>;
}

export interface LLMProviderDefinition {
  id: LLMProvider;
  label: string;
  apiKeyEnv: string;
  baseURL?: string;
  defaultModel: string;
  anthropicVersion?: string;
  reasoningEffort?: LLMReasoningEffort;
}

export type LLMReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

export const LLM_PROVIDERS: Record<LLMProvider, LLMProviderDefinition> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "qwen/qwen3-coder:free",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-3-flash-preview",
    reasoningEffort: "minimal",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
  },
  claude: {
    id: "claude",
    label: "Claude / Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseURL: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    anthropicVersion: "2023-06-01",
  },
};

export const LLM_PROVIDER_IDS = Object.keys(LLM_PROVIDERS) as LLMProvider[];

export interface LLMClientOptions {
  provider: LLMProvider;
  dryRun: boolean;
  apiKeyEnv?: string;
  baseURL?: string;
}

export function parseLLMProvider(raw: string | undefined): LLMProvider {
  const provider = (raw ?? "openai").toLowerCase();
  if (provider in LLM_PROVIDERS) return provider as LLMProvider;
  throw new Error(`Unsupported provider "${raw}". Supported providers: ${LLM_PROVIDER_IDS.join(", ")}`);
}

export function getLLMProviderDefinition(provider: LLMProvider): LLMProviderDefinition {
  return LLM_PROVIDERS[provider];
}

export function resolveProviderModel(provider: LLMProvider, requestedModel: string, modelWasExplicit: boolean): string {
  if (modelWasExplicit) return requestedModel;
  return getLLMProviderDefinition(provider).defaultModel;
}

export function makeLLMClient(options: LLMClientOptions): LLMClient {
  const provider = getLLMProviderDefinition(options.provider);
  const apiKeyEnv = options.apiKeyEnv ?? provider.apiKeyEnv;
  const apiKey = process.env[apiKeyEnv];
  const baseURL = options.baseURL ?? provider.baseURL;

  if (!apiKey && !options.dryRun) {
    throw new Error(
      `${provider.label} requires ${apiKeyEnv}. Set it in your environment, or pass --dry-run to skip LLM calls.`
    );
  }

  if (options.provider === "claude") {
    return new AnthropicLLMClient({
      apiKey: apiKey ?? "dry-run-placeholder",
      baseURL: baseURL ?? "https://api.anthropic.com",
      anthropicVersion: provider.anthropicVersion ?? "2023-06-01",
    });
  }

  const openai = new OpenAI({
    apiKey: apiKey ?? "dry-run-placeholder",
    ...(baseURL ? { baseURL } : {}),
    ...(options.provider === "openrouter"
      ? {
          defaultHeaders: {
            "X-Title": process.env.OPENROUTER_APP_NAME ?? "Cambrian Tree Orchestrator",
            ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
          },
        }
      : {}),
  });

  return new OpenAICompatibleLLMClient(openai, {
    defaultReasoningEffort: provider.reasoningEffort,
  });
}

export function providerLabel(config: Pick<RunConfig, "llmProvider" | "llmBaseURL" | "llmApiKeyEnv">): string {
  const provider = getLLMProviderDefinition(config.llmProvider ?? "openai");
  const base = config.llmBaseURL ?? provider.baseURL;
  const baseSuffix = base ? ` (${base})` : "";
  const keySuffix = config.llmApiKeyEnv && config.llmApiKeyEnv !== provider.apiKeyEnv
    ? ` via ${config.llmApiKeyEnv}`
    : "";
  return `${provider.label}${keySuffix}${baseSuffix}`;
}

type OpenAICompatibleUsage = Parameters<typeof addUsageFromResponse>[1];

export function normalizeOpenAICompatibleResponse(response: unknown): NormalizedLLMResponse {
  const raw = response as {
    choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
  } & OpenAICompatibleUsage;
  const usage = emptyUsage();
  addUsageFromResponse(usage, raw);
  const message = raw.choices?.[0]?.message;
  return {
    text: message?.content ?? "",
    raw: response,
    usage,
  };
}

export function normalizeAnthropicResponse(response: unknown): NormalizedLLMResponse {
  const raw = response as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  const usage = emptyUsage();
  addUsageFromResponse(usage, raw);
  return {
    text: raw.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("") ?? "",
    raw: response,
    usage,
  };
}

export class OpenAICompatibleLLMClient implements LLMClient {
  constructor(
    private readonly openai: OpenAI,
    private readonly options: { defaultReasoningEffort?: LLMReasoningEffort } = {}
  ) {}

  async createChatCompletion(request: LLMCompletionRequest): Promise<NormalizedLLMResponse> {
    const reasoningEffort = request.reasoningEffort ?? this.options.defaultReasoningEffort;
    const response = await this.openai.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]);
    return normalizeOpenAICompatibleResponse(response);
  }
}

export interface AnthropicLLMClientOptions {
  apiKey: string;
  baseURL: string;
  anthropicVersion: string;
  fetchImpl?: typeof fetch;
}

export class AnthropicLLMClient implements LLMClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AnthropicLLMClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createChatCompletion(request: LLMCompletionRequest): Promise<NormalizedLLMResponse> {
    const { system, messages } = toAnthropicMessages(request.messages);
    const response = await this.fetchImpl(`${this.options.baseURL.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.options.apiKey,
        "anthropic-version": this.options.anthropicVersion,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        ...(system ? { system } : {}),
        messages,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    });

    const body: unknown = await response.json();
    if (!response.ok) {
      const errorMessage = getProviderErrorMessage(body);
      const message = errorMessage ?? `Anthropic request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return normalizeAnthropicResponse(body);
  }
}

function toAnthropicMessages(messages: LLMMessage[]): { system?: string; messages: Array<{ role: "user" | "assistant"; content: string }> } {
  const systemMessages: string[] = [];
  const conversationalMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemMessages.push(message.content);
      continue;
    }
    conversationalMessages.push({ role: message.role, content: message.content });
  }

  return {
    ...(systemMessages.length ? { system: systemMessages.join("\n\n") } : {}),
    messages: conversationalMessages,
  };
}

function getProviderErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}
