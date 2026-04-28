/**
 * File-based persistence for run state.
 * Saves to .codex-tree/<run-id>/state.json
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunState } from "../types/index.js";

const STORE_DIR = ".codex-tree";

export class FileStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(process.cwd(), STORE_DIR);
  }

  async save(state: RunState): Promise<void> {
    const dir = join(this.baseDir, state.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "state.json"), JSON.stringify(state, null, 2), "utf-8");
  }

  async load(runId: string): Promise<RunState | null> {
    try {
      const content = await readFile(join(this.baseDir, runId, "state.json"), "utf-8");
      return JSON.parse(content) as RunState;
    } catch {
      return null;
    }
  }

  async listRuns(): Promise<Array<{ id: string; intent: string; status: string; startedAt: string }>> {
    try {
      const dirs = await readdir(this.baseDir);
      const runs = [];
      for (const dir of dirs) {
        const state = await this.load(dir);
        if (state) {
          runs.push({
            id: state.id,
            intent: state.intent.slice(0, 80),
            status: state.status,
            startedAt: state.startedAt,
          });
        }
      }
      return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    } catch {
      return [];
    }
  }
}
