import type { AgentOutput, AgentRole } from "../../types/index.js";
import { parseAlternatives } from "./parse-alternatives.js";
import { parseContextUpdates } from "./parse-context-updates.js";
import { parseSupportedAlternative } from "./parse-supported-alternative.js";
import { parseToolRequests } from "./parse-tool-requests.js";

// ─── Response Parser ─────────────────────────────────────────────────────────

export function parseAgentResponse(
  _role: AgentRole,
  rawResponse: string
): AgentOutput {
  const alternatives = parseAlternatives(rawResponse);
  const contextUpdates = parseContextUpdates(rawResponse);
  const toolRequests = parseToolRequests(rawResponse);

  return {
    message: rawResponse,
    proposedAlternatives: alternatives.length > 0 ? alternatives : undefined,
    supportedAlternativeId: parseSupportedAlternative(rawResponse),
    contextUpdates: Object.keys(contextUpdates).length > 0 ? contextUpdates : undefined,
    toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
  };
}
