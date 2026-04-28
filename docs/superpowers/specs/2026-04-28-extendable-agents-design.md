# Extendable Agent Personas + Task-Driven Panel Selection

**Date:** 2026-04-28  
**Status:** Approved

## Overview

Two related capabilities added to the Cambrian Tree Orchestrator:

1. **New domain-specialist agents** — 6 new built-in agent types extending the existing 6, covering research, data, security, ML, and platform/DevOps domains.
2. **`TaskAnalyzer`** — one LLM call before the tree starts that reads the intent, selects the appropriate agent panel, and classifies the run mode (`implementation` vs `exploration`). Replaces the static `PHASE_AGENT_MAP` lookup at runtime.

Not in scope: a plugin/registry system for adding agents without code changes (deferred to v2).

---

## 1. New Agent Types

Six new entries added to `AGENT_ROLES` in `src/types/index.ts` and `AGENT_DEFINITIONS` in `src/agents/definitions.ts`:

| Role | Display Name | Primary Phases | Triggers on intents involving |
|---|---|---|---|
| `researcher` | Researcher | `requirements`, `architecture` | spikes, feasibility studies, technology evaluation, "investigate X" |
| `data-engineer` | Data Engineer | `architecture`, `implementation` | pipelines, ETL, data modeling, databases, warehouses |
| `data-analyst` | Data Analyst | `requirements`, `architecture` | metrics, reporting, dashboards, analytics queries |
| `security-engineer` | Security Engineer | `architecture`, `implementation`, `validation` | auth, permissions, secrets, compliance, infra security |
| `ml-engineer` | ML Engineer | `architecture`, `implementation` | models, inference, training pipelines, embeddings, LLM integration |
| `devops-engineer` | DevOps Engineer | `architecture`, `implementation`, `validation` | CI/CD, infrastructure, deployments, scaling, containers |

Each agent definition follows the existing `AgentDefinition` interface: `role`, `displayName`, `systemPrompt`, `primaryPhases`, `contextContributions`.

---

## 2. TaskAnalyzer (`src/analyzer/task-analyzer.ts`)

New class with a single public method:

```ts
class TaskAnalyzer {
  constructor(openai: OpenAI, model: string, dryRun?: boolean)
  async analyze(intent: string): Promise<TaskAnalysis>
}
```

### Output type

```ts
interface TaskAnalysis {
  runMode: "implementation" | "exploration"
  selectedAgents: AgentRole[]
  rationale: string
}
```

- `runMode: "implementation"` — standard flow: tree traversal → Codex execution → LLM judge → ranked results
- `runMode: "exploration"` — tree traversal only → synthesis document per leaf → no Codex, no judge

### Behavior

- One LLM call with a structured prompt: intent + all available agent roles with one-line descriptions + instructions to return JSON matching `TaskAnalysisSchema`
- Response validated with Zod (`TaskAnalysisSchema` in `src/schemas/index.ts`)
- On parse failure: logs a warning, falls back to static default panel (`["product-manager", "tech-lead", "developer", "qa-engineer"]`) with `runMode: "implementation"`
- Dry-run: returns the default panel without an LLM call

### Rationale display

The `rationale` string is logged to the console before the tree starts so the user sees why those agents were selected.

---

## 3. Synthesizer (`src/synthesis/synthesizer.ts`)

Used only when `runMode === "exploration"`. Mirrors `CodexExecutor` structurally — same call site in the orchestrator.

```ts
class Synthesizer {
  constructor(openai: OpenAI, model: string, dryRun?: boolean)
  async synthesize(node: TreeNode): Promise<CodexExecutionResult>
}
```

One LLM call per leaf node. Input: full ancestor debate context + accumulated `NodeContext`. Output: a structured document covering:

- Research questions addressed
- Key findings
- Open questions
- Recommended next steps

Stored in the existing `executionResult.output` field. `filesChanged` is empty, `testResults` is undefined. The judge step is skipped entirely for exploration runs — no scoring, no ranking.

---

## 4. Type Changes (`src/types/index.ts`)

### `AGENT_ROLES` extended

```ts
export const AGENT_ROLES = [
  // existing 6
  "product-manager", "business-analyst", "tech-lead",
  "developer", "code-reviewer", "qa-engineer",
  // new 6
  "researcher", "data-engineer", "data-analyst",
  "security-engineer", "ml-engineer", "devops-engineer",
] as const;
```

### `RunState` gains two new fields

```ts
export interface RunState {
  // ... existing fields
  runMode: "implementation" | "exploration"
  selectedAgents: AgentRole[]
}
```

### `TaskAnalysis` added

```ts
export interface TaskAnalysis {
  runMode: "implementation" | "exploration"
  selectedAgents: AgentRole[]
  rationale: string
}
```

---

## 5. Orchestrator Changes (`src/orchestrator/orchestrator.ts`)

### Before tree starts

```ts
async run(intent: string): Promise<RunState> {
  const analysis = await this.analyzer.analyze(intent)
  // store on runState
  this.runState.runMode = analysis.runMode
  this.runState.selectedAgents = analysis.selectedAgents
  // log rationale + selected agents
  // ... create root node, begin tree
}
```

### Dynamic panel derivation (replaces static `PHASE_AGENT_MAP[phase]`)

```ts
private getAgentsForPhase(phase: TreePhase): AgentRole[] {
  const agents = this.runState.selectedAgents.filter(
    role => AGENT_DEFINITIONS[role].primaryPhases.includes(phase)
  )
  return agents.length > 0 ? agents : PHASE_AGENT_MAP[phase]
}
```

The fallback to `PHASE_AGENT_MAP[phase]` prevents phase starvation if the selected panel has no agents covering a particular phase.

### Leaf dispatch branches on runMode

```ts
if (this.runState.runMode === "implementation") {
  await this.executeLeaves(root)    // Codex SDK
  await this.judgeLeaves(root)      // LLM judge
} else {
  await this.synthesizeLeaves(root) // Synthesizer
}
```

`synthesizeLeaves` mirrors `executeLeaves` — walks the tree, calls `synthesizer.synthesize(node)` at each leaf, stores result in `node.executionResult`.

---

## 6. Schema Changes (`src/schemas/index.ts`)

New Zod schema:

```ts
export const TaskAnalysisSchema = z.object({
  runMode: z.enum(["implementation", "exploration"]),
  selectedAgents: z.array(z.enum(AGENT_ROLES)),
  rationale: z.string(),
})
```

---

## 7. CLI Changes (`src/cli/index.ts`)

Before the tree progress display starts, print:

```
Run mode:  implementation
Agents:    Product Manager, Tech Lead, Security Engineer, Developer, Code Reviewer, QA Engineer
Rationale: Task involves auth middleware — security and core engineering roles selected.
```

The `show` command already renders `executionResult.output` — exploration runs display the synthesis document there with no code-specific framing.

---

## 8. Files Summary

| File | Change |
|---|---|
| `src/types/index.ts` | Extend `AGENT_ROLES`, `AGENT_DISPLAY_NAMES`; add `TaskAnalysis`; add `runMode` + `selectedAgents` to `RunState` |
| `src/agents/definitions.ts` | 6 new `AgentDefinition` entries |
| `src/schemas/index.ts` | Add `TaskAnalysisSchema` |
| `src/analyzer/task-analyzer.ts` | New — `TaskAnalyzer` class |
| `src/synthesis/synthesizer.ts` | New — `Synthesizer` class |
| `src/orchestrator/orchestrator.ts` | Add `TaskAnalyzer`, `Synthesizer`; dynamic panel selection; runMode branch at leaf dispatch |
| `src/cli/index.ts` | Display run mode, selected agents, rationale before tree starts |

---

## Out of Scope (v2)

- Plugin/registry system for adding agents without code changes
- Per-phase or per-node agent selection
- Seniority levels / org-hierarchy agent variants
- Judge repurposed for exploration run scoring
- Parallel leaf synthesis
