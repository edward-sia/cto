/**
 * Codex Execution Client — submits leaf-node solutions to OpenAI Codex.
 * Uses @openai/codex-sdk with fallback to codex exec CLI.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TreeNode, CodexExecutionResult, CodexUsage } from "../types/index.js";

function emptyUsage(): CodexUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
}

function addUsage(target: CodexUsage, source: { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_output_tokens: number } | null | undefined): void {
  if (!source) return;
  target.inputTokens += source.input_tokens;
  target.cachedInputTokens += source.cached_input_tokens;
  target.outputTokens += source.output_tokens;
  target.reasoningOutputTokens += source.reasoning_output_tokens;
}

export interface CodexExecutorOptions {
  cloudEnv?: string;
  cloudAttempts?: number;
}

export class CodexExecutor {
  private workingDir: string;
  private dryRun: boolean;
  private cloudEnv?: string;
  private cloudAttempts?: number;

  constructor(workingDir: string, dryRun = false, options: CodexExecutorOptions = {}) {
    this.workingDir = workingDir;
    this.dryRun = dryRun;
    this.cloudEnv = options.cloudEnv;
    this.cloudAttempts = options.cloudAttempts;
  }

  async execute(node: TreeNode): Promise<CodexExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildImplementationPrompt(node);
    const leafDir = join(this.workingDir, node.id);

    if (this.dryRun) {
      return {
        threadId: `dry-run-${Date.now()}`,
        success: true,
        filesChanged: [],
        testResults: { passed: 0, failed: 0, skipped: 0, output: "[dry-run] no tests executed" },
        output: `[dry-run] Skipped Codex execution for branch "${node.branchLabel || "root"}".\n\nPrompt that would have been sent (${prompt.length} chars):\n${prompt.slice(0, 400)}${prompt.length > 400 ? "…" : ""}`,
        durationMs: Date.now() - startTime,
      };
    }

    mkdirSync(leafDir, { recursive: true });

    if (this.cloudEnv) {
      return this.executeViaCloud(prompt, startTime, leafDir);
    }

    try {
      const { Codex } = await import("@openai/codex-sdk");
      const codex = new Codex();
      const thread = codex.startThread({
        workingDirectory: leafDir,
        skipGitRepoCheck: true,
        sandboxMode: "workspace-write",
      });
      const implTurn = await thread.run(prompt);
      const testTurn = await thread.run(
        "Now run any tests you created. Report the results including pass/fail counts."
      );

      const implText = implTurn.finalResponse ?? "";
      const testText = testTurn.finalResponse ?? "";
      const usage = emptyUsage();
      addUsage(usage, implTurn.usage);
      addUsage(usage, testTurn.usage);

      return {
        threadId: thread.id ?? `thread-${Date.now()}`,
        success: true,
        filesChanged: this.extractFilesChanged(implText),
        testResults: this.parseTestResults(testText),
        output: `## Implementation\n${implText}\n\n## Tests\n${testText}`,
        durationMs: Date.now() - startTime,
        usage,
      };
    } catch (error) {
      return this.executeViaCli(prompt, startTime, error, leafDir);
    }
  }

  private async executeViaCli(
    prompt: string,
    startTime: number,
    sdkError: unknown,
    leafDir: string
  ): Promise<CodexExecutionResult> {
    const { spawnSync } = await import("child_process");
    const result = spawnSync(
      "codex",
      ["exec", "--skip-git-repo-check", "--full-auto", "--cd", leafDir, "-"],
      {
        input: prompt,
        encoding: "utf-8",
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (result.status === 0) {
      return {
        threadId: `cli-${Date.now()}`,
        success: true,
        filesChanged: this.extractFilesChanged(result.stdout),
        output: result.stdout,
        durationMs: Date.now() - startTime,
      };
    }

    const sdkMsg = sdkError instanceof Error ? sdkError.message : String(sdkError ?? "");
    return {
      threadId: `cli-error-${Date.now()}`,
      success: false,
      filesChanged: [],
      output: `SDK error: ${sdkMsg}\n\nCLI fallback exit=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeViaCloud(
    prompt: string,
    startTime: number,
    leafDir: string
  ): Promise<CodexExecutionResult> {
    // Uses spawnSync with args-as-array (no shell) — safe from injection.
    const { spawnSync } = await import("node:child_process");
    const attempts = this.cloudAttempts ?? 1;
    const submission = spawnSync(
      "codex",
      ["cloud", "exec", "--env", this.cloudEnv!, "--attempts", String(attempts), prompt],
      { encoding: "utf-8", timeout: 60_000, cwd: leafDir }
    );

    if (submission.status !== 0) {
      return {
        threadId: `cloud-error-${Date.now()}`,
        success: false,
        filesChanged: [],
        output: `codex cloud exec failed (exit=${submission.status}):\nstdout:\n${submission.stdout}\nstderr:\n${submission.stderr}`,
        durationMs: Date.now() - startTime,
      };
    }

    const taskIdMatch = /task[_-]?id[:=]\s*(\S+)/i.exec(submission.stdout) ?? /\b(task_[A-Za-z0-9-]+)\b/.exec(submission.stdout);
    const taskId = taskIdMatch?.[1];

    return {
      threadId: taskId ?? `cloud-${Date.now()}`,
      success: true,
      filesChanged: [],
      output: `[codex cloud] env=${this.cloudEnv} attempts=${attempts}\n\n${submission.stdout}\n\nNOTE: cloud results must be applied locally with \`codex cloud apply <task-id>\` once the task completes.`,
      durationMs: Date.now() - startTime,
    };
  }

  private buildImplementationPrompt(node: TreeNode): string {
    const ctx = node.context;
    const sections = [
      `# Implementation Task\n`,
      `## Original Intent\n${ctx.originalIntent}\n`,
      ctx.prd ? `## Product Requirements\n${ctx.prd}\n` : "",
      ctx.acceptanceCriteria?.length
        ? `## Acceptance Criteria\n${ctx.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n`
        : "",
      ctx.architectureDecisions?.length
        ? `## Architecture Decisions\n${ctx.architectureDecisions.map((d) => `- ${d}`).join("\n")}\n`
        : "",
      ctx.branchDecision ? `## Specific Approach for This Branch\n${ctx.branchDecision}\n` : "",
      ctx.implementationSpec ? `## Implementation Spec\n${ctx.implementationSpec}\n` : "",
      ctx.testStrategy ? `## Test Strategy\n${ctx.testStrategy}\n` : "",
      ctx.ancestorSummaries.length
        ? `## Context from Previous Discussions\n${ctx.ancestorSummaries.map((s, i) => `### Discussion ${i + 1}\n${s}`).join("\n")}\n`
        : "",
      `## Instructions`,
      `1. Implement the solution according to the specifications above`,
      `2. Create all necessary files in the working directory`,
      `3. Write tests that validate the acceptance criteria`,
      `4. Run the tests and ensure they pass`,
      `5. Document any assumptions or trade-offs made`,
    ];
    return sections.filter(Boolean).join("\n");
  }

  private extractFilesChanged(output: string): string[] {
    const files: string[] = [];
    const patterns = [
      /(?:created?|wrote|modified?|updated?)\s+(?:file\s+)?['"`]?([^\s'"`,]+\.\w+)/gi,
      /(?:File|Path):\s*['"`]?([^\s'"`,]+\.\w+)/gi,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(output)) !== null) {
        if (match[1] && !files.includes(match[1])) files.push(match[1]);
      }
    }
    return files;
  }

  private parseTestResults(output: string): CodexExecutionResult["testResults"] {
    const passMatch = /(\d+)\s+(?:tests?\s+)?pass/i.exec(output);
    const failMatch = /(\d+)\s+(?:tests?\s+)?fail/i.exec(output);
    const skipMatch = /(\d+)\s+(?:tests?\s+)?skip/i.exec(output);
    return {
      passed: passMatch ? parseInt(passMatch[1], 10) : 0,
      failed: failMatch ? parseInt(failMatch[1], 10) : 0,
      skipped: skipMatch ? parseInt(skipMatch[1], 10) : 0,
      output,
    };
  }
}
