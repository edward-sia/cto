import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, buildAgentPrompt, parseAgentResponse } from "../../src/agents/definitions.js";
import { ToolEvidenceSchema, ToolRequestSchema } from "../../src/schemas/index.js";
import { AGENT_ROLES, PHASE_AGENTS } from "../../src/types/index.js";
import type { ToolEvidence } from "../../src/types/index.js";

describe("parseAgentResponse", () => {
  it("extracts structured tool requests while keeping normal context updates", () => {
    const raw = `## Implementation Plan
We need current docs before choosing the CLI shape.

TOOL_REQUEST [docs-fetch]: official Commander.js custom option parser documentation
TOOL_REQUEST [repo-search]: collectValues helper in CLI options
CONTEXT_UPDATE [implementation-spec]: Preserve existing Commander option parser patterns.`;

    const result = parseAgentResponse("developer", raw);

    expect(result.toolRequests).toEqual([
      {
        toolName: "docs-fetch",
        query: "official Commander.js custom option parser documentation",
      },
      {
        toolName: "repo-search",
        query: "collectValues helper in CLI options",
      },
    ]);
    expect(result.contextUpdates?.implementationSpec).toBe(
      "Preserve existing Commander option parser patterns."
    );
  });

  it("ignores empty tool requests without consuming following tool request lines", () => {
    const raw = `TOOL_REQUEST [docs-fetch]:
TOOL_REQUEST [repo-search]: collectValues helper in CLI options
CONTEXT_UPDATE [implementation-spec]: Preserve existing Commander option parser patterns.`;

    const result = parseAgentResponse("developer", raw);

    expect(result.toolRequests).toEqual([
      {
        toolName: "repo-search",
        query: "collectValues helper in CLI options",
      },
    ]);
    expect(result.contextUpdates?.implementationSpec).toBe(
      "Preserve existing Commander option parser patterns."
    );
  });

  it("accumulates each qa-engineer test scenario into a separate acceptanceCriteria entry", () => {
    const raw = `## Test Strategy
Here is the plan.

CONTEXT_UPDATE [acceptance-criteria]: Test: Concurrent inserts converge — Given two clients insert at the same offset simultaneously, when both ops reach the server, then both clients converge to identical document state
CONTEXT_UPDATE [acceptance-criteria]: Test: Offline edit replay — Given a client accumulates edits while offline, when it reconnects, then all edits are applied without data loss
CONTEXT_UPDATE [acceptance-criteria]: Test: Stale op resilience — Given a client submits an op at a stale version, when the server receives it, then it is transformed and applied correctly
CONTEXT_UPDATE [test-strategy]: Unit tests for transform logic; integration tests for concurrent-edit convergence, offline replay, stale-op handling`;

    const result = parseAgentResponse("qa-engineer", raw);

    expect(result.contextUpdates?.acceptanceCriteria).toHaveLength(3);
    expect(result.contextUpdates?.acceptanceCriteria?.[0]).toContain("Concurrent inserts converge");
    expect(result.contextUpdates?.acceptanceCriteria?.[1]).toContain("Offline edit replay");
    expect(result.contextUpdates?.acceptanceCriteria?.[2]).toContain("Stale op resilience");
    expect(result.contextUpdates?.testStrategy).toContain("integration tests");
  });
});

describe("buildAgentPrompt", () => {
  it("includes a human revision prompt in the debate context", () => {
    const { user } = buildAgentPrompt(AGENT_DEFINITIONS["tech-lead"], {
      priorRoundsHistory: [],
      currentRoundSoFar: [],
      phase: "implementation",
      roundNumber: 1,
      context: {
        originalIntent: "Build a REST API",
        humanRevisionPrompt: "Prefer local-first storage.",
        ancestorSummaries: [],
      },
    });

    expect(user).toContain("Human Revision");
    expect(user).toContain("Prefer local-first storage.");
  });

  it("renders tool request instructions and compact tool evidence", () => {
    const { system, user } = buildAgentPrompt(AGENT_DEFINITIONS["developer"], {
      priorRoundsHistory: [],
      currentRoundSoFar: [],
      phase: "implementation",
      roundNumber: 1,
      context: {
        originalIntent: "Add tool support",
        ancestorSummaries: [],
        toolEvidence: [
          {
            id: "evidence-1",
            requestId: "request-1",
            toolName: "repo-search",
            query: "buildAgentPrompt",
            requestedBy: "developer",
            additionalRequesters: [],
            nodeId: "node-1",
            roundNumber: 1,
            summary: "buildAgentPrompt renders context sections.",
            findings: ["Context sections are joined before the turn instruction."],
            decisionRelevance: ["Render tool evidence as another context section."],
            constraintsDiscovered: ["Keep prompts compact."],
            risksDiscovered: ["Do not treat requests as evidence."],
            openQuestions: [],
            sources: [{ path: "src/agents/definitions.ts", retrievedAt: "2026-05-02T00:00:00.000Z" }],
            limitations: ["Fixture evidence."],
            confidence: 0.8,
            createdAt: "2026-05-02T00:00:01.000Z",
          },
        ],
      },
    });

    expect(system).toContain("## Tool Requests");
    expect(system).toContain("TOOL_REQUEST [tool-name]: specific query or target");
    expect(user).toContain("## Tool Evidence");
    expect(user).toContain("buildAgentPrompt renders context sections.");
  });

  it("caps rendered tool evidence to the most recent items", () => {
    const toolEvidence: ToolEvidence[] = Array.from({ length: 3 }, (_, index) => ({
      id: `evidence-${index + 1}`,
      requestId: `request-${index + 1}`,
      toolName: "repo-search",
      query: `query-${index + 1}`,
      requestedBy: "developer",
      additionalRequesters: [],
      nodeId: "node-1",
      roundNumber: 1,
      summary: `Evidence summary ${index + 1}`,
      findings: [`Finding ${index + 1}`],
      decisionRelevance: [],
      constraintsDiscovered: [],
      risksDiscovered: [],
      openQuestions: [],
      sources: [],
      limitations: [],
      confidence: 0.8,
      createdAt: "2026-05-02T00:00:01.000Z",
    }));

    const { user } = buildAgentPrompt(AGENT_DEFINITIONS["developer"], {
      priorRoundsHistory: [],
      currentRoundSoFar: [],
      toolEvidencePromptLimit: 2,
      phase: "implementation",
      roundNumber: 1,
      context: {
        originalIntent: "Add tool support",
        ancestorSummaries: [],
        toolEvidence,
      },
    });

    expect(user).not.toContain("Evidence summary 1");
    expect(user).toContain("Evidence summary 2");
    expect(user).toContain("Evidence summary 3");
  });

  it("uses compact debate state instead of full prior transcript when provided", () => {
    const { user } = buildAgentPrompt(AGENT_DEFINITIONS["developer"], {
      priorRoundsHistory: [],
      currentRoundSoFar: [],
      compactDebateState: {
        acceptedFacts: ["The API must support todos."],
        lockedDecisions: ["Use REST resources."],
        liveAlternatives: [
          {
            id: "alt-a",
            label: "Lean API",
            summary: "Implement core CRUD first.",
            supportingAgents: ["tech-lead"],
            risks: [],
            verificationIdeas: [],
            confidence: 0.8,
            relevanceToIntent: 0.9,
          },
        ],
        killedAlternatives: [],
        unresolvedQuestions: ["Auth scope is unknown."],
        risks: ["Avoid inventing OAuth requirements."],
        verificationIdeas: ["Unit test route handlers."],
        evidenceFindings: [],
        evidenceConstraints: [],
        evidenceRisks: [],
        evidenceOpenQuestions: [],
        lastRoundSummary: "The team narrowed around REST.",
      },
      phase: "implementation",
      roundNumber: 2,
      context: {
        originalIntent: "Build a REST API",
        ancestorSummaries: [],
      },
    });

    expect(user).toContain("Compact Debate Context For This Round");
    expect(user).toContain("Lean API: Implement core CRUD first.");
    expect(user).not.toContain("## Previous Rounds");
  });
});

describe("Tool schemas", () => {
  const validToolEvidence = {
    id: "evidence-1",
    requestId: "request-1",
    toolName: "docs-fetch",
    query: "official Commander docs",
    requestedBy: "developer",
    additionalRequesters: ["technical-writer"],
    nodeId: "node-1",
    roundNumber: 1,
    summary: "Commander supports custom option processors.",
    findings: ["Repeatable options can be collected with a parser."],
    decisionRelevance: ["Use Commander instead of custom argv parsing."],
    constraintsDiscovered: ["Parser must preserve previous values."],
    risksDiscovered: ["Local wrapper still needs tests."],
    openQuestions: [],
    sources: [
      {
        title: "Commander options docs",
        url: "https://example.com/commander",
        retrievedAt: "2026-05-02T00:00:00.000Z",
      },
    ],
    limitations: ["Fixture URL is not real documentation."],
    confidence: 0.8,
    createdAt: "2026-05-02T00:00:01.000Z",
  };

  it("validates persisted tool evidence", () => {
    const parsed = ToolEvidenceSchema.parse(validToolEvidence);

    expect(parsed.toolName).toBe("docs-fetch");
    expect(parsed.sources[0].retrievedAt).toBe("2026-05-02T00:00:00.000Z");
  });

  it("rejects invalid requester roles", () => {
    expect(() =>
      ToolEvidenceSchema.parse({
        ...validToolEvidence,
        requestedBy: "not-a-role",
      })
    ).toThrow();

    expect(() =>
      ToolEvidenceSchema.parse({
        ...validToolEvidence,
        additionalRequesters: ["not-a-role"],
      })
    ).toThrow();

    expect(() =>
      ToolRequestSchema.parse({
        id: "request-1",
        toolName: "docs-fetch",
        query: "official Commander docs",
        requestedBy: "not-a-role",
        nodeId: "node-1",
        roundNumber: 1,
        status: "pending",
        createdAt: "2026-05-02T00:00:00.000Z",
      })
    ).toThrow();
  });
});

describe("AGENT_DEFINITIONS", () => {
  it("defines the additional broad specialties", () => {
    expect(AGENT_ROLES).toEqual(
      expect.arrayContaining([
        "ux-designer",
        "frontend-engineer",
        "api-integration-architect",
        "performance-engineer",
        "technical-writer",
      ])
    );
  });

  it("gives every specialty explicit selection, does, does-not, and evidence boundaries", () => {
    for (const role of AGENT_ROLES) {
      const definition = AGENT_DEFINITIONS[role];

      expect(definition.selectionSummary, role).toBeTruthy();
      expect(definition.does.length, role).toBeGreaterThan(0);
      expect(definition.doesNot.length, role).toBeGreaterThan(0);
      expect(definition.systemPrompt, role).toContain("## Does");
      expect(definition.systemPrompt, role).toContain("## Does Not");
      expect(definition.systemPrompt, role).toContain("## Evidence and Assumptions");
      expect(definition.systemPrompt, role).toContain("Do not invent facts");
    }
  });

  it("keeps validation and architecture coverage aligned with specialist responsibilities", () => {
    expect(AGENT_DEFINITIONS["qa-engineer"].primaryPhases).toContain("architecture");
    expect(AGENT_DEFINITIONS["code-reviewer"].primaryPhases).toContain("validation");
    expect(AGENT_DEFINITIONS.developer.primaryPhases).toContain("validation");
    expect(AGENT_DEFINITIONS["ml-engineer"].primaryPhases).toContain("validation");
    expect(AGENT_DEFINITIONS["data-engineer"].primaryPhases).toContain("validation");
    expect(AGENT_DEFINITIONS["data-analyst"].primaryPhases).toContain("validation");
  });

  it("frames the researcher as a verification and research-planning role, not a source of invented evidence", () => {
    const researcher = AGENT_DEFINITIONS.researcher.systemPrompt;

    expect(researcher).toContain("Research Planner");
    expect(researcher).toContain("does not cite studies, benchmarks, libraries, or prior art unless they are present in the provided context");
    expect(researcher).toContain("mark it as something to verify");
    expect(AGENT_DEFINITIONS.researcher.does.join(" ")).not.toContain("prior debate");
  });

  it("instructs qa-engineer to emit one acceptance-criteria update per concrete test scenario in Given/When/Then format", () => {
    const prompt = AGENT_DEFINITIONS["qa-engineer"].systemPrompt;
    expect(prompt).toMatch(/one.*CONTEXT_UPDATE.*per.*scenario|each.*scenario.*CONTEXT_UPDATE|CONTEXT_UPDATE.*per.*scenario/i);
    expect(prompt).toContain("Given");
    expect(prompt).toContain("When");
    expect(prompt).toContain("Then");
    expect(prompt).toContain("Test:");
  });

  it("keeps fallback phase rosters core-only so optional specialists require analyzer selection", () => {
    expect(PHASE_AGENTS.requirements).not.toContain("ux-designer");
    expect(PHASE_AGENTS.architecture).not.toContain("api-integration-architect");
    expect(PHASE_AGENTS.validation).not.toContain("technical-writer");
  });
});
