import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, buildAgentPrompt } from "../../src/agents/definitions.js";
import { AGENT_ROLES, PHASE_AGENTS } from "../../src/types/index.js";

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

  it("keeps fallback phase rosters core-only so optional specialists require analyzer selection", () => {
    expect(PHASE_AGENTS.requirements).not.toContain("ux-designer");
    expect(PHASE_AGENTS.architecture).not.toContain("api-integration-architect");
    expect(PHASE_AGENTS.validation).not.toContain("technical-writer");
  });
});
