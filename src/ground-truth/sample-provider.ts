import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { DomainFactsSchema } from "../schemas/index.js";
import type { LLMClient } from "../providers/llm-provider.js";
import type { DomainFacts, SchemaField } from "./types.js";
import { parseJsonObject } from "../utils/json.js";

const EXTRACTION_SYSTEM_PROMPT = `You are a data schema analyst. Given a data sample (CSV or JSON), extract:
1. The column/field names, their data types, and whether they appear required (present in every row)
2. Any constraints implied by the data (e.g. "one row per variant", "prices have no currency symbol")
3. Columns or fields that are notably absent that a naive developer might assume exist

Respond ONLY with valid JSON matching this shape:
{
  "domain": "<short description of what this data represents>",
  "schemas": [{ "name": "sample", "fields": [{ "name": string, "type": string, "required": boolean }] }],
  "constraints": [string],
  "knownAbsences": [string]
}`;

export async function loadFromSample(
  filePath: string,
  llm: LLMClient,
  model: string
): Promise<DomainFacts> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Sample file not found: ${filePath}`);
  }

  const preview = raw.slice(0, 4000);

  try {
    const response = await llm.createChatCompletion({
      model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `File: ${basename(filePath)}\n\nSample content:\n${preview}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 1024,
    });

    const parsed = DomainFactsSchema.safeParse(parseJsonObject(response.text));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to header-only fallback
  }

  return inferFromHeaders(filePath, raw);
}

function inferFromHeaders(filePath: string, raw: string): DomainFacts {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const fields: SchemaField[] = headers
    .filter(Boolean)
    .map((name) => ({ name, type: "string", required: false }));

  return {
    domain: `CSV data sample — ${basename(filePath)}`,
    schemas: [{ name: "sample", fields }],
    constraints: [],
    knownAbsences: [],
  };
}
