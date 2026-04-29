import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, buildAgentPrompt } from "../../src/agents/definitions.js";

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
