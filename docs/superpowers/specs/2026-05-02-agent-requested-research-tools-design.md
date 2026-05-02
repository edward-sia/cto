# Agent-Requested Research Tools

**Date:** 2026-05-02
**Status:** Proposed

## Overview

Add read-only research tool use to CTO debates so personas are no longer constrained to model training data or user-provided ground truth. Any selected persona may request evidence during a debate round, while the orchestrator remains responsible for validating, executing, caching, compacting, and persisting tool results.

The first version focuses on debate-time research tools only. It does not add mutation tools, authenticated tools, browser automation, benchmark execution, security scanners, database queries, Codex leaf tool use, or verification-time tools.

Core principle: tools produce evidence; agents interpret evidence.

## Goals

- Let every persona request read-only research tools when missing evidence materially affects the node decision.
- Make the Researcher useful as an evidence skeptic without making it the only tool-using role.
- Keep tool execution orchestrator-mediated, auditable, cached, and budgeted.
- Preserve the current round-table debate model and provider abstraction.
- Persist tool requests and evidence in saved run state.
- Render compact but decision-complete evidence into later agent and moderator prompts.
- Keep the design extensible so future tools can be added behind the same broker interface.

## Non-Goals

- No mutation-capable tools in the first version.
- No authenticated web, cloud, database, or private API tools.
- No browser automation.
- No benchmark execution or profiling.
- No security scanners.
- No tool use inside Codex leaf execution.
- No verification-runner tool expansion.
- No human approval UI in the first version.
- No live-web-dependent automated tests.

## Recommended Approach

Use persona-initiated, orchestrator-mediated tool requests between debate rounds.

Agents emit structured `TOOL_REQUEST` lines inside their normal responses. `parseAgentResponse()` captures the requests. After all agents speak in a round, `DebateEngine` sends the collected requests to a `ToolBroker`. The broker validates and resolves approved read-only requests, records skipped or failed requests with reasons, and returns compact `ToolEvidence`. The moderator then assesses the round with both the transcript and newly available evidence.

This keeps tool use explicit and auditable while avoiding nested per-agent tool loops.

## Alternatives Considered

### Researcher As Tool Gatekeeper

Every persona could ask for evidence, but only the Researcher would convert those needs into executable tool requests. This provides strong epistemic discipline, but it makes the Researcher a bottleneck and weakens specialists. A Security Engineer should be able to request security documentation, and an API / Integration Architect should be able to request vendor API docs directly.

### Tool Calls Inside Agent Turns

Each persona could call tools during its own model turn. This is powerful, but it changes the provider integration, complicates deterministic caching, makes transcript ordering harder to reason about, and creates more risk of runaway tool loops.

The recommended design keeps one tool-resolution pass per debate round.

## Architecture

Add a tool layer beside the debate engine:

```text
Agent response
  -> parseAgentResponse()
  -> ToolRequest[]
  -> ToolBroker.resolve()
  -> ToolEvidence[]
  -> NodeContext.toolEvidence
  -> next agent prompts + moderator prompt + saved-run UI
```

The broker owns:

- tool allowlist checks
- request validation
- deduplication
- read-only policy enforcement
- budget enforcement
- execution adapters
- result compaction
- cache reads and writes
- skipped and failed request records

The DebateEngine owns:

- collecting requests during a round
- calling the broker once after all agents speak
- adding returned evidence to the node context
- rendering evidence to the moderator for same-round assessment
- carrying compact evidence into later rounds

The orchestrator owns:

- creating the broker from run config
- passing broker hooks into `DebateEngine`
- persisting updated node state
- showing compact CLI progress

## Round Timing

Tools run after all agents speak and before moderator assessment.

Sequence:

1. Agent panel speaks in normal round-robin order.
2. Agent responses may include `TOOL_REQUEST` lines.
3. DebateEngine collects all requests from the round.
4. ToolBroker resolves approved requests.
5. Node context receives new evidence.
6. Moderator assesses the round with transcript plus evidence.
7. If the debate continues, the next round's agent prompts include the evidence rollup.

Current-round agents do not revise their own statements immediately after evidence returns. If the evidence changes the decision, the moderator can choose `continue` so the next round can integrate it.

## Initial Tool Set

Start with a small read-only toolbox:

```ts
export type ToolName =
  | "web-search"
  | "web-fetch"
  | "docs-fetch"
  | "repo-search"
  | "repo-read"
  | "package-info";
```

`web-search` finds current public information.

`web-fetch` fetches and summarizes a specific public URL.

`docs-fetch` fetches official documentation, biased toward authoritative vendor, framework, standard, or project docs.

`repo-search` searches the local repository using `rg`-style semantics.

`repo-read` reads specific local files after `repo-search` or a persona identifies a path.

`package-info` inspects declared or installed package metadata. The first implementation can read local dependency declarations; npm registry lookup can be added later behind the same tool name or as a separate adapter.

## Persona Behavior

Every persona may request tools. Their prompts should share the same rule block:

```md
## Tool Requests

You may request read-only tools when missing evidence materially affects this decision.

Use this exact format:

TOOL_REQUEST [tool-name]: specific query or target

Rules:
- Request tools only for evidence needed to advance this node.
- Prefer official docs, source files, standards, or authoritative references.
- Do not request tools for generic curiosity.
- Do not claim a fact from a tool unless it appears in Tool Evidence.
- If Tool Evidence conflicts with prior assumptions, update your position.
- If evidence is missing or limited, label the claim UNKNOWN.
```

Role examples:

- Researcher: current public facts, official docs, standards, prior art, contradictory evidence.
- Developer: library docs, local repo patterns, package metadata.
- Code Reviewer: local implementation patterns, risky APIs, dependency docs.
- Security Engineer: advisories, auth docs, safe handling guidance.
- DevOps Engineer: runtime support docs, deployment docs, CI/CD docs.
- Frontend Engineer: browser APIs, framework docs, local component patterns.
- API / Integration Architect: vendor API docs, OpenAPI files, webhook docs.
- Technical Writer: existing docs, CLI help patterns, official terminology.
- Product Manager, Business Analyst, UX Designer, and data personas: external claims only when source checking materially affects the requested product or analysis decision.

The Researcher gets additional guidance: critique evidence quality, identify stale or weak sources, reconcile contradictions, and propose follow-up requests.

## Data Model

Add explicit persisted request and evidence records.

```ts
export interface ToolRequest {
  id: string;
  toolName: ToolName;
  query: string;
  requestedBy: AgentRole;
  nodeId: string;
  roundNumber: number;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  reason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ToolEvidenceSource {
  title?: string;
  url?: string;
  path?: string;
  quote?: string;
  retrievedAt: string;
}

export interface ToolEvidence {
  id: string;
  requestId: string;
  toolName: ToolName;
  query: string;
  requestedBy: AgentRole;
  additionalRequesters: AgentRole[];
  nodeId: string;
  roundNumber: number;
  summary: string;
  findings: string[];
  decisionRelevance: string[];
  constraintsDiscovered: string[];
  risksDiscovered: string[];
  openQuestions: string[];
  sources: ToolEvidenceSource[];
  limitations: string[];
  confidence: number;
  createdAt: string;
}
```

Extend `TreeNode`:

```ts
toolRequests?: ToolRequest[];
```

Extend `NodeContext`:

```ts
toolEvidence?: ToolEvidence[];
```

Requests and evidence are split deliberately. A request records what an agent asked for, even if it was skipped or failed. Evidence records what CTO actually learned.

## Evidence Compression

Evidence must be compact in prompts but complete enough to move later phases forward without gaps.

Persist full structured `ToolEvidence` in saved state. Render a compact, decision-oriented view in prompts with these fields:

- what was learned
- why it matters to the current decision
- constraints discovered
- risks discovered
- open questions
- sources
- limitations

Do not dump full raw pages into prompts. If raw snippets are needed for audit or future UI expansion, store them in the deterministic cache or evidence source quotes with size limits.

Extend compact debate state with evidence rollups:

```ts
interface CompactDebateState {
  evidenceFindings: string[];
  evidenceConstraints: string[];
  evidenceRisks: string[];
  evidenceOpenQuestions: string[];
}
```

The rollup should summarize evidence against CTO's decision frame, not merely summarize source documents.

Example prompt rendering:

```md
## Tool Evidence Rollup

Findings:
- Commander supports repeatable options through custom parsers.

Decision relevance:
- This supports implementing repeated --tool flags with existing CLI patterns instead of custom argv parsing.

Constraints:
- Parser behavior must preserve previous values when an option appears multiple times.

Risks:
- CTO already wraps Commander options, so local tests are still needed.

Sources:
- Official Commander docs, retrieved 2026-05-02.
```

Deduplicate semantically similar requests in the same node or run. If multiple personas request the same evidence, keep one evidence record and attach the later roles in `additionalRequesters`.

## Execution Policy

Auto-run a request when all are true:

- tool is read-only
- tool is configured in the allowlist
- request is under budget
- query is non-empty and specific enough
- target is public web or local repo
- no credentials or mutation are required

Skip and persist a reason when:

- tool is unknown
- query is too broad
- budget is exhausted
- equivalent evidence already exists
- request requires credentials
- request would mutate state
- target domain or path is disallowed

Suggested config:

```ts
export interface ToolUseConfig {
  enabled: boolean;
  allowlist: ToolName[];
  maxRequestsPerNode: number;
  maxRequestsPerRound: number;
  maxRequestsPerRun: number;
  maxEvidenceItemsInPrompt: number;
  autoRunReadOnly: boolean;
}
```

Default tools should be off for backward compatibility. Users can opt in:

```bash
cto run "..." --tools web-search,docs-fetch,repo-search
cto run "..." --tools all-readonly
cto run "..." --no-tools
```

## Caching

Cache resolved evidence by:

- tool name
- normalized query, URL, path, or package name
- tool adapter version
- date bucket for web tools
- repo fingerprint for repo tools

Use a daily cache bucket for web tools so evidence is reasonably fresh while repeated runs in a day stay stable. Use the existing repo fingerprint for repo tools.

Skipped requests should not be cached globally, but they should remain persisted on the node for auditability.

## Prompt Integration

Render tool evidence after original intent and verified ground truth, before PRD and acceptance criteria. Evidence should frame the debate without displacing user-provided constraints.

Moderator prompt additions:

```md
When assessing alternatives, prefer positions backed by Tool Evidence over unsupported claims.
Do not treat unsupported tool requests as evidence.
If live alternatives depend on missing evidence, choose CONTINUE when another round could use available evidence to resolve them.
```

Agent prompt additions:

- include the shared `Tool Requests` block
- include role-specific request examples
- remind agents not to treat requested tools as completed evidence
- remind agents to update their position when evidence contradicts assumptions

## CLI And Saved-Run UI Visibility

CLI progress should be compact:

```text
🔎 [node-abc123] 4 tool request(s), 2 resolved, 1 cached, 1 skipped
   docs-fetch: Commander.js repeatable options
   repo-search: buildAgentPrompt evidence rendering
```

Saved-run UI additions:

- Node summary shows request and evidence counts.
- Context tab includes a `Tool Evidence` section.
- Debate tab shows which persona requested each tool in each round.
- Skipped and failed requests show reasons.
- Evidence sources are clickable when URLs exist.
- Evidence constraints, risks, and open questions appear near findings.

The UI does not need to approve or run tools in v1.

## Testing Strategy

Use deterministic fake tools for automated tests.

Unit tests:

- `parseAgentResponse()` extracts multiple `TOOL_REQUEST` lines.
- unknown or malformed tool requests are handled predictably.
- `ToolBroker` deduplicates requests.
- allowlisted read-only tools auto-run.
- disallowed tools persist skipped request records.
- evidence rendering includes findings, decision relevance, constraints, risks, open questions, sources, and limitations.
- compact debate state carries evidence rollups into later rounds.
- moderator prompt includes evidence before assessment.
- persisted `TreeNode` state includes tool requests and evidence.

Integration tests:

- a two-round dry-run where an agent requests `docs-fetch`, fake evidence is injected, and the next prompt includes that evidence.
- evidence is available before same-round moderator assessment.
- budget exhaustion skips extra requests.
- duplicate requests from multiple personas produce one evidence item with multiple requesters.

Live web tool adapters can have narrow adapter tests or manual smoke tests, but orchestration tests should not depend on live external services.

## Open Questions

- Should `web-search` use the host environment's available search capability, a provider API, or a pluggable adapter chosen by config?
- Should `docs-fetch` maintain domain allowlists for official documentation, or should source quality be scored after fetch?
- Should evidence source quotes be stored inline in state or in cache entries referenced by ID?
- Should tool evidence become part of final judge context in a later phase, even though v1 skips execution and verification tool use?

These are implementation choices and do not change the approved architecture.
