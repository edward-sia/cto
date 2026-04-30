/**
 * LLM Judge — scores leaf-node solutions against the original intent.
 * Evaluates on 5 weighted dimensions.
 */

import OpenAI from "openai";
import type { TreeNode, JudgeScore, LLMUsage } from "../types/index.js";
import { JudgeScoreSchema } from "../schemas/index.js";
import { withRetry } from "../utils/retry.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";

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
When domain ground truth is provided: evaluate whether the solution correctly handles the real data formats, schema, and API contracts specified.
When no domain ground truth is provided: evaluate whether the solution degrades gracefully when input columns/fields are missing or unexpected, and avoids assuming data shapes that may not exist in practice.
- 10: Perfectly handles real-world data; required columns match verified schema; missing optional columns handled with warnings not crashes
- 7: Mostly handles real data; one or two assumptions that may not hold; or no domain facts provided (neutral)
- 4: Makes assumptions that contradict known domain facts, or treats optional/absent fields as required
- 1: Solution would immediately crash against realistic input (e.g. requires columns that don't exist in the actual export format)

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
  "uncertainty": <0-1>,
  "evidence": ["specific evidence from solution output, tests, files, or ground truth"],
  "failures": ["specific missing or failed behavior"],
  "composite": <weighted-average>,
  "rationale": "<2-3 sentence explanation>"
}`;

export class Judge {
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

  async score(node: TreeNode): Promise<JudgeScore> {
    const ctx = node.context;
    const result = node.executionResult;

    if (!result) return this.failedScore("No execution result available");
    if (!result.success) return this.failedScore(`Execution failed: ${result.output.slice(0, 200)}`);

    if (this.dryRun) return this.mockScore(node);

    const domainFactsSection = ctx.domainFacts
      ? `## Domain Ground Truth (verified facts — use these to evaluate Real-World Fit)
Domain: ${ctx.domainFacts.domain}
${ctx.domainFacts.schemas?.length ? `Schemas:\n${ctx.domainFacts.schemas.map((s) => `- ${s.name}: ${s.fields.map((f) => `${f.name}(${f.type}${f.required ? ",required" : ""})`).join(", ")}`).join("\n")}` : ""}
${ctx.domainFacts.knownAbsences.length ? `Known Absences (these fields do NOT exist):\n${ctx.domainFacts.knownAbsences.map((a) => `- ${a}`).join("\n")}` : ""}
${ctx.domainFacts.constraints.length ? `Constraints:\n${ctx.domainFacts.constraints.map((c) => `- ${c}`).join("\n")}` : ""}`
      : "## Domain Ground Truth\nNone provided. Evaluate Real-World Fit based on general robustness to missing or unexpected input.";

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
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: JUDGE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        })
      );
      addUsageFromResponse(this.usage, response);

      const raw = response.choices[0]?.message?.content ?? "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JudgeScoreSchema.parse(JSON.parse(jsonStr));

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
      uncertainty: 0.25,
      evidence: [`[dry-run] Synthetic evidence for ${node.branchLabel || "root"}.`],
      failures: [],
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
      uncertainty: 1,
      evidence: [],
      failures: [rationale],
      composite: 0,
      rationale,
    };
  }
}
