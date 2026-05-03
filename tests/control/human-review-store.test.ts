import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HumanReviewStore } from "../../src/control/human-review-store.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("HumanReviewStore", () => {
  it("waits for a browser-submitted decision file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cto-human-review-"));
    const storeDir = join(tempDir, "runs");
    const store = new HumanReviewStore(storeDir);
    const waiting = store.waitForDecision("run-live", "review-123", { pollMs: 5 });

    await mkdir(join(storeDir, "run-live"), { recursive: true });
    await store.writeDecision("run-live", "review-123", {
      action: "revise",
      prompt: "Prefer the streaming-first plan.",
    });

    await expect(waiting).resolves.toEqual({
      action: "revise",
      prompt: "Prefer the streaming-first plan.",
    });
  });

  it("rejects invalid decision payloads", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cto-human-review-"));
    const store = new HumanReviewStore(join(tempDir, "runs"));

    await expect(
      store.writeDecision("run-live", "review-123", {
        action: "revise",
        prompt: "",
      }),
    ).rejects.toThrow("Revision prompt cannot be empty");
  });
});
