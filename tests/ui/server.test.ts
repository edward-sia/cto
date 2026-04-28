import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunState, TreeNode } from "../../src/types/index.js";
import { startUiServer, type StartedUiServer } from "../../src/ui/server.js";

let server: StartedUiServer | undefined;
let originalCwd: string | undefined;
let tempDir: string | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }

  if (originalCwd) {
    process.chdir(originalCwd);
    originalCwd = undefined;
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("startUiServer", () => {
  it("rejects encoded path traversal run ids before loading from disk", async () => {
    const cwd = await createTempCwd();
    await mkdir(join(cwd, ".codex-tree"), { recursive: true });
    await mkdir(join(cwd, "outside-run"), { recursive: true });
    await writeFile(
      join(cwd, "outside-run", "state.json"),
      JSON.stringify(run({ id: "outside-run" })),
      "utf-8",
    );

    server = await startUiServer({ openBrowser: false, port: 43280 });

    const response = await fetch(new URL("/api/runs/..%2Foutside-run", server.url));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Run not found" });
  });
});

async function createTempCwd(): Promise<string> {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "cto-ui-server-"));
  const cwd = join(tempDir, "project");
  await mkdir(cwd, { recursive: true });
  process.chdir(cwd);
  return cwd;
}

function node(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: overrides.id ?? "node-root",
    parentId: overrides.parentId ?? null,
    depth: overrides.depth ?? 0,
    phase: overrides.phase ?? "requirements",
    status: overrides.status ?? "pending",
    context: overrides.context ?? {
      originalIntent: "Ship a saved-run UI",
      ancestorSummaries: [],
    },
    children: overrides.children ?? [],
    branchLabel: overrides.branchLabel ?? "",
    branchDescription: overrides.branchDescription ?? "",
    createdAt: overrides.createdAt ?? "2026-04-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T00:00:00.000Z",
  };
}

function run(overrides: Partial<RunState>): RunState {
  return {
    id: overrides.id ?? "run-123",
    intent: overrides.intent ?? "Create a persisted run browser.",
    status: overrides.status ?? "completed",
    startedAt: overrides.startedAt ?? "2026-04-28T01:00:00.000Z",
    root: overrides.root ?? node({}),
    leafNodeIds: overrides.leafNodeIds ?? [],
    totalTokensUsed: overrides.totalTokensUsed ?? 0,
    config:
      overrides.config ?? {
        maxDepth: 3,
        maxBranching: 2,
        maxDebateRounds: 2,
        reasoningModel: "gpt-5",
        judgeModel: "gpt-5",
        workingDirectory: "/repo",
        phaseDepths: {
          requirements: [0, 0],
          architecture: [1, 1],
          implementation: [2, 2],
          validation: [3, 3],
        },
        dryRun: false,
        leafConcurrency: 4,
        pruneThreshold: 0.4,
      },
  };
}
