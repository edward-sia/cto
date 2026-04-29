# Architecture

## System Overview

Three layers with strict downward dependencies:

```
┌─────────────────────────────────────────────┐
│  Interface Layer                            │
│  src/cli/index.ts · src/ui/                 │
│  CLI commands · saved-run browser UI        │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│  Layer 1 — Orchestrator                     │
│  src/orchestrator/orchestrator.ts           │
│  Tree traversal · branching · state mgmt    │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│  Layer 2 — Agent Panel                      │
│  src/agents/definitions.ts                 │
│  src/debate/engine.ts                       │
│  Round-table debate · moderator scoring     │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│  Layer 3 — Execution & Judging              │
│  src/execution/codex-client.ts             │
│  src/judge/judge.ts                         │
│  Codex SDK · LLM scoring                   │
└─────────────────────────────────────────────┘
```

## End-to-End Flow

```mermaid
flowchart TD
    A([User intent]) --> B[Create root node\ndepth 0]
    B --> C{Debate round}
    C --> D[Each agent speaks\nin round-robin order]
    D --> E[Moderator assesses\nround transcript]
    E --> F{Outcome?}
    F -- consensus --> G[Single child node\ndepth + 1]
    F -- continue --> C
    F -- diverging --> H[Branch: one child\nper alternative]
    G --> I{At max depth?}
    H --> I
    I -- no --> C
    I -- yes --> J[Candidate leaf node]
    J --> Gate{--interactive-plan?}
    Gate -- no --> K[Codex execution\nvia SDK or CLI]
    Gate -- proceed --> K
    Gate -- kill --> P[Pruned branch\nexcluded from execution]
    Gate -- revise once --> R[human-revision child\nwith human prompt]
    R --> C
    K --> L[LLM Judge scores\n6 dimensions]
    L --> M([Ranked results])
    M --> N[Saved run UI\ncto ui]
```

## Saved-Run UI

`cto ui` is a local-only viewer for persisted run state. It does not participate in orchestration; it reads `.cambrian-tree/<run-id>/state.json` through the same file-store boundary used by the CLI.

```mermaid
flowchart LR
    CLI["cto ui [run-id]"] --> Server["src/ui/server.ts\nLocal HTTP server"]
    Server --> Store["FileStore\n.cambrian-tree/*/state.json"]
    Server --> Page["src/ui/page.ts\nHTML/CSS/browser script"]
    Browser["Browser"] --> Runs["GET /api/runs"]
    Browser --> Run["GET /api/runs/:runId"]
    Run --> Canvas["SVG tree canvas"]
    Run --> Inspector["Node inspector tabs"]
```

The UI keeps browser-specific behavior isolated in `src/ui/page.ts`, while testable data shaping lives in small pure modules:

- `src/ui/tree-layout.ts` — flattens `TreeNode` hierarchies and computes deterministic SVG positions.
- `src/ui/run-summary.ts` — turns `RunState` into saved-run list rows.
- `src/ui/inspector.ts` — maps a selected `TreeNode` into summary/debate/context/leaf inspector sections.
- `src/ui/server.ts` — serves the UI and JSON routes using Node built-ins.

Run IDs are validated before loading state so encoded path separators cannot escape the `.cambrian-tree/<run-id>/state.json` namespace.

## Node State Machine

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> debating : processNode()
    debating --> branched : moderator → diverging
    debating --> consensus : moderator → consensus
    branched --> debating : child nodes
    consensus --> debating : child node
    debating --> completed : max depth reached
    completed --> pruned : interactive kill
    consensus --> pruned : interactive kill
    completed --> pending : interactive revise child
    consensus --> pending : interactive revise child
    consensus --> executing : isLeaf()
    executing --> completed : Codex returns
    completed --> scored : judge.score()
    scored --> [*]
```

## Debate Round Detail

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant DE as DebateEngine
    participant A1 as Agent (PM)
    participant A2 as Agent (BA)
    participant AN as Agent (QA)
    participant M as Moderator LLM

    O->>DE: runDebate(phase, context, agents)
    loop Each round (up to maxRounds)
        DE->>A1: prompt(priorRoundsHistory=[], currentRoundSoFar=[])
        A1-->>DE: response (ALTERNATIVE [...] | CONTEXT_UPDATE [...])
        DE->>A2: prompt(priorRoundsHistory=[], currentRoundSoFar=[A1])
        A2-->>DE: response (sees A1's contribution explicitly)
        DE->>AN: prompt(priorRoundsHistory=[], currentRoundSoFar=[A1,A2])
        AN-->>DE: response (sees A1+A2 explicitly)
        DE->>M: assessRound(fullTranscript, alternatives)
        M-->>DE: {outcome, alternatives[], summary}
        alt outcome == consensus
            DE-->>O: {finalOutcome="consensus", contextUpdates}
        else outcome == diverging (requires 2+ agents supporting)
            DE-->>O: {finalOutcome="branched", alternatives[], contextUpdates}
        else outcome == continue
            DE->>DE: next round (priorRoundsHistory grows)
        end
    end
```

## Context Propagation

Agents emit structured updates using `CONTEXT_UPDATE [field]: value` lines. These are parsed, accumulated across all rounds, and merged into every child node's `NodeContext` so downstream phases have richer context.

```
CONTEXT_UPDATE [prd]: The API must support pagination via cursor-based tokens
CONTEXT_UPDATE [acceptance-criteria]: Given a valid auth token, when GET /todos is called, then it returns 200 with an array
CONTEXT_UPDATE [architecture-decision]: Use JWT for stateless auth — no session store needed
CONTEXT_UPDATE [implementation-spec]: Use Prisma ORM with connection pooling via PgBouncer
CONTEXT_UPDATE [test-strategy]: Unit tests for handlers, integration tests against real Postgres via testcontainers
```

Supported agent-emitted fields: `prd`, `acceptance-criteria`, `architecture-decision`, `implementation-spec`, `test-strategy`.
Array fields (`acceptance-criteria`, `architecture-decision`) are deduplicated and appended; scalar fields take the last written value.

Human plan revisions use a separate context field, `humanRevisionPrompt`. It is written by the interactive gate, not by agents, and is rendered into later agent, synthesis, and implementation prompts under a `Human Revision` heading.

## Interactive Plan Gate

`--interactive-plan` adds a human checkpoint after debate traversal produces candidate leaves and before execution or synthesis begins. It is intentionally terminal-first and does not require saved-run UI changes.

For each original candidate leaf, the human can choose:

- `proceed` — persist `TreeNode.humanIntervention.action = "proceed"` and execute the leaf normally.
- `revise` — persist the revision prompt, create a `human-revision` child with `NodeContext.humanRevisionPrompt`, and run normal CTO debate for that child.
- `kill` — persist `TreeNode.humanIntervention.action = "kill"`, mark the node `pruned`, and exclude it from execution, synthesis, scoring, and ranking.

The gate is one-shot in v1: descendants of a human revision are eligible for execution but are not prompted again. If every candidate leaf is killed, the run is saved as `paused` with no execution attempted. `cto resume` preserves completed human decisions and only prompts leaves that still need review.

## Tree Structure Example

A run with `--depth 4 --branching 2` on *"Build a REST API"*:

```
root (depth 0) — requirements debate
├── REST approach (depth 1) — architecture debate
│   ├── PostgreSQL backend (depth 2) — implementation debate
│   │   └── leaf → Codex exec → score 8.2/10 🥇
│   └── MongoDB backend (depth 2) — implementation debate
│       └── leaf → Codex exec → score 6.7/10 🥉
└── GraphQL approach (depth 1) — architecture debate
    ├── Apollo Server (depth 2) — implementation debate
    │   └── leaf → Codex exec → score 7.8/10 🥈
    └── Pothos schema-first (depth 2) — implementation debate
        └── leaf → Codex exec → score 5.9/10
```

## Agent Participation by Phase

```mermaid
graph LR
    subgraph requirements["Requirements (depth 0-1)"]
        PM[Product Manager]
        BA1[Business Analyst]
        QA1[QA Engineer]
    end
    subgraph architecture["Architecture (depth 2-3)"]
        TL[Tech Lead]
        BA2[Business Analyst]
        CR1[Code Reviewer]
        QA2[QA Engineer]
    end
    subgraph implementation["Implementation (depth 4-5)"]
        DEV[Developer]
        TL2[Tech Lead]
        CR2[Code Reviewer]
    end
    subgraph validation["Validation (depth 6-7)"]
        QA3[QA Engineer]
        CR3[Code Reviewer]
        DEV2[Developer]
    end
```

## Scoring Weights

```mermaid
pie title Judge Score Weights
    "Functional Completeness" : 25
    "Architectural Quality" : 15
    "Test Coverage" : 15
    "Intent Alignment" : 20
    "Real-World Fit" : 15
    "Simplicity" : 10
```

## File Structure

```
src/
├── cli/index.ts              # CLI entry (commander) — run, list, show, tree, ui, resume
├── types/index.ts            # All shared types (TreeNode, RunConfig, HumanIntervention, JudgeScore, …)
├── schemas/index.ts          # Zod schemas for LLM response validation
├── utils/retry.ts            # Exponential-backoff retry wrapper
├── agents/definitions.ts     # Agent system prompts + buildAgentPrompt + parseAgentResponse
├── debate/engine.ts          # DebateEngine — round-table loop + moderator assessment
├── orchestrator/orchestrator.ts  # TreeOrchestrator — main loop, interactive gate, SIGINT, token budget
├── execution/codex-client.ts # CodexExecutor — SDK + CLI fallback
├── judge/judge.ts            # Judge — LLM scoring
├── persistence/file-store.ts # FileStore — .cambrian-tree/<run-id>/state.json
└── ui/                       # Local saved-run browser UI
    ├── server.ts             # HTTP server + JSON API routes
    ├── page.ts               # Dependency-free browser app shell
    ├── tree-layout.ts        # TreeNode → SVG layout
    ├── run-summary.ts        # RunState → run list summary
    └── inspector.ts          # TreeNode → inspector view model
```

## Retry & Resilience

All LLM calls go through `withRetry` (3 attempts, exponential backoff: 1 s → 2 s → 4 s). Parse failures fall back gracefully — the moderator defaults to `continue` (or `consensus` on the last round) rather than crashing the tree.

```
LLM call
  └─ attempt 1 → fail → wait 1s
  └─ attempt 2 → fail → wait 2s
  └─ attempt 3 → fail → throw
                          └─ caught by caller → fallback value returned
```

## Graceful Shutdown

Pressing **Ctrl+C** during a run triggers a `SIGINT` handler that:
1. Sets run status to `"paused"`
2. Saves current tree state to disk
3. Prints the resume command (`cto resume <run-id>`)
4. Exits with code 130

The handler is removed after a normal run completes.

Interactive plan gate state is persisted the same way. Already-reviewed leaves keep their `humanIntervention`, revised branches remain normal child nodes, and killed leaves remain `pruned` on resume.
