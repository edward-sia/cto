import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VerificationRunner } from "../../src/verification/runner.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cto-verify-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("VerificationRunner", () => {
  it("records passing commands", async () => {
    const runner = new VerificationRunner([
      { id: "ok", command: "node -e \"console.log('pass')\"", required: true, timeoutMs: 30000 },
    ]);

    const summary = await runner.run(tempDir());

    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.requiredFailed).toBe(0);
    expect(summary.results[0].stdout).toContain("pass");
  });

  it("records failing required commands", async () => {
    const runner = new VerificationRunner([
      { id: "fail", command: "node -e \"process.exit(7)\"", required: true, timeoutMs: 30000 },
    ]);

    const summary = await runner.run(tempDir());

    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.requiredFailed).toBe(1);
    expect(summary.results[0].exitCode).toBe(7);
  });

  it("runs commands in the provided cwd", async () => {
    const cwd = tempDir();
    const runner = new VerificationRunner([
      { id: "cwd", command: "node -e \"console.log(process.cwd())\"", required: true, timeoutMs: 30000 },
    ]);

    const summary = await runner.run(cwd);

    expect(summary.passed).toBe(1);
    expect(realpathSync(summary.results[0].stdout.trim())).toBe(realpathSync(cwd));
  });

  it("records failing non-required commands without incrementing required failures", async () => {
    const runner = new VerificationRunner([
      { id: "optional", command: "node -e \"process.exit(3)\"", required: false, timeoutMs: 30000 },
    ]);

    const summary = await runner.run(tempDir());

    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.requiredFailed).toBe(0);
    expect(summary.results[0].exitCode).toBe(3);
  });

  it("truncates long command output", async () => {
    const runner = new VerificationRunner([
      { id: "long", command: "node -e \"process.stdout.write('x'.repeat(13000))\"", required: true, timeoutMs: 30000 },
    ]);

    const summary = await runner.run(tempDir());

    expect(summary.passed).toBe(1);
    expect(summary.results[0].stdout).toHaveLength(12000);
  });

  it("records timeouts without throwing", async () => {
    const runner = new VerificationRunner([
      { id: "timeout", command: "node -e \"setTimeout(() => {}, 1000)\"", required: true, timeoutMs: 50 },
    ]);

    const summary = await runner.run(tempDir());

    expect(summary.failed).toBe(1);
    expect(summary.requiredFailed).toBe(1);
    expect(summary.results[0].passed).toBe(false);
    expect(summary.results[0].stderr).toContain("timed out");
  });
});
