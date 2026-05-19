import type { AgentOutput } from "../../types/index.js";

export function parseAlternatives(rawResponse: string): NonNullable<AgentOutput["proposedAlternatives"]> {
  const alternatives: NonNullable<AgentOutput["proposedAlternatives"]> = [];

  const altRegex =
    /ALTERNATIVE\s+\[([^\]]+)\]:\s*(.+?)(?:\s*—\s*RATIONALE:\s*(.+?))?(?=\nALTERNATIVE|\n##|\n\n|$)/gis;
  let match: RegExpExecArray | null;
  while ((match = altRegex.exec(rawResponse)) !== null) {
    alternatives.push({
      label: match[1].trim(),
      description: match[2].trim(),
      rationale: match[3]?.trim() ?? "No rationale provided",
    });
  }

  return alternatives;
}
