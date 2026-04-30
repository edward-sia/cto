import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { VerificationCommand, VerificationResult, VerificationSummary } from "../types/index.js";

const OUTPUT_LIMIT = 12_000;
const HARD_KILL_DELAY_MS = 1_000;

function appendTruncated(current: string, chunk: Buffer | string): string {
  if (current.length >= OUTPUT_LIMIT) return current;
  const next = current + chunk.toString();
  return next.length > OUTPUT_LIMIT ? next.slice(0, OUTPUT_LIMIT) : next;
}

export class VerificationRunner {
  constructor(private readonly commands: VerificationCommand[]) {}

  async run(workingDirectory: string): Promise<VerificationSummary> {
    const results: VerificationResult[] = [];

    for (const command of this.commands) {
      results.push(await this.runCommand(command, workingDirectory));
    }

    return {
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      requiredFailed: results.filter((result) => !result.passed && this.isRequired(result.commandId)).length,
      results,
    };
  }

  private isRequired(commandId: string): boolean {
    return this.commands.find((command) => command.id === commandId)?.required ?? false;
  }

  private runCommand(command: VerificationCommand, workingDirectory: string): Promise<VerificationResult> {
    const startedAt = Date.now();

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let hardKillTimeout: ReturnType<typeof setTimeout> | undefined;

      const killChild = (child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) => {
        if (child.pid) {
          try {
            process.kill(-child.pid, signal);
            return;
          } catch {
            // Fall through to killing the shell process if process-group kill is unavailable.
          }
        }
        child.kill(signal);
      };

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(command.command, {
          cwd: workingDirectory,
          detached: true,
          shell: true,
        });
      } catch (error) {
        resolve({
          commandId: command.id,
          command: command.command,
          exitCode: null,
          passed: false,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr: appendTruncated(stderr, error instanceof Error ? error.message : String(error)),
        });
        return;
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        stderr = appendTruncated(stderr, `Command timed out after ${command.timeoutMs}ms\n`);
        killChild(child, "SIGTERM");
        hardKillTimeout = setTimeout(() => {
          if (!settled) killChild(child, "SIGKILL");
        }, HARD_KILL_DELAY_MS);
      }, command.timeoutMs);

      const clearTimers = () => {
        clearTimeout(timeout);
        if (hardKillTimeout) clearTimeout(hardKillTimeout);
      };

      const settle = (result: VerificationResult) => {
        if (settled) return;
        settled = true;
        clearTimers();
        resolve(result);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = appendTruncated(stdout, chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = appendTruncated(stderr, chunk);
      });

      child.on("error", (error) => {
        settle({
          commandId: command.id,
          command: command.command,
          exitCode: null,
          passed: false,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr: appendTruncated(stderr, error.message),
        });
      });

      child.on("close", (code) => {
        settle({
          commandId: command.id,
          command: command.command,
          exitCode: code,
          passed: !timedOut && code === 0,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr,
        });
      });
    });
  }
}
