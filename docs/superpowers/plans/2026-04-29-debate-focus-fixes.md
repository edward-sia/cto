# Debate Focus Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop debates from drifting off-intent into generic enterprise tropes (1M-record performance, GDPR, multi-currency) and instead keep agents focused on the load-bearing claims and undefined terms in the user's intent.

**Architecture:** Four surgical changes:
1. **Bug fix** — `getAgentsForPhase` no longer silently restores the default panel when the analyzer deliberately omitted PM/BA/QA.
2. **Intent decomposition** — a new pre-debate LLM pass extracts load-bearing claims, undefined terms, in/out-of-scope items, and feasibility flags. Passed into every agent prompt as scaffolding.
3. **De-enterprise the Business Analyst prompt** — drop the seeded "1M records / API down / compliance" examples and add an explicit *do-not-introduce-out-of-scope-concerns* negative.
4. **Relevance-weighted moderator** — moderator emits `relevanceToIntent` per alternative; orchestrator combines it with `confidence` for pruning. Default `pruneThreshold` rises from 0 → 0.5.

**Tech Stack:** TypeScript ESM (NodeNext modules), OpenAI SDK, Zod, vitest (tests), chalk/ora (CLI).

**Reference:** Debug analysis of `run-hIWrEsDewU` (Shopify CSV CLI intent) — see conversation thread `2026-04-29` for the full root-cause investigation that motivates these fixes.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | Add `IntentDecomposition` interface; add `intentDecomposition?` to `NodeContext`; add `relevanceToIntent` to `Alternative` |
| `src/schemas/index.ts` | Modify | Add `IntentDecompositionSchema`; add `relevanceToIntent` to `AlternativeSchema` |
| `src/analyzer/intent-decomposer.ts` | Create | `IntentDecomposer` class — one LLM call → `IntentDecomposition` |
| `src/analyzer/task-analyzer.ts` | (no change) | Keep as-is |
| `src/orchestrator/orchestrator.ts` | Modify | Wire `IntentDecomposer` into `run()`; fix `getAgentsForPhase` fallback bug; use effective confidence for pruning; raise default `pruneThreshold` |
| `src/agents/definitions.ts` | Modify | Render intent decomposition section in `buildAgentPrompt`; rewrite Business Analyst `systemPrompt` |
| `src/debate/engine.ts` | Modify | Update `MODERATOR_SYSTEM_PROMPT` to emit `relevanceToIntent`; pass intent through to moderator user prompt |
| `tests/analyzer/intent-decomposer.test.ts` | Create | Unit tests for `IntentDecomposer` |
| `tests/orchestrator/orchestrator.test.ts` | Modify | Add test for the `getAgentsForPhase` fix |
| `tests/debate/engine.test.ts` | Create | Unit tests for moderator schema parsing with `relevanceToIntent` |

---

## Task 1: Fix `getAgentsForPhase` analyzer-override bug

**Why:** In `run-hIWrEsDewU`, the analyzer chose `[tech-lead, developer, code-reviewer]`. The orchestrator filtered by `primaryPhases.includes("requirements")`, got an empty list, and silently restored the default `[product-manager, business-analyst, qa-engineer]` panel — the very agents the analyzer had omitted. Their generic prompts produced the off-topic discussion.

**Files:**
- Modify: `src/orchestrator/orchestrator.ts:404-410`
- Modify: `tests/orchestrator/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/orchestrator/orchestrator.test.ts` (inside the existing `describe` block):

```ts
import { TreeOrchestrator } from "../../src/orchestrator/orchestrator.js";

it("uses analyzer-selected agents even when none have the phase as primary", () => {
  const openai = {} as unknown as OpenAI;
  const orchestrator = new TreeOrchestrator(openai, { dryRun: true });
  // Inject runState with analyzer-selected agents that have no requirements-primary agent
  (orchestrator as unknown as { runState: { selectedAgents: string[] } }).runState = {
    selectedAgents: ["tech-lead", "developer", "code-reviewer"],
  } as never;

  const agents = (orchestrator as unknown as {
    getAgentsForPhase: (p: string) => string[];
  }).getAgentsForPhase("requirements");

  // Should NOT silently restore PM/BA/QA defaults
  expect(agents).not.toContain("product-manager");
  expect(agents).not.toContain("business-analyst");
  expect(agents).not.toContain("qa-engineer");
  // Should use the analyzer's selection as fallback
  expect(agents).toEqual(["tech-lead", "developer", "code-reviewer"]);
});

it("falls back to default panel only when analyzer never selected agents", () => {
  const openai = {} as unknown as OpenAI;
  const orchestrator = new TreeOrchestrator(openai, { dryRun: true });
  (orchestrator as unknown as { runState: { selectedAgents?: string[] } }).runState = {
    selectedAgents: undefined,
  } as never;

  const agents = (orchestrator as unknown as {
    getAgentsForPhase: (p: string) => string[];
  }).getAgentsForPhase("requirements");

  expect(agents).toContain("product-manager");
  expect(agents).toContain("business-analyst");
  expect(agents).toContain("qa-engineer");
});
```

If the file does not yet import `OpenAI`, add `import OpenAI from "openai";` at the top.

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npm test -- tests/orchestrator/orchestrator.test.ts
```

Expected: both new tests FAIL — the first because the current code returns `PHASE_AGENT_MAP["requirements"]` when the filter is empty.

- [ ] **Step 3: Fix `getAgentsForPhase`**

Replace `src/orchestrator/orchestrator.ts:404-410` with:

```ts
private getAgentsForPhase(phase: TreePhase): AgentRole[] {
  const selected = this.runState.selectedAgents;
  if (selected && selected.length > 0) {
    const phaseMatches = selected.filter((role) =>
      AGENT_DEFINITIONS[role].primaryPhases.includes(phase)
    );
    // If the analyzer made a deliberate selection, trust it.
    // Prefer agents whose primary phase matches; otherwise fall back to the
    // full analyzer selection rather than silently restoring the default panel.
    return phaseMatches.length > 0 ? phaseMatches : selected;
  }
  return PHASE_AGENT_MAP[phase];
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npm test -- tests/orchestrator/orchestrator.test.ts
```

Expected: PASS for both new tests; existing tests still pass.

- [ ] **Step 5: Run full typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/orchestrator.ts tests/orchestrator/orchestrator.test.ts
git commit -m "fix(orchestrator): trust analyzer-selected agents instead of restoring default panel"
```

---

## Task 2: Add `IntentDecomposition` types and schema

**Why:** Before we build the decomposer LLM call, we need typed contracts that flow through `NodeContext` and into agent prompts.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/schemas/index.ts`

- [ ] **Step 1: Add the type to `src/types/index.ts`**

Insert immediately above the `NodeContext` interface (around line 104):

```ts
export interface IntentDecomposition {
  loadBearingClaims: string[];
  undefinedTerms: Array<{ term: string; needsResolution: string }>;
  inScope: string[];
  outOfScope: string[];
  knownUnknowns: string[];
  feasibilityFlags: string[];
  rationale: string;
}
```

- [ ] **Step 2: Add `intentDecomposition?` to `NodeContext`**

In `src/types/index.ts`, modify the `NodeContext` interface to add the new field after `originalIntent`:

```ts
export interface NodeContext {
  originalIntent: string;
  intentDecomposition?: IntentDecomposition;
  prd?: string;
  acceptanceCriteria?: string[];
  architectureDecisions?: string[];
  branchDecision?: string;
  implementationSpec?: string;
  testStrategy?: string;
  ancestorSummaries: string[];
}
```

- [ ] **Step 3: Add `relevanceToIntent` to `Alternative`**

Modify the `Alternative` interface in `src/types/index.ts`:

```ts
export interface Alternative {
  id: string;
  label: string;
  description: string;
  proposedBy: AgentRole;
  supportedBy: AgentRole[];
  rationale: string;
  confidence: number;
  relevanceToIntent: number;
}
```

- [ ] **Step 4: Add the schemas to `src/schemas/index.ts`**

Append to `src/schemas/index.ts`:

```ts
export const IntentDecompositionSchema = z.object({
  loadBearingClaims: z.array(z.string()).default([]),
  undefinedTerms: z
    .array(
      z.object({
        term: z.string(),
        needsResolution: z.string(),
      })
    )
    .default([]),
  inScope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  knownUnknowns: z.array(z.string()).default([]),
  feasibilityFlags: z.array(z.string()).default([]),
  rationale: z.string().default(""),
});
```

And modify `AlternativeSchema` to add the new field:

```ts
export const AlternativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  proposedBy: z.string(),
  supportedBy: z.array(z.string()).default([]),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
  relevanceToIntent: z.number().min(0).max(1).default(0.5),
});
```

- [ ] **Step 5: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: no errors. (The `Alternative` type field will trigger a few errors in places that construct alternatives without `relevanceToIntent` — fix those by setting `relevanceToIntent: 0.5` as a default. Specifically:
- `src/debate/engine.ts:191-200` (where alternatives are built from agent responses): add `relevanceToIntent: 0.5,`)

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/schemas/index.ts src/debate/engine.ts
git commit -m "feat(types): add IntentDecomposition type and relevanceToIntent on Alternative"
```

---

## Task 3: Implement `IntentDecomposer`

**Why:** This is the new LLM pre-pass that produces structured scaffolding for the debate. It runs once per `run()`, before the tree starts, and is stored on the root node's context.

**Files:**
- Create: `src/analyzer/intent-decomposer.ts`
- Create: `tests/analyzer/intent-decomposer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/analyzer/intent-decomposer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { IntentDecomposer } from "../../src/analyzer/intent-decomposer.js";

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

describe("IntentDecomposer", () => {
  it("returns an empty decomposition in dry-run mode without calling OpenAI", async () => {
    const mockCreate = vi.fn();
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const decomposer = new IntentDecomposer(openai, "gpt-4o", true);

    const result = await decomposer.decompose("Build a CLI tool");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.loadBearingClaims).toEqual([]);
    expect(result.undefinedTerms).toEqual([]);
  });

  it("parses a valid LLM response into IntentDecomposition", async () => {
    const response = JSON.stringify({
      loadBearingClaims: [
        "input is a Shopify product CSV export",
        "output is a markdown report",
      ],
      undefinedTerms: [
        { term: "inventory value", needsResolution: "price*qty vs cost*qty" },
        { term: "reorder threshold", needsResolution: "fixed number, percentage, or per-product?" },
      ],
      inScope: ["top 10 by inventory value", "products below reorder threshold", "dead stock"],
      outOfScope: ["multi-currency conversion", "GDPR compliance"],
      knownUnknowns: ["does Shopify product CSV contain sales data?"],
      feasibilityFlags: ["dead stock requires sales data — Shopify product CSV does not include sales"],
      rationale: "Sales data is in the Orders export, not the products export.",
    });
    const openai = makeMockOpenAI(response);
    const decomposer = new IntentDecomposer(openai, "gpt-4o", false);

    const result = await decomposer.decompose(
      "Build a CLI that takes a Shopify product CSV and outputs a markdown dead-stock report"
    );

    expect(result.loadBearingClaims).toContain("output is a markdown report");
    expect(result.undefinedTerms).toHaveLength(2);
    expect(result.feasibilityFlags[0]).toMatch(/sales data/);
  });

  it("falls back to empty decomposition on invalid JSON", async () => {
    const openai = makeMockOpenAI("not valid json");
    const decomposer = new IntentDecomposer(openai, "gpt-4o", false);

    const result = await decomposer.decompose("Build something");

    expect(result.loadBearingClaims).toEqual([]);
    expect(result.feasibilityFlags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/analyzer/intent-decomposer.test.ts
```

Expected: FAIL with module-not-found error for `intent-decomposer.js`.

- [ ] **Step 3: Implement `IntentDecomposer`**

Create `src/analyzer/intent-decomposer.ts`:

```ts
import OpenAI from "openai";
import { IntentDecompositionSchema } from "../schemas/index.js";
import type { IntentDecomposition } from "../types/index.js";
import { withRetry } from "../utils/retry.js";

const EMPTY_DECOMPOSITION: IntentDecomposition = {
  loadBearingClaims: [],
  undefinedTerms: [],
  inScope: [],
  outOfScope: [],
  knownUnknowns: [],
  feasibilityFlags: [],
  rationale: "",
};

const SYSTEM_PROMPT = `You decompose a software development intent into a structured scaffold for a debate panel.

Your output frames what is on-topic and what is off-topic. The downstream agents will treat:
- loadBearingClaims as constraints they MUST honour
- inScope as the scope to defend (do not expand)
- outOfScope as concerns to NOT introduce unless the intent justifies them
- undefinedTerms as the highest-priority debate items to resolve
- knownUnknowns as facts to verify before assuming
- feasibilityFlags as concrete flags that the input source / data / approach may not support what the intent asks

Be aggressive about identifying outOfScope items: enterprise concerns (GDPR, multi-currency, 1M-record performance, i18n, compliance, data privacy) are OUT of scope for a personal-scale tool unless the intent explicitly invites them.

Be aggressive about feasibilityFlags: if the named input source might not contain the required data, flag it.

Output ONLY valid JSON with this shape:
{
  "loadBearingClaims": ["claim 1", "claim 2"],
  "undefinedTerms": [{"term": "X", "needsResolution": "what needs resolving"}],
  "inScope": ["scope item 1"],
  "outOfScope": ["scope item to avoid 1"],
  "knownUnknowns": ["unknown to verify 1"],
  "feasibilityFlags": ["concrete feasibility risk 1"],
  "rationale": "one sentence summary"
}`;

export class IntentDecomposer {
  private openai: OpenAI;
  private model: string;
  private dryRun: boolean;

  constructor(openai: OpenAI, model: string, dryRun = false) {
    this.openai = openai;
    this.model = model;
    this.dryRun = dryRun;
  }

  async decompose(intent: string): Promise<IntentDecomposition> {
    if (this.dryRun) return { ...EMPTY_DECOMPOSITION };

    try {
      const response = await withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Intent: ${intent}` },
          ],
          temperature: 0.2,
          max_tokens: 1024,
        })
      );
      const content = response.choices[0]?.message?.content ?? "";
      const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return IntentDecompositionSchema.parse(JSON.parse(jsonStr));
    } catch {
      console.warn("\nIntentDecomposer: failed to decompose intent, continuing without scaffold");
      return { ...EMPTY_DECOMPOSITION };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/analyzer/intent-decomposer.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analyzer/intent-decomposer.ts tests/analyzer/intent-decomposer.test.ts
git commit -m "feat(analyzer): add IntentDecomposer LLM pre-pass for debate scaffolding"
```

---

## Task 4: Wire `IntentDecomposer` into the orchestrator and agent prompts

**Why:** The decomposition is useless until it's threaded into `NodeContext.intentDecomposition` (so it inherits down the tree) and rendered into every agent's user prompt.

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`
- Modify: `src/agents/definitions.ts`

- [ ] **Step 1: Wire the decomposer into orchestrator construction**

In `src/orchestrator/orchestrator.ts`:

Add the import near the top, alongside the other analyzer import:

```ts
import { IntentDecomposer } from "../analyzer/intent-decomposer.js";
```

Add a private field on `TreeOrchestrator`:

```ts
private decomposer: IntentDecomposer;
```

Initialize it in the constructor (next to `this.analyzer = ...`):

```ts
this.decomposer = new IntentDecomposer(openai, this.config.reasoningModel, this.config.dryRun);
```

- [ ] **Step 2: Use the decomposer in `run()`**

Modify `src/orchestrator/orchestrator.ts:114-122`. After `const analysis = await this.analyzer.analyze(intent);` insert:

```ts
const decomposition = await this.decomposer.decompose(intent);
```

Then change the root node creation to include the decomposition:

```ts
const root = this.createNode(null, 0, {
  originalIntent: intent,
  intentDecomposition: decomposition,
  ancestorSummaries: [],
});
```

- [ ] **Step 3: Render the decomposition in agent prompts**

In `src/agents/definitions.ts`, modify `buildAgentPrompt` (around line 499). Insert a new block in the `contextSummary` array, immediately after the `## Original Intent` line:

```ts
const decomp = input.context.intentDecomposition;
const decompositionSection = decomp
  ? `## Intent Decomposition (treat as the debate frame)
**Load-bearing claims (must honour):**
${decomp.loadBearingClaims.map((c) => `- ${c}`).join("\n") || "- (none)"}

**Undefined terms (debate priority — resolve these first):**
${
  decomp.undefinedTerms.length
    ? decomp.undefinedTerms.map((t) => `- ${t.term}: ${t.needsResolution}`).join("\n")
    : "- (none)"
}

**In scope:**
${decomp.inScope.map((s) => `- ${s}`).join("\n") || "- (none)"}

**Out of scope (do NOT introduce these concerns):**
${decomp.outOfScope.map((s) => `- ${s}`).join("\n") || "- (none)"}

**Known unknowns (verify before assuming):**
${decomp.knownUnknowns.map((u) => `- ${u}`).join("\n") || "- (none)"}

**Feasibility flags:**
${decomp.feasibilityFlags.map((f) => `- ${f}`).join("\n") || "- (none)"}`
  : "";
```

Then insert `decompositionSection` into the `contextSummary` array between `## Original Intent` and the existing `input.context.prd ? ...` line:

```ts
const contextSummary = [
  `## Original Intent\n${input.context.originalIntent}`,
  decompositionSection,
  input.context.prd ? `## PRD\n${input.context.prd}` : "",
  // ... rest unchanged
]
  .filter(Boolean)
  .join("\n\n");
```

- [ ] **Step 4: Add a closing instruction reinforcing the frame**

In `src/agents/definitions.ts`, modify the trailing instruction in the `user` prompt template (around line 547). Replace:

```ts
Only propose ALTERNATIVE [...] when you see genuinely different approaches worth full separate exploration. Otherwise, surface concerns and recommendations inline.
```

with:

```ts
Stay within the **In scope** items above. Do NOT introduce concerns from **Out of scope**. Treat **Load-bearing claims** as constraints. Treat **Undefined terms** as the highest-priority debate items.

Only propose ALTERNATIVE [...] when you see genuinely different approaches worth full separate exploration AND the alternative is on-topic for the original intent. Otherwise, surface concerns and recommendations inline.
```

- [ ] **Step 5: Run the existing test suite**

```bash
npm test
```

Expected: all tests pass. The new prompt scaffolding does not break any existing test because tests use dry-run mode where decomposition is empty.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator/orchestrator.ts src/agents/definitions.ts
git commit -m "feat(orchestrator): thread intent decomposition into agent prompts"
```

---

## Task 5: De-enterprise the Business Analyst prompt

**Why:** The current BA prompt explicitly seeds "1M records", "API is down", and "compliance" as stress-test examples. In the debug run, the BA faithfully emitted both. With Task 4's decomposition scaffolding in place, the prompt should defer to the **Out of scope** list rather than carry hard-coded enterprise tropes.

**Files:**
- Modify: `src/agents/definitions.ts:63-98`

- [ ] **Step 1: Replace the Business Analyst `systemPrompt`**

In `src/agents/definitions.ts`, replace the entire `systemPrompt` value of the `business-analyst` entry with:

```ts
systemPrompt: `You are the Business Analyst in a round-table software engineering debate.

## Your Role
You are the edge-case hunter and integration detective. You find the gaps others miss — but only the gaps that matter for THIS intent.

## Your Responsibilities
- Identify edge cases, error states, and boundary conditions that the load-bearing claims actually expose
- Map data flows and integration points implied by the intent
- Challenge assumptions with "what happens when X?" — but only when X is in scope
- Ensure business rules implied by the intent are explicit and complete
- Validate that technical proposals satisfy the constraints stated in the intent

## How You Contribute to Debates
- Stress-test proposals against the load-bearing claims and known unknowns the decomposition surfaced
- When you find conflicting business rules within the stated scope, PROPOSE ALTERNATIVES
- Quantify only when the intent gives you a quantity to anchor on; do not invent scale targets
- Play devil's advocate — but stay on the user's problem

## Output Format
1. **Edge Cases Found**: List of gaps or risks within the stated scope
2. **Business Rules**: Any rules implied by the intent that need to be explicit
3. **Alternatives** (if any): Different approaches to handle conflicting requirements
4. **Challenges**: Questions for other agents — anchored to the intent

## Context Updates
CONTEXT_UPDATE [acceptance-criteria]: <single testable criterion covering an edge case or business rule>

## Critical Rules
- DO NOT introduce concerns from the **Out of scope** list (e.g. multi-currency, GDPR / data privacy, i18n, 1M-record performance) unless the intent or load-bearing claims explicitly invite them.
- DO NOT invent scale, latency, or compliance requirements that the intent did not state. If you suspect one matters, raise it as a CHALLENGE question first; do not bake it into acceptance criteria.
- Resolve undefined terms through debate; only propose alternatives when conflicting business rules genuinely force different implementations that cannot coexist.`,
```

- [ ] **Step 2: Run the typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: no errors; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/agents/definitions.ts
git commit -m "feat(agents): de-enterprise Business Analyst prompt — defer to intent decomposition"
```

---

## Task 6: Add `relevanceToIntent` to the moderator output

**Why:** In `run-hIWrEsDewU` the moderator branched on `Data Privacy Handling` and `Currency Update Frequency` — both off-topic. The moderator's existing `confidence` measures "is this branch a real architectural fork?" but not "is this branch on-topic?" We need both, then combine them.

**Files:**
- Modify: `src/debate/engine.ts:48-103` (MODERATOR_SYSTEM_PROMPT)
- Modify: `src/debate/engine.ts:267-279` (moderator user prompt — pass intent decomposition through)
- Create: `tests/debate/engine.test.ts`

- [ ] **Step 1: Update `MODERATOR_SYSTEM_PROMPT`**

In `src/debate/engine.ts`, replace the existing `MODERATOR_SYSTEM_PROMPT` with:

```ts
const MODERATOR_SYSTEM_PROMPT = `You are the Debate Moderator. You do NOT participate in the debate — you ASSESS it.

After each round of debate, you analyse the transcript and determine:

1. **CONSENSUS** — All agents agree on the direction. No meaningful alternatives were proposed,
   or alternatives were proposed but all agents converged on one.

2. **DIVERGING** — Two or more agents proposed genuinely different approaches that cannot be
   reconciled into one. These represent legitimate alternatives worth exploring as separate branches.

3. **CONTINUE** — The discussion is productive but unresolved. More rounds are needed.

## Rules for DIVERGING (read carefully — branching is expensive)
- At least TWO agents must have independently proposed or explicitly supported distinct alternatives
- A single agent proposing alternatives alone is NOT sufficient for DIVERGING
- The alternatives must differ in a way that leads to meaningfully different implementations
  (e.g., REST vs GraphQL, monolith vs microservices, sync vs async processing)
- The alternatives must be ON-TOPIC for the original intent. An off-topic alternative — however unique — is NOT a valid branch.
- Style differences, library choices within the same pattern, and naming are NOT branches
- Round 1: strongly prefer CONTINUE unless divergence is completely obvious and irreconcilable
- When in doubt between DIVERGING and CONTINUE, choose CONTINUE

## Rules for CONSENSUS
- Consensus does NOT require unanimity — it means no better alternative is worth a full separate branch
- One agent raising a concern without proposing a concrete alternative = consensus with noted risks
- When in doubt between CONSENSUS and CONTINUE, choose CONSENSUS

## Calibration
Over-branching wastes compute and fractures focus. Under-branching misses genuine trade-offs.
Target: branch only when the team would genuinely implement both paths completely differently AND both paths are clearly within the intent.

## Output Format
Respond with ONLY valid JSON:
{
  "outcome": "consensus" | "diverging" | "continue",
  "alternatives": [
    {
      "id": "alt-<short-id>",
      "label": "Short label",
      "description": "What this approach entails",
      "proposedBy": "<agent-role>",
      "supportedBy": ["<agent-role>"],
      "rationale": "Why this is worth exploring as a separate branch",
      "confidence": 0.0-1.0,
      "relevanceToIntent": 0.0-1.0
    }
  ],
  "summary": "Brief summary of the round's discussion and outcome"
}

## Confidence
Each alternative MUST include a confidence score in [0, 1] reflecting your belief
that this branch is worth fully exploring (debating + implementing + judging):
- 0.8-1.0: clearly worth exploring; strongly grounded in the debate
- 0.4-0.7: plausible but uncertain — might pay off, might be wasted compute
- 0.0-0.3: weak; included only because an agent insisted

## RelevanceToIntent
Each alternative MUST include relevanceToIntent in [0, 1] reflecting how directly the
alternative addresses the **load-bearing claims** and **in-scope** items from the intent:
- 0.8-1.0: directly addresses an in-scope concern from the intent
- 0.4-0.7: tangentially related; addresses a real concern but one the intent did not centre on
- 0.0-0.3: off-topic; addresses something in **Out of scope** or unrelated to the intent

Be calibrated: most alternatives that are actually worth branching will score high on BOTH dimensions.`;
```

- [ ] **Step 2: Pass intent decomposition into the moderator user prompt**

In `src/debate/engine.ts`, modify the `assessRound` user prompt (around lines 267-279). Replace the current `userPrompt` construction with:

```ts
const decomp = context.intentDecomposition;
const decompositionFrame = decomp
  ? `\n## Intent Frame
- Load-bearing: ${decomp.loadBearingClaims.join("; ") || "(none)"}
- In scope: ${decomp.inScope.join("; ") || "(none)"}
- Out of scope (off-topic — score low on relevanceToIntent if a branch lives here): ${decomp.outOfScope.join("; ") || "(none)"}\n`
  : "";

const userPrompt = `# Debate Transcript

## Context
Original intent: ${context.originalIntent}
${context.branchDecision ? `Branch decision: ${context.branchDecision}` : ""}
${decompositionFrame}
## Full Transcript
${transcript}
${alternativesSummary}

## Assessment Required
This is round ${roundNumber} of ${this.maxRounds}. Assess the debate state.
${isLastRound ? "\n⚠️ THIS IS THE FINAL ROUND. You MUST choose consensus or diverging. No continue." : ""}`;
```

- [ ] **Step 3: Update the dry-run mock moderator response**

In `src/debate/engine.ts`, find `mockModeratorResponse` (around line 348). Update the `alts` mapping to include `relevanceToIntent`:

```ts
const alts = alternatives.slice(0, this.maxBranching).map((a, i) => ({
  id: a.id,
  label: a.label,
  description: a.description,
  proposedBy: a.proposedBy,
  supportedBy: a.supportedBy,
  rationale: a.rationale,
  confidence: i === 0 ? 0.8 : 0.6,
  relevanceToIntent: 0.8,
}));
```

- [ ] **Step 4: Write a test for moderator schema parsing with `relevanceToIntent`**

Create `tests/debate/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ModeratorAssessmentSchema } from "../../src/schemas/index.js";

describe("ModeratorAssessmentSchema", () => {
  it("parses valid moderator output with relevanceToIntent", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
          relevanceToIntent: 0.9,
        },
      ],
      summary: "two paths",
    };
    const parsed = ModeratorAssessmentSchema.parse(raw);
    expect(parsed.alternatives[0].relevanceToIntent).toBe(0.9);
  });

  it("defaults relevanceToIntent to 0.5 when omitted (backward compat)", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
        },
      ],
      summary: "two paths",
    };
    const parsed = ModeratorAssessmentSchema.parse(raw);
    expect(parsed.alternatives[0].relevanceToIntent).toBe(0.5);
  });

  it("rejects relevanceToIntent outside [0,1]", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
          relevanceToIntent: 1.5,
        },
      ],
      summary: "two paths",
    };
    expect(() => ModeratorAssessmentSchema.parse(raw)).toThrow();
  });
});
```

- [ ] **Step 5: Run the new test**

```bash
npm test -- tests/debate/engine.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Run the full suite**

```bash
npm test && npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/debate/engine.ts tests/debate/engine.test.ts
git commit -m "feat(debate): moderator emits relevanceToIntent per alternative"
```

---

## Task 7: Use effective score for pruning and raise default threshold

**Why:** With `relevanceToIntent` available, pruning should use a combined score so off-topic alternatives are dropped even when their architectural-fork confidence is high. Default threshold rises from 0 to 0.5 so the pipeline prunes noise out of the box.

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`

- [ ] **Step 1: Raise the default `pruneThreshold`**

In `src/orchestrator/orchestrator.ts`, change line 53 inside `DEFAULT_RUN_CONFIG`:

```ts
pruneThreshold: 0.5,
```

- [ ] **Step 2: Use effective confidence in branching pruner**

In `src/orchestrator/orchestrator.ts`, modify `processNode` around line 224-234. Replace:

```ts
const allAlternatives = lastRound.alternatives;
const threshold = this.config.pruneThreshold;
const alternatives = threshold > 0
  ? allAlternatives.filter((a) => a.confidence >= threshold)
  : allAlternatives;
const pruned = allAlternatives.length - alternatives.length;
```

with:

```ts
const allAlternatives = lastRound.alternatives;
const threshold = this.config.pruneThreshold;
const effectiveScore = (a: { confidence: number; relevanceToIntent: number }) =>
  a.confidence * a.relevanceToIntent;
const alternatives = threshold > 0
  ? allAlternatives.filter((a) => effectiveScore(a) >= threshold)
  : allAlternatives;
const pruned = allAlternatives.length - alternatives.length;
```

- [ ] **Step 3: Add a unit test for the combined-score pruning**

Append to `tests/orchestrator/orchestrator.test.ts`:

```ts
import type { Alternative } from "../../src/types/index.js";

it("prunes alternatives whose confidence * relevanceToIntent is below threshold", () => {
  const alts: Alternative[] = [
    {
      id: "a",
      label: "On-topic high",
      description: "",
      proposedBy: "tech-lead",
      supportedBy: [],
      rationale: "",
      confidence: 0.9,
      relevanceToIntent: 0.9,
    },
    {
      id: "b",
      label: "Off-topic",
      description: "",
      proposedBy: "business-analyst",
      supportedBy: [],
      rationale: "",
      confidence: 0.9,
      relevanceToIntent: 0.2,
    },
  ];
  const threshold = 0.5;
  const effective = (a: Alternative) => a.confidence * a.relevanceToIntent;
  const kept = alts.filter((a) => effective(a) >= threshold);
  expect(kept.map((a) => a.id)).toEqual(["a"]);
});
```

- [ ] **Step 4: Run tests**

```bash
npm test && npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Update `cost.ts` if it references the default threshold**

```bash
grep -n "pruneThreshold" src/utils/cost.ts || echo "no references"
```

If it references the default, leave the cost estimator alone — raising the threshold means the worst-case branch count is unchanged or smaller, which is conservative for the estimator.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/orchestrator.ts tests/orchestrator/orchestrator.test.ts
git commit -m "feat(orchestrator): prune alternatives by confidence * relevanceToIntent"
```

---

## Task 8: End-to-end smoke test

**Why:** Validate that the new pipeline doesn't crash on a real-ish dry-run intent.

**Files:**
- (no source changes)

- [ ] **Step 1: Run a dry-run end-to-end with the original failing intent**

```bash
npx tsx src/cli/index.ts run "Build a CLI tool that takes a Shopify product CSV export and outputs a markdown report showing: top 10 products by inventory value, products below reorder threshold, and dead stock (no sales in 90 days)" --depth 2 --branching 2 --dry-run -y
```

Expected: completes without error; tree shows phase progression. Dry-run produces an empty `intentDecomposition` (the prompt scaffold is rendered with `(none)` placeholders) and tree topology is unchanged from previous dry-run behaviour.

- [ ] **Step 2: Verify the run is loadable in the UI**

```bash
ls .cambrian-tree/ | tail -1
```

Note the run id, then:

```bash
npx tsx src/cli/index.ts ui <run-id>
```

Expected: UI launches; tree renders; node inspector tabs work. Close with Ctrl+C.

- [ ] **Step 3: Final full test run**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all pass.

- [ ] **Step 4: Final commit / no-op**

If steps 1-3 produced no source changes, no commit is needed. Otherwise commit with:

```bash
git add -p
git commit -m "chore: e2e smoke test fixes"
```

---

## Out of Scope (future work — not in this plan)

These were identified in the debug analysis but are deliberately deferred:

- **Feasibility/source-data agent** — would put a Researcher / Data-Engineer on the requirements panel for any task with an external input source. Lighter-weight intervention is the decomposer's `feasibilityFlags`.
- **Output-format debate axis** — explicit prompt to interrogate the user-stated output medium (markdown vs HTML vs interactive). Currently handled implicitly via `loadBearingClaims`.
- **Definition closure tracker** — moderator gate that promotes undefined terms to "must resolve by round N+1". Currently handled implicitly via `undefinedTerms`.
- **Empty judge `reasoning` investigation** — leaves landing in `phase=architecture` skip implementation entirely; judge produces empty rationales. This is an orthogonal bug; track in a separate plan.
