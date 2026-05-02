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
  it("resolves tool requests before moderator assessment and persists evidence in the transcript", async () => {
    const calls: IncomingToolRequest[][] = [];
    const events: string[] = [];
    const fakeBroker: Pick<ToolBroker, "resolveRoundRequests"> = {
      async resolveRoundRequests(input) {
        events.push("broker");
        calls.push(input.requests);
        return {
          requests: input.requests.map((request, idx) => ({
            id: `request-${idx + 1}`,
            toolName: request.toolName,
            query: request.query,
            requestedBy: request.requestedBy,
            nodeId: input.nodeId,
            roundNumber: input.roundNumber,
            status: "completed",
            createdAt: "2026-05-02T00:00:00.000Z",
            completedAt: "2026-05-02T00:00:01.000Z",
          })),
          evidence: [
            {
              id: "evidence-1",
              requestId: "request-1",
              toolName: "docs-fetch",
              query: "official docs",
              requestedBy: "developer",
              additionalRequesters: [],
              nodeId: input.nodeId,
              roundNumber: input.roundNumber,
              summary: "Official docs support the requested API.",
              findings: ["The API is documented."],
              decisionRelevance: ["Proceed with documented API."],
              constraintsDiscovered: ["Use documented parameters."],
              risksDiscovered: [],
              openQuestions: [],
              sources: [{ title: "Docs", url: "https://example.com", retrievedAt: "2026-05-02T00:00:00.000Z" }],
              limitations: [],
              confidence: 0.8,
              createdAt: "2026-05-02T00:00:01.000Z",
            },
          ],
        };
      },
    };

    const engine = new DebateEngine({
      openai: {} as OpenAI,
      reasoningModel: "test-model",
      maxDebateRounds: 1,
      maxBranching: 2,
      dryRun: true,
      nodeId: "node-tools",
      toolBroker: fakeBroker,
      onProgress(event) {
        if (event.type === "tools_resolved") events.push("tools");
        if (event.type === "moderator_assessment") events.push("moderator");
      },
    });

    const transcript = await engine.runDebate(
      "implementation",
      {
        originalIntent: "Build with researched docs",
        ancestorSummaries: [],
      },
      ["developer"]
    );

    expect(calls[0]).toEqual([
      {
        toolName: "docs-fetch",
        query: "official docs for implementation",
        requestedBy: "developer",
      },
    ]);
    expect(transcript.toolRequests?.[0].status).toBe("completed");
    expect(transcript.contextUpdates.toolEvidence?.[0].summary).toContain("Official docs");
    expect(transcript.compactState?.evidenceFindings).toContain("The API is documented.");
    expect(events).toEqual(expect.arrayContaining(["broker", "tools", "moderator"]));
    expect(events.indexOf("broker")).toBeLessThan(events.indexOf("moderator"));
    expect(events.indexOf("tools")).toBeLessThan(events.indexOf("moderator"));
  });
});
