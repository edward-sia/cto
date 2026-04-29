# Cambrian Tree Orchestrator (CTO)

![Cambrian Tree Orchestrator hero image: a dark loading-screen past erupting into branching AI agent forms](docs/assets/cambrian-hero.png)

Cambrian turns a single software intent into an explored solution tree. A core panel plus intent-selected specialists debate the problem, branch when grounded alternatives appear, pause for human plan review when requested, execute surviving leaf paths through Codex, score the results with an LLM judge, and save the whole run for inspection in a local browser UI.

It is built for the moment when "ask one agent once" stops being enough: when you want competing implementation strategies, visible trade-offs, resumable execution, and a ranked set of candidate solutions instead of a single opaque answer.

## Highlights

- **Round-table agent debate** — core delivery roles and optional specialists critique the intent from different angles.
- **Organic branching** — the moderator forks only when agents surface meaningfully different, grounded implementation paths.
- **Human plan gate** — review candidate leaves before execution, revise one branch, or kill weak directions early.
- **Parallel leaf execution** — run multiple candidate implementations concurrently through the execution layer.
- **LLM judging** — rank results across functional completeness, architecture, tests, fit, and simplicity.
- **Saved-run UI** — inspect the tree, debate history, context updates, execution output, and scores in a local browser.

## How It Works

1. You provide a high-level intent (`"Build a REST API for a todo app"`)
2. A task analyzer selects the relevant core and specialist agents, then the panel debates the intent in structured rounds
3. When agents surface fundamentally different approaches, the tree **branches** — each alternative becomes an independent child node
4. When agents converge, the tree deepens into the next phase
5. If `--interactive-plan` is enabled, each candidate leaf pauses for a human decision: proceed, revise once, or kill
6. Surviving leaf nodes are submitted to OpenAI Codex for implementation
7. An LLM judge scores each solution on six dimensions and ranks them

See [docs/architecture.md](docs/architecture.md) for the system diagrams and layer-by-layer architecture.

## Prerequisites

- Node.js 18+
- `OPENAI_API_KEY` environment variable set
- OpenAI Codex CLI installed and authenticated (for leaf execution):
  ```bash
  npm install -g @openai/codex
  codex login
  ```

## Install

```bash
npm install
npm run build
npm link    # puts the `cto` bin on your PATH
```

For development without installing the bin, replace `cto` with `npx tsx src/cli/index.ts` in any of the commands below — both work identically.

## Quick Start

```bash
cto run "Build a hello world Express API" --depth 3 --branching 2
```

Before the run starts, the CLI prints a cost estimate and asks for confirmation:

```
🌳 Cambrian Tree Orchestrator — Pre-run Estimate
Tree size:    ~7 nodes (worst case: 7), ~4 leaves (worst case: 4)
LLM tokens:   ~145,200 total (124,800 debate, 20,400 judge)
LLM cost:     ~$0.61
Codex calls:  ~4 leaf executions (cost depends on Codex plan)

Proceed? [y/N]
```

Use `-y` to skip the prompt, or `--dry-run` to exercise the tree shape without any LLM or Codex calls:

```bash
# auto-approve the estimate
cto run "Build X" -y

# debate-tree shape only, no API key required
cto run "Build X" --dry-run
```

To inspect saved or running runs visually:

```bash
cto ui
```

This launches a local run monitor with a run picker, tree canvas, and node inspector. It updates running runs in near real time from the saved `.cambrian-tree` state.

![Saved-run UI showing a branch tree and node inspector](docs/assets/cto-ui-saved-run.png)

## CLI Reference

### `run` — start a new orchestration

```
cto run "<intent>" [options]

Options:
  -d, --depth <n>            Maximum tree depth                (default: 6)
  -b, --branching <n>        Maximum branches per node         (default: 3)
  -r, --rounds <n>           Maximum debate rounds/node        (default: 3)
  -m, --model <model>        Reasoning + judge model           (default: gpt-4o)
  -w, --workdir <path>       Working dir for Codex             (default: cwd)
      --token-budget <n>     Warn when LLM tokens exceed n
      --leaf-concurrency <n> Max parallel leaf Codex executions (default: 4)
      --prune-threshold <n>  Drop alternatives below confidence
                             0–1 (default: 0.5)
      --cloud-env <id>       Use Codex Cloud env instead of local SDK
      --cloud-attempts <n>   Best-of-N attempts when --cloud-env is set
                             (default: 1)
      --dry-run              No LLM or Codex calls — exercise tree shape only
      --interactive-plan     Review candidate leaves before implementation
      --monitor              Open the live browser monitor for this run
      --ui-review            Use the browser UI for interactive plan decisions
  -y, --yes                  Skip pre-run cost confirmation
```

Each leaf runs in its own subdirectory: `<workdir>/<node-id>/`. Solutions are independent and can be diffed against each other.

Use `--interactive-plan` when you want a human checkpoint before leaf execution. CTO will pause on each candidate leaf and let you proceed, revise once with a new prompt that creates a debated child branch, or kill the branch before Codex execution.

Use `--monitor` to open the local browser monitor when the run starts:

```bash
cto run "Build X" --monitor
```

Use `--ui-review` to combine the interactive plan gate with browser-based decisions:

```bash
cto run "Build X" --ui-review
```

When a candidate leaf needs review, the selected node inspector shows Proceed, Revise, and Kill controls. Browser decisions are written as control files under `.cambrian-tree/<run-id>/control/`; the orchestrator remains the only writer of canonical `state.json`.

Interactive plan decisions are saved in `.cambrian-tree/<run-id>/state.json`. Revised branches receive a `human-revision` child node, and the revision prompt is included in the next debate plus the final implementation or synthesis prompt. Descendants of a human revision are not prompted again in v1, which keeps the mode to one revision opportunity per original candidate leaf.

### `list` — show all saved runs

```
cto list
```

### `show <run-id>` — print ranked results for a run

```
cto show run-abc123
```

### `tree <run-id>` — print the solution tree

```
cto tree run-abc123
```

### `ui [run-id]` — launch the live browser monitor

```
cto ui [run-id] [--port 43187] [--no-open]
```

The UI reads saved state from `.cambrian-tree`, serves a local browser app, streams selected run snapshots, and lets you inspect:

- saved runs and run metadata
- the full branch tree as an interactive canvas
- node summaries, debate rounds, context updates, leaf execution output, changed files, tests, Codex usage, and judge scores
- pending human plan reviews, with Proceed / Revise / Kill controls when the run is waiting for browser input

If `run-id` is provided, the UI opens that run directly. Use `--no-open` to print the local URL without opening a browser.

### `resume <run-id>` — continue a paused or failed run

```
cto resume run-abc123 [--dry-run] [--leaf-concurrency <n>] [--interactive-plan] [--monitor] [--ui-review]
```

Press **Ctrl+C** at any time during a run to pause it — state is saved and you can resume later.

Interactive plan state is also resumable. Already-reviewed leaves are not prompted again, killed leaves remain pruned, and `cto resume <run-id> --interactive-plan` can enable the gate for an older paused run.

## Cost Control

Four knobs control how much a run will cost:

1. **Tree size** — `--depth` × `--branching` is the worst-case node count (exponential). The pre-run estimator computes both worst case and an expected case (assumes ~50% of debates branch).
2. **Pruning** — set `--prune-threshold 0.6` (or similar) to drop alternatives the moderator is unsure about. Below-threshold alternatives never get a debate or a Codex execution. If only one alternative survives, it folds into a consensus child (single path, not a branch).
3. **Concurrency** — `--leaf-concurrency` controls how many Codex leaf executions run in parallel. Higher = faster wall-clock but more peak load. Doesn't affect total cost.
4. **Interactive planning** — `--interactive-plan` lets a human kill branches before execution or revise a candidate once so the agents debate the corrected direction before Codex work begins.

The final summary breaks Codex token usage down by input / cached input / output / reasoning so you can see where the budget went.

## Codex Cloud (best-of-N)

If you have a Codex Cloud environment set up (`codex cloud` to browse), you can route leaf execution through it for best-of-N attempts:

```bash
cto run "Build X" --cloud-env env_abc123 --cloud-attempts 3
```

The orchestrator submits each leaf to Codex Cloud and records the task id. Cloud results are async — pull them locally with:

```bash
codex cloud status <task-id>     # check progress
codex cloud apply <task-id>      # apply the diff to the leaf workdir
```

> Codex Cloud is marked experimental upstream. The orchestrator currently submits and records the task id; polling and auto-applying diffs is not yet automated.

## Agent Panel

CTO includes a core software-delivery panel plus opt-in specialists. The default implementation panel is Product Manager, Business Analyst, Tech Lead, Developer, Code Reviewer, and QA Engineer; domain specialists are selected only when the intent grounds that specialty.

| Phase | Agents |
|---|---|
| Requirements | Product Manager, Business Analyst, QA Engineer |
| Architecture | Tech Lead, Business Analyst, Code Reviewer, QA Engineer |
| Implementation | Developer, Tech Lead, Code Reviewer |
| Validation | Product Manager, Business Analyst, Developer, Code Reviewer, QA Engineer |

Available specialists are Research Planner, Data Engineer, Data Analyst, Security Engineer, ML Engineer, DevOps Engineer, UX Designer, Frontend Engineer, API / Integration Architect, Performance Engineer, and Technical Writer. Each persona has explicit `Does` / `Does Not` boundaries and a shared evidence rule: do not invent facts, benchmarks, studies, prices, usage volumes, latency targets, compliance obligations, schemas, APIs, users, or business goals. Unknowns must be labelled as `UNKNOWN` / `ASSUMPTION`, asked as challenge questions, or deferred to a verification spike.

The Research Planner is an evidence-skeptic role, not a source generator. It may only treat prior art as grounded when it appears in verified domain facts, source-checked context, or the original intent.

Each agent is prompted to surface alternatives only when the options are in scope and would lead to meaningfully different implementations. The moderator (a separate LLM call) classifies each round as **consensus**, **diverging**, or **continue**. Divergence triggers branching; consensus advances depth.

## Scoring Dimensions

The LLM judge scores each leaf solution on six weighted dimensions:

| Dimension | Weight |
|---|---|
| Functional Completeness | 25% |
| Architectural Quality | 15% |
| Test Coverage | 15% |
| Intent Alignment | 20% |
| Real-World Fit | 15% |
| Simplicity | 10% |

## State & Persistence

Runs are saved to `.cambrian-tree/<run-id>/state.json` after every node. The tree is always resumable from the last completed node.

When interactive planning is enabled, `TreeNode.humanIntervention` records `proceed`, `revise`, or `kill`. Revision prompts are also stored on `NodeContext.humanRevisionPrompt` so subsequent debate, synthesis, and implementation prompts inherit the human steering instruction.

`cto ui` reads the same saved state and exposes it through a local-only HTTP server:

- `GET /` — browser UI
- `GET /api/runs` — saved run summaries
- `GET /api/runs/:runId` — full `RunState`
- `GET /api/runs/:runId/events` — server-sent events stream of live run snapshots
- `POST /api/runs/:runId/human-review/:requestId` — browser decision for a pending plan review
- `GET /api/health` — health check

## Project Status

| Phase | Status |
|---|---|
| Phase 1 — Running | ✅ Complete |
| Phase 2 — Hardening | ✅ Complete |
| Phase 3 — Agent quality | ✅ Complete |
| Phase 4 — Optimise (v0.2) | ✅ Complete |
| Interactive plan gate | ✅ Complete |
| Live run monitor | ✅ Complete |

**Phase 2 delivered:** Zod validation on all LLM responses, exponential-backoff retry (3 attempts, 1s/2s/4s), token budget tracking with warnings, graceful Ctrl+C shutdown with state save.

**Phase 3 delivered:** Structured `CONTEXT_UPDATE` fields from agents (PRD, acceptance criteria, architecture decisions, implementation spec, test strategy) accumulated and propagated into every child node's context. Agent prompts now explicitly separate prior-round history from current-round speakers, giving each agent clear visibility into who has already spoken this round. Moderator sensitivity tightened so branching requires cross-agent support and grounded, in-scope alternatives. Persona prompts include explicit specialty boundaries and shared anti-hallucination rules.

**Phase 4 delivered:** Pre-run cost estimator (expected and worst-case node/token/USD projection, model-aware pricing). Confidence-based pruning — moderator emits a 0–1 score per alternative, branches below `--prune-threshold` are dropped before exploration. Parallel leaf execution and judging via a concurrency-limited pool (`--leaf-concurrency`). Codex Cloud best-of-N support via `--cloud-env` and `--cloud-attempts`. Per-leaf token usage breakdown (input / cached input / output / reasoning) aggregated and shown in the final summary.

**Interactive plan gate delivered:** `--interactive-plan` pauses after debate traversal and before leaf execution. The human can proceed, revise once with a new prompt that creates a debated `human-revision` child, or kill a branch. Decisions persist into run state and resume without re-prompting already-reviewed leaves.

**Live run monitor delivered:** `cto ui` launches a dependency-light local browser monitor for saved and running `.cambrian-tree` runs. It includes a run picker, SVG tree canvas, node selection, inspector tabs for summary/debate/context/leaf details, server-sent event updates for the selected run, browser controls for pending interactive plan reviews, local JSON/control API routes, and run-id validation before loading state.

See [CLAUDE.md](CLAUDE.md) for the full work plan and known issues.
