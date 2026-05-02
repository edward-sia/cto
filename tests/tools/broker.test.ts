import { describe, expect, it } from "vitest";
import { ToolBroker } from "../../src/tools/broker.js";
import type { ToolAdapter, ToolBrokerRequest } from "../../src/tools/adapters.js";
import type { ToolEvidence, ToolRequest, ToolUseConfig } from "../../src/types/index.js";

const config: ToolUseConfig = {
  enabled: true,
  allowlist: ["docs-fetch", "repo-search"],
  maxRequestsPerNode: 4,
  maxRequestsPerRound: 3,
  maxRequestsPerRun: 10,
  maxEvidenceItemsInPrompt: 5,
  autoRunReadOnly: true,
};

function fakeAdapter(toolName: "docs-fetch" | "repo-search"): ToolAdapter {
  return {
    toolName,
    readOnly: true,
    async execute(request: ToolBrokerRequest) {
      return {
        summary: `${toolName} summary for ${request.query}`,
        findings: [`finding:${request.query}`],
        decisionRelevance: [`relevance:${request.query}`],
        constraintsDiscovered: [`constraint:${request.query}`],
        risksDiscovered: [`risk:${request.query}`],
        openQuestions: [],
        sources: [
          {
            title: `${toolName} fixture`,
            url: `https://example.com/${toolName}`,
            retrievedAt: "2026-05-02T00:00:00.000Z",
          },
        ],
        limitations: ["fixture adapter"],
        confidence: 0.75,
      };
    },
  };
}

function failingAdapter(toolName: "docs-fetch" | "repo-search"): ToolAdapter {
  return {
    toolName,
    readOnly: true,
    async execute() {
      throw new Error(`${toolName} fixture failure`);
    },
  };
}

const now = () => new Date("2026-05-02T00:00:01.000Z");

describe("ToolBroker", () => {
  it("resolves allowlisted read-only requests into persisted requests and evidence", async () => {
    const broker = new ToolBroker({
      config,
      adapters: [fakeAdapter("docs-fetch")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
      ],
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      toolName: "docs-fetch",
      query: "official Commander docs",
      requestedBy: "developer",
      nodeId: "node-1",
      roundNumber: 1,
      status: "completed",
      createdAt: "2026-05-02T00:00:01.000Z",
      completedAt: "2026-05-02T00:00:01.000Z",
    });
    expect(result.requests[0].id).toMatch(/^request-/);

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      requestId: result.requests[0].id,
      toolName: "docs-fetch",
      query: "official Commander docs",
      requestedBy: "developer",
      additionalRequesters: [],
      nodeId: "node-1",
      roundNumber: 1,
      summary: "docs-fetch summary for official Commander docs",
      findings: ["finding:official Commander docs"],
      decisionRelevance: ["relevance:official Commander docs"],
      constraintsDiscovered: ["constraint:official Commander docs"],
      risksDiscovered: ["risk:official Commander docs"],
      confidence: 0.75,
      createdAt: "2026-05-02T00:00:01.000Z",
    });
    expect(result.evidence[0].id).toMatch(/^evidence-/);
  });

  it("deduplicates semantically identical requests and records additionalRequesters", async () => {
    const broker = new ToolBroker({
      config,
      adapters: [fakeAdapter("repo-search")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      requests: [
        {
          toolName: "repo-search",
          query: "  collectValues   helper  ",
          requestedBy: "developer",
        },
        {
          toolName: "repo-search",
          query: "collectvalues helper",
          requestedBy: "qa-engineer",
        },
        {
          toolName: "repo-search",
          query: "collectValues helper",
          requestedBy: "technical-writer",
        },
      ],
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      query: "collectValues helper",
      requestedBy: "developer",
      status: "completed",
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      query: "collectValues helper",
      requestedBy: "developer",
      additionalRequesters: ["qa-engineer", "technical-writer"],
      findings: ["finding:collectValues helper"],
    });
  });

  it("skips disallowed or over-budget requests with persisted reasons", async () => {
    const broker = new ToolBroker({
      config: {
        ...config,
        maxRequestsPerRound: 1,
      },
      adapters: [fakeAdapter("docs-fetch"), fakeAdapter("repo-search")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      requests: [
        {
          toolName: "web-search",
          query: "latest Commander docs",
          requestedBy: "researcher",
        },
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
        {
          toolName: "repo-search",
          query: "collectValues helper",
          requestedBy: "qa-engineer",
        },
      ],
    });

    expect(result.requests).toHaveLength(3);
    expect(result.evidence).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      toolName: "web-search",
      status: "skipped",
    });
    expect(result.requests[0].reason).toContain("allowlist");
    expect(result.requests[1]).toMatchObject({
      toolName: "docs-fetch",
      status: "completed",
    });
    expect(result.requests[2]).toMatchObject({
      toolName: "repo-search",
      status: "skipped",
    });
    expect(result.requests[2].reason).toContain("round budget");
  });

  it("skips all requests when tool use is disabled", async () => {
    const broker = new ToolBroker({
      config: {
        ...config,
        enabled: false,
      },
      adapters: [fakeAdapter("docs-fetch")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      toolName: "docs-fetch",
      status: "skipped",
    });
    expect(result.requests[0].reason).toContain("disabled");
  });

  it("counts failed adapter attempts against the current round budget", async () => {
    const broker = new ToolBroker({
      config: {
        ...config,
        maxRequestsPerRound: 1,
      },
      adapters: [failingAdapter("docs-fetch"), fakeAdapter("repo-search")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 1,
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
        {
          toolName: "repo-search",
          query: "collectValues helper",
          requestedBy: "qa-engineer",
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]).toMatchObject({
      toolName: "docs-fetch",
      status: "failed",
      reason: "docs-fetch fixture failure",
    });
    expect(result.requests[1]).toMatchObject({
      toolName: "repo-search",
      status: "skipped",
    });
    expect(result.requests[1].reason).toContain("round budget");
  });

  it("does not count historical skipped requests against node or run budgets", async () => {
    const existingRequests: ToolRequest[] = [
      {
        id: "request-skipped",
        toolName: "docs-fetch",
        query: "skipped docs",
        requestedBy: "developer",
        nodeId: "node-1",
        roundNumber: 1,
        status: "skipped",
        reason: "Tool use is disabled.",
        createdAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:00:00.000Z",
      },
    ];
    const broker = new ToolBroker({
      config: {
        ...config,
        maxRequestsPerNode: 1,
        maxRequestsPerRun: 1,
      },
      adapters: [fakeAdapter("docs-fetch")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 2,
      existingRequests,
      requests: [
        {
          toolName: "docs-fetch",
          query: "official Commander docs",
          requestedBy: "developer",
        },
      ],
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      status: "completed",
    });
    expect(result.evidence).toHaveLength(1);
  });

  it("does not mutate existing evidence when an equivalent request is skipped", async () => {
    const existingEvidence: ToolEvidence = {
      id: "evidence-existing",
      requestId: "request-existing",
      toolName: "docs-fetch",
      query: "official Commander docs",
      requestedBy: "developer",
      additionalRequesters: ["technical-writer"],
      nodeId: "node-1",
      roundNumber: 1,
      summary: "Existing docs evidence.",
      findings: ["Existing finding."],
      decisionRelevance: [],
      constraintsDiscovered: [],
      risksDiscovered: [],
      openQuestions: [],
      sources: [],
      limitations: [],
      confidence: 0.8,
      createdAt: "2026-05-02T00:00:00.000Z",
    };
    const before = structuredClone(existingEvidence);
    const broker = new ToolBroker({
      config,
      adapters: [fakeAdapter("docs-fetch")],
      now,
    });

    const result = await broker.resolveRoundRequests({
      nodeId: "node-1",
      roundNumber: 2,
      existingEvidence: [existingEvidence],
      requests: [
        {
          toolName: "docs-fetch",
          query: " official   commander docs ",
          requestedBy: "qa-engineer",
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      status: "skipped",
      reason: "Equivalent evidence already exists.",
    });
    expect(existingEvidence).toEqual(before);
  });
});
