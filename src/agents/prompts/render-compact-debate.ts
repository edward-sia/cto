import type { AgentInput } from "../../types/index.js";

export function renderCompactDebateState(state: NonNullable<AgentInput["compactDebateState"]>): string {
  const lines = ["## Compact Debate Context For This Round"];
  if (state.lastRoundSummary) {
    lines.push(`Last round: ${state.lastRoundSummary}`);
  }
  if (state.acceptedFacts.length) {
    lines.push("", "Accepted facts:", ...state.acceptedFacts.map((item) => `- ${item}`));
  }
  if (state.lockedDecisions.length) {
    lines.push("", "Locked decisions:", ...state.lockedDecisions.map((item) => `- ${item}`));
  }
  if (state.liveAlternatives.length) {
    lines.push(
      "",
      "Live alternatives:",
      ...state.liveAlternatives.map((alt) =>
        `- ${alt.label}: ${alt.summary} (support: ${alt.supportingAgents.join(", ") || "none"}, confidence=${alt.confidence.toFixed(2)}, relevance=${alt.relevanceToIntent.toFixed(2)})`
      )
    );
  }
  if (state.killedAlternatives.length) {
    lines.push(
      "",
      "Rejected alternatives:",
      ...state.killedAlternatives.map((alt) => `- ${alt.label}: ${alt.reason}`)
    );
  }
  if (state.unresolvedQuestions.length) {
    lines.push("", "Unresolved questions:", ...state.unresolvedQuestions.map((item) => `- ${item}`));
  }
  if (state.risks.length) {
    lines.push("", "Risks to address:", ...state.risks.map((item) => `- ${item}`));
  }
  if (state.verificationIdeas.length) {
    lines.push("", "Verification ideas:", ...state.verificationIdeas.map((item) => `- ${item}`));
  }
  const evidenceFindings = state.evidenceFindings ?? [];
  if (evidenceFindings.length) {
    lines.push("", "Evidence findings:", ...evidenceFindings.map((item) => `- ${item}`));
  }
  const evidenceConstraints = state.evidenceConstraints ?? [];
  if (evidenceConstraints.length) {
    lines.push("", "Evidence constraints:", ...evidenceConstraints.map((item) => `- ${item}`));
  }
  const evidenceRisks = state.evidenceRisks ?? [];
  if (evidenceRisks.length) {
    lines.push("", "Evidence risks:", ...evidenceRisks.map((item) => `- ${item}`));
  }
  const evidenceOpenQuestions = state.evidenceOpenQuestions ?? [];
  if (evidenceOpenQuestions.length) {
    lines.push("", "Evidence open questions:", ...evidenceOpenQuestions.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}
