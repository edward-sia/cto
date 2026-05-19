import type { AgentInput } from "../../types/index.js";
import type { AgentDefinition } from "../types.js";
import { renderAgentContext } from "./render-context.js";
import { renderCompactDebateState } from "./render-compact-debate.js";
import { renderDebateMessages } from "./render-debate-messages.js";

// ─── Agent Prompt Builder ────────────────────────────────────────────────────

export function buildAgentPrompt(
  agent: AgentDefinition,
  input: AgentInput
): { system: string; user: string } {
  const contextSummary = renderAgentContext(input);

  const priorRoundsSection = input.priorRoundsHistory.length
    ? `## Previous Rounds\n${renderDebateMessages(input.priorRoundsHistory)}`
    : "";

  const compactDebateSection = input.compactDebateState
    ? renderCompactDebateState(input.compactDebateState)
    : "";

  const currentRoundSection = input.currentRoundSoFar.length
    ? `## This Round — Agents Who Have Already Spoken\n${renderDebateMessages(input.currentRoundSoFar)}\n\nNote: you can reference what they said and build on, challenge, or support their points.`
    : "";

  const openingLine =
    !input.priorRoundsHistory.length && !input.currentRoundSoFar.length
      ? "You are opening this debate — no other agents have spoken yet."
      : "";

  const user = `# Current Discussion — Phase: ${input.phase.toUpperCase()} — Round ${input.roundNumber}

${contextSummary}

${[compactDebateSection, priorRoundsSection, currentRoundSection, openingLine].filter(Boolean).join("\n\n")}

---

It is now YOUR turn to speak. Respond in your defined output format.

Stay within the **In scope** items above. Do NOT introduce concerns from **Out of scope**. Treat **Load-bearing claims** as constraints. Treat **Undefined terms** as the highest-priority debate items.

Only propose ALTERNATIVE [...] when you see genuinely different approaches worth full separate exploration AND the alternative is on-topic for the original intent AND it is NOT already settled in Locked Decisions. Otherwise, surface concerns and recommendations inline. If you have nothing meaningfully new to add this round, say so concisely — empty rounds let the moderator end the debate early and save tokens.
Structure alternatives as:
ALTERNATIVE [label]: [description] — RATIONALE: [why this deserves its own branch]

Emit CONTEXT_UPDATE lines only for concrete, new additions not already present in the context above.`;

  return { system: agent.systemPrompt, user };
}
