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
