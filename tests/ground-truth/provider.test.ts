import { describe, it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadGroundTruth } from "../../src/ground-truth/provider.js";
import type { DomainFacts } from "../../src/ground-truth/types.js";
import { makeMockLLM } from "../helpers/llm.js";
import type { LLMClient } from "@cto/llm-providers";

async function writeTempFile(name: string, content: string): Promise<string> {
  const dir = join(tmpdir(), "cto-test-gt-factory");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

const VALID_FACTS: DomainFacts = {
  domain: "Test domain",
  constraints: ["One rule"],
  knownAbsences: ["Missing field"],
};

describe("loadGroundTruth", () => {
  it("routes file: prefix to file provider", async () => {
    const path = await writeTempFile("facts.json", JSON.stringify(VALID_FACTS));
    const result = await loadGroundTruth(`file:${path}`, {} as LLMClient, "gpt-4o");
    expect(result.domain).toBe("Test domain");
  });

  it("routes sample: prefix to sample provider", async () => {
    const csv = "Handle,Title\nshirt,Blue Shirt\n";
    const path = await writeTempFile("products.csv", csv);
    const llm = makeMockLLM(JSON.stringify({
      domain: "CSV sample",
      constraints: [],
      knownAbsences: [],
    }));
    const result = await loadGroundTruth(`sample:${path}`, llm, "gpt-4o");
    expect(result.domain).toBeDefined();
  });

  it("routes openapi: prefix to openapi provider", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "My API" },
      paths: { "/items": { get: { summary: "List" } } },
    });
    const path = await writeTempFile("spec.json", spec);
    const result = await loadGroundTruth(`openapi:${path}`, {} as LLMClient, "gpt-4o");
    expect(result.domain).toContain("My API");
    expect(result.apiEndpoints?.[0].path).toBe("/items");
  });

  it("throws on unknown prefix", async () => {
    await expect(
      loadGroundTruth("unknown:/some/path", {} as LLMClient, "gpt-4o")
    ).rejects.toThrow('Unknown ground truth source "unknown"');
  });

  it("throws when path is empty after prefix", async () => {
    await expect(
      loadGroundTruth("file:", {} as LLMClient, "gpt-4o")
    ).rejects.toThrow("path must be non-empty");
  });
});
