import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("CLI", () => {
  it("prints task analysis before building the dry-run tree", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "Build a REST API",
        "--dry-run",
        "--depth",
        "2",
        "--rounds",
        "1",
        "--branching",
        "2",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).toContain("Run mode:  implementation");
    expect(output).toContain(
      "Agents:    Product Manager, Business Analyst, Tech Lead, Developer, Code Reviewer, QA Engineer"
    );
    expect(output).toContain("Rationale: Default panel (dry-run or analyzer fallback)");
  });

  it("prints full debate discussion text by default", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "Build a REST API",
        "--dry-run",
        "--depth",
        "1",
        "--rounds",
        "1",
        "--branching",
        "2",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).toContain("Product Manager:");
    expect(output).toContain("Better fit if requirements expand later.");
  });

  it("does not expose discussion verbosity flags", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "--help",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).not.toContain("full-discussions");
    expect(output).not.toContain("compact-discussions");
  });

  it("exposes live monitor and browser review flags", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "--help",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).toContain("--monitor");
    expect(output).toContain("--ui-review");
  });

  it("uses provider-specific default models in dry-run mode", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "Build a REST API",
        "--dry-run",
        "--depth",
        "1",
        "--rounds",
        "1",
        "--provider",
        "openrouter",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).toContain("provider=openrouter");
    expect(output).toContain("model=qwen/qwen3-coder:free");
    expect(output).toContain("Provider:   OpenRouter");
  });

  it("shows the supported LLM providers in help", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "--help",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).toContain("--provider <provider>");
    expect(output).toContain("openrouter");
    expect(output).toContain("gemini");
    expect(output).toContain("deepseek");
    expect(output).toContain("claude");
  });

  it("uses Claude default model in dry-run mode", () => {
    const output = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "Build a REST API",
        "--dry-run",
        "--depth",
        "1",
        "--rounds",
        "1",
        "--provider",
        "claude",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(output).toContain("provider=claude");
    expect(output).toContain("model=claude-sonnet-4-5");
    expect(output).toContain("Provider:   Claude / Anthropic");
  });

  it("reports missing Anthropic key for non-dry Claude runs", () => {
    try {
      execFileSync(
        "npx",
        [
          "tsx",
          "src/cli/index.ts",
          "run",
          "Build a REST API",
          "--provider",
          "claude",
          "--depth",
          "0",
          "-y",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          env: { ...process.env, FORCE_COLOR: "0", ANTHROPIC_API_KEY: "" },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      throw new Error("Expected command to fail");
    } catch (error) {
      const stderr = error instanceof Error && "stderr" in error
        ? String((error as { stderr: Buffer | string }).stderr)
        : "";
      expect(stderr).toContain("Claude / Anthropic requires ANTHROPIC_API_KEY");
    }
  });

  it("preserves Claude provider settings when resuming a saved dry-run", () => {
    const runOutput = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "run",
        "Build a REST API",
        "--dry-run",
        "--depth",
        "0",
        "--provider",
        "claude",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    const runId = runOutput.match(/Run ID:\s+(run-[A-Za-z0-9_-]+)/)?.[1];
    expect(runId).toBeDefined();

    const resumeOutput = execFileSync(
      "npx",
      [
        "tsx",
        "src/cli/index.ts",
        "resume",
        runId!,
        "--dry-run",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    expect(resumeOutput).toContain("LLM: Claude / Anthropic");
    expect(resumeOutput).toContain("model=claude-sonnet-4-5");
  });
});
