import { describe, it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFromSample } from "../../src/ground-truth/sample-provider.js";
import { makeMockLLM } from "../helpers/llm.js";

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

describe("loadFromSample", () => {
  it("extracts DomainFacts from a CSV sample via LLM", async () => {
    const path = await writeTempFile("products.csv", CSV_CONTENT);
    const llm = makeMockLLM(JSON.stringify(EXTRACTED_FACTS), { inputTokens: 200, outputTokens: 150 });
    const result = await loadFromSample(path, llm, "gpt-4o");
    expect(result.domain).toBe("CSV data sample");
    expect(result.schemas?.[0].fields[0].name).toBe("Handle");
    expect(result.knownAbsences[0]).toBe("No sales history column present");
  });

  it("extracts DomainFacts when the LLM wraps JSON in prose or markdown fences", async () => {
    const path = await writeTempFile("wrapped.csv", CSV_CONTENT);
    const llm = makeMockLLM(`Here is the extracted schema:\n\n\`\`\`json\n${JSON.stringify(EXTRACTED_FACTS)}\n\`\`\``);

    const result = await loadFromSample(path, llm, "gpt-4o");

    expect(result.schemas?.[0].fields[0].name).toBe("Handle");
    expect(result.constraints).toContain("One row per variant");
  });

  it("falls back to header-only extraction when LLM returns invalid JSON", async () => {
    const path = await writeTempFile("bad-response.csv", CSV_CONTENT);
    const llm = makeMockLLM("this is not json at all");
    const result = await loadFromSample(path, llm, "gpt-4o");
    expect(result.domain).toContain("bad-response.csv");
    expect(result.schemas?.[0].fields.map((f) => f.name)).toContain("Handle");
    expect(result.schemas?.[0].fields.map((f) => f.name)).toContain("Variant Price");
    expect(result.constraints).toEqual([]);
    expect(result.knownAbsences).toEqual([]);
  });

  it("throws when file does not exist", async () => {
    const llm = makeMockLLM("{}");
    await expect(loadFromSample("/no/such/file.csv", llm, "gpt-4o")).rejects.toThrow(
      "Sample file not found"
    );
  });
});
