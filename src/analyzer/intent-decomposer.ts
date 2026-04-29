import OpenAI from "openai";
import { IntentDecompositionSchema } from "../schemas/index.js";
import type { IntentDecomposition } from "../types/index.js";
import { withRetry } from "../utils/retry.js";

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
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  async decompose(intent: string): Promise<IntentDecomposition> {
    if (this.dryRun) return { ...EMPTY_DECOMPOSITION };

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Intent: ${intent}` },
          ],
          temperature: 0.2,
          max_tokens: 1024,
        })
      );
      const content = response.choices[0]?.message?.content ?? "";
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return IntentDecompositionSchema.parse(JSON.parse(jsonStr));
    } catch {
      console.warn("\nIntentDecomposer: failed to decompose intent, continuing without scaffold");
      return { ...EMPTY_DECOMPOSITION };
    }
  }
}
