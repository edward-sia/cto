import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { Critic } from "../../src/critic/critic.js";
import type { NodeContext } from "../../src/types/index.js";

describe("Critic.auditCoverage with the orchestrator follow-up wiring", () => {
  const openai = new OpenAI({ apiKey: "test" });

  it("returns followUpRoundFired=true when explicitly set", async () => {
    const critic = new Critic({ openai, model: "gpt-test", dryRun: true });
    const ctx: NodeContext = {
      originalIntent: "Add tracing",
      ancestorSummaries: [],
    };
    const audit = await critic.auditCoverage(ctx, "summary", true);
    expect(audit.followUpRoundFired).toBe(true);
  });

  it("returns followUpRoundFired=false by default", async () => {
    const critic = new Critic({ openai, model: "gpt-test", dryRun: true });
    const ctx: NodeContext = {
      originalIntent: "Add tracing",
      ancestorSummaries: [],
    };
    const audit = await critic.auditCoverage(ctx, "summary");
    expect(audit.followUpRoundFired).toBe(false);
  });
});
