export interface RenderUiPageOptions {
  initialRunId?: string;
}

export function renderUiPage(options: RenderUiPageOptions = {}): string {
  const initialRunId = serializeScriptValue(options.initialRunId ?? null);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cambrian Tree Orchestrator</title>
    <style>${css()}</style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      window.__CTO_INITIAL_RUN_ID__ = ${initialRunId};
      (${clientScript()})();
    </script>
  </body>
</html>`;
}

function serializeScriptValue(value: string | null): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function css(): string {
  return `
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #eef3f8;
      --surface: rgba(255, 255, 255, 0.82);
      --surface-solid: #ffffff;
      --surface-muted: rgba(244, 247, 251, 0.88);
      --text: #111827;
      --muted: #64748b;
      --border: rgba(148, 163, 184, 0.28);
      --strong-border: rgba(100, 116, 139, 0.3);
      --accent: #007aff;
      --accent-soft: rgba(0, 122, 255, 0.1);
      --agent: #5e5ce6;
      --agent-soft: rgba(94, 92, 230, 0.1);
      --success: #15803d;
      --danger: #b91c1c;
      --warning: #b45309;
      --purple: #8b5cf6;
      --glass-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
      --hairline: rgba(255, 255, 255, 0.72);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-width: 1120px;
      background:
        linear-gradient(135deg, #f8fbff 0%, #edf3f8 44%, #f6f8fb 100%);
      color: var(--text);
    }

    button {
      font: inherit;
    }

    .app-shell {
      height: 100vh;
      display: grid;
      grid-template-rows: 52px minmax(0, 1fr);
      overflow: hidden;
      background: rgba(255, 255, 255, 0.18);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 16px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.72);
      backdrop-filter: blur(22px) saturate(1.55);
      -webkit-backdrop-filter: blur(22px) saturate(1.55);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      font-weight: 800;
      letter-spacing: 0;
    }

    .brand-mark {
      width: 34px;
      height: 24px;
      border-radius: 6px;
      background:
        linear-gradient(135deg, rgba(0, 122, 255, 0.95), rgba(94, 92, 230, 0.95));
      color: #ffffff;
      display: grid;
      place-items: center;
      font-size: 11px;
      line-height: 1;
      flex: 0 0 auto;
      box-shadow: 0 8px 18px rgba(0, 122, 255, 0.24);
    }

    .topbar-meta {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .status-pill {
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 9px;
      background: rgba(255, 255, 255, 0.66);
      color: #334155;
      font-weight: 700;
    }

    .main {
      min-height: 0;
      display: grid;
      grid-template-columns: 300px minmax(360px, 1fr) clamp(460px, 34vw, 640px);
    }

    .runs {
      min-height: 0;
      overflow: auto;
      border-right: 1px solid var(--border);
      background: var(--surface-muted);
      padding: 12px;
      backdrop-filter: blur(18px) saturate(1.35);
      -webkit-backdrop-filter: blur(18px) saturate(1.35);
    }

    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 0 10px;
      color: #334155;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .run-list {
      display: grid;
      gap: 8px;
    }

    .run {
      width: 100%;
      text-align: left;
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: rgba(255, 255, 255, 0.68);
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
      box-shadow: 0 1px 0 var(--hairline), 0 10px 28px rgba(15, 23, 42, 0.04);
      transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .run:hover {
      background: rgba(255, 255, 255, 0.9);
      border-color: rgba(0, 122, 255, 0.36);
      transform: translateY(-1px);
    }

    .run.active {
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.94);
      box-shadow:
        inset 3px 0 0 var(--accent),
        0 1px 0 var(--hairline),
        0 16px 36px rgba(0, 122, 255, 0.12);
    }

    .run-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 13px;
      font-weight: 800;
      line-height: 1.35;
    }

    .run-id {
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #64748b;
      font-size: 11px;
      line-height: 1.3;
    }

    .run-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .meta-chip {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 999px;
      padding: 3px 7px;
      background: rgba(255, 255, 255, 0.7);
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
    }

    .run-meta .meta-chip:last-child {
      flex-basis: 100%;
      width: fit-content;
    }

    .canvas {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background:
        linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px) 0 0 / 28px 28px,
        linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px) 0 0 / 28px 28px,
        linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(238, 243, 248, 0.72));
    }

    .canvas-toolbar {
      position: absolute;
      z-index: 2;
      top: 12px;
      left: 12px;
      right: 12px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      pointer-events: none;
    }

    .toolbar-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      pointer-events: auto;
    }

    .tool-button,
    .toggle-button {
      min-height: 32px;
      border: 1px solid rgba(148, 163, 184, 0.32);
      background: rgba(255, 255, 255, 0.76);
      backdrop-filter: blur(18px) saturate(1.45);
      -webkit-backdrop-filter: blur(18px) saturate(1.45);
      border-radius: 7px;
      padding: 7px 9px;
      color: #334155;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
      box-shadow: 0 1px 0 var(--hairline), 0 12px 24px rgba(15, 23, 42, 0.08);
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
    }

    .tool-button:hover,
    .toggle-button:hover {
      border-color: rgba(0, 122, 255, 0.42);
      background: rgba(255, 255, 255, 0.92);
      transform: translateY(-1px);
    }

    .toggle-button.active {
      border-color: var(--accent);
      color: #0057c2;
      background: rgba(0, 122, 255, 0.1);
      box-shadow: inset 0 0 0 1px rgba(0, 122, 255, 0.14), 0 12px 24px rgba(0, 122, 255, 0.12);
    }

    .tree-svg {
      width: 100%;
      height: 100%;
      display: block;
      cursor: grab;
      user-select: none;
    }

    .tree-svg.dragging {
      cursor: grabbing;
    }

    .edge {
      stroke: rgba(94, 92, 230, 0.42);
      stroke-width: 2;
      fill: none;
    }

    .node-card {
      cursor: pointer;
    }

    .node-rect {
      fill: rgba(255, 255, 255, 0.88);
      stroke: rgba(148, 163, 184, 0.34);
      stroke-width: 1;
      filter: drop-shadow(0 12px 22px rgba(15, 23, 42, 0.08));
    }

    .node-rect.selected {
      stroke: var(--accent);
      stroke-width: 2;
      filter: drop-shadow(0 18px 30px rgba(0, 122, 255, 0.18));
    }

    .node-label {
      fill: #0f172a;
      font-size: 13px;
      font-weight: 800;
    }

    .node-secondary {
      fill: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .score-badge {
      fill: rgba(0, 122, 255, 0.1);
      stroke: rgba(0, 122, 255, 0.22);
      stroke-width: 1;
    }

    .score-text {
      fill: #0057c2;
      font-size: 10px;
      font-weight: 900;
    }

    .node-id {
      fill: #94a3b8;
      font-size: 10px;
      font-weight: 800;
    }

    .inspector {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--border);
      background: rgba(244, 247, 251, 0.72);
      backdrop-filter: blur(18px) saturate(1.25);
      -webkit-backdrop-filter: blur(18px) saturate(1.25);
    }

    .inspector-header {
      padding: 16px 20px 14px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.72);
      backdrop-filter: blur(22px) saturate(1.45);
      -webkit-backdrop-filter: blur(22px) saturate(1.45);
    }

    .inspector-title {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #0f172a;
      font-size: 15px;
      line-height: 1.35;
    }

    .inspector-subtitle {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      overflow: visible;
      white-space: normal;
      color: #64748b;
      font-size: 12px;
      font-weight: 700;
    }

    .inspector-chip {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 999px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.62);
      color: #64748b;
      font-size: 12px;
      font-weight: 700;
    }

    .tabs {
      display: flex;
      position: sticky;
      top: 0;
      z-index: 1;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.68);
      backdrop-filter: blur(20px) saturate(1.45);
      -webkit-backdrop-filter: blur(20px) saturate(1.45);
    }

    .tab {
      flex: 1 1 0;
      min-width: 0;
      border: 0;
      background: transparent;
      padding: 12px 4px;
      color: #64748b;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
    }

    .tab.active {
      color: #0f172a;
      box-shadow: inset 0 -3px 0 var(--accent);
    }

    .tab-content {
      padding: 18px 20px 28px;
      font-size: 13px;
      line-height: 1.6;
    }

    .section {
      padding: 16px;
      margin: 0 0 14px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.78);
      box-shadow: 0 1px 0 var(--hairline), 0 14px 34px rgba(15, 23, 42, 0.05);
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section h3 {
      margin: 0 0 10px;
      color: #334155;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    details.section {
      padding: 0;
      overflow: hidden;
    }

    details.section > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      color: #334155;
      cursor: pointer;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
      list-style: none;
      text-transform: uppercase;
    }

    details.section > summary::-webkit-details-marker {
      display: none;
    }

    details.section > summary::marker {
      content: "";
    }

    details.section > summary::after {
      content: "Expand";
      flex: 0 0 auto;
      border: 1px solid #dbe3ee;
      border-radius: 999px;
      padding: 3px 8px;
      background: rgba(255, 255, 255, 0.72);
      color: #64748b;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.02em;
    }

    details.section[open] > summary::after {
      content: "Collapse";
    }

    .section-body {
      padding: 0 16px 16px;
    }

    .kv {
      display: grid;
      grid-template-columns: 118px minmax(0, 1fr);
      gap: 8px;
      margin: 6px 0;
    }

    .kv-label {
      color: #64748b;
      font-weight: 800;
    }

    .kv-value {
      min-width: 0;
      overflow-wrap: anywhere;
      color: #0f172a;
    }

    .field {
      margin: 12px 0 0;
    }

    .field:first-child {
      margin-top: 0;
    }

    .field-label {
      margin: 0 0 5px;
      color: #64748b;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .text-block,
    .message-content {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      color: #1e293b;
      font-size: 13px;
      line-height: 1.62;
    }

    .text-block {
      border-left: 3px solid rgba(148, 163, 184, 0.4);
      padding: 1px 0 1px 12px;
    }

    .summary-block {
      border-left-color: var(--accent);
      color: #0f172a;
      font-size: 13.5px;
    }

    .message,
    .alt-card {
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
      background: rgba(255, 255, 255, 0.78);
      box-shadow: 0 1px 0 var(--hairline);
    }

    .message {
      position: relative;
      overflow: hidden;
    }

    .message::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--agent);
      opacity: 0.62;
    }

    .message-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      color: #475569;
      font-size: 11px;
      font-weight: 900;
    }

    .role-pill {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-radius: 999px;
      padding: 4px 8px;
      background: var(--agent-soft);
      color: #3730a3;
      text-transform: capitalize;
    }

    .role-product-manager { background: rgba(0, 122, 255, 0.11); color: #0057c2; }
    .role-business-analyst { background: rgba(52, 199, 89, 0.13); color: #176b33; }
    .role-tech-lead { background: rgba(94, 92, 230, 0.12); color: #3730a3; }
    .role-developer { background: rgba(255, 149, 0, 0.14); color: #8a4b00; }
    .role-code-reviewer { background: rgba(255, 45, 85, 0.1); color: #9f1239; }
    .role-qa { background: rgba(90, 200, 250, 0.16); color: #075985; }

    .timestamp {
      flex: 0 0 auto;
      color: #94a3b8;
      font-weight: 800;
    }

    .alt-card {
      background: rgba(248, 250, 252, 0.78);
    }

    .alt-title {
      margin: 0 0 8px;
      color: #0f172a;
      font-size: 13px;
      line-height: 1.35;
    }

    .mini-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 12px;
    }

    .mini-metric {
      min-width: 0;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.7);
    }

    .mini-metric-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #64748b;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .mini-metric-value {
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #0f172a;
      font-size: 13px;
      font-weight: 900;
    }

    .empty {
      padding: 24px;
      color: #64748b;
      font-size: 13px;
      line-height: 1.45;
    }

    .canvas-empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 28px;
      color: #64748b;
      text-align: center;
      pointer-events: none;
    }

    .canvas-empty strong {
      display: block;
      margin-bottom: 4px;
      color: #334155;
      font-size: 14px;
    }

    .list {
      margin: 8px 0 0;
      padding-left: 20px;
    }

    .list li {
      margin: 6px 0;
      overflow-wrap: break-word;
      color: #1e293b;
      line-height: 1.55;
    }

    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: min(52vh, 520px);
      overflow: auto;
      background: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      color: #e2e8f0;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
  `;
}

function clientScript(): string {
  return String.raw`function clientScript() {
  "use strict";

  var NODE_WIDTH = 230;
  var NODE_HEIGHT = 88;
  var COLUMN_GAP = 130;
  var ROW_GAP = 34;
  var MARGIN = 60;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var PHASE_COLORS = {
    requirements: "#007aff",
    architecture: "#5e5ce6",
    implementation: "#34c759",
    validation: "#ff9500"
  };

  var state = {
    runs: [],
    run: null,
    selectedRunId: null,
    selectedNodeId: null,
    activeTab: "summary",
    showPruned: false,
    layout: null,
    viewBox: null,
    fitPending: false,
    requestToken: 0,
    loadingRuns: false,
    loadingRun: false,
    error: null,
    drag: null
  };

  var app = document.getElementById("app");
  if (!app) {
    return;
  }

  app.innerHTML = [
    '<div class="app-shell">',
      '<header class="topbar">',
        '<div class="brand"><span class="brand-mark">CTO</span><span>Cambrian Tree Orchestrator</span></div>',
        '<div class="topbar-meta"><span id="topbarStatus" class="status-pill">Loading saved runs</span><span id="topbarDetail"></span></div>',
      '</header>',
      '<main class="main">',
        '<aside class="runs">',
          '<div class="panel-heading"><span>Saved Runs</span><span id="runCount">0</span></div>',
          '<div id="runList" class="run-list"></div>',
        '</aside>',
        '<section id="canvas" class="canvas">',
          '<div class="canvas-toolbar">',
            '<div class="toolbar-group">',
              '<button id="fitButton" class="tool-button" type="button" title="Fit tree to canvas">Fit</button>',
              '<button id="zoomInButton" class="tool-button" type="button" title="Zoom in">+</button>',
              '<button id="zoomOutButton" class="tool-button" type="button" title="Zoom out">-</button>',
              '<button id="resetButton" class="tool-button" type="button" title="Reset canvas view">Reset</button>',
            '</div>',
            '<div class="toolbar-group">',
              '<button id="showPrunedButton" class="toggle-button" type="button" title="Show or hide pruned branches">Show pruned</button>',
            '</div>',
          '</div>',
          '<svg id="treeSvg" class="tree-svg" role="img" aria-label="Saved run tree"></svg>',
          '<div id="canvasEmpty" class="canvas-empty" hidden></div>',
        '</section>',
        '<aside class="inspector">',
          '<div id="inspectorHeader" class="inspector-header"></div>',
          '<div class="tabs" role="tablist" aria-label="Inspector tabs">',
            '<button class="tab active" type="button" data-tab="summary" role="tab">Summary</button>',
            '<button class="tab" type="button" data-tab="debate" role="tab">Debate</button>',
            '<button class="tab" type="button" data-tab="context" role="tab">Context</button>',
            '<button class="tab" type="button" data-tab="leaf" role="tab">Leaf</button>',
          '</div>',
          '<div id="tabContent" class="tab-content"></div>',
        '</aside>',
      '</main>',
    '</div>'
  ].join("");

  var refs = {
    topbarStatus: document.getElementById("topbarStatus"),
    topbarDetail: document.getElementById("topbarDetail"),
    runCount: document.getElementById("runCount"),
    runList: document.getElementById("runList"),
    canvas: document.getElementById("canvas"),
    svg: document.getElementById("treeSvg"),
    canvasEmpty: document.getElementById("canvasEmpty"),
    inspectorHeader: document.getElementById("inspectorHeader"),
    tabContent: document.getElementById("tabContent"),
    showPrunedButton: document.getElementById("showPrunedButton"),
    fitButton: document.getElementById("fitButton"),
    zoomInButton: document.getElementById("zoomInButton"),
    zoomOutButton: document.getElementById("zoomOutButton"),
    resetButton: document.getElementById("resetButton")
  };

  bindEvents();
  loadRuns();

  function bindEvents() {
    refs.fitButton.addEventListener("click", function () { fitCanvas(); });
    refs.zoomInButton.addEventListener("click", function () { zoomCanvas(0.8); });
    refs.zoomOutButton.addEventListener("click", function () { zoomCanvas(1.25); });
    refs.resetButton.addEventListener("click", function () { resetCanvas(); });
    refs.showPrunedButton.addEventListener("click", function () {
      state.showPruned = !state.showPruned;
      state.fitPending = true;
      if (state.selectedNodeId && state.run && !findNode(state.run.root, state.selectedNodeId, state.showPruned)) {
        state.selectedNodeId = state.run.root.id;
      }
      renderAll();
    });

    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        state.activeTab = button.getAttribute("data-tab") || "summary";
        renderInspector();
      });
    });

    refs.svg.addEventListener("pointerdown", startDrag);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("resize", function () {
      if (state.run && state.layout) {
        fitCanvas();
      }
    });
  }

  async function loadRuns() {
    state.loadingRuns = true;
    state.error = null;
    renderStatus();

    try {
      var runs = await fetchJson("/api/runs");
      state.runs = Array.isArray(runs) ? runs : [];
      state.loadingRuns = false;
      renderRunList();

      if (state.runs.length === 0) {
        state.run = null;
        state.selectedRunId = null;
        state.selectedNodeId = null;
        renderAll();
        return;
      }

      var initialRunId = window.__CTO_INITIAL_RUN_ID__ || null;
      var selected = initialRunId || state.runs[0].id;
      selectRun(selected);
    } catch (error) {
      state.loadingRuns = false;
      state.error = readableError(error);
      renderAll();
    }
  }

  async function selectRun(runId) {
    if (!runId) {
      return;
    }

    state.selectedRunId = runId;
    state.loadingRun = true;
    state.error = null;
    state.viewBox = null;
    state.fitPending = true;
    renderRunList();
    renderStatus();

    var token = ++state.requestToken;
    try {
      var run = await fetchJson("/api/runs/" + encodeURIComponent(runId));
      if (token !== state.requestToken) {
        return;
      }

      state.run = run;
      state.selectedNodeId = run && run.root ? run.root.id : null;
      state.loadingRun = false;
      renderAll();
    } catch (error) {
      if (token !== state.requestToken) {
        return;
      }

      state.run = null;
      state.selectedNodeId = null;
      state.loadingRun = false;
      state.error = readableError(error);
      renderAll();
    }
  }

  async function fetchJson(url) {
    var response = await fetch(url, { headers: { Accept: "application/json" } });
    var body = await response.json().catch(function () { return null; });

    if (!response.ok) {
      throw new Error(body && body.error ? body.error : "Request failed with status " + response.status);
    }

    return body;
  }

  function renderAll() {
    renderStatus();
    renderRunList();
    renderCanvas();
    renderInspector();
  }

  function renderStatus() {
    if (state.error) {
      setText(refs.topbarStatus, "Error");
      setText(refs.topbarDetail, state.error);
      return;
    }

    if (state.loadingRuns) {
      setText(refs.topbarStatus, "Loading saved runs");
      setText(refs.topbarDetail, "");
      return;
    }

    if (state.loadingRun) {
      setText(refs.topbarStatus, "Loading run");
      setText(refs.topbarDetail, state.selectedRunId || "");
      return;
    }

    if (!state.runs.length) {
      setText(refs.topbarStatus, "No saved runs");
      setText(refs.topbarDetail, "");
      return;
    }

    if (state.run) {
      setText(refs.topbarStatus, state.run.status || "loaded");
      setText(refs.topbarDetail, state.run.intent || state.run.id || "");
      return;
    }

    setText(refs.topbarStatus, String(state.runs.length) + " saved runs");
    setText(refs.topbarDetail, "");
  }

  function renderRunList() {
    clear(refs.runList);
    setText(refs.runCount, String(state.runs.length));

    if (state.loadingRuns) {
      refs.runList.appendChild(emptyBlock("Loading runs..."));
      return;
    }

    if (!state.runs.length) {
      refs.runList.appendChild(emptyBlock("No saved runs found."));
      return;
    }

    state.runs.forEach(function (run) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "run" + (run.id === state.selectedRunId ? " active" : "");
      button.title = run.intent || run.id;
      button.addEventListener("click", function () { selectRun(run.id); });

      var title = document.createElement("div");
      title.className = "run-title";
      title.textContent = run.intent || "Untitled run";
      button.appendChild(title);

      var id = document.createElement("div");
      id.className = "run-id";
      id.textContent = run.id;
      button.appendChild(id);

      var meta = document.createElement("div");
      meta.className = "run-meta";
      appendChip(meta, run.status || "unknown");
      appendChip(meta, String(run.leafCount || 0) + " leaves");
      if (typeof run.bestScore === "number") {
        appendChip(meta, "best " + formatScore(run.bestScore));
      }
      appendChip(meta, formatDate(run.startedAt));
      button.appendChild(meta);

      refs.runList.appendChild(button);
    });
  }

  function renderCanvas() {
    clear(refs.svg);
    updatePrunedToggle();

    if (state.error) {
      showCanvasEmpty("Unable to load run", state.error);
      return;
    }

    if (!state.runs.length && !state.loadingRuns) {
      showCanvasEmpty("No saved runs", "Start or resume a CTO run, then refresh this viewer.");
      state.layout = null;
      state.viewBox = null;
      return;
    }

    if (!state.run || !state.run.root) {
      showCanvasEmpty(state.loadingRun ? "Loading run" : "Select a run", state.loadingRun ? "Fetching the full run state." : "Choose a saved run from the left panel.");
      state.layout = null;
      return;
    }

    hideCanvasEmpty();
    state.layout = layoutTree(state.run.root, state.showPruned);

    if (state.layout.nodes.length === 0) {
      showCanvasEmpty("No visible nodes", "Enable Show pruned to view pruned branches.");
      return;
    }

    var edgeLayer = svgEl("g");
    var nodeLayer = svgEl("g");
    refs.svg.appendChild(edgeLayer);
    refs.svg.appendChild(nodeLayer);

    state.layout.edges.forEach(function (edge) {
      var path = svgEl("path");
      var midX = edge.x1 + (edge.x2 - edge.x1) / 2;
      path.setAttribute("class", "edge");
      path.setAttribute("d", "M " + edge.x1 + " " + edge.y1 + " C " + midX + " " + edge.y1 + " " + midX + " " + edge.y2 + " " + edge.x2 + " " + edge.y2);
      edgeLayer.appendChild(path);
    });

    state.layout.nodes.forEach(function (layoutNode) {
      var node = findNode(state.run.root, layoutNode.id, true);
      if (node) {
        nodeLayer.appendChild(renderSvgNode(layoutNode, node));
      }
    });

    if (!state.viewBox || state.fitPending) {
      window.requestAnimationFrame(function () { fitCanvas(); });
    } else {
      applyViewBox();
    }
  }

  function renderSvgNode(layoutNode, node) {
    var group = svgEl("g");
    group.setAttribute("class", "node-card");
    group.setAttribute("transform", "translate(" + layoutNode.x + " " + layoutNode.y + ")");
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", node.branchLabel || "root");
    group.addEventListener("click", function () {
      state.selectedNodeId = node.id;
      renderCanvas();
      renderInspector();
    });
    group.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedNodeId = node.id;
        renderCanvas();
        renderInspector();
      }
    });

    var rect = svgEl("rect");
    rect.setAttribute("class", "node-rect" + (node.id === state.selectedNodeId ? " selected" : ""));
    rect.setAttribute("width", String(NODE_WIDTH));
    rect.setAttribute("height", String(NODE_HEIGHT));
    rect.setAttribute("rx", "8");
    group.appendChild(rect);

    var strip = svgEl("rect");
    strip.setAttribute("width", "5");
    strip.setAttribute("height", String(NODE_HEIGHT));
    strip.setAttribute("rx", "4");
    strip.setAttribute("fill", phaseColor(node.phase));
    group.appendChild(strip);

    var label = svgEl("text");
    label.setAttribute("class", "node-label");
    label.setAttribute("x", "16");
    label.setAttribute("y", "24");
    label.textContent = truncate(node.branchLabel || "root", 28);
    group.appendChild(label);

    var secondary = svgEl("text");
    secondary.setAttribute("class", "node-secondary");
    secondary.setAttribute("x", "16");
    secondary.setAttribute("y", "45");
    secondary.textContent = truncate((node.phase || "phase") + " / " + (node.status || "status"), 34);
    group.appendChild(secondary);

    var description = svgEl("text");
    description.setAttribute("class", "node-id");
    description.setAttribute("x", "16");
    description.setAttribute("y", "66");
    description.textContent = truncate(node.branchDescription || node.id || "", 39);
    group.appendChild(description);

    if (node.score && typeof node.score.composite === "number") {
      var badge = svgEl("rect");
      badge.setAttribute("class", "score-badge");
      badge.setAttribute("x", String(NODE_WIDTH - 56));
      badge.setAttribute("y", "10");
      badge.setAttribute("width", "44");
      badge.setAttribute("height", "20");
      badge.setAttribute("rx", "7");
      group.appendChild(badge);

      var score = svgEl("text");
      score.setAttribute("class", "score-text");
      score.setAttribute("x", String(NODE_WIDTH - 34));
      score.setAttribute("y", "24");
      score.setAttribute("text-anchor", "middle");
      score.textContent = formatScore(node.score.composite);
      group.appendChild(score);
    }

    return group;
  }

  function renderInspector() {
    updateTabs();
    clear(refs.inspectorHeader);
    clear(refs.tabContent);

    if (state.error) {
      renderInspectorHeader("Error", state.error);
      refs.tabContent.appendChild(emptyBlock("The selected run could not be loaded."));
      return;
    }

    if (!state.run || !state.run.root) {
      renderInspectorHeader("No run selected", "Saved run details appear here.");
      refs.tabContent.appendChild(emptyBlock(state.loadingRun ? "Loading run details..." : "Select a run to inspect its tree."));
      return;
    }

    var node = findNode(state.run.root, state.selectedNodeId || state.run.root.id, state.showPruned);
    if (!node) {
      node = state.run.root;
      state.selectedNodeId = node.id;
    }

    renderInspectorHeader(node.branchLabel || "root", [
      node.phase || "phase",
      node.status || "status",
      "depth " + String(node.depth || 0),
      node.id || "node"
    ]);

    if (state.activeTab === "debate") {
      renderDebateTab(node);
    } else if (state.activeTab === "context") {
      renderContextTab(node);
    } else if (state.activeTab === "leaf") {
      renderLeafTab(node);
    } else {
      renderSummaryTab(node);
    }
  }

  function renderInspectorHeader(title, subtitle) {
    var heading = document.createElement("h2");
    heading.className = "inspector-title";
    heading.textContent = title;
    refs.inspectorHeader.appendChild(heading);

    var detail = document.createElement("div");
    detail.className = "inspector-subtitle";
    (Array.isArray(subtitle) ? subtitle : [subtitle]).forEach(function (item) {
      var chip = document.createElement("span");
      chip.className = "inspector-chip";
      chip.textContent = item;
      detail.appendChild(chip);
    });
    refs.inspectorHeader.appendChild(detail);
  }

  function renderSummaryTab(node) {
    var path = findPath(state.run.root, node.id).map(function (item) {
      return item.branchLabel || "root";
    });

    var overview = section("Summary");
    appendField(overview, "Branch", node.branchDescription || "No branch description recorded.", "summary-block");
    appendField(overview, "Debate", node.debate && node.debate.summary ? node.debate.summary : "No debate summary recorded.", "summary-block");
    appendKeyValue(overview, "Path", path.join(" / "));
    appendKeyValue(overview, "Created", formatDateTime(node.createdAt));
    appendKeyValue(overview, "Updated", formatDateTime(node.updatedAt));
    refs.tabContent.appendChild(overview);

    var ancestorSection = section("Ancestor Summaries");
    appendListOrEmpty(ancestorSection, node.context && node.context.ancestorSummaries, "No ancestor summaries recorded.");
    refs.tabContent.appendChild(ancestorSection);
  }

  function renderDebateTab(node) {
    var transcript = node.debate;
    if (!transcript || !Array.isArray(transcript.rounds) || transcript.rounds.length === 0) {
      refs.tabContent.appendChild(emptyBlock("No debate transcript recorded for this node."));
      return;
    }

    var outcome = section("Moderator Outcome");
    appendKeyValue(outcome, "Final", transcript.finalOutcome || "Not recorded");
    appendField(outcome, "Summary", transcript.summary || "No summary recorded.", "summary-block");
    appendKeyValue(outcome, "Tokens", formatNumber(transcript.tokenUsage || 0));
    refs.tabContent.appendChild(outcome);

    transcript.rounds.forEach(function (round) {
      var roundSection = collapsibleSection("Round " + String(round.roundNumber || ""), true);
      appendKeyValue(roundSection.body, "Outcome", round.outcome || "Not recorded");

      if (Array.isArray(round.messages) && round.messages.length > 0) {
        round.messages.forEach(function (message) {
          var messageCard = document.createElement("div");
          messageCard.className = "message";

          var meta = document.createElement("div");
          meta.className = "message-meta";
          var role = document.createElement("span");
          role.className = "role-pill role-" + classToken(message.role || "agent");
          role.textContent = message.role || "agent";
          meta.appendChild(role);
          var time = document.createElement("span");
          time.className = "timestamp";
          time.textContent = formatDateTime(message.timestamp);
          meta.appendChild(time);
          messageCard.appendChild(meta);

          var content = document.createElement("div");
          content.className = "message-content";
          content.textContent = message.content || "";
          messageCard.appendChild(content);

          if (message.proposedAlternative) {
            appendKeyValue(messageCard, "Alternative", message.proposedAlternative);
          }

          roundSection.body.appendChild(messageCard);
        });
      } else {
        roundSection.body.appendChild(emptyBlock("No messages recorded for this round."));
      }

      if (Array.isArray(round.alternatives) && round.alternatives.length > 0) {
        var altHeading = document.createElement("h3");
        altHeading.textContent = "Alternatives";
        roundSection.body.appendChild(altHeading);

        round.alternatives.forEach(function (alternative) {
          roundSection.body.appendChild(renderAlternative(alternative));
        });
      }

      refs.tabContent.appendChild(roundSection.details);
    });
  }

  function renderContextTab(node) {
    var context = node.context || {};

    var prd = section("PRD");
    appendTextOrEmpty(prd, context.prd, "No PRD recorded.");
    refs.tabContent.appendChild(prd);

    var acceptance = section("Acceptance Criteria");
    appendListOrEmpty(acceptance, context.acceptanceCriteria, "No acceptance criteria recorded.");
    refs.tabContent.appendChild(acceptance);

    var architecture = section("Architecture Decisions");
    appendListOrEmpty(architecture, context.architectureDecisions, "No architecture decisions recorded.");
    refs.tabContent.appendChild(architecture);

    var branch = section("Branch Decision");
    appendTextOrEmpty(branch, context.branchDecision, "No branch decision recorded.");
    refs.tabContent.appendChild(branch);

    var spec = section("Implementation Spec");
    appendTextOrEmpty(spec, context.implementationSpec, "No implementation spec recorded.");
    refs.tabContent.appendChild(spec);

    var tests = section("Test Strategy");
    appendTextOrEmpty(tests, context.testStrategy, "No test strategy recorded.");
    refs.tabContent.appendChild(tests);

    var ancestors = section("Ancestor Summaries");
    appendListOrEmpty(ancestors, context.ancestorSummaries, "No ancestor summaries recorded.");
    refs.tabContent.appendChild(ancestors);
  }

  function renderLeafTab(node) {
    if (Array.isArray(node.children) && node.children.length > 0) {
      refs.tabContent.appendChild(emptyBlock("This node is not a leaf. Select a terminal node to inspect execution and score details."));
      return;
    }

    if (!node.executionResult && !node.score) {
      refs.tabContent.appendChild(emptyBlock("This leaf does not have execution or judge output yet."));
      return;
    }

    if (node.executionResult) {
      var execution = section("Execution");
      appendKeyValue(execution, "Result", node.executionResult.success ? "Success" : "Failure");
      appendKeyValue(execution, "Thread", node.executionResult.threadId || "Not recorded");
      appendKeyValue(execution, "Duration", formatDuration(node.executionResult.durationMs));
      appendListOrEmpty(execution, node.executionResult.filesChanged, "No changed files recorded.");
      if (node.executionResult.output) {
        appendPreOrEmpty(execution, node.executionResult.output, "No execution output recorded.");
      }
      refs.tabContent.appendChild(execution);

      if (node.executionResult.testResults) {
        var testResults = section("Test Results");
        appendKeyValue(testResults, "Passed", formatNumber(node.executionResult.testResults.passed || 0));
        appendKeyValue(testResults, "Failed", formatNumber(node.executionResult.testResults.failed || 0));
        appendKeyValue(testResults, "Skipped", formatNumber(node.executionResult.testResults.skipped || 0));
        appendPreOrEmpty(testResults, node.executionResult.testResults.output, "No test output recorded.");
        refs.tabContent.appendChild(testResults);
      }

      if (node.executionResult.usage) {
        var usage = section("Codex Usage");
        appendKeyValue(usage, "Input", formatNumber(node.executionResult.usage.inputTokens || 0));
        appendKeyValue(usage, "Cached", formatNumber(node.executionResult.usage.cachedInputTokens || 0));
        appendKeyValue(usage, "Output", formatNumber(node.executionResult.usage.outputTokens || 0));
        appendKeyValue(usage, "Reasoning", formatNumber(node.executionResult.usage.reasoningOutputTokens || 0));
        refs.tabContent.appendChild(usage);
      }
    }

    if (node.score) {
      var score = section("Judge Score");
      appendKeyValue(score, "Composite", formatScore(node.score.composite));
      appendKeyValue(score, "Functional", formatScore(node.score.functionalCompleteness));
      appendKeyValue(score, "Architecture", formatScore(node.score.architecturalQuality));
      appendKeyValue(score, "Tests", formatScore(node.score.testCoverage));
      appendKeyValue(score, "Intent", formatScore(node.score.intentAlignment));
      appendKeyValue(score, "Simplicity", formatScore(node.score.simplicity));
      appendTextOrEmpty(score, node.score.rationale, "No rationale recorded.");
      refs.tabContent.appendChild(score);
    }
  }

  function layoutTree(root, showPruned) {
    var nodeMap = new Map();
    var layoutMap = new Map();
    var nextLeafY = MARGIN;

    function visibleChildren(node) {
      var children = Array.isArray(node.children) ? node.children : [];
      return children.filter(function (child) {
        return showPruned || child.status !== "pruned";
      });
    }

    function placeNode(node, fallbackDepth) {
      nodeMap.set(node.id, node);
      var children = visibleChildren(node);
      var childLayouts = children.map(function (child) {
        return placeNode(child, fallbackDepth + 1);
      });
      var y = childLayouts.length > 0
        ? (childLayouts[0].y + childLayouts[childLayouts.length - 1].y) / 2
        : nextLeafY;

      if (childLayouts.length === 0) {
        nextLeafY += NODE_HEIGHT + ROW_GAP;
      }

      var depth = typeof node.depth === "number" ? node.depth : fallbackDepth;
      var layoutNode = {
        id: node.id,
        x: MARGIN + depth * (NODE_WIDTH + COLUMN_GAP),
        y: y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      };
      layoutMap.set(node.id, layoutNode);
      return layoutNode;
    }

    if (!showPruned && root.status === "pruned") {
      return { nodes: [], edges: [], width: MARGIN, height: MARGIN };
    }

    placeNode(root, 0);

    var nodes = Array.from(layoutMap.values()).sort(function (a, b) {
      return a.x - b.x || a.y - b.y;
    });
    var edges = [];

    nodes.forEach(function (layoutNode) {
      var node = nodeMap.get(layoutNode.id);
      if (!node) {
        return;
      }

      visibleChildren(node).forEach(function (child) {
        var childLayout = layoutMap.get(child.id);
        if (!childLayout) {
          return;
        }
        edges.push({
          id: layoutNode.id + "->" + child.id,
          x1: layoutNode.x + NODE_WIDTH,
          y1: layoutNode.y + NODE_HEIGHT / 2,
          x2: childLayout.x,
          y2: childLayout.y + NODE_HEIGHT / 2
        });
      });
    });

    var width = nodes.reduce(function (max, node) {
      return Math.max(max, node.x + NODE_WIDTH);
    }, MARGIN) + MARGIN;
    var height = nodes.reduce(function (max, node) {
      return Math.max(max, node.y + NODE_HEIGHT);
    }, MARGIN) + MARGIN;

    return { nodes: nodes, edges: edges, width: width, height: height };
  }

  function fitCanvas() {
    if (!state.layout || !state.layout.nodes.length) {
      return;
    }

    var rect = refs.canvas.getBoundingClientRect();
    var canvasRatio = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1.6;
    var targetWidth = Math.max(state.layout.width + 80, 320);
    var targetHeight = Math.max(state.layout.height + 80, 220);
    var targetRatio = targetWidth / targetHeight;

    if (targetRatio > canvasRatio) {
      targetHeight = targetWidth / canvasRatio;
    } else {
      targetWidth = targetHeight * canvasRatio;
    }

    state.viewBox = {
      x: state.layout.width / 2 - targetWidth / 2,
      y: state.layout.height / 2 - targetHeight / 2,
      width: targetWidth,
      height: targetHeight
    };
    state.fitPending = false;
    applyViewBox();
  }

  function zoomCanvas(factor) {
    if (!state.viewBox) {
      fitCanvas();
    }
    if (!state.viewBox) {
      return;
    }

    var centerX = state.viewBox.x + state.viewBox.width / 2;
    var centerY = state.viewBox.y + state.viewBox.height / 2;
    state.viewBox.width = Math.max(220, state.viewBox.width * factor);
    state.viewBox.height = Math.max(160, state.viewBox.height * factor);
    state.viewBox.x = centerX - state.viewBox.width / 2;
    state.viewBox.y = centerY - state.viewBox.height / 2;
    applyViewBox();
  }

  function resetCanvas() {
    if (!state.layout) {
      return;
    }

    state.viewBox = {
      x: 0,
      y: 0,
      width: Math.max(state.layout.width, 900),
      height: Math.max(state.layout.height, 600)
    };
    state.fitPending = false;
    applyViewBox();
  }

  function applyViewBox() {
    if (!state.viewBox) {
      return;
    }

    refs.svg.setAttribute("viewBox", [
      round(state.viewBox.x),
      round(state.viewBox.y),
      round(state.viewBox.width),
      round(state.viewBox.height)
    ].join(" "));
  }

  function startDrag(event) {
    if (!state.viewBox || event.target.closest(".node-card")) {
      return;
    }

    refs.svg.classList.add("dragging");
    state.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      viewBox: {
        x: state.viewBox.x,
        y: state.viewBox.y,
        width: state.viewBox.width,
        height: state.viewBox.height
      }
    };
    refs.svg.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (!state.drag || !state.viewBox) {
      return;
    }

    var rect = refs.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    var dx = (event.clientX - state.drag.x) * state.drag.viewBox.width / rect.width;
    var dy = (event.clientY - state.drag.y) * state.drag.viewBox.height / rect.height;
    state.viewBox.x = state.drag.viewBox.x - dx;
    state.viewBox.y = state.drag.viewBox.y - dy;
    applyViewBox();
  }

  function stopDrag(event) {
    if (!state.drag) {
      return;
    }

    refs.svg.classList.remove("dragging");
    try {
      refs.svg.releasePointerCapture(state.drag.pointerId || event.pointerId);
    } catch (error) {
      // Pointer capture may already be released after tab changes or OS gestures.
    }
    state.drag = null;
  }

  function findNode(root, id, includePruned) {
    if (!root || !id) {
      return null;
    }
    if (root.id === id) {
      return root;
    }

    var children = Array.isArray(root.children) ? root.children : [];
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index];
      if (!includePruned && child.status === "pruned") {
        continue;
      }
      var match = findNode(child, id, includePruned);
      if (match) {
        return match;
      }
    }

    return null;
  }

  function findPath(root, id) {
    if (!root) {
      return [];
    }
    if (root.id === id) {
      return [root];
    }

    var children = Array.isArray(root.children) ? root.children : [];
    for (var index = 0; index < children.length; index += 1) {
      var path = findPath(children[index], id);
      if (path.length) {
        return [root].concat(path);
      }
    }

    return [];
  }

  function updateTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      var isActive = button.getAttribute("data-tab") === state.activeTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function updatePrunedToggle() {
    refs.showPrunedButton.classList.toggle("active", state.showPruned);
    refs.showPrunedButton.textContent = state.showPruned ? "Hide pruned" : "Show pruned";
  }

  function collapsibleSection(title, open) {
    var details = document.createElement("details");
    details.className = "section";
    details.open = Boolean(open);

    var summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);

    var body = document.createElement("div");
    body.className = "section-body";
    details.appendChild(body);

    return { details: details, body: body };
  }

  function renderAlternative(alternative) {
    var alt = document.createElement("div");
    alt.className = "alt-card";

    var title = document.createElement("h4");
    title.className = "alt-title";
    title.textContent = alternative.label || alternative.id || "Alternative";
    alt.appendChild(title);

    var metrics = document.createElement("div");
    metrics.className = "mini-metrics";
    appendMiniMetric(metrics, "Proposed by", alternative.proposedBy || "Unknown");
    appendMiniMetric(
      metrics,
      "Support",
      Array.isArray(alternative.supportedBy) ? alternative.supportedBy.join(", ") || "None" : "None",
    );
    appendMiniMetric(
      metrics,
      "Confidence",
      typeof alternative.confidence === "number" ? formatScore(alternative.confidence) : "n/a",
    );
    alt.appendChild(metrics);

    appendField(alt, "Description", alternative.description || "No description recorded.");
    appendField(alt, "Rationale", alternative.rationale || "No rationale recorded.");
    return alt;
  }

  function appendMiniMetric(parent, label, value) {
    var metric = document.createElement("div");
    metric.className = "mini-metric";

    var metricLabel = document.createElement("div");
    metricLabel.className = "mini-metric-label";
    metricLabel.textContent = label;
    metric.appendChild(metricLabel);

    var metricValue = document.createElement("div");
    metricValue.className = "mini-metric-value";
    metricValue.textContent = value;
    metricValue.title = value;
    metric.appendChild(metricValue);

    parent.appendChild(metric);
  }

  function appendChip(parent, text) {
    var chip = document.createElement("span");
    chip.className = "meta-chip";
    chip.textContent = text;
    parent.appendChild(chip);
  }

  function appendKeyValue(parent, label, value) {
    var row = document.createElement("div");
    row.className = "kv";

    var key = document.createElement("div");
    key.className = "kv-label";
    key.textContent = label;
    row.appendChild(key);

    var val = document.createElement("div");
    val.className = "kv-value";
    val.textContent = value === undefined || value === null || value === "" ? "Not recorded" : String(value);
    row.appendChild(val);

    parent.appendChild(row);
  }

  function appendField(parent, label, value, extraClassName) {
    var field = document.createElement("div");
    field.className = "field";

    var fieldLabel = document.createElement("div");
    fieldLabel.className = "field-label";
    fieldLabel.textContent = label;
    field.appendChild(fieldLabel);

    var body = document.createElement("div");
    body.className = "text-block" + (extraClassName ? " " + extraClassName : "");
    body.textContent = value === undefined || value === null || value === "" ? "Not recorded" : String(value);
    field.appendChild(body);

    parent.appendChild(field);
  }

  function appendTextOrEmpty(parent, value, emptyText) {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      parent.appendChild(emptyBlock(emptyText));
      return;
    }

    var body = document.createElement("div");
    body.className = "text-block";
    body.textContent = Array.isArray(value) ? value.join("\n") : String(value);
    parent.appendChild(body);
  }

  function appendPreOrEmpty(parent, value, emptyText) {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      parent.appendChild(emptyBlock(emptyText));
      return;
    }

    var pre = document.createElement("pre");
    pre.textContent = Array.isArray(value) ? value.join("\n") : String(value);
    parent.appendChild(pre);
  }

  function appendListOrEmpty(parent, values, emptyText) {
    if (!Array.isArray(values) || values.length === 0) {
      parent.appendChild(emptyBlock(emptyText));
      return;
    }

    var list = document.createElement("ul");
    list.className = "list";
    values.forEach(function (value) {
      var item = document.createElement("li");
      item.textContent = String(value);
      list.appendChild(item);
    });
    parent.appendChild(list);
  }

  function section(title) {
    var wrapper = document.createElement("section");
    wrapper.className = "section";
    var heading = document.createElement("h3");
    heading.textContent = title;
    wrapper.appendChild(heading);
    return wrapper;
  }

  function emptyBlock(text) {
    var block = document.createElement("div");
    block.className = "empty";
    block.textContent = text;
    return block;
  }

  function showCanvasEmpty(title, detail) {
    refs.canvasEmpty.hidden = false;
    refs.canvasEmpty.innerHTML = "";
    var strong = document.createElement("strong");
    strong.textContent = title;
    refs.canvasEmpty.appendChild(strong);
    var message = document.createElement("span");
    message.textContent = detail || "";
    refs.canvasEmpty.appendChild(message);
  }

  function hideCanvasEmpty() {
    refs.canvasEmpty.hidden = true;
    refs.canvasEmpty.textContent = "";
  }

  function phaseColor(phase) {
    return PHASE_COLORS[phase] || "#64748b";
  }

  function svgEl(tagName) {
    return document.createElementNS(SVG_NS, tagName);
  }

  function clear(element) {
    element.replaceChildren();
  }

  function setText(element, text) {
    element.textContent = text;
  }

  function truncate(value, length) {
    var text = value === undefined || value === null ? "" : String(value);
    if (text.length <= length) {
      return text;
    }
    return text.slice(0, Math.max(0, length - 3)) + "...";
  }

  function classToken(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function readableError(error) {
    return error && error.message ? error.message : String(error);
  }

  function formatDate(value) {
    if (!value) {
      return "no date";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) {
      return "Not recorded";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDuration(value) {
    if (typeof value !== "number") {
      return "Not recorded";
    }
    if (value < 1000) {
      return String(value) + " ms";
    }
    return (value / 1000).toFixed(1) + " s";
  }

  function formatScore(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "n/a";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function formatNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "0";
    }
    return new Intl.NumberFormat().format(value);
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }
}`;
}
