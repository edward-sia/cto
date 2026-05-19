import OpenAI from "openai";
import { addUsageFromResponse, emptyUsage } from "../usage.js";
import type {
  LLMClient,
  LLMCompletionRequest,
  LLMProviderAdapter,
  LLMProviderAdapterInput,
  LLMReasoningEffort,
  NormalizedLLMResponse,
} from "../types.js";

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

export class OpenAICompatibleLLMClient implements LLMClient {
  constructor(
    private readonly openai: OpenAI,
    private readonly options: { defaultReasoningEffort?: LLMReasoningEffort } = {}
  ) {}

  async createChatCompletion(request: LLMCompletionRequest & { model: string }): Promise<NormalizedLLMResponse> {
    const reasoningEffort = request.reasoningEffort ?? this.options.defaultReasoningEffort;
    const response = await this.openai.chat.completions.create({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0], {
      ...(request.timeoutMs ? { timeout: request.timeoutMs } : {}),
    });
    return normalizeOpenAICompatibleResponse(response);
  }
}

export class OpenAICompatibleAdapter implements LLMProviderAdapter {
  async complete(input: LLMProviderAdapterInput): Promise<NormalizedLLMResponse> {
    const openai = new OpenAI({
      apiKey: input.apiKey,
      maxRetries: 0,
      ...(input.baseURL ? { baseURL: input.baseURL } : {}),
      ...(input.headers ? { defaultHeaders: input.headers } : {}),
    });
    const client = new OpenAICompatibleLLMClient(openai, {
      defaultReasoningEffort: input.provider.requestDefaults?.reasoningEffort ?? input.provider.reasoningEffort,
    });
    return client.createChatCompletion(input.request);
  }
}
