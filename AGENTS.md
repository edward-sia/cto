# AGENTS.md — Cambrian Tree Orchestrator (CTO)

## Project Overview

Tree-of-Thought agent orchestration for software development, with leaf execution handled by a configurable execution layer. A CLI tool where a core panel plus intent-selected specialists decompose an intent into a dossier, debate solutions in round-table format, branch when grounded alternatives surface, optionally pause for a human plan review, sketch and rank implementation leaves before Codex execution, run configured verification checks, rank implementations by evidence-aware fitness, and visualize saved runs in a local browser UI.

## Architecture (3 Layers)

```
Interface: CLI + saved-run UI (src/cli/, src/ui/) — commands, local browser viewer
Layer 1: Orchestrator + analyzer (src/orchestrator/, src/analyzer/) — intent dossier, traversal, branching, pruning, state
Layer 2: Agent Panel (src/agents/, src/debate/) — round-table debate engine
Layer 3: Execution (src/execution/, src/verification/, src/judge/) — Codex SDK + verification + provider-backed LLM/fitness scoring
```

## Tech Stack

- **Language:** TypeScript (ESM, NodeNext modules)
- **Runtime:** Node.js 18+
- **Key deps:** openai, @openai/codex-sdk, commander, chalk, ora, nanoid, zod
- **LLM providers:** OpenAI-compatible adapter for OpenAI, OpenRouter, Google Gemini, DeepSeek, and EdenAI; native Anthropic Messages adapter for Claude
- **Persistence:** JSON files in `.cambrian-tree/<run-id>/state.json`
- **CLI framework:** Commander.js
- **UI:** Dependency-free local HTTP server + browser shell in `src/ui/`

## File Structure

```
src/
├── cli/index.ts              # CLI entry point (commander)
├── types/index.ts            # Core type definitions (TreeNode, RunState, etc.)
├── schemas/index.ts          # Zod schemas for LLM response validation
├── analyzer/                 # Intent decomposition, dossier, run-mode and specialist selection
├── utils/retry.ts            # Exponential-backoff retry wrapper
├── utils/cost.ts             # Pre-run token/USD estimator
├── utils/pruning.ts          # Confidence/relevance pruning and depth schedules
├── agents/
│   ├── definitions.ts        # Stable public facade for agent exports
│   ├── types.ts              # AgentDefinition and catalog boundary types
│   ├── catalog/              # Raw role prompts, boundaries, and AGENT_DEFINITIONS assembly
│   ├── prompts/              # Debate prompt builder and context-section renderers
│   └── parsing/              # CONTEXT_UPDATE / ALTERNATIVE / TOOL_REQUEST extractors
├── debate/engine.ts          # Round-table debate engine
├── orchestrator/orchestrator.ts  # Main tree orchestration loop
├── execution/codex-client.ts # Codex SDK integration
├── verification/runner.ts    # Post-leaf verification command runner
├── judge/judge.ts            # LLM scoring engine
├── judge/fitness.ts          # Evidence-aware deterministic fitness scorer
├── persistence/file-store.ts # JSON file persistence
└── ui/                       # Saved-run browser UI (server, page, layout helpers)
```

## Commands

```bash
npm install                    # Install deps
npm run docs:check             # Ensure code-impacting changes update README/AGENTS/CLAUDE/docs
npm test                       # docs:check + Vitest
npx tsx src/cli/index.ts run "<intent>" --depth 3 --branching 2  # Run
npx tsx src/cli/index.ts run "<intent>" --provider openrouter  # Run debate/judge via OpenRouter
npx tsx src/cli/index.ts run "<intent>" --provider gemini  # Run debate/judge via Google Gemini
npx tsx src/cli/index.ts run "<intent>" --provider deepseek  # Run debate/judge via DeepSeek
npx tsx src/cli/index.ts run "<intent>" --provider claude  # Run debate/judge via Anthropic Claude
npx tsx src/cli/index.ts run "<intent>" --provider edenai  # Run debate/judge via EdenAI
npx tsx src/cli/index.ts run "<intent>" --interactive-plan  # Run with human review before leaf execution
npx tsx src/cli/index.ts list  # List runs
npx tsx src/cli/index.ts show <run-id>  # Show results
npx tsx src/cli/index.ts tree <run-id>  # Print tree
npx tsx src/cli/index.ts ui [run-id]  # Launch saved-run browser UI
npx tsx src/cli/index.ts resume <run-id>  # Resume
```

## How It Works

1. Human provides intent + optional verified ground truth
2. Analyzer decomposes the intent, builds an intent dossier, classifies implementation vs exploration mode, and selects specialists
3. Root node is created with dossier, decomposition, ground truth, and selected panel in context
4. At each node: agents debate in rounds (round-robin, each speaks once per round)
5. Moderator assesses after each round: consensus / diverging / continue
6. If diverging → tree branches (each alternative = child node), after prune threshold/schedule filtering
7. If consensus → single child, go deeper
8. At max depth → candidate leaves are collected
9. If `--interactive-plan` is enabled → human reviews each candidate leaf once: proceed, revise with a new prompt, or kill the branch
10. Implementation leaves are sketched and ranked cheaply; the top ranked leaves are submitted to Codex, while exploration leaves produce structured synthesis documents
11. Local implementation leaves run configured verification commands when provided
12. If selected leaves all fail required verification, the next ranked skipped sketch is executed as a fallback
13. LLM Judge scores each executed implementation leaf on 6 dimensions and deterministic fitness combines judge + verification evidence
14. Results are ranked by fitness when present, otherwise by judge score; saved runs can be inspected with `cto ui`

## LLM Provider Support

Debate, analysis, exploration synthesis, and judge calls use the standalone provider runtime in `packages/llm-providers`. Leaf implementation still uses Codex unless the run is in exploration mode or `--dry-run`.

Provider flags:
- `--provider openai` uses `OPENAI_API_KEY` and defaults to `gpt-4o`
- `--provider openrouter` uses `OPENROUTER_API_KEY` and defaults to `openai/gpt-oss-120b:free`
- `--provider gemini` uses `GEMINI_API_KEY` and defaults to `gemini-3-flash-preview`
- `--provider deepseek` uses `DEEPSEEK_API_KEY` and defaults to `deepseek-v4-pro`
- `--provider claude` uses `ANTHROPIC_API_KEY` and defaults to `claude-sonnet-4-5`
- `--provider edenai` uses `EDENAI_API_KEY` and defaults to `openai/gpt-4o`
- `--model <model>` overrides the provider default for both reasoning and judge calls
- `--base-url <url>` and `--api-key-env <name>` override the provider registry, useful for proxies or alternate accounts

Provider metadata, model tiers, fallback policy, usage normalization, and wire adapters live in `packages/llm-providers`; CTO call sites import `@cto/llm-providers` directly. Persisted runs store provider, model, base URL, API-key env, and model tier assignments in `RunConfig`. `cto resume` reuses the saved provider settings unless explicitly overridden.

Provider-native config can be supplied with `llm-providers.config.mjs`, `.js`, `.cjs`, or `.json` in the repo root. When a config file exists and the user does not explicitly pass `--provider` or `--model`, CTO routes stages through the package tiers: cheap, mid, and strong. Each tier is an ordered fallback list of `{ provider, model }` candidates. Fallback is allowed for rate limits, timeouts, overloaded providers, and server errors; authentication, invalid model, invalid request, context-length, parse, and schema failures should stop the route.

Live provider verification is intentionally separate from `npm test`. Use `npm run test:live-providers` when real keys are present. Package live tests check normalized provider responses; CTO live tests check CTO-style JSON parsing and a real `TaskAnalyzer` call. Keep package live tests independent from `src/`. Use `CTO_LIVE_PROVIDER_FILTER=openai,gemini`, `CTO_LIVE_<PROVIDER>_MODEL`, and `CTO_LIVE_PROVIDER_TIMEOUT_MS` to narrow or tune live runs without editing code. For EdenAI, use `EDENAI_API_KEY` and optionally `CTO_LIVE_EDENAI_MODEL`. Do not print API key values in logs.

OpenAI, OpenRouter, Gemini, DeepSeek, and EdenAI share the OpenAI-compatible adapter. EdenAI uses the V3 gateway at `https://api.edenai.run/v3`; model IDs use EdenAI's `provider/model` format and `--model @edenai` enables EdenAI smart routing. Claude uses Anthropic's native `/v1/messages` shape, where system prompts are top-level, `max_tokens` is required, and `x-api-key` plus `anthropic-version` headers are sent. CTO normalizes all providers to one internal text and usage shape; Claude cache telemetry is recorded when returned, but CTO does not inject Anthropic `cache_control` blocks yet.

Gemini defaults to OpenAI-compatible `reasoning_effort: "minimal"` in the provider registry. Keep this provider default unless the model/prompt budget changes, because Gemini 3's default dynamic thinking can truncate short JSON responses.

Structured provider responses are parsed through CTO's shared JSON-object extractor so fenced or lightly prefaced JSON can still validate. Provider transport failures, including OpenRouter `429` rate limits on `:free` models, are reported separately from JSON parse failures.

## Key Design Patterns

- **Branching is organic:** Agents surface alternatives via their debate contributions. The moderator (separate LLM call) detects divergence and forks. No hard-coded branching rules.
- **Context accumulates compactly:** Each child inherits parent context + debate summary. Later debate rounds receive compact prior state instead of the full prior transcript, while full transcripts remain saved for audit/UI.
- **Agent-requested research tools:** Available when enabled with `--tools`; personas may request read-only evidence during debate, but execution is mediated by the ToolBroker and persisted as tool evidence.
- **Explore broadly, execute narrowly:** Implementation leaves are all sketched and ranked; by default only the top two are executed, and skipped leaves retain sketch evidence plus the skipped reason.
- **Deterministic cache:** Stable selection, decomposition, dossier, compact-summary, verification, and judge outputs are cached under `.cambrian-tree/cache/` using prompt/model/provider and repo or artifact fingerprints.
- **Human plan gate is opt-in:** `--interactive-plan` pauses before execution. Human revisions create a `human-revision` child that gets another CTO debate; killed branches are marked `pruned`.
- **Pruning is configurable:** Moderator confidence/relevance controls branch survival, and `--prune-schedule` can use lower thresholds early and stricter thresholds deeper in the tree.
- **Fitness beats rhetoric:** Judge scores remain visible, but configured verification results and deterministic fitness determine final implementation ranking.
- **State persistence:** Tree saved to disk after every node. Runs are resumable and viewable through `cto ui`.
- **UI boundary:** The saved-run UI reads local JSON state and writes only explicit browser review control files; the orchestrator remains the canonical state writer and validates run IDs before loading files.

## Current Status

**Phases 1–4, evolutionary foundation, cost-control foundation, interactive plan gate, and saved-run UI complete.** The CLI runs end-to-end with intent decomposition/dossiers, dynamic specialist selection, verified ground-truth inputs, progressive branch pruning, compact debate context, deterministic caching, sketch-first leaf ranking, narrowed Codex execution, optional post-leaf verification, fitness ranking, pre-run cost estimation, optional human review before execution, Codex usage breakdown, and a local browser UI for inspecting saved trees. Use `--dry-run` for tree-shape testing without LLM, verification, or Codex calls.

**Multi-provider LLM routing is available.** OpenRouter, Google Gemini, DeepSeek, and EdenAI are supported through the shared OpenAI-compatible provider adapter; Claude is supported through the native Anthropic Messages adapter.

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
- [x] Moderator branching sensitivity — tightened rules: requires 2+ agents to independently support alternatives, explicit calibration guidance added. The round-1 CONTINUE bias was removed in favour of an explicit decision procedure that lets the moderator end debate early when nothing is alive, while still branching when 2+ alternatives are.
- [x] Agent system prompts — each agent now has a `Context Updates` section defining which fields it should emit, and a tightened `Critical Rule` raising the bar for proposing alternatives
- [x] Persona boundaries — every specialty has explicit `Does` / `Does Not` guidance plus shared evidence rules forbidding invented facts, benchmarks, prices, volumes, compliance obligations, schemas, APIs, users, or business goals
- [x] Specialist coverage — added UX Designer, Frontend Engineer, API / Integration Architect, Performance Engineer, and Technical Writer; optional specialists are selected by the analyzer only when grounded in the intent
- [x] Research Planner — reframed the Researcher as an evidence-skeptic planner that separates verified facts from unknowns and does not launder prior debate into prior-art evidence

### Phase 4: Optimise (v0.2) ✅
- [x] Pruning — moderator emits a per-alternative `confidence` (0-1); branches below `--prune-threshold` are dropped before exploration. If only one alternative survives, it folds into a consensus child.
- [x] Parallel leaf execution — `executeLeaves` and `judgeLeaves` use a concurrency-limited pool (`--leaf-concurrency`, default 4) instead of sequential traversal.
- [x] Cost estimator — `src/utils/cost.ts` computes expected/worst-case node count and token spend before the run; CLI shows estimate and prompts to confirm (skip with `-y`).
- [x] Codex Cloud best-of-N — `--cloud-env <id> --cloud-attempts <n>` routes leaf execution through `codex cloud exec`. Cloud results must be applied locally with `codex cloud apply <task-id>` after the task completes (see executor output).
- [x] Codex token usage breakdown — `CodexExecutionResult.usage` captures input / cached / output / reasoning tokens per leaf; aggregated as `RunState.codexUsageTotal` and printed in the final summary.
- [x] Early-consensus / branch-decision lock — moderator now follows an explicit decision procedure (list live alternatives → DIVERGING / CONSENSUS / CONTINUE). Round-1 consensus is fine when nothing is alive; alternatives named in the original intent count as live. When a node branches, the chosen alternative is injected into descendants' `architectureDecisions` as `Chosen branch: <label>`, picked up by the agent + moderator prompts' Locked Decisions sections so children stay within their parent's choice.

### Cost-control foundation ✅
- [x] Internal model cascade — `RunConfig.modelTiers` and `modelAssignments` route analyzer, moderator, debate, sketch, synthesis, and judge stages without adding CLI flags; all tiers default to the selected model for compatibility.
- [x] Compact debate context — `CompactDebateState` carries accepted facts, locked decisions, live alternatives, rejected alternatives, risks, verification ideas, and a concise last-round summary into later rounds.
- [x] Deterministic cache — `.cambrian-tree/cache/` stores stable analysis, dossier, compact-summary, verification, and judge outputs keyed by prompt version, provider/model, normalized input, and repo/artifact fingerprints.
- [x] Sketch-first execution — implementation leaves receive `LeafImplementationSketch` with embedded `CriticChoiceEvaluation`; CTO executes the top two ranked sketches by default (deterministic axis ranker, no `LeafSketchScore`) and records skipped execution reasons for the rest.
- [x] Verification fallback — if selected leaves all fail required verification, CTO executes the next best skipped sketch before judging.

### Evolutionary foundation ✅
- [x] Intent dossier — `src/analyzer/intent-dossier.ts` converts the intent and decomposition into goal, user value, non-goals, constraints, acceptance criteria, required checks, risk areas, known unknowns, success signals, and failure modes.
- [x] Verification runner — `--verify <command>` can be repeated; commands run in local leaf artifact directories with timeout, stdout/stderr capture, and required pass/fail summaries.
- [x] Fitness scoring — `src/judge/fitness.ts` combines verification, judge dimensions, uncertainty, risk reduction, and cost efficiency; required verification failures cap winning scores.
- [x] Progressive pruning — `--prune-schedule` selects the nearest depth threshold so early alternatives can survive while late weak branches are cut.
- [x] Fitness-aware display — final CLI summary, `cto tree`, saved-run list, tree badges, and node inspector prefer fitness when present while preserving judge details.
- [x] Dry-run/cloud safeguards — dry-runs skip verification; Codex Cloud submissions record that local verification waits until cloud tasks are applied locally.

### Documentation impact guard ✅
- [x] `npm run docs:check` compares branch/worktree changes against the base branch and fails when code-impacting files change without `README.md`, `AGENTS.md`, `CLAUDE.md`, or `docs/**` updates.
- [x] `npm test` runs `docs:check` before Vitest so documentation drift is caught in the normal verification loop.
- [x] `DOCS_IMPACT=none npm run docs:check` is the explicit escape hatch for genuinely mechanical changes with no user-facing, agent-facing, or architecture impact.

### Interactive plan gate ✅
- [x] `--interactive-plan` pauses after debate traversal and before implementation or synthesis.
- [x] Human can proceed, kill a branch, or revise once with a new prompt.
- [x] Revision creates a debated `human-revision` child branch; descendants are not prompted again in v1.
- [x] Decisions persist as `TreeNode.humanIntervention`; revision prompts flow through `NodeContext.humanRevisionPrompt`.
- [x] `cto resume` preserves reviewed leaves and continues unreviewed interactive gates without re-prompting completed decisions.

### Critic pre-execution evaluator ✅
- [x] `src/critic/critic.ts` — Critic class with three modes: `auditCoverage` (CONSENSUS gate), `evaluateAlternative` (DIVERGING gate), `evaluateSketch` (LEAF — replaces former sketcher).
- [x] `src/critic/types.ts` — `CriticChoiceEvaluation` (5-axis decision schema: reversibility, blastRadius, timeToSignal, counterCase, falsifier) and `CriticCoverageAudit` (gap list + premortem).
- [x] `src/critic/dimensions.ts` — five fixed-core dimensions always audited plus `deriveIntentDimensions` for intent-keyword-based extension (security, performance, compliance, accessibility, concurrency).
- [x] `src/critic/sketch-ranker.ts` — deterministic top-K ranker over Critic axes and sketch tie-breakers; replaces `LeafSketchScore` composite.
- [x] CONSENSUS firing point: orchestrator invokes `auditCoverage` after moderator reaches consensus; if gaps remain a one-shot follow-up debate round fires, then gaps are recorded on `NodeContext.coverageAudit`.
- [x] DIVERGING firing point: orchestrator attacks each surviving alternative with `evaluateAlternative`; uniformly-bad alternatives (one-way + high blast + no real falsifier) are demoted to `killedAlternatives` before subtrees are committed.
- [x] LEAF firing point: `evaluateSketch` replaces `LeafSketcher`; sketch and Critic axes produced in one structured-output call. `LeafSketchScore` type and schema removed entirely.
- [x] Intent-derived dimensions: `IntentDossierBuilder.build` calls `deriveIntentDimensions` on both the LLM-generated dossier and the fallback, so security/performance/etc dimensions are set whenever the intent text warrants them.
- [x] Coverage gaps surfaced in `cto tree` (yellow `[!N gaps]` badge), `cto show` (Coverage Gaps section), and the saved-run UI leaf inspector (Coverage Audit + Critic Decision Axes sections).

### Saved-run UI ✅
- [x] `cto ui [run-id]` launches a local browser explorer for `.cambrian-tree` runs
- [x] Saved run picker with status, leaf count, and best fitness/score
- [x] SVG tree canvas with node selection, phase/status styling, fitness-aware score badges, zoom controls, and show-pruned toggle
- [x] Node inspector tabs for summary, debate, context, and leaf execution/scoring/fitness details; leaf tab now shows Critic Decision Axes and Coverage Audit sections
- [x] Local JSON API routes with run-id validation before state loading

### Roadmap — Pre-v1 (Planned)

These tracks are not yet implemented. They represent the planned direction before v1.0.

**Track 1 — Real-time Research via MCP and Tool-Use**
- Wire `web-search`, `web-fetch`, `docs-fetch` tool stubs to live MCP-compatible providers (Brave Search, Firecrawl, vendor doc APIs)
- Expose provider config through CLI flags or environment variables
- ToolBroker interface is already in place; adapter implementations are the remaining work
- Gated behind provider API keys (real-time web calls cost money)
- Agents: Research Planner and domain specialists will use live evidence instead of the current "unavailable" stubs

**Track 2 — Memory System**
- Lightweight run-memory index under `.cambrian-tree/memory/`: intent fingerprints, fitness outcomes, judge summaries, accepted context updates from completed runs
- Analyzer queries the index before building the dossier; seeds accepted facts, known-bad alternatives, and settled domain decisions
- Agent prompt builder can inject compact prior-run context so settled ground is not re-debated
- Memory is opt-in; users control scope and deletion

**Track 3 — Dynamic Model Selection and Cost-Aware Fallback**
- Provider package owns cheap/mid/strong fallback lists and provider error classification
- CTO maps analyzer, moderator, summarizer, debate, critic/sketch, synthesis, and judge stages to those tiers
- `llm-providers.config.mjs|js|cjs|json` enables config-driven routing without adding tier-specific CLI flags
- Future named profiles (`economy`, `balanced`, `quality`) can layer on top later if real usage shows they are useful

**Track 4 — General Refinements**
- Codex Cloud auto-apply: optional `--cloud-poll` that polls task completion and applies diffs locally
- Claude `cache_control` injection for dossier, system prompts, and ground-truth blocks to reduce Anthropic costs
- Structured output mode across all providers to reduce JSON parse failures
- UI: side-by-side leaf diff viewer, debate replay, tool-evidence summary tab

## Conventions

- All files use `.ts` extension with ESM (`"type": "module"` in package.json)
- Imports use `.js` extension (NodeNext module resolution)
- No classes where a function would suffice — classes only for stateful components (DebateEngine, TreeOrchestrator, Judge, FileStore, CodexExecutor)
- Types go in `src/types/index.ts`
- Provider defaults, endpoint configuration, adapters, tier routing, fallback policy, and usage normalization go in `packages/llm-providers`; import from `@cto/llm-providers` directly and do not recreate local provider re-export wrappers or scatter provider URLs or env var names across call sites
- Error handling: wrap LLM calls in try/catch, fallback gracefully, never crash the tree traversal
- Console output: use chalk for colour, ora for spinners, keep output readable
- Code-impacting changes should update `README.md`, `AGENTS.md`, `CLAUDE.md`, or `docs/**`; `npm test` enforces this through `npm run docs:check`

## Environment Variables

- `OPENAI_API_KEY` — required for `--provider openai`
- `OPENROUTER_API_KEY` — required for `--provider openrouter`
- `GEMINI_API_KEY` — required for `--provider gemini`
- `DEEPSEEK_API_KEY` — required for `--provider deepseek`
- `ANTHROPIC_API_KEY` — required for `--provider claude`
- `EDENAI_API_KEY` — required for `--provider edenai`
- `CAMBRIAN_TREE_STORE_DIR` — optional override for the run-state store; Vitest sets this to a temporary directory so tests do not pollute real `.cambrian-tree` runs
- Codex CLI must be installed and authenticated (`npm install -g @openai/codex && codex login`)

## Testing

Use vitest. Current coverage includes saved-run UI helpers and server behavior:
- `src/ui/tree-layout.ts`
- `src/ui/run-summary.ts`
- `src/ui/inspector.ts`
- `src/ui/server.ts`
- persistence store path behavior in `tests/persistence/file-store.test.ts`
- interactive plan gate behavior in `tests/orchestrator/orchestrator.test.ts`
- prompt propagation for human revisions in `tests/agents/definitions.test.ts`, `tests/execution/codex-client.test.ts`, and `tests/synthesis/synthesizer.test.ts`
- intent decomposition/dossier, pruning schedule parsing, verification runner, fitness scoring, and fitness-aware UI summaries
- documentation drift guard behavior in `tests/docs/impact-check.test.ts`

`tests/setup.ts` assigns `CAMBRIAN_TREE_STORE_DIR` to a throwaway temp directory for every Vitest run, including CLI subprocess tests that inherit the environment.

When adding more:
- Unit tests for `parseAgentResponse`, `buildAgentPrompt`, moderator JSON parsing
- Integration test: mock OpenAI client → run a depth-2 tree → verify tree structure

## Known Issues

- Codex Cloud execution records task IDs, but polling and auto-applying diffs are still manual.
- Verification commands are intentionally skipped for cloud submissions until a task has been applied locally.
- The saved-run UI is local-only and not authentication-protected; bind it only where localhost access is appropriate.
