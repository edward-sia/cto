import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { TaskAnalyzer } from "../../src/analyzer/task-analyzer.js";

function makeMockOpenAI(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { total_tokens: 100 },
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("TaskAnalyzer", () => {
  it("returns default panel in dry-run mode without calling OpenAI", async () => {
    const mockCreate = vi.fn();
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", true);

    const result = await analyzer.analyze("Build a REST API");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("business-analyst");
    expect(result.selectedAgents).toContain("developer");
    expect(result.selectedAgents).toContain("tech-lead");
    expect(result.selectedAgents).toContain("code-reviewer");
    expect(result.selectedAgents).not.toContain("security-engineer");
    expect(result.selectedAgents).not.toContain("ml-engineer");
  });

  it("parses valid LLM response into TaskAnalysis", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["product-manager", "tech-lead", "developer", "security-engineer"],
      rationale: "Auth task - security engineer selected",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Add OAuth2 authentication");

    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("security-engineer");
    expect(result.rationale).toBe("Auth task - security engineer selected");
  });

  it("describes agent specialties with do and do-not boundaries in the classifier prompt", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["product-manager", "tech-lead", "developer", "frontend-engineer"],
      rationale: "Frontend implementation task",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    await analyzer.analyze("Build a responsive settings page");

    const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    const systemPrompt = create.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('"frontend-engineer": Frontend Engineer');
    expect(systemPrompt).toContain("Does:");
    expect(systemPrompt).toContain("Does not:");
    expect(systemPrompt).toContain("Do not select specialists for concerns not grounded in the intent");
  });

  it("falls back to default panel when LLM returns invalid JSON", async () => {
    const openai = makeMockOpenAI("not valid json at all");
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Build something");

    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("business-analyst");
    expect(result.selectedAgents).toContain("developer");
    expect(result.selectedAgents).toContain("tech-lead");
    expect(result.selectedAgents).toContain("code-reviewer");
  });

  it("falls back when the classifier returns only invalid roles", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["fake-agent"],
      rationale: "Bad role",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Build a CLI command");

    expect(result.selectedAgents).toEqual([
      "product-manager",
      "business-analyst",
      "tech-lead",
      "developer",
      "code-reviewer",
      "qa-engineer",
    ]);
  });

  it("adds implementation core roles when the classifier omits them", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["product-manager", "security-engineer"],
      rationale: "Auth task",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Add OAuth2 authentication");

    expect(result.selectedAgents).toEqual([
      "product-manager",
      "security-engineer",
      "tech-lead",
      "developer",
    ]);
  });

  it("filters out hallucinated agent roles from LLM response", async () => {
    const response = JSON.stringify({
      runMode: "exploration",
      selectedAgents: ["researcher", "fake-agent", "data-analyst"],
      rationale: "Research task",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Investigate feasibility of GraphQL");

    expect(result.selectedAgents).toContain("researcher");
    expect(result.selectedAgents).toContain("data-analyst");
    expect(result.selectedAgents).not.toContain("fake-agent");
  });

  it("sets runMode to exploration for research intents", async () => {
    const response = JSON.stringify({
      runMode: "exploration",
      selectedAgents: ["researcher", "business-analyst"],
      rationale: "Pure research task - no implementation needed",
    });
    const openai = makeMockOpenAI(response);
    const analyzer = new TaskAnalyzer(openai, "gpt-4o", false);

    const result = await analyzer.analyze("Research the best database for time-series data");

    expect(result.runMode).toBe("exploration");
  });
});
