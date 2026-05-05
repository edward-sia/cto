import { describe, expect, it, vi } from "vitest";
import { Synthesizer } from "../../src/synthesis/synthesizer.js";
import type { TreeNode } from "../../src/types/index.js";
import { makeFailingLLM, makeMockLLM } from "../helpers/llm.js";
import type { LLMClient } from "../../src/providers/llm-provider.js";

function makeLeafNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "node-test123",
    parentId: null,
    depth: 4,
    phase: "validation",
    status: "completed",
    context: {
      originalIntent: "Investigate feasibility of GraphQL migration",
      ancestorSummaries: [],
    },
    children: [],
    branchLabel: "research",
    branchDescription: "Feasibility study",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Synthesizer", () => {
  it("returns dry-run document without calling the LLM", async () => {
    const llm = { createChatCompletion: vi.fn() } as unknown as LLMClient;
    const synthesizer = new Synthesizer(llm, "gpt-4o", true);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(llm.createChatCompletion).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.filesChanged).toHaveLength(0);
    expect(result.output).toContain("[DRY-RUN]");
  });

  it("calls the LLM and returns synthesis document on success", async () => {
    const document =
      "## Research Questions\n- Is GraphQL migration feasible?\n\n## Key Findings\n- Yes, with caveats.";
    const llm = makeMockLLM(document, { inputTokens: 250, outputTokens: 50 });
    const synthesizer = new Synthesizer(llm, "gpt-4o", false);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(result.success).toBe(true);
    expect(result.output).toBe(document);
    expect(result.filesChanged).toHaveLength(0);
    expect(result.threadId).toMatch(/^synthesis-/);
  });

  it("returns failure result when the LLM throws", async () => {
    const llm = makeFailingLLM(new Error("API timeout"));
    const synthesizer = new Synthesizer(llm, "gpt-4o", false);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(result.success).toBe(false);
    expect(result.output).toContain("API timeout");
  });

  it("includes ancestor summaries in the prompt when present", async () => {
    const llm = makeMockLLM("# Synthesis");
    const synthesizer = new Synthesizer(llm, "gpt-4o", false);

    await synthesizer.synthesize(
      makeLeafNode({
        context: {
          originalIntent: "Research caching strategies",
          ancestorSummaries: ["Round 1: Agents discussed Redis vs Memcached"],
        },
      })
    );

    const callArgs = llm.createChatCompletion.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content as string;
    expect(userPrompt).toContain("Redis vs Memcached");
  });

  it("includes structured tool evidence in the synthesis prompt", async () => {
    const llm = makeMockLLM("# Synthesis");
    const synthesizer = new Synthesizer(llm, "gpt-4o", false);

    await synthesizer.synthesize(
      makeLeafNode({
        context: {
          originalIntent: "How is the codebase structured here",
          ancestorSummaries: [],
          toolEvidence: [
            {
              id: "evidence-repo-map",
              requestId: "request-repo-map",
              toolName: "repo-map",
              query: "structure",
              requestedBy: "researcher",
              additionalRequesters: [],
              nodeId: "node-1",
              roundNumber: 0,
              summary: "Mapped repository structure.",
              findings: ["Top-level directory: src/", "Root file: package.json"],
              decisionRelevance: ["Use repository map as the structure baseline."],
              constraintsDiscovered: [],
              risksDiscovered: [],
              openQuestions: [],
              sources: [{ path: "package.json", retrievedAt: "2026-05-02T00:00:00.000Z" }],
              limitations: ["Directory map limited to top-level entries."],
              confidence: 0.8,
              createdAt: "2026-05-02T00:00:00.000Z",
            },
          ],
        },
      })
    );

    const callArgs = llm.createChatCompletion.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content as string;
    expect(userPrompt).toContain("## Tool Evidence");
    expect(userPrompt).toContain("Mapped repository structure.");
    expect(userPrompt).toContain("Top-level directory: src/");
    expect(userPrompt).toContain("Source: package.json");
  });

  it("includes a human revision prompt in the synthesis prompt", async () => {
    const llm = makeMockLLM("# Synthesis");
    const synthesizer = new Synthesizer(llm, "gpt-4o", false);

    await synthesizer.synthesize(
      makeLeafNode({
        context: {
          originalIntent: "Research local-first options",
          humanRevisionPrompt: "Prefer local-first storage.",
          ancestorSummaries: [],
        },
      })
    );

    const callArgs = llm.createChatCompletion.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content as string;
    expect(userPrompt).toContain("Human Revision");
    expect(userPrompt).toContain("Prefer local-first storage.");
  });
});
