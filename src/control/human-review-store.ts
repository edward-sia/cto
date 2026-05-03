import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HumanPlanDecision } from "../types/index.js";
import { resolveStoreDir } from "../persistence/store-path.js";

const POLL_MS = 250;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface WaitForDecisionOptions {
  pollMs?: number;
}

export class HumanReviewStore {
  constructor(private readonly baseDir = resolveStoreDir()) {}

  async writeDecision(runId: string, requestId: string, decision: HumanPlanDecision): Promise<void> {
    const parsed = parseHumanPlanDecision(decision);
    const dir = this.controlDir(runId);
    await mkdir(dir, { recursive: true });
    await writeFile(this.decisionPath(runId, requestId), JSON.stringify(parsed, null, 2), "utf-8");
  }

  async readDecision(runId: string, requestId: string): Promise<HumanPlanDecision | null> {
    try {
      const content = await readFile(this.decisionPath(runId, requestId), "utf-8");
      return parseHumanPlanDecision(JSON.parse(content));
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }
  }

  async waitForDecision(
    runId: string,
    requestId: string,
    options: WaitForDecisionOptions = {},
  ): Promise<HumanPlanDecision> {
    const pollMs = options.pollMs ?? POLL_MS;
    while (true) {
      const decision = await this.readDecision(runId, requestId);
      if (decision) return decision;
      await delay(pollMs);
    }
  }

  private controlDir(runId: string): string {
    assertSafeId(runId, "Run ID");
    return join(this.baseDir, runId, "control");
  }

  private decisionPath(runId: string, requestId: string): string {
    assertSafeId(requestId, "Review request ID");
    return join(this.controlDir(runId), `${requestId}.decision.json`);
  }
}

export function parseHumanPlanDecision(value: unknown): HumanPlanDecision {
  if (!value || typeof value !== "object") {
    throw new Error("Decision payload must be an object");
  }

  const action = (value as { action?: unknown }).action;
  if (action === "proceed" || action === "kill") {
    return { action };
  }

  if (action === "revise") {
    const prompt = (value as { prompt?: unknown }).prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new Error("Revision prompt cannot be empty");
    }
    return { action, prompt: prompt.trim() };
  }

  throw new Error("Decision action must be proceed, revise, or kill");
}

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`${label} contains unsupported characters`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT");
}
