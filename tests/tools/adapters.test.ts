import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultToolAdapters } from "../../src/tools/adapters.js";

function adapterFor(toolName: string, workingDirectory: string) {
  const adapter = defaultToolAdapters(workingDirectory).find((item) => item.toolName === toolName);

  if (!adapter) {
    throw new Error(`Missing adapter ${toolName}`);
  }

  return adapter;
}

const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
  delete process.env.CTO_RIPGREP_PATH;
});

async function pathWithOnlyGit(): Promise<string> {
  const gitPath = spawnSync("git", ["--exec-path"], { encoding: "utf-8" });
  if (gitPath.error || gitPath.status !== 0) {
    throw new Error("git is required for this test");
  }

  const gitBinary = spawnSync("which", ["git"], { encoding: "utf-8" }).stdout.trim();
  const bin = await mkdtemp(path.join(tmpdir(), "cto-bin-"));
  await symlink(gitBinary, path.join(bin, "git"));
  process.env.CTO_RIPGREP_PATH = path.join(bin, "missing-rg");
  return bin;
}

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
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

  it("matches repo-search queries case-insensitively", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    await writeFile(path.join(repo, "cli.ts"), "CLI entry point\n", "utf-8");

    const result = await adapterFor("repo-search", repo).execute({
      toolName: "repo-search",
      query: "cli",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("Found");
    expect(result.findings.some((finding) => finding.includes("cli.ts:1:CLI entry point"))).toBe(true);
  });

  it("prioritizes repo-search matches in file paths", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    await writeFile(path.join(repo, "codex-client.ts"), "substring path match\n", "utf-8");
    await writeFile(path.join(repo, "root.ts"), "CLI mention in a generic file\n", "utf-8");
    await writeFile(path.join(repo, "cli-entry.ts"), "hyphenated path match\n", "utf-8");
    await writeFile(path.join(repo, "cli.ts"), "exact basename path match\n", "utf-8");

    const result = await adapterFor("repo-search", repo).execute({
      toolName: "repo-search",
      query: "cli",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.findings[0]).toContain("cli.ts");
    expect(result.sources[0].path).toBe("cli.ts");
  });

  it("falls back to Git-tracked files when ripgrep is unavailable", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    process.env.PATH = await pathWithOnlyGit();
    await writeFile(path.join(repo, "cli.ts"), "CLI entry point\n", "utf-8");
    runGit(repo, ["init"]);
    runGit(repo, ["add", "cli.ts"]);

    const result = await adapterFor("repo-search", repo).execute({
      toolName: "repo-search",
      query: "cli",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("Found");
    expect(result.findings[0]).toContain("cli.ts");
    expect(result.risksDiscovered).toEqual([]);
    expect(result.limitations).toContain("ripgrep was unavailable; searched Git-tracked files with a slower fallback.");
  });

  it("falls back to a filesystem walk outside Git repositories when ripgrep is unavailable", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    process.env.PATH = await pathWithOnlyGit();
    await mkdir(path.join(repo, "src"));
    await writeFile(path.join(repo, "src", "cli.ts"), "CLI entry point\n", "utf-8");

    const result = await adapterFor("repo-search", repo).execute({
      toolName: "repo-search",
      query: "cli",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("Found");
    expect(result.findings[0]).toContain("src/cli.ts");
    expect(result.risksDiscovered).toEqual([]);
    expect(result.limitations).toContain("ripgrep and git file listing were unavailable; searched the filesystem with default excludes.");
  });

  it("maps repository structure without searching for incidental content matches", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "cto-repo-"));
    await mkdir(path.join(repo, "src"));
    await mkdir(path.join(repo, "tests"));
    await writeFile(path.join(repo, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
    await writeFile(path.join(repo, "README.md"), "# Example\n", "utf-8");
    await writeFile(path.join(repo, "src", "cli.ts"), "export const cli = true;\n", "utf-8");
    await writeFile(path.join(repo, "tests", "cli.test.ts"), "test('cli', () => {});\n", "utf-8");

    const result = await adapterFor("repo-map", repo).execute({
      toolName: "repo-map",
      query: "structure",
      nodeId: "node-1",
      roundNumber: 1,
    });

    expect(result.summary).toContain("Mapped repository structure");
    expect(result.findings).toEqual(expect.arrayContaining([
      "Root file: package.json",
      "Root file: README.md",
      "Top-level directory: src/",
      "Top-level directory: tests/",
    ]));
    expect(result.sources.map((source) => source.path)).toEqual(expect.arrayContaining([
      "package.json",
      "README.md",
      "src/cli.ts",
      "tests/cli.test.ts",
    ]));
    expect(result.risksDiscovered).toEqual([]);
  });
});
