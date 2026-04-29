import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { IntentDecomposer } from "../../src/analyzer/intent-decomposer.js";

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

describe("IntentDecomposer", () => {
  it("returns an empty decomposition in dry-run mode without calling OpenAI", async () => {
    const mockCreate = vi.fn();
    const openai = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;
    const decomposer = new IntentDecomposer(openai, "gpt-4o", true);

    const result = await decomposer.decompose("Build a CLI tool");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.loadBearingClaims).toEqual([]);
    expect(result.undefinedTerms).toEqual([]);
  });

  it("parses a valid LLM response into IntentDecomposition", async () => {
    const response = JSON.stringify({
      loadBearingClaims: [
        "input is a Shopify product CSV export",
        "output is a markdown report",
      ],
      undefinedTerms: [
        { term: "inventory value", needsResolution: "price*qty vs cost*qty" },
        { term: "reorder threshold", needsResolution: "fixed number, percentage, or per-product?" },
      ],
      inScope: ["top 10 by inventory value", "products below reorder threshold", "dead stock"],
      outOfScope: ["multi-currency conversion", "GDPR compliance"],
      knownUnknowns: ["does Shopify product CSV contain sales data?"],
      feasibilityFlags: ["dead stock requires sales data — Shopify product CSV does not include sales"],
      rationale: "Sales data is in the Orders export, not the products export.",
    });
    const openai = makeMockOpenAI(response);
    const decomposer = new IntentDecomposer(openai, "gpt-4o", false);

    const result = await decomposer.decompose(
      "Build a CLI that takes a Shopify product CSV and outputs a markdown dead-stock report"
    );

    expect(result.loadBearingClaims).toContain("output is a markdown report");
    expect(result.undefinedTerms).toHaveLength(2);
    expect(result.feasibilityFlags[0]).toMatch(/sales data/);
  });

  it("falls back to empty decomposition on invalid JSON", async () => {
    const openai = makeMockOpenAI("not valid json");
    const decomposer = new IntentDecomposer(openai, "gpt-4o", false);

    const result = await decomposer.decompose("Build something");

    expect(result.loadBearingClaims).toEqual([]);
    expect(result.feasibilityFlags).toEqual([]);
  });
});
