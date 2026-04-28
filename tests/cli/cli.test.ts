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
    expect(output).toContain("Agents:    Product Manager, Tech Lead, Developer, QA Engineer");
    expect(output).toContain("Rationale: Default panel (dry-run or analyzer fallback)");
  });
});
