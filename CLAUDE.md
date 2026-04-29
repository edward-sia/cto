# CLAUDE.md — Cambrian Tree Orchestrator (CTO)

## Project Overview

Tree-of-Thought agent orchestration for software development, with leaf execution handled by a configurable execution layer. A CLI tool where specialised agents (PM, BA, Tech Lead, Developer, Code Reviewer, QA) debate solutions in round-table format, branch when alternatives surface, optionally pause for a human plan review, execute leaf solutions, score results with an LLM judge, and visualize saved runs in a local browser UI.

## Architecture (3 Layers)

```
Interface: CLI + saved-run UI (src/cli/, src/ui/) — commands, local browser viewer
Layer 1: Orchestrator (src/orchestrator/) — tree traversal, branching, state
Layer 2: Agent Panel (src/agents/, src/debate/) — round-table debate engine
Layer 3: Execution (src/execution/, src/judge/) — Codex SDK + LLM scoring
```

## Tech Stack

- **Language:** TypeScript (ESM, NodeNext modules)
- **Runtime:** Node.js 18+
- **Key deps:** openai, @openai/codex-sdk, commander, chalk, ora, nanoid, zod
- **Persistence:** JSON files in `.cambrian-tree/<run-id>/state.json`
- **CLI framework:** Commander.js
- **UI:** Dependency-free local HTTP server + browser shell in `src/ui/`

## File Structure

```
src/
├── cli/index.ts              # CLI entry point (commander)
├── types/index.ts            # Core type definitions (TreeNode, RunState, etc.)
├── schemas/index.ts          # Zod schemas for LLM response validation
├── utils/retry.ts            # Exponential-backoff retry wrapper
├── utils/cost.ts             # Pre-run token/USD estimator
├── agents/definitions.ts     # Agent system prompts + role configs
├── debate/engine.ts          # Round-table debate engine
├── orchestrator/orchestrator.ts  # Main tree orchestration loop
├── execution/codex-client.ts # Codex SDK integration
├── judge/judge.ts            # LLM scoring engine
├── persistence/file-store.ts # JSON file persistence
└── ui/                       # Saved-run browser UI (server, page, layout helpers)
```

## Commands

```bash
npm install                    # Install deps
npx tsx src/cli/index.ts run "<intent>" --depth 3 --branching 2  # Run
npx tsx src/cli/index.ts run "<intent>" --interactive-plan  # Run with human review before leaf execution
npx tsx src/cli/index.ts list  # List runs
npx tsx src/cli/index.ts show <run-id>  # Show results
npx tsx src/cli/index.ts tree <run-id>  # Print tree
npx tsx src/cli/index.ts ui [run-id]  # Launch saved-run browser UI
npx tsx src/cli/index.ts resume <run-id>  # Resume
```

## How It Works

1. Human provides intent → root node created
2. At each node: agents debate in rounds (round-robin, each speaks once per round)
3. Moderator assesses after each round: consensus / diverging / continue
4. If diverging → tree branches (each alternative = child node)
5. If consensus → single child, go deeper
6. At max depth → candidate leaves are collected
7. If `--interactive-plan` is enabled → human reviews each candidate leaf once: proceed, revise with a new prompt, or kill the branch
8. Surviving leaf nodes are submitted to Codex for implementation
9. LLM Judge scores each leaf on 6 dimensions (functional completeness, architectural quality, test coverage, intent alignment, real-world fit, simplicity)
10. Results ranked by weighted composite score
11. Saved runs can be inspected visually with `cto ui`

## Key Design Patterns

- **Branching is organic:** Agents surface alternatives via their debate contributions. The moderator (separate LLM call) detects divergence and forks. No hard-coded branching rules.
- **Context accumulates:** Each child inherits parent context + debate summary. Leaf nodes get the full ancestor path as implementation context.
- **Human plan gate is opt-in:** `--interactive-plan` pauses before execution. Human revisions create a `human-revision` child that gets another CTO debate; killed branches are marked `pruned`.
- **Brute force exploration (v1):** All branches explored. MCTS-style pruning is planned for v2.
- **State persistence:** Tree saved to disk after every node. Runs are resumable and viewable through `cto ui`.
- **UI boundary:** The saved-run UI is read-only. It uses local JSON routes over `.cambrian-tree` state and validates run IDs before loading files.

## Current Status

**Phases 1–4, interactive plan gate, and saved-run UI complete.** The CLI runs end-to-end with parallel leaf execution, pre-run cost estimation, branch pruning by moderator confidence, optional human review before execution, Codex usage breakdown, and a local browser UI for inspecting saved trees. Use `--dry-run` for tree-shape testing without LLM or Codex calls.

## Work Plan

### Phase 1: Get it running ✅
- [x] Fix all TypeScript compilation errors
- [x] Verify package imports and module resolution
- [x] Run end-to-end with a simple intent
- [x] Fix runtime issues in debate loop, moderator JSON parsing, Codex execution

### Phase 2: Harden ✅
- [x] Zod schemas for all LLM response parsing (`src/schemas/index.ts`)
- [x] Retry logic for LLM calls (exponential backoff: 1s → 2s → 4s, `src/utils/retry.ts`)
- [x] Token budget tracking with warnings (`--token-budget <n>` CLI flag)
- [x] Graceful shutdown (Ctrl+C saves state, `cto resume <id>`)
- [x] `--dry-run` flag (debate tree only, no LLM or Codex calls)

### Phase 3: Agent quality ✅
- [x] Structured `contextUpdates` from agents — `CONTEXT_UPDATE [field]: value` format parsed by `parseAgentResponse`, accumulated across rounds, merged into every child's `NodeContext`
- [x] Agent memory — `AgentInput` now separates `priorRoundsHistory` (all previous rounds) from `currentRoundSoFar` (earlier speakers this round); prompt renders them distinctly so each agent sees who has already spoken in the current round
- [x] Moderator branching sensitivity — tightened rules: requires 2+ agents to independently support alternatives, strongly prefers CONTINUE in round 1, explicit calibration guidance added
- [x] Agent system prompts — each agent now has a `Context Updates` section defining which fields it should emit, and a tightened `Critical Rule` raising the bar for proposing alternatives

### Phase 4: Optimise (v0.2) ✅
- [x] Pruning — moderator emits a per-alternative `confidence` (0-1); branches below `--prune-threshold` are dropped before exploration. If only one alternative survives, it folds into a consensus child.
- [x] Parallel leaf execution — `executeLeaves` and `judgeLeaves` use a concurrency-limited pool (`--leaf-concurrency`, default 4) instead of sequential traversal.
- [x] Cost estimator — `src/utils/cost.ts` computes expected/worst-case node count and token spend before the run; CLI shows estimate and prompts to confirm (skip with `-y`).
- [x] Codex Cloud best-of-N — `--cloud-env <id> --cloud-attempts <n>` routes leaf execution through `codex cloud exec`. Cloud results must be applied locally with `codex cloud apply <task-id>` after the task completes (see executor output).
- [x] Codex token usage breakdown — `CodexExecutionResult.usage` captures input / cached / output / reasoning tokens per leaf; aggregated as `RunState.codexUsageTotal` and printed in the final summary.

### Interactive plan gate ✅
- [x] `--interactive-plan` pauses after debate traversal and before implementation or synthesis.
- [x] Human can proceed, kill a branch, or revise once with a new prompt.
- [x] Revision creates a debated `human-revision` child branch; descendants are not prompted again in v1.
- [x] Decisions persist as `TreeNode.humanIntervention`; revision prompts flow through `NodeContext.humanRevisionPrompt`.
- [x] `cto resume` preserves reviewed leaves and continues unreviewed interactive gates without re-prompting completed decisions.

### Saved-run UI ✅
- [x] `cto ui [run-id]` launches a local browser explorer for `.cambrian-tree` runs
- [x] Saved run picker with status, leaf count, and best score
- [x] SVG tree canvas with node selection, phase/status styling, score badges, zoom controls, and show-pruned toggle
- [x] Node inspector tabs for summary, debate, context, and leaf execution/scoring details
- [x] Local JSON API routes with run-id validation before state loading

## Conventions

- All files use `.ts` extension with ESM (`"type": "module"` in package.json)
- Imports use `.js` extension (NodeNext module resolution)
- No classes where a function would suffice — classes only for stateful components (DebateEngine, TreeOrchestrator, Judge, FileStore, CodexExecutor)
- Types go in `src/types/index.ts`
- Error handling: wrap LLM calls in try/catch, fallback gracefully, never crash the tree traversal
- Console output: use chalk for colour, ora for spinners, keep output readable

## Environment Variables

- `OPENAI_API_KEY` — required for all LLM calls
- Codex CLI must be installed and authenticated (`npm install -g @openai/codex && codex login`)

## Testing

Use vitest. Current coverage includes saved-run UI helpers and server behavior:
- `src/ui/tree-layout.ts`
- `src/ui/run-summary.ts`
- `src/ui/inspector.ts`
- `src/ui/server.ts`
- interactive plan gate behavior in `tests/orchestrator/orchestrator.test.ts`
- prompt propagation for human revisions in `tests/agents/definitions.test.ts`, `tests/execution/codex-client.test.ts`, and `tests/synthesis/synthesizer.test.ts`

When adding more:
- Unit tests for `parseAgentResponse`, `buildAgentPrompt`, moderator JSON parsing
- Integration test: mock OpenAI client → run a depth-2 tree → verify tree structure

## Known Issues

- `AGENT_PARTICIPATION_BY_PHASE` is defined in types but also referenced differently in orchestrator — reconcile
- Moderator prompt uses template literal placeholders (`${maxRounds}`) but replaced via string replace — fragile
- `isLeaf()` logic may have edge cases at depth boundaries
- No input validation on CLI args
