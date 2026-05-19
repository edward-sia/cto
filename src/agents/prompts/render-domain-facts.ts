import type { DomainFacts } from "../../types/index.js";

export function renderDomainFacts(facts: DomainFacts): string {
  const lines: string[] = [
    "## Verified Domain Ground Truth",
    "",
    "> These facts have been verified against real data or documentation. Treat them as hard constraints, not assumptions.",
    "",
    `**Domain:** ${facts.domain}`,
  ];

  if (facts.schemas?.length) {
    lines.push("", "**Data Schemas:**");
    for (const schema of facts.schemas) {
      const fieldList = schema.fields
        .map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`)
        .join(", ");
      lines.push(`- ${schema.name}: ${fieldList}`);
    }
  }

  if (facts.apiEndpoints?.length) {
    lines.push("", "**API Endpoints:**");
    for (const ep of facts.apiEndpoints) {
      lines.push(`- ${ep.method} ${ep.path}: ${ep.description}`);
    }
  }

  if (facts.constraints.length) {
    lines.push("", "**Verified Constraints:**");
    for (const c of facts.constraints) lines.push(`- ${c}`);
  }

  if (facts.knownAbsences.length) {
    lines.push(
      "",
      "**Known Absences (these do NOT exist — do not design solutions that assume they do):**"
    );
    for (const a of facts.knownAbsences) lines.push(`- ${a}`);
  }

  if (facts.rawContext) {
    lines.push("", "**Additional Context:**", facts.rawContext);
  }

  return lines.join("\n");
}
