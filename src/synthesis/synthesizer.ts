import type { CodexExecutionResult, LLMUsage, TreeNode } from "../types/index.js";
import type { LLMClient } from "../providers/llm-provider.js";
import { withRetry } from "../utils/retry.js";
import { addUsage, emptyUsage } from "../utils/usage.js";

const SYSTEM_PROMPT = `You are a research synthesizer. Given a debate transcript and accumulated context from an exploration task, produce a structured document.

Use this exact format:

## Research Questions Addressed
[The questions or goals that were explored]

## Key Findings
[Concrete findings, conclusions, or insights from the debate]

## Open Questions
[Unresolved questions that need further investigation]

## Recommended Next Steps
[Actionable recommendations based on findings]`;

export class Synthesizer {
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

  async synthesize(node: TreeNode): Promise<CodexExecutionResult> {
    const start = Date.now();

    if (this.dryRun) {
      return {
        threadId: `synthesis-dry-${node.id}`,
        success: true,
        filesChanged: [],
        output: `[DRY-RUN] Synthesis document for: ${node.context.originalIntent}`,
        durationMs: 0,
      };
    }

    const { context, debate } = node;
    const sections: string[] = [`Original intent: ${context.originalIntent}`];

    if (context.humanRevisionPrompt) {
      sections.push(
        `## Human Revision\nThe human reviewer added this steering instruction before implementation:\n${context.humanRevisionPrompt}`
      );
    }
    if (context.prd) sections.push(`## PRD\n${context.prd}`);
    if (context.acceptanceCriteria?.length) {
      sections.push(`## Acceptance Criteria\n${context.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`);
    }
    if (context.architectureDecisions?.length) {
      sections.push(`## Architecture Decisions\n${context.architectureDecisions.map((d) => `- ${d}`).join("\n")}`);
    }
    if (context.implementationSpec) {
      sections.push(`## Implementation Spec\n${context.implementationSpec}`);
    }
    if (context.testStrategy) {
      sections.push(`## Test Strategy\n${context.testStrategy}`);
    }
    if (context.ancestorSummaries.length) {
      sections.push(
        `## Prior Discussion\n${context.ancestorSummaries.map((s, i) => `### Level ${i}\n${s}`).join("\n")}`
      );
    }
    if (debate) sections.push(`## Debate Summary\n${debate.summary}`);

    try {
      const response = await withRetry(() =>
        this.llm.createChatCompletion({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: sections.join("\n\n") },
          ],
          temperature: 0.4,
          maxTokens: 2048,
        })
      );
      addUsage(this.usage, response.usage);

      return {
        threadId: `synthesis-${node.id}`,
        success: true,
        filesChanged: [],
        output: response.text || "No synthesis produced.",
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        threadId: `synthesis-${node.id}`,
        success: false,
        filesChanged: [],
        output: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }
}
