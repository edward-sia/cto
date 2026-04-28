import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { Synthesizer } from "../../src/synthesis/synthesizer.js";
import type { TreeNode } from "../../src/types/index.js";

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

function makeMockOpenAI(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { total_tokens: 300 },
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("Synthesizer", () => {
  it("returns dry-run document without calling OpenAI", async () => {
    const mockCreate = vi.fn();
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const synthesizer = new Synthesizer(openai, "gpt-4o", true);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.filesChanged).toHaveLength(0);
    expect(result.output).toContain("[DRY-RUN]");
  });

  it("calls OpenAI and returns synthesis document on success", async () => {
    const document =
      "## Research Questions\n- Is GraphQL migration feasible?\n\n## Key Findings\n- Yes, with caveats.";
    const openai = makeMockOpenAI(document);
    const synthesizer = new Synthesizer(openai, "gpt-4o", false);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(result.success).toBe(true);
    expect(result.output).toBe(document);
    expect(result.filesChanged).toHaveLength(0);
    expect(result.threadId).toMatch(/^synthesis-/);
  });

  it("returns failure result when OpenAI throws", async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("API timeout")),
        },
      },
    } as unknown as OpenAI;
    const synthesizer = new Synthesizer(openai, "gpt-4o", false);

    const result = await synthesizer.synthesize(makeLeafNode());

    expect(result.success).toBe(false);
    expect(result.output).toContain("API timeout");
  });

  it("includes ancestor summaries in the prompt when present", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "# Synthesis" } }],
      usage: { total_tokens: 100 },
    });
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const synthesizer = new Synthesizer(openai, "gpt-4o", false);

    await synthesizer.synthesize(
      makeLeafNode({
        context: {
          originalIntent: "Research caching strategies",
          ancestorSummaries: ["Round 1: Agents discussed Redis vs Memcached"],
        },
      })
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content as string;
    expect(userPrompt).toContain("Redis vs Memcached");
  });
});
