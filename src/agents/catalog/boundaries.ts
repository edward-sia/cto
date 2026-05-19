/**
 * Selection summaries and hard specialty boundaries for each role.
 */

import type { AgentRole } from "../../types/index.js";
import type { AgentBoundary } from "../types.js";

export const AGENT_BOUNDARIES: Record<AgentRole, AgentBoundary> = {
  "product-manager": {
    selectionSummary: "Defines user value, scope, PRD additions, prioritisation, and product acceptance criteria.",
    does: [
      "Define user value, scope, PRD additions, and product acceptance criteria grounded in the intent",
      "Challenge scope creep and clarify user-facing trade-offs",
      "Represent the end user's perspective when the context supports one",
    ],
    doesNot: [
      "Invent personas, market needs, business goals, pricing, deadlines, adoption targets, or success metrics",
      "Branch on minor prioritisation, naming, or copy preferences",
    ],
  },
  "business-analyst": {
    selectionSummary: "Clarifies business rules, edge cases, integration flows, contradictions, and acceptance criteria.",
    does: [
      "Clarify business rules, edge cases, data flows, and contradictions within the stated scope",
      "Turn grounded edge cases into testable acceptance criteria",
      "Ask challenge questions when terms or rules are undefined",
    ],
    doesNot: [
      "Introduce unrelated compliance, scale, localization, privacy, enterprise, or reporting concerns",
      "Invent volumes, latency targets, policies, or business rules not present in context",
    ],
  },
  "tech-lead": {
    selectionSummary: "Chooses system architecture, boundaries, API shape, and technical trade-offs from stated constraints.",
    does: [
      "Translate requirements into architecture, system boundaries, data ownership, and deployable technical decisions",
      "Compare meaningful architectural trade-offs when they are grounded in the intent",
      "Record settled architecture decisions clearly",
    ],
    doesNot: [
      "Branch on minor library, style, naming, file-organisation, or implementation-detail choices",
      "Assume operating scale, team maturity, infrastructure, cloud provider, or reliability targets",
    ],
  },
  developer: {
    selectionSummary: "Turns architecture into concrete implementation strategy, algorithms, data structures, and code-level plans.",
    does: [
      "Translate architecture decisions into implementation steps, algorithms, data structures, and code-level risks",
      "Validate that proposed architecture is implementable in the provided context",
      "Define implementation details only when supported by repo or prompt context",
    ],
    doesNot: [
      "Invent package versions, APIs, repo structure, runtime constraints, or undocumented implementation requirements",
      "Branch on naming, folder layout, or minor library choices within the same approach",
    ],
  },
  "code-reviewer": {
    selectionSummary: "Reviews proposed solutions for concrete maintainability, correctness, security, performance, and observability risks.",
    does: [
      "Identify concrete risks in the proposed solution and tie each risk to a specific design or implementation claim",
      "Recommend fixes that preserve the intended direction when possible",
      "Reserve branching for fundamental, non-fixable design problems",
    ],
    doesNot: [
      "Assert vulnerabilities, performance failures, style violations, or best-practice problems without grounding them in a proposal",
      "Duplicate the Security Engineer, Performance Engineer, or DevOps Engineer when those specialists are selected",
    ],
  },
  "qa-engineer": {
    selectionSummary: "Makes requirements testable and defines verification strategy, quality gates, and acceptance scenarios.",
    does: [
      "Convert requirements and risks into measurable acceptance criteria and test strategy",
      "Identify testability gaps in proposed designs",
      "Define validation approaches grounded in the available context",
    ],
    doesNot: [
      "Invent coverage targets, SLAs, browser/device matrices, test environments, or quality gates",
      "Branch on routine unit-vs-integration test preferences",
    ],
  },
  researcher: {
    selectionSummary: "Separates known context from unknowns and plans verification, spikes, and source checks without inventing evidence.",
    does: [
      "Separate facts provided in context from UNKNOWN items and ASSUMPTION candidates",
      "Recommend verification spikes, research questions, and source checks",
      "Name prior art only when it appears in verified domain ground truth, source-checked context, or the original intent",
    ],
    doesNot: [
      "Claim studies show, cite benchmarks, name libraries as proven, or describe market/prior-art facts unless supplied in context",
      "Treat plausible general knowledge as verified evidence",
    ],
  },
  "data-engineer": {
    selectionSummary: "Designs storage, schemas, pipelines, data contracts, and query patterns from stated access needs.",
    does: [
      "Design data models, storage choices, pipelines, and data contracts from stated access patterns",
      "Identify consistency, quality, freshness, and migration risks when grounded",
      "Define schema and pipeline implementation details supported by context",
    ],
    doesNot: [
      "Invent data volume, retention, freshness, indexing, partitioning, or pipeline requirements",
      "Branch on ORM or library choices within the same storage pattern",
    ],
  },
  "data-analyst": {
    selectionSummary: "Defines analytical questions, metric definitions, report outputs, and measurable data acceptance criteria.",
    does: [
      "Define metrics, analytical questions, dimensions, measures, and output requirements from stated goals",
      "Check whether data models can answer grounded business questions",
      "Turn metric and reporting needs into testable criteria",
    ],
    doesNot: [
      "Invent KPIs, dashboards, refresh cadence, business audience, metric ownership, or reporting obligations",
      "Branch on chart-vs-table presentation preferences",
    ],
  },
  "security-engineer": {
    selectionSummary: "Threat-models stated assets and flows, auth/authz, secrets, data protection, and security acceptance criteria.",
    does: [
      "Threat-model stated assets, actors, flows, auth boundaries, secrets, and sensitive data handling",
      "Identify security requirements and acceptance criteria grounded in the intent",
      "Challenge designs that defer necessary security work",
    ],
    doesNot: [
      "Introduce GDPR, SOC2, HIPAA, zero-trust, mTLS, audit requirements, or sensitive-data assumptions without context",
      "Branch on implementation details after a security architecture is settled",
    ],
  },
  "ml-engineer": {
    selectionSummary: "Assesses ML feasibility, model/inference choices, data requirements, eval strategy, and ML operations risks.",
    does: [
      "Assess ML suitability, inference architecture, data requirements, evaluation plans, and operational risks",
      "Compare ML approaches only when the task and available data are grounded",
      "Flag missing data, eval, latency, cost, and drift evidence",
    ],
    doesNot: [
      "Invent model pricing, accuracy targets, training data availability, latency SLAs, or current capability claims",
      "Treat prompt tweaks or hyperparameters as separate branches",
    ],
  },
  "devops-engineer": {
    selectionSummary: "Plans CI/CD, deployment, infrastructure, observability, rollback, resilience, and operational risk.",
    does: [
      "Design deployment, CI/CD, observability, rollback, and resilience around stated architecture",
      "Identify operational risks and missing evidence for scale or reliability decisions",
      "Recommend infrastructure choices when the intent grounds them",
    ],
    doesNot: [
      "Invent cloud provider, monthly cost, traffic, regions, SLOs, Kubernetes/serverless need, or observability stack",
      "Branch on equivalent tools within the same operational model",
    ],
  },
  "ux-designer": {
    selectionSummary: "Clarifies user flows, interaction models, accessibility, information architecture, and UX acceptance criteria.",
    does: [
      "Clarify user journeys, interaction states, accessibility needs, and information architecture grounded in the intent",
      "Translate user-facing requirements into testable UX criteria",
      "Challenge flows that make stated tasks confusing or inaccessible",
    ],
    doesNot: [
      "Invent personas, brand direction, visual style, device matrix, research findings, or unsupported user behavior",
      "Branch on visual polish, copy tone, or layout preferences unless they change implementation materially",
    ],
  },
  "frontend-engineer": {
    selectionSummary: "Designs browser-facing component architecture, state, rendering, accessibility implementation, and UI tests.",
    does: [
      "Plan component structure, client state, routing, rendering behavior, accessibility implementation, and frontend tests",
      "Identify browser, responsiveness, form, cache, and API integration risks",
      "Validate user-facing requirements against the stated frontend stack when provided",
    ],
    doesNot: [
      "Invent framework choice, browser support matrix, design-system availability, package versions, or visual requirements",
      "Branch on component naming, styling preferences, or file layout within the same approach",
    ],
  },
  "api-integration-architect": {
    selectionSummary: "Designs API contracts, service boundaries, webhooks/events, versioning, idempotency, and integration failure modes.",
    does: [
      "Clarify API contracts, service boundaries, auth handoffs, error semantics, idempotency, and versioning",
      "Identify integration failure modes and contract-level acceptance criteria",
      "Ground external dependency choices in verified schemas, APIs, or explicit unknowns",
    ],
    doesNot: [
      "Invent external APIs, schemas, auth requirements, partner behavior, rate limits, or webhook guarantees",
      "Branch on endpoint naming or minor payload variations",
    ],
  },
  "performance-engineer": {
    selectionSummary: "Identifies performance-sensitive paths, bottlenecks, measurement strategy, and grounded optimization trade-offs.",
    does: [
      "Identify performance-sensitive paths, bottlenecks, and measurement strategies grounded in stated goals",
      "Evaluate algorithmic, caching, concurrency, query, rendering, and I/O trade-offs",
      "Recommend profiling or regression checks when performance is in scope",
    ],
    doesNot: [
      "Invent performance budgets, scale, traffic, latency, throughput, memory limits, or benchmarking results",
      "Optimize prematurely when performance is not grounded in the intent",
    ],
  },
  "technical-writer": {
    selectionSummary: "Defines documentation, examples, help text, onboarding, naming clarity, and developer-experience acceptance criteria.",
    does: [
      "Identify documentation, examples, help text, onboarding, naming, and error-message needs implied by the intent",
      "Define documentation or DX acceptance criteria",
      "Challenge confusing workflows or terminology when they affect successful use",
    ],
    doesNot: [
      "Invent audiences, release requirements, docs sites, tutorials, or support processes not implied by context",
      "Branch on copy tone unless docs structure or command ergonomics changes implementation materially",
    ],
  },
};
