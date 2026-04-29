/**
 * File-based persistence for run state.
 * Saves to .cambrian-tree/<run-id>/state.json
 */

import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RunState } from "../types/index.js";

const STORE_DIR = ".cambrian-tree";
const LEGACY_STORE_DIR = ".codex-tree";

export class FileStore {
  private baseDir: string;
  private legacyBaseDir?: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(process.cwd(), STORE_DIR);
    this.legacyBaseDir = baseDir ? undefined : join(process.cwd(), LEGACY_STORE_DIR);
  }

  async save(state: RunState): Promise<void> {
    const dir = join(this.baseDir, state.id);
    await mkdir(dir, { recursive: true });
    const finalPath = join(dir, "state.json");
    const tempPath = join(dir, `state.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf-8");
    await rename(tempPath, finalPath);
  }

  async load(runId: string): Promise<RunState | null> {
    const state = await this.loadFrom(this.baseDir, runId);
    if (state) return state;
    if (this.legacyBaseDir) return this.loadFrom(this.legacyBaseDir, runId);
    return null;
  }

  private async loadFrom(baseDir: string, runId: string): Promise<RunState | null> {
    try {
      const content = await readFile(join(baseDir, runId, "state.json"), "utf-8");
      return JSON.parse(content) as RunState;
    } catch {
      return null;
    }
  }

  async listRuns(): Promise<Array<{ id: string; intent: string; status: string; startedAt: string }>> {
    const runsById = new Map<string, { id: string; intent: string; status: string; startedAt: string }>();
    await this.collectRuns(this.baseDir, runsById);
    if (this.legacyBaseDir) await this.collectRuns(this.legacyBaseDir, runsById);
    return [...runsById.values()].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  private async collectRuns(
    baseDir: string,
    runsById: Map<string, { id: string; intent: string; status: string; startedAt: string }>,
  ): Promise<void> {
    try {
      const dirs = await readdir(baseDir);
      for (const dir of dirs) {
        const state = await this.loadFrom(baseDir, dir);
        if (state) {
          if (!runsById.has(state.id)) {
            runsById.set(state.id, {
              id: state.id,
              intent: state.intent.slice(0, 80),
              status: state.status,
              startedAt: state.startedAt,
            });
          }
        }
      }
    } catch {
      return;
    }
  }
}
