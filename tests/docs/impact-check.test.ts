import { describe, expect, it } from "vitest";
import {
  classifyChangedFiles,
  isCodeImpactPath,
  isDocumentationPath,
} from "../../src/docs/impact-check.js";

describe("docs impact path classification", () => {
  it("treats README, agent docs, and docs directory files as documentation", () => {
    expect(isDocumentationPath("README.md")).toBe(true);
    expect(isDocumentationPath("AGENTS.md")).toBe(true);
    expect(isDocumentationPath("CLAUDE.md")).toBe(true);
    expect(isDocumentationPath("docs/architecture.md")).toBe(true);
  });

  it("treats source, tests, scripts, and package metadata as code-impacting", () => {
    expect(isCodeImpactPath("src/cli/index.ts")).toBe(true);
    expect(isCodeImpactPath("tests/cli/cli.test.ts")).toBe(true);
    expect(isCodeImpactPath("scripts/rerun-leaves.ts")).toBe(true);
    expect(isCodeImpactPath("package.json")).toBe(true);
  });

  it("requires docs when only code-impacting files changed", () => {
    expect(classifyChangedFiles(["src/cli/index.ts"]).requiresDocsUpdate).toBe(true);
  });

  it("passes when code-impacting changes include a docs update", () => {
    expect(classifyChangedFiles(["src/cli/index.ts", "AGENTS.md"]).requiresDocsUpdate).toBe(false);
  });

  it("passes for docs-only changes", () => {
    expect(classifyChangedFiles(["README.md", "docs/architecture.md"]).requiresDocsUpdate).toBe(false);
  });
});
