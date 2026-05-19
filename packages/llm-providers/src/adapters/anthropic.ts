import { addUsageFromResponse, emptyUsage } from "../usage.js";
import type {
  LLMClient,
  LLMCompletionRequest,
  LLMMessage,
  LLMProviderAdapter,
  LLMProviderAdapterInput,
  NormalizedLLMResponse,
} from "../types.js";
import { errorMessage } from "../errors.js";

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

  async createChatCompletion(request: LLMCompletionRequest & { model: string }): Promise<NormalizedLLMResponse> {
    const { system, messages } = toAnthropicMessages(request.messages);
    const abortController = request.timeoutMs ? new AbortController() : undefined;
    const timeout = request.timeoutMs && abortController
      ? setTimeout(() => abortController.abort(), request.timeoutMs)
      : undefined;
    if (timeout) timeout.unref?.();
    try {
      const response = await this.fetchImpl(`${this.options.baseURL.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.options.apiKey,
          "anthropic-version": this.options.anthropicVersion,
          "content-type": "application/json",
        },
        signal: abortController?.signal,
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
        throw new Error(getProviderErrorMessage(body) ?? `Anthropic request failed with HTTP ${response.status}`);
      }

      return normalizeAnthropicResponse(body);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

export class AnthropicAdapter implements LLMProviderAdapter {
  async complete(input: LLMProviderAdapterInput): Promise<NormalizedLLMResponse> {
    const client = new AnthropicLLMClient({
      apiKey: input.apiKey,
      baseURL: input.baseURL ?? "https://api.anthropic.com",
      anthropicVersion: input.provider.requestDefaults?.anthropicVersion ?? input.provider.anthropicVersion ?? "2023-06-01",
    });
    return client.createChatCompletion(input.request);
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
    conversationalMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  return {
    ...(systemMessages.length ? { system: systemMessages.join("\n\n") } : {}),
    messages: conversationalMessages,
  };
}

function getProviderErrorMessage(body: unknown): string | undefined {
  const maybe = body as { error?: { message?: string }; message?: string };
  return maybe.error?.message ?? maybe.message ?? (body instanceof Error ? errorMessage(body) : undefined);
}
