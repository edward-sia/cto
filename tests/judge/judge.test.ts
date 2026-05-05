import { describe, expect, it, vi } from "vitest";
import { Judge } from "../../src/judge/judge.js";
import type { TreeNode } from "../../src/types/index.js";
import { makeMockLLM } from "../helpers/llm.js";
import type { LLMClient } from "../../src/providers/llm-provider.js";

function makeNode(overrides: Partial<TreeNode["context"]> = {}): TreeNode {
  return {
    id: "node-test",
    parentId: null,
    depth: 1,
    phase: "implementation",
    status: "scored",
    branchLabel: "Test Branch",
    branchDescription: "",
    context: {
      originalIntent: "Build a real-time collaborative document editor",
      ancestorSummaries: [],
      ...overrides,
    },
    children: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    executionResult: {
      threadId: "t1",
      success: true,
      filesChanged: ["src/index.ts"],
      output: "Implemented OT-based editor with 3 test files",
      durationMs: 1000,
      testResults: { passed: 5, failed: 0, skipped: 0, output: "5 passed" },
    },
  } as TreeNode;
}

const VALID_SCORE = {
  functionalCompleteness: 9,
  architecturalQuality: 8,
  testCoverage: 8,
  intentAlignment: 9,
  realWorldFit: 8,
  simplicity: 8,
  composite: 8.5,
  rationale: "Good solution.",
};

describe("Judge — domain facts synthesis", () => {
  it("includes acceptance criteria as domain constraints when domainFacts is null", async () => {
    const llm = makeMockLLM(JSON.stringify(VALID_SCORE), { inputTokens: 100, outputTokens: 50 });
    const judge = new Judge(llm, "gpt-4o");
    const node = makeNode({
      acceptanceCriteria: [
        "Test: Concurrent inserts converge — Given two clients insert simultaneously, when ops reach server, then both clients converge",
        "Test: Offline edit replay — Given client is offline and edits, when it reconnects, then edits apply without data loss",
      ],
    });

    await judge.score(node);

    const userPrompt = llm.createChatCompletion.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("Concurrent inserts converge");
    expect(userPrompt).toContain("Offline edit replay");
    expect(userPrompt).not.toContain("None provided");
  });

  it("uses explicit domainFacts when provided, ignoring synthesis", async () => {
    const llm = makeMockLLM(JSON.stringify(VALID_SCORE), { inputTokens: 100, outputTokens: 50 });
    const judge = new Judge(llm, "gpt-4o");
    const node = makeNode({
      domainFacts: {
        domain: "External CRM",
        constraints: ["Contact must have an email"],
        knownAbsences: ["No phone field in export"],
      },
      acceptanceCriteria: ["Test: something else — Given..., when..., then..."],
    });

    await judge.score(node);

    const userPrompt = llm.createChatCompletion.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("External CRM");
    expect(userPrompt).toContain("No phone field in export");
  });

  it("falls back to general robustness message when no criteria or facts exist", async () => {
    const llm = makeMockLLM(JSON.stringify(VALID_SCORE), { inputTokens: 100, outputTokens: 50 });
    const judge = new Judge(llm, "gpt-4o");
    const node = makeNode();

    await judge.score(node);

    const userPrompt = llm.createChatCompletion.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("None provided");
  });
});

describe("Judge — RWF rubric", () => {
  it("scores real-world fit in terms of behavioral constraints, not only data columns", () => {
    const judge = new Judge({ createChatCompletion: vi.fn() } as unknown as LLMClient, "gpt-4o");
    const systemPrompt = judge.systemPrompt;
    expect(systemPrompt).toMatch(/behav|constraint|protocol|converge|reconnect/i);
    expect(systemPrompt).not.toMatch(/columns.*only|only.*columns/i);
  });
});
