import OpenAI from "openai";
import { loadFromFile } from "./file-provider.js";
import { loadFromSample } from "./sample-provider.js";
import { loadFromOpenApi } from "./openapi-provider.js";
import type { DomainFacts } from "./types.js";

const KNOWN_PREFIXES = ["file", "sample", "openapi"] as const;
type GroundTruthPrefix = (typeof KNOWN_PREFIXES)[number];

export async function loadGroundTruth(
  spec: string,
  openai: OpenAI,
  model: string
): Promise<DomainFacts> {
  const colonIdx = spec.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Invalid --ground-truth spec "${spec}". Expected format: <source>:<path> (e.g. file:./facts.json)`
    );
  }

  const prefix = spec.slice(0, colonIdx) as GroundTruthPrefix;
  const path = spec.slice(colonIdx + 1);

  if (!(KNOWN_PREFIXES as readonly string[]).includes(prefix)) {
    throw new Error(
      `Unknown ground truth source "${prefix}". Valid sources: ${KNOWN_PREFIXES.join(", ")}`
    );
  }

  if (!path) {
    throw new Error(`Ground truth path must be non-empty after "${prefix}:"`);
  }

  switch (prefix) {
    case "file":
      return loadFromFile(path);
    case "sample":
      return loadFromSample(path, openai, model);
    case "openapi":
      return loadFromOpenApi(path);
  }
}
