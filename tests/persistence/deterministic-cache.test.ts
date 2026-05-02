import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  DeterministicCache,
  artifactHash,
  buildCacheKey,
  normalizeIntentInput,
  stableStringify,
} from "../../src/persistence/deterministic-cache.js";

describe("deterministic cache", () => {
  it("stable-stringifies objects regardless of key order", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
  });

  it("changes keys when model, prompt version, input, or fingerprints change", () => {
    const base = {
      kind: "intent-decomposition",
      provider: "openai",
      model: "cheap",
      promptVersion: "v1",
      input: { intent: "build api" },
      repoFingerprint: "repo-a",
    };

    expect(buildCacheKey(base)).not.toBe(buildCacheKey({ ...base, model: "strong" }));
    expect(buildCacheKey(base)).not.toBe(buildCacheKey({ ...base, promptVersion: "v2" }));
    expect(buildCacheKey(base)).not.toBe(buildCacheKey({ ...base, input: { intent: "build cli" } }));
    expect(buildCacheKey(base)).not.toBe(buildCacheKey({ ...base, repoFingerprint: "repo-b" }));
  });

  it("persists cache hits and misses on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cto-cache-"));
    try {
      const cache = new DeterministicCache({ cwd: dir });
      const key = buildCacheKey({ kind: "x", input: { a: 1 } });

      await expect(cache.get<{ value: number }>(key)).resolves.toBeUndefined();
      await cache.set({ key, kind: "x", value: { value: 7 }, createdAt: "now" });
      await expect(cache.get<{ value: number }>(key)).resolves.toEqual({ value: 7 });
      expect(cache.stats).toEqual({ hits: 1, misses: 1, writes: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hashes artifact directory contents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cto-artifact-"));
    try {
      await mkdir(join(dir, "src"));
      await writeFile(join(dir, "src", "a.ts"), "export const a = 1;\n");
      const first = artifactHash(dir);
      await writeFile(join(dir, "src", "a.ts"), "export const a = 2;\n");
      expect(artifactHash(dir)).not.toBe(first);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("normalizes intent input for reusable analysis keys", () => {
    expect(normalizeIntentInput("  Build   A REST API ")).toBe("build a rest api");
  });
});
