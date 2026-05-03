import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileStore } from "../../src/persistence/file-store.js";
import type { RunState } from "../../src/types/index.js";

describe("FileStore", () => {
  const originalStoreDir = process.env.CAMBRIAN_TREE_STORE_DIR;
  const originalCwd = process.cwd();
  const tempDirs: string[] = [];

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalStoreDir === undefined) {
      delete process.env.CAMBRIAN_TREE_STORE_DIR;
    } else {
      process.env.CAMBRIAN_TREE_STORE_DIR = originalStoreDir;
    }

    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("uses CAMBRIAN_TREE_STORE_DIR for the default run store", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "cto-store-test-"));
    tempDirs.push(tempDir);
    const storeDir = join(tempDir, "runs");
    process.env.CAMBRIAN_TREE_STORE_DIR = storeDir;

    const store = new FileStore();
    await store.save(buildRunState("run-test-env-store"));

    const saved = JSON.parse(await readFile(join(storeDir, "run-test-env-store", "state.json"), "utf-8")) as RunState;
    expect(saved.id).toBe("run-test-env-store");
  });
});

function buildRunState(id: string): RunState {
  return {
    id,
    config: {
      maxDepth: 1,
      maxBranching: 1,
      maxDebateRounds: 1,
      llmProvider: "openai",
      llmApiKeyEnv: "OPENAI_API_KEY",
      reasoningModel: "gpt-4o",
      judgeModel: "gpt-4o",
      workingDirectory: process.cwd(),
      dryRun: true,
      interactivePlan: false,
      leafConcurrency: 1,
      pruneThreshold: 0,
    },
    intent: "Test isolated store",
    root: {
      id: "node-root",
      parentId: null,
      depth: 0,
      status: "pending",
      phase: "requirements",
      context: {
        originalIntent: "Test isolated store",
        ancestorSummaries: [],
      },
      debateRounds: [],
      children: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    leafNodeIds: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    totalTokensUsed: 0,
    status: "running",
    runMode: "implementation",
  };
}
