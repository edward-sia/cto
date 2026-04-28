# Extendable Agent Personas + Task-Driven Panel Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 new domain-specialist agents and a `TaskAnalyzer` that selects the right panel and run mode (`implementation` vs `exploration`) from the intent before the tree starts.

**Architecture:** `TaskAnalyzer` runs one LLM call before the tree starts, storing `runMode` + `selectedAgents` on `RunState`. The orchestrator derives each phase's debate panel by filtering selected agents by their `primaryPhases`. At leaves, `implementation` runs go through `CodexExecutor` + `Judge`; `exploration` runs go through a new `Synthesizer` that produces a structured research document.

**Tech Stack:** TypeScript ESM (NodeNext modules), OpenAI SDK, Zod, vitest (tests), chalk/ora (CLI)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | Add 6 new roles, `TaskAnalysis` interface, `runMode?` + `selectedAgents?` on `RunState` |
| `src/agents/definitions.ts` | Modify | 6 new `AgentDefinition` entries + `AGENT_DISPLAY_NAMES` entries |
| `src/schemas/index.ts` | Modify | Add `TaskAnalysisSchema` |
| `src/analyzer/task-analyzer.ts` | Create | `TaskAnalyzer` class — one LLM call → `TaskAnalysis` |
| `src/synthesis/synthesizer.ts` | Create | `Synthesizer` class — one LLM call per leaf → synthesis document |
| `src/orchestrator/orchestrator.ts` | Modify | Add analyzer + synthesizer, dynamic panel selection, runMode branch |
| `src/cli/index.ts` | Modify | Display analysis result before tree, show exploration docs in `printResults` |
| `vitest.config.ts` | Create | Vitest config |
| `package.json` | Modify | Add vitest dev dependency + test scripts |
| `tests/analyzer/task-analyzer.test.ts` | Create | Unit tests for `TaskAnalyzer` |
| `tests/synthesis/synthesizer.test.ts` | Create | Unit tests for `Synthesizer` |

---

## Task 1: Set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

Expected: vitest appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` section add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Full scripts section after change:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsx src/cli/index.ts",
  "start": "node dist/cli/index.ts",
  "lint": "eslint src/",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
  },
});
```

- [ ] **Step 4: Verify vitest runs**

```bash
npm test
```

Expected: `No test files found` (exits 0 with vitest, may show a warning — acceptable).

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

## Task 2: Extend type system, agent definitions, and schema

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/agents/definitions.ts`
- Modify: `src/schemas/index.ts`

These three changes are bundled because TypeScript enforces the `Record<AgentRole, AgentDefinition>` exhaustiveness — adding roles to `AGENT_ROLES` without adding their definitions causes a compile error.

- [ ] **Step 1: Extend `AGENT_ROLES` in `src/types/index.ts`**

Replace the existing `AGENT_ROLES` const and `AGENT_DISPLAY_NAMES` record:

```ts
export const AGENT_ROLES = [
  "product-manager",
  "business-analyst",
  "tech-lead",
  "developer",
  "code-reviewer",
  "qa-engineer",
  "researcher",
  "data-engineer",
  "data-analyst",
  "security-engineer",
  "ml-engineer",
  "devops-engineer",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_DISPLAY_NAMES: Record<AgentRole, string> = {
  "product-manager": "Product Manager",
  "business-analyst": "Business Analyst",
  "tech-lead": "Tech Lead",
  "developer": "Developer",
  "code-reviewer": "Code Reviewer",
  "qa-engineer": "QA Engineer",
  "researcher": "Researcher",
  "data-engineer": "Data Engineer",
  "data-analyst": "Data Analyst",
  "security-engineer": "Security Engineer",
  "ml-engineer": "ML Engineer",
  "devops-engineer": "DevOps Engineer",
};
```

- [ ] **Step 2: Add `TaskAnalysis` interface to `src/types/index.ts`**

Add after the `AgentOutput` interface:

```ts
export interface TaskAnalysis {
  runMode: "implementation" | "exploration";
  selectedAgents: AgentRole[];
  rationale: string;
}
```

- [ ] **Step 3: Add `runMode` and `selectedAgents` to `RunState` in `src/types/index.ts`**

Both fields are optional so existing persisted run states (without them) remain loadable:

```ts
export interface RunState {
  id: string;
  config: RunConfig;
  intent: string;
  root: TreeNode;
  leafNodeIds: string[];
  rankedResults?: Array<{
    nodeId: string;
    path: string[];
    score: JudgeScore;
  }>;
  startedAt: string;
  completedAt?: string;
  totalTokensUsed: number;
  status: "running" | "completed" | "failed" | "paused";
  runMode?: "implementation" | "exploration";
  selectedAgents?: AgentRole[];
}
```

- [ ] **Step 4: Add 6 new `AgentDefinition` entries to `src/agents/definitions.ts`**

Add these entries to the `AGENT_DEFINITIONS` record (after the existing `"qa-engineer"` entry):

```ts
researcher: {
  role: "researcher",
  displayName: "Researcher",
  primaryPhases: ["requirements", "architecture"],
  contextContributions: ["prd"],
  systemPrompt: `You are the Researcher in a round-table software engineering debate.

## Your Role
You surface what is known, what is unknown, and what needs investigation. You reference prior art, benchmarks, and existing solutions.

## Your Responsibilities
- Identify gaps in current knowledge and flag assumptions that need validation
- Research and summarise relevant existing solutions, libraries, and patterns
- Evaluate feasibility: "Has this been done before? How well did it work?"
- Surface trade-offs from empirical evidence, not just theory
- Recommend investigation strategies for unknowns

## How You Contribute to Debates
- When you identify multiple valid research directions, PROPOSE ALTERNATIVES
- Challenge assumptions with evidence: "Studies show X, but your assumption is Y"
- Quantify unknowns: "This is a well-understood problem" vs "This is genuinely novel"
- Recommend spike tasks and proofs-of-concept when needed

## Output Format
1. **Known Ground**: What is well-understood about this problem
2. **Unknowns**: Key gaps that need investigation
3. **Prior Art**: Relevant existing solutions or research
4. **Alternatives** (if any): Different research directions worth exploring
5. **Recommendations**: Suggested investigation approach or spike

## Context Updates
CONTEXT_UPDATE [prd]: <research finding that clarifies a requirement or scope decision>

## Critical Rule
Only propose alternatives when research directions would lead to fundamentally different solutions — different technology stacks, different architectural paradigms, or different problem framings. Uncertainty about implementation details is NOT a branching point.`,
},

"data-engineer": {
  role: "data-engineer",
  displayName: "Data Engineer",
  primaryPhases: ["architecture", "implementation"],
  contextContributions: ["architectureDecisions", "implementationSpec"],
  systemPrompt: `You are the Data Engineer in a round-table software engineering debate.

## Your Role
You own the data layer: storage, pipelines, modelling, and query performance. If data moves or gets stored, you care about it.

## Your Responsibilities
- Design data models and schemas (relational, document, columnar)
- Define ETL/ELT pipeline architecture
- Choose storage systems appropriate to the access patterns (OLTP vs OLAP, SQL vs NoSQL)
- Identify data quality, freshness, and consistency requirements
- Design for scale: partitioning, indexing, archiving strategies
- Define data contracts between producers and consumers

## How You Contribute to Debates
- Challenge storage decisions when access patterns don't match the chosen system
- When there are legitimate architectural choices (streaming vs batch, normalised vs denormalised), PROPOSE ALTERNATIVES
- Quantify data volumes and query patterns to ground architectural decisions
- Flag schema decisions that will be expensive to change later

## Output Format
1. **Data Model Assessment**: Current state of the data design
2. **Storage Decisions**: System choices with justification
3. **Pipeline Design**: Data flow from source to destination
4. **Alternatives** (if any): Different data architecture approaches
5. **Risks**: Schema or pipeline decisions that could become bottlenecks

## Context Updates
CONTEXT_UPDATE [architecture-decision]: <data storage or pipeline decision — what was chosen and why>
CONTEXT_UPDATE [implementation-spec]: <specific schema design, indexing strategy, or pipeline step>

## Critical Rule
Only propose alternatives when storage or pipeline choices fundamentally change the architecture — batch vs streaming, relational vs document, data warehouse vs data lake. Library or ORM choices within the same paradigm should be resolved through debate.`,
},

"data-analyst": {
  role: "data-analyst",
  displayName: "Data Analyst",
  primaryPhases: ["requirements", "architecture"],
  contextContributions: ["acceptanceCriteria"],
  systemPrompt: `You are the Data Analyst in a round-table software engineering debate.

## Your Role
You define what data questions the system must answer and what outputs it must produce. You translate business goals into measurable metrics and data requirements.

## Your Responsibilities
- Define the metrics, KPIs, and analytical questions the system must support
- Specify report and dashboard requirements (dimensions, measures, filters)
- Validate that the data model supports the required analyses
- Define data quality standards: acceptable staleness, completeness thresholds
- Identify the audience for each output and their level of data literacy
- Write analytical acceptance criteria in testable terms

## How You Contribute to Debates
- Challenge data models that can't answer the required business questions
- When different analytical goals require incompatible data structures, PROPOSE ALTERNATIVES
- Quantify: "This report needs to refresh every 5 minutes" not "it should be fast"
- Ensure every metric has a clear definition, owner, and update cadence

## Output Format
1. **Analytical Requirements**: Key questions and metrics this system must answer
2. **Output Specifications**: Reports, dashboards, or API responses with field-level detail
3. **Data Quality Requirements**: Freshness, completeness, accuracy standards
4. **Alternatives** (if any): Different analytical approaches
5. **Gaps**: Requirements too vague to implement or test

## Context Updates
CONTEXT_UPDATE [acceptance-criteria]: <single measurable analytical requirement or metric definition>

## Critical Rule
Only propose alternatives when different analytical goals genuinely require incompatible data structures or processing approaches. Presentation differences (table vs chart) and minor metric variations are not branching points.`,
},

"security-engineer": {
  role: "security-engineer",
  displayName: "Security Engineer",
  primaryPhases: ["architecture", "implementation", "validation"],
  contextContributions: ["architectureDecisions", "acceptanceCriteria"],
  systemPrompt: `You are the Security Engineer in a round-table software engineering debate.

## Your Role
You own threat modelling, authentication, authorisation, data protection, and compliance. If it can be exploited, you care about it.

## Your Responsibilities
- Conduct threat modelling: identify attack surfaces, threat actors, and mitigations
- Design authentication and authorisation systems
- Ensure secrets, credentials, and sensitive data are handled correctly
- Identify compliance requirements (GDPR, SOC2, HIPAA) relevant to the system
- Review proposed architectures for security anti-patterns
- Define security acceptance criteria: penetration testing scope, audit logging requirements

## How You Contribute to Debates
- Flag security risks in proposed architectures with specific attack scenarios
- When security requirements force meaningfully different architectural approaches, PROPOSE ALTERNATIVES
- Raise compliance constraints that limit design choices
- Challenge "we'll add security later" thinking

## Output Format
1. **Threat Model**: Key attack surfaces and threat actors
2. **Security Requirements**: Auth/authz design, data protection, secrets management
3. **Compliance Constraints**: Relevant regulatory requirements
4. **Alternatives** (if any): Different security architectures with different trade-off profiles
5. **Non-Negotiables**: Security requirements that cannot be deferred

## Context Updates
CONTEXT_UPDATE [architecture-decision]: <security constraint or security design decision>
CONTEXT_UPDATE [acceptance-criteria]: <single security acceptance criterion or compliance requirement>

## Critical Rule
Only propose alternatives when security requirements genuinely force different architectural approaches — zero-trust vs perimeter, mTLS vs API keys, row-level vs application-level enforcement. Implementation details of a chosen approach are not branching points.`,
},

"ml-engineer": {
  role: "ml-engineer",
  displayName: "ML Engineer",
  primaryPhases: ["architecture", "implementation"],
  contextContributions: ["architectureDecisions", "implementationSpec"],
  systemPrompt: `You are the ML Engineer in a round-table software engineering debate.

## Your Role
You own ML model integration, inference infrastructure, training pipelines, and the operationalisation of ML systems.

## Your Responsibilities
- Select appropriate models and frameworks (fine-tuned vs foundation, open-source vs API)
- Design inference pipelines: batch vs real-time, latency vs throughput trade-offs
- Define training and evaluation infrastructure when custom models are needed
- Specify feature engineering and data preprocessing requirements
- Design prompt engineering and context management strategies for LLM-based systems
- Define ML acceptance criteria: accuracy thresholds, latency SLAs, drift detection

## How You Contribute to Debates
- Challenge requirements that are technically infeasible with current ML capabilities
- When there are legitimate model or architecture choices, PROPOSE ALTERNATIVES
- Quantify: "GPT-4 adds $X/1000 queries" not "it'll be expensive"
- Flag data requirements for fine-tuning or RAG that other agents may have missed

## Output Format
1. **Model Assessment**: Recommended approach (API vs local, which model, which framework)
2. **Infrastructure Design**: Inference and training pipeline architecture
3. **Alternatives** (if any): Different ML approaches with cost/accuracy/latency trade-offs
4. **Data Requirements**: Training data, embeddings, retrieval infrastructure
5. **Risks**: Model drift, prompt injection, latency, cost

## Context Updates
CONTEXT_UPDATE [architecture-decision]: <ML model or infrastructure decision — what was chosen and why>
CONTEXT_UPDATE [implementation-spec]: <specific model, framework, or pipeline implementation detail>

## Critical Rule
Only propose alternatives when model or architecture choices lead to fundamentally different systems — API-based vs local inference, RAG vs fine-tuning, real-time vs batch. Hyperparameter choices and prompt variations are not branching points.`,
},

"devops-engineer": {
  role: "devops-engineer",
  displayName: "DevOps Engineer",
  primaryPhases: ["architecture", "implementation", "validation"],
  contextContributions: ["architectureDecisions"],
  systemPrompt: `You are the DevOps Engineer in a round-table software engineering debate.

## Your Role
You own the delivery pipeline, infrastructure, and operational concerns. If it needs to be deployed, scaled, or observed, you care about it.

## Your Responsibilities
- Design CI/CD pipelines and deployment strategies (blue/green, canary, rolling)
- Choose infrastructure and orchestration (containers, Kubernetes, serverless, VMs)
- Define observability requirements: metrics, logs, traces, alerts
- Design for scalability and resilience: auto-scaling, circuit breakers, health checks
- Identify infrastructure costs and optimisation opportunities
- Ensure the architecture can be deployed, updated, and rolled back safely

## How You Contribute to Debates
- Challenge architectures that are operationally complex without proportionate benefit
- When deployment or infrastructure choices lead to different system architectures, PROPOSE ALTERNATIVES
- Quantify operational costs: "$X/month for this approach vs $Y for this one"
- Flag single points of failure and missing resilience mechanisms

## Output Format
1. **Infrastructure Assessment**: Current state of the deployment and operations design
2. **CI/CD Design**: Pipeline stages, deployment strategy, rollback approach
3. **Observability Plan**: What to instrument, alert on, and log
4. **Alternatives** (if any): Different infrastructure approaches with operational trade-offs
5. **Risks**: SPOF, scaling limits, cost surprises

## Context Updates
CONTEXT_UPDATE [architecture-decision]: <infrastructure or deployment decision — what was chosen and why>

## Critical Rule
Only propose alternatives when infrastructure choices lead to fundamentally different operational models — serverless vs containerised, multi-region vs single-region, managed vs self-hosted. Tool choices within the same paradigm (Kubernetes vs ECS for containers) should be resolved through debate.`,
},
```

- [ ] **Step 5: Add `TaskAnalysisSchema` to `src/schemas/index.ts`**

Add at the end of the file:

```ts
export const TaskAnalysisSchema = z.object({
  runMode: z.enum(["implementation", "exploration"]),
  selectedAgents: z.array(z.string()),
  rationale: z.string(),
});
```

Note: `selectedAgents` uses `z.string()` (consistent with how `proposedBy` is typed in `AlternativeSchema`). The `TaskAnalyzer` filters out invalid role strings after parsing.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: `0 errors`. If TypeScript complains about missing entries in `AGENT_DEFINITIONS`, ensure all 12 roles have a definition entry.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/agents/definitions.ts src/schemas/index.ts
git commit -m "feat: add 6 domain-specialist agent types and TaskAnalysis types"
```

---

## Task 3: Build `TaskAnalyzer`

**Files:**
- Create: `src/analyzer/task-analyzer.ts`
- Create: `tests/analyzer/task-analyzer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/analyzer/task-analyzer.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import OpenAI from "openai";
import { TaskAnalyzer } from "../../src/analyzer/task-analyzer.js";

function makeMockOpenAI(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { total_tokens: 100 },
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("TaskAnalyzer", () => {
  it("returns default panel in dry-run mode without calling OpenAI", async () => {
    const mockCreate = vi.fn();
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", true);

    const result = await analyzer.analyze("Build a REST API");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("developer");
    expect(result.selectedAgents).toContain("tech-lead");
  });

  it("parses valid LLM response into TaskAnalysis", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["product-manager", "tech-lead", "developer", "security-engineer"],
      rationale: "Auth task — security engineer selected",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Add OAuth2 authentication");

    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("security-engineer");
    expect(result.rationale).toBe("Auth task — security engineer selected");
  });

  it("falls back to default panel when LLM returns invalid JSON", async () => {
    const openai = makeMockOpenAI("not valid json at all");
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Build something");

    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("developer");
    expect(result.selectedAgents).toContain("tech-lead");
  });

  it("filters out hallucinated agent roles from LLM response", async () => {
    const response = JSON.stringify({
      runMode: "exploration",
      selectedAgents: ["researcher", "fake-agent", "data-analyst"],
      rationale: "Research task",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Investigate feasibility of GraphQL");

    expect(result.selectedAgents).toContain("researcher");
    expect(result.selectedAgents).toContain("data-analyst");
    expect(result.selectedAgents).not.toContain("fake-agent");
  });

  it("sets runMode to exploration for research intents", async () => {
    const response = JSON.stringify({
      runMode: "exploration",
      selectedAgents: ["researcher", "business-analyst"],
      rationale: "Pure research task — no implementation needed",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Research the best database for time-series data");

    expect(result.runMode).toBe("exploration");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: `Cannot find module '../../src/analyzer/task-analyzer.js'` or similar import error.

- [ ] **Step 3: Create `src/analyzer/task-analyzer.ts`**

```ts
import OpenAI from "openai";
import type { AgentRole, TaskAnalysis } from "../types/index.js";
import { AGENT_ROLES } from "../types/index.js";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
import { TaskAnalysisSchema } from "../schemas/index.js";
import { withRetry } from "../utils/retry.js";

const DEFAULT_ANALYSIS: TaskAnalysis = {
  runMode: "implementation",
  selectedAgents: ["product-manager", "tech-lead", "developer", "qa-engineer"],
  rationale: "Default panel (dry-run or analyzer fallback)",
};

const VALID_ROLES = new Set<string>(AGENT_ROLES);

export class TaskAnalyzer {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  async analyze(intent: string): Promise<TaskAnalysis> {
    if (this.dryRun) return DEFAULT_ANALYSIS;

    const agentDescriptions = AGENT_ROLES.map((role) => {
      const def = AGENT_DEFINITIONS[role];
      return `- "${role}": ${def.displayName} — participates in: ${def.primaryPhases.join(", ")}`;
    }).join("\n");

    const systemPrompt = `You are a task classifier for a software development orchestration system.
Given a development intent, select the appropriate agents and determine the run mode.

## Run Modes
- "implementation": The task produces code. Use for features, bug fixes, refactors, APIs, services.
- "exploration": The task produces a research document or analysis. Use for spikes, feasibility studies, data analysis, research questions.

## Available Agents
${agentDescriptions}

## Selection Rules
- Always include at least one agent per phase that the task will go through
- For implementation: always include "developer" and "tech-lead"
- For exploration: always include "researcher" or "data-analyst" as appropriate
- Omit agents with no relevance to the intent

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "runMode": "implementation" | "exploration",
  "selectedAgents": ["role-1", "role-2"],
  "rationale": "One sentence explaining the selection"
}`;

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Intent: ${intent}` },
          ],
          temperature: 0.2,
          max_tokens: 512,
        })
      );
      const content = response.choices[0]?.message?.content ?? "";
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const raw = TaskAnalysisSchema.parse(JSON.parse(jsonStr));
      const selectedAgents = raw.selectedAgents.filter((r) =>
        VALID_ROLES.has(r)
      ) as AgentRole[];
      return {
        runMode: raw.runMode,
        selectedAgents,
        rationale: raw.rationale,
      };
    } catch {
      console.warn("\nTaskAnalyzer: failed to parse response, using default panel");
      return DEFAULT_ANALYSIS;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/analyzer/task-analyzer.ts tests/analyzer/task-analyzer.test.ts
git commit -m "feat: add TaskAnalyzer — selects agent panel and run mode from intent"
```

---

## Task 4: Build `Synthesizer`

**Files:**
- Create: `src/synthesis/synthesizer.ts`
- Create: `tests/synthesis/synthesizer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/synthesis/synthesizer.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import OpenAI from "openai";
import { Synthesizer } from "../../src/synthesis/synthesizer.js";
import type { TreeNode } from "../../src/types/index.js";

function makeLeafNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "node-test123",
    parentId: null,
    depth: 4,
    phase: "validation",
    status: "completed",
    context: {
      originalIntent: "Investigate feasibility of GraphQL migration",
      ancestorSummaries: [],
    },
    children: [],
    branchLabel: "research",
    branchDescription: "Feasibility study",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockOpenAI(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { total_tokens: 300 },
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("Synthesizer", () => {
  it("returns dry-run document without calling OpenAI", async () => {
    const mockCreate = vi.fn();
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const synthesizer = new Synthesizer(openai, "gpt-4o", true);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.filesChanged).toHaveLength(0);
    expect(result.output).toContain("[DRY-RUN]");
  });

  it("calls OpenAI and returns synthesis document on success", async () => {
    const document =
      "## Research Questions\n- Is GraphQL migration feasible?\n\n## Key Findings\n- Yes, with caveats.";
    const openai = makeMockOpenAI(document);
    const synthesizer = new Synthesizer(openai, "gpt-4o", false);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(result.success).toBe(true);
    expect(result.output).toBe(document);
    expect(result.filesChanged).toHaveLength(0);
    expect(result.threadId).toMatch(/^synthesis-/);
  });

  it("returns failure result when OpenAI throws", async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("API timeout")),
        },
      },
    } as unknown as OpenAI;
    const synthesizer = new Synthesizer(openai, "gpt-4o", false);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(result.success).toBe(false);
    expect(result.output).toContain("API timeout");
  });

  it("includes ancestor summaries in the prompt when present", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "# Synthesis" } }],
      usage: { total_tokens: 100 },
    });
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const synthesizer = new Synthesizer(openai, "gpt-4o", false);

    await synthesizer.synthesize(
      makeLeafNode({
        context: {
          originalIntent: "Research caching strategies",
          ancestorSummaries: ["Round 1: Agents discussed Redis vs Memcached"],
        },
      })
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content as string;
    expect(userPrompt).toContain("Redis vs Memcached");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: `Cannot find module '../../src/synthesis/synthesizer.js'`

- [ ] **Step 3: Create `src/synthesis/synthesizer.ts`**

```ts
import OpenAI from "openai";
import type { TreeNode, CodexExecutionResult } from "../types/index.js";
import { withRetry } from "../utils/retry.js";

const SYSTEM_PROMPT = `You are a research synthesizer. Given a debate transcript and accumulated context from an exploration task, produce a structured document.

Use this exact format:

## Research Questions Addressed
[The questions or goals that were explored]

## Key Findings
[Concrete findings, conclusions, or insights from the debate]

## Open Questions
[Unresolved questions that need further investigation]

## Recommended Next Steps
[Actionable recommendations based on findings]`;

export class Synthesizer {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  async synthesize(node: TreeNode): Promise<CodexExecutionResult> {
    const start = Date.now();

    if (this.dryRun) {
      return {
        threadId: `synthesis-dry-${node.id}`,
        success: true,
        filesChanged: [],
        output: `[DRY-RUN] Synthesis document for: ${node.context.originalIntent}`,
        durationMs: 0,
      };
    }

    const { context, debate } = node;

    const sections: string[] = [
      `Original intent: ${context.originalIntent}`,
    ];
    if (context.prd) sections.push(`## PRD\n${context.prd}`);
    if (context.acceptanceCriteria?.length) {
      sections.push(`## Acceptance Criteria\n${context.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`);
    }
    if (context.ancestorSummaries.length) {
      sections.push(
        `## Prior Discussion\n${context.ancestorSummaries.map((s, i) => `### Level ${i}\n${s}`).join("\n")}`
      );
    }
    if (debate) sections.push(`## Debate Summary\n${debate.summary}`);

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: sections.join("\n\n") },
          ],
          temperature: 0.4,
          max_tokens: 2048,
        })
      );
      return {
        threadId: `synthesis-${node.id}`,
        success: true,
        filesChanged: [],
        output: response.choices[0]?.message?.content ?? "No synthesis produced.",
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        threadId: `synthesis-${node.id}`,
        success: false,
        filesChanged: [],
        output: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: `9 passed` (5 from Task 3 + 4 from Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/synthesis/synthesizer.ts tests/synthesis/synthesizer.test.ts
git commit -m "feat: add Synthesizer — produces structured document for exploration runs"
```

---

## Task 5: Wire `TaskAnalyzer` and `Synthesizer` into the orchestrator

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`

- [ ] **Step 1: Update imports in `src/orchestrator/orchestrator.ts`**

Add `TaskAnalysis` to the existing `import type { ... } from "../types/index.js"` block:

```ts
import type {
  TreeNode,
  NodeContext,
  TreePhase,
  RunConfig,
  RunState,
  AgentRole,
  Alternative,
  JudgeScore,
  TaskAnalysis,
} from "../types/index.js";
```

Add two new import statements after the existing imports:

```ts
import { TaskAnalyzer } from "../analyzer/task-analyzer.js";
import { Synthesizer } from "../synthesis/synthesizer.js";
import { AGENT_DEFINITIONS } from "../agents/definitions.js";
```

- [ ] **Step 2: Add `onAnalysisComplete` callback to `OrchestratorCallbacks`**

In the `OrchestratorCallbacks` interface, add:

```ts
onAnalysisComplete?: (analysis: TaskAnalysis) => void;
```

Full updated interface:

```ts
export interface OrchestratorCallbacks {
  onAnalysisComplete?: (analysis: TaskAnalysis) => void;
  onDebateProgress?: (nodeId: string, event: DebateProgressEvent) => void;
  onNodeCreated?: (node: TreeNode) => void;
  onBranching?: (parentId: string, alternatives: Alternative[]) => void;
  onLeafExecuting?: (nodeId: string) => void;
  onLeafScored?: (nodeId: string, score: JudgeScore) => void;
  onRunComplete?: (state: RunState) => void;
  onError?: (nodeId: string, error: Error) => void;
}
```

- [ ] **Step 3: Add `analyzer` and `synthesizer` fields to `TreeOrchestrator`**

In the class body, add after the existing `private judge: Judge;` line:

```ts
private analyzer: TaskAnalyzer;
private synthesizer: Synthesizer;
```

- [ ] **Step 4: Instantiate `TaskAnalyzer` and `Synthesizer` in the constructor**

In the constructor body, add after `this.judge = ...`:

```ts
this.analyzer = new TaskAnalyzer(openai, this.config.reasoningModel, this.config.dryRun);
this.synthesizer = new Synthesizer(openai, this.config.reasoningModel, this.config.dryRun);
```

- [ ] **Step 5: Call `analyzer.analyze()` at the start of `run()` and store results**

Replace the beginning of the `run()` method up to `await this.store.save(this.runState)`:

```ts
async run(intent: string): Promise<RunState> {
  const runId = `run-${nanoid(10)}`;

  const analysis = await this.analyzer.analyze(intent);
  this.callbacks.onAnalysisComplete?.(analysis);

  const root = this.createNode(null, 0, {
    originalIntent: intent,
    ancestorSummaries: [],
  });

  this.runState = {
    id: runId,
    config: this.config,
    intent,
    root,
    leafNodeIds: [],
    startedAt: new Date().toISOString(),
    totalTokensUsed: 0,
    status: "running",
    runMode: analysis.runMode,
    selectedAgents: analysis.selectedAgents,
  };

  await this.store.save(this.runState);
```

- [ ] **Step 6: Add `getAgentsForPhase()` method**

Add this private method to `TreeOrchestrator` (before `getPhaseForDepth`):

```ts
private getAgentsForPhase(phase: TreePhase): AgentRole[] {
  const selected = this.runState.selectedAgents ?? [];
  const agents = selected.filter(
    (role) => AGENT_DEFINITIONS[role].primaryPhases.includes(phase)
  );
  return agents.length > 0 ? agents : PHASE_AGENT_MAP[phase];
}
```

- [ ] **Step 7: Replace static `PHASE_AGENT_MAP[phase]` lookup in `processNode()`**

In `processNode()`, replace:

```ts
const agents = PHASE_AGENT_MAP[phase];
```

With:

```ts
const agents = this.getAgentsForPhase(phase);
```

- [ ] **Step 8: Add `synthesizeLeaves()` method**

Add this private method after `judgeLeaves()`:

```ts
private async synthesizeLeaves(node: TreeNode): Promise<void> {
  if (this.isLeaf(node)) {
    this.callbacks.onLeafExecuting?.(node.id);
    node.status = "executing";
    try {
      node.executionResult = await this.synthesizer.synthesize(node);
      node.status = "completed";
    } catch (error) {
      node.status = "completed";
      node.executionResult = {
        threadId: "error",
        success: false,
        filesChanged: [],
        output: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      };
      this.callbacks.onError?.(node.id, error instanceof Error ? error : new Error(String(error)));
    }
    await this.store.save(this.runState);
    return;
  }
  for (const child of node.children) {
    await this.synthesizeLeaves(child);
  }
}
```

- [ ] **Step 9: Branch on `runMode` for leaf dispatch in `run()`**

Replace the leaf execution block in `run()` (the three lines after `await this.processNode(root)`):

```ts
// Before:
this.runState.leafNodeIds = this.collectLeafIds(root);
await this.executeLeaves(root);
await this.judgeLeaves(root);
this.runState.rankedResults = this.rankResults(root);

// After:
this.runState.leafNodeIds = this.collectLeafIds(root);
if (this.runState.runMode === "implementation") {
  await this.executeLeaves(root);
  await this.judgeLeaves(root);
  this.runState.rankedResults = this.rankResults(root);
} else {
  await this.synthesizeLeaves(root);
}
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: `0 errors`.

- [ ] **Step 11: Smoke test with dry-run**

```bash
npx tsx src/cli/index.ts run "Build a REST API for a todo app" --dry-run
```

Expected: tree prints, no errors. The analyzer returns the default panel silently in dry-run mode.

- [ ] **Step 12: Commit**

```bash
git add src/orchestrator/orchestrator.ts
git commit -m "feat: wire TaskAnalyzer and Synthesizer into TreeOrchestrator"
```

---

## Task 6: Update CLI display

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Add `onAnalysisComplete` callback in the `run` command**

In `src/cli/index.ts`, inside the `new TreeOrchestrator(...)` call, add `onAnalysisComplete` as the first callback:

```ts
onAnalysisComplete: (analysis) => {
  spinner.stop();
  const agentNames = analysis.selectedAgents
    .map((r) => AGENT_DISPLAY_NAMES[r])
    .join(", ");
  console.log(chalk.bold(`\n🤖 Run mode:  ${analysis.runMode}`));
  console.log(chalk.cyan(`👥 Agents:    ${agentNames}`));
  console.log(chalk.dim(`💭 Rationale: ${analysis.rationale}\n`));
  spinner.start("Building debate tree...");
},
```

- [ ] **Step 2: Add `collectLeafOutputs` helper function**

Add this helper near the bottom of `src/cli/index.ts`, before `program.parse()`:

```ts
function collectLeafOutputs(
  node: TreeNode,
  pathSoFar: string[] = []
): Array<{ path: string; output: string }> {
  const currentPath = node.branchLabel
    ? [...pathSoFar, node.branchLabel]
    : pathSoFar;
  if (node.children.length === 0 && node.executionResult) {
    return [
      {
        path: currentPath.join(" → ") || "(root)",
        output: node.executionResult.output,
      },
    ];
  }
  return node.children.flatMap((c) => collectLeafOutputs(c, currentPath));
}
```

- [ ] **Step 3: Update `printResults` to handle exploration runs**

In `printResults`, add an exploration branch before the existing `rankedResults` check:

```ts
function printResults(state: RunState): void {
  console.log(chalk.bold.white("\n═══════════════════════════════════════"));
  console.log(chalk.bold.white("  🌳 ORCHESTRATION RESULTS"));
  console.log(chalk.bold.white("═══════════════════════════════════════\n"));
  console.log(`${chalk.bold("Run ID:")}     ${state.id}`);
  console.log(`${chalk.bold("Intent:")}     ${state.intent}`);
  console.log(`${chalk.bold("Status:")}     ${state.status}`);
  console.log(`${chalk.bold("Mode:")}       ${state.runMode ?? "implementation"}`);
  console.log(`${chalk.bold("Leaves:")}     ${state.leafNodeIds.length}`);
  console.log(`${chalk.bold("Tokens:")}     ${state.totalTokensUsed.toLocaleString()}`);
  console.log(`${chalk.bold("Duration:")}   ${state.completedAt ? timeDiff(state.startedAt, state.completedAt) : "in progress"}`);

  if (state.runMode === "exploration") {
    const docs = collectLeafOutputs(state.root);
    if (docs.length > 0) {
      console.log(chalk.bold("\n📄 Exploration Documents\n"));
      for (const doc of docs) {
        console.log(chalk.bold.cyan(`\n─── ${doc.path} ───\n`));
        console.log(doc.output);
      }
    }
    return;
  }

  if (state.rankedResults?.length) {
    console.log(chalk.bold("\n🏆 Ranked Solutions (best → worst)\n"));
    for (let i = 0; i < state.rankedResults.length; i++) {
      const r = state.rankedResults[i];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      console.log(`${medal} ${chalk.bold(r.score.composite.toFixed(1))}/10 — Path: ${chalk.cyan(r.path.join(" → ") || "(root)")}`);
      console.log(chalk.dim(`   FC:${r.score.functionalCompleteness} AQ:${r.score.architecturalQuality} TC:${r.score.testCoverage} IA:${r.score.intentAlignment} S:${r.score.simplicity}`));
      console.log(chalk.dim(`   ${r.score.rationale}`));
      console.log();
    }
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: `0 errors`.

- [ ] **Step 5: Smoke test — implementation run**

```bash
npx tsx src/cli/index.ts run "Build a REST API for a todo app" --dry-run
```

Expected output includes the analysis block:
```
🤖 Run mode:  implementation
👥 Agents:    Product Manager, Tech Lead, Developer, QA Engineer
💭 Rationale: Default panel (dry-run or analyzer fallback)
```

- [ ] **Step 6: Verify all tests still pass**

```bash
npm test
```

Expected: `9 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: display run mode, agent panel, and rationale in CLI output"
```
