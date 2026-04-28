# Saved Run UI Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `cto ui`, a local browser-based saved-run explorer for `.codex-tree` run state.

**Architecture:** Add a small Node HTTP server that serves JSON APIs and a dependency-free browser UI. Keep tree layout, run summaries, and inspector view-model logic in pure TypeScript modules so they are testable without a browser. Wire the server into Commander as `cto ui [run-id]`.

**Tech Stack:** TypeScript ESM with NodeNext modules, Node built-ins (`node:http`, `node:child_process`, `node:events`), existing `FileStore`, Commander, chalk, vitest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/ui/tree-layout.ts` | Create | Flatten `TreeNode` trees and compute SVG node/edge positions |
| `src/ui/run-summary.ts` | Create | Produce saved-run summary rows with leaf count and best score |
| `src/ui/inspector.ts` | Create | Convert a selected `TreeNode` into tab-friendly inspector sections |
| `src/ui/page.ts` | Create | Return the HTML/CSS/browser-script shell for the Explorer Canvas |
| `src/ui/server.ts` | Create | Local HTTP server, JSON routes, port probing, optional browser opening |
| `src/cli/index.ts` | Modify | Add `cto ui [run-id]` command |
| `tests/ui/tree-layout.test.ts` | Create | Unit tests for flattening and layout |
| `tests/ui/run-summary.test.ts` | Create | Unit tests for run summaries |
| `tests/ui/inspector.test.ts` | Create | Unit tests for inspector sections |

---

## Task 1: Pure Tree Layout Helpers

**Files:**
- Create: `src/ui/tree-layout.ts`
- Test: `tests/ui/tree-layout.test.ts`

- [ ] **Step 1: Write failing layout tests**

Create `tests/ui/tree-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src/types/index.js";
import { layoutTree } from "../../src/ui/tree-layout.js";

function node(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: overrides.id ?? "node-root",
    parentId: overrides.parentId ?? null,
    depth: overrides.depth ?? 0,
    phase: overrides.phase ?? "requirements",
    status: overrides.status ?? "pending",
    context: overrides.context ?? {
      originalIntent: "Build a test app",
      ancestorSummaries: [],
    },
    children: overrides.children ?? [],
    branchLabel: overrides.branchLabel ?? "",
    branchDescription: overrides.branchDescription ?? "",
    createdAt: overrides.createdAt ?? "2026-04-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T00:00:00.000Z",
    debate: overrides.debate,
    executionResult: overrides.executionResult,
    score: overrides.score,
  };
}

describe("layoutTree", () => {
  it("lays out a consensus chain left to right", () => {
    const grandchild = node({ id: "node-c", parentId: "node-b", depth: 2, branchLabel: "leaf" });
    const child = node({ id: "node-b", parentId: "node-a", depth: 1, branchLabel: "consensus", children: [grandchild] });
    const root = node({ id: "node-a", children: [child] });

    const layout = layoutTree(root, { showPruned: true });

    expect(layout.nodes.map((n) => n.id)).toEqual(["node-a", "node-b", "node-c"]);
    expect(layout.edges).toEqual([
      { id: "node-a->node-b", fromId: "node-a", toId: "node-b", x1: 260, y1: 96, x2: 380, y2: 96 },
      { id: "node-b->node-c", fromId: "node-b", toId: "node-c", x1: 580, y1: 96, x2: 700, y2: 96 },
    ]);
    expect(layout.width).toBe(960);
    expect(layout.height).toBe(192);
  });

  it("stacks branching leaves and centers the parent", () => {
    const left = node({ id: "node-left", parentId: "node-root", depth: 1, branchLabel: "REST" });
    const right = node({ id: "node-right", parentId: "node-root", depth: 1, branchLabel: "GraphQL" });
    const root = node({ id: "node-root", children: [left, right] });

    const layout = layoutTree(root, { showPruned: true });

    expect(layout.nodes.find((n) => n.id === "node-root")?.y).toBe(110);
    expect(layout.nodes.find((n) => n.id === "node-left")?.y).toBe(60);
    expect(layout.nodes.find((n) => n.id === "node-right")?.y).toBe(160);
  });

  it("hides pruned nodes when requested", () => {
    const kept = node({ id: "node-kept", parentId: "node-root", depth: 1, branchLabel: "Kept" });
    const pruned = node({ id: "node-pruned", parentId: "node-root", depth: 1, status: "pruned", branchLabel: "Pruned" });
    const root = node({ id: "node-root", children: [kept, pruned] });

    const layout = layoutTree(root, { showPruned: false });

    expect(layout.nodes.map((n) => n.id)).toEqual(["node-root", "node-kept"]);
    expect(layout.edges.map((e) => e.id)).toEqual(["node-root->node-kept"]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
npm test -- tests/ui/tree-layout.test.ts
```

Expected: failure because `src/ui/tree-layout.ts` does not exist.

- [ ] **Step 3: Implement tree layout**

Create `src/ui/tree-layout.ts`:

```ts
import type { TreeNode } from "../types/index.js";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;
const COLUMN_GAP = 120;
const ROW_GAP = 28;
const MARGIN = 60;

export interface TreeLayoutOptions {
  showPruned: boolean;
}

export interface LayoutNode {
  id: string;
  parentId: string | null;
  label: string;
  description: string;
  phase: TreeNode["phase"];
  status: TreeNode["status"];
  depth: number;
  score?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

interface PositionedNode {
  node: TreeNode;
  x: number;
  y: number;
}

export function layoutTree(root: TreeNode, options: TreeLayoutOptions): TreeLayout {
  const visibleRoot = filterPruned(root, options.showPruned);
  const positioned = new Map<string, PositionedNode>();
  let nextLeafRow = 0;

  function place(node: TreeNode): number {
    const childRows = node.children.map(place);
    const row = childRows.length === 0
      ? nextLeafRow++
      : childRows.reduce((sum, childRow) => sum + childRow, 0) / childRows.length;

    positioned.set(node.id, {
      node,
      x: MARGIN + node.depth * (NODE_WIDTH + COLUMN_GAP),
      y: MARGIN + row * (NODE_HEIGHT + ROW_GAP),
    });
    return row;
  }

  place(visibleRoot);

  const nodes = Array.from(positioned.values())
    .sort((a, b) => a.node.depth - b.node.depth || a.y - b.y)
    .map(({ node, x, y }) => ({
      id: node.id,
      parentId: node.parentId,
      label: node.branchLabel || "root",
      description: node.branchDescription,
      phase: node.phase,
      status: node.status,
      depth: node.depth,
      score: node.score?.composite,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));

  const edges: LayoutEdge[] = [];
  for (const layoutNode of nodes) {
    if (!layoutNode.parentId) continue;
    const parent = positioned.get(layoutNode.parentId);
    if (!parent) continue;
    edges.push({
      id: `${layoutNode.parentId}->${layoutNode.id}`,
      fromId: layoutNode.parentId,
      toId: layoutNode.id,
      x1: parent.x + NODE_WIDTH,
      y1: parent.y + NODE_HEIGHT / 2,
      x2: layoutNode.x,
      y2: layoutNode.y + NODE_HEIGHT / 2,
    });
  }

  const maxX = Math.max(...nodes.map((node) => node.x + node.width), MARGIN + NODE_WIDTH);
  const maxY = Math.max(...nodes.map((node) => node.y + node.height), MARGIN + NODE_HEIGHT);
  return { nodes, edges, width: maxX + MARGIN, height: maxY + MARGIN };
}

function filterPruned(node: TreeNode, showPruned: boolean): TreeNode {
  return {
    ...node,
    children: node.children
      .filter((child) => showPruned || child.status !== "pruned")
      .map((child) => filterPruned(child, showPruned)),
  };
}
```

- [ ] **Step 4: Run the layout tests**

Run:

```bash
npm test -- tests/ui/tree-layout.test.ts
```

Expected: all tests in `tree-layout.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/tree-layout.ts tests/ui/tree-layout.test.ts
git commit -m "feat: add tree layout helpers"
```

---

## Task 2: Run Summary and Inspector View Models

**Files:**
- Create: `src/ui/run-summary.ts`
- Create: `src/ui/inspector.ts`
- Test: `tests/ui/run-summary.test.ts`
- Test: `tests/ui/inspector.test.ts`

- [ ] **Step 1: Write failing run summary tests**

Create `tests/ui/run-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { JudgeScore, RunState, TreeNode } from "../../src/types/index.js";
import { summarizeRun } from "../../src/ui/run-summary.js";

const score: JudgeScore = {
  functionalCompleteness: 9,
  architecturalQuality: 8,
  testCoverage: 7,
  intentAlignment: 9,
  simplicity: 8,
  composite: 8.4,
  rationale: "Strong match.",
};

function node(id: string, children: TreeNode[] = [], nodeScore?: JudgeScore): TreeNode {
  return {
    id,
    parentId: null,
    depth: 0,
    phase: "requirements",
    status: nodeScore ? "scored" : "completed",
    context: { originalIntent: "Build a todo API with auth", ancestorSummaries: [] },
    children,
    branchLabel: "",
    branchDescription: "",
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
    score: nodeScore,
  };
}

describe("summarizeRun", () => {
  it("returns leaf count and best score", () => {
    const run: RunState = {
      id: "run-abc",
      config: {
        maxDepth: 2,
        maxBranching: 2,
        maxDebateRounds: 1,
        reasoningModel: "gpt-4o",
        judgeModel: "gpt-4o",
        workingDirectory: "/tmp/project",
        phaseDepths: {
          requirements: [0, 1],
          architecture: [2, 3],
          implementation: [4, 5],
          validation: [6, 7],
        },
        dryRun: false,
        leafConcurrency: 4,
        pruneThreshold: 0,
      },
      intent: "Build a todo API with auth and tests",
      root: node("node-root", [node("node-a", [], score), node("node-b")]),
      leafNodeIds: ["node-a", "node-b"],
      startedAt: "2026-04-28T00:00:00.000Z",
      completedAt: "2026-04-28T00:10:00.000Z",
      totalTokensUsed: 1234,
      status: "completed",
    };

    expect(summarizeRun(run)).toEqual({
      id: "run-abc",
      intent: "Build a todo API with auth and tests",
      status: "completed",
      startedAt: "2026-04-28T00:00:00.000Z",
      completedAt: "2026-04-28T00:10:00.000Z",
      leafCount: 2,
      bestScore: 8.4,
    });
  });
});
```

- [ ] **Step 2: Write failing inspector tests**

Create `tests/ui/inspector.test.ts` with a scored node fixture and assertions that `buildInspector(node)` exposes header, summary, debate rounds, context fields, files changed, and score composite.

Use this key assertion block:

```ts
expect(inspector.header).toEqual({
  id: "node-a",
  label: "REST API",
  phase: "requirements",
  status: "scored",
  depth: 0,
});
expect(inspector.summary.branchDescription).toBe("Resource-oriented API");
expect(inspector.debate.rounds[0]?.messages[0]?.role).toBe("developer");
expect(inspector.context.acceptanceCriteria).toEqual(["Returns 200 for GET /todos"]);
expect(inspector.leaf?.filesChanged).toEqual(["src/server.ts"]);
expect(inspector.leaf?.score?.composite).toBe(8.4);
```

- [ ] **Step 3: Run the tests and verify they fail**

Run:

```bash
npm test -- tests/ui/run-summary.test.ts tests/ui/inspector.test.ts
```

Expected: failure because `run-summary.ts` and `inspector.ts` do not exist.

- [ ] **Step 4: Implement run summary and inspector modules**

Create `src/ui/run-summary.ts` and `src/ui/inspector.ts` with exported `summarizeRun(run)` and `buildInspector(node)` functions. `summarizeRun` must count leaves from `run.root` and compute `bestScore` from leaf `score.composite` values. `buildInspector` must preserve the selected node's header, branch summary, debate transcript, context, execution result, changed files, and score.

The `buildInspector` return type must include:

```ts
export interface InspectorViewModel {
  header: {
    id: string;
    label: string;
    phase: TreeNode["phase"];
    status: TreeNode["status"];
    depth: number;
  };
  summary: {
    branchDescription: string;
    debateSummary?: string;
    ancestorPath: string[];
    createdAt: string;
    updatedAt: string;
  };
  debate: {
    rounds: DebateRound[];
    finalOutcome?: "consensus" | "branched";
    tokenUsage?: number;
  };
  context: NodeContext;
  leaf?: {
    executionResult: TreeNode["executionResult"];
    score: TreeNode["score"];
    filesChanged: string[];
  };
}
```

- [ ] **Step 5: Run the view-model tests**

Run:

```bash
npm test -- tests/ui/run-summary.test.ts tests/ui/inspector.test.ts
```

Expected: all tests in both files pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/run-summary.ts src/ui/inspector.ts tests/ui/run-summary.test.ts tests/ui/inspector.test.ts
git commit -m "feat: add ui run view models"
```

---

## Task 3: Local UI Server and Page Stub

**Files:**
- Create: `src/ui/server.ts`
- Create: `src/ui/page.ts`

- [ ] **Step 1: Implement the page stub**

Create `src/ui/page.ts`:

```ts
export interface RenderUiPageOptions {
  initialRunId?: string;
}

export function renderUiPage(options: RenderUiPageOptions): string {
  const initialRunId = JSON.stringify(options.initialRunId ?? null);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Tree Orchestrator</title>
</head>
<body>
  <main id="app">Loading CTO UI...</main>
  <script>window.__CTO_INITIAL_RUN_ID__ = ${initialRunId};</script>
</body>
</html>`;
}
```

- [ ] **Step 2: Implement server module**

Create `src/ui/server.ts` with:

```ts
import chalk from "chalk";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { FileStore } from "../persistence/file-store.js";
import type { RunState } from "../types/index.js";
import { renderUiPage } from "./page.js";
import { summarizeRun } from "./run-summary.js";

export interface UiServerOptions {
  runId?: string;
  port?: number;
  host?: string;
  openBrowser?: boolean;
}

export interface StartedUiServer {
  url: string;
  close: () => Promise<void>;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<StartedUiServer> {
  const host = options.host ?? "127.0.0.1";
  const preferredPort = options.port ?? 43187;
  const store = new FileStore();
  const server = createServer((req, res) => {
    void handleRequest(req, res, store, options.runId);
  });

  const port = await listenOnAvailablePort(server, host, preferredPort);
  const url = `http://localhost:${port}${options.runId ? `/?run=${encodeURIComponent(options.runId)}` : ""}`;

  if (options.openBrowser !== false) openUrl(url);
  console.log(chalk.green(`CTO UI running at ${url}`));

  return {
    url,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, store: FileStore, initialRunId?: string): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    if (url.pathname === "/") return sendHtml(res, renderUiPage({ initialRunId }));
    if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
    if (url.pathname === "/api/runs") {
      const runs = await loadAllRuns(store);
      return sendJson(res, 200, runs.map(summarizeRun).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
    }

    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch) {
      const run = await store.load(decodeURIComponent(runMatch[1]));
      return run ? sendJson(res, 200, run) : sendJson(res, 404, { error: "Run not found" });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function loadAllRuns(store: FileStore): Promise<RunState[]> {
  const summaries = await store.listRuns();
  const runs = await Promise.all(summaries.map((summary) => store.load(summary.id)));
  return runs.filter((run): run is RunState => Boolean(run));
}

function sendHtml(res: ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function listenOnAvailablePort(server: ReturnType<typeof createServer>, host: string, preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    const listening = await tryListen(server, host, port);
    if (listening) return port;
  }
  throw new Error(`No available port found starting at ${preferredPort}`);
}

async function tryListen(server: ReturnType<typeof createServer>, host: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };
    const onListening = () => {
      cleanup();
      resolve(true);
    };
    const onError = (error: NodeJS.ErrnoException) => {
      cleanup();
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
    server.listen(port, host);
  });
}

function openUrl(url: string): void {
  try {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // The printed URL is the fallback when a browser cannot be opened.
  }
}
```

- [ ] **Step 3: Typecheck server**

Run:

```bash
npm run typecheck
```

Expected: TypeScript succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/server.ts src/ui/page.ts
git commit -m "feat: add local ui server"
```

---

## Task 4: Browser UI Shell

**Files:**
- Modify: `src/ui/page.ts`

- [ ] **Step 1: Replace the page stub with the Explorer Canvas shell**

Replace `src/ui/page.ts` with a full HTML shell generated from TypeScript. Keep browser code inside the returned HTML string. The page must fetch `/api/runs`, select `window.__CTO_INITIAL_RUN_ID__` when present, fetch `/api/runs/:runId`, render the run list, render SVG tree nodes and edges, support Fit/+/−/Reset controls, and switch Summary/Debate/Context/Leaf inspector tabs.

Required exported API:

```ts
export interface RenderUiPageOptions {
  initialRunId?: string;
}

export function renderUiPage(options: RenderUiPageOptions): string {
  const initialRunId = JSON.stringify(options.initialRunId ?? null);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Tree Orchestrator</title>
  <style>${css()}</style>
</head>
<body>
  <div id="app"></div>
  <script>
    window.__CTO_INITIAL_RUN_ID__ = ${initialRunId};
    ${clientScript()}
  </script>
</body>
</html>`;
}
```

Use CSS classes matching the approved visual structure:

```ts
function css(): string {
  return `
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fafc; color: #0f172a; }
    button { font: inherit; }
    .app-shell { height: 100vh; display: grid; grid-template-rows: 52px 1fr; }
    .topbar { display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
    .brand { font-weight: 800; }
    .main { min-height: 0; display: grid; grid-template-columns: 260px minmax(420px, 1fr) 360px; }
    .runs { overflow: auto; border-right: 1px solid #e2e8f0; background: #f1f5f9; padding: 12px; }
    .run { width: 100%; text-align: left; border: 1px solid #dbe3ee; background: #ffffff; border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
    .run.active { border-color: #0891b2; box-shadow: inset 3px 0 0 #0891b2; }
    .canvas { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: linear-gradient(#e2e8f0 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, #e2e8f0 1px, transparent 1px) 0 0 / 28px 28px, #f8fafc; }
    .canvas-toolbar { position: absolute; z-index: 2; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; pointer-events: none; }
    .toolbar-group { display: flex; gap: 8px; pointer-events: auto; }
    .tool-button { border: 1px solid #cbd5e1; background: rgba(255,255,255,0.94); border-radius: 7px; padding: 7px 9px; cursor: pointer; }
    .tree-svg { width: 100%; height: 100%; display: block; cursor: grab; }
    .node-card { cursor: pointer; }
    .edge { stroke: #94a3b8; stroke-width: 2; fill: none; }
    .inspector { min-width: 0; overflow: auto; border-left: 1px solid #e2e8f0; background: #ffffff; }
    .tabs { display: flex; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; background: #ffffff; }
    .tab { flex: 1; border: 0; background: #ffffff; padding: 11px 4px; color: #64748b; cursor: pointer; font-weight: 800; }
    .tab.active { color: #0f172a; box-shadow: inset 0 -3px 0 #0891b2; }
    .tab-content { padding: 14px 16px 24px; font-size: 13px; line-height: 1.45; }
    .empty { padding: 28px; color: #64748b; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  `;
}
```

- [ ] **Step 2: Typecheck the page module**

Run:

```bash
npm run typecheck
```

Expected: TypeScript succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/page.ts
git commit -m "feat: add saved run browser ui"
```

---

## Task 5: CLI Wiring

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Import `startUiServer`**

Add near the other imports in `src/cli/index.ts`:

```ts
import { startUiServer } from "../ui/server.js";
```

- [ ] **Step 2: Add the `ui` command**

Add after the `tree` command and before `resume`:

```ts
// ─── UI ─────────────────────────────────────────────────────────────────────

program
  .command("ui")
  .description("Launch the saved-run browser UI")
  .argument("[run-id]", "Run ID to open")
  .option("-p, --port <n>", "Preferred local port", "43187")
  .option("--no-open", "Print the URL without opening a browser")
  .action(async (runId: string | undefined, opts) => {
    const server = await startUiServer({
      runId,
      port: parseInt(opts.port, 10),
      openBrowser: Boolean(opts.open),
    });

    console.log(chalk.dim("Press Ctrl+C to stop the UI server."));

    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };

    process.once("SIGINT", () => {
      void shutdown();
    });
  });
```

- [ ] **Step 3: Typecheck CLI wiring**

Run:

```bash
npm run typecheck
```

Expected: TypeScript succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add cto ui command"
```

---

## Task 6: Verification and Polish

**Files:**
- Modify only files touched by previous tasks if verification exposes compile or UX issues.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: TypeScript succeeds.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` emits `dist/` with no compile errors.

- [ ] **Step 4: Start the UI without opening a browser**

Run:

```bash
npx tsx src/cli/index.ts ui --no-open
```

Expected: terminal prints `CTO UI running at http://localhost:<port>` and stays alive.

- [ ] **Step 5: Verify API routes**

In a second terminal while the server is running:

```bash
curl http://localhost:43187/api/health
curl http://localhost:43187/api/runs
```

Expected health response:

```json
{"ok":true}
```

Expected runs response: a JSON array. If `.codex-tree` has no runs, the response is `[]`.

- [ ] **Step 6: Browser smoke test**

Open the printed URL in a browser. Verify:

- The shell loads.
- Empty state appears if there are no saved runs.
- If saved runs exist, the left run list is populated.
- Selecting a run renders a tree.
- Clicking a node updates the inspector.
- Summary, Debate, Context, and Leaf tabs switch without errors.
- Fit, zoom in, zoom out, and reset controls affect the SVG viewport.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional source/test changes remain, or a clean worktree after the final commit.

- [ ] **Step 8: Commit verification fixes**

If verification fixes were needed:

```bash
git add src/ui src/cli/index.ts tests/ui
git commit -m "fix: polish saved run ui"
```

---

## Self-Review

- Spec coverage: `cto ui`, run picker, tree canvas, node inspector tabs, local server, JSON routes, error states, and verification are covered by Tasks 1-6.
- Scope: The plan builds the saved-run viewer only. It leaves WebSockets, hosted mode, editing, Cloud result application, and leaf comparison as future work.
- Type consistency: `TreeNode`, `RunState`, `JudgeScore`, `DebateRound`, and `NodeContext` names match `src/types/index.ts`; source imports use `.js` extensions for NodeNext.
- Test coverage: Pure logic gets vitest coverage. Browser behavior is covered by manual smoke testing because the repo has no browser test harness yet.
