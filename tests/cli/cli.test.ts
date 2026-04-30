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

  it("exposes evolutionary foundation flags", () => {
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

    expect(output).toContain("--verify");
    expect(output).toContain("--verify-timeout");
    expect(output).toContain("--prune-schedule");
  });

  it("rejects invalid prune schedule entries", () => {
    type ExecFileError = Error & {
      status?: number;
      stderr?: string | Buffer;
    };

    let error: ExecFileError | undefined;

    try {
      execFileSync(
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
          "--prune-schedule",
          "0:0.4,bad",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          env: { ...process.env, FORCE_COLOR: "0" },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
    } catch (err) {
      error = err instanceof Error ? err as ExecFileError : undefined;
    }

    expect(error).toBeDefined();
    expect(error?.status).toBeGreaterThan(0);
    expect(error?.stderr?.toString()).toContain("Invalid prune schedule entry");
  });
});
