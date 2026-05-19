import { IntentDecompositionSchema } from "../schemas/index.js";
import type { IntentDecomposition, LLMUsage } from "../types/index.js";
import type { LLMClient } from "@cto/llm-providers";
import { formatLLMError } from "../utils/llm-errors.js";
import { parseJsonObject } from "../utils/json.js";
import { withRetry } from "../utils/retry.js";
import { addUsage, emptyUsage } from "../utils/usage.js";

const EMPTY_DECOMPOSITION: IntentDecomposition = {
  loadBearingClaims: [],
  undefinedTerms: [],
  inScope: [],
  outOfScope: [],
  knownUnknowns: [],
  feasibilityFlags: [],
  rationale: "",
};

const SYSTEM_PROMPT = `You decompose a software development intent into a structured scaffold for a debate panel.

Your output frames what is on-topic and what is off-topic. The downstream agents will treat:
- loadBearingClaims as constraints they MUST honour
- inScope as the scope to defend (do not expand)
- outOfScope as concerns to NOT introduce unless the intent justifies them
- undefinedTerms as the highest-priority debate items to resolve
- knownUnknowns as facts to verify before assuming
- feasibilityFlags as concrete flags that the input source / data / approach may not support what the intent asks

Be aggressive about identifying outOfScope items: enterprise concerns (GDPR, multi-currency, 1M-record performance, i18n, compliance, data privacy) are OUT of scope for a personal-scale tool unless the intent explicitly invites them.

Be aggressive about feasibilityFlags: if the named input source might not contain the required data, flag it.

Output ONLY valid JSON with this shape:
{
  "loadBearingClaims": ["claim 1", "claim 2"],
  "undefinedTerms": [{"term": "X", "needsResolution": "what needs resolving"}],
  "inScope": ["scope item 1"],
  "outOfScope": ["scope item to avoid 1"],
  "knownUnknowns": ["unknown to verify 1"],
  "feasibilityFlags": ["concrete feasibility risk 1"],
  "rationale": "one sentence summary"
}`;

export class IntentDecomposer {
  private llm: LLMClient;
  private model: string;
  private dryRun: boolean;
  private usage: LLMUsage = emptyUsage();

  constructor(llm: LLMClient, model: string, dryRun = false) {
    this.llm = llm;
    this.model = model;
    this.dryRun = dryRun;
  }

  get llmUsage(): LLMUsage {
    return { ...this.usage };
  }

  async decompose(intent: string): Promise<IntentDecomposition> {
    if (this.dryRun) return { ...EMPTY_DECOMPOSITION };

    let content: string;
    try {
      const response = await withRetry(() =>
        this.llm.createChatCompletion({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Intent: ${intent}` },
          ],
          temperature: 0.2,
          maxTokens: 1024,
        })
      );
      addUsage(this.usage, response.usage);
      content = response.text;
    } catch (error) {
      console.warn(`\nIntentDecomposer: LLM request failed, continuing without scaffold (${formatLLMError(error)})`);
      return { ...EMPTY_DECOMPOSITION };
    }

    try {
      return IntentDecompositionSchema.parse(parseJsonObject(content));
    } catch {
      console.warn("\nIntentDecomposer: failed to decompose intent, continuing without scaffold");
      return { ...EMPTY_DECOMPOSITION };
    }
  }
}
