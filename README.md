# Cambrian Tree Orchestrator (CTO)

![Cambrian Tree Orchestrator hero image: a dark loading-screen past erupting into branching AI agent forms](docs/assets/cambrian-hero.png)

Cambrian turns a single software intent into an explored solution tree. It decomposes the task, selects the right agent panel, debates grounded alternatives, optionally pauses for human plan review, executes or synthesizes surviving leaf paths, scores implementation results with an LLM judge, and saves the whole run for inspection in a local browser UI.

It is built for the moment when "ask one agent once" stops being enough: when you want competing implementation strategies, visible trade-offs, resumable execution, and a ranked set of candidate solutions instead of a single opaque answer.

## Highlights

- **Intent decomposition** — load-bearing claims, undefined terms, scope boundaries, known unknowns, and feasibility flags are extracted before debate.
- **Round-table agent debate** — core delivery roles and optional specialists critique the intent from different angles.
- **Organic branching** — the moderator forks only when agents surface meaningfully different, grounded implementation paths.
- **Implementation or exploration mode** — code-producing tasks execute through Codex; research tasks produce synthesized leaf documents.
- **Verified ground truth** — inject JSON facts, sample data, or OpenAPI specs so agents do not invent schemas, APIs, or constraints.
- **Human plan gate** — review candidate leaves in the terminal or browser, revise one branch, or kill weak directions early.
- **Parallel execution with usage accounting** — run leaves concurrently and track LLM plus Codex input, cached input, output, and reasoning tokens.
- **Saved-run UI** — inspect the tree, debate history, context updates, execution output, Codex usage, and scores in a local browser.

## How It Works

1. You provide a high-level intent (`"Build a REST API for a todo app"`) and optional verified ground truth
2. The analyzer decomposes the intent, chooses implementation or exploration mode, and selects the relevant core and specialist agents
3. When agents surface fundamentally different approaches, the tree **branches** — each alternative becomes an independent child node
4. When agents converge, the tree deepens into the next phase
5. If `--interactive-plan` is enabled, each candidate leaf pauses for a human decision: proceed, revise once, or kill
6. In implementation mode, surviving leaf nodes are submitted to OpenAI Codex for implementation
7. In exploration mode, surviving leaf nodes produce structured synthesis documents instead of code
8. Implementation results are judged on six dimensions and ranked

See [docs/architecture.md](docs/architecture.md) for the system diagrams and layer-by-layer architecture.

## Prerequisites

- Node.js 18+
- An LLM provider API key for debate and judging:
  - `OPENAI_API_KEY` for `--provider openai`
  - `OPENROUTER_API_KEY` for `--provider openrouter`
  - `GEMINI_API_KEY` for `--provider gemini`
  - `DEEPSEEK_API_KEY` for `--provider deepseek`
  - `ANTHROPIC_API_KEY` for `--provider claude`
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

### LLM Providers

CTO can run the debate, analyzer, synthesis, and judge calls through provider adapters. OpenAI, OpenRouter, Gemini, and DeepSeek use an OpenAI-compatible adapter; Claude uses Anthropic's native Messages API adapter. Leaf implementation still uses Codex unless the run is in exploration mode or `--dry-run`.

```bash
# OpenRouter, default model: qwen/qwen3-coder:free
OPENROUTER_API_KEY=... cto run "Build X" --provider openrouter

# Google Gemini, default model: gemini-3-flash-preview
GEMINI_API_KEY=... cto run "Build X" --provider gemini

# DeepSeek, default model: deepseek-v4-pro
DEEPSEEK_API_KEY=... cto run "Build X" --provider deepseek

# Claude / Anthropic, default model: claude-sonnet-4-5
ANTHROPIC_API_KEY=... cto run "Build X" --provider claude

# Override any provider default
cto run "Build X" --provider openrouter --model openai/gpt-oss-120b:free
```

Provider defaults live in `src/providers/llm-provider.ts`. You can override the provider endpoint or API-key variable with `--base-url` and `--api-key-env`, which is useful for proxies, self-hosted gateways, or alternate provider accounts.

Gemini uses OpenAI-compatible `reasoning_effort: "minimal"` by default. Without that, Gemini 3's dynamic thinking can consume the short structured-call budget and truncate JSON responses before CTO can parse them.

OpenRouter `:free` models can return provider-side `429` rate-limit errors under load. CTO reports those as LLM request failures rather than parse failures; retry later or choose another OpenRouter model with `--model` when the free route is saturated.

Claude is the one provider here that is not OpenAI-compatible at the wire level: Anthropic expects a native `/v1/messages` request with top-level `system`, `messages`, `max_tokens`, `x-api-key`, and `anthropic-version`. CTO normalizes that response into the same internal text and token-usage shape used by the OpenAI-compatible providers. Claude prompt-cache telemetry is recorded when returned, but CTO does not inject `cache_control` blocks in this first pass.

To inspect saved or running runs visually:

```bash
cto ui
```

This launches a local run monitor with a saved-run picker, live tree canvas, zoom controls, inspector tabs, score badges, Codex usage summaries, and browser controls for pending human plan reviews. It updates running runs in near real time from the saved `.cambrian-tree` state.

![Dark saved-run UI showing the run picker, branch tree, inspector tabs, and Codex usage summary](docs/assets/cto-ui-saved-run.png)

## CLI Reference

### `run` — start a new orchestration

```
cto run "<intent>" [options]

Options:
  -d, --depth <n>            Maximum tree depth                (default: 6)
  -b, --branching <n>        Maximum branches per node         (default: 3)
  -r, --rounds <n>           Maximum debate rounds/node        (default: 3)
  -m, --model <model>        Reasoning + judge model           (default: gpt-4o)
      --provider <provider>  LLM provider: openai, openrouter,
                             gemini, deepseek, or claude
      --base-url <url>       Override provider base URL
      --api-key-env <name>   Env var containing the provider API key
  -w, --workdir <path>       Working dir for Codex             (default: cwd)
      --token-budget <n>     Warn when LLM tokens exceed n
      --leaf-concurrency <n> Max parallel leaf Codex executions (default: 4)
      --prune-threshold <n>  Drop alternatives below confidence × relevance
                             0–1 (default: 0.5)
      --cloud-env <id>       Use Codex Cloud env instead of local SDK
      --cloud-attempts <n>   Best-of-N attempts when --cloud-env is set
                             (default: 1)
      --dry-run              No LLM or Codex calls — exercise tree shape only
      --ground-truth <spec>  Inject verified facts from file:, sample:, or
                             openapi: sources
      --interactive-plan     Review candidate leaves before implementation
      --monitor              Open the live browser monitor for this run
      --ui-review            Use the browser UI for interactive plan decisions
  -y, --yes                  Skip pre-run cost confirmation
```

Each leaf runs in its own subdirectory: `<workdir>/<node-id>/`. Solutions are independent and can be diffed against each other.

Use `--ground-truth` when agents need source-checked facts instead of inferred assumptions:

```bash
cto run "Build an API for this schema" --ground-truth openapi:./openapi.yaml
cto run "Analyze this export and propose a migration" --ground-truth sample:./export.csv
cto run "Build from these domain constraints" --ground-truth file:./facts.json
```

`file:` expects JSON matching the `DomainFacts` shape: `domain`, optional `schemas`, optional `apiEndpoints`, `constraints`, `knownAbsences`, and optional `rawContext`. `sample:` reads CSV or JSON data and extracts a schema summary. `openapi:` reads JSON or YAML OpenAPI specs and extracts routes plus component schemas.

Use `--interactive-plan` when you want a human checkpoint before leaf execution or exploration synthesis. CTO will pause on each candidate leaf and let you proceed, revise once with a new prompt that creates a debated child branch, or kill the branch before expensive work starts.

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

## Run Modes

CTO classifies each intent before the tree is built:

- **Implementation** — feature work, bug fixes, refactors, APIs, services, and other code-producing tasks. Leaves execute through Codex, then the judge ranks the resulting implementations.
- **Exploration** — research questions, feasibility studies, data analysis, and planning spikes. Leaves produce structured synthesis documents without Codex execution or judge scoring.

The analyzer also selects specialists only when grounded in the intent or verified context. A frontend task can pull in UX and Frontend Engineering; an API contract task can pull in API / Integration Architecture; a pure research prompt can stay with Research Planner, Business Analyst, and Data Analyst.

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
- the full branch tree as an interactive canvas, with zoom controls, score badges, phase/status styling, and a show-pruned toggle
- node summaries, debate rounds, intent decomposition, accumulated context updates, leaf execution or synthesis output, changed files, tests, Codex usage, and judge scores
- aggregate and per-leaf Codex usage totals when usage data is available
- pending human plan reviews, with Proceed / Revise / Kill controls when the run is waiting for browser input

If `run-id` is provided, the UI opens that run directly. Use `--no-open` to print the local URL without opening a browser.

### `resume <run-id>` — continue a paused or failed run

```
cto resume run-abc123 [--provider <provider>] [--model <model>] [--base-url <url>] [--api-key-env <name>] [--dry-run] [--leaf-concurrency <n>] [--interactive-plan] [--monitor] [--ui-review]
```

Press **Ctrl+C** at any time during a run to pause it — state is saved and you can resume later.

Resume uses the provider, base URL, API-key env, and model saved in the run config. Pass `--provider`, `--model`, `--base-url`, or `--api-key-env` only when you want to override the saved settings.

Interactive plan state is also resumable. Already-reviewed leaves are not prompted again, killed leaves remain pruned, and `cto resume <run-id> --interactive-plan` can enable the gate for an older paused run.

## Cost Control

Five knobs control how much a run will cost:

1. **Tree size** — `--depth` × `--branching` is the worst-case node count (exponential). The pre-run estimator computes both worst case and an expected case (assumes ~50% of debates branch).
2. **Pruning** — set `--prune-threshold 0.6` (or similar) to drop alternatives the moderator is unsure about. Below-threshold alternatives never get a debate or a Codex execution. If only one alternative survives, it folds into a consensus child (single path, not a branch).
3. **Concurrency** — `--leaf-concurrency` controls how many Codex leaf executions run in parallel. Higher = faster wall-clock but more peak load. Doesn't affect total cost.
4. **Run mode** — exploration mode synthesizes documents from leaf debates and skips Codex execution plus judge scoring.
5. **Interactive planning** — `--interactive-plan` lets a human kill branches before execution or synthesis, or revise a candidate once so the agents debate the corrected direction before expensive work begins.
6. **Provider choice** — `--provider openrouter` with `:free` models can make debate and judge calls free within provider limits. Unknown model pricing falls back to GPT-4o rates in estimates so the CLI errs on the conservative side.

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

CTO includes a core software-delivery panel plus opt-in specialists. A task analyzer chooses the run mode and panel before traversal. The default implementation panel is Product Manager, Business Analyst, Tech Lead, Developer, Code Reviewer, and QA Engineer; exploration runs default toward Research Planner, Business Analyst, and Data Analyst. Domain specialists are selected only when the intent or ground-truth context supports that specialty.

| Phase | Agents |
|---|---|
| Requirements | Product Manager, Business Analyst, QA Engineer |
| Architecture | Tech Lead, Business Analyst, Code Reviewer, QA Engineer |
| Implementation | Developer, Tech Lead, Code Reviewer |
| Validation | Product Manager, Business Analyst, Developer, Code Reviewer, QA Engineer |

Available specialists are Research Planner, Data Engineer, Data Analyst, Security Engineer, ML Engineer, DevOps Engineer, UX Designer, Frontend Engineer, API / Integration Architect, Performance Engineer, and Technical Writer. Each persona has explicit `Does` / `Does Not` boundaries and a shared evidence rule: do not invent facts, benchmarks, studies, prices, usage volumes, latency targets, compliance obligations, schemas, APIs, users, or business goals. Unknowns must be labelled as `UNKNOWN` / `ASSUMPTION`, asked as challenge questions, or deferred to a verification spike.

Verified ground truth, when provided, is rendered into the agent context and treated as a stronger source than agent intuition. This is the preferred way to give CTO schemas, API contracts, sample-data constraints, known absences, or domain facts.

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

Set `CAMBRIAN_TREE_STORE_DIR` to point persistence at a different run store. This is mainly useful for tests, local experiments, and tooling that should not read or write the default `.cambrian-tree` history.

Run state records the selected run mode, selected agents, leaf IDs, ranked results for implementation runs, LLM usage, aggregate Codex usage, and any pending browser review request. Node context records the original intent, intent decomposition, verified domain facts, PRD notes, acceptance criteria, architecture decisions, implementation specs, test strategy, branch decisions, human revision prompts, and ancestor summaries.

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
| Dynamic run modes and specialist selection | ✅ Complete |
| Intent decomposition and ground-truth inputs | ✅ Complete |
| Browser plan review controls | ✅ Complete |
| Codex usage reporting in CLI and UI | ✅ Complete |

**Phase 2 delivered:** Zod validation on all LLM responses, exponential-backoff retry (3 attempts, 1s/2s/4s), token budget tracking with warnings, graceful Ctrl+C shutdown with state save.

**Phase 3 delivered:** Structured `CONTEXT_UPDATE` fields from agents (PRD, acceptance criteria, architecture decisions, implementation spec, test strategy) accumulated and propagated into every child node's context. Agent prompts now explicitly separate prior-round history from current-round speakers, giving each agent clear visibility into who has already spoken this round. Moderator sensitivity tightened so branching requires cross-agent support and grounded, in-scope alternatives. Persona prompts include explicit specialty boundaries and shared anti-hallucination rules.

**Phase 4 delivered:** Pre-run cost estimator (expected and worst-case node/token/USD projection, model-aware pricing). Confidence-based pruning — moderator emits a 0–1 score per alternative, branches below `--prune-threshold` are dropped before exploration. Parallel leaf execution and judging via a concurrency-limited pool (`--leaf-concurrency`). Codex Cloud best-of-N support via `--cloud-env` and `--cloud-attempts`. Per-leaf token usage breakdown (input / cached input / output / reasoning) aggregated and shown in the final summary.

**Latest orchestration updates:** CTO now decomposes intent before debate, classifies runs as implementation or exploration, selects specialists dynamically, supports verified `--ground-truth` providers (`file:`, `sample:`, `openapi:`), and synthesizes exploration leaves without Codex execution.

**Interactive plan gate delivered:** `--interactive-plan` pauses after debate traversal and before leaf execution or synthesis. The human can proceed, revise once with a new prompt that creates a debated `human-revision` child, or kill a branch. Decisions persist into run state and resume without re-prompting already-reviewed leaves. `--ui-review` exposes the same decision flow in the saved-run UI.

**Live run monitor delivered:** `cto ui` launches a dependency-light local browser monitor for saved and running `.cambrian-tree` runs. It includes a run picker, dark SVG tree canvas, node selection, inspector tabs for summary/debate/context/leaf details, score badges, Codex usage totals, server-sent event updates for the selected run, browser controls for pending interactive plan reviews, local JSON/control API routes, and run-id validation before loading state.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

See [CLAUDE.md](CLAUDE.md) for the full work plan and known issues.
