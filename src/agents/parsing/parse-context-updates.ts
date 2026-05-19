import type { NodeContext } from "../../types/index.js";

export function parseContextUpdates(rawResponse: string): Partial<NodeContext> {
  const contextUpdates: Partial<NodeContext> = {};
  const cuRegex = /CONTEXT_UPDATE\s+\[([^\]]+)\]:\s*(.+?)(?=\nCONTEXT_UPDATE|\n##|\n\n|$)/gis;
  let cuMatch: RegExpExecArray | null;
  while ((cuMatch = cuRegex.exec(rawResponse)) !== null) {
    const field = cuMatch[1].trim().toLowerCase();
    const value = cuMatch[2].trim();
    switch (field) {
      case "prd":
        contextUpdates.prd = value;
        break;
      case "acceptance-criteria":
        contextUpdates.acceptanceCriteria = [
          ...(contextUpdates.acceptanceCriteria ?? []),
          value,
        ];
        break;
      case "architecture-decision":
        contextUpdates.architectureDecisions = [
          ...(contextUpdates.architectureDecisions ?? []),
          value,
        ];
        break;
      case "implementation-spec":
        contextUpdates.implementationSpec = value;
        break;
      case "test-strategy":
        contextUpdates.testStrategy = value;
        break;
    }
  }

  return contextUpdates;
}
