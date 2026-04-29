import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import yaml from "js-yaml";
import type { DomainFacts, SchemaField } from "./types.js";

interface OpenApiSpec {
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, { summary?: string; description?: string }>>;
  components?: {
    schemas?: Record<string, {
      type?: string;
      required?: string[];
      properties?: Record<string, { type?: string; description?: string }>;
    }>;
  };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export async function loadFromOpenApi(filePath: string): Promise<DomainFacts> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`OpenAPI spec file not found: ${filePath}`);
  }

  const ext = extname(filePath).toLowerCase();
  let spec: OpenApiSpec;
  if (ext === ".yaml" || ext === ".yml") {
    spec = yaml.load(raw) as OpenApiSpec;
  } else {
    spec = JSON.parse(raw) as OpenApiSpec;
  }

  const domain = spec.info?.title
    ? `${spec.info.title} API (v${spec.info.version ?? "unknown"})`
    : "OpenAPI spec";

  const apiEndpoints = Object.entries(spec.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) => HTTP_METHODS.includes(method.toLowerCase()))
      .map(([method, op]) => ({
        method: method.toUpperCase(),
        path,
        description: op.summary ?? op.description ?? "",
      }))
  );

  const schemas = Object.entries(spec.components?.schemas ?? {}).map(([name, def]) => {
    const required = new Set(def.required ?? []);
    const fields: SchemaField[] = Object.entries(def.properties ?? {}).map(([fieldName, prop]) => ({
      name: fieldName,
      type: prop.type ?? "unknown",
      required: required.has(fieldName),
      description: prop.description,
    }));
    return { name, fields };
  });

  return { domain, apiEndpoints, schemas, constraints: [], knownAbsences: [] };
}
