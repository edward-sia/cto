# Agent-Requested Research Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persona-requested, orchestrator-mediated read-only research tools to CTO debate rounds.

**Architecture:** Agents emit `TOOL_REQUEST [tool-name]: query` lines during normal debate. `DebateEngine` collects requests, resolves them once per round through a `ToolBroker`, persists request/evidence records on the current node context, and passes compact evidence to the moderator and later rounds. Tool adapters are pluggable and deterministic tests use fake adapters.

**Tech Stack:** TypeScript ESM, NodeNext, Vitest, Zod, Commander, existing deterministic cache patterns, Node built-ins for local repo/package tools.

---

## Scope Check

This plan implements v1 from the approved spec:

- persona-initiated research requests
- read-only allowlisted tools
- request/evidence persistence
- compact prompt rendering
- one broker resolution pass per debate round
- CLI flags and saved-run visibility
- deterministic tests with fake tools

It intentionally does not implement mutation tools, authenticated tools, browser automation, security scanners, benchmark execution, database queries, Codex leaf tool use, or verification-runner expansion.

## File Structure

- `src/types/index.ts` — add shared tool types, config, prompt state fields, and event types.
- `src/schemas/index.ts` — add Zod schemas for tool names, config, requests, evidence, and sources.
- `src/tools/broker.ts` — new broker that validates, deduplicates, budgets, resolves, caches, and compacts read-only tool requests.
- `src/tools/adapters.ts` — new adapter registry plus local read-only adapters for `repo-search`, `repo-read`, and `package-info`.
- `src/tools/render.ts` — new prompt renderer for compact tool evidence and compact evidence rollups.
- `src/agents/definitions.ts` — parse `TOOL_REQUEST` lines and render tool request instructions/evidence.
- `src/debate/engine.ts` — resolve tool requests after each agent round and before moderator assessment.
- `src/orchestrator/orchestrator.ts` — construct the broker, pass node ID/config into `DebateEngine`, and persist request/evidence updates.
- `src/cli/index.ts` — add `--tools` / `--no-tools` config and compact tool progress output.
- `src/ui/inspector.ts` and `src/ui/page.ts` — expose tool requests/evidence in saved-run views.
- `README.md` and `docs/architecture.md` — document the feature and architecture flow.
- `tests/tools/broker.test.ts` — new broker tests with fake adapters.
- `tests/tools/render.test.ts` — new evidence rendering tests.
- `tests/agents/definitions.test.ts` — parser and prompt tests.
- `tests/debate/engine.test.ts` — fake broker integration tests.
- `tests/orchestrator/orchestrator.test.ts` — persistence/config integration tests.
- `tests/cli/cli.test.ts` — CLI option tests.
- `tests/ui/inspector.test.ts` and `tests/ui/page.test.ts` — saved-run visibility tests.

## Task 1: Tool Types And Schemas

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/schemas/index.ts`
- Modify: `tests/agents/definitions.test.ts`

- [ ] **Step 1: Write failing parser/type-facing tests**

Add these imports to `tests/agents/definitions.test.ts`:

```ts
import { ToolRequestSchema, ToolEvidenceSchema } from "../../src/schemas/index.js";
```

Add this test inside `describe("parseAgentResponse", ...)`:

```ts
  it("extracts structured tool requests while keeping normal context updates", () => {
    const raw = `## Implementation Plan
We need current docs before choosing the CLI shape.

TOOL_REQUEST [docs-fetch]: official Commander.js custom option parser documentation
TOOL_REQUEST [repo-search]: collectValues helper in CLI options
CONTEXT_UPDATE [implementation-spec]: Preserve existing Commander option parser patterns.`;

    const result = parseAgentResponse("developer", raw);

    expect(result.toolRequests).toEqual([
      {
        toolName: "docs-fetch",
        query: "official Commander.js custom option parser documentation",
      },
      {
        toolName: "repo-search",
        query: "collectValues helper in CLI options",
      },
    ]);
    expect(result.contextUpdates?.implementationSpec).toBe(
      "Preserve existing Commander option parser patterns."
    );
  });
```

Add this new schema test block to the same file:

```ts
describe("Tool schemas", () => {
  it("validates persisted tool evidence", () => {
    const parsed = ToolEvidenceSchema.parse({
      id: "evidence-1",
      requestId: "request-1",
      toolName: "docs-fetch",
      query: "official Commander docs",
      requestedBy: "developer",
      additionalRequesters: ["technical-writer"],
      nodeId: "node-1",
      roundNumber: 1,
      summary: "Commander supports custom option processors.",
      findings: ["Repeatable options can be collected with a parser."],
      decisionRelevance: ["Use Commander instead of custom argv parsing."],
      constraintsDiscovered: ["Parser must preserve previous values."],
      risksDiscovered: ["Local wrapper still needs tests."],
      openQuestions: [],
      sources: [
        {
          title: "Commander options docs",
          url: "https://example.com/commander",
          retrievedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
      limitations: ["Fixture URL is not real documentation."],
      confidence: 0.8,
      createdAt: "2026-05-02T00:00:01.000Z",
    });

    expect(parsed.toolName).toBe("docs-fetch");
    expect(parsed.sources[0].retrievedAt).toBe("2026-05-02T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
npx vitest run tests/agents/definitions.test.ts
```

Expected: FAIL with missing `ToolRequestSchema` / `ToolEvidenceSchema` exports and missing `result.toolRequests`.

- [ ] **Step 3: Add shared tool types**

In `src/types/index.ts`, add these definitions after `PruneSchedulePoint`:

```ts
export const TOOL_NAMES = [
  "web-search",
  "web-fetch",
  "docs-fetch",
  "repo-search",
  "repo-read",
  "package-info",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolUseConfig {
  enabled: boolean;
  allowlist: ToolName[];
  maxRequestsPerNode: number;
  maxRequestsPerRound: number;
  maxRequestsPerRun: number;
  maxEvidenceItemsInPrompt: number;
  autoRunReadOnly: boolean;
}

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

export interface ParsedToolRequest {
  toolName: ToolName;
  query: string;
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

Extend `CompactDebateState`:

```ts
  evidenceFindings: string[];
  evidenceConstraints: string[];
  evidenceRisks: string[];
  evidenceOpenQuestions: string[];
```

Extend `NodeContext`:

```ts
  toolEvidence?: ToolEvidence[];
```

Extend `TreeNode`:

```ts
  toolRequests?: ToolRequest[];
```

Extend `RunConfig`:

```ts
  toolUse: ToolUseConfig;
```

Extend `AgentOutput`:

```ts
  toolRequests?: ParsedToolRequest[];
```

- [ ] **Step 4: Add Zod schemas**

In `src/schemas/index.ts`, add `TOOL_NAMES` to the import list:

```ts
import { TOOL_NAMES } from "../types/index.js";
```

Then add these schemas after `PruneSchedulePointSchema`:

```ts
export const ToolNameSchema = z.enum(TOOL_NAMES);

export const ToolUseConfigSchema = z.object({
  enabled: z.boolean(),
  allowlist: z.array(ToolNameSchema),
  maxRequestsPerNode: z.number().int().min(0),
  maxRequestsPerRound: z.number().int().min(0),
  maxRequestsPerRun: z.number().int().min(0),
  maxEvidenceItemsInPrompt: z.number().int().min(0),
  autoRunReadOnly: z.boolean(),
});

export const ToolRequestSchema = z.object({
  id: z.string().min(1),
  toolName: ToolNameSchema,
  query: z.string().min(1),
  requestedBy: z.string(),
  nodeId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  status: z.enum(["pending", "running", "completed", "skipped", "failed"]),
  reason: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export const ParsedToolRequestSchema = z.object({
  toolName: ToolNameSchema,
  query: z.string().min(1),
});

export const ToolEvidenceSourceSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  quote: z.string().optional(),
  retrievedAt: z.string(),
});

export const ToolEvidenceSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  toolName: ToolNameSchema,
  query: z.string().min(1),
  requestedBy: z.string(),
  additionalRequesters: z.array(z.string()).default([]),
  nodeId: z.string().min(1),
  roundNumber: z.number().int().positive(),
  summary: z.string(),
  findings: z.array(z.string()).default([]),
  decisionRelevance: z.array(z.string()).default([]),
  constraintsDiscovered: z.array(z.string()).default([]),
  risksDiscovered: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  sources: z.array(ToolEvidenceSourceSchema).default([]),
  limitations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});
```

Update `CompactDebateStateSchema` to include:

```ts
  evidenceFindings: z.array(z.string()).default([]),
  evidenceConstraints: z.array(z.string()).default([]),
  evidenceRisks: z.array(z.string()).default([]),
  evidenceOpenQuestions: z.array(z.string()).default([]),
```

- [ ] **Step 5: Parse `TOOL_REQUEST` lines**

In `src/agents/definitions.ts`, change the existing type-only import from `../types/index.js` so `TOOL_NAMES` is imported as a runtime value and the rest remain type-only:

```ts
import { TOOL_NAMES } from "../types/index.js";
import type {
  AgentRole,
  AgentInput,
  AgentOutput,
  DebateMessage,
  NodeContext,
  TreePhase,
} from "../types/index.js";
```

Do not import `AGENT_DEFINITIONS` from `../types/index.js`; it is defined in this file.

Inside `parseAgentResponse()`, after context update parsing, add:

```ts
  const validToolNames = new Set<string>(TOOL_NAMES);
  const toolRequests: AgentOutput["toolRequests"] = [];
  const toolRequestRegex = /TOOL_REQUEST\s+\[([^\]]+)\]:\s*(.+?)(?=\nTOOL_REQUEST|\nCONTEXT_UPDATE|\n##|\n\n|$)/gis;
  let toolMatch: RegExpExecArray | null;
  while ((toolMatch = toolRequestRegex.exec(rawResponse)) !== null) {
    const toolName = toolMatch[1].trim();
    const query = toolMatch[2].trim();
    if (validToolNames.has(toolName) && query) {
      toolRequests.push({
        toolName: toolName as AgentOutput["toolRequests"][number]["toolName"],
        query,
      });
    }
  }
```

Return `toolRequests` when present:

```ts
    toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/agents/definitions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/schemas/index.ts src/agents/definitions.ts tests/agents/definitions.test.ts
git commit -m "feat(tools): add research tool request types"
```

## Task 2: Tool Broker And Read-Only Adapters

**Files:**
- Create: `src/tools/adapters.ts`
- Create: `src/tools/broker.ts`
- Create: `tests/tools/broker.test.ts`

- [ ] **Step 1: Write broker tests**

Create `tests/tools/broker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ToolBroker } from "../../src/tools/broker.js";
import type { ToolAdapter, ToolBrokerRequest } from "../../src/tools/adapters.js";
import type { ToolUseConfig } from "../../src/types/index.js";

const config: ToolUseConfig = {
  enabled: true,
  allowlist: ["docs-fetch", "repo-search"],
  maxRequestsPerNode: 4,
  maxRequestsPerRound: 3,
  maxRequestsPerRun: 10,
  maxEvidenceItemsInPrompt: 5,
  autoRunReadOnly: true,
};

function fakeAdapter(toolName: "docs-fetch" | "repo-search"): ToolAdapter {
  return {
    toolName,
    readOnly: true,
    async execute(request: ToolBrokerRequest) {
      return {
        summary: `${toolName} summary for ${request.query}`,
        findings: [`finding:${request.query}`],
        decisionRelevance: [`relevance:${request.query}`],
        constraintsDiscovered: [`constraint:${request.query}`],
        risksDiscovered: [`risk:${request.query}`],
        openQuestions: [],
        sources: [
          {
            title: `${toolName} fixture`,
            url: `https://example.com/${toolName}`,
            retrievedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        limitations: ["fixture adapter"],
        confidence: 0.75,
      };
    },
  };
}

describe("ToolBroker", () => {
  it("resolves allowlisted read-only requests into persisted requests and evidence", async () => {
    const broker = new ToolBroker({
      config,
      adapters: [fakeAdapter("docs-fetch"), fakeAdapter("repo-search")],
      now: () => "2026-05-02T00:00:00.000Z",
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      existingRequests: [],
      existingEvidence: [],
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
      ],
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].status).toBe("completed");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].summary).toContain("official Commander docs");
  });

  it("deduplicates semantically identical requests and records additional requesters", async () => {
    const broker = new ToolBroker({
      config,
      adapters: [fakeAdapter("docs-fetch")],
      now: () => "2026-05-02T00:00:00.000Z",
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      existingRequests: [],
      existingEvidence: [],
      requests: [
        {
          toolName: "docs-fetch",
          query: "Official Commander docs",
          requestedBy: "developer",
        },
        {
          toolName: "docs-fetch",
          query: " official commander docs ",
          requestedBy: "technical-writer",
        },
      ],
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].requestedBy).toBe("developer");
    expect(result.evidence[0].additionalRequesters).toEqual(["technical-writer"]);
  });

  it("skips disallowed or over-budget requests with persisted reasons", async () => {
    const broker = new ToolBroker({
      config: { ...config, maxRequestsPerRound: 1 },
      adapters: [fakeAdapter("docs-fetch")],
      now: () => "2026-05-02T00:00:00.000Z",
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      existingRequests: [],
      existingEvidence: [],
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
        {
          toolName: "repo-search",
          query: "buildAgentPrompt",
          requestedBy: "code-reviewer",
        },
      ],
    });

    expect(result.requests).toHaveLength(2);
    expect(result.requests[0].status).toBe("completed");
    expect(result.requests[1].status).toBe("skipped");
    expect(result.requests[1].reason).toContain("round budget");
  });

  it("skips all requests when tool use is disabled", async () => {
    const broker = new ToolBroker({
      config: { ...config, enabled: false },
      adapters: [fakeAdapter("docs-fetch")],
      now: () => "2026-05-02T00:00:00.000Z",
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      existingRequests: [],
      existingEvidence: [],
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
      ],
    });

    expect(result.requests[0].status).toBe("skipped");
    expect(result.requests[0].reason).toContain("disabled");
    expect(result.evidence).toEqual([]);
  });
});
```

- [ ] **Step 2: Run broker tests to verify failure**

Run:

```bash
npx vitest run tests/tools/broker.test.ts
```

Expected: FAIL with missing `src/tools/broker.js` module.

- [ ] **Step 3: Implement tool adapter contracts and local adapters**

Create `src/tools/adapters.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  AgentRole,
  ToolEvidenceSource,
  ToolName,
} from "../types/index.js";

export interface ToolBrokerRequest {
  toolName: ToolName;
  query: string;
  requestedBy: AgentRole;
  nodeId: string;
  roundNumber: number;
}

export interface ToolAdapterResult {
  summary: string;
  findings: string[];
  decisionRelevance: string[];
  constraintsDiscovered: string[];
  risksDiscovered: string[];
  openQuestions: string[];
  sources: ToolEvidenceSource[];
  limitations: string[];
  confidence: number;
}

export interface ToolAdapter {
  toolName: ToolName;
  readOnly: boolean;
  execute(request: ToolBrokerRequest): Promise<ToolAdapterResult>;
}

export function defaultToolAdapters(workingDirectory: string): ToolAdapter[] {
  return [
    createRepoSearchAdapter(workingDirectory),
    createRepoReadAdapter(workingDirectory),
    createPackageInfoAdapter(workingDirectory),
    createUnavailableWebAdapter("web-search"),
    createUnavailableWebAdapter("web-fetch"),
    createUnavailableWebAdapter("docs-fetch"),
  ];
}

function createRepoSearchAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "repo-search",
    readOnly: true,
    async execute(request) {
      const result = spawnSync("rg", ["-n", "--", request.query], {
        cwd: workingDirectory,
        encoding: "utf-8",
        timeout: 10_000,
        maxBuffer: 512 * 1024,
      });
      const output = result.stdout.trim();
      const lines = output ? output.split("\n").slice(0, 20) : [];
      return {
        summary: lines.length
          ? `Found ${lines.length} matching line(s) for "${request.query}".`
          : `No repo matches found for "${request.query}".`,
        findings: lines,
        decisionRelevance: lines.length
          ? ["Use these local patterns before inventing a new structure."]
          : ["No local pattern was found for this query."],
        constraintsDiscovered: [],
        risksDiscovered: result.error ? [`repo-search error: ${result.error.message}`] : [],
        openQuestions: lines.length ? [] : ["Confirm whether a different local query is needed."],
        sources: lines.map((line) => {
          const [path] = line.split(":");
          return {
            path,
            quote: line,
            retrievedAt: new Date().toISOString(),
          };
        }),
        limitations: ["Search is literal ripgrep output capped at 20 lines."],
        confidence: result.status === 0 ? 0.8 : 0.55,
      };
    },
  };
}

function createRepoReadAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "repo-read",
    readOnly: true,
    async execute(request) {
      const target = resolve(workingDirectory, request.query);
      const root = resolve(workingDirectory);
      if (!target.startsWith(root)) {
        return {
          summary: `Refused to read path outside working directory: ${request.query}`,
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: ["Requested path escapes the working directory."],
          openQuestions: ["Ask for a repo-relative path."],
          sources: [],
          limitations: ["repo-read is restricted to the configured working directory."],
          confidence: 0.2,
        };
      }
      const raw = await readFile(target, "utf-8");
      const snippet = raw.slice(0, 6000);
      return {
        summary: `Read ${request.query} (${raw.length} characters).`,
        findings: snippet.split("\n").slice(0, 80),
        decisionRelevance: ["Use the local file contents as current repo evidence."],
        constraintsDiscovered: [],
        risksDiscovered: raw.length > snippet.length ? ["File was truncated for prompt safety."] : [],
        openQuestions: [],
        sources: [
          {
            path: request.query,
            quote: snippet,
            retrievedAt: new Date().toISOString(),
          },
        ],
        limitations: ["File content is capped at 6000 characters."],
        confidence: 0.85,
      };
    },
  };
}

function createPackageInfoAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "package-info",
    readOnly: true,
    async execute(request) {
      const packagePath = join(workingDirectory, "package.json");
      const raw = await readFile(packagePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependencies = parsed.dependencies ?? {};
      const devDependencies = parsed.devDependencies ?? {};
      const version = dependencies[request.query] ?? devDependencies[request.query];
      return {
        summary: version
          ? `${request.query} is declared at ${version}.`
          : `${request.query} is not declared in package.json.`,
        findings: version ? [`${request.query}: ${version}`] : [],
        decisionRelevance: version
          ? ["Prefer APIs compatible with the declared local package range."]
          : ["Do not assume this package is available locally."],
        constraintsDiscovered: version ? [`Declared package range: ${version}`] : [],
        risksDiscovered: [],
        openQuestions: version ? [] : ["Decide whether adding a dependency is in scope."],
        sources: [
          {
            path: "package.json",
            retrievedAt: new Date().toISOString(),
          },
        ],
        limitations: ["This adapter only reads local package.json declarations."],
        confidence: 0.8,
      };
    },
  };
}

function createUnavailableWebAdapter(toolName: ToolName): ToolAdapter {
  return {
    toolName,
    readOnly: true,
    async execute(request) {
      return {
        summary: `${toolName} adapter is not configured in this environment.`,
        findings: [],
        decisionRelevance: [],
        constraintsDiscovered: [],
        risksDiscovered: [`${toolName} could not fetch external evidence.`],
        openQuestions: [`Configure a ${toolName} adapter to answer: ${request.query}`],
        sources: [],
        limitations: ["External web adapters are pluggable and not enabled by the local fallback."],
        confidence: 0.1,
      };
    },
  };
}
```

- [ ] **Step 4: Implement `ToolBroker`**

Create `src/tools/broker.ts`:

```ts
import { nanoid } from "nanoid";
import type {
  AgentRole,
  ParsedToolRequest,
  ToolEvidence,
  ToolName,
  ToolRequest,
  ToolUseConfig,
} from "../types/index.js";
import type { ToolAdapter, ToolBrokerRequest } from "./adapters.js";

export interface IncomingToolRequest extends ParsedToolRequest {
  requestedBy: AgentRole;
}

export interface ResolveRoundRequestsInput {
  nodeId: string;
  roundNumber: number;
  requests: IncomingToolRequest[];
  existingRequests: ToolRequest[];
  existingEvidence: ToolEvidence[];
}

export interface ResolveRoundRequestsResult {
  requests: ToolRequest[];
  evidence: ToolEvidence[];
}

export interface ToolBrokerConfig {
  config: ToolUseConfig;
  adapters: ToolAdapter[];
  now?: () => string;
}

export class ToolBroker {
  private readonly config: ToolUseConfig;
  private readonly adapters: Map<ToolName, ToolAdapter>;
  private readonly now: () => string;

  constructor(options: ToolBrokerConfig) {
    this.config = options.config;
    this.adapters = new Map(options.adapters.map((adapter) => [adapter.toolName, adapter]));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async resolveRoundRequests(input: ResolveRoundRequestsInput): Promise<ResolveRoundRequestsResult> {
    const grouped = this.groupRequests(input.requests);
    const requests: ToolRequest[] = [];
    const evidence: ToolEvidence[] = [];
    let runnableThisRound = 0;
    const usedThisNode = input.existingRequests.filter((request) => request.nodeId === input.nodeId).length;
    const usedThisRun = input.existingRequests.length;

    for (const group of grouped) {
      const first = group[0];
      const request = this.createRequest(first, input.nodeId, input.roundNumber);
      requests.push(request);

      const skipReason = this.skipReason(first, runnableThisRound, usedThisNode + requests.length - 1, usedThisRun + requests.length - 1);
      if (skipReason) {
        request.status = "skipped";
        request.reason = skipReason;
        request.completedAt = this.now();
        continue;
      }

      const existing = this.findExistingEvidence(input.existingEvidence, first);
      if (existing) {
        request.status = "skipped";
        request.reason = "Equivalent evidence already exists.";
        request.completedAt = this.now();
        existing.additionalRequesters = mergeRequesters(existing, group.slice(1).map((item) => item.requestedBy));
        continue;
      }

      runnableThisRound += 1;
      request.status = "running";
      const adapter = this.adapters.get(first.toolName);
      try {
        const brokerRequest: ToolBrokerRequest = {
          toolName: first.toolName,
          query: first.query,
          requestedBy: first.requestedBy,
          nodeId: input.nodeId,
          roundNumber: input.roundNumber,
        };
        const result = await adapter!.execute(brokerRequest);
        request.status = "completed";
        request.completedAt = this.now();
        evidence.push({
          id: `evidence-${nanoid(10)}`,
          requestId: request.id,
          toolName: first.toolName,
          query: first.query,
          requestedBy: first.requestedBy,
          additionalRequesters: mergeRequesters(undefined, group.slice(1).map((item) => item.requestedBy)),
          nodeId: input.nodeId,
          roundNumber: input.roundNumber,
          summary: result.summary,
          findings: result.findings,
          decisionRelevance: result.decisionRelevance,
          constraintsDiscovered: result.constraintsDiscovered,
          risksDiscovered: result.risksDiscovered,
          openQuestions: result.openQuestions,
          sources: result.sources,
          limitations: result.limitations,
          confidence: result.confidence,
          createdAt: this.now(),
        });
      } catch (error) {
        request.status = "failed";
        request.reason = error instanceof Error ? error.message : String(error);
        request.completedAt = this.now();
      }
    }

    return { requests, evidence };
  }

  private groupRequests(requests: IncomingToolRequest[]): IncomingToolRequest[][] {
    const groups = new Map<string, IncomingToolRequest[]>();
    for (const request of requests) {
      const key = requestKey(request.toolName, request.query);
      const existing = groups.get(key);
      if (existing) existing.push(request);
      else groups.set(key, [request]);
    }
    return [...groups.values()];
  }

  private createRequest(
    request: IncomingToolRequest,
    nodeId: string,
    roundNumber: number
  ): ToolRequest {
    return {
      id: `request-${nanoid(10)}`,
      toolName: request.toolName,
      query: request.query,
      requestedBy: request.requestedBy,
      nodeId,
      roundNumber,
      status: "pending",
      createdAt: this.now(),
    };
  }

  private skipReason(
    request: IncomingToolRequest,
    runnableThisRound: number,
    usedThisNode: number,
    usedThisRun: number
  ): string | undefined {
    if (!this.config.enabled) return "Tool use is disabled.";
    if (!this.config.allowlist.includes(request.toolName)) return `Tool "${request.toolName}" is not allowlisted.`;
    if (!request.query.trim()) return "Tool query is empty.";
    if (runnableThisRound >= this.config.maxRequestsPerRound) return "Tool round budget exhausted.";
    if (usedThisNode >= this.config.maxRequestsPerNode) return "Tool node budget exhausted.";
    if (usedThisRun >= this.config.maxRequestsPerRun) return "Tool run budget exhausted.";
    const adapter = this.adapters.get(request.toolName);
    if (!adapter) return `No adapter registered for "${request.toolName}".`;
    if (!adapter.readOnly || !this.config.autoRunReadOnly) return `Tool "${request.toolName}" is not approved for automatic read-only execution.`;
    return undefined;
  }

  private findExistingEvidence(
    evidence: ToolEvidence[],
    request: IncomingToolRequest
  ): ToolEvidence | undefined {
    return evidence.find((item) => requestKey(item.toolName, item.query) === requestKey(request.toolName, request.query));
  }
}

function requestKey(toolName: ToolName, query: string): string {
  return `${toolName}:${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function mergeRequesters(existing: ToolEvidence | undefined, requesters: AgentRole[]): AgentRole[] {
  return [...new Set([...(existing?.additionalRequesters ?? []), ...requesters])];
}
```

- [ ] **Step 5: Run broker tests**

Run:

```bash
npx vitest run tests/tools/broker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/adapters.ts src/tools/broker.ts tests/tools/broker.test.ts
git commit -m "feat(tools): add research tool broker"
```

## Task 3: Tool Evidence Rendering And Persona Prompts

**Files:**
- Create: `src/tools/render.ts`
- Create: `tests/tools/render.test.ts`
- Modify: `src/agents/definitions.ts`
- Modify: `tests/agents/definitions.test.ts`

- [ ] **Step 1: Write rendering and prompt tests**

Create `tests/tools/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderToolEvidenceForPrompt, rollupToolEvidence } from "../../src/tools/render.js";
import type { ToolEvidence } from "../../src/types/index.js";

const evidence: ToolEvidence = {
  id: "evidence-1",
  requestId: "request-1",
  toolName: "docs-fetch",
  query: "official Commander docs",
  requestedBy: "developer",
  additionalRequesters: ["technical-writer"],
  nodeId: "node-1",
  roundNumber: 1,
  summary: "Commander supports custom option processors.",
  findings: ["Repeatable options can collect values."],
  decisionRelevance: ["Use Commander option processors instead of custom argv parsing."],
  constraintsDiscovered: ["Parser must preserve previous values."],
  risksDiscovered: ["Local wrapper still needs a regression test."],
  openQuestions: ["Confirm local helper behavior."],
  sources: [
    {
      title: "Commander docs",
      url: "https://example.com/commander",
      retrievedAt: "2026-05-02T00:00:00.000Z",
    },
  ],
  limitations: ["Fixture source."],
  confidence: 0.8,
  createdAt: "2026-05-02T00:00:01.000Z",
};

describe("tool evidence rendering", () => {
  it("renders compact decision-complete evidence", () => {
    const rendered = renderToolEvidenceForPrompt([evidence], 5);

    expect(rendered).toContain("## Tool Evidence");
    expect(rendered).toContain("Commander supports custom option processors.");
    expect(rendered).toContain("Decision relevance");
    expect(rendered).toContain("Parser must preserve previous values.");
    expect(rendered).toContain("Commander docs");
    expect(rendered).toContain("Limitations");
  });

  it("rolls evidence into compact debate fields", () => {
    const rollup = rollupToolEvidence([evidence]);

    expect(rollup.evidenceFindings).toEqual(["Repeatable options can collect values."]);
    expect(rollup.evidenceConstraints).toEqual(["Parser must preserve previous values."]);
    expect(rollup.evidenceRisks).toEqual(["Local wrapper still needs a regression test."]);
    expect(rollup.evidenceOpenQuestions).toEqual(["Confirm local helper behavior."]);
  });
});
```

Add this test to `describe("buildAgentPrompt", ...)` in `tests/agents/definitions.test.ts`:

```ts
  it("renders tool request instructions and compact tool evidence", () => {
    const { system, user } = buildAgentPrompt(AGENT_DEFINITIONS["developer"], {
      priorRoundsHistory: [],
      currentRoundSoFar: [],
      phase: "implementation",
      roundNumber: 1,
      context: {
        originalIntent: "Add tool support",
        ancestorSummaries: [],
        toolEvidence: [
          {
            id: "evidence-1",
            requestId: "request-1",
            toolName: "repo-search",
            query: "buildAgentPrompt",
            requestedBy: "developer",
            additionalRequesters: [],
            nodeId: "node-1",
            roundNumber: 1,
            summary: "buildAgentPrompt renders context sections.",
            findings: ["Context sections are joined before the turn instruction."],
            decisionRelevance: ["Render tool evidence as another context section."],
            constraintsDiscovered: ["Keep prompts compact."],
            risksDiscovered: ["Do not treat requests as evidence."],
            openQuestions: [],
            sources: [{ path: "src/agents/definitions.ts", retrievedAt: "2026-05-02T00:00:00.000Z" }],
            limitations: ["Fixture evidence."],
            confidence: 0.8,
            createdAt: "2026-05-02T00:00:01.000Z",
          },
        ],
      },
    });

    expect(system).toContain("## Tool Requests");
    expect(system).toContain("TOOL_REQUEST [tool-name]: specific query or target");
    expect(user).toContain("## Tool Evidence");
    expect(user).toContain("buildAgentPrompt renders context sections.");
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run tests/tools/render.test.ts tests/agents/definitions.test.ts
```

Expected: FAIL with missing renderer and missing prompt evidence.

- [ ] **Step 3: Implement evidence renderer**

Create `src/tools/render.ts`:

```ts
import type { ToolEvidence } from "../types/index.js";

export interface ToolEvidenceRollup {
  evidenceFindings: string[];
  evidenceConstraints: string[];
  evidenceRisks: string[];
  evidenceOpenQuestions: string[];
}

export function renderToolEvidenceForPrompt(
  evidence: ToolEvidence[] | undefined,
  maxItems: number
): string {
  const items = (evidence ?? []).slice(-Math.max(0, maxItems));
  if (items.length === 0) return "";

  const lines = ["## Tool Evidence", ""];
  for (const item of items) {
    lines.push(`[${item.toolName}] ${item.query}`);
    lines.push(`Requested by: ${[item.requestedBy, ...item.additionalRequesters].join(", ")}`);
    lines.push(`Summary: ${item.summary}`);
    appendList(lines, "Findings", item.findings);
    appendList(lines, "Decision relevance", item.decisionRelevance);
    appendList(lines, "Constraints", item.constraintsDiscovered);
    appendList(lines, "Risks", item.risksDiscovered);
    appendList(lines, "Open questions", item.openQuestions);
    appendList(
      lines,
      "Sources",
      item.sources.map((source) => {
        const label = source.title ?? source.path ?? source.url ?? "source";
        const locator = source.url ?? source.path ?? "";
        return `${label}${locator ? ` (${locator})` : ""}, retrieved ${source.retrievedAt}`;
      })
    );
    appendList(lines, "Limitations", item.limitations);
    lines.push(`Confidence: ${item.confidence.toFixed(2)}`, "");
  }
  return lines.join("\n").trim();
}

export function rollupToolEvidence(evidence: ToolEvidence[] | undefined): ToolEvidenceRollup {
  const items = evidence ?? [];
  return {
    evidenceFindings: uniqueFlat(items.flatMap((item) => item.findings)).slice(-8),
    evidenceConstraints: uniqueFlat(items.flatMap((item) => item.constraintsDiscovered)).slice(-8),
    evidenceRisks: uniqueFlat(items.flatMap((item) => item.risksDiscovered)).slice(-8),
    evidenceOpenQuestions: uniqueFlat(items.flatMap((item) => item.openQuestions)).slice(-8),
  };
}

function appendList(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push(`${label}:`);
  for (const value of values) lines.push(`- ${value}`);
}

function uniqueFlat(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
```

- [ ] **Step 4: Add shared tool request prompt block**

In `src/agents/definitions.ts`, add:

```ts
import { renderToolEvidenceForPrompt } from "../tools/render.js";
```

Add this constant near `SHARED_EVIDENCE_BOUNDARY`:

```ts
const SHARED_TOOL_REQUESTS = `## Tool Requests
You may request read-only tools when missing evidence materially affects this decision.

Use this exact format:
TOOL_REQUEST [tool-name]: specific query or target

Rules:
- Request tools only for evidence needed to advance this node.
- Prefer official docs, source files, standards, or authoritative references.
- Do not request tools for generic curiosity.
- Do not claim a fact from a tool unless it appears in Tool Evidence.
- If Tool Evidence conflicts with prior assumptions, update your position.
- If evidence is missing or limited, label the claim UNKNOWN.`;
```

Update `withBoundaries()` so the returned system prompt includes `${SHARED_TOOL_REQUESTS}` after `${SHARED_EVIDENCE_BOUNDARY}`:

```ts
${SHARED_EVIDENCE_BOUNDARY}

${SHARED_TOOL_REQUESTS}`;
```

In `buildAgentPrompt()`, create:

```ts
  const toolEvidenceSection = renderToolEvidenceForPrompt(
    input.context.toolEvidence,
    input.context.toolEvidence?.length ?? 0
  );
```

Add `toolEvidenceSection` to `contextSummary` after `domainFactsSection` and before `decompositionSection`.

- [ ] **Step 5: Update compact state initialization**

In `src/debate/engine.ts`, import:

```ts
import { rollupToolEvidence } from "../tools/render.js";
```

In `initialCompactState()`, compute:

```ts
  const evidenceRollup = rollupToolEvidence(context.toolEvidence);
```

Then add the rollup fields to the returned object:

```ts
    evidenceFindings: evidenceRollup.evidenceFindings,
    evidenceConstraints: evidenceRollup.evidenceConstraints,
    evidenceRisks: evidenceRollup.evidenceRisks,
    evidenceOpenQuestions: evidenceRollup.evidenceOpenQuestions,
```

In `renderCompactDebateState()`, add sections for evidence findings, constraints, risks, and open questions.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/tools/render.test.ts tests/agents/definitions.test.ts tests/debate/engine.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/render.ts src/agents/definitions.ts src/debate/engine.ts tests/tools/render.test.ts tests/agents/definitions.test.ts
git commit -m "feat(tools): render research evidence in prompts"
```

## Task 4: Debate Engine Tool Resolution

**Files:**
- Modify: `src/debate/engine.ts`
- Modify: `tests/debate/engine.test.ts`

- [ ] **Step 1: Write debate integration tests**

Add imports to `tests/debate/engine.test.ts`:

```ts
import type { ToolBroker, IncomingToolRequest } from "../../src/tools/broker.js";
```

Add this test block:

```ts
describe("DebateEngine tool integration", () => {
  it("resolves tool requests before moderator assessment and persists evidence in the transcript", async () => {
    const calls: IncomingToolRequest[][] = [];
    const fakeBroker: Pick<ToolBroker, "resolveRoundRequests"> = {
      async resolveRoundRequests(input) {
        calls.push(input.requests);
        return {
          requests: input.requests.map((request, idx) => ({
            id: `request-${idx + 1}`,
            toolName: request.toolName,
            query: request.query,
            requestedBy: request.requestedBy,
            nodeId: input.nodeId,
            roundNumber: input.roundNumber,
            status: "completed",
            createdAt: "2026-05-02T00:00:00.000Z",
            completedAt: "2026-05-02T00:00:01.000Z",
          })),
          evidence: [
            {
              id: "evidence-1",
              requestId: "request-1",
              toolName: "docs-fetch",
              query: "official docs",
              requestedBy: "developer",
              additionalRequesters: [],
              nodeId: input.nodeId,
              roundNumber: input.roundNumber,
              summary: "Official docs support the requested API.",
              findings: ["The API is documented."],
              decisionRelevance: ["Proceed with documented API."],
              constraintsDiscovered: ["Use documented parameters."],
              risksDiscovered: [],
              openQuestions: [],
              sources: [{ title: "Docs", url: "https://example.com", retrievedAt: "2026-05-02T00:00:00.000Z" }],
              limitations: [],
              confidence: 0.8,
              createdAt: "2026-05-02T00:00:01.000Z",
            },
          ],
        };
      },
    };

    const engine = new DebateEngine({
      openai: {} as OpenAI,
      reasoningModel: "test-model",
      maxDebateRounds: 1,
      maxBranching: 2,
      dryRun: true,
      nodeId: "node-tools",
      toolBroker: fakeBroker,
    });

    const transcript = await engine.runDebate(
      "implementation",
      {
        originalIntent: "Build with researched docs",
        ancestorSummaries: [],
      },
      ["developer"]
    );

    expect(calls[0]).toEqual([
      {
        toolName: "docs-fetch",
        query: "official docs for implementation",
        requestedBy: "developer",
      },
    ]);
    expect(transcript.toolRequests?.[0].status).toBe("completed");
    expect(transcript.contextUpdates.toolEvidence?.[0].summary).toContain("Official docs");
    expect(transcript.compactState?.evidenceFindings).toContain("The API is documented.");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/debate/engine.test.ts
```

Expected: FAIL because `DebateEngineConfig` does not accept `nodeId` or `toolBroker`, dry-run agents do not emit tool requests, and `DebateTranscript` has no `toolRequests`.

- [ ] **Step 3: Extend transcript and progress types**

In `src/types/index.ts`, extend `DebateTranscript`:

```ts
  toolRequests?: ToolRequest[];
```

In `src/debate/engine.ts`, import:

```ts
import type { ToolBroker, IncomingToolRequest } from "../tools/broker.js";
import { rollupToolEvidence } from "../tools/render.js";
```

Extend `DebateEngineConfig`:

```ts
  nodeId?: string;
  toolBroker?: Pick<ToolBroker, "resolveRoundRequests">;
```

Extend `DebateProgressEvent`:

```ts
  | { type: "tools_resolved"; round: number; requested: number; completed: number; skipped: number; failed: number }
```

Add private fields:

```ts
  private nodeId: string;
  private toolBroker?: Pick<ToolBroker, "resolveRoundRequests">;
```

Set them in the constructor:

```ts
    this.nodeId = config.nodeId ?? "unknown-node";
    this.toolBroker = config.toolBroker;
```

- [ ] **Step 4: Collect and resolve requests per round**

In `runDebate()`, create:

```ts
    const accumulatedToolRequests: ToolRequest[] = [];
```

Inside the agent loop, after parsing each response:

```ts
        const requestedTools: IncomingToolRequest[] = (parsed.toolRequests ?? []).map((request) => ({
          ...request,
          requestedBy: agentRole,
        }));
```

Create a round-level array before the agent loop:

```ts
      const roundToolRequests: IncomingToolRequest[] = [];
```

Push into it after `requestedTools` is created:

```ts
        roundToolRequests.push(...requestedTools);
```

After the agent loop and before `assessRound()`, add:

```ts
      if (this.toolBroker && roundToolRequests.length > 0) {
        const toolResult = await this.toolBroker.resolveRoundRequests({
          nodeId: this.nodeId,
          roundNumber: roundNum,
          requests: roundToolRequests,
          existingRequests: accumulatedToolRequests,
          existingEvidence: context.toolEvidence ?? [],
        });
        accumulatedToolRequests.push(...toolResult.requests);
        if (toolResult.evidence.length > 0) {
          context = {
            ...context,
            toolEvidence: [...(context.toolEvidence ?? []), ...toolResult.evidence],
          };
          mergeContextUpdates(accumulatedContextUpdates, {
            toolEvidence: context.toolEvidence,
          });
          compactState = {
            ...compactState,
            ...rollupToolEvidence(context.toolEvidence),
          };
        }
        this.onProgress?.({
          type: "tools_resolved",
          round: roundNum,
          requested: toolResult.requests.length,
          completed: toolResult.requests.filter((request) => request.status === "completed").length,
          skipped: toolResult.requests.filter((request) => request.status === "skipped").length,
          failed: toolResult.requests.filter((request) => request.status === "failed").length,
        });
      }
```

Change the `runDebate()` parameter from `context: NodeContext` to `initialContext: NodeContext`, then start the method with:

```ts
    let context = initialContext;
```

Update all transcript returns to include:

```ts
toolRequests: accumulatedToolRequests,
```

- [ ] **Step 5: Update merge helper and mock response**

In `mergeContextUpdates()`, add:

```ts
  if (source.toolEvidence?.length) {
    target.toolEvidence = source.toolEvidence;
  }
```

In `mockAgentResponse()`, add a deterministic tool request for the developer in implementation phase:

```ts
    if (round === 1 && phase === "implementation" && agent === "developer") {
      return `[DRY-RUN ${agent}] I need current docs before choosing the implementation detail.

TOOL_REQUEST [docs-fetch]: official docs for implementation`;
    }
```

- [ ] **Step 6: Include tool evidence in moderator prompt**

In `assessRound()`, render evidence:

```ts
    const toolEvidenceSection = renderToolEvidenceForPrompt(
      context.toolEvidence,
      context.toolEvidence?.length ?? 0
    );
```

Add it to the moderator user prompt after compact prior debate state:

```ts
## Current Tool Evidence
${toolEvidenceSection || "(none)"}
```

Update `MODERATOR_SYSTEM_PROMPT` with:

```md
## Tool Evidence
- Prefer positions backed by Tool Evidence over unsupported claims.
- Do not treat unsupported tool requests as evidence.
- If live alternatives depend on missing evidence, choose CONTINUE when another round could use available evidence to resolve them.
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx vitest run tests/debate/engine.test.ts tests/tools/render.test.ts tests/agents/definitions.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/debate/engine.ts tests/debate/engine.test.ts
git commit -m "feat(tools): resolve research requests during debate"
```

## Task 5: Orchestrator, Config, And CLI Flags

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/utils/cost.ts`
- Modify: `tests/orchestrator/orchestrator.test.ts`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tests/utils/cost.test.ts`

- [ ] **Step 1: Write config and CLI tests**

In `tests/orchestrator/orchestrator.test.ts`, add a dry-run test near existing orchestrator config tests:

```ts
  it("persists tool requests and evidence when tool use is enabled", async () => {
    const openai = {} as OpenAI;
    const orchestrator = new TreeOrchestrator(openai, {
      dryRun: true,
      maxDepth: 5,
      maxDebateRounds: 1,
      toolUse: {
        enabled: true,
        allowlist: ["docs-fetch"],
        maxRequestsPerNode: 4,
        maxRequestsPerRound: 2,
        maxRequestsPerRun: 10,
        maxEvidenceItemsInPrompt: 5,
        autoRunReadOnly: true,
      },
    });

    const state = await orchestrator.run("Build with tool research");
    const nodes = flattenTree(state.root);
    const nodeWithRequest = nodes.find((node) => (node.toolRequests ?? []).length > 0);

    expect(nodeWithRequest?.toolRequests?.[0].toolName).toBe("docs-fetch");
    expect(nodeWithRequest?.context.toolEvidence?.[0].summary).toContain("docs-fetch adapter");
  });
```

If `flattenTree` does not exist in that test file, add:

```ts
function flattenTree(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap((child) => flattenTree(child))];
}
```

In `tests/cli/cli.test.ts`, add a help assertion:

```ts
  it("documents tool-use flags", async () => {
    const result = await runCli(["run", "--help"]);

    expect(result.stdout).toContain("--tools <tools>");
    expect(result.stdout).toContain("--no-tools");
  });
```

In `tests/utils/cost.test.ts`, add a default config assertion if a config normalization test exists. If it does not, skip cost changes in tests and verify with typecheck in Step 5.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run tests/orchestrator/orchestrator.test.ts tests/cli/cli.test.ts
```

Expected: FAIL because `RunConfig.toolUse`, CLI flags, and orchestrator broker wiring do not exist.

- [ ] **Step 3: Add default tool config**

In `src/orchestrator/orchestrator.ts`, import:

```ts
import { ToolBroker } from "../tools/broker.js";
import { defaultToolAdapters } from "../tools/adapters.js";
```

Add to `DEFAULT_RUN_CONFIG`:

```ts
  toolUse: {
    enabled: false,
    allowlist: [],
    maxRequestsPerNode: 6,
    maxRequestsPerRound: 4,
    maxRequestsPerRun: 30,
    maxEvidenceItemsInPrompt: 8,
    autoRunReadOnly: true,
  },
```

Add a private broker field:

```ts
  private toolBroker?: ToolBroker;
```

In the constructor, after `this.sketcher = ...`, add:

```ts
    this.toolBroker = this.config.toolUse.enabled
      ? new ToolBroker({
          config: this.config.toolUse,
          adapters: defaultToolAdapters(this.config.workingDirectory),
        })
      : undefined;
```

Repeat that broker setup in `resume()` after config normalization.

When constructing `DebateEngine`, add:

```ts
      nodeId: node.id,
      toolBroker: this.toolBroker,
```

After `node.debate = transcript;`, persist requests/evidence:

```ts
    if (transcript.toolRequests?.length) {
      node.toolRequests = [...(node.toolRequests ?? []), ...transcript.toolRequests];
    }
    if (transcript.contextUpdates.toolEvidence?.length) {
      node.context.toolEvidence = transcript.contextUpdates.toolEvidence;
    }
```

When creating branched and consensus child contexts, ensure tool evidence propagates through the existing context spread. No special child merge is needed beyond not deleting `toolEvidence`.

- [ ] **Step 4: Add CLI flags and parser**

In `src/cli/index.ts`, add helpers near `collectValues()`:

```ts
function parseToolAllowlist(value: string): RunConfig["toolUse"]["allowlist"] {
  const requested = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (requested.includes("all-readonly")) {
    return ["web-search", "web-fetch", "docs-fetch", "repo-search", "repo-read", "package-info"];
  }
  const valid = new Set(["web-search", "web-fetch", "docs-fetch", "repo-search", "repo-read", "package-info"]);
  const invalid = requested.filter((item) => !valid.has(item));
  if (invalid.length > 0) {
    throw new Error(`Unknown tool(s): ${invalid.join(", ")}`);
  }
  return requested as RunConfig["toolUse"]["allowlist"];
}
```

Add run command options after `--ground-truth`:

```ts
  .option("--tools <tools>", "Enable read-only research tools (comma-separated or all-readonly)")
  .option("--no-tools", "Disable agent-requested research tools")
```

Inside the run action, after verification config setup:

```ts
    let toolAllowlist: RunConfig["toolUse"]["allowlist"] = [];
    if (opts.tools) {
      try {
        toolAllowlist = parseToolAllowlist(opts.tools);
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    }
```

Add to `config`:

```ts
      toolUse: {
        ...DEFAULT_RUN_CONFIG.toolUse,
        enabled: Boolean(opts.tools),
        allowlist: toolAllowlist,
      },
```

In the startup print section:

```ts
    if (config.toolUse?.enabled) console.log(chalk.cyan(`Tools: ${config.toolUse.allowlist.join(", ")}`));
```

In `printDebateProgress()`, add a case for `tools_resolved`:

```ts
    case "tools_resolved":
      spinner.text = chalk.blue(
        `Resolved tools: ${event.completed} completed, ${event.skipped} skipped, ${event.failed} failed`
      );
      break;
```

Add the same `--tools` and `--no-tools` options to `resume`, with parsing and config override:

```ts
  .option("--tools <tools>", "Enable read-only research tools on resumed debate nodes")
  .option("--no-tools", "Disable agent-requested research tools on resume")
```

Then add to the resume orchestrator config:

```ts
      ...(opts.tools
        ? { toolUse: { ...DEFAULT_RUN_CONFIG.toolUse, enabled: true, allowlist: parseToolAllowlist(opts.tools) } }
        : {}),
      ...(opts.tools === false ? { toolUse: { ...DEFAULT_RUN_CONFIG.toolUse, enabled: false, allowlist: [] } } : {}),
```

- [ ] **Step 5: Update cost utility if required by types**

Run:

```bash
npm run typecheck
```

Expected: FAIL if `RunConfig` construction sites need `toolUse`.

For each failing test fixture or config object, add:

```ts
toolUse: {
  enabled: false,
  allowlist: [],
  maxRequestsPerNode: 6,
  maxRequestsPerRound: 4,
  maxRequestsPerRun: 30,
  maxEvidenceItemsInPrompt: 8,
  autoRunReadOnly: true,
},
```

Use `DEFAULT_RUN_CONFIG.toolUse` in production code where possible. Use explicit object literals in tests that do not import `DEFAULT_RUN_CONFIG`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/orchestrator/orchestrator.test.ts tests/cli/cli.test.ts tests/debate/engine.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator/orchestrator.ts src/cli/index.ts src/utils/cost.ts tests/orchestrator/orchestrator.test.ts tests/cli/cli.test.ts tests/utils/cost.test.ts
git commit -m "feat(tools): wire research tools into runs"
```

## Task 6: Saved-Run UI Visibility

**Files:**
- Modify: `src/ui/inspector.ts`
- Modify: `src/ui/run-summary.ts`
- Modify: `src/ui/page.ts`
- Modify: `tests/ui/inspector.test.ts`
- Modify: `tests/ui/run-summary.test.ts`
- Modify: `tests/ui/page.test.ts`

- [ ] **Step 1: Write UI model tests**

In `tests/ui/inspector.test.ts`, add `toolEvidence` to the shared `context` fixture:

```ts
  toolEvidence: [
    {
      id: "evidence-1",
      requestId: "request-1",
      toolName: "repo-search",
      query: "buildInspector",
      requestedBy: "developer",
      additionalRequesters: [],
      nodeId: "node-scored",
      roundNumber: 1,
      summary: "Inspector builds serializable view models.",
      findings: ["Context is passed through."],
      decisionRelevance: ["Show tool evidence in the context tab."],
      constraintsDiscovered: ["Keep UI data serializable."],
      risksDiscovered: [],
      openQuestions: [],
      sources: [{ path: "src/ui/inspector.ts", retrievedAt: "2026-05-02T00:00:00.000Z" }],
      limitations: ["Fixture evidence."],
      confidence: 0.8,
      createdAt: "2026-05-02T00:00:01.000Z",
    },
  ],
```

In `scoredNode()`, add:

```ts
    toolRequests: overrides.toolRequests ?? [
      {
        id: "request-1",
        toolName: "repo-search",
        query: "buildInspector",
        requestedBy: "developer",
        nodeId: "node-scored",
        roundNumber: 1,
        status: "completed",
        createdAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:00:01.000Z",
      },
    ],
```

Add assertions to the first inspector test:

```ts
    expect(inspector.tools.requestCount).toBe(1);
    expect(inspector.tools.evidenceCount).toBe(1);
    expect(inspector.tools.requests[0].query).toBe("buildInspector");
    expect(inspector.tools.evidence[0].summary).toContain("serializable view models");
```

In `tests/ui/run-summary.test.ts`, add a fixture assertion that summary includes tool counts:

```ts
expect(summary.toolRequestCount).toBeGreaterThanOrEqual(0);
expect(summary.toolEvidenceCount).toBeGreaterThanOrEqual(0);
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
npx vitest run tests/ui/inspector.test.ts tests/ui/run-summary.test.ts
```

Expected: FAIL because view models do not expose `tools`, `toolRequestCount`, or `toolEvidenceCount`.

- [ ] **Step 3: Extend inspector view model**

In `src/ui/inspector.ts`, import tool types:

```ts
  ToolEvidence,
  ToolRequest,
```

Extend `InspectorViewModel`:

```ts
  tools: {
    requestCount: number;
    evidenceCount: number;
    requests: ToolRequest[];
    evidence: ToolEvidence[];
  };
```

In `buildInspector()`, add:

```ts
    tools: {
      requestCount: node.toolRequests?.length ?? 0,
      evidenceCount: node.context.toolEvidence?.length ?? 0,
      requests: node.toolRequests ?? [],
      evidence: node.context.toolEvidence ?? [],
    },
```

- [ ] **Step 4: Extend run summary**

In `src/ui/run-summary.ts`, extend `RunSummary`:

```ts
  toolRequestCount: number;
  toolEvidenceCount: number;
```

In `summarizeRun()`, compute:

```ts
  const allNodes = flattenNodes(run.root);
```

Add to return:

```ts
    toolRequestCount: allNodes.reduce((count, node) => count + (node.toolRequests?.length ?? 0), 0),
    toolEvidenceCount: allNodes.reduce((count, node) => count + (node.context.toolEvidence?.length ?? 0), 0),
```

Add helper:

```ts
function flattenNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap((child) => flattenNodes(child))];
}
```

- [ ] **Step 5: Add browser rendering**

In `src/ui/page.ts`, find the inspector context rendering function. Add a `Tool Evidence` subsection that renders:

```js
const tools = selectedInspector.tools || { requests: [], evidence: [] };
const toolEvidenceHtml = tools.evidence.map((item) => `
  <div class="context-block">
    <h4>${escapeHtml(item.toolName)}: ${escapeHtml(item.query)}</h4>
    <p>${escapeHtml(item.summary)}</p>
    ${renderList("Findings", item.findings)}
    ${renderList("Decision relevance", item.decisionRelevance)}
    ${renderList("Constraints", item.constraintsDiscovered)}
    ${renderList("Risks", item.risksDiscovered)}
    ${renderList("Open questions", item.openQuestions)}
    ${renderList("Limitations", item.limitations)}
  </div>
`).join("");
```

Also render skipped and failed requests:

```js
const toolRequestsHtml = tools.requests.map((request) => `
  <li>${escapeHtml(request.toolName)}: ${escapeHtml(request.query)} — ${escapeHtml(request.status)}${request.reason ? ` (${escapeHtml(request.reason)})` : ""}</li>
`).join("");
```

Use existing helper names if `page.ts` already has equivalent escape/list functions.

- [ ] **Step 6: Run UI tests**

Run:

```bash
npx vitest run tests/ui/inspector.test.ts tests/ui/run-summary.test.ts tests/ui/page.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/inspector.ts src/ui/run-summary.ts src/ui/page.ts tests/ui/inspector.test.ts tests/ui/run-summary.test.ts tests/ui/page.test.ts
git commit -m "feat(ui): show research tool evidence"
```

## Task 7: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update README**

In `README.md`, add a feature bullet near existing ground-truth/evidence bullets:

```md
- **Agent-requested research tools** — personas can request allowlisted read-only tools during debate; CTO resolves them through a broker and feeds compact evidence back into the moderator and later rounds.
```

Add CLI examples near the run command examples:

```md
npx tsx src/cli/index.ts run "Design an integration against current vendor docs" --tools docs-fetch,web-search
npx tsx src/cli/index.ts run "Use local repo patterns before proposing changes" --tools repo-search,repo-read,package-info
```

Add a section near ground truth:

```md
### Agent-Requested Research Tools

Use `--tools` when agents need fresh public evidence or local repo evidence during debate:

```bash
cto run "Choose the current Stripe Checkout integration shape" --tools docs-fetch,web-search
cto run "Follow local CLI option patterns" --tools repo-search,repo-read,package-info
```

Tools are read-only and orchestrator-mediated. Agents emit `TOOL_REQUEST [tool-name]: query`; CTO validates the request, applies budgets, resolves allowlisted tools, and stores `ToolRequest` and `ToolEvidence` records in saved state. Tool evidence is compacted into later agent prompts and the moderator prompt, while skipped or failed requests remain visible for audit.
```

- [ ] **Step 2: Update architecture docs**

In `docs/architecture.md`, add the tool loop to the end-to-end flow after each agent round and before moderator assessment:

```md
    D --> T[Resolve agent-requested\nread-only tools]
    T --> E[Moderator assesses\ntranscript + evidence]
```

Add a new section:

```md
## Agent-Requested Research Tools

Personas may request read-only tools using `TOOL_REQUEST [tool-name]: query` in their debate response. The DebateEngine collects requests after every agent has spoken, then calls the ToolBroker once before moderator assessment. The broker validates allowlists and budgets, executes read-only adapters, deduplicates equivalent requests, and persists both requests and evidence.

Tool evidence is rendered as compact decision-grade context: findings, decision relevance, discovered constraints, risks, open questions, sources, limitations, and confidence. The full structured evidence remains in saved run state and the saved-run UI.
```

- [ ] **Step 3: Update agent guidance**

In `AGENTS.md` and `CLAUDE.md`, add a concise note in the Current Status or Commands section:

```md
- Agent-requested research tools are available when enabled with `--tools`; personas may request read-only evidence during debate, but execution is mediated by the ToolBroker and persisted as tool evidence.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run docs:check
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/architecture.md AGENTS.md CLAUDE.md
git commit -m "docs: document agent-requested research tools"
```

## Task 8: Manual Smoke Test

**Files:**
- No source edits expected.

- [ ] **Step 1: Run dry-run tool smoke test**

Run:

```bash
npx tsx src/cli/index.ts run "Use current docs to choose a CLI option parsing approach" --dry-run --tools docs-fetch,repo-search --depth 5 --rounds 1 -y
```

Expected:

- CLI prints selected agents.
- At least one implementation node resolves a dry-run `docs-fetch` request.
- The run completes without crashing.
- Saved state includes `toolRequests` and `context.toolEvidence` on at least one node.

- [ ] **Step 2: Inspect saved run UI**

Run:

```bash
npx tsx src/cli/index.ts list
npx tsx src/cli/index.ts ui --no-open
```

Expected:

- Run list shows the completed smoke-test run.
- UI server starts and prints a local URL.
- Opening the URL shows tool request/evidence counts in the inspector for nodes that used tools.

- [ ] **Step 3: Commit smoke-test fixes if needed**

If the smoke test exposes fixes, stage only the concrete files changed by those fixes. For the expected smoke-test issue areas, use the narrowest applicable command:

```bash
git add src/debate/engine.ts src/orchestrator/orchestrator.ts src/ui/page.ts tests/debate/engine.test.ts tests/orchestrator/orchestrator.test.ts tests/ui/page.test.ts
git commit -m "fix(tools): address research tool smoke test issues"
```

If no fixes are needed, do not create a commit.

## Final Verification

Run:

```bash
npm test
```

Expected: PASS, including `npm run docs:check` and all Vitest suites.

Check final diff:

```bash
git status --short
git log --oneline -8
```

Expected:

- Only intentional files are modified or committed.
- Recent commits include the task commits above.

## Self-Review Notes

Spec coverage:

- Persona-requested tools: Tasks 1, 3, and 4.
- Broker-mediated execution: Tasks 2, 4, and 5.
- Read-only allowlist and budgets: Tasks 2 and 5.
- Compact but complete evidence: Tasks 3 and 4.
- Persistence: Tasks 4 and 5.
- Saved-run visibility: Task 6.
- Documentation and verification: Task 7.
- Manual smoke test: Task 8.

No live-web-dependent automated tests are required. The local fallback web adapters deliberately return low-confidence evidence explaining that external adapters are not configured; real external adapters can be added later behind the same `ToolAdapter` interface.
