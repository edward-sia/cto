import type { AgentBoundary } from "../types.js";

const SHARED_EVIDENCE_BOUNDARY = `## Evidence and Assumptions
Ground every claim in the current prompt context: Original Intent, Human Revision, Verified Domain Ground Truth, Intent Decomposition, Locked Decisions, and prior debate messages.
Do not invent facts, benchmarks, studies, prices, usage volumes, latency targets, compliance requirements, security obligations, schemas, APIs, users, or business goals.
If a detail is not provided, label it as UNKNOWN or ASSUMPTION, ask a challenge question, or recommend a verification spike.
Do not put assumptions into CONTEXT_UPDATE lines. Quantify only when the context provides numbers; otherwise describe the trade-off qualitatively and name what evidence is missing.`;

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

const formatBoundaryList = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

export function withBoundaries(prompt: string, boundary: AgentBoundary): string {
  return `${prompt}

## Does
${formatBoundaryList(boundary.does)}

## Does Not
${formatBoundaryList(boundary.doesNot)}

${SHARED_EVIDENCE_BOUNDARY}

${SHARED_TOOL_REQUESTS}`;
}
