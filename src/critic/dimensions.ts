import type { CoverageDimension } from "./types.js";
import type { IntentDecomposition } from "../types/index.js";

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

const INTENT_DERIVED_RULES: Array<{
  id: string;
  label: string;
  description: string;
  keywords: string[];
}> = [
  {
    id: "security",
    label: "Security / Threat Model",
    description:
      "Covers auth, secrets, PII, or external input handling. Addressed when threat surfaces are named and mitigations are proposed.",
    keywords: ["auth", "secret", "pii", "personal data", "user data", "login", "token", "api key", "password", "credential", "external input", "untrusted", "injection", "csrf", "xss", "oauth"],
  },
  {
    id: "performance",
    label: "Performance / Scale",
    description:
      "Covers throughput, latency, or scale under realistic load. Addressed when a concrete performance claim or budget is stated.",
    keywords: ["performance", "scale", "real-time", "hot path", "large data", "throughput", "latency", "high traffic", "load", "benchmark", "profil", "cache", "paginate", "streaming"],
  },
  {
    id: "compliance",
    label: "Compliance / Legal",
    description:
      "Covers regulatory or legal obligations. Addressed when the relevant regulation is named and the design's response to it is stated.",
    keywords: ["compliance", "legal", "gdpr", "pci", "hipaa", "regulat", "audit trail", "sox", "ccpa", "data retention", "privacy law"],
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description:
      "Covers access for users with disabilities. Addressed when WCAG level or specific assistive-technology behaviour is discussed.",
    keywords: ["accessib", "a11y", "wcag", "screen reader", "aria", "disability", "keyboard navigation", "colour contrast", "focus management"],
  },
  {
    id: "concurrency",
    label: "Concurrency / Consistency",
    description:
      "Covers shared state, race conditions, or distributed coordination. Addressed when locking, ordering, or consistency guarantees are named.",
    keywords: ["concurrent", "distributed", "shared state", "race condition", "transaction", "eventual consistency", "lock", "atomic", "mutex", "deadlock", "isolation"],
  },
];

export function deriveIntentDimensions(
  intent: string,
  decomposition: IntentDecomposition
): CoverageDimension[] {
  const haystack = [
    intent,
    ...(decomposition.loadBearingClaims ?? []),
    ...(decomposition.feasibilityFlags ?? []),
    ...(decomposition.knownUnknowns ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const derived: CoverageDimension[] = [];
  for (const rule of INTENT_DERIVED_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      derived.push({
        id: rule.id,
        label: rule.label,
        description: rule.description,
        source: "intent-derived",
      });
    }
  }
  return derived;
}

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
