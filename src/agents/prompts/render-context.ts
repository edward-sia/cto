import { renderToolEvidenceForPrompt } from "../../tools/render.js";
import type { AgentInput } from "../../types/index.js";
import { renderDomainFacts } from "./render-domain-facts.js";

const DEFAULT_TOOL_EVIDENCE_PROMPT_LIMIT = 8;

export function renderAgentContext(input: AgentInput): string {
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

  const domainFactsSection = input.context.domainFacts
    ? renderDomainFacts(input.context.domainFacts)
    : "";
  const repositoryContextSection = input.context.repositoryContext
    ? `## Repository Context
Current repository root: ${input.context.repositoryContext.workingDirectory}`
    : "";
  const enabledToolsSection = input.enabledTools?.length
    ? `## Enabled Research Tools
${input.enabledTools.map((tool) => `- ${tool}`).join("\n")}`
    : "";
  const codebaseToolGuidance =
    input.context.repositoryContext && (input.enabledTools?.includes("repo-map") || input.enabledTools?.includes("repo-search"))
      ? `## Codebase Research Tool Guidance
For codebase or repository structure research, request \`repo-map\` when available. For targeted code references, request \`repo-search\` before concluding that the codebase is unknown. Use \`repo-read\` after repo-search identifies a specific file path that needs closer inspection.`
      : "";
  const toolEvidenceSection = renderToolEvidenceForPrompt(
    input.context.toolEvidence,
    input.toolEvidencePromptLimit ?? DEFAULT_TOOL_EVIDENCE_PROMPT_LIMIT
  );

  const contextSummary = [
    `## Original Intent\n${input.context.originalIntent}`,
    repositoryContextSection,
    enabledToolsSection,
    codebaseToolGuidance,
    input.context.humanRevisionPrompt
      ? `## Human Revision\nThe human reviewer added this steering instruction before implementation:\n${input.context.humanRevisionPrompt}`
      : "",
    domainFactsSection,
    toolEvidenceSection,
    decompositionSection,
    input.context.prd ? `## PRD\n${input.context.prd}` : "",
    input.context.acceptanceCriteria?.length
      ? `## Acceptance Criteria\n${input.context.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`
      : "",
    input.context.architectureDecisions?.length
      ? `## Locked Decisions (settled by ancestor consensus — DO NOT reopen or propose alternatives to these)\n${input.context.architectureDecisions.map((d) => `- ${d}`).join("\n")}\n\nBuild on top of these. If you genuinely disagree, raise a concern inline — but do not surface them as ALTERNATIVE [...]; they are not branching points.`
      : "",
    input.context.openCoverageGaps?.length
      ? `## Open Coverage Concerns (identified by Critic — address these in your contribution)\n${input.context.openCoverageGaps.map((g) => `- **${g.dimension}**: ${g.reason}`).join("\n")}\n\nThese were NOT covered in the parent debate. Surface concrete proposals or evidence addressing them.`
      : "",
    input.context.implementationSpec
      ? `## Implementation Spec\n${input.context.implementationSpec}`
      : "",
    input.context.testStrategy
      ? `## Test Strategy\n${input.context.testStrategy}`
      : "",
    input.context.branchDecision
      ? `## Branch Context\nThis discussion follows the decision: ${input.context.branchDecision}`
      : "",
    input.context.ancestorSummaries.length
      ? `## Previous Discussion Summaries\n${input.context.ancestorSummaries.map((s, i) => `### Level ${i}\n${s}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return contextSummary;
}
