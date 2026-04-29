import { describe, it, expect, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import OpenAI from "openai";
import { loadFromSample } from "../../src/ground-truth/sample-provider.js";

async function writeTempFile(name: string, content: string): Promise<string> {
  const dir = join(tmpdir(), "cto-test-gt-sample");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

const CSV_CONTENT = `Handle,Title,Vendor,Variant SKU,Variant Price,Cost per item,Variant Inventory Qty
blue-shirt,Blue Shirt,Acme,SHIRT-S,29.99,12.00,50
blue-shirt,Blue Shirt,Acme,SHIRT-M,29.99,12.00,80
`;

const EXTRACTED_FACTS = {
  domain: "CSV data sample",
  schemas: [
    {
      name: "sample",
      fields: [
        { name: "Handle", type: "string", required: true },
        { name: "Variant Price", type: "number", required: true },
      ],
    },
  ],
  constraints: ["One row per variant"],
  knownAbsences: ["No sales history column present"],
};

function makeMockOpenAI(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 200, completion_tokens: 150, total_tokens: 350 },
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("loadFromSample", () => {
  it("extracts DomainFacts from a CSV sample via LLM", async () => {
    const path = await writeTempFile("products.csv", CSV_CONTENT);
    const openai = makeMockOpenAI(JSON.stringify(EXTRACTED_FACTS));
    const result = await loadFromSample(path, openai, "gpt-4o");
    expect(result.domain).toBe("CSV data sample");
    expect(result.schemas?.[0].fields[0].name).toBe("Handle");
    expect(result.knownAbsences[0]).toBe("No sales history column present");
  });

  it("falls back to header-only extraction when LLM returns invalid JSON", async () => {
    const path = await writeTempFile("bad-response.csv", CSV_CONTENT);
    const openai = makeMockOpenAI("this is not json at all");
    const result = await loadFromSample(path, openai, "gpt-4o");
    expect(result.domain).toContain("bad-response.csv");
    expect(result.schemas?.[0].fields.map((f) => f.name)).toContain("Handle");
    expect(result.schemas?.[0].fields.map((f) => f.name)).toContain("Variant Price");
    expect(result.constraints).toEqual([]);
    expect(result.knownAbsences).toEqual([]);
  });

  it("throws when file does not exist", async () => {
    const openai = makeMockOpenAI("{}");
    await expect(loadFromSample("/no/such/file.csv", openai, "gpt-4o")).rejects.toThrow(
      "Sample file not found"
    );
  });
});
