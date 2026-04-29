import { describe, it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFromFile } from "../../src/ground-truth/file-provider.js";
import type { DomainFacts } from "../../src/ground-truth/types.js";

const validFacts: DomainFacts = {
  domain: "Shopify product CSV",
  schemas: [
    {
      name: "products",
      fields: [
        { name: "Handle", type: "string", required: true },
        { name: "Variant Price", type: "number", required: true },
      ],
    },
  ],
  constraints: ["One row per variant"],
  knownAbsences: ["No sales history columns"],
};

async function writeTempFile(name: string, content: string): Promise<string> {
  const dir = join(tmpdir(), "cto-test-gt");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

describe("loadFromFile", () => {
  it("loads and returns valid DomainFacts JSON", async () => {
    const path = await writeTempFile("valid.json", JSON.stringify(validFacts));
    const result = await loadFromFile(path);
    expect(result.domain).toBe("Shopify product CSV");
    expect(result.schemas?.[0].fields[0].name).toBe("Handle");
    expect(result.knownAbsences[0]).toBe("No sales history columns");
  });

  it("defaults constraints and knownAbsences to empty arrays when omitted", async () => {
    const minimal = { domain: "Test domain" };
    const path = await writeTempFile("minimal.json", JSON.stringify(minimal));
    const result = await loadFromFile(path);
    expect(result.constraints).toEqual([]);
    expect(result.knownAbsences).toEqual([]);
  });

  it("throws with a clear message when file does not exist", async () => {
    await expect(loadFromFile("/does/not/exist.json")).rejects.toThrow(
      "Ground truth file not found"
    );
  });

  it("throws with a clear message when file contains invalid JSON", async () => {
    const path = await writeTempFile("bad.json", "{ not valid json }");
    await expect(loadFromFile(path)).rejects.toThrow("Invalid JSON");
  });

  it("throws with a clear message when required field 'domain' is missing", async () => {
    const path = await writeTempFile("nodomain.json", JSON.stringify({ constraints: [] }));
    await expect(loadFromFile(path)).rejects.toThrow("domain");
  });
});
