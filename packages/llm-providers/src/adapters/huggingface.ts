import { LLMProviderError } from "../errors.js";
import type { LLMProviderAdapter, LLMProviderAdapterInput, NormalizedLLMResponse } from "../types.js";

export class HuggingFaceAdapter implements LLMProviderAdapter {
  async complete(_input: LLMProviderAdapterInput): Promise<NormalizedLLMResponse> {
    throw new LLMProviderError(
      "HuggingFace adapter is reserved for a future provider implementation.",
      "invalid_request"
    );
  }
}

