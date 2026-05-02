# Evolutionary CTO Build Plan

This plan turns CTO from "agents debate, leaves execute, judge ranks" into a more evidence-driven evolutionary system where stronger branches survive because they prove fitness through tests, verification, critique, pairwise comparison, and final synthesis.

The guiding principle:

> Fitness must be based on evidence first, LLM judgment second.

## Target Outcome

CTO should be able to run deeper, higher-branching searches without simply producing more plausible prose. A high-grade run should:

- clarify the intent into a stable dossier before debate
- preserve real diversity among alternatives
- prune gently early and strictly later
- red-team plans before expensive execution
- execute leaves with mandatory verification commands when available
- score leaves using evidence-aware rubrics
- run pairwise tournaments to reduce judge-score drift
- mutate and cross over strong survivors into later generations
- synthesize a final winner and verify it again

## Current Foundation

The repo already has useful pieces to build on:

- `IntentDecomposer` creates structured intent framing.
- `TaskAnalyzer` selects implementation vs exploration mode and agents.
- `DebateEngine` runs round-table debate and moderator branching.
- `Alternative` already has `confidence` and `relevanceToIntent`.
- `TreeOrchestrator` handles tree traversal, pruning, execution, judging, resume, and interactive plan review.
- `CodexExecutor` executes leaf plans and captures test result summaries.
- `Judge` scores six dimensions and ranks by composite.
- `Synthesizer` handles exploration-mode synthesis.
- Ground-truth providers can inject verified facts.
- Saved-run UI can visualize state.

The work should extend these contracts instead of replacing them.

## Roadmap

### Phase 1: Intent Dossier

Goal: create a stronger, stable target before any branching starts.

Current `IntentDecomposition` is useful but not enough for "survival of the fittest." Add a richer `IntentDossier` that becomes the canonical fitness target.

Proposed type:

```ts
export interface IntentDossier {
  goal: string;
  userValue: string;
  nonGoals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  requiredChecks: string[];
  riskAreas: string[];
  knownUnknowns: string[];
  successSignals: string[];
  failureModes: string[];
}
```

Implementation plan:

1. Add `IntentDossier` to `src/types/index.ts`.
2. Add `IntentDossierSchema` to `src/schemas/index.ts`.
3. Create `src/analyzer/intent-dossier.ts`.
4. Call it after `IntentDecomposer` in `TreeOrchestrator.run`.
5. Store it on `NodeContext`.
6. Include dossier fields in agent prompts, moderator prompts, executor prompts, and judge prompts.
7. In dry-run mode, return a small deterministic dossier.

CLI additions:

```bash
cto run "..." --acceptance "must preserve existing tests" --check "npm test"
```

Initial tests:

- parses valid dossier JSON
- falls back safely on malformed JSON
- stores dossier on root node
- passes dossier into leaf execution prompt

### Phase 2: Verification Harness

Goal: make leaves prove themselves with commands, artifacts, and structured results.

Add a verification layer separate from Codex execution. Codex can still run tests during implementation, but CTO should also run a consistent external verification pass afterward.

Proposed types:

```ts
export interface VerificationCommand {
  id: string;
  command: string;
  required: boolean;
  timeoutMs: number;
}

export interface VerificationResult {
  commandId: string;
  command: string;
  exitCode: number | null;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface VerificationSummary {
  passed: number;
  failed: number;
  requiredFailed: number;
  results: VerificationResult[];
}
```

Implementation plan:

1. Add `verificationCommands` to `RunConfig`.
2. Add `verification?: VerificationSummary` to `CodexExecutionResult` or `TreeNode`.
3. Create `src/verification/runner.ts`.
4. Run verification after each leaf execution.
5. Store stdout and stderr with truncation to avoid huge state files.
6. Treat required command failures as a major score penalty.
7. Support commands from CLI and from `IntentDossier.requiredChecks`.

CLI additions:

```bash
cto run "..." --verify "npm test" --verify "npm run typecheck" --verify-timeout 300000
```

Initial tests:

- successful command records passed result
- failing command records failed result
- timeout records failed result without crashing run
- required failures reduce verification score
- verification persists to saved run state

### Phase 3: Evidence-Aware Fitness Score

Goal: rank leaves by proof, not only LLM preference.

Replace judge-only composite with a fitness model. Keep judge scores, but compute final survival fitness from verification, judge dimensions, uncertainty, and cost.

Proposed types:

```ts
export interface FitnessScore {
  verification: number;
  functionalCompleteness: number;
  maintainability: number;
  simplicity: number;
  intentAlignment: number;
  riskReduction: number;
  costEfficiency: number;
  uncertaintyPenalty: number;
  composite: number;
  evidence: string[];
  failures: string[];
}

export interface JudgeScore {
  functionalCompleteness: number;
  architecturalQuality: number;
  testCoverage: number;
  intentAlignment: number;
  realWorldFit: number;
  simplicity: number;
  uncertainty: number;
  evidence: string[];
  failures: string[];
  composite: number;
  rationale: string;
}
```

Suggested first composite:

```ts
const composite =
  0.35 * verification +
  0.20 * functionalCompleteness +
  0.15 * maintainability +
  0.10 * simplicity +
  0.10 * intentAlignment +
  0.05 * riskReduction +
  0.05 * costEfficiency -
  0.10 * uncertaintyPenalty;
```

Implementation plan:

1. Extend `JudgeScoreSchema`.
2. Update `Judge` prompt to require evidence, failures, and uncertainty.
3. Add `src/judge/fitness.ts` to compute deterministic fitness.
4. Store `fitness?: FitnessScore` on `TreeNode`.
5. Rank by `fitness.composite`, with `score.composite` kept for display.
6. Add UI support for evidence and failures in the inspector.

Initial tests:

- failed required verification caps fitness
- passing verification materially boosts fitness
- high uncertainty lowers composite
- ranking uses fitness when available
- legacy saved runs without fitness still render

### Phase 4: Progressive Pruning

Goal: stop killing promising ideas too early.

Replace one global `pruneThreshold` with a depth-aware schedule.

Proposed config:

```ts
export interface PruneSchedulePoint {
  depth: number;
  threshold: number;
}

export interface RunConfig {
  pruneThreshold: number;
  pruneSchedule?: PruneSchedulePoint[];
}
```

Suggested default:

```ts
const DEFAULT_PRUNE_SCHEDULE: PruneSchedulePoint[] = [
  { depth: 0, threshold: 0.45 },
  { depth: 1, threshold: 0.60 },
  { depth: 2, threshold: 0.70 },
  { depth: 4, threshold: 0.80 },
  { depth: 6, threshold: 0.85 },
];
```

Implementation plan:

1. Add schedule config and helper `getPruneThresholdForDepth`.
2. Preserve `--prune-threshold` as a simple override.
3. Add `--prune-schedule "0:0.45,1:0.6,2:0.7,4:0.8"`.
4. Save the threshold used in node metadata or debate summary.
5. Show threshold in CLI pruning logs.

Initial tests:

- depth-specific threshold applies correctly
- global threshold remains backward-compatible
- malformed schedule fails fast with clear CLI error

### Phase 5: Diversity Preservation

Goal: keep multiple genuinely different strategies alive.

Add novelty metadata to alternatives and use it during pruning. The moderator should identify strategy families rather than only confidence.

Proposed `Alternative` additions:

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
  noveltyScore: number;
  strategyTags: string[];
}
```

Examples of strategy tags:

- `minimal-change`
- `architecture-refactor`
- `test-first`
- `performance-first`
- `ux-first`
- `api-contract-first`
- `data-model-first`
- `risk-reduction`

Implementation plan:

1. Extend schema and moderator prompt.
2. Add fallback defaults for old responses.
3. Update pruning so at least one branch per high-novelty strategy can survive when within a diversity margin.
4. Add a `--diversity-margin` flag, for example `0.15`.
5. Show strategy tags in CLI and UI.

Initial tests:

- alternatives parse with tags and novelty
- missing tags default safely
- diversity preservation keeps distinct strategy if close enough to threshold
- low-relevance novelty does not survive

### Phase 6: Red-Team Plan Gate

Goal: attack each candidate plan before paying for implementation.

This is different from human interactive review. It is an automated critic pass that identifies under-specification and branch-specific failure risks.

Proposed types:

```ts
export interface RedTeamReview {
  risks: string[];
  missingAcceptanceCriteria: string[];
  likelyFailureModes: string[];
  requiredPlanRevisions: string[];
  recommendedVerification: string[];
  decision: "proceed" | "revise" | "prune";
  confidence: number;
}
```

Implementation plan:

1. Create `src/control/red-team.ts`.
2. Run red-team review on leaves before execution.
3. If `proceed`, execute normally.
4. If `revise`, create a child node with `branchLabel = "red-team-revision"` and process it once.
5. If `prune`, mark the leaf as pruned.
6. Limit revision loops to avoid infinite recursion.
7. Include red-team risks in the implementation prompt.

CLI additions:

```bash
cto run "..." --red-team
cto run "..." --red-team --red-team-revisions 1
```

Initial tests:

- proceed leaves execute
- prune leaves do not execute
- revise creates one child with propagated critique
- resume does not repeat completed red-team decisions

### Phase 7: Pairwise Tournament Ranking

Goal: reduce score drift by comparing survivors head-to-head.

Absolute LLM scores are useful but noisy. After leaf scoring, run pairwise comparisons among the top K candidates.

Proposed types:

```ts
export interface PairwiseComparison {
  leftNodeId: string;
  rightNodeId: string;
  winnerNodeId: string;
  criteria: {
    intentAlignment: string;
    verificationStrength: string;
    simplicity: string;
    mergeReadiness: string;
  };
  rationale: string;
}

export interface TournamentResult {
  comparisons: PairwiseComparison[];
  winsByNodeId: Record<string, number>;
  rankedNodeIds: string[];
}
```

Implementation plan:

1. Create `src/judge/tournament.ts`.
2. Compare top K by fitness, default K = 4.
3. Prompt judge to prefer evidence and verification over rhetorical completeness.
4. Store tournament result on `RunState`.
5. Final ranking should sort by tournament rank first, then fitness.
6. UI should show pairwise wins.

CLI additions:

```bash
cto run "..." --tournament --tournament-top-k 4
```

Initial tests:

- tournament ranks by wins
- ties fall back to fitness
- malformed LLM response fails gracefully
- run state persists comparisons

### Phase 8: Mutation And Crossover

Goal: turn CTO from tree search into real generations.

Once leaves have fitness, CTO can spawn another generation from survivors.

Proposed types:

```ts
export type EvolutionStep =
  | {
      type: "mutate";
      parentNodeId: string;
      prompt: string;
    }
  | {
      type: "crossover";
      parentNodeIds: string[];
      prompt: string;
    };

export interface GenerationResult {
  generation: number;
  survivorNodeIds: string[];
  evolutionSteps: EvolutionStep[];
}
```

Implementation plan:

1. Add `generations` to `RunConfig`.
2. Add `generation` to `TreeNode`.
3. After ranking, pick survivors by tournament/fitness.
4. Generate mutation prompts for top survivors.
5. Generate crossover prompts for complementary high-scoring survivors.
6. Create generation child nodes and process them.
7. Execute and judge the new generation.
8. Stop when generation limit, budget limit, or no improvement threshold is reached.

CLI additions:

```bash
cto run "..." --generations 3 --survivors 3 --mutations 2 --crossovers 1
cto run "..." --min-improvement 0.25
```

Initial tests:

- generation 0 behavior remains unchanged
- survivors spawn expected mutation children
- crossover combines two parents
- generation loop stops at configured limit
- no-improvement stop works

### Phase 9: Final Synthesis Winner

Goal: produce the best final answer, not merely pick one leaf.

At the end, CTO should consider three finalization modes:

- winner as-is
- winner plus targeted improvements from runner-up
- synthesized best-of-all candidate

Implementation plan:

1. Add `Finalizer` in `src/synthesis/finalizer.ts`.
2. Feed it top candidates, evidence, failures, tournament result, and dossier.
3. Generate a final implementation prompt.
4. Execute final candidate in a fresh working directory.
5. Run verification again.
6. Judge final candidate and compare against previous winner.
7. Mark final result explicitly in `RunState`.

Proposed type:

```ts
export interface FinalCandidate {
  source: "winner-as-is" | "winner-plus-runner-up" | "synthesized";
  nodeId: string;
  rationale: string;
  executionResult?: CodexExecutionResult;
  score?: JudgeScore;
  fitness?: FitnessScore;
}
```

CLI additions:

```bash
cto run "..." --final-synthesis
```

Initial tests:

- final synthesis receives top candidates
- failed final candidate does not replace stronger verified winner
- final result is persisted and displayed

### Phase 10: UI And Observability

Goal: make the evolutionary process inspectable.

Saved-run UI should answer:

- Why did this branch survive?
- Why was that branch pruned?
- What evidence supported the winner?
- Which commands failed?
- Which pairwise comparisons changed the ranking?
- What did mutation or crossover add?

Implementation plan:

1. Add inspector tabs for:
   - Dossier
   - Verification
   - Fitness
   - Red Team
   - Tournament
   - Evolution
2. Add badges for:
   - strategy tags
   - verification pass/fail
   - generation number
   - tournament wins
3. Add tree filters:
   - show only survivors
   - show failed verification
   - show strategy family
4. Keep the UI read-only.

Initial tests:

- render legacy runs without new fields
- render verification summaries
- render fitness and failures
- run-id validation remains intact

## Suggested Build Order

Build in this order for compounding value:

1. Intent Dossier
2. Verification Harness
3. Evidence-Aware Fitness Score
4. Progressive Pruning
5. Diversity Preservation
6. Red-Team Plan Gate
7. Pairwise Tournament
8. Final Synthesis
9. Mutation And Crossover
10. UI upgrades

Mutation and crossover are exciting, but they should wait until fitness is trustworthy. Otherwise CTO will evolve toward whatever sounds good to the judge instead of whatever works.

## Superpowers-Style Delivery Workflow

Use a disciplined build loop for every phase. The aim is to keep each upgrade independently shippable and proven before adding the next layer of complexity.

For each phase:

1. Write the contract first.
   - Add or update TypeScript interfaces in `src/types/index.ts`.
   - Add Zod schemas in `src/schemas/index.ts`.
   - Decide where the new state persists in `RunState`, `TreeNode`, or `CodexExecutionResult`.

2. Write failing tests before implementation.
   - Parser/schema tests for any LLM JSON output.
   - Unit tests for deterministic helpers.
   - Orchestrator tests for state transitions.
   - UI tests only after the state is stable.

3. Implement the narrowest vertical slice.
   - Add the smallest code path that exercises the new capability end to end.
   - Keep old flags and saved-run behavior working.
   - Prefer additive fields and optional properties for backward compatibility.

4. Verify locally.
   - Run focused tests for the touched modules.
   - Run `npm run typecheck`.
   - Run broader tests before moving to the next phase.

5. Document the observable behavior.
   - Add CLI examples when a user-facing flag is introduced.
   - Update saved-run UI expectations when state shape changes.
   - Note any deliberate limitations, such as "one red-team revision only."

6. Stop before speculative expansion.
   - Do not build mutation/crossover until verification and fitness are proven.
   - Do not add UI controls before the underlying state is persisted.
   - Do not add new scoring dimensions until they can be explained from evidence.

Recommended phase checklist:

- Contract exists.
- Tests fail for the missing behavior.
- Implementation passes focused tests.
- Typecheck passes.
- Existing CLI behavior is backward-compatible.
- Saved-run state remains readable.
- The new behavior appears in CLI output or UI only when enabled.

This workflow is especially important for the evolutionary features because each layer amplifies the previous one. Weak verification makes fitness weak; weak fitness makes tournaments weak; weak tournaments make generations optimize for the wrong thing.

## Recommended First Milestone

The first shippable milestone should be:

```bash
cto run "..." \
  --depth 4 \
  --branching 3 \
  --rounds 3 \
  --prune-schedule "0:0.45,1:0.60,2:0.70,3:0.80" \
  --verify "npm test" \
  --verify "npm run typecheck" \
  --red-team \
  --tournament \
  --interactive-plan
```

This milestone would already feel like a serious upgrade because branches survive based on:

- clear target criteria
- verification output
- critic feedback
- score evidence
- pairwise comparison

## Acceptance Criteria For The Evolutionary CTO Upgrade

- CTO can run with all old flags unchanged.
- Saved legacy runs still load in CLI and UI.
- A run can declare verification commands and persist their results.
- Failed required verification prevents a leaf from winning unless every leaf fails.
- Judge output includes evidence, failures, and uncertainty.
- Ranking is deterministic after judge responses are persisted.
- Pruning can be configured by depth.
- At least one diverse strategy can survive early pruning when relevant.
- Red-team review can proceed, revise, or prune a leaf before execution.
- Tournament ranking can change the winner and records why.
- Final synthesis never replaces a better verified candidate without proof.
- Tests cover parsing, orchestration behavior, ranking, and persistence.

## Risk Register

| Risk | Mitigation |
| --- | --- |
| More knobs make CLI confusing | Add presets like `--quality standard`, `--quality high`, and `--quality exhaustive`. |
| Verification commands are project-specific | Let the user pass `--verify`, infer common package scripts, and store commands in the dossier. |
| Judge overtrusts its own prose | Require evidence arrays and compute deterministic fitness outside the LLM. |
| Early pruning kills novel ideas | Use progressive pruning plus diversity margin. |
| Generations explode cost | Add cost estimates for generations, survivor caps, and minimum improvement stops. |
| Saved-run state grows too large | Truncate command output and store full logs separately later if needed. |
| Red-team creates loops | Allow at most one automated revision per leaf in v1. |

## Quality Presets

These presets can make the system easier to use than many separate flags.

```ts
export type QualityPreset = "fast" | "standard" | "high" | "exhaustive";

export const QUALITY_PRESETS: Record<QualityPreset, Partial<RunConfig>> = {
  fast: {
    maxDepth: 2,
    maxBranching: 2,
    maxDebateRounds: 2,
    leafConcurrency: 2,
  },
  standard: {
    maxDepth: 4,
    maxBranching: 2,
    maxDebateRounds: 3,
    leafConcurrency: 4,
  },
  high: {
    maxDepth: 5,
    maxBranching: 3,
    maxDebateRounds: 3,
    leafConcurrency: 4,
  },
  exhaustive: {
    maxDepth: 6,
    maxBranching: 3,
    maxDebateRounds: 4,
    leafConcurrency: 4,
  },
};
```

Preset behavior should remain override-friendly. For example, `--quality high --depth 3` should use high defaults except depth.

## Definition Of Done

The upgrade is "comprehensive" when CTO can explain the winner in evidence terms:

1. What the user asked for.
2. What criteria mattered.
3. Which branches were explored.
4. Which branches were pruned and why.
5. Which checks passed or failed.
6. Which candidate won pairwise comparisons.
7. Whether final synthesis improved the winner.
8. What residual risks remain.

That is the point where "survival of the fittest" becomes more than a metaphor. It becomes a reproducible engineering process.
