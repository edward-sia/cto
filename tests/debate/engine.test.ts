import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { DebateEngine } from "../../src/debate/engine.js";
import { ModeratorAssessmentSchema } from "../../src/schemas/index.js";
import type { ToolBroker, IncomingToolRequest } from "../../src/tools/broker.js";

describe("ModeratorAssessmentSchema", () => {
  it("parses valid moderator output with relevanceToIntent", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
          relevanceToIntent: 0.9,
        },
      ],
      summary: "two paths",
    };
    const parsed = ModeratorAssessmentSchema.parse(raw);
    expect(parsed.alternatives[0].relevanceToIntent).toBe(0.9);
  });

  it("defaults relevanceToIntent to 0.5 when omitted (backward compat)", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
        },
      ],
      summary: "two paths",
    };
    const parsed = ModeratorAssessmentSchema.parse(raw);
    expect(parsed.alternatives[0].relevanceToIntent).toBe(0.5);
  });

  it("rejects relevanceToIntent outside [0,1]", () => {
    const raw = {
      outcome: "diverging",
      alternatives: [
        {
          id: "alt-a",
          label: "A",
          description: "",
          proposedBy: "tech-lead",
          supportedBy: ["developer"],
          rationale: "r",
          confidence: 0.8,
          relevanceToIntent: 1.5,
        },
      ],
      summary: "two paths",
    };
    expect(() => ModeratorAssessmentSchema.parse(raw)).toThrow();
  });
});

describe("DebateEngine tool integration", () => {
  it("resolves tool requests before moderator assessment and renders evidence in the moderator prompt", async () => {
    const calls: IncomingToolRequest[][] = [];
    const events: string[] = [];
    const toolEvents: Array<{ requested: number; completed: number; skipped: number; failed: number }> = [];
    let createCalls = 0;
    let moderatorPrompt = "";
    const response = (content: string) => ({
      choices: [{ message: { content } }],
      usage: {
        total_tokens: 1,
        prompt_tokens: 1,
        completion_tokens: 1,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });
    const fakeOpenAI = {
      chat: {
        completions: {
          async create(input: { messages: Array<{ role: string; content: unknown }> }) {
            createCalls += 1;
            if (createCalls <= 2) {
              return response(`[${createCalls === 1 ? "developer" : "tech-lead"}] Need docs.
TOOL_REQUEST [docs-fetch]: official docs for implementation`);
            }

            moderatorPrompt = String(input.messages.find((message) => message.role === "user")?.content ?? "");
            return response(JSON.stringify({
              outcome: "consensus",
              alternatives: [],
              summary: "Tool evidence supports consensus.",
            }));
          },
        },
      },
    } as unknown as OpenAI;
    const fakeBroker: Pick<ToolBroker, "resolveRoundRequests"> = {
      async resolveRoundRequests(input) {
        events.push("broker");
        calls.push(input.requests);
        return {
          requests: [
            {
              id: "request-1",
              toolName: input.requests[0].toolName,
              query: input.requests[0].query,
              requestedBy: input.requests[0].requestedBy,
              nodeId: input.nodeId,
              roundNumber: input.roundNumber,
              status: "completed",
              createdAt: "2026-05-02T00:00:00.000Z",
              completedAt: "2026-05-02T00:00:01.000Z",
            },
          ],
          evidence: Array.from({ length: 9 }, (_, idx) => ({
            id: `evidence-${idx + 1}`,
            requestId: "request-1",
            toolName: "docs-fetch",
            query: "official docs",
            requestedBy: "developer",
            additionalRequesters: [],
            nodeId: input.nodeId,
            roundNumber: input.roundNumber,
            summary: idx === 8 ? "Official docs support the requested API." : `Older evidence summary ${idx + 1}.`,
            findings: [idx === 8 ? "The API is documented." : `Older finding ${idx + 1}.`],
            decisionRelevance: ["Proceed with documented API."],
            constraintsDiscovered: ["Use documented parameters."],
            risksDiscovered: [],
            openQuestions: [],
            sources: [{ title: "Docs", url: "https://example.com", retrievedAt: "2026-05-02T00:00:00.000Z" }],
            limitations: [],
            confidence: 0.8,
            createdAt: "2026-05-02T00:00:01.000Z",
          })),
        };
      },
    };

    const engine = new DebateEngine({
      openai: fakeOpenAI,
      reasoningModel: "test-model",
      maxDebateRounds: 1,
      maxBranching: 2,
      dryRun: false,
      nodeId: "node-tools",
      toolBroker: fakeBroker,
      onProgress(event) {
        if (event.type === "tools_resolved") events.push("tools");
        if (event.type === "tools_resolved") toolEvents.push(event);
        if (event.type === "moderator_assessment") events.push("moderator");
      },
    });

    const transcript = await engine.runDebate(
      "implementation",
      {
        originalIntent: "Build with researched docs",
        ancestorSummaries: [],
      },
      ["developer", "tech-lead"]
    );

    expect(calls[0]).toEqual([
      {
        toolName: "docs-fetch",
        query: "official docs for implementation",
        requestedBy: "developer",
      },
      {
        toolName: "docs-fetch",
        query: "official docs for implementation",
        requestedBy: "tech-lead",
      },
    ]);
    expect(transcript.toolRequests?.[0].status).toBe("completed");
    expect(transcript.contextUpdates.toolEvidence?.at(-1)?.summary).toContain("Official docs");
    expect(transcript.compactState?.evidenceFindings).toContain("The API is documented.");
    expect(moderatorPrompt).toContain("## Current Tool Evidence");
    expect(moderatorPrompt).not.toContain("Older evidence summary 1.");
    expect(moderatorPrompt).not.toContain("Older finding 1.");
    expect(moderatorPrompt).toContain("Official docs support the requested API.");
    expect(moderatorPrompt).toContain("The API is documented.");
    expect(toolEvents[0]).toMatchObject({
      requested: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
    });
    expect(events).toEqual(expect.arrayContaining(["broker", "tools", "moderator"]));
    expect(events.indexOf("broker")).toBeLessThan(events.indexOf("moderator"));
    expect(events.indexOf("tools")).toBeLessThan(events.indexOf("moderator"));
  });
});
