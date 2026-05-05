import OpenAI from "openai";
import { IntentDossierSchema } from "../schemas/index.js";
import type { IntentDecomposition, IntentDossier, LLMUsage } from "../types/index.js";
import { deriveIntentDimensions } from "../critic/dimensions.js";
import { withRetry } from "../utils/retry.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";

const SYSTEM_PROMPT = `You convert a software development intent into a stable implementation dossier.

The dossier is the fitness target for later debate, execution, verification, and judging.

Rules:
- Preserve the user's actual goal. Do not expand scope.
- Convert explicit requirements into acceptanceCriteria.
- Convert known unknowns into riskAreas or knownUnknowns.
- Required checks must be concrete commands only when the intent implies them.
- Output only valid JSON matching the requested shape.

JSON shape:
{
  "goal": "single sentence goal",
  "userValue": "why this matters to the user",
  "nonGoals": ["out of scope item"],
  "constraints": ["constraint"],
  "acceptanceCriteria": ["criterion"],
  "requiredChecks": ["command"],
  "riskAreas": ["risk"],
  "knownUnknowns": ["unknown"],
  "successSignals": ["signal"],
  "failureModes": ["failure mode"]
}`;

function fallbackDossier(intent: string, decomposition: IntentDecomposition): IntentDossier {
  return {
    goal: intent,
    userValue: "Delivers the requested software outcome.",
    nonGoals: decomposition.outOfScope,
    constraints: decomposition.loadBearingClaims,
    acceptanceCriteria: [`Satisfies the original intent: ${intent}`],
    requiredChecks: [],
    riskAreas: decomposition.feasibilityFlags,
    knownUnknowns: decomposition.knownUnknowns,
    successSignals: ["Implementation matches the intent and verification checks pass."],
    failureModes: ["Implementation drifts from the original intent."],
    requiredCoverageDimensions: deriveIntentDimensions(intent, decomposition),
  };
}

function hasSubstantiveDossierFields(dossier: IntentDossier): boolean {
  return (
    dossier.goal.trim().length > 0 &&
    dossier.userValue.trim().length > 0 &&
    dossier.acceptanceCriteria.some((criterion) => criterion.trim().length > 0)
  );
}

export class IntentDossierBuilder {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;
  private usage: LLMUsage = emptyUsage();

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  get llmUsage(): LLMUsage {
    return { ...this.usage };
  }

  async build(intent: string, decomposition: IntentDecomposition): Promise<IntentDossier> {
    const fallback = fallbackDossier(intent, decomposition);
    if (this.dryRun) return fallback;

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Intent: ${intent}\n\nIntent decomposition:\n${JSON.stringify(decomposition, null, 2)}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 1200,
        })
      );
      addUsageFromResponse(this.usage, response);
      const content = response.choices[0]?.message?.content ?? "";
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const dossier = IntentDossierSchema.parse(JSON.parse(jsonStr));
      if (!hasSubstantiveDossierFields(dossier)) {
        throw new Error(
          "Parsed dossier is missing goal, userValue, or acceptanceCriteria"
        );
      }
      dossier.requiredCoverageDimensions = deriveIntentDimensions(intent, decomposition);
      return dossier;
    } catch (error) {
      const message = error instanceof Error ? `: ${error.message}` : "";
      console.warn(`\nIntentDossierBuilder: failed to build dossier${message}, continuing with fallback dossier`);
      return fallback;
    }
  }
}
