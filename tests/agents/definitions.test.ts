import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, buildAgentPrompt, parseAgentResponse } from "../../src/agents/definitions.js";
import { AGENT_ROLES, PHASE_AGENTS } from "../../src/types/index.js";

describe("parseAgentResponse", () => {
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
