import { TOOL_NAMES } from "../../types/index.js";
import type { AgentOutput, ToolName } from "../../types/index.js";

export function parseToolRequests(rawResponse: string): NonNullable<AgentOutput["toolRequests"]> {
  const toolRequests: NonNullable<AgentOutput["toolRequests"]> = [];
  const toolNameSet = new Set<string>(TOOL_NAMES);
  const toolRequestRegex = /^TOOL_REQUEST\s+\[([^\]]+)\]:[ \t]*(.*?)[ \t]*$/i;
  for (const line of rawResponse.split(/\r?\n/)) {
    const toolMatch = toolRequestRegex.exec(line);
    if (!toolMatch) continue;
    const toolName = toolMatch[1].trim();
    const query = toolMatch[2].trim();
    if (toolNameSet.has(toolName) && query) {
      toolRequests.push({
        toolName: toolName as ToolName,
        query,
      });
    }
  }

  return toolRequests;
}
