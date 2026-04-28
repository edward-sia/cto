# Codex Tree Orchestrator (CTO)

Tree-of-Thought agent orchestration for software development. A CLI tool where specialised agents debate solutions in round-table format, branch when alternatives emerge, execute leaf paths via OpenAI Codex, rank results with an LLM judge, and visualize saved runs in a local browser UI.

## How It Works

1. You provide a high-level intent (`"Build a REST API for a todo app"`)
2. A panel of six agents debates the intent in structured rounds
3. When agents surface fundamentally different approaches, the tree **branches** — each alternative becomes an independent child node
4. When agents converge, the tree deepens into the next phase
5. Leaf nodes are submitted to OpenAI Codex for implementation
6. An LLM judge scores each solution on five dimensions and ranks them

See [docs/architecture.md](docs/architecture.md) for diagrams.

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
🌳 Codex Tree Orchestrator — Pre-run Estimate
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

To inspect saved runs visually:

```bash
cto ui
```

This launches a local saved-run explorer with a run picker, tree canvas, and node inspector.

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
                             0–1 (default: 0 = no pruning)
      --cloud-env <id>       Use Codex Cloud env instead of local SDK
      --cloud-attempts <n>   Best-of-N attempts when --cloud-env is set
                             (default: 1)
      --dry-run              No LLM or Codex calls — exercise tree shape only
  -y, --yes                  Skip pre-run cost confirmation
```

Each leaf runs in its own subdirectory: `<workdir>/<node-id>/`. Solutions are independent and can be diffed against each other.

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

### `ui [run-id]` — launch the saved-run browser UI

```
cto ui [run-id] [--port 43187] [--no-open]
```

The UI reads saved state from `.codex-tree`, serves a local browser app, and lets you inspect:

- saved runs and run metadata
- the full branch tree as an interactive canvas
- node summaries, debate rounds, context updates, leaf execution output, changed files, tests, Codex usage, and judge scores

If `run-id` is provided, the UI opens that run directly. Use `--no-open` to print the local URL without opening a browser.

### `resume <run-id>` — continue a paused or failed run

```
cto resume run-abc123 [--dry-run] [--leaf-concurrency <n>]
```

Press **Ctrl+C** at any time during a run to pause it — state is saved and you can resume later.

## Cost Control

Three knobs control how much a run will cost:

1. **Tree size** — `--depth` × `--branching` is the worst-case node count (exponential). The pre-run estimator computes both worst case and an expected case (assumes ~50% of debates branch).
2. **Pruning** — set `--prune-threshold 0.6` (or similar) to drop alternatives the moderator is unsure about. Below-threshold alternatives never get a debate or a Codex execution. If only one alternative survives, it folds into a consensus child (single path, not a branch).
3. **Concurrency** — `--leaf-concurrency` controls how many Codex leaf executions run in parallel. Higher = faster wall-clock but more peak load. Doesn't affect total cost.

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

Six specialised agents participate across four debate phases:

| Phase | Agents |
|---|---|
| Requirements | Product Manager, Business Analyst, QA Engineer |
| Architecture | Tech Lead, Business Analyst, Code Reviewer, QA Engineer |
| Implementation | Developer, Tech Lead, Code Reviewer |
| Validation | QA Engineer, Code Reviewer, Developer |

Each agent is prompted to explicitly surface alternatives. The moderator (a separate LLM call) classifies each round as **consensus**, **diverging**, or **continue**. Divergence triggers branching; consensus advances depth.

## Scoring Dimensions

The LLM judge scores each leaf solution on five weighted dimensions:

| Dimension | Weight |
|---|---|
| Functional Completeness | 30% |
| Architectural Quality | 20% |
| Test Coverage | 20% |
| Intent Alignment | 20% |
| Simplicity | 10% |

## State & Persistence

Runs are saved to `.codex-tree/<run-id>/state.json` after every node. The tree is always resumable from the last completed node.

`cto ui` reads the same saved state and exposes it through a local-only HTTP server:

- `GET /` — browser UI
- `GET /api/runs` — saved run summaries
- `GET /api/runs/:runId` — full `RunState`
- `GET /api/health` — health check

## Project Status

| Phase | Status |
|---|---|
| Phase 1 — Running | ✅ Complete |
| Phase 2 — Hardening | ✅ Complete |
| Phase 3 — Agent quality | ✅ Complete |
| Phase 4 — Optimise (v0.2) | ✅ Complete |
| Saved-run UI | ✅ Complete |

**Phase 2 delivered:** Zod validation on all LLM responses, exponential-backoff retry (3 attempts, 1s/2s/4s), token budget tracking with warnings, graceful Ctrl+C shutdown with state save.

**Phase 3 delivered:** Structured `CONTEXT_UPDATE` fields from agents (PRD, acceptance criteria, architecture decisions, implementation spec, test strategy) accumulated and propagated into every child node's context. Agent prompts now explicitly separate prior-round history from current-round speakers, giving each agent clear visibility into who has already spoken this round. Moderator sensitivity tightened — branching now requires cross-agent support, is discouraged in round 1, and defaults to CONTINUE over DIVERGING when ambiguous.

**Phase 4 delivered:** Pre-run cost estimator (expected and worst-case node/token/USD projection, model-aware pricing). Confidence-based pruning — moderator emits a 0–1 score per alternative, branches below `--prune-threshold` are dropped before exploration. Parallel leaf execution and judging via a concurrency-limited pool (`--leaf-concurrency`). Codex Cloud best-of-N support via `--cloud-env` and `--cloud-attempts`. Per-leaf token usage breakdown (input / cached input / output / reasoning) aggregated and shown in the final summary.

**Saved-run UI delivered:** `cto ui` launches a dependency-light local browser explorer for saved `.codex-tree` runs. It includes a run picker, SVG tree canvas, node selection, inspector tabs for summary/debate/context/leaf details, local JSON API routes, and run-id validation before loading state.

See [CLAUDE.md](CLAUDE.md) for the full work plan and known issues.
