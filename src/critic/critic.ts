import OpenAI from "openai";
import type {
  Alternative,
  CriticChoiceEvaluation,
  CriticCoverageAudit,
  LLMUsage,
  LeafImplementationSketch,
  NodeContext,
  TreeNode,
} from "../types/index.js";
import {
  CriticChoiceEvaluationSchema,
  CriticCoverageAuditSchema,
  LeafImplementationSketchSchema,
} from "../schemas/index.js";
import { combineCoverageDimensions } from "./dimensions.js";
import { withRetry } from "../utils/retry.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";

const COVERAGE_AUDIT_SYSTEM = `You audit a software-engineering debate for coverage gaps and run a brief premortem.
Return only valid JSON matching the requested shape.
A coverage dimension is "addressed" only when a concrete claim or evidence pointer was made — vibes-level statements ("it's user-friendly") do not count.`;

const ALTERNATIVE_ATTACK_SYSTEM = `You attack a single proposed alternative on five decision axes.
Be adversarial but grounded — the goal is to surface real failure modes, not strawman the choice.
Return only valid JSON matching the requested shape.`;

const SKETCH_SYSTEM = `You produce a cheap implementation sketch for a candidate leaf AND attack it on five decision axes in the same response.
Do not write code. Return only valid JSON matching the requested shape.`;

export interface CriticConfig {
  openai: OpenAI;
  model: string;
  dryRun?: boolean;
}

export class Critic {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;
  private usage: LLMUsage = emptyUsage();

  constructor(config: CriticConfig) {
    this.openai = config.openai;
    this.model = config.model;
    this.dryRun = config.dryRun ?? false;
  }

  get llmUsage(): LLMUsage {
    return { ...this.usage };
  }

  async auditCoverage(
    context: NodeContext,
    consensusSummary: string,
    followUpRoundFired = false
  ): Promise<CriticCoverageAudit> {
    if (this.dryRun) {
      return {
        coverageGaps: [],
        premortem: "[dry-run] No premortem performed in dry-run mode.",
        auditedAt: new Date().toISOString(),
        followUpRoundFired,
      };
    }

    const dimensions = combineCoverageDimensions(
      context.intentDossier?.requiredCoverageDimensions ?? []
    );
    const dimensionList = dimensions
      .map((d) => `- ${d.id} (${d.source}): ${d.label} — ${d.description}`)
      .join("\n");

    const prompt = `# Required dimensions
${dimensionList}

# Consensus summary
${consensusSummary}

# Original intent
${context.originalIntent}

# Acceptance criteria
${(context.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n") || "- none"}

# Architecture decisions so far
${(context.architectureDecisions ?? []).map((d) => `- ${d}`).join("\n") || "- none"}

Return JSON:
{
  "coverageGaps": [
    { "dimension": "<dimension-id>", "reason": "concrete reason this was not addressed in the debate" }
  ],
  "premortem": "If this consensus shipped and failed in 6 months, what was the cause? (1-3 sentences)"
}
Only include dimensions in coverageGaps that were not meaningfully addressed.`;

    const response = await withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: COVERAGE_AUDIT_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 900,
      })
    );
    addUsageFromResponse(this.usage, response);
    const raw = response.choices[0]?.message?.content ?? "";
    const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = CriticCoverageAuditSchema.parse({
      ...JSON.parse(jsonStr),
      auditedAt: new Date().toISOString(),
      followUpRoundFired,
    });
    return parsed;
  }

  async evaluateAlternative(
    alternative: Alternative,
    context: NodeContext
  ): Promise<CriticChoiceEvaluation> {
    if (this.dryRun) {
      return mockEvaluation();
    }
    const prompt = `# Alternative
Label: ${alternative.label}
Description: ${alternative.description}
Rationale: ${alternative.rationale}

# Original intent
${context.originalIntent}

Return JSON:
{
  "reversibility": { "value": "one-way" | "reversible-with-effort" | "freely-reversible", "note": "one-line concrete reason" },
  "blastRadius":   { "value": "low" | "medium" | "high", "note": "what or who is affected if wrong" },
  "timeToSignal":  { "value": "fast" | "medium" | "slow", "note": "what signal you would watch and how soon it appears" },
  "counterCase": "strongest argument against this choice",
  "falsifier": "concrete observable that would prove this choice wrong"
}`;
    return parseEvaluation(await this.callLLM(ALTERNATIVE_ATTACK_SYSTEM, prompt));
  }

  async evaluateSketch(node: TreeNode): Promise<LeafImplementationSketch> {
    if (this.dryRun) return mockSketch(node);

    const prompt = `# Leaf
Leaf id: ${node.id}
Branch: ${node.branchLabel || "root"}
Branch description: ${node.branchDescription || "none"}
Original intent: ${node.context.originalIntent}
Branch decision: ${node.context.branchDecision ?? "none"}

# Acceptance criteria
${(node.context.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n") || "- none"}

# Architecture decisions
${(node.context.architectureDecisions ?? []).map((d) => `- ${d}`).join("\n") || "- none"}

# Implementation spec
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
  "rationale": "why this is viable",
  "criticEvaluation": {
    "reversibility": { "value": "...", "note": "..." },
    "blastRadius":   { "value": "...", "note": "..." },
    "timeToSignal":  { "value": "...", "note": "..." },
    "counterCase": "...",
    "falsifier": "..."
  }
}`;

    const raw = await this.callLLM(SKETCH_SYSTEM, prompt);
    const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return LeafImplementationSketchSchema.parse(JSON.parse(jsonStr));
  }

  private async callLLM(system: string, user: string): Promise<string> {
    const response = await withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      })
    );
    addUsageFromResponse(this.usage, response);
    return response.choices[0]?.message?.content ?? "";
  }
}

function parseEvaluation(raw: string): CriticChoiceEvaluation {
  const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return CriticChoiceEvaluationSchema.parse(JSON.parse(jsonStr));
}

function mockEvaluation(): CriticChoiceEvaluation {
  return {
    reversibility: { value: "reversible-with-effort", note: "[dry-run placeholder]" },
    blastRadius: { value: "medium", note: "[dry-run placeholder]" },
    timeToSignal: { value: "medium", note: "[dry-run placeholder]" },
    counterCase: "[dry-run] Synthetic counter-case for tests.",
    falsifier: "[dry-run] Synthetic falsifier for tests.",
  };
}

function mockSketch(node: TreeNode): LeafImplementationSketch {
  return {
    leafId: node.id,
    approach: `[dry-run] Implement ${node.branchLabel || "the selected branch"} with minimal scoped changes.`,
    filesLikelyChanged: ["src/**", "tests/**"],
    algorithmOrArchitecture: [node.context.branchDecision ?? node.branchDescription ?? "Follow the consensus branch."],
    riskAreas: node.context.intentDossier?.riskAreas?.slice(0, 3) ?? [],
    expectedTests: [
      ...(node.context.acceptanceCriteria ?? []),
      ...(node.context.intentDossier?.acceptanceCriteria ?? []),
    ].slice(0, 4),
    estimatedComplexity: node.branchLabel.toLowerCase().includes("robust") ? "high" : "medium",
    confidence: node.branchLabel.toLowerCase().includes("approach a") ? 0.82 : 0.7,
    rationale: "[dry-run] Synthetic sketch used for ranking without LLM calls.",
    criticEvaluation: mockEvaluation(),
  };
}
