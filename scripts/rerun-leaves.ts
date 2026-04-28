/**
 * One-off helper: re-execute Codex on every leaf of an existing run, then
 * re-judge. Use after fixing the Codex client to avoid re-paying for the
 * debate phase. Usage: npx tsx scripts/rerun-leaves.ts <run-id>
 */

import OpenAI from "openai";
import { FileStore } from "../src/persistence/file-store.js";
import { CodexExecutor } from "../src/execution/codex-client.js";
import { Judge } from "../src/judge/judge.js";
import type { TreeNode } from "../src/types/index.js";

const runId = process.argv[2];
if (!runId) {
  console.error("Usage: npx tsx scripts/rerun-leaves.ts <run-id>");
  process.exit(1);
}

const store = new FileStore();
const state = await store.load(runId);
if (!state) {
  console.error(`Run ${runId} not found`);
  process.exit(1);
}

const codex = new CodexExecutor(state.config.workingDirectory);
const judge = new Judge(new OpenAI(), state.config.judgeModel);

function collectLeaves(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

const leaves = collectLeaves(state.root);
console.log(`Re-executing ${leaves.length} leaves in ${state.config.workingDirectory}`);

for (const leaf of leaves) {
  console.log(`\n→ ${leaf.id} (${leaf.branchLabel || "root"})`);
  leaf.executionResult = await codex.execute(leaf);
  console.log(`  exec: success=${leaf.executionResult.success} files=${leaf.executionResult.filesChanged.length}`);
  leaf.score = await judge.score(leaf);
  leaf.status = "scored";
  console.log(`  score: ${leaf.score.composite}/10`);
  await store.save(state);
}

state.rankedResults = leaves
  .filter((l) => l.score)
  .map((l) => ({ nodeId: l.id, path: [l.branchLabel].filter(Boolean), score: l.score! }))
  .sort((a, b) => b.score.composite - a.score.composite);

await store.save(state);
console.log("\nDone. Use `npx tsx src/cli/index.ts show <run-id>` to view ranked results.");
