import { describe, expect, it } from "vitest";
import { renderToolEvidenceForPrompt, rollupToolEvidence } from "../../src/tools/render.js";
import type { ToolEvidence } from "../../src/types/index.js";

const evidence: ToolEvidence = {
  id: "evidence-1",
  requestId: "request-1",
  toolName: "docs-fetch",
  query: "official Commander docs",
  requestedBy: "developer",
  additionalRequesters: ["technical-writer"],
  nodeId: "node-1",
  roundNumber: 1,
  summary: "Commander supports custom option processors.",
  findings: ["Repeatable options can collect values."],
  decisionRelevance: ["Use Commander option processors instead of custom argv parsing."],
  constraintsDiscovered: ["Parser must preserve previous values."],
  risksDiscovered: ["Local wrapper still needs a regression test."],
  openQuestions: ["Confirm local helper behavior."],
  sources: [
    {
      title: "Commander docs",
      url: "https://example.com/commander",
      retrievedAt: "2026-05-02T00:00:00.000Z",
    },
  ],
  limitations: ["Fixture source."],
  confidence: 0.8,
  createdAt: "2026-05-02T00:00:01.000Z",
};

describe("tool evidence rendering", () => {
  it("renders compact decision-complete evidence", () => {
    const rendered = renderToolEvidenceForPrompt([evidence], 5);

    expect(rendered).toContain("## Tool Evidence");
    expect(rendered).toContain("Commander supports custom option processors.");
    expect(rendered).toContain("Decision relevance");
    expect(rendered).toContain("Parser must preserve previous values.");
    expect(rendered).toContain("Commander docs");
    expect(rendered).toContain("Limitations");
  });

  it("renders nothing when the evidence limit is zero", () => {
    expect(renderToolEvidenceForPrompt([evidence], 0)).toBe("");
  });

  it("normalizes duplicate and empty list values before rendering", () => {
    const rendered = renderToolEvidenceForPrompt(
      [
        {
          ...evidence,
          findings: [
            "Repeatable\noptions   can collect values.",
            "  ",
            "Repeatable options can collect values.",
          ],
        },
      ],
      1
    );

    expect(rendered.match(/- Repeatable options can collect values\./g)).toHaveLength(1);
    expect(rendered).not.toContain("Repeatable\noptions");
    expect(rendered).not.toContain("- \n");
  });

  it("rolls evidence into compact debate fields", () => {
    const rollup = rollupToolEvidence([evidence]);

    expect(rollup.evidenceFindings).toEqual(["Repeatable options can collect values."]);
    expect(rollup.evidenceConstraints).toEqual(["Parser must preserve previous values."]);
    expect(rollup.evidenceRisks).toEqual(["Local wrapper still needs a regression test."]);
    expect(rollup.evidenceOpenQuestions).toEqual(["Confirm local helper behavior."]);
  });
});
