import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promisify } from "node:util";
import { HumanReviewStore, parseHumanPlanDecision } from "../control/human-review-store.js";
import { FileStore } from "../persistence/file-store.js";
import { renderUiPage } from "./page.js";
import { summarizeRun } from "./run-summary.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 43187;
const PORT_ATTEMPTS = 20;
const RUN_ID_PATTERN = /^run-[A-Za-z0-9_-]+$/;
const REVIEW_REQUEST_ID_PATTERN = /^review-[A-Za-z0-9_-]+$/;
const LIVE_POLL_MS = 750;
const BODY_LIMIT_BYTES = 64 * 1024;

const execFileAsync = promisify(execFile);

export interface UiServerOptions {
  runId?: string;
  port?: number;
  host?: string;
  openBrowser?: boolean;
}

export interface StartedUiServer {
  url: string;
  close(): Promise<void>;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<StartedUiServer> {
  const host = options.host ?? DEFAULT_HOST;
  const preferredPort = options.port ?? DEFAULT_PORT;
  const store = new FileStore();
  const humanReviewStore = new HumanReviewStore();
  const server = createServer((request, response) => {
    void handleRequest(request, response, store, humanReviewStore, options.runId);
  });

  const port = await listenOnAvailablePort(server, host, preferredPort);
  const url = buildUiUrl(port, options.runId);

  if (options.openBrowser !== false) {
    void openInBrowser(url);
  }

  return {
    url,
    close: () => closeServer(server),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: FileStore,
  humanReviewStore: HumanReviewStore,
  initialRunId?: string,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    const eventRoute = matchRunEventRoute(url.pathname);
    if (eventRoute.matched) {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed" }, { Allow: "GET" });
        return;
      }

      if (!eventRoute.runId) {
        sendJson(response, 404, { error: "Run not found" });
        return;
      }

      await streamRunEvents(request, response, store, eventRoute.runId);
      return;
    }

    const humanReviewRoute = matchHumanReviewRoute(url.pathname);
    if (humanReviewRoute.matched) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" }, { Allow: "POST" });
        return;
      }

      if (!humanReviewRoute.runId || !humanReviewRoute.requestId) {
        sendJson(response, 404, { error: "Review request not found" });
        return;
      }

      await handleHumanReviewDecision(request, response, store, humanReviewStore, humanReviewRoute.runId, humanReviewRoute.requestId);
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" }, { Allow: "GET" });
      return;
    }

    if (url.pathname === "/") {
      sendHtml(response, renderUiPage({ initialRunId }));
      return;
    }

    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/runs") {
      const runRefs = await store.listRuns();
      const runs = await Promise.all(runRefs.map((run) => store.load(run.id)));
      const summaries = runs
        .filter((run) => run !== null)
        .map((run) => summarizeRun(run))
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      sendJson(response, 200, summaries);
      return;
    }

    const runRoute = matchRunRoute(url.pathname);
    if (runRoute.matched) {
      if (!runRoute.runId) {
        sendJson(response, 404, { error: "Run not found" });
        return;
      }

      const run = await store.load(runRoute.runId);
      if (!run) {
        sendJson(response, 404, { error: "Run not found" });
        return;
      }
      sendJson(response, 200, run);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: message });
  }
}

async function streamRunEvents(
  request: IncomingMessage,
  response: ServerResponse,
  store: FileStore,
  runId: string,
): Promise<void> {
  const initial = await store.load(runId);
  if (!initial) {
    sendJson(response, 404, { error: "Run not found" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });

  let closed = false;
  let lastPayload = "";
  const sendSnapshot = async (): Promise<void> => {
    if (closed) return;
    const run = await store.load(runId);
    if (!run) return;
    const payload = JSON.stringify(run);
    if (payload === lastPayload) return;
    lastPayload = payload;
    response.write(`event: snapshot\ndata: ${payload}\n\n`);
  };

  await sendSnapshot();
  const timer = setInterval(() => {
    void sendSnapshot().catch(() => {});
  }, LIVE_POLL_MS);
  timer.unref?.();

  request.on("close", () => {
    closed = true;
    clearInterval(timer);
  });
}

async function handleHumanReviewDecision(
  request: IncomingMessage,
  response: ServerResponse,
  store: FileStore,
  humanReviewStore: HumanReviewStore,
  runId: string,
  requestId: string,
): Promise<void> {
  const run = await store.load(runId);
  if (!run || run.pendingHumanReview?.requestId !== requestId) {
    sendJson(response, 404, { error: "Review request not found" });
    return;
  }

  const body = await readJsonBody(request);
  const decision = parseHumanPlanDecision(body);
  await humanReviewStore.writeDecision(runId, requestId, decision);
  sendJson(response, 202, { ok: true });
}

type RunRouteMatch = { matched: false } | { matched: true; runId: string | null };
type RunEventRouteMatch = { matched: false } | { matched: true; runId: string | null };
type HumanReviewRouteMatch =
  | { matched: false }
  | { matched: true; runId: string | null; requestId: string | null };

function matchRunRoute(pathname: string): RunRouteMatch {
  const prefix = "/api/runs/";
  if (!pathname.startsWith(prefix)) {
    return { matched: false };
  }

  const encodedRunId = pathname.slice(prefix.length);
  if (encodedRunId.length === 0 || encodedRunId.includes("/")) {
    return { matched: true, runId: null };
  }

  let runId: string;
  try {
    runId = decodeURIComponent(encodedRunId);
  } catch {
    return { matched: true, runId: null };
  }

  return RUN_ID_PATTERN.test(runId) ? { matched: true, runId } : { matched: true, runId: null };
}

function matchRunEventRoute(pathname: string): RunEventRouteMatch {
  const prefix = "/api/runs/";
  const suffix = "/events";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return { matched: false };
  }

  const encodedRunId = pathname.slice(prefix.length, -suffix.length);
  const runId = decodeSafeSegment(encodedRunId);
  return runId && RUN_ID_PATTERN.test(runId) ? { matched: true, runId } : { matched: true, runId: null };
}

function matchHumanReviewRoute(pathname: string): HumanReviewRouteMatch {
  const prefix = "/api/runs/";
  const marker = "/human-review/";
  if (!pathname.startsWith(prefix) || !pathname.includes(marker)) {
    return { matched: false };
  }

  const rest = pathname.slice(prefix.length);
  const parts = rest.split(marker);
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[1].includes("/")) {
    return { matched: true, runId: null, requestId: null };
  }

  const runId = decodeSafeSegment(parts[0]);
  const requestId = decodeSafeSegment(parts[1]);
  const validRunId = runId && RUN_ID_PATTERN.test(runId) ? runId : null;
  const validRequestId = requestId && REVIEW_REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
  return { matched: true, runId: validRunId, requestId: validRequestId };
}

function decodeSafeSegment(value: string): string | null {
  if (!value || value.includes("/")) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("/") ? null : decoded;
  } catch {
    return null;
  }
}

async function listenOnAvailablePort(server: Server, host: string, preferredPort: number): Promise<number> {
  for (let offset = 0; offset < PORT_ATTEMPTS; offset += 1) {
    const port = preferredPort + offset;
    const result = await tryListen(server, host, port);
    if (result.ok) {
      return port;
    }

    if (!isRetryableListenError(result.error)) {
      throw result.error;
    }
  }

  throw new Error(`No available port found from ${preferredPort} to ${preferredPort + PORT_ATTEMPTS - 1}`);
}

function tryListen(
  server: Server,
  host: string,
  port: number,
): Promise<{ ok: true } | { ok: false; error: NodeJS.ErrnoException }> {
  return new Promise((resolve) => {
    const onListening = (): void => {
      cleanup();
      resolve({ ok: true });
    };

    const onError = (error: NodeJS.ErrnoException): void => {
      cleanup();
      resolve({ ok: false, error });
    };

    const cleanup = (): void => {
      server.off("listening", onListening);
      server.off("error", onError);
    };

    server.once("listening", onListening);
    server.once("error", onError);
    server.listen(port, host);
  });
}

function isRetryableListenError(error: NodeJS.ErrnoException): boolean {
  return error.code === "EADDRINUSE" || error.code === "EACCES";
}

function buildUiUrl(port: number, runId?: string): string {
  const url = new URL(`http://localhost:${port}/`);
  if (runId) {
    url.searchParams.set("run", runId);
  }
  return url.toString();
}

async function openInBrowser(url: string): Promise<void> {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      await execFileAsync("open", [url]);
      return;
    }

    if (platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url]);
      return;
    }

    await execFileAsync("xdg-open", [url]);
  } catch {
    // The printed URL is the fallback, so browser launch failures are intentionally ignored.
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });

    request.on("error", reject);
  });
}
