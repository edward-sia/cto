import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexExecutor } from "../../src/execution/codex-client.js";
import type { TreeNode } from "../../src/types/index.js";

describe("CodexExecutor", () => {
  it("includes a human revision prompt in dry-run implementation output", async () => {
    const executor = new CodexExecutor(mkdtempSync(join(tmpdir(), "cto-codex-")), true);
    const result = await executor.execute(makeLeafNode());

    expect(result.output).toContain("Human Revision");
    expect(result.output).toContain("Prefer local-first storage.");
  });
});

function makeLeafNode(): TreeNode {
  return {
    id: "node-test123",
    parentId: null,
    depth: 1,
    phase: "implementation",
    status: "consensus",
    context: {
      originalIntent: "Build a REST API",
      humanRevisionPrompt: "Prefer local-first storage.",
      ancestorSummaries: [],
    },
    children: [],
    branchLabel: "human-revision",
    branchDescription: "Prefer local-first storage.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
