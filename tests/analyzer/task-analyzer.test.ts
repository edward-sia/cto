import { describe, expect, it, vi } from "vitest";
import { TaskAnalyzer } from "../../src/analyzer/task-analyzer.js";
import { makeFailingLLM, makeMockLLM } from "../helpers/llm.js";
import type { LLMClient } from "@cto/llm-providers";

describe("TaskAnalyzer", () => {
  it("returns default panel in dry-run mode without calling the LLM", async () => {
    const llm = { createChatCompletion: vi.fn() } as unknown as LLMClient;
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", true);

    const result = await analyzer.analyze("Build a REST API");

    expect(llm.createChatCompletion).not.toHaveBeenCalled();
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
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const result = await analyzer.analyze("Add OAuth2 authentication");

    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("security-engineer");
    expect(result.rationale).toBe("Auth task - security engineer selected");
  });

  it("parses JSON when providers wrap it in prose or markdown fences", async () => {
    const response = `Here is the classification:\n\n\`\`\`json\n${JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["tech-lead", "developer", "api-integration-architect"],
      rationale: "API integration task",
    })}\n\`\`\``;
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const result = await analyzer.analyze("Add Stripe webhook handling");

    expect(result.runMode).toBe("implementation");
    expect(result.selectedAgents).toContain("api-integration-architect");
    expect(result.selectedAgents).toContain("developer");
  });

  it("reports LLM request failures separately from response parse failures", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = Object.assign(new Error("Provider returned error"), { status: 429 });
    const llm = makeFailingLLM(error);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const resultPromise = analyzer.analyze("Build something");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.runMode).toBe("implementation");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("TaskAnalyzer: LLM request failed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("429 Provider returned error"));

    warn.mockRestore();
    vi.useRealTimers();
  });

  it("describes agent specialties with do and do-not boundaries in the classifier prompt", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["product-manager", "tech-lead", "developer", "frontend-engineer"],
      rationale: "Frontend implementation task",
    });
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    await analyzer.analyze("Build a responsive settings page");

    const systemPrompt = llm.createChatCompletion.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('"frontend-engineer": Frontend Engineer');
    expect(systemPrompt).toContain("Does:");
    expect(systemPrompt).toContain("Does not:");
    expect(systemPrompt).toContain("Do not select specialists for concerns not grounded in the intent");
  });

  it("falls back to default panel when LLM returns invalid JSON", async () => {
    const llm = makeMockLLM("not valid json at all");
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

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
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

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
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const result = await analyzer.analyze("Add OAuth2 authentication");

    expect(result.selectedAgents).toEqual([
      "product-manager",
      "security-engineer",
      "tech-lead",
      "developer",
      "qa-engineer",
      "code-reviewer",
    ]);
  });

  it("always includes qa-engineer and code-reviewer for implementation tasks", async () => {
    const response = JSON.stringify({
      runMode: "implementation",
      selectedAgents: ["tech-lead", "developer", "frontend-engineer"],
      rationale: "Frontend feature",
    });
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const result = await analyzer.analyze("Build a settings page");

    expect(result.selectedAgents).toContain("qa-engineer");
    expect(result.selectedAgents).toContain("code-reviewer");
  });

  it("does not inject qa-engineer or code-reviewer for exploration tasks", async () => {
    const response = JSON.stringify({
      runMode: "exploration",
      selectedAgents: ["researcher", "business-analyst"],
      rationale: "Research task",
    });
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const result = await analyzer.analyze("Research GraphQL vs REST trade-offs");

    expect(result.selectedAgents).not.toContain("qa-engineer");
    expect(result.selectedAgents).not.toContain("code-reviewer");
  });

  it("filters out hallucinated agent roles from LLM response", async () => {
    const response = JSON.stringify({
      runMode: "exploration",
      selectedAgents: ["researcher", "fake-agent", "data-analyst"],
      rationale: "Research task",
    });
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

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
    const llm = makeMockLLM(response);
    const analyzer = new TaskAnalyzer(llm, "gpt-4o", false);

    const result = await analyzer.analyze("Research the best database for time-series data");

    expect(result.runMode).toBe("exploration");
  });
});
