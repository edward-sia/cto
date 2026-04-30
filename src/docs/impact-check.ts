import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_CANDIDATES = ["origin/main", "origin/master", "main", "master"];

export interface DocsImpactClassification {
  changedFiles: string[];
  codeFiles: string[];
  docsFiles: string[];
  requiresDocsUpdate: boolean;
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isDocumentationPath(filePath: string): boolean {
  const normalized = normalizeFilePath(filePath);
  return (
    normalized === "README.md" ||
    normalized === "AGENTS.md" ||
    normalized === "CLAUDE.md" ||
    normalized.startsWith("docs/")
  );
}

export function isCodeImpactPath(filePath: string): boolean {
  const normalized = normalizeFilePath(filePath);
  return (
    normalized === "package.json" ||
    normalized === "package-lock.json" ||
    normalized === "tsconfig.json" ||
    normalized === "vitest.config.ts" ||
    normalized === "eslint.config.js" ||
    normalized.startsWith("src/") ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith(".github/")
  );
}

export function classifyChangedFiles(files: string[]): DocsImpactClassification {
  const changedFiles = [...new Set(files.map(normalizeFilePath).filter(Boolean))].sort();
  const codeFiles = changedFiles.filter(isCodeImpactPath);
  const docsFiles = changedFiles.filter(isDocumentationPath);

  return {
    changedFiles,
    codeFiles,
    docsFiles,
    requiresDocsUpdate: codeFiles.length > 0 && docsFiles.length === 0,
  };
}

function runGit(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function splitLines(output: string | undefined): string[] {
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findMergeBase(cwd: string): string | undefined {
  const candidates = [
    ...(process.env.DOCS_CHECK_BASE ? [process.env.DOCS_CHECK_BASE] : []),
    ...DEFAULT_BASE_CANDIDATES,
  ];

  for (const candidate of candidates) {
    const mergeBase = runGit(["merge-base", "HEAD", candidate], cwd);
    if (mergeBase) return mergeBase;
  }
  return undefined;
}

export function listChangedFiles(cwd = process.cwd()): string[] {
  const mergeBase = findMergeBase(cwd);
  const committed = mergeBase
    ? splitLines(runGit(["diff", "--name-only", "--diff-filter=ACMRTUXB", `${mergeBase}...HEAD`], cwd))
    : [];
  const staged = splitLines(runGit(["diff", "--name-only", "--cached", "--diff-filter=ACMRTUXB"], cwd));
  const unstaged = splitLines(runGit(["diff", "--name-only", "--diff-filter=ACMRTUXB"], cwd));
  const untracked = splitLines(runGit(["ls-files", "--others", "--exclude-standard"], cwd));

  return [...new Set([...committed, ...staged, ...unstaged, ...untracked])].sort();
}

function formatList(files: string[], limit = 12): string {
  const shown = files.slice(0, limit).map((file) => `  - ${file}`).join("\n");
  const hiddenCount = files.length - limit;
  return hiddenCount > 0 ? `${shown}\n  ...and ${hiddenCount} more` : shown;
}

export function runDocsImpactCheck(cwd = process.cwd()): number {
  const classification = classifyChangedFiles(listChangedFiles(cwd));

  if (!classification.changedFiles.length) {
    console.log("docs:check passed (no changed files detected)");
    return 0;
  }

  if (!classification.codeFiles.length) {
    console.log("docs:check passed (no code-impacting files changed)");
    return 0;
  }

  if (!classification.requiresDocsUpdate) {
    console.log(
      `docs:check passed (${classification.codeFiles.length} code-impacting file(s), ${classification.docsFiles.length} docs file(s))`
    );
    return 0;
  }

  if (process.env.DOCS_IMPACT === "none") {
    console.log(
      "docs:check passed with DOCS_IMPACT=none. Use this only for changes that genuinely do not affect README, AGENTS, CLAUDE, docs, or architecture."
    );
    return 0;
  }

  console.error("docs:check failed: code-impacting files changed without documentation updates.");
  console.error("\nCode-impacting files:");
  console.error(formatList(classification.codeFiles));
  console.error(
    "\nUpdate README.md, AGENTS.md, CLAUDE.md, or docs/** before completing this change. If this is truly a no-docs-impact change, rerun with DOCS_IMPACT=none."
  );
  return 1;
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedFile === thisFile) {
  process.exitCode = runDocsImpactCheck();
}
