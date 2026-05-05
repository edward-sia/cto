/**
 * LLM Judge — scores leaf-node solutions against the original intent.
 * Evaluates on 5 weighted dimensions.
 */

import type { TreeNode, JudgeScore, LLMUsage, NodeContext } from "../types/index.js";
import { JudgeScoreSchema } from "../schemas/index.js";
import type { LLMClient } from "../providers/llm-provider.js";
import { parseJsonObject } from "../utils/json.js";
import { withRetry } from "../utils/retry.js";
import { addUsage, emptyUsage } from "../utils/usage.js";

const JUDGE_SYSTEM_PROMPT = `You are an expert software engineering judge. You evaluate code solutions against their original requirements.

## Scoring Rubrics (each 0-10)

### 1. Functional Completeness (weight: 0.25)
- 10: All acceptance criteria met, edge cases handled
- 7: Core functionality works, minor gaps
- 4: Partially functional, significant missing features
- 1: Barely functional or non-functional

### 2. Architectural Quality (weight: 0.15)
- 10: Clean separation of concerns, extensible, follows best practices
- 7: Reasonable architecture, minor improvements possible
- 4: Works but poorly structured, hard to maintain
- 1: No discernible architecture

### 3. Test Coverage (weight: 0.15)
- 10: Comprehensive unit + integration tests, all passing
- 7: Good test coverage, tests passing
- 4: Some tests, incomplete coverage
- 1: No tests or all failing

### 4. Intent Alignment (weight: 0.20)
- 10: Solution perfectly matches original intent
- 7: Mostly aligned, minor deviations
- 4: Significant drift from original intent
- 1: Barely related to original intent

### 5. Real-World Fit (weight: 0.15)
When domain ground truth is provided: evaluate whether the solution correctly satisfies the stated constraints, protocols, schemas, and behavioral requirements.
For data tasks: verify required fields/columns are handled and optional ones degrade gracefully.
For protocol/API tasks: verify named behavioral constraints (convergence, reconnect, error handling, idempotency) are implemented.
When no domain ground truth is provided: evaluate whether the solution degrades gracefully under missing or unexpected input.
- 10: All named constraints and behavioral requirements satisfied; required contracts correctly implemented; edge cases from the stated constraints are handled
- 7: Most constraints satisfied; one or two assumptions that may not hold in all production scenarios
- 4: Several constraints violated or assumed away; solution requires conditions the intent does not guarantee
- 1: Solution would immediately fail against realistic usage or directly violates stated constraints

### 6. Simplicity (weight: 0.10)
- 10: Elegant, minimal complexity for the requirements
- 7: Reasonably simple, minor unnecessary complexity
- 4: Over-engineered or unnecessarily complex
- 1: Extremely convoluted

## Output Format
Respond with ONLY valid JSON:
{
  "functionalCompleteness": <0-10>,
  "architecturalQuality": <0-10>,
  "testCoverage": <0-10>,
  "intentAlignment": <0-10>,
  "realWorldFit": <0-10>,
  "simplicity": <0-10>,
  "composite": <weighted-average>,
  "rationale": "<2-3 sentence explanation>"
}`;

export class Judge {
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

  get systemPrompt(): string {
    return JUDGE_SYSTEM_PROMPT;
  }

  async score(node: TreeNode): Promise<JudgeScore> {
    const ctx = node.context;
    const result = node.executionResult;

    if (!result) return this.failedScore("No execution result available");
    if (!result.success) return this.failedScore(`Execution failed: ${result.output.slice(0, 200)}`);

    if (this.dryRun) return this.mockScore(node);

    const domainFactsSection = this.buildDomainFactsSection(ctx);

    const userPrompt = `# Solution to Judge

## Original Intent
${ctx.originalIntent}

## Branch Path
${ctx.ancestorSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${ctx.branchDecision ? `Final branch: ${ctx.branchDecision}` : ""}

## Acceptance Criteria
${ctx.acceptanceCriteria?.map((c) => `- ${c}`).join("\n") || "Not specified"}

${domainFactsSection}

## Solution Output
${result.output.slice(0, 8000)}

## Files Changed
${result.filesChanged.join(", ") || "Unknown"}

## Test Results
${result.testResults ? `Passed: ${result.testResults.passed}, Failed: ${result.testResults.failed}, Skipped: ${result.testResults.skipped}` : "No test results"}

---
Score this solution against all six rubrics. Pay special attention to Real-World Fit when domain ground truth is provided.`;

    try {
      const response = await withRetry(() =>
        this.llm.createChatCompletion({
          model: this.model,
          messages: [
            { role: "system", content: JUDGE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          maxTokens: 1024,
        })
      );
      addUsage(this.usage, response.usage);

      const parsed = JudgeScoreSchema.parse(parseJsonObject(response.text));

      parsed.composite = Math.round(
        (parsed.functionalCompleteness * 0.25 +
          parsed.architecturalQuality * 0.15 +
          parsed.testCoverage * 0.15 +
          parsed.intentAlignment * 0.20 +
          parsed.realWorldFit * 0.15 +
          parsed.simplicity * 0.10) *
          100
      ) / 100;

      return parsed;
    } catch {
      return this.failedScore("Judge scoring failed — could not parse LLM response");
    }
  }

  private buildDomainFactsSection(ctx: NodeContext): string {
    if (ctx.domainFacts) {
      const { domainFacts: df } = ctx;
      return [
        `## Domain Ground Truth (verified facts — use these to evaluate Real-World Fit)`,
        `Domain: ${df.domain}`,
        df.schemas?.length
          ? `Schemas:\n${df.schemas.map((s) => `- ${s.name}: ${s.fields.map((f) => `${f.name}(${f.type}${f.required ? ",required" : ""})`).join(", ")}`).join("\n")}`
          : "",
        df.knownAbsences.length
          ? `Known Absences (these fields do NOT exist):\n${df.knownAbsences.map((a) => `- ${a}`).join("\n")}`
          : "",
        df.constraints.length
          ? `Constraints:\n${df.constraints.map((c) => `- ${c}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n");
    }

    const constraints = [
      ...(ctx.acceptanceCriteria ?? []),
      ...(ctx.architectureDecisions ?? []).filter((d) => /must|should|required|guarantee/i.test(d)),
    ];

    if (constraints.length > 0) {
      return [
        `## Domain Ground Truth (inferred from debate — use these to evaluate Real-World Fit)`,
        `Domain: ${ctx.originalIntent.slice(0, 120)}`,
        `Constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`,
      ].join("\n");
    }

    return "## Domain Ground Truth\nNone provided. Evaluate Real-World Fit based on general robustness to missing or unexpected input.";
  }

  private mockScore(node: TreeNode): JudgeScore {
    const seed = [...node.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const pick = (offset: number) => 5 + ((seed + offset) % 5);
    const fc = pick(0);
    const aq = pick(1);
    const tc = pick(2);
    const ia = pick(3);
    const rwf = pick(4);
    const s = pick(5);
    const composite =
      Math.round((fc * 0.25 + aq * 0.15 + tc * 0.15 + ia * 0.20 + rwf * 0.15 + s * 0.10) * 100) / 100;
    return {
      functionalCompleteness: fc,
      architecturalQuality: aq,
      testCoverage: tc,
      intentAlignment: ia,
      realWorldFit: rwf,
      simplicity: s,
      composite,
      rationale: `[dry-run] Synthetic score for ${node.branchLabel || "root"}.`,
    };
  }

  private failedScore(rationale: string): JudgeScore {
    return {
      functionalCompleteness: 0,
      architecturalQuality: 0,
      testCoverage: 0,
      intentAlignment: 0,
      realWorldFit: 0,
      simplicity: 0,
      composite: 0,
      rationale,
    };
  }
}
