import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ToolEvidenceSource, ToolName } from "../types/index.js";

export interface ToolBrokerRequest {
  toolName: ToolName;
  query: string;
  nodeId: string;
  roundNumber: number;
}

export interface ToolAdapterResult {
  summary: string;
  findings: string[];
  decisionRelevance: string[];
  constraintsDiscovered: string[];
  risksDiscovered: string[];
  openQuestions: string[];
  sources: ToolEvidenceSource[];
  limitations: string[];
  confidence: number;
}

export interface ToolAdapter {
  toolName: ToolName;
  readOnly: boolean;
  execute(request: ToolBrokerRequest): Promise<ToolAdapterResult> | ToolAdapterResult;
}

const TEXT_DECODER_LIMIT = 6000;
const FINDING_LINE_LIMIT = 80;
const SEARCH_LINE_LIMIT = 20;
const SEARCH_FILE_SIZE_LIMIT = 512 * 1024;
const SEARCH_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".cambrian-tree",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

type RepoSearchBackend = "ripgrep" | "git-files" | "filesystem";

interface RepoSearchMatch {
  path: string;
  line?: number;
  text: string;
  kind: "path" | "content";
}

interface RepoSearchResult {
  backend: RepoSearchBackend;
  matches: RepoSearchMatch[];
  limitations: string[];
  risks: string[];
  confidence: number;
}

export function defaultToolAdapters(workingDirectory: string): ToolAdapter[] {
  return [
    repoMapAdapter(workingDirectory),
    repoSearchAdapter(workingDirectory),
    repoReadAdapter(workingDirectory),
    packageInfoAdapter(workingDirectory),
    unavailableAdapter("web-search"),
    unavailableAdapter("web-fetch"),
    unavailableAdapter("docs-fetch"),
  ];
}

function repoSearchAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "repo-search",
    readOnly: true,
    execute(request) {
      const completed = new Date().toISOString();
      const result = searchRepository(workingDirectory, request.query);
      const matches = result.matches.slice(0, SEARCH_LINE_LIMIT);
      const findings = matches.map((match) => formatRepoSearchMatch(match, request.query));

      if (findings.length === 0 && result.risks.length > 0) {
        return {
          summary: `Repository search failed for "${request.query}".`,
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: result.risks,
          openQuestions: [],
          sources: [],
          limitations: result.limitations,
          confidence: 0,
        };
      }

      if (findings.length === 0) {
        return {
          summary: `No repository matches found for "${request.query}".`,
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: [],
          openQuestions: [`No local code references matched "${request.query}".`],
          sources: [],
          limitations: result.limitations,
          confidence: Math.min(result.confidence, 0.4),
        };
      }

      return {
        summary: `Found ${findings.length} repository matches for "${request.query}".`,
        findings,
        decisionRelevance: findings.map((line) => `Local match: ${line}`),
        constraintsDiscovered: [],
        risksDiscovered: [],
        openQuestions: [],
        sources: matches.map((match) => sourceFromRepoSearchMatch(match, completed)),
        limitations: result.limitations,
        confidence: result.confidence,
      };
    },
  };
}

function repoMapAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "repo-map",
    readOnly: true,
    execute() {
      const retrievedAt = new Date().toISOString();
      try {
        const files = repositoryFilesForMapping(workingDirectory);
        const rootFiles = files
          .filter((filePath) => !filePath.includes("/"))
          .sort((a, b) => rootFilePriority(a) - rootFilePriority(b) || a.localeCompare(b));
        const topLevelDirectories = [...new Set(
          files
            .filter((filePath) => filePath.includes("/"))
            .map((filePath) => filePath.split("/")[0])
        )].sort();
        const representativeFiles = representativeRepoFiles(files);
        const findings = [
          ...rootFiles.slice(0, 12).map((filePath) => `Root file: ${filePath}`),
          ...topLevelDirectories.slice(0, 20).map((directory) => `Top-level directory: ${directory}/`),
          ...representativeFiles.slice(0, 20).map((filePath) => `Representative file: ${filePath}`),
        ].slice(0, 40);

        return {
          summary: `Mapped repository structure: ${rootFiles.length} root files, ${topLevelDirectories.length} top-level directories, ${files.length} tracked/discovered files.`,
          findings,
          decisionRelevance: findings.map((finding) => `Repository structure: ${finding}`),
          constraintsDiscovered: [],
          risksDiscovered: [],
          openQuestions: [],
          sources: representativeFiles.slice(0, SEARCH_LINE_LIMIT).map((filePath) => ({
            path: filePath,
            title: filePath,
            retrievedAt,
          })),
          limitations: [
            "Repository map is limited to root files, top-level directories, and representative files.",
            "Generated and dependency directories are excluded from filesystem fallback.",
          ],
          confidence: 0.8,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          summary: "Could not map repository structure.",
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: [`repo-map failed: ${message}`],
          openQuestions: [],
          sources: [],
          limitations: ["The repository structure could not be listed."],
          confidence: 0,
        };
      }
    },
  };
}

function searchRepository(workingDirectory: string, query: string): RepoSearchResult {
  const ripgrepResult = searchWithRipgrep(workingDirectory, query);
  if (ripgrepResult) return ripgrepResult;

  const gitResult = searchWithGitFiles(workingDirectory, query);
  if (gitResult) return gitResult;

  return searchWithFilesystemWalk(workingDirectory, query);
}

function searchWithRipgrep(workingDirectory: string, query: string): RepoSearchResult | undefined {
  const ripgrep = resolveRipgrep();
  if (!ripgrep) return undefined;

  const filesResult = spawnSync(ripgrep, ["--files"], {
    cwd: workingDirectory,
    encoding: "utf-8",
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });
  const contentResult = spawnSync(ripgrep, ["-n", "-F", "-i", "--", query, "."], {
    cwd: workingDirectory,
    encoding: "utf-8",
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });

  const limitations = ["Search is limited to the first 20 repository matches."];
  if (
    contentResult.error ||
    contentResult.signal ||
    (typeof contentResult.status === "number" && contentResult.status > 1)
  ) {
    const stderr = typeof contentResult.stderr === "string" ? contentResult.stderr : "";
    const detail =
      contentResult.error?.message ??
      stderr.trim() ??
      `rg exited with status ${contentResult.status ?? "unknown"}`;
    return {
      backend: "ripgrep",
      matches: [],
      limitations: [...limitations, "ripgrep could not complete the search."],
      risks: [`repo-search failed: ${detail}`],
      confidence: 0,
    };
  }

  const fileList = typeof filesResult.stdout === "string" ? filesResult.stdout.split(/\r?\n/).filter(Boolean) : [];
  const pathMatches = findPathMatches(fileList, query);
  const contentLines = typeof contentResult.stdout === "string"
    ? contentResult.stdout.split(/\r?\n/).filter(Boolean)
    : [];
  const contentMatches = contentLines.map(matchFromRipgrepLine);

  return {
    backend: "ripgrep",
    matches: [...pathMatches, ...contentMatches].slice(0, SEARCH_LINE_LIMIT),
    limitations,
    risks: [],
    confidence: 0.75,
  };
}

function searchWithGitFiles(workingDirectory: string, query: string): RepoSearchResult | undefined {
  const files = listGitFiles(workingDirectory);
  if (!files) return undefined;
  const matches = searchFiles(workingDirectory, files, query);

  return {
    backend: "git-files",
    matches,
    limitations: [
      "Search is limited to the first 20 repository matches.",
      "ripgrep was unavailable; searched Git-tracked files with a slower fallback.",
    ],
    risks: [],
    confidence: 0.65,
  };
}

function repositoryFilesForMapping(workingDirectory: string): string[] {
  const gitFiles = listGitFiles(workingDirectory);
  return gitFiles ?? listFilesystemFiles(workingDirectory).map(normalizeRepoPath);
}

function listGitFiles(workingDirectory: string): string[] | undefined {
  const result = spawnSync("git", ["ls-files"], {
    cwd: workingDirectory,
    encoding: "utf-8",
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });

  if (result.error || result.signal || result.status !== 0) return undefined;
  return result.stdout.split(/\r?\n/).filter(Boolean).map(normalizeRepoPath);
}

function searchWithFilesystemWalk(workingDirectory: string, query: string): RepoSearchResult {
  try {
    const files = listFilesystemFiles(workingDirectory);
    const matches = searchFiles(workingDirectory, files, query);

    return {
      backend: "filesystem",
      matches,
      limitations: [
        "Search is limited to the first 20 repository matches.",
        "ripgrep and git file listing were unavailable; searched the filesystem with default excludes.",
      ],
      risks: [],
      confidence: 0.55,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      backend: "filesystem",
      matches: [],
      limitations: [
        "Search is limited to the first 20 repository matches.",
        "ripgrep, git file listing, and filesystem fallback could not complete the search.",
      ],
      risks: [`repo-search failed: ${message}`],
      confidence: 0,
    };
  }
}

function representativeRepoFiles(files: string[]): string[] {
  const preferred = [
    "package.json",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "tsconfig.json",
    "src/cli/index.ts",
    "src/orchestrator/orchestrator.ts",
    "src/types/index.ts",
  ];
  const existing = new Set(files);
  const preferredMatches = preferred.filter((filePath) => existing.has(filePath));
  const byDirectory = new Map<string, string>();
  for (const filePath of files.sort()) {
    const directory = filePath.includes("/") ? filePath.split("/")[0] : ".";
    if (!byDirectory.has(directory)) byDirectory.set(directory, filePath);
  }
  return [...new Set([...preferredMatches, ...byDirectory.values()])];
}

function rootFilePriority(filePath: string): number {
  const priority = ["package.json", "README.md", "AGENTS.md", "CLAUDE.md", "tsconfig.json"];
  const index = priority.indexOf(filePath);
  return index === -1 ? priority.length : index;
}

function resolveRipgrep(): string | undefined {
  const configured = process.env.CTO_RIPGREP_PATH?.trim();
  if (configured) return existsSync(configured) ? configured : undefined;

  const executable = process.platform === "win32" ? "rg.exe" : "rg";
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, executable);
    if (existsSync(candidate)) return candidate;
  }

  const bundled = "/Applications/Codex.app/Contents/Resources/rg";
  if (existsSync(bundled)) return bundled;

  return undefined;
}

function findPathMatches(files: string[], query: string): RepoSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return files
    .filter((filePath) => filePath.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => pathMatchScore(b, normalizedQuery) - pathMatchScore(a, normalizedQuery) || a.localeCompare(b))
    .slice(0, SEARCH_LINE_LIMIT)
    .map((filePath) => ({
      path: normalizeRepoPath(filePath),
      text: `path matched "${query}"`,
      kind: "path",
    }));
}

function searchFiles(workingDirectory: string, files: string[], query: string): RepoSearchMatch[] {
  const matches: RepoSearchMatch[] = [];
  matches.push(...findPathMatches(files, query));

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return matches.slice(0, SEARCH_LINE_LIMIT);

  for (const filePath of files) {
    if (matches.length >= SEARCH_LINE_LIMIT) break;
    const absolutePath = path.join(workingDirectory, filePath);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }
    if (!stats.isFile() || stats.size > SEARCH_FILE_SIZE_LIMIT) continue;

    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) continue;

    const lines = buffer.toString("utf-8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (matches.length >= SEARCH_LINE_LIMIT) break;
      if (!line.toLowerCase().includes(normalizedQuery)) continue;
      matches.push({
        path: normalizeRepoPath(filePath),
        line: index + 1,
        text: line,
        kind: "content",
      });
    }
  }

  return matches.slice(0, SEARCH_LINE_LIMIT);
}

function listFilesystemFiles(workingDirectory: string): string[] {
  const files: string[] = [];

  function walk(directory: string, relativeDirectory = ""): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SEARCH_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(relativePath);
    }
  }

  const rootStats = lstatSync(workingDirectory);
  if (!rootStats.isDirectory()) throw new Error(`${workingDirectory} is not a directory`);
  walk(workingDirectory);
  return files;
}

function matchFromRipgrepLine(line: string): RepoSearchMatch {
  const [filePath, lineNumber, ...rest] = line.split(":");
  return {
    path: normalizeRepoPath(filePath),
    line: Number(lineNumber) || undefined,
    text: rest.length > 0 ? rest.join(":") : line,
    kind: "content",
  };
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/^\.\//, "");
}

function formatRepoSearchMatch(match: RepoSearchMatch, query: string): string {
  if (match.kind === "path") return `${match.path}: path matched "${query}"`;
  return `${match.path}:${match.line ?? 1}:${match.text}`;
}

function sourceFromRepoSearchMatch(match: RepoSearchMatch, retrievedAt: string): ToolEvidenceSource {
  if (match.kind === "path") {
    return {
      path: match.path,
      title: match.path,
      retrievedAt,
    };
  }

  return {
    path: match.path,
    quote: match.text,
    title: `${match.path}:${match.line ?? 1}`,
    retrievedAt,
  };
}

function pathMatchScore(filePath: string, normalizedQuery: string): number {
  const normalizedPath = filePath.toLowerCase();
  const segments = normalizedPath.split(/[\\/]/);
  if (segments.some((segment) => segment === normalizedQuery || segment.startsWith(`${normalizedQuery}.`))) return 3;
  if (segments.some((segment) => segment.startsWith(normalizedQuery))) return 2;
  return normalizedPath.includes(normalizedQuery) ? 1 : 0;
}

function repoReadAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "repo-read",
    readOnly: true,
    async execute(request) {
      try {
        const rootPath = await realpath(workingDirectory);
        const requestedPath = path.resolve(workingDirectory, request.query);
        const targetPath = await realpath(requestedPath);
        const relativePath = path.relative(rootPath, targetPath);

        if (!isWithinRoot(rootPath, targetPath)) {
          return {
            summary: `Refused to read path outside repository root: ${request.query}`,
            findings: [],
            decisionRelevance: [],
            constraintsDiscovered: ["repo-read only reads paths under the working directory."],
            risksDiscovered: ["Requested path resolves outside the repository root."],
            openQuestions: [],
            sources: [],
            limitations: ["Path traversal and symlink escapes outside the repository are not allowed."],
            confidence: 0,
          };
        }

        const content = (await readFile(targetPath, "utf-8")).slice(0, TEXT_DECODER_LIMIT);
        const lines = content.split(/\r?\n/).slice(0, FINDING_LINE_LIMIT);
        const findings = lines.map((line, index) => `${relativePath}:${index + 1}:${line}`);

        return {
          summary: `Read ${relativePath || "."} from repository.`,
          findings,
          decisionRelevance: findings.slice(0, SEARCH_LINE_LIMIT),
          constraintsDiscovered: [],
          risksDiscovered: [],
          openQuestions: [],
          sources: [
            {
              path: relativePath,
              retrievedAt: new Date().toISOString(),
            },
          ],
          limitations: ["File content is limited to 6000 characters and 80 lines."],
          confidence: 0.8,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          summary: `Could not read repository path: ${request.query}`,
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: [`repo-read failed: ${message}`],
          openQuestions: [],
          sources: [],
          limitations: ["The requested file could not be read."],
          confidence: 0,
        };
      }
    },
  };
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function packageInfoAdapter(workingDirectory: string): ToolAdapter {
  return {
    toolName: "package-info",
    readOnly: true,
    execute(request) {
      const packagePath = path.join(workingDirectory, "package.json");

      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf-8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const dependencyVersion = packageJson.dependencies?.[request.query];
        const devDependencyVersion = packageJson.devDependencies?.[request.query];

        if (!dependencyVersion && !devDependencyVersion) {
          return {
            summary: `No declared package dependency matched "${request.query}".`,
            findings: [],
            decisionRelevance: [],
            constraintsDiscovered: [],
            risksDiscovered: [],
            openQuestions: [`Confirm whether "${request.query}" should be added or is transitive only.`],
            sources: [{ path: "package.json", retrievedAt: new Date().toISOString() }],
            limitations: ["Only package.json dependencies and devDependencies are checked."],
            confidence: 0.6,
          };
        }

        const dependencyType = dependencyVersion ? "dependency" : "devDependency";
        const version = dependencyVersion ?? devDependencyVersion;
        const finding = `${request.query} is declared as a ${dependencyType} at ${version}.`;

        return {
          summary: finding,
          findings: [finding],
          decisionRelevance: [finding],
          constraintsDiscovered: [`Use the declared ${request.query} version: ${version}.`],
          risksDiscovered: [],
          openQuestions: [],
          sources: [{ path: "package.json", retrievedAt: new Date().toISOString() }],
          limitations: ["Only package.json dependencies and devDependencies are checked."],
          confidence: 0.85,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
          summary: "Could not inspect package.json.",
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: [`package-info failed: ${message}`],
          openQuestions: [],
          sources: [],
          limitations: ["package.json could not be read or parsed."],
          confidence: 0,
        };
      }
    },
  };
}

function unavailableAdapter(toolName: "web-search" | "web-fetch" | "docs-fetch"): ToolAdapter {
  return {
    toolName,
    readOnly: true,
    execute(request) {
      return {
        summary: `${toolName} adapter is not configured for "${request.query}".`,
        findings: [],
        decisionRelevance: [],
        constraintsDiscovered: [],
        risksDiscovered: [`${toolName} could not run because no external adapter is configured.`],
        openQuestions: [`Configure ${toolName} before relying on this evidence.`],
        sources: [
          {
            title: `${toolName} unavailable fallback`,
            retrievedAt: new Date().toISOString(),
          },
        ],
        limitations: ["Unavailable fallback adapter; no external source was queried."],
        confidence: 0.1,
      };
    },
  };
}
