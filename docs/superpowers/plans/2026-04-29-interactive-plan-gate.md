# Interactive Plan Gate Implementation Plan

> **For agentic workers:** This implementation plan has been completed. It originally required superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task; completed steps are marked with checkbox (`- [x]`) syntax.

**Goal:** Add opt-in CLI/orchestrator support for a one-shot human review gate before leaf implementation.

**Status:** Implemented

**Architecture:** The orchestrator owns the gate so `run()` and `resume()` share behavior, while the CLI supplies terminal prompts via callbacks. Human decisions are persisted on `TreeNode`; revision prompts flow through `NodeContext` into agent, synthesis, and execution prompts.

**Tech Stack:** TypeScript ESM, Commander, readline/promises, Vitest.

---

## File Structure

- Modify `src/types/index.ts`: add `HumanIntervention`, `HumanPlanDecision`, `humanIntervention`, `humanRevisionPrompt`, and `interactivePlan`.
- Modify `src/orchestrator/orchestrator.ts`: add the gate between tree traversal and execution, share post-tree completion between `run()` and `resume()`, apply proceed/revise/kill decisions, and exclude pruned nodes from leaf collection.
- Modify `src/agents/definitions.ts`: render `humanRevisionPrompt` in agent prompts.
- Modify `src/execution/codex-client.ts`: include `humanRevisionPrompt` in implementation prompts.
- Modify `src/synthesis/synthesizer.ts`: include `humanRevisionPrompt` in exploration synthesis prompts.
- Modify `src/cli/index.ts`: add `--interactive-plan` to `run` and `resume`, implement terminal review callbacks.
- Modify `tests/orchestrator/orchestrator.test.ts`: cover proceed, kill, revise, all-killed pause, and non-interactive behavior.

---

### Task 1: Types and Orchestrator Gate Tests

**Files:**
- Modify: `src/types/index.ts`
- Modify: `tests/orchestrator/orchestrator.test.ts`

- [x] **Step 1: Write failing orchestrator tests**

Add tests that construct `TreeOrchestrator` with `dryRun: true`, shallow `maxDepth`, and `interactivePlan: true`. Use `onHumanPlanReview` callbacks returning `{ action: "proceed" }`, `{ action: "kill" }`, or `{ action: "revise", prompt: "Prefer local-first storage." }`.

Required assertions:

```ts
expect(state.config.interactivePlan).toBe(true);
expect(review).toHaveBeenCalled();
expect(reviewedLeaf.humanIntervention).toMatchObject({ action: "proceed" });
expect(killedLeaf.status).toBe("pruned");
expect(state.leafNodeIds).not.toContain(killedLeaf.id);
expect(revisedLeaf.children[0].branchLabel).toBe("human-revision");
expect(revisedLeaf.children[0].context.humanRevisionPrompt).toBe("Prefer local-first storage.");
expect(state.status).toBe("paused");
expect(state.rankedResults).toBeUndefined();
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/orchestrator/orchestrator.test.ts`

Expected: FAIL because `interactivePlan`, `HumanPlanDecision`, and `humanIntervention` do not exist yet.

- [x] **Step 3: Add type definitions**

Add:

```ts
export interface HumanIntervention {
  action: "proceed" | "revise" | "kill";
  prompt?: string;
  createdAt: string;
}

export type HumanPlanDecision =
  | { action: "proceed" }
  | { action: "revise"; prompt: string }
  | { action: "kill" };
```

Extend `NodeContext`, `TreeNode`, and `RunConfig` with:

```ts
humanRevisionPrompt?: string;
humanIntervention?: HumanIntervention;
interactivePlan: boolean;
```

- [x] **Step 4: Run tests to verify remaining failures**

Run: `npm test -- tests/orchestrator/orchestrator.test.ts`

Expected: FAIL because orchestrator behavior is not implemented yet.

---

### Task 2: Orchestrator Gate Implementation

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`
- Modify: `tests/orchestrator/orchestrator.test.ts`

- [x] **Step 1: Implement minimal orchestrator callbacks and default config**

Add `interactivePlan: false` to `DEFAULT_RUN_CONFIG` and callback types:

```ts
onHumanPlanReview?: (node: TreeNode, state: RunState) => Promise<HumanPlanDecision>;
onHumanPlanApplied?: (nodeId: string, decision: HumanPlanDecision) => void;
```

- [x] **Step 2: Share post-tree completion**

Extract completion after `processNode()` into a private method:

```ts
private async completeAfterTree(root: TreeNode): Promise<void>
```

It should collect leaves, run the gate when enabled, recollect leaves, skip execution if none remain, then execute/synthesize and rank as current code does.

- [x] **Step 3: Apply human decisions**

Implement:

```ts
private async runInteractivePlanGate(root: TreeNode): Promise<void>
private async applyHumanPlanDecision(node: TreeNode, decision: HumanPlanDecision): Promise<void>
private isHumanRevisionDescendant(node: TreeNode): boolean
```

Rules:

- `proceed` records intervention only.
- `kill` records intervention and sets status `pruned`.
- `revise` records intervention, creates a `human-revision` child with `humanRevisionPrompt`, then calls `processNode(child)`.
- Nodes under a human revision are not prompted again.
- Missing callback throws a clear error.

- [x] **Step 4: Fix leaf collection for pruned nodes**

Update `collectLeafIds()` and `collectLeaves()` to exclude `status === "pruned"` before returning leaf nodes.

- [x] **Step 5: Run orchestrator tests**

Run: `npm test -- tests/orchestrator/orchestrator.test.ts`

Expected: PASS.

---

### Task 3: Prompt Propagation

**Files:**
- Modify: `src/agents/definitions.ts`
- Modify: `src/execution/codex-client.ts`
- Modify: `src/synthesis/synthesizer.ts`
- Modify: existing tests where practical.

- [x] **Step 1: Write prompt tests**

Add or update tests to assert prompts include:

```text
Human Revision
Prefer local-first storage.
```

Use existing prompt-building tests where available; otherwise use dry-run execution/synthesis output that echoes prompt slices.

- [x] **Step 2: Verify prompt tests fail**

Run focused tests:

```bash
npm test -- tests/synthesis/synthesizer.test.ts tests/orchestrator/orchestrator.test.ts
```

Expected: FAIL because prompt rendering does not include the new field.

- [x] **Step 3: Add prompt sections**

Render `context.humanRevisionPrompt` in agent, Codex implementation, and synthesis prompts with the heading `Human Revision`.

- [x] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/synthesis/synthesizer.test.ts tests/orchestrator/orchestrator.test.ts
```

Expected: PASS.

---

### Task 4: CLI Interactive Prompt

**Files:**
- Modify: `src/cli/index.ts`
- Test manually with dry-run.

- [x] **Step 1: Add CLI flags**

Add `.option("--interactive-plan", "Review candidate leaves before implementation", false)` to `run` and `resume`.

- [x] **Step 2: Pass config and callback**

Pass `interactivePlan: Boolean(opts.interactivePlan)` into `run`; on resume, pass the flag only when provided and otherwise let persisted config win.

Add a `reviewHumanPlan()` helper using `readline/promises` that returns `HumanPlanDecision`.

- [x] **Step 3: Add final-leaf warning**

When there is one executable leaf left and the user chooses kill, ask confirmation before returning `{ action: "kill" }`.

- [x] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

---

### Task 5: Full Verification

**Files:**
- All modified source and tests.

- [x] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: pass.

- [x] **Step 3: Dry-run manual smoke**

Run:

```bash
npx tsx src/cli/index.ts run "Build a hello world CLI" --dry-run --interactive-plan
```

Choose at least one proceed or revise path. Expected: run completes or pauses cleanly if all leaves are killed.

- [x] **Step 4: Commit**

Run:

```bash
git add src tests docs/superpowers/plans/2026-04-29-interactive-plan-gate.md
git commit -m "feat: add interactive plan gate"
```
