import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import type { CacheEntry, CacheStats } from "../types/index.js";

const CACHE_DIR = ".cambrian-tree/cache";

export const CACHE_PROMPT_VERSION = "cost-control-v1";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeIntentInput(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function repoFingerprint(cwd: string): string {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" });
  const status = spawnSync("git", ["status", "--short"], { cwd, encoding: "utf-8" });
  return sha256([
    head.status === 0 ? head.stdout.trim() : "no-head",
    status.status === 0 ? status.stdout.trim() : "no-status",
  ].join("\n"));
}

export function artifactHash(directory: string): string {
  if (!existsSync(directory)) return sha256("missing-artifact");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        walk(full);
      } else if (stats.isFile()) {
        files.push(full);
      }
    }
  };
  walk(directory);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(directory, file));
    hash.update("\0");
    hash.update(readFileSyncSafe(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readFileSyncSafe(file: string): Buffer {
  return readFileSync(file);
}

export interface CacheKeyInput {
  kind: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  input: unknown;
  repoFingerprint?: string;
  artifactHash?: string;
}

export function buildCacheKey(input: CacheKeyInput): string {
  return sha256(stableStringify({
    kind: input.kind,
    provider: input.provider ?? "",
    model: input.model ?? "",
    promptVersion: input.promptVersion ?? CACHE_PROMPT_VERSION,
    input: input.input,
    repoFingerprint: input.repoFingerprint ?? "",
    artifactHash: input.artifactHash ?? "",
  }));
}

export class DeterministicCache {
  readonly stats: CacheStats = { hits: 0, misses: 0, writes: 0 };
  private baseDir: string;
  private enabled: boolean;

  constructor(options: { cwd?: string; enabled?: boolean } = {}) {
    this.baseDir = join(options.cwd ?? process.cwd(), CACHE_DIR);
    this.enabled = options.enabled ?? true;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    try {
      const raw = await readFile(this.pathFor(key), "utf-8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      this.stats.hits += 1;
      return entry.value;
    } catch {
      this.stats.misses += 1;
      return undefined;
    }
  }

  async set<T>(entry: CacheEntry<T>): Promise<void> {
    if (!this.enabled) return;
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.pathFor(entry.key), JSON.stringify(entry, null, 2), "utf-8");
    this.stats.writes += 1;
  }

  private pathFor(key: string): string {
    return join(this.baseDir, `${key}.json`);
  }
}
