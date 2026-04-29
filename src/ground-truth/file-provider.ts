import { readFile } from "node:fs/promises";
import { DomainFactsSchema } from "../schemas/index.js";
import type { DomainFacts } from "./types.js";

export async function loadFromFile(filePath: string): Promise<DomainFacts> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Ground truth file not found: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ground truth file: ${filePath}`);
  }

  const result = DomainFactsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => {
        const path = i.path.length > 0 ? `${i.path.join(".")}` : "root";
        return `${path}: ${i.message}`;
      })
      .join(", ");
    throw new Error(`Ground truth file validation failed: ${issues}`);
  }

  return result.data;
}
