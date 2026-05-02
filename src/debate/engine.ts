/**
 * Round-Table Debate Engine
 *
 * At each tree node, a panel of specialised agents debates the current state.
 * The debate continues in rounds until consensus, divergence, or max rounds.
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import type {
  AgentRole,
  AgentInput,
  DebateMessage,
  DebateRound,
  DebateTranscript,
  Alternative,
  ModeratorAssessment,
  NodeContext,
  TreePhase,
  CompactDebateState,
  ToolRequest,
} from "../types/index.js";
import {
  AGENT_DEFINITIONS,
  buildAgentPrompt,
  parseAgentResponse,
} from "../agents/definitions.js";
import { ModeratorAssessmentSchema } from "../schemas/index.js";
import type { ToolBroker, IncomingToolRequest } from "../tools/broker.js";
import { renderToolEvidenceForPrompt, rollupToolEvidence } from "../tools/render.js";
import { withRetry } from "../utils/retry.js";
import { addUsageFromResponse, emptyUsage } from "../utils/usage.js";
import type { LLMUsage } from "../types/index.js";

const DEFAULT_TOOL_EVIDENCE_PROMPT_LIMIT = 8;

function mergeContextUpdates(
  target: Partial<NodeContext>,
  source: Partial<NodeContext>
): void {
  if (source.prd) target.prd = source.prd;
  if (source.implementationSpec) target.implementationSpec = source.implementationSpec;
  if (source.testStrategy) target.testStrategy = source.testStrategy;
  if (source.acceptanceCriteria?.length) {
    target.acceptanceCriteria = [
      ...new Set([...(target.acceptanceCriteria ?? []), ...source.acceptanceCriteria]),
    ];
  }
  if (source.architectureDecisions?.length) {
    target.architectureDecisions = [
      ...new Set([...(target.architectureDecisions ?? []), ...source.architectureDecisions]),
    ];
  }
  if (source.toolEvidence?.length) {
    const evidenceById = new Map((target.toolEvidence ?? []).map((item) => [item.id, item]));
    for (const item of source.toolEvidence) evidenceById.set(item.id, item);
    target.toolEvidence = [...evidenceById.values()];
  }
}

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
- The alternatives must NOT be ones already settled by Locked Decisions in the context — re-litigating a parent's consensus is not a branch.
- Style differences, library choices within the same pattern, and naming are NOT branches
- When in doubt between DIVERGING and CONTINUE, choose CONTINUE

## Rules for CONSENSUS
- Consensus does NOT require unanimity — it means no better alternative is worth a full separate branch
- One agent raising a concern without proposing a concrete alternative = consensus with noted risks
- **Early consensus is preferred when there is nothing to debate** — if NO competing alternative is alive in the transcript (neither newly proposed this round nor carried over from prior rounds nor named in the intent itself) AND the agents are aligned on direction, return CONSENSUS immediately, even in round 1.
- **CRITICAL — alternatives explicitly named in the intent count as live alternatives.** If the original intent itself says "decide between X and Y" or "compare A vs B," those are competing alternatives on the table from round 1. Do NOT treat them as already settled. They become a CONSENSUS only when the agents have actively chosen one and the others have been rejected with reasoning. They become DIVERGING when 2+ agents stake meaningfully different positions on which to pick.
- When in doubt between CONSENSUS and CONTINUE, choose CONSENSUS — but only if no competing alternative is alive.

## Rules for CONTINUE
- CONTINUE is only justified when there is genuine unresolved disagreement that more discussion could resolve, OR when alternatives have been proposed but support is still forming.
- Do NOT pick CONTINUE simply because "more rounds are available." Each extra round costs tokens; it must earn its keep.

## Tool Evidence
- Prefer positions backed by Tool Evidence over unsupported claims.
- Do not treat unsupported tool requests as evidence.
- If live alternatives depend on missing evidence, choose CONTINUE when another round could use available evidence to resolve them.

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

function initialCompactState(context: NodeContext): CompactDebateState {
  const evidenceRollup = rollupToolEvidence(context.toolEvidence);

  return {
    acceptedFacts: [
      ...(context.intentDecomposition?.loadBearingClaims ?? []),
      ...(context.intentDossier?.constraints ?? []),
    ].slice(0, 8),
    lockedDecisions: context.architectureDecisions ?? [],
    liveAlternatives: [],
    killedAlternatives: [],
    unresolvedQuestions: [
      ...(context.intentDecomposition?.undefinedTerms.map((term) => `${term.term}: ${term.needsResolution}`) ?? []),
      ...(context.intentDossier?.knownUnknowns ?? []),
    ].slice(0, 8),
    risks: context.intentDossier?.riskAreas.slice(0, 8) ?? [],
    verificationIdeas: context.intentDossier?.requiredChecks.slice(0, 8) ?? [],
    evidenceFindings: evidenceRollup.evidenceFindings,
    evidenceConstraints: evidenceRollup.evidenceConstraints,
    evidenceRisks: evidenceRollup.evidenceRisks,
    evidenceOpenQuestions: evidenceRollup.evidenceOpenQuestions,
    lastRoundSummary: "",
  };
}

function compactMessages(messages: DebateMessage[]): string {
  return messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 1200)}`)
    .join("\n\n");
}

function updateCompactState(
  previous: CompactDebateState,
  assessment: ModeratorAssessment,
  roundMessages: DebateMessage[],
): CompactDebateState {
  const mentionedRisks = roundMessages
    .flatMap((message) =>
      message.content
        .split(/\n+/)
        .filter((line) => /\brisk|gotcha|concern|failure|unknown/i.test(line))
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    )
    .filter(Boolean)
    .slice(0, 6);

  const verificationIdeas = roundMessages
    .flatMap((message) =>
      message.content
        .split(/\n+/)
        .filter((line) => /\btest|verify|check|validation|coverage/i.test(line))
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    )
    .filter(Boolean)
    .slice(0, 6);

  const liveAlternatives = assessment.outcome === "diverging" || assessment.outcome === "continue"
    ? assessment.alternatives.map((alt) => ({
        id: alt.id,
        label: alt.label,
        summary: alt.description,
        supportingAgents: alt.supportedBy,
        risks: mentionedRisks.slice(0, 3),
        verificationIdeas: verificationIdeas.slice(0, 3),
        confidence: alt.confidence,
        relevanceToIntent: alt.relevanceToIntent,
      }))
    : [];

  const killedAlternatives = assessment.outcome === "consensus"
    ? [
        ...previous.killedAlternatives,
        ...previous.liveAlternatives.map((alt) => ({
          label: alt.label,
          reason: "Debate converged without keeping this as a separate branch.",
        })),
      ].slice(-8)
    : previous.killedAlternatives;

  return {
    acceptedFacts: previous.acceptedFacts.slice(0, 8),
    lockedDecisions: previous.lockedDecisions.slice(0, 8),
    liveAlternatives,
    killedAlternatives,
    unresolvedQuestions: previous.unresolvedQuestions.slice(0, 8),
    risks: [...new Set([...previous.risks, ...mentionedRisks])].slice(0, 8),
    verificationIdeas: [...new Set([...previous.verificationIdeas, ...verificationIdeas])].slice(0, 8),
    evidenceFindings: previous.evidenceFindings.slice(0, 8),
    evidenceConstraints: previous.evidenceConstraints.slice(0, 8),
    evidenceRisks: previous.evidenceRisks.slice(0, 8),
    evidenceOpenQuestions: previous.evidenceOpenQuestions.slice(0, 8),
    lastRoundSummary: assessment.summary,
  };
}

function renderCompactForModerator(state: CompactDebateState): string {
  return [
    state.lastRoundSummary ? `Last round: ${state.lastRoundSummary}` : "",
    state.acceptedFacts.length ? `Accepted facts:\n${state.acceptedFacts.map((f) => `- ${f}`).join("\n")}` : "",
    state.lockedDecisions.length ? `Locked decisions:\n${state.lockedDecisions.map((d) => `- ${d}`).join("\n")}` : "",
    state.liveAlternatives.length
      ? `Live alternatives from prior rounds:\n${state.liveAlternatives.map((a) => `- ${a.label}: ${a.summary}`).join("\n")}`
      : "Live alternatives from prior rounds: none",
    state.killedAlternatives.length
      ? `Rejected alternatives:\n${state.killedAlternatives.map((a) => `- ${a.label}: ${a.reason}`).join("\n")}`
      : "",
    state.unresolvedQuestions.length ? `Unresolved questions:\n${state.unresolvedQuestions.map((q) => `- ${q}`).join("\n")}` : "",
    state.evidenceFindings.length ? `Evidence findings:\n${state.evidenceFindings.map((q) => `- ${q}`).join("\n")}` : "",
    state.evidenceConstraints.length ? `Evidence constraints:\n${state.evidenceConstraints.map((q) => `- ${q}`).join("\n")}` : "",
    state.evidenceRisks.length ? `Evidence risks:\n${state.evidenceRisks.map((q) => `- ${q}`).join("\n")}` : "",
    state.evidenceOpenQuestions.length ? `Evidence open questions:\n${state.evidenceOpenQuestions.map((q) => `- ${q}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebateEngineConfig {
  openai: OpenAI;
  reasoningModel: string;
  moderatorModel?: string;
  maxDebateRounds: number;
  maxBranching: number;
  dryRun?: boolean;
  onProgress?: (event: DebateProgressEvent) => void;
  nodeId?: string;
  toolBroker?: Pick<ToolBroker, "resolveRoundRequests">;
}

export type DebateProgressEvent =
  | { type: "round_start"; round: number; totalRounds: number }
  | { type: "agent_speaking"; agent: AgentRole; round: number }
  | { type: "agent_spoke"; agent: AgentRole; round: number; message: string }
  | { type: "tools_resolved"; round: number; requested: number; completed: number; skipped: number; failed: number }
  | { type: "moderator_assessment"; round: number; outcome: ModeratorAssessment }
  | { type: "debate_complete"; outcome: "consensus" | "branched" };

// ─── Engine ──────────────────────────────────────────────────────────────────

export class DebateEngine {
  private openai: OpenAI;
  private model: string;
  private moderatorModel: string;
  private maxRounds: number;
  private maxBranching: number;
  private dryRun: boolean;
  private onProgress?: (event: DebateProgressEvent) => void;
  private totalTokens = 0;
  private usage: LLMUsage = emptyUsage();
  private nodeId: string;
  private toolBroker?: Pick<ToolBroker, "resolveRoundRequests">;

  constructor(config: DebateEngineConfig) {
    this.openai = config.openai;
    this.model = config.reasoningModel;
    this.moderatorModel = config.moderatorModel ?? config.reasoningModel;
    this.maxRounds = config.maxDebateRounds;
    this.maxBranching = config.maxBranching;
    this.dryRun = config.dryRun ?? false;
    this.onProgress = config.onProgress;
    this.nodeId = config.nodeId ?? "unknown-node";
    this.toolBroker = config.toolBroker;
  }

  async runDebate(
    phase: TreePhase,
    initialContext: NodeContext,
    participatingAgents: AgentRole[]
  ): Promise<DebateTranscript> {
    let context = initialContext;
    const rounds: DebateRound[] = [];
    let allMessages: DebateMessage[] = [];
    const accumulatedContextUpdates: Partial<NodeContext> = {};
    const accumulatedToolRequests: ToolRequest[] = [];
    let compactState = initialCompactState(context);

    for (let roundNum = 1; roundNum <= this.maxRounds; roundNum++) {
      this.onProgress?.({ type: "round_start", round: roundNum, totalRounds: this.maxRounds });

      const roundMessages: DebateMessage[] = [];
      const roundAlternatives: Alternative[] = [];
      const roundToolRequests: IncomingToolRequest[] = [];

      for (const agentRole of participatingAgents) {
        this.onProgress?.({ type: "agent_speaking", agent: agentRole, round: roundNum });

        const agentDef = AGENT_DEFINITIONS[agentRole];
        const input: AgentInput = {
          priorRoundsHistory: roundNum === 1 ? allMessages : [],
          currentRoundSoFar: [...roundMessages],
          compactDebateState: roundNum > 1 ? compactState : undefined,
          context,
          phase,
          roundNumber: roundNum,
        };

        const { system, user } = buildAgentPrompt(agentDef, input);
        const rawResponse = this.dryRun
          ? this.mockAgentResponse(agentRole, roundNum, phase)
          : await this.callLLM(system, user);
        const parsed = parseAgentResponse(agentRole, rawResponse);

        if (parsed.contextUpdates) {
          mergeContextUpdates(accumulatedContextUpdates, parsed.contextUpdates);
        }

        const requestedTools: IncomingToolRequest[] = (parsed.toolRequests ?? []).map((request) => ({
          ...request,
          requestedBy: agentRole,
        }));
        roundToolRequests.push(...requestedTools);

        const message: DebateMessage = {
          role: agentRole,
          content: parsed.message,
          proposedAlternative: parsed.proposedAlternatives?.[0]?.label,
          timestamp: new Date().toISOString(),
        };

        roundMessages.push(message);

        if (parsed.proposedAlternatives) {
          for (const alt of parsed.proposedAlternatives) {
            roundAlternatives.push({
              id: `alt-${nanoid(8)}`,
              label: alt.label,
              description: alt.description,
              proposedBy: agentRole,
              supportedBy: [agentRole],
              rationale: alt.rationale,
              confidence: 0.5,
              relevanceToIntent: 0.5,
            });
          }
        }

        this.onProgress?.({
          type: "agent_spoke",
          agent: agentRole,
          round: roundNum,
          message: parsed.message,
        });
      }

      if (this.toolBroker && roundToolRequests.length > 0) {
        const resolved = await this.toolBroker.resolveRoundRequests({
          nodeId: this.nodeId,
          roundNumber: roundNum,
          requests: roundToolRequests,
          existingRequests: accumulatedToolRequests,
          existingEvidence: context.toolEvidence ?? [],
        });
        accumulatedToolRequests.push(...resolved.requests);

        if (resolved.evidence.length > 0) {
          context = {
            ...context,
            toolEvidence: [...(context.toolEvidence ?? []), ...resolved.evidence],
          };
          mergeContextUpdates(accumulatedContextUpdates, { toolEvidence: context.toolEvidence });

          const evidenceRollup = rollupToolEvidence(context.toolEvidence);
          compactState = {
            ...compactState,
            ...evidenceRollup,
          };
        }

        this.onProgress?.({
          type: "tools_resolved",
          round: roundNum,
          requested: resolved.requests.length,
          completed: resolved.requests.filter((request) => request.status === "completed").length,
          skipped: resolved.requests.filter((request) => request.status === "skipped").length,
          failed: resolved.requests.filter((request) => request.status === "failed").length,
        });
      }

      const assessment = await this.assessRound(
        roundNum,
        roundMessages,
        roundAlternatives,
        context,
        compactState
      );
      compactState = updateCompactState(compactState, assessment, roundMessages);

      this.onProgress?.({ type: "moderator_assessment", round: roundNum, outcome: assessment });

      rounds.push({
        roundNumber: roundNum,
        messages: roundMessages,
        outcome: assessment.outcome,
        alternatives: assessment.alternatives,
      });

      allMessages = [...allMessages, ...roundMessages];

      if (assessment.outcome === "consensus") {
        this.onProgress?.({ type: "debate_complete", outcome: "consensus" });
        return { rounds, finalOutcome: "consensus", summary: assessment.summary, tokenUsage: this.totalTokens, llmUsage: this.llmUsage, contextUpdates: accumulatedContextUpdates, compactState, toolRequests: accumulatedToolRequests };
      }

      if (assessment.outcome === "diverging") {
        this.onProgress?.({ type: "debate_complete", outcome: "branched" });
        return { rounds, finalOutcome: "branched", summary: assessment.summary, tokenUsage: this.totalTokens, llmUsage: this.llmUsage, contextUpdates: accumulatedContextUpdates, compactState, toolRequests: accumulatedToolRequests };
      }
    }

    this.onProgress?.({ type: "debate_complete", outcome: "consensus" });
    return {
      rounds,
      finalOutcome: "consensus",
      summary: "Max debate rounds reached. Proceeding with best available direction.",
      tokenUsage: this.totalTokens,
      llmUsage: this.llmUsage,
      contextUpdates: accumulatedContextUpdates,
      compactState,
      toolRequests: accumulatedToolRequests,
    };
  }

  private async assessRound(
    roundNumber: number,
    roundMessages: DebateMessage[],
    alternatives: Alternative[],
    context: NodeContext,
    compactState: CompactDebateState
  ): Promise<ModeratorAssessment> {
    const transcript = compactMessages(roundMessages);
    const toolEvidenceSection = renderToolEvidenceForPrompt(
      context.toolEvidence,
      DEFAULT_TOOL_EVIDENCE_PROMPT_LIMIT
    );

    const alternativesSummary =
      alternatives.length > 0
        ? `\n\n## Alternatives Proposed This Round\n${alternatives.map((a) => `- [${a.label}] by ${a.proposedBy}: ${a.description}`).join("\n")}`
        : "\n\n## Alternatives Proposed This Round\n(none surfaced this round — but check the transcript and the original intent for alternatives that are still live from prior rounds or named explicitly by the user)";

    const isLastRound = roundNumber >= this.maxRounds;

    const lockedDecisions = context.architectureDecisions ?? [];
    const lockedSection = lockedDecisions.length
      ? `\n## Locked Decisions (already settled by ancestor consensus — re-raising these is NOT a branch)\n${lockedDecisions.map((d) => `- ${d}`).join("\n")}\n`
      : "";

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
${decompositionFrame}${lockedSection}
## Compact Prior Debate State
${renderCompactForModerator(compactState)}

## Current Tool Evidence
${toolEvidenceSection || "(none)"}

## Current Round Transcript
${transcript}
${alternativesSummary}

## Assessment Required
This is round ${roundNumber} of ${this.maxRounds}. Assess the debate state.

Decision procedure:
1. List the alternatives currently alive — anything proposed this round, carried over from prior rounds, or explicitly named in the original intent (e.g. "decide between X and Y").
2. If 2+ alternatives are alive AND 2+ agents stake meaningfully different positions on which to pick → DIVERGING.
3. If alternatives are alive but agents have converged on one (the others have been actively rejected with reasoning) → CONSENSUS.
4. If NO alternatives are alive AND agents are aligned → CONSENSUS now (do not request more rounds just because rounds remain).
5. Otherwise → CONTINUE, but only if more discussion would actually change positions.
${isLastRound ? "\n⚠️ THIS IS THE FINAL ROUND. You MUST choose consensus or diverging. No continue." : ""}`;

    const rawResponse = this.dryRun
      ? this.mockModeratorResponse(roundNumber, alternatives)
      : await this.callLLM(MODERATOR_SYSTEM_PROMPT, userPrompt, this.moderatorModel);

    try {
      const jsonStr = rawResponse.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = ModeratorAssessmentSchema.parse(JSON.parse(jsonStr));
      if (parsed.outcome === "diverging") {
        parsed.alternatives = parsed.alternatives.slice(0, this.maxBranching);
      }
      if (isLastRound && parsed.outcome === "continue") {
        parsed.outcome = "consensus";
      }
      return parsed as ModeratorAssessment;
    } catch {
      return {
        outcome: isLastRound ? "consensus" : "continue",
        alternatives: [],
        summary: `Moderator assessment parse failed. ${isLastRound ? "Defaulting to consensus." : "Continuing debate."}`,
      };
    }
  }

  private async callLLM(system: string, user: string, model = this.model): Promise<string> {
    const response = await withRetry(() =>
      this.openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      })
    );
    this.totalTokens += response.usage?.total_tokens ?? 0;
    addUsageFromResponse(this.usage, response);
    return response.choices[0]?.message?.content ?? "";
  }

  get tokensUsed(): number {
    return this.totalTokens;
  }

  get llmUsage(): LLMUsage {
    return { ...this.usage };
  }

  private mockAgentResponse(
    agent: AgentRole,
    round: number,
    phase: TreePhase
  ): string {
    // Surface alternatives at the first round of requirements & architecture
    // so the orchestrator gets to exercise its branching path. Later phases
    // and rounds concur to keep the dry-run tree shallow.
    const shouldPropose =
      round === 1 &&
      ((phase === "requirements" && agent === "product-manager") ||
        (phase === "architecture" && agent === "tech-lead"));

    if (shouldPropose) {
      return `[DRY-RUN ${agent}] I see two viable directions worth exploring.

ALTERNATIVE [Approach A]: Lean, pragmatic path optimised for speed of delivery — RATIONALE: Fastest time to value with acceptable trade-offs.

ALTERNATIVE [Approach B]: Robust path optimised for long-term flexibility — RATIONALE: Better fit if requirements expand later.`;
    }

    if (round === 1 && phase === "implementation" && agent === "developer") {
      return `[DRY-RUN ${agent}] I need current docs before choosing the implementation detail.

TOOL_REQUEST [docs-fetch]: official docs for implementation`;
    }

    return `[DRY-RUN ${agent}] I concur with the current direction. No new alternatives to surface this round.`;
  }

  private mockModeratorResponse(
    round: number,
    alternatives: Alternative[]
  ): string {
    if (alternatives.length >= 2) {
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
      return JSON.stringify({
        outcome: "diverging",
        alternatives: alts,
        summary: `[dry-run] Round ${round}: agents surfaced ${alts.length} distinct approaches; branching.`,
      });
    }
    return JSON.stringify({
      outcome: "consensus",
      alternatives: [],
      summary: `[dry-run] Round ${round}: agents converged on a single direction.`,
    });
  }
}
