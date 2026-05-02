import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultToolAdapters } from "../../src/tools/adapters.js";

function adapterFor(toolName: string, workingDirectory: string) {
  const adapter = defaultToolAdapters(workingDirectory).find((item) => item.toolName === toolName);

  if (!adapter) {
    throw new Error(`Missing adapter ${toolName}`);
  }

  return adapter;
}

describe("defaultToolAdapters", () => {
  it("refuses repo-read symlinks that resolve outside the repository root", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    const outside = await mkdtemp(path.join(tmpdir(), "cto-outside-"));
    const secretPath = path.join(outside, "secret.txt");
    await writeFile(secretPath, "SECRET_CONTENT_DO_NOT_READ", "utf-8");
    await symlink(secretPath, path.join(repo, "linked-secret.txt"));

    const result = await adapterFor("repo-read", repo).execute({
      toolName: "repo-read",
      query: "linked-secret.txt",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("Refused");
    expect(result.confidence).toBe(0);
    expect(result.findings.join("\n")).not.toContain("SECRET_CONTENT_DO_NOT_READ");
  });

  it("reports repo-read realpath failures as low-confidence read failures", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));

    const result = await adapterFor("repo-read", repo).execute({
      toolName: "repo-read",
      query: "missing.txt",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("Could not read");
    expect(result.confidence).toBe(0);
    expect(result.risksDiscovered[0]).toContain("repo-read failed");
  });

  it("treats rg status 1 as no repository matches", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    await writeFile(path.join(repo, "notes.txt"), "alpha beta gamma", "utf-8");

    const result = await adapterFor("repo-search", repo).execute({
      toolName: "repo-search",
      query: "not-present",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("No repository matches");
    expect(result.risksDiscovered).toEqual([]);
    expect(result.openQuestions[0]).toContain("not-present");
  });

  it("treats rg execution errors as adapter risks", async () => {
    const missingRepo = path.join(tmpdir(), "cto-missing-repo");

    const result = await adapterFor("repo-search", missingRepo).execute({
      toolName: "repo-search",
      query: "anything",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("failed");
    expect(result.confidence).toBe(0);
    expect(result.risksDiscovered[0]).toContain("repo-search failed");
  });

  it("uses literal repo-search matching instead of regular expressions", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    await writeFile(path.join(repo, "notes.txt"), "axb\n", "utf-8");

    const result = await adapterFor("repo-search", repo).execute({
      toolName: "repo-search",
      query: "a.b",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("No repository matches");
    expect(result.findings).toEqual([]);
    expect(await readFile(path.join(repo, "notes.txt"), "utf-8")).toBe("axb\n");
  });
});
