import type { CoverageDimension } from "./types.js";

export const FIXED_CORE_DIMENSIONS: CoverageDimension[] = [
  {
    id: "correctness",
    label: "Correctness",
    description:
      "Does this satisfy the intent's load-bearing claims and acceptance criteria? Addressed when a proposal is tied to a specific claim or acceptance criterion.",
    source: "fixed-core",
  },
  {
    id: "fit-for-stakeholder",
    label: "Fit for Stakeholder",
    description:
      "Who has to use, run, or maintain this, and does the design serve them? Addressed when a stakeholder is named with a concrete claim about whether the solution works for them.",
    source: "fixed-core",
  },
  {
    id: "operability",
    label: "Operability",
    description:
      "Can this be deployed, observed, debugged, and recovered in production? Addressed when at least one explicit statement covers deploy/run, failure detection, and recovery.",
    source: "fixed-core",
  },
  {
    id: "assumptions",
    label: "Assumptions / Unverified Dependencies",
    description:
      "What are we assuming about the world that we have not validated? Addressed when assumptions are listed explicitly so they can be tested or pushed into known-unknowns.",
    source: "fixed-core",
  },
  {
    id: "second-order-effects",
    label: "Second-Order Effects",
    description:
      "What does this enable or block downstream? What becomes harder after this ships? Addressed when at least one consequence beyond the immediate change is named.",
    source: "fixed-core",
  },
];

export function combineCoverageDimensions(
  intentDerived: CoverageDimension[]
): CoverageDimension[] {
  const combined: CoverageDimension[] = [...FIXED_CORE_DIMENSIONS];
  const seen = new Set(combined.map((d) => d.id));
  for (const dim of intentDerived) {
    if (seen.has(dim.id)) continue;
    combined.push({ ...dim, source: "intent-derived" });
    seen.add(dim.id);
  }
  return combined;
}
