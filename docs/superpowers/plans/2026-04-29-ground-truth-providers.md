# Ground Truth Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--ground-truth <spec>` CLI flag that injects verified domain facts into every agent debate and into the judge's scoring rubric, preventing hallucinated schemas and biased test fixtures.

**Architecture:** A `loadGroundTruth(spec, openai, model)` factory parses a `prefix:path` spec string, delegates to one of three typed providers (`file:`, `sample:`, `openapi:`), and returns a normalized `DomainFacts` object. That object is stored in `NodeContext.domainFacts`, propagated to every child node automatically via the existing context spread, surfaced in the agent prompt as a "Verified Ground Truth" section (especially the `knownAbsences` list), and included in the judge prompt to score a new `realWorldFit` dimension.

**Tech Stack:** TypeScript ESM, Node.js `fs/promises`, `zod` (already used), `js-yaml` (new dep for OpenAPI YAML parsing), OpenAI chat completions for sample extraction, `vitest` for tests.

---

## File Map

**Create:**
- `src/ground-truth/types.ts` — `DomainFacts`, `SchemaDefinition`, `SchemaField`, `ApiEndpoint` interfaces
- `src/ground-truth/provider.ts` — `GroundTruthProvider` interface + `loadGroundTruth()` factory
- `src/ground-truth/file-provider.ts` — reads and validates a user-authored JSON facts file
- `src/ground-truth/sample-provider.ts` — reads a CSV/JSON data sample, extracts schema via LLM
- `src/ground-truth/openapi-provider.ts` — parses OpenAPI JSON/YAML spec without LLM
- `tests/ground-truth/file-provider.test.ts`
- `tests/ground-truth/sample-provider.test.ts`
- `tests/ground-truth/openapi-provider.test.ts`
- `tests/ground-truth/provider.test.ts`

**Modify:**
- `src/types/index.ts` — add `DomainFacts` re-export + `domainFacts?: DomainFacts` to `NodeContext`
- `src/schemas/index.ts` — add `DomainFactsSchema`, add `realWorldFit` to `JudgeScoreSchema`
- `src/agents/definitions.ts` — add "Verified Ground Truth" section to `buildAgentPrompt()`
- `src/judge/judge.ts` — add `realWorldFit` dimension; rebalance weights; include domain facts in prompt
- `src/orchestrator/orchestrator.ts` — add optional `domainFacts` parameter to `run()`
- `src/cli/index.ts` — add `--ground-truth <spec>` option, load before `orchestrator.run()`

---

## Task 1: Install js-yaml and define DomainFacts types

**Files:**
- Create: `src/ground-truth/types.ts`
- Modify: `package.json` (add js-yaml)

- [ ] **Step 1: Install js-yaml**

```bash
npm install js-yaml
npm install --save-dev @types/js-yaml
```

Expected: `js-yaml` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Create `src/ground-truth/types.ts`**

```typescript
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface SchemaDefinition {
  name: string;
  fields: SchemaField[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
}

export interface DomainFacts {
  domain: string;
  schemas?: SchemaDefinition[];
  apiEndpoints?: ApiEndpoint[];
  constraints: string[];
  knownAbsences: string[];
  rawContext?: string;
}
```

- [ ] **Step 3: Add `DomainFactsSchema` to `src/schemas/index.ts`**

Open `src/schemas/index.ts` and add at the bottom:

```typescript
export const SchemaFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
});

export const SchemaDefinitionSchema = z.object({
  name: z.string(),
  fields: z.array(SchemaFieldSchema),
});

export const ApiEndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string(),
});

export const DomainFactsSchema = z.object({
  domain: z.string().min(1),
  schemas: z.array(SchemaDefinitionSchema).optional(),
  apiEndpoints: z.array(ApiEndpointSchema).optional(),
  constraints: z.array(z.string()).default([]),
  knownAbsences: z.array(z.string()).default([]),
  rawContext: z.string().optional(),
});
```

- [ ] **Step 4: Run typecheck to verify no errors**

```bash
npx tsc --noEmit
```

Expected: exits 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add src/ground-truth/types.ts src/schemas/index.ts package.json package-lock.json
git commit -m "feat(ground-truth): add DomainFacts types and Zod schema"
```

---

## Task 2: File provider (TDD)

**Files:**
- Create: `src/ground-truth/file-provider.ts`
- Create: `tests/ground-truth/file-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ground-truth/file-provider.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/ground-truth/file-provider.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ground-truth/file-provider.js'`

- [ ] **Step 3: Implement `src/ground-truth/file-provider.ts`**

```typescript
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
    const issues = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Ground truth file validation failed: ${issues}`);
  }

  return result.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ground-truth/file-provider.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ground-truth/file-provider.ts tests/ground-truth/file-provider.test.ts
git commit -m "feat(ground-truth): add file provider with validation"
```

---

## Task 3: Sample provider (TDD)

**Files:**
- Create: `src/ground-truth/sample-provider.ts`
- Create: `tests/ground-truth/sample-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ground-truth/sample-provider.test.ts`:

```typescript
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
    expect(result.domain).toContain("products.csv");
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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/ground-truth/sample-provider.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ground-truth/sample-provider.js'`

- [ ] **Step 3: Implement `src/ground-truth/sample-provider.ts`**

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import OpenAI from "openai";
import { DomainFactsSchema } from "../schemas/index.js";
import type { DomainFacts, SchemaField } from "./types.js";

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
  openai: OpenAI,
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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `File: ${basename(filePath)}\n\nSample content:\n${preview}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonStr = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = DomainFactsSchema.safeParse(JSON.parse(jsonStr));
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ground-truth/sample-provider.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ground-truth/sample-provider.ts tests/ground-truth/sample-provider.test.ts
git commit -m "feat(ground-truth): add sample provider with LLM extraction and header fallback"
```

---

## Task 4: OpenAPI provider (TDD)

**Files:**
- Create: `src/ground-truth/openapi-provider.ts`
- Create: `tests/ground-truth/openapi-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ground-truth/openapi-provider.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFromOpenApi } from "../../src/ground-truth/openapi-provider.js";

async function writeTempFile(name: string, content: string): Promise<string> {
  const dir = join(tmpdir(), "cto-test-gt-openapi");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

const OPENAPI_JSON = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Petstore", version: "1.0.0" },
  paths: {
    "/pets": {
      get: { summary: "List all pets", operationId: "listPets" },
      post: { summary: "Create a pet", operationId: "createPet" },
    },
    "/pets/{id}": {
      get: { summary: "Get a pet by ID", operationId: "getPet" },
      delete: { summary: "Delete a pet", operationId: "deletePet" },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          tag: { type: "string" },
        },
      },
    },
  },
});

const OPENAPI_YAML = `openapi: "3.0.0"
info:
  title: Petstore
  version: "1.0.0"
paths:
  /pets:
    get:
      summary: List all pets
    post:
      summary: Create a pet
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
        name:
          type: string
`;

describe("loadFromOpenApi", () => {
  it("extracts API endpoints from JSON spec", async () => {
    const path = await writeTempFile("spec.json", OPENAPI_JSON);
    const result = await loadFromOpenApi(path);
    expect(result.apiEndpoints).toHaveLength(4);
    expect(result.apiEndpoints?.map((e) => `${e.method} ${e.path}`)).toContain("GET /pets");
    expect(result.apiEndpoints?.map((e) => `${e.method} ${e.path}`)).toContain("DELETE /pets/{id}");
  });

  it("extracts component schemas from JSON spec", async () => {
    const path = await writeTempFile("spec-schema.json", OPENAPI_JSON);
    const result = await loadFromOpenApi(path);
    const petSchema = result.schemas?.find((s) => s.name === "Pet");
    expect(petSchema).toBeDefined();
    expect(petSchema?.fields.find((f) => f.name === "id")?.required).toBe(true);
    expect(petSchema?.fields.find((f) => f.name === "tag")?.required).toBe(false);
  });

  it("extracts endpoints from YAML spec", async () => {
    const path = await writeTempFile("spec.yaml", OPENAPI_YAML);
    const result = await loadFromOpenApi(path);
    expect(result.apiEndpoints?.some((e) => e.path === "/pets")).toBe(true);
  });

  it("sets domain from spec info.title", async () => {
    const path = await writeTempFile("titled.json", OPENAPI_JSON);
    const result = await loadFromOpenApi(path);
    expect(result.domain).toContain("Petstore");
  });

  it("throws when file does not exist", async () => {
    await expect(loadFromOpenApi("/no/such/file.yaml")).rejects.toThrow(
      "OpenAPI spec file not found"
    );
  });

  it("returns empty arrays when spec has no paths or components", async () => {
    const empty = JSON.stringify({ openapi: "3.0.0", info: { title: "Empty" } });
    const path = await writeTempFile("empty.json", empty);
    const result = await loadFromOpenApi(path);
    expect(result.apiEndpoints).toEqual([]);
    expect(result.schemas).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.knownAbsences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/ground-truth/openapi-provider.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ground-truth/openapi-provider.js'`

- [ ] **Step 3: Implement `src/ground-truth/openapi-provider.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ground-truth/openapi-provider.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ground-truth/openapi-provider.ts tests/ground-truth/openapi-provider.test.ts
git commit -m "feat(ground-truth): add OpenAPI provider for JSON and YAML specs"
```

---

## Task 5: Provider factory (TDD)

**Files:**
- Create: `src/ground-truth/provider.ts`
- Create: `tests/ground-truth/provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ground-truth/provider.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import OpenAI from "openai";
import { loadGroundTruth } from "../../src/ground-truth/provider.js";
import type { DomainFacts } from "../../src/ground-truth/types.js";

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

function makeOpenAI(content: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
          usage: { total_tokens: 100 },
        }),
      },
    },
  } as unknown as OpenAI;
}

describe("loadGroundTruth", () => {
  it("routes file: prefix to file provider", async () => {
    const path = await writeTempFile("facts.json", JSON.stringify(VALID_FACTS));
    const result = await loadGroundTruth(`file:${path}`, {} as OpenAI, "gpt-4o");
    expect(result.domain).toBe("Test domain");
  });

  it("routes sample: prefix to sample provider", async () => {
    const csv = "Handle,Title\nshirt,Blue Shirt\n";
    const path = await writeTempFile("products.csv", csv);
    const openai = makeOpenAI(JSON.stringify({
      domain: "CSV sample",
      constraints: [],
      knownAbsences: [],
    }));
    const result = await loadGroundTruth(`sample:${path}`, openai, "gpt-4o");
    expect(result.domain).toBeDefined();
  });

  it("routes openapi: prefix to openapi provider", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "My API" },
      paths: { "/items": { get: { summary: "List" } } },
    });
    const path = await writeTempFile("spec.json", spec);
    const result = await loadGroundTruth(`openapi:${path}`, {} as OpenAI, "gpt-4o");
    expect(result.domain).toContain("My API");
    expect(result.apiEndpoints?.[0].path).toBe("/items");
  });

  it("throws on unknown prefix", async () => {
    await expect(
      loadGroundTruth("unknown:/some/path", {} as OpenAI, "gpt-4o")
    ).rejects.toThrow('Unknown ground truth source "unknown"');
  });

  it("throws when path is empty after prefix", async () => {
    await expect(
      loadGroundTruth("file:", {} as OpenAI, "gpt-4o")
    ).rejects.toThrow("path must be non-empty");
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/ground-truth/provider.test.ts
```

Expected: FAIL — `Cannot find module '../../src/ground-truth/provider.js'`

- [ ] **Step 3: Implement `src/ground-truth/provider.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/ground-truth/provider.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Run all ground-truth tests together**

```bash
npx vitest run tests/ground-truth/
```

Expected: all 19 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ground-truth/provider.ts tests/ground-truth/provider.test.ts
git commit -m "feat(ground-truth): add provider factory routing file/sample/openapi prefixes"
```

---

## Task 6: Extend NodeContext with domainFacts

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Import DomainFacts and add to NodeContext**

In `src/types/index.ts`, add the import at the top and extend `NodeContext`:

```typescript
// Add this import at the top (after existing imports):
import type { DomainFacts } from "../ground-truth/types.js";
export type { DomainFacts };
```

Find the `NodeContext` interface and add one field:

```typescript
export interface NodeContext {
  originalIntent: string;
  intentDecomposition?: IntentDecomposition;
  domainFacts?: DomainFacts;            // ← add this line
  prd?: string;
  acceptanceCriteria?: string[];
  architectureDecisions?: string[];
  branchDecision?: string;
  implementationSpec?: string;
  testStrategy?: string;
  ancestorSummaries: string[];
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Run full test suite to verify no regressions**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(ground-truth): add domainFacts field to NodeContext"
```

---

## Task 7: Inject domain facts into agent prompts

**Files:**
- Modify: `src/agents/definitions.ts`

The `buildAgentPrompt()` function builds a `contextSummary` string by joining an array of sections. Add a `domainFacts` section that appears **before** the PRD (so it frames the entire debate).

- [ ] **Step 1: Add the domain facts section to `buildAgentPrompt()`**

In `src/agents/definitions.ts`, find the `contextSummary` array inside `buildAgentPrompt()` (around line 526) and add the domain facts section as the second entry (right after the `originalIntent` line, before the decomposition section):

```typescript
  const domainFactsSection = input.context.domainFacts
    ? renderDomainFacts(input.context.domainFacts)
    : "";

  const contextSummary = [
    `## Original Intent\n${input.context.originalIntent}`,
    domainFactsSection,
    decompositionSection,
    // ... rest unchanged
```

Then add the `renderDomainFacts` helper function at the bottom of the file, before the export of `parseAgentResponse`:

```typescript
function renderDomainFacts(facts: import("../types/index.js").DomainFacts): string {
  const lines: string[] = [
    "## Verified Domain Ground Truth",
    "",
    "> These facts have been verified against real data or documentation. Treat them as hard constraints, not assumptions.",
    "",
    `**Domain:** ${facts.domain}`,
  ];

  if (facts.schemas?.length) {
    lines.push("", "**Data Schemas:**");
    for (const schema of facts.schemas) {
      const fieldList = schema.fields
        .map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`)
        .join(", ");
      lines.push(`- ${schema.name}: ${fieldList}`);
    }
  }

  if (facts.apiEndpoints?.length) {
    lines.push("", "**API Endpoints:**");
    for (const ep of facts.apiEndpoints) {
      lines.push(`- ${ep.method} ${ep.path}: ${ep.description}`);
    }
  }

  if (facts.constraints.length) {
    lines.push("", "**Verified Constraints:**");
    for (const c of facts.constraints) lines.push(`- ${c}`);
  }

  if (facts.knownAbsences.length) {
    lines.push(
      "",
      "**Known Absences (these do NOT exist — do not design solutions that assume they do):**"
    );
    for (const a of facts.knownAbsences) lines.push(`- ${a}`);
  }

  if (facts.rawContext) {
    lines.push("", "**Additional Context:**", facts.rawContext);
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/agents/definitions.ts
git commit -m "feat(ground-truth): render domain facts as verified constraints in agent prompts"
```

---

## Task 8: Add realWorldFit dimension to the judge

**Files:**
- Modify: `src/schemas/index.ts` — add `realWorldFit` field
- Modify: `src/types/index.ts` — add `realWorldFit` to `JudgeScore`
- Modify: `src/judge/judge.ts` — new rubric + rebalanced weights + domain facts in prompt

The new weight distribution (sums to 1.00):
- FC: 0.25 (was 0.30)
- AQ: 0.15 (was 0.20)
- TC: 0.15 (was 0.20)
- IA: 0.20 (unchanged)
- RWF: 0.15 (new)
- S: 0.10 (unchanged)

- [ ] **Step 1: Add `realWorldFit` to `JudgeScoreSchema` in `src/schemas/index.ts`**

Find `JudgeScoreSchema` and update it:

```typescript
export const JudgeScoreSchema = z.object({
  functionalCompleteness: z.number().min(0).max(10),
  architecturalQuality: z.number().min(0).max(10),
  testCoverage: z.number().min(0).max(10),
  intentAlignment: z.number().min(0).max(10),
  realWorldFit: z.number().min(0).max(10),
  simplicity: z.number().min(0).max(10),
  composite: z.number(),
  rationale: z.string(),
});
```

- [ ] **Step 2: Add `realWorldFit` to `JudgeScore` in `src/types/index.ts`**

Find `JudgeScore` interface and add the field:

```typescript
export interface JudgeScore {
  functionalCompleteness: number;
  architecturalQuality: number;
  testCoverage: number;
  intentAlignment: number;
  realWorldFit: number;
  simplicity: number;
  composite: number;
  rationale: string;
}
```

- [ ] **Step 3: Update `src/judge/judge.ts`**

Replace the entire `JUDGE_SYSTEM_PROMPT` constant with:

```typescript
const JUDGE_SYSTEM_PROMPT = `You are an expert software engineering judge. You evaluate code solutions against their original requirements.

## Scoring Rubrics (each 0-10)

### 1. Functional Completeness (weight: 0.25)
- 10: All acceptance criteria met, edge cases handled
- 7: Core functionality works, minor gaps
- 4: Partially functional, significant missing features
- 1: Barely functional or non-functional

### 2. Architectural Quality (weight: 0.15)
- 10: Clean separation of concerns, extensible, follows best practices
- 7: Reasonable architecture, minor improvements possible
- 4: Works but poorly structured, hard to maintain
- 1: No discernible architecture

### 3. Test Coverage (weight: 0.15)
- 10: Comprehensive unit + integration tests, all passing
- 7: Good test coverage, tests passing
- 4: Some tests, incomplete coverage
- 1: No tests or all failing

### 4. Intent Alignment (weight: 0.20)
- 10: Solution perfectly matches original intent
- 7: Mostly aligned, minor deviations
- 4: Significant drift from original intent
- 1: Barely related to original intent

### 5. Real-World Fit (weight: 0.15)
When domain ground truth is provided: evaluate whether the solution correctly handles the real data formats, schema, and API contracts specified.
When no domain ground truth is provided: evaluate whether the solution degrades gracefully when input columns/fields are missing or unexpected, and avoids assuming data shapes that may not exist in practice.
- 10: Perfectly handles real-world data; required columns match verified schema; missing optional columns are handled with warnings not crashes
- 7: Mostly handles real data; one or two assumptions that may not hold; or no domain facts were provided (neutral)
- 4: Makes assumptions that contradict known domain facts, or treats optional/absent fields as required
- 1: Solution would immediately crash against realistic input (e.g. requires columns that don't exist in the actual export format)

### 6. Simplicity (weight: 0.10)
- 10: Elegant, minimal complexity for the requirements
- 7: Reasonably simple, minor unnecessary complexity
- 4: Over-engineered or unnecessarily complex
- 1: Extremely convoluted

## Output Format
Respond with ONLY valid JSON:
{
  "functionalCompleteness": <0-10>,
  "architecturalQuality": <0-10>,
  "testCoverage": <0-10>,
  "intentAlignment": <0-10>,
  "realWorldFit": <0-10>,
  "simplicity": <0-10>,
  "composite": <weighted-average>,
  "rationale": "<2-3 sentence explanation>"
}`;
```

Then update the `score()` method's `userPrompt` to include domain facts:

```typescript
    const domainFactsSection = ctx.domainFacts
      ? `## Domain Ground Truth (verified facts — use these to evaluate Real-World Fit)
Domain: ${ctx.domainFacts.domain}
${ctx.domainFacts.schemas?.length ? `Schemas:\n${ctx.domainFacts.schemas.map((s) => `- ${s.name}: ${s.fields.map((f) => `${f.name}(${f.type}${f.required ? ",required" : ""})`).join(", ")}`).join("\n")}` : ""}
${ctx.domainFacts.knownAbsences.length ? `Known Absences (these fields do NOT exist):\n${ctx.domainFacts.knownAbsences.map((a) => `- ${a}`).join("\n")}` : ""}
${ctx.domainFacts.constraints.length ? `Constraints:\n${ctx.domainFacts.constraints.map((c) => `- ${c}`).join("\n")}` : ""}`
      : "## Domain Ground Truth\nNone provided. Evaluate Real-World Fit based on general robustness to missing or unexpected input.";

    const userPrompt = `# Solution to Judge

## Original Intent
${ctx.originalIntent}

## Branch Path
${ctx.ancestorSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${ctx.branchDecision ? `Final branch: ${ctx.branchDecision}` : ""}

## Acceptance Criteria
${ctx.acceptanceCriteria?.map((c) => `- ${c}`).join("\n") || "Not specified"}

${domainFactsSection}

## Solution Output
${result.output.slice(0, 8000)}

## Files Changed
${result.filesChanged.join(", ") || "Unknown"}

## Test Results
${result.testResults ? `Passed: ${result.testResults.passed}, Failed: ${result.testResults.failed}, Skipped: ${result.testResults.skipped}` : "No test results"}

---
Score this solution against all six rubrics. Pay special attention to Real-World Fit when domain ground truth is provided.`;
```

And update the composite calculation:

```typescript
      parsed.composite = Math.round(
        (parsed.functionalCompleteness * 0.25 +
          parsed.architecturalQuality * 0.15 +
          parsed.testCoverage * 0.15 +
          parsed.intentAlignment * 0.20 +
          parsed.realWorldFit * 0.15 +
          parsed.simplicity * 0.10) *
          100
      ) / 100;
```

And update `mockScore()` to include the new field:

```typescript
  private mockScore(node: TreeNode): JudgeScore {
    const seed = [...node.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const pick = (offset: number) => 5 + ((seed + offset) % 5);
    const fc = pick(0);
    const aq = pick(1);
    const tc = pick(2);
    const ia = pick(3);
    const rwf = pick(4);
    const s = pick(5);
    const composite =
      Math.round((fc * 0.25 + aq * 0.15 + tc * 0.15 + ia * 0.20 + rwf * 0.15 + s * 0.10) * 100) / 100;
    return {
      functionalCompleteness: fc,
      architecturalQuality: aq,
      testCoverage: tc,
      intentAlignment: ia,
      realWorldFit: rwf,
      simplicity: s,
      composite,
      rationale: `[dry-run] Synthetic score for ${node.branchLabel || "root"}.`,
    };
  }
```

And `failedScore()`:

```typescript
  private failedScore(rationale: string): JudgeScore {
    return {
      functionalCompleteness: 0,
      architecturalQuality: 0,
      testCoverage: 0,
      intentAlignment: 0,
      realWorldFit: 0,
      simplicity: 0,
      composite: 0,
      rationale,
    };
  }
```

- [ ] **Step 4: Update the score display in `src/cli/index.ts`**

Find the line in `printResults()` that prints dimension scores:

```typescript
      console.log(chalk.dim(`   FC:${r.score.functionalCompleteness} AQ:${r.score.architecturalQuality} TC:${r.score.testCoverage} IA:${r.score.intentAlignment} S:${r.score.simplicity}`));
```

Replace with:

```typescript
      console.log(chalk.dim(`   FC:${r.score.functionalCompleteness} AQ:${r.score.architecturalQuality} TC:${r.score.testCoverage} IA:${r.score.intentAlignment} RWF:${r.score.realWorldFit} S:${r.score.simplicity}`));
```

- [ ] **Step 5: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/schemas/index.ts src/types/index.ts src/judge/judge.ts src/cli/index.ts
git commit -m "feat(ground-truth): add realWorldFit judge dimension with rebalanced weights"
```

---

## Task 9: Orchestrator integration

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`

The orchestrator's `run()` method creates the root node. Add an optional second argument `domainFacts` and inject it into the root context.

- [ ] **Step 1: Update `run()` signature and root context in `orchestrator.ts`**

Import the type at the top:

```typescript
import type { DomainFacts } from "../ground-truth/types.js";
```

Change the `run` method signature:

```typescript
  async run(intent: string, domainFacts?: DomainFacts): Promise<RunState> {
```

Update the root node creation inside `run()`:

```typescript
    const root = this.createNode(null, 0, {
      originalIntent: intent,
      intentDecomposition: decomposition,
      domainFacts,                         // ← add this line
      ancestorSummaries: [],
    });
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/orchestrator/orchestrator.ts
git commit -m "feat(ground-truth): pass domainFacts into root NodeContext via orchestrator.run()"
```

---

## Task 10: CLI integration

**Files:**
- Modify: `src/cli/index.ts`

Add `--ground-truth <spec>` to the `run` command, load the facts before the orchestrator starts, and print a summary of what was loaded.

- [ ] **Step 1: Add imports to `src/cli/index.ts`**

At the top of the file, add:

```typescript
import { loadGroundTruth } from "../ground-truth/provider.js";
import type { DomainFacts } from "../ground-truth/types.js";
```

- [ ] **Step 2: Add the `--ground-truth` option to the run command**

After the existing `.option("--dry-run", ...)` line, add:

```typescript
  .option("--ground-truth <spec>", "Inject verified domain facts (e.g. file:./facts.json, sample:./data.csv, openapi:./spec.yaml)")
```

- [ ] **Step 3: Load ground truth in the run action handler**

Inside the `action` callback, after `const openai = makeOpenAIClient(dryRun);` and before the cost estimate block, add:

```typescript
    let domainFacts: DomainFacts | undefined;
    if (opts.groundTruth) {
      try {
        const spinner = ora("Loading ground truth...").start();
        domainFacts = await loadGroundTruth(opts.groundTruth, openai, fullConfig.reasoningModel);
        spinner.succeed(chalk.green(`Ground truth loaded: ${domainFacts.domain}`));
        if (domainFacts.knownAbsences.length) {
          console.log(chalk.dim(`  Known absences: ${domainFacts.knownAbsences.length} item(s)`));
        }
        if (domainFacts.schemas?.length) {
          console.log(chalk.dim(`  Schemas: ${domainFacts.schemas.map((s) => s.name).join(", ")}`));
        }
        if (domainFacts.apiEndpoints?.length) {
          console.log(chalk.dim(`  API endpoints: ${domainFacts.apiEndpoints.length} route(s)`));
        }
      } catch (err) {
        console.error(chalk.red(`Failed to load ground truth: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    }
```

Note: `fullConfig` must be defined before this block. Move the `fullConfig` declaration above the `domainFacts` block. Currently `fullConfig` is declared after the cost estimate — move it to immediately after `const config: Partial<RunConfig> = {...}`.

- [ ] **Step 4: Pass domainFacts to orchestrator.run()**

Find the line:

```typescript
      await orchestrator.run(intent);
```

Replace with:

```typescript
      await orchestrator.run(intent, domainFacts);
```

- [ ] **Step 5: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 7: Smoke test the CLI help**

```bash
npx tsx src/cli/index.ts run --help
```

Expected: `--ground-truth <spec>` appears in the options list.

- [ ] **Step 8: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(ground-truth): add --ground-truth CLI flag with load-time summary"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| `file:` provider — reads user-authored JSON | Task 2 |
| `sample:` provider — LLM extraction from data file | Task 3 |
| `openapi:` provider — parses OpenAPI JSON/YAML | Task 4 |
| Provider factory routing | Task 5 |
| DomainFacts propagated to all child nodes | Task 6 (spread via `...node.context`) |
| Domain facts visible to agents as hard constraints | Task 7 |
| `knownAbsences` signals anti-hallucination | Task 7 |
| Judge scores `realWorldFit` against domain facts | Task 8 |
| Judge neutral when no domain facts | Task 8 (scores 7 by default with guidance) |
| `--ground-truth` CLI flag | Task 10 |
| Pre-run summary of loaded facts | Task 10 |

### Placeholder scan

No TBD, TODO, or placeholder patterns found. All code blocks are complete.

### Type consistency

- `DomainFacts` defined in `src/ground-truth/types.ts`, re-exported from `src/types/index.ts`
- `JudgeScore.realWorldFit` added to both `JudgeScoreSchema` (Task 8 Step 1) and `JudgeScore` interface (Task 8 Step 2) before `judge.ts` uses it
- `NodeContext.domainFacts` added (Task 6) before orchestrator and agent definitions reference it (Tasks 7, 9)
- `mockScore()` and `failedScore()` both emit `realWorldFit` (Task 8 Step 3)
- `renderDomainFacts` imports `DomainFacts` from `../types/index.js` which re-exports it — consistent

### Ordering dependencies

Tasks must be done in order: 1 → 2 → 3 → 4 → 5 (providers) → 6 (types) → 7 (agent prompts) → 8 (judge) → 9 (orchestrator) → 10 (CLI). Task 6 must precede 7, 8, and 9 since they all reference `NodeContext.domainFacts`.
