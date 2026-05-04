import OpenAI from "openai";
import type { LeafImplementationSketch, LeafSketchScore, LLMUsage, TreeNode } from "../types/index.js";
import { LeafImplementationSketchSchema, LeafSketchScoreSchema } from "../schemas/index.js";
import { withRetry } from "../utils/retry.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";

const SKETCH_SYSTEM_PROMPT = `You produce cheap implementation sketches for candidate CTO leaves.
Do not write code. Summarize the implementation path, likely files, architecture, risks, and tests.
Return only valid JSON matching the requested schema.`;

const SCORE_SYSTEM_PROMPT = `You rank implementation sketches before expensive execution.
Prefer sketches that cover acceptance criteria, have clear verification, reduce risk, and minimize blast radius.
Return only valid JSON matching the requested schema.`;

export class LeafSketcher {
  private openai: OpenAI;
  private sketchModel: string;
  private scoreModel: string;
  private dryRun: boolean;
  private usage: LLMUsage = emptyUsage();

  constructor(openai: OpenAI, sketchModel: string, scoreModel: string, dryRun = false) {
    this.openai = openai;
    this.sketchModel = sketchModel;
    this.scoreModel = scoreModel;
    this.dryRun = dryRun;
  }

  get llmUsage(): LLMUsage {
    return { ...this.usage };
  }

  async sketch(node: TreeNode): Promise<LeafImplementationSketch> {
    if (this.dryRun) return this.mockSketch(node);

    const prompt = `# Candidate Leaf
Leaf id: ${node.id}
Branch: ${node.branchLabel || "root"}
Branch description: ${node.branchDescription || "none"}
Original intent: ${node.context.originalIntent}
Final branch decision: ${node.context.branchDecision ?? "none"}

Intent dossier:
${JSON.stringify(node.context.intentDossier ?? {}, null, 2)}

Acceptance criteria:
${(node.context.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n") || "- none"}

Architecture decisions:
${(node.context.architectureDecisions ?? []).map((d) => `- ${d}`).join("\n") || "- none"}

Implementation spec:
${node.context.implementationSpec ?? "none"}

Return JSON:
{
  "leafId": "${node.id}",
  "approach": "short concrete approach",
  "filesLikelyChanged": ["path or area"],
  "algorithmOrArchitecture": ["step"],
  "riskAreas": ["risk"],
  "expectedTests": ["test"],
  "estimatedComplexity": "low" | "medium" | "high",
  "confidence": 0.0-1.0,
  "rationale": "why this is viable"
}`;

    const response = await withRetry(() =>
      this.openai.chat.completions.create({
        model: this.sketchModel,
        messages: [
          { role: "system", content: SKETCH_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      })
    );
    addUsageFromResponse(this.usage, response);
    const raw = response.choices[0]?.message?.content ?? "";
    const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return LeafImplementationSketchSchema.parse(JSON.parse(jsonStr));
  }

  async score(node: TreeNode, sketch: LeafImplementationSketch): Promise<LeafSketchScore> {
    if (this.dryRun) return this.deterministicScore(node, sketch);

    const prompt = `# Sketch To Rank
${JSON.stringify(sketch, null, 2)}

# Target Context
Original intent: ${node.context.originalIntent}
Branch decision: ${node.context.branchDecision ?? "none"}
Intent dossier:
${JSON.stringify(node.context.intentDossier ?? {}, null, 2)}
Acceptance criteria:
${(node.context.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n") || "- none"}

Return JSON:
{
  "leafId": "${node.id}",
  "acceptanceCoverage": 0-10,
  "verificationPlanQuality": 0-10,
  "lowBlastRadius": 0-10,
  "riskReduction": 0-10,
  "complexityPenalty": 0-10,
  "uncertaintyPenalty": 0-10,
  "composite": 0-10,
  "rationale": "short reason"
}`;

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.scoreModel,
          messages: [
            { role: "system", content: SCORE_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 900,
        })
      );
      addUsageFromResponse(this.usage, response);
      const raw = response.choices[0]?.message?.content ?? "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = LeafSketchScoreSchema.parse(JSON.parse(jsonStr));
      return { ...parsed, composite: this.computeComposite(parsed) };
    } catch {
      return this.deterministicScore(node, sketch);
    }
  }

  private mockSketch(node: TreeNode): LeafImplementationSketch {
    return {
      leafId: node.id,
      approach: `[dry-run] Implement ${node.branchLabel || "the selected branch"} with minimal scoped changes.`,
      filesLikelyChanged: ["src/**", "tests/**"],
      algorithmOrArchitecture: [node.context.branchDecision ?? node.branchDescription ?? "Follow the consensus branch."],
      riskAreas: node.context.intentDossier?.riskAreas.slice(0, 3) ?? [],
      expectedTests: [
        ...(node.context.acceptanceCriteria ?? []),
        ...(node.context.intentDossier?.acceptanceCriteria ?? []),
      ].slice(0, 4),
      estimatedComplexity: node.branchLabel.toLowerCase().includes("robust") ? "high" : "medium",
      confidence: node.branchLabel.toLowerCase().includes("approach a") ? 0.82 : 0.7,
      rationale: "[dry-run] Synthetic sketch used for ranking without LLM calls.",
      criticEvaluation: {
        reversibility: { value: "reversible-with-effort" as const, note: "[dry-run placeholder]" },
        blastRadius: { value: "medium" as const, note: "[dry-run placeholder]" },
        timeToSignal: { value: "medium" as const, note: "[dry-run placeholder]" },
        counterCase: "[dry-run placeholder counter-case]",
        falsifier: "[dry-run placeholder falsifier]",
      },
    };
  }

  private deterministicScore(_node: TreeNode, sketch: LeafImplementationSketch): LeafSketchScore {
    const complexityPenalty = sketch.estimatedComplexity === "high" ? 4 : sketch.estimatedComplexity === "medium" ? 2 : 0;
    const acceptanceCoverage = Math.min(10, 5 + sketch.expectedTests.length);
    const verificationPlanQuality = Math.min(10, 5 + sketch.expectedTests.length);
    const lowBlastRadius = Math.max(1, 9 - sketch.filesLikelyChanged.length - complexityPenalty);
    const riskReduction = Math.min(10, 5 + sketch.riskAreas.length);
    const uncertaintyPenalty = Math.round((1 - sketch.confidence) * 10);
    const base = {
      leafId: sketch.leafId,
      acceptanceCoverage,
      verificationPlanQuality,
      lowBlastRadius,
      riskReduction,
      complexityPenalty,
      uncertaintyPenalty,
      composite: 0,
      rationale: `[deterministic] confidence=${sketch.confidence.toFixed(2)}, complexity=${sketch.estimatedComplexity}`,
    };
    return { ...base, composite: this.computeComposite(base) };
  }

  private computeComposite(score: Omit<LeafSketchScore, "composite"> & { composite?: number }): number {
    return Math.round(
      (
        0.28 * score.acceptanceCoverage +
        0.22 * score.verificationPlanQuality +
        0.18 * score.lowBlastRadius +
        0.18 * score.riskReduction -
        0.07 * score.complexityPenalty -
        0.07 * score.uncertaintyPenalty
      ) * 100
    ) / 100;
  }
}
