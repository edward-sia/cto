# Interactive Plan Gate

**Date:** 2026-04-29
**Status:** Draft for review

## Overview

Add an opt-in interactive planning gate that pauses a CTO run after debate traversal has produced candidate leaves, but before implementation or synthesis begins. During this gate, the human can review each candidate leaf once and choose to proceed, kill the branch, or add one revision prompt. A revision creates a new child branch that goes through another CTO debate before becoming eligible for implementation.

This keeps normal CTO runs fully automated while giving users a budget-control and steering point before expensive leaf execution.

## Goals

- Add a human-in-the-loop checkpoint before Codex implementation or exploration synthesis.
- Let users kill low-value branches before execution.
- Let users inject one steering prompt into a consensus leaf.
- Represent the steering prompt as normal persisted tree state, not an ephemeral CLI-only detail.
- Re-run CTO debate for revised branches so agents can integrate the human instruction before execution.
- Preserve current non-interactive behavior unless the new mode is explicitly enabled.
- Keep the saved-run UI out of scope for this first version.

## Non-Goals

- No browser UI changes.
- No multi-step review loop in the first version.
- No editing arbitrary past nodes.
- No free-form tree surgery beyond proceed, revise, or kill on current leaf candidates.
- No special judge behavior for human-revised branches beyond using the updated node context.
- No automatic branch recovery after kill; killed nodes remain pruned unless a later command explicitly changes that in a future version.

## Command UX

Add an opt-in flag to `cto run`:

```bash
cto run "Build a REST API" --interactive-plan
```

The flag enables a review step after the debate tree is built and `leafNodeIds` has been calculated, but before `executeLeaves()` or `synthesizeLeaves()` starts.

For each candidate leaf, the CLI prints compact context:

```text
Review leaf node-abc123 (depth 5)
Path: consensus > Event-driven queue
Summary: Agents converged on an async worker design with retryable jobs.

Choose: [p]roceed, [r]evise once, [k]ill
```

Choices:

- `proceed`: keep this leaf for execution.
- `revise`: ask for one human revision prompt, create a new child node, and debate that child.
- `kill`: mark the leaf as `pruned`, excluding it from execution and scoring.

The gate should only prompt on terminal candidate leaves that have not already received a human gate decision and are not descendants of a human revision. This preserves the first-version rule: one human revision opportunity per original candidate leaf, not an open-ended review loop.

## Data Model

Add a persisted intervention record:

```ts
export interface HumanIntervention {
  action: "proceed" | "revise" | "kill";
  prompt?: string;
  createdAt: string;
}
```

Extend `TreeNode`:

```ts
humanIntervention?: HumanIntervention;
```

Extend `NodeContext`:

```ts
humanRevisionPrompt?: string;
```

Extend `RunConfig`:

```ts
interactivePlan: boolean;
```

The intervention record captures the human action on the reviewed leaf. The context field makes the revision prompt available to agents, the moderator, Codex execution, synthesis, and persisted state inspection.

## Orchestrator Flow

Current flow:

```text
analyze intent
decompose intent
process root debate tree
collect leaf ids
execute or synthesize leaves
judge implementation leaves
complete run
```

New flow when `interactivePlan` is enabled:

```text
analyze intent
decompose intent
process root debate tree
collect leaf ids
run interactive plan gate
collect leaf ids again
execute or synthesize surviving leaves
judge implementation leaves
complete run
```

The gate lives in the orchestrator rather than only in the CLI so it can be tested and resumed consistently. The CLI supplies the prompt implementation through callbacks.

The review set is the snapshot of executable leaves collected immediately before the gate starts. If a user revises a leaf, the revised child and any descendants produced by its debate are eligible for execution, but they are not presented for another human review in the same first-version flow.

## Revision Branch Behavior

When the user chooses `revise` for a leaf:

1. Store the intervention on the reviewed leaf:

   ```ts
   node.humanIntervention = {
     action: "revise",
     prompt,
     createdAt: new Date().toISOString(),
   };
   ```

2. Create a new child node under that leaf.
3. Copy the existing context and add `humanRevisionPrompt`.
4. Append a clear ancestor summary noting the human revision.
5. Set the child branch metadata:

   ```ts
   child.branchLabel = "human-revision";
   child.branchDescription = prompt;
   ```

6. Run the normal debate flow on the new child.
7. Exclude the original reviewed node from execution by treating it as a non-leaf once it has the revision child.

This makes the revised path part of the same tree, so existing tree printing and persistence continue to work.

## Kill Behavior

When the user chooses `kill`:

```ts
node.humanIntervention = {
  action: "kill",
  createdAt: new Date().toISOString(),
};
node.status = "pruned";
```

Pruned leaves are excluded from `collectLeafIds()`, execution, synthesis, ranking, and scoring. Existing pruned-branch behavior should be reused where possible.

If every candidate leaf is killed, the run should pause with a clear message instead of attempting empty execution. The first-version behavior is:

- set `runState.status = "paused"`
- save state
- print that no executable leaves remain
- skip execution and scoring

Because this version has no branch recovery command, users should be warned before killing the final surviving leaf.

## Proceed Behavior

When the user chooses `proceed`:

```ts
node.humanIntervention = {
  action: "proceed",
  createdAt: new Date().toISOString(),
};
```

The node remains eligible for execution or synthesis. Proceed decisions are persisted so resume does not re-prompt for already reviewed leaves.

## Prompt Integration

Agent prompts should include the human revision prompt when present in `NodeContext`:

```text
## Human Revision
The human reviewer added this steering instruction before implementation:
<prompt>
```

Implementation and synthesis prompts should also include the same field. This ensures a revised branch changes both debate behavior and final leaf execution behavior.

The moderator does not need special logic beyond seeing the prompt in context. It can continue deciding consensus, continue, or divergence using the normal rules.

## Resume Behavior

Interactive state must remain resumable.

If a user interrupts during the review gate:

- save the current `RunState`
- set `status` to `paused`
- preserve all recorded `humanIntervention` values
- preserve any revision child nodes already created

On `cto resume <run-id>`, the orchestrator should:

- continue pending debate nodes first
- if `interactivePlan` is enabled, resume the gate for candidate leaves without a `humanIntervention`
- avoid prompting again for leaves already marked `proceed`, `revise`, or `kill`
- avoid prompting descendants of a human-revised node
- execute or synthesize surviving leaves after the gate is complete

This requires `resume()` to share the same post-tree flow as `run()`, instead of only processing pending nodes and marking the run completed.

## Callback Design

Add orchestrator callbacks for the interactive gate:

```ts
type HumanPlanDecision =
  | { action: "proceed" }
  | { action: "revise"; prompt: string }
  | { action: "kill" };

onHumanPlanReview?: (node: TreeNode, state: RunState) => Promise<HumanPlanDecision>;
onHumanPlanApplied?: (nodeId: string, decision: HumanPlanDecision) => void;
```

If `interactivePlan` is true but `onHumanPlanReview` is missing, the orchestrator should fail fast with a clear error. This prevents a non-interactive environment from hanging unexpectedly.

The CLI implementation should use `readline/promises`, mirroring the existing confirmation prompt style.

## CLI Details

Add `--interactive-plan` to `run` and `resume`.

For `run`, the flag sets `RunConfig.interactivePlan = true`.

For `resume`, behavior should default to the persisted value from the run state. Passing `--interactive-plan` can enable it for an older paused run that did not originally have the flag.

The CLI should validate answers case-insensitively:

- `p`, `proceed`
- `r`, `revise`
- `k`, `kill`

For revision prompts:

- trim surrounding whitespace
- reject empty prompts
- keep the prompt as authored otherwise

For non-TTY input, the first version should require an explicit callback and fail with a clear message if interactive mode cannot prompt.

## Error Handling

- Empty revision prompt: ask again.
- Invalid action: ask again.
- SIGINT during gate: save state and mark paused.
- Missing review callback while interactive mode is enabled: throw a descriptive error.
- All leaves pruned: save paused state and skip execution.
- Debate failure on a revised child: mark run failed using existing error flow.

## Testing

Unit tests should cover:

- `interactivePlan: false` preserves current automatic behavior.
- Proceed records a `humanIntervention` and leaves the node executable.
- Kill records a `humanIntervention`, marks the node `pruned`, and excludes it from execution.
- Revise records a `humanIntervention`, creates a `human-revision` child, stores `humanRevisionPrompt`, and processes the new child debate.
- Resume does not re-prompt leaves with existing interventions.
- Resume continues the interactive gate for unreviewed candidate leaves.
- Dry-run supports proceed, revise, and kill without OpenAI or Codex calls.
- A run with every leaf killed is saved as paused and does not call execution or synthesis.

Manual verification:

```bash
npm run typecheck
npm test
npx tsx src/cli/index.ts run "Build a hello world CLI" --dry-run --interactive-plan
```

During manual verification, choose proceed for one leaf, revise for one leaf if present, and kill for one leaf if present. Confirm the printed tree shows the human revision child and pruned branch.

## Acceptance Criteria

- `cto run --interactive-plan` pauses after debate traversal and before leaf execution.
- The user can proceed, revise once, or kill each candidate leaf.
- A revised leaf creates a child branch and runs another CTO debate.
- Killed leaves are excluded from execution, synthesis, scoring, and ranking.
- Proceeded leaves execute or synthesize normally.
- Human decisions persist to `.cambrian-tree/<run-id>/state.json`.
- `cto resume` continues paused interactive runs without re-prompting reviewed leaves.
- Existing non-interactive runs behave as they do today.
- No saved-run UI changes are included.
