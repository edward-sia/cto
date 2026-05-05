import { describe, expect, it, vi } from "vitest";
import { IntentDecomposer } from "../../src/analyzer/intent-decomposer.js";
import { makeFailingLLM, makeMockLLM } from "../helpers/llm.js";
import type { LLMClient } from "../../src/providers/llm-provider.js";

describe("IntentDecomposer", () => {
  it("returns an empty decomposition in dry-run mode without calling the LLM", async () => {
    const llm = { createChatCompletion: vi.fn() } as unknown as LLMClient;
    const decomposer = new IntentDecomposer(llm, "gpt-4o", true);

    const result = await decomposer.decompose("Build a CLI tool");

    expect(llm.createChatCompletion).not.toHaveBeenCalled();
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
    const llm = makeMockLLM(response);
    const decomposer = new IntentDecomposer(llm, "gpt-4o", false);

    const result = await decomposer.decompose(
      "Build a CLI that takes a Shopify product CSV and outputs a markdown dead-stock report"
    );

    expect(result.loadBearingClaims).toContain("output is a markdown report");
    expect(result.undefinedTerms).toHaveLength(2);
    expect(result.feasibilityFlags[0]).toMatch(/sales data/);
  });

  it("parses JSON when providers wrap it in prose or markdown fences", async () => {
    const response = `Sure, here is the scaffold:\n\n\`\`\`json\n${JSON.stringify({
      loadBearingClaims: ["must accept webhooks"],
      undefinedTerms: [],
      inScope: ["signature verification"],
      outOfScope: ["billing UI"],
      knownUnknowns: [],
      feasibilityFlags: [],
      rationale: "The intent focuses on webhook handling.",
    })}\n\`\`\``;
    const llm = makeMockLLM(response);
    const decomposer = new IntentDecomposer(llm, "gpt-4o", false);

    const result = await decomposer.decompose("Add Stripe webhook handling");

    expect(result.loadBearingClaims).toContain("must accept webhooks");
    expect(result.outOfScope).toContain("billing UI");
  });

  it("reports LLM request failures separately from response parse failures", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = Object.assign(new Error("Provider returned error"), { status: 429 });
    const llm = makeFailingLLM(error);
    const decomposer = new IntentDecomposer(llm, "gpt-4o", false);

    const resultPromise = decomposer.decompose("Build something");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.loadBearingClaims).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("IntentDecomposer: LLM request failed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("429 Provider returned error"));

    warn.mockRestore();
    vi.useRealTimers();
  });

  it("falls back to empty decomposition on invalid JSON", async () => {
    const llm = makeMockLLM("not valid json");
    const decomposer = new IntentDecomposer(llm, "gpt-4o", false);

    const result = await decomposer.decompose("Build something");

    expect(result.loadBearingClaims).toEqual([]);
    expect(result.feasibilityFlags).toEqual([]);
  });
});
