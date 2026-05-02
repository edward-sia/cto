import { readFileSync } from "node:fs";
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

export function defaultToolAdapters(workingDirectory: string): ToolAdapter[] {
  return [
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
      const result = spawnSync("rg", ["-n", "-F", "--", request.query], {
        cwd: workingDirectory,
        encoding: "utf-8",
        timeout: 10_000,
        maxBuffer: 512 * 1024,
      });

      const stdout = typeof result.stdout === "string" ? result.stdout : "";
      const stderr = typeof result.stderr === "string" ? result.stderr : "";
      const lines = stdout.split(/\r?\n/).filter(Boolean).slice(0, SEARCH_LINE_LIMIT);
      const limitations = ["Search is limited to the first 20 ripgrep matches."];

      if (result.error || result.signal || (typeof result.status === "number" && result.status > 1)) {
        const detail = result.error?.message ?? stderr.trim() ?? `rg exited with status ${result.status ?? "unknown"}`;
        return {
          summary: `Repository search failed for "${request.query}".`,
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: [`repo-search failed: ${detail}`],
          openQuestions: [],
          sources: [],
          limitations: [...limitations, "ripgrep could not complete the search."],
          confidence: 0,
        };
      }

      if (result.status === 1) {
        return {
          summary: `No repository matches found for "${request.query}".`,
          findings: [],
          decisionRelevance: [],
          constraintsDiscovered: [],
          risksDiscovered: [],
          openQuestions: [`No local code references matched "${request.query}".`],
          sources: [],
          limitations,
          confidence: 0.4,
        };
      }

      return {
        summary: `Found ${lines.length} repository matches for "${request.query}".`,
        findings: lines,
        decisionRelevance: lines.map((line) => `Local match: ${line}`),
        constraintsDiscovered: [],
        risksDiscovered: [],
        openQuestions: [],
        sources: lines.map((line) => sourceFromRipgrepLine(line, completed)),
        limitations,
        confidence: 0.75,
      };
    },
  };
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

function sourceFromRipgrepLine(line: string, retrievedAt: string): ToolEvidenceSource {
  const [filePath, lineNumber, ...rest] = line.split(":");
  return {
    path: filePath,
    quote: rest.length > 0 ? rest.join(":") : line,
    title: lineNumber ? `${filePath}:${lineNumber}` : filePath,
    retrievedAt,
  };
}
