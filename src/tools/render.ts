import type { ToolEvidence } from "../types/index.js";

export interface ToolEvidenceRollup {
  evidenceFindings: string[];
  evidenceConstraints: string[];
  evidenceRisks: string[];
  evidenceOpenQuestions: string[];
}

export function renderToolEvidenceForPrompt(
  evidence: ToolEvidence[] | undefined,
  maxItems: number
): string {
  const limit = Number.isFinite(maxItems) ? Math.floor(maxItems) : 0;
  if (limit <= 0) return "";

  const items = (evidence ?? []).slice(-limit);
  if (items.length === 0) return "";

  const lines = ["## Tool Evidence", ""];
  for (const item of items) {
    lines.push(`[${item.toolName}] ${item.query}`);
    lines.push(`Requested by: ${[item.requestedBy, ...item.additionalRequesters].join(", ")}`);
    lines.push(`Summary: ${item.summary}`);
    appendList(lines, "Findings", item.findings);
    appendList(lines, "Decision relevance", item.decisionRelevance);
    appendList(lines, "Constraints", item.constraintsDiscovered);
    appendList(lines, "Risks", item.risksDiscovered);
    appendList(lines, "Open questions", item.openQuestions);
    appendList(
      lines,
      "Sources",
      item.sources.map((source) => {
        const label = source.title ?? source.path ?? source.url ?? "source";
        const locator = source.url ?? source.path ?? "";
        return `${label}${locator ? ` (${locator})` : ""}, retrieved ${source.retrievedAt}`;
      })
    );
    appendList(lines, "Limitations", item.limitations);
    lines.push(`Confidence: ${item.confidence.toFixed(2)}`, "");
  }
  return lines.join("\n").trim();
}

export function rollupToolEvidence(evidence: ToolEvidence[] | undefined): ToolEvidenceRollup {
  const items = evidence ?? [];
  return {
    evidenceFindings: uniqueFlat(items.flatMap((item) => item.findings)).slice(-8),
    evidenceConstraints: uniqueFlat(items.flatMap((item) => item.constraintsDiscovered)).slice(-8),
    evidenceRisks: uniqueFlat(items.flatMap((item) => item.risksDiscovered)).slice(-8),
    evidenceOpenQuestions: uniqueFlat(items.flatMap((item) => item.openQuestions)).slice(-8),
  };
}

function appendList(lines: string[], label: string, values: string[]): void {
  const normalizedValues = uniqueFlat(values);
  if (normalizedValues.length === 0) return;
  lines.push(`${label}:`);
  for (const value of normalizedValues) lines.push(`- ${value}`);
}

function uniqueFlat(values: string[]): string[] {
  return [...new Set(values.map(normalizePromptListValue).filter(Boolean))];
}

function normalizePromptListValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
