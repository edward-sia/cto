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
      color-scheme: dark;
      --bg: #05070d;
      --bg-elevated: #070b13;
      --canvas: #09111d;
      --panel: rgba(10, 17, 28, 0.88);
      --panel-solid: #0a111c;
      --panel-raised: #111a29;
      --panel-muted: #0e1624;
      --line: rgba(119, 149, 190, 0.16);
      --line-strong: rgba(132, 168, 214, 0.28);
      --text: #e7f4ff;
      --text-strong: #ffffff;
      --muted: #7f8fa8;
      --muted-2: #536279;
      --signal: #00f5d4;
      --signal-rgb: 0, 245, 212;
      --signal-soft: rgba(0, 245, 212, 0.12);
      --blue: #49a9ff;
      --branch: #a970ff;
      --branch-soft: rgba(169, 112, 255, 0.16);
      --human: #ff8bd1;
      --human-soft: rgba(255, 139, 209, 0.14);
      --success: #00d7a7;
      --success-soft: rgba(0, 215, 167, 0.13);
      --paused: #f2c94c;
      --paused-soft: rgba(242, 201, 76, 0.14);
      --failed: #ff4d73;
      --failed-soft: rgba(255, 77, 115, 0.14);
      --score: #4c8dff;
      --agent: #a970ff;
      --agent-soft: rgba(169, 112, 255, 0.14);
      --radius-xs: 4px;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --shadow-glow: 0 0 22px rgba(var(--signal-rgb), 0.24);
      --shadow-panel: 0 18px 50px rgba(0, 0, 0, 0.34);
      --font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-width: 320px;
      background:
        radial-gradient(circle at 24% 18%, rgba(0, 245, 212, 0.1), transparent 28rem),
        radial-gradient(circle at 88% 12%, rgba(169, 112, 255, 0.13), transparent 24rem),
        linear-gradient(180deg, #060913 0%, var(--bg) 42%, #03050a 100%);
      color: var(--text);
      font-family: var(--font-ui);
      letter-spacing: 0;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(rgba(83, 98, 121, 0.09) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(90deg, rgba(83, 98, 121, 0.09) 1px, transparent 1px) 0 0 / 32px 32px;
      mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.68), transparent 82%);
    }

    button {
      border: 0;
      font: inherit;
    }

    .app-shell {
      height: 100vh;
      display: grid;
      grid-template-rows: 58px minmax(0, 1fr);
      overflow: hidden;
    }

    .topbar {
      display: grid;
      grid-template-columns: minmax(270px, 1fr) minmax(0, 1.25fr);
      align-items: center;
      gap: 24px;
      padding: 0 24px;
      border-bottom: 1px solid var(--line);
      background: rgba(5, 7, 13, 0.84);
      backdrop-filter: blur(22px) saturate(1.3);
      -webkit-backdrop-filter: blur(22px) saturate(1.3);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      color: var(--text-strong);
    }

    .brand-copy {
      display: grid;
      gap: 1px;
      min-width: 0;
    }

    .brand-copy strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      line-height: 1.2;
    }

    .brand-copy span {
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .brand-mark {
      width: 34px;
      height: 28px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-md);
      background:
        linear-gradient(135deg, rgba(0, 245, 212, 0.95), rgba(73, 169, 255, 0.88));
      color: #062022;
      display: grid;
      place-items: center;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      line-height: 1;
      flex: 0 0 auto;
      box-shadow: var(--shadow-glow);
    }

    .topbar-meta {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 850;
    }

    .topbar-detail {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #cbd8eb;
    }

    .status-pill,
    .meta-chip,
    .score-chip,
    .inspector-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 22px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0 8px;
      background: rgba(255, 255, 255, 0.035);
      color: #93a2bb;
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 950;
      line-height: 1;
      text-transform: uppercase;
    }

    .status-pill::before,
    .meta-chip.status-chip::before,
    .inspector-chip.status-chip::before {
      content: "";
      display: inline-block;
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
    }

    .status-completed,
    .status-scored,
    .status-consensus {
      border-color: rgba(0, 215, 167, 0.3);
      background: var(--success-soft);
      color: var(--success);
    }

    .status-running,
    .status-debating,
    .status-executing,
    .status-branched {
      border-color: rgba(0, 245, 212, 0.34);
      background: var(--signal-soft);
      color: var(--signal);
    }

    .status-paused,
    .status-pending {
      border-color: rgba(242, 201, 76, 0.34);
      background: var(--paused-soft);
      color: var(--paused);
    }

    .status-failed,
    .status-pruned,
    .status-error {
      border-color: rgba(255, 77, 115, 0.34);
      background: var(--failed-soft);
      color: var(--failed);
    }

    .main {
      min-height: 0;
      display: grid;
      grid-template-columns: 300px minmax(420px, 1fr) clamp(420px, 34vw, 620px);
    }

    .runs {
      min-height: 0;
      overflow: auto;
      border-right: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(7, 15, 25, 0.96), rgba(3, 6, 10, 0.98));
      padding: 12px;
    }

    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 0 10px;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .run-list {
      display: grid;
      gap: 8px;
    }

    .run {
      position: relative;
      width: 100%;
      text-align: left;
      border: 1px solid rgba(119, 149, 190, 0.14);
      background: rgba(14, 22, 36, 0.74);
      border-radius: var(--radius-md);
      padding: 11px;
      color: inherit;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .run:hover {
      background: rgba(17, 28, 45, 0.9);
      border-color: rgba(var(--signal-rgb), 0.34);
      transform: translateY(-1px);
    }

    .run.active {
      border-color: rgba(var(--signal-rgb), 0.68);
      background:
        linear-gradient(90deg, rgba(var(--signal-rgb), 0.13), transparent 60%),
        rgba(12, 22, 35, 0.92);
      box-shadow:
        inset 3px 0 0 var(--signal),
        0 0 22px rgba(var(--signal-rgb), 0.12);
    }

    .run-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 12px;
      font-weight: 850;
      line-height: 1.3;
    }

    .run-id {
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted-2);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 800;
      line-height: 1.35;
    }

    .run-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .score-chip {
      border-color: rgba(var(--signal-rgb), 0.22);
      background: rgba(var(--signal-rgb), 0.08);
      color: var(--signal);
    }

    .canvas {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 44% 52%, rgba(0, 245, 212, 0.1), transparent 240px),
        linear-gradient(rgba(119, 149, 190, 0.09) 1px, transparent 1px) 0 0 / 28px 28px,
        linear-gradient(90deg, rgba(119, 149, 190, 0.09) 1px, transparent 1px) 0 0 / 28px 28px,
        var(--canvas);
    }

    .canvas-toolbar {
      position: absolute;
      z-index: 2;
      inset: 14px 14px auto;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      pointer-events: none;
    }

    .toolbar-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      pointer-events: auto;
    }

    .tool-button,
    .toggle-button {
      min-height: 30px;
      border: 1px solid var(--line);
      background: rgba(9, 17, 29, 0.8);
      border-radius: var(--radius-sm);
      padding: 0 10px;
      color: #b8c6dc;
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      line-height: 1;
      text-transform: uppercase;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
    }

    .tool-button:hover,
    .toggle-button:hover {
      border-color: rgba(var(--signal-rgb), 0.42);
      background: rgba(var(--signal-rgb), 0.1);
      color: var(--signal);
      transform: translateY(-1px);
    }

    .toggle-button.active {
      border-color: rgba(var(--signal-rgb), 0.42);
      color: var(--signal);
      background: rgba(var(--signal-rgb), 0.12);
      box-shadow: 0 0 18px rgba(var(--signal-rgb), 0.1);
    }

    .review-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .review-button {
      min-height: 32px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-sm);
      padding: 0 12px;
      background: rgba(17, 26, 41, 0.92);
      color: var(--text);
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      text-transform: uppercase;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
    }

    .review-button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .review-button.primary {
      border-color: rgba(0, 215, 167, 0.42);
      background: rgba(0, 215, 167, 0.14);
      color: var(--success);
    }

    .review-button.danger {
      border-color: rgba(255, 77, 115, 0.38);
      background: rgba(255, 77, 115, 0.13);
      color: var(--failed);
    }

    .review-button:disabled {
      cursor: wait;
      opacity: 0.58;
    }

    .review-textarea {
      width: 100%;
      min-height: 86px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: rgba(5, 10, 18, 0.72);
      color: var(--text);
      font: 12px/1.5 var(--font-ui);
      padding: 10px;
      outline: none;
    }

    .review-textarea:focus {
      border-color: rgba(var(--signal-rgb), 0.48);
      box-shadow: 0 0 0 3px rgba(var(--signal-rgb), 0.08);
    }

    .review-error {
      margin-top: 10px;
      color: var(--failed);
      font-size: 12px;
      line-height: 1.4;
    }

    .canvas-footer {
      position: absolute;
      z-index: 2;
      left: 16px;
      bottom: 14px;
      display: inline-flex;
      flex-wrap: wrap;
      gap: 10px;
      max-width: calc(100% - 32px);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: rgba(4, 8, 14, 0.74);
      padding: 7px 9px;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 950;
      text-transform: uppercase;
    }

    .canvas-footer strong {
      color: var(--signal);
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
      stroke: url("#branchGradient");
      stroke-width: 2.1;
      stroke-linecap: round;
      stroke-dasharray: 8 10;
      fill: none;
      animation: branchFlow 4.8s linear infinite;
    }

    .edge.edge-underlay {
      stroke: rgba(119, 149, 190, 0.26);
      stroke-width: 5.5;
      stroke-dasharray: 8 10;
      opacity: 0.72;
      filter: none;
    }

    .node-card {
      cursor: pointer;
      outline: none;
    }

    .node-rect {
      fill: rgba(13, 22, 35, 0.94);
      stroke: rgba(119, 149, 190, 0.22);
      stroke-width: 1.2;
      filter: drop-shadow(0 12px 22px rgba(0, 0, 0, 0.22));
      transition: stroke 160ms ease, filter 160ms ease;
    }

    .node-rect.selected {
      stroke: var(--signal);
      stroke-width: 2;
      filter: drop-shadow(0 0 9px rgba(var(--signal-rgb), 0.42));
    }

    .node-card:hover .node-rect,
    .node-card:focus-visible .node-rect {
      stroke: rgba(var(--signal-rgb), 0.78);
      filter: drop-shadow(0 0 9px rgba(var(--signal-rgb), 0.34));
    }

    .node-status-pruned .node-rect {
      fill: rgba(16, 15, 22, 0.94);
      stroke: rgba(255, 77, 115, 0.62);
    }

    .node-human-revision .node-rect {
      stroke: rgba(255, 139, 209, 0.68);
    }

    .node-status-consensus .node-rect,
    .node-status-completed .node-rect,
    .node-status-scored .node-rect {
      stroke: rgba(0, 215, 167, 0.38);
    }

    .node-phase-architecture .node-rect {
      fill: rgba(17, 22, 39, 0.94);
    }

    .node-phase-implementation .node-rect {
      fill: rgba(11, 26, 30, 0.94);
    }

    .node-phase-validation .node-rect {
      fill: rgba(26, 23, 15, 0.94);
    }

    .node-label {
      fill: var(--text);
      font-family: var(--font-ui);
      font-size: 12px;
      font-weight: 850;
    }

    .node-secondary {
      fill: var(--muted);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.06em;
    }

    .score-badge {
      fill: rgba(var(--signal-rgb), 0.08);
      stroke: rgba(var(--signal-rgb), 0.22);
      stroke-width: 1;
    }

    .score-text {
      fill: var(--signal);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 900;
    }

    .node-id {
      fill: var(--muted-2);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 800;
    }

    .inspector {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--line);
      background: rgba(6, 10, 18, 0.92);
    }

    .inspector-header {
      padding: 18px 18px 13px;
      border-bottom: 1px solid var(--line);
      background: rgba(6, 10, 18, 0.94);
    }

    .inspector-title {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 18px;
      line-height: 1.2;
    }

    .inspector-subtitle {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      overflow: visible;
      white-space: normal;
    }

    .tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      position: sticky;
      top: 0;
      z-index: 1;
      border-bottom: 1px solid var(--line);
      background: rgba(5, 8, 14, 0.92);
      backdrop-filter: blur(18px) saturate(1.25);
      -webkit-backdrop-filter: blur(18px) saturate(1.25);
    }

    .tab {
      min-width: 0;
      border: 0;
      background: transparent;
      min-height: 42px;
      padding: 0 4px;
      color: var(--muted);
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.1em;
      line-height: 1;
      text-transform: uppercase;
    }

    .tab.active {
      color: var(--signal);
      box-shadow: inset 0 -2px 0 var(--signal), 0 7px 18px rgba(var(--signal-rgb), 0.1);
    }

    .tab-content {
      display: grid;
      gap: 12px;
      padding: 14px 16px 22px;
      font-size: 13px;
      line-height: 1.6;
    }

    .section {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent),
        rgba(10, 17, 28, 0.76);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }

    .section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      color: #aebdd4;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .section h3::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: var(--signal);
      box-shadow: 0 0 10px var(--signal);
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
      color: #aebdd4;
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 950;
      letter-spacing: 0.1em;
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
      border: 1px solid rgba(var(--signal-rgb), 0.22);
      border-radius: 999px;
      padding: 3px 8px;
      background: rgba(var(--signal-rgb), 0.06);
      color: var(--signal);
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
      grid-template-columns: 108px minmax(0, 1fr);
      gap: 8px;
      margin: 6px 0;
    }

    .kv-label {
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .kv-value {
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 800;
    }

    .field {
      margin: 12px 0 0;
    }

    .field:first-child {
      margin-top: 0;
    }

    .field-label {
      margin: 0 0 5px;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .text-block,
    .message-content {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      color: #cbd8e8;
      font-size: 13px;
      line-height: 1.62;
    }

    .text-block {
      border-left: 3px solid rgba(119, 149, 190, 0.35);
      padding: 1px 0 1px 12px;
    }

    .summary-block {
      border-left-color: var(--signal);
      color: #dce8f6;
      font-size: 13.5px;
    }

    .message,
    .alt-card {
      border: 1px solid rgba(119, 149, 190, 0.15);
      border-radius: var(--radius-sm);
      padding: 12px;
      margin: 10px 0;
      background: rgba(7, 13, 22, 0.72);
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
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
      opacity: 0.8;
    }

    .message:hover,
    .alt-card:hover {
      transform: translateX(2px);
      border-color: rgba(var(--signal-rgb), 0.32);
      background: rgba(var(--signal-rgb), 0.055);
    }

    .message-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      color: #aebdd4;
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
      color: var(--branch);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      text-transform: capitalize;
    }

    .role-product-manager { background: rgba(0, 245, 212, 0.11); color: var(--signal); }
    .role-business-analyst { background: rgba(73, 169, 255, 0.13); color: var(--blue); }
    .role-tech-lead { background: rgba(169, 112, 255, 0.16); color: var(--branch); }
    .role-developer { background: rgba(0, 215, 167, 0.13); color: var(--success); }
    .role-code-reviewer { background: rgba(255, 77, 115, 0.14); color: var(--failed); }
    .role-qa-engineer,
    .role-qa { background: rgba(242, 201, 76, 0.14); color: var(--paused); }

    .timestamp {
      flex: 0 0 auto;
      color: var(--muted);
      font-weight: 800;
    }

    .alt-card {
      background: rgba(7, 13, 22, 0.72);
    }

    .alt-title {
      margin: 0 0 8px;
      color: var(--text);
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
      border: 1px solid rgba(119, 149, 190, 0.15);
      border-radius: var(--radius-sm);
      padding: 8px;
      background: rgba(255, 255, 255, 0.035);
    }

    .mini-metric-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .mini-metric-value {
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
      font-size: 13px;
      font-weight: 900;
    }

    .metric-grid-wide {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .compact-card {
      border: 1px solid rgba(119, 149, 190, 0.14);
      border-radius: var(--radius-sm);
      padding: 10px;
      background: rgba(5, 10, 18, 0.46);
    }

    .empty {
      padding: 24px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .canvas-empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 28px;
      color: var(--muted);
      text-align: center;
      pointer-events: none;
    }

    .canvas-empty strong {
      display: block;
      margin-bottom: 4px;
      color: var(--text);
      font-size: 14px;
    }

    .list {
      margin: 8px 0 0;
      padding-left: 20px;
    }

    .list li {
      margin: 6px 0;
      overflow-wrap: break-word;
      color: #cbd8e8;
      line-height: 1.55;
    }

    .timeline-note {
      margin: 0 0 12px;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .timeline {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .timeline-item {
      position: relative;
      min-width: 0;
      padding-left: 40px;
    }

    .timeline-item::before {
      content: "";
      position: absolute;
      left: 13px;
      top: 30px;
      bottom: -13px;
      width: 1px;
      background: rgba(119, 149, 190, 0.24);
    }

    .timeline-item:last-child::before {
      display: none;
    }

    .timeline-index {
      position: absolute;
      left: 0;
      top: 0;
      width: 27px;
      height: 27px;
      border: 1px solid rgba(var(--signal-rgb), 0.34);
      border-radius: 999px;
      background: rgba(var(--signal-rgb), 0.1);
      color: var(--signal);
      display: grid;
      place-items: center;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      box-shadow: 0 0 14px rgba(var(--signal-rgb), 0.1);
    }

    .timeline-card {
      min-width: 0;
      border: 1px solid rgba(119, 149, 190, 0.14);
      border-radius: var(--radius-sm);
      padding: 10px 11px;
      background: rgba(5, 10, 18, 0.44);
    }

    .timeline-label {
      margin: 0 0 8px;
      color: #9fb0c8;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .timeline-time {
      margin: -3px 0 8px;
      color: var(--signal);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 850;
    }

    .timeline-text p {
      margin: 0 0 8px;
      color: #cbd8e8;
      line-height: 1.62;
    }

    .timeline-text p:last-child {
      margin-bottom: 0;
    }

    .score-row {
      display: grid;
      grid-template-columns: 112px minmax(70px, 1fr) 44px;
      align-items: center;
      gap: 10px;
      margin-top: 10px;
    }

    .score-row span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .score-row div {
      height: 4px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(119, 149, 190, 0.17);
    }

    .score-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--signal), var(--score));
      box-shadow: 0 0 12px rgba(76, 141, 255, 0.45);
    }

    .score-row strong {
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 950;
      text-align: right;
    }

    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: min(52vh, 520px);
      overflow: auto;
      background: rgba(2, 5, 10, 0.78);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      padding: 12px;
      color: #e2edf7;
      font: 12px/1.55 var(--font-mono);
    }

    @keyframes branchFlow {
      to {
        stroke-dashoffset: -36;
      }
    }

    @media (max-width: 1180px) {
      .app-shell {
        height: auto;
        min-height: 100vh;
        overflow: visible;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .main {
        grid-template-columns: 280px minmax(0, 1fr);
        grid-template-rows: minmax(620px, calc(100vh - 58px)) auto;
      }

      .canvas {
        min-height: 620px;
      }

      .inspector {
        grid-column: 1 / -1;
        border-left: 0;
        border-top: 1px solid var(--line);
      }
    }

    @media (max-width: 760px) {
      .topbar {
        grid-template-columns: 1fr;
        align-items: start;
        gap: 10px;
        min-height: 86px;
        padding: 12px 14px;
      }

      .topbar-meta {
        justify-content: flex-start;
      }

      .main {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(520px, 62vh) auto;
      }

      .runs {
        max-height: 250px;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }

      .canvas-toolbar {
        position: relative;
        inset: auto;
        padding: 12px;
      }

      .canvas-footer {
        position: relative;
        left: auto;
        bottom: auto;
        margin: 0 12px 12px;
      }

      .kv {
        grid-template-columns: 1fr;
        gap: 3px;
      }

      .mini-metrics,
      .score-row {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
      }

      .edge {
        stroke-dasharray: none;
      }
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
    requirements: "#00f5d4",
    architecture: "#a970ff",
    implementation: "#00d7a7",
    validation: "#f2c94c"
  };
  var RUN_LIST_REFRESH_MS = 2500;

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
    drag: null,
    eventSource: null,
    listRefreshTimer: null,
    liveStatus: "idle",
    reviewSubmitting: null,
    reviewError: null
  };

  var app = document.getElementById("app");
  if (!app) {
    return;
  }

  app.innerHTML = [
    '<div class="app-shell">',
      '<header class="topbar">',
        '<div class="brand"><span class="brand-mark">CTO</span><span class="brand-copy"><strong>Cambrian Tree Orchestrator</strong><span>Live run monitor</span></span></div>',
        '<div class="topbar-meta"><span id="topbarDetail" class="topbar-detail"></span><span id="topbarStatus" class="status-pill status-running">Loading saved runs</span></div>',
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
          '<div id="canvasFooter" class="canvas-footer" hidden></div>',
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
    canvasFooter: document.getElementById("canvasFooter"),
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
  state.listRefreshTimer = window.setInterval(function () {
    loadRuns({ silent: true });
  }, RUN_LIST_REFRESH_MS);

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
    window.addEventListener("beforeunload", function () {
      closeRunEvents();
      if (state.listRefreshTimer) {
        window.clearInterval(state.listRefreshTimer);
      }
    });
  }

  async function loadRuns(options) {
    var silent = options && options.silent;
    if (!silent) {
      state.loadingRuns = true;
    }
    state.error = null;
    if (!silent) {
      renderStatus();
    }

    try {
      var runs = await fetchJson("/api/runs");
      state.runs = Array.isArray(runs) ? runs : [];
      state.loadingRuns = false;
      renderRunList();

      if (state.runs.length === 0) {
        state.run = null;
        state.selectedRunId = null;
        state.selectedNodeId = null;
        closeRunEvents();
        renderAll();
        return;
      }

      var initialRunId = window.__CTO_INITIAL_RUN_ID__ || null;
      var selected = state.selectedRunId || initialRunId || state.runs[0].id;
      if (!state.selectedRunId) {
        selectRun(selected);
      } else if (!state.runs.some(function (run) { return run.id === state.selectedRunId; })) {
        selectRun(selected);
      } else {
        renderStatus();
      }
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
    state.reviewSubmitting = null;
    state.reviewError = null;
    closeRunEvents();
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
      openRunEvents(runId);
      renderAll();
    } catch (error) {
      if (token !== state.requestToken) {
        return;
      }

      state.run = null;
      state.selectedNodeId = null;
      state.loadingRun = false;
      state.error = readableError(error);
      closeRunEvents();
      renderAll();
    }
  }

  function openRunEvents(runId) {
    if (!window.EventSource) {
      state.liveStatus = "polling";
      return;
    }

    closeRunEvents();
    state.liveStatus = "connecting";
    var source = new EventSource("/api/runs/" + encodeURIComponent(runId) + "/events");
    state.eventSource = source;

    source.addEventListener("open", function () {
      state.liveStatus = "live";
      renderStatus();
    });

    source.addEventListener("snapshot", function (event) {
      if (runId !== state.selectedRunId) {
        return;
      }
      try {
        applyRunSnapshot(JSON.parse(event.data));
      } catch (error) {
        state.liveStatus = "error";
        state.error = readableError(error);
        renderAll();
      }
    });

    source.addEventListener("error", function () {
      if (state.eventSource === source) {
        state.liveStatus = "reconnecting";
        renderStatus();
      }
    });
  }

  function closeRunEvents() {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
    state.liveStatus = "idle";
  }

  function applyRunSnapshot(run) {
    if (!run || run.id !== state.selectedRunId) {
      return;
    }

    var previousCount = state.run && state.run.root ? countAllNodes(state.run.root) : 0;
    var nextCount = run.root ? countAllNodes(run.root) : 0;
    state.run = run;
    state.loadingRun = false;
    state.liveStatus = "live";
    if (!run.pendingHumanReview || state.reviewSubmitting !== run.pendingHumanReview.requestId) {
      state.reviewSubmitting = null;
    }
    if (state.selectedNodeId && !findNode(run.root, state.selectedNodeId, true)) {
      state.selectedNodeId = run.root ? run.root.id : null;
    }
    if (nextCount !== previousCount) {
      state.fitPending = true;
    }
    renderAll();
  }

  async function fetchJson(url, options) {
    var requestOptions = options || {};
    var headers = Object.assign({ Accept: "application/json" }, requestOptions.headers || {});
    var response = await fetch(url, Object.assign({}, requestOptions, { headers: headers }));
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
      setStatusPill(refs.topbarStatus, "Error");
      setText(refs.topbarDetail, state.error);
      return;
    }

    if (state.loadingRuns) {
      setStatusPill(refs.topbarStatus, "Loading saved runs");
      setText(refs.topbarDetail, "");
      return;
    }

    if (state.loadingRun) {
      setStatusPill(refs.topbarStatus, "Loading run");
      setText(refs.topbarDetail, state.selectedRunId || "");
      return;
    }

    if (!state.runs.length) {
      setStatusPill(refs.topbarStatus, "No saved runs");
      setText(refs.topbarDetail, "");
      return;
    }

    if (state.run) {
      var label = state.run.pendingHumanReview
        ? "pending review"
        : state.liveStatus === "reconnecting"
          ? "reconnecting"
          : state.liveStatus === "connecting"
            ? "connecting"
            : state.run.status || "loaded";
      setStatusPill(refs.topbarStatus, label);
      setText(refs.topbarDetail, state.run.intent || state.run.id || "");
      return;
    }

    setStatusPill(refs.topbarStatus, String(state.runs.length) + " saved runs");
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
      appendChip(meta, String(run.toolRequestCount || 0) + " tool requests");
      appendChip(meta, String(run.toolEvidenceCount || 0) + " evidence");
      if (run.codexUsageTotal) {
        appendChip(meta, "Codex " + formatCodexTokens(run.codexUsageTotal));
      }
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
    clear(refs.canvasFooter);
    refs.canvasFooter.hidden = true;
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
    renderCanvasFooter();

    if (state.layout.nodes.length === 0) {
      showCanvasEmpty("No visible nodes", "Enable Show pruned to view pruned branches.");
      return;
    }

    refs.svg.appendChild(renderSvgDefs());
    var edgeLayer = svgEl("g");
    var nodeLayer = svgEl("g");
    refs.svg.appendChild(edgeLayer);
    refs.svg.appendChild(nodeLayer);

    state.layout.edges.forEach(function (edge) {
      var d = edgePath(edge);

      var underlay = svgEl("path");
      underlay.setAttribute("class", "edge edge-underlay");
      underlay.setAttribute("d", d);
      edgeLayer.appendChild(underlay);

      var path = svgEl("path");
      path.setAttribute("class", "edge");
      path.setAttribute("d", d);
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
    group.setAttribute("class", nodeClassName(node));
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

    var nodeComposite = node.fitness && typeof node.fitness.composite === "number"
      ? node.fitness.composite
      : node.score && typeof node.score.composite === "number"
        ? node.score.composite
        : undefined;
    if (typeof nodeComposite === "number") {
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
      score.textContent = formatScore(nodeComposite);
      group.appendChild(score);
    }

    return group;
  }

  function renderSvgDefs() {
    var defs = svgEl("defs");
    var gradient = svgEl("linearGradient");
    gradient.setAttribute("id", "branchGradient");
    gradient.setAttribute("x1", "0");
    gradient.setAttribute("x2", "1");
    gradient.setAttribute("y1", "0");
    gradient.setAttribute("y2", "0");

    var stops = [
      ["0%", "#00f5d4"],
      ["55%", "#49a9ff"],
      ["100%", "#a970ff"]
    ];
    stops.forEach(function (item) {
      var stop = svgEl("stop");
      stop.setAttribute("offset", item[0]);
      stop.setAttribute("stop-color", item[1]);
      gradient.appendChild(stop);
    });

    defs.appendChild(gradient);
    return defs;
  }

  function renderCanvasFooter() {
    if (!state.layout || !state.run) {
      return;
    }

    refs.canvasFooter.hidden = false;
    appendFooterItem("Nodes " + formatNumber(state.layout.nodes.length));
    appendFooterItem("Depth " + formatNumber(maxVisibleDepth()));
    appendFooterItem("Leaves " + formatNumber(countVisibleLeaves(state.run.root)));
    var codexUsage = runCodexUsageTotal(state.run);
    if (codexUsage) {
      appendFooterItem("Codex " + formatCodexTokens(codexUsage));
    }
    if (typeof bestScore(state.run.root) === "number") {
      var score = document.createElement("strong");
      score.textContent = "Best " + formatScore(bestScore(state.run.root));
      refs.canvasFooter.appendChild(score);
    }
  }

  function appendFooterItem(text) {
    var item = document.createElement("span");
    item.textContent = text;
    refs.canvasFooter.appendChild(item);
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
      chip.className = "inspector-chip " + chipClassName(item);
      chip.textContent = item;
      detail.appendChild(chip);
    });
    refs.inspectorHeader.appendChild(detail);
  }

  function renderSummaryTab(node) {
    var pathNodes = findPath(state.run.root, node.id);
    var path = pathNodes.map(function (item) {
      return item.branchLabel || "root";
    });

    var overview = section("Summary");
    appendField(overview, "Branch", node.branchDescription || "No branch description recorded.", "summary-block");
    appendField(overview, "Debate", node.debate && node.debate.summary ? node.debate.summary : "No debate summary recorded.", "summary-block");
    appendKeyValue(overview, "Path", path.join(" / "));
    appendKeyValue(overview, "Created", formatDateTime(node.createdAt));
    appendKeyValue(overview, "Updated", formatDateTime(node.updatedAt));
    appendKeyValue(overview, "Tool requests", formatNumber((node.toolRequests || []).length));
    appendKeyValue(
      overview,
      "Tool evidence",
      formatNumber((node.context && node.context.toolEvidence ? node.context.toolEvidence : []).length),
    );
    refs.tabContent.appendChild(overview);

    var ancestorSection = section("Ancestor Summaries");
    appendTimelineOrEmpty(ancestorSection, buildAncestorTimeline(node, pathNodes), "No ancestor summaries recorded.");
    refs.tabContent.appendChild(ancestorSection);

    if (isPendingReviewNode(node)) {
      renderHumanReviewControls(node);
    }

    if (node.humanIntervention) {
      var intervention = section("Human Intervention");
      appendKeyValue(intervention, "Action", node.humanIntervention.action || "Not recorded");
      appendKeyValue(intervention, "Created", formatDateTime(node.humanIntervention.createdAt));
      if (node.humanIntervention.prompt) {
        appendField(intervention, "Prompt", node.humanIntervention.prompt, "summary-block");
      }
      refs.tabContent.appendChild(intervention);
    }

    renderRunOverview();
    renderRankedResults();
    renderRunCodexUsage();
  }

  function renderHumanReviewControls(node) {
    var pending = state.run && state.run.pendingHumanReview;
    if (!pending || pending.nodeId !== node.id) {
      return;
    }

    var review = section("Plan Review");
    appendKeyValue(review, "Request", pending.requestId);
    appendField(review, "Decision", "Choose whether this candidate should proceed to execution, be revised through another debate pass, or be killed.", "summary-block");

    var textarea = document.createElement("textarea");
    textarea.className = "review-textarea";
    textarea.placeholder = "Revision prompt";
    textarea.disabled = state.reviewSubmitting === pending.requestId;
    review.appendChild(textarea);

    var actions = document.createElement("div");
    actions.className = "review-actions";
    actions.appendChild(reviewButton("Proceed", "primary", function () {
      submitHumanReviewDecision("proceed");
    }));
    actions.appendChild(reviewButton("Revise", "", function () {
      submitHumanReviewDecision("revise", textarea.value);
    }));
    actions.appendChild(reviewButton("Kill", "danger", function () {
      submitHumanReviewDecision("kill");
    }));
    review.appendChild(actions);

    if (state.reviewSubmitting === pending.requestId) {
      review.appendChild(emptyBlock("Decision submitted. Waiting for the orchestrator to apply it."));
    }

    if (state.reviewError) {
      var error = document.createElement("div");
      error.className = "review-error";
      error.textContent = state.reviewError;
      review.appendChild(error);
    }

    refs.tabContent.appendChild(review);
  }

  function reviewButton(label, className, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "review-button" + (className ? " " + className : "");
    button.textContent = label;
    button.disabled = Boolean(state.reviewSubmitting);
    button.addEventListener("click", onClick);
    return button;
  }

  async function submitHumanReviewDecision(action, prompt) {
    var pending = state.run && state.run.pendingHumanReview;
    if (!state.run || !pending) {
      return;
    }

    var payload = { action: action };
    if (action === "revise") {
      var trimmed = String(prompt || "").trim();
      if (!trimmed) {
        state.reviewError = "Revision prompt cannot be empty.";
        renderInspector();
        return;
      }
      payload.prompt = trimmed;
    }

    state.reviewSubmitting = pending.requestId;
    state.reviewError = null;
    renderInspector();

    try {
      await fetchJson(
        "/api/runs/" + encodeURIComponent(state.run.id) + "/human-review/" + encodeURIComponent(pending.requestId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
    } catch (error) {
      state.reviewSubmitting = null;
      state.reviewError = readableError(error);
      renderInspector();
    }
  }

  function isPendingReviewNode(node) {
    var pending = state.run && state.run.pendingHumanReview;
    return Boolean(pending && node && pending.nodeId === node.id);
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
    if (transcript.llmUsage) {
      var usageMetrics = document.createElement("div");
      usageMetrics.className = "mini-metrics";
      appendMiniMetric(usageMetrics, "LLM input", formatNumber(transcript.llmUsage.inputTokens || 0));
      appendMiniMetric(usageMetrics, "LLM cached", formatNumber(transcript.llmUsage.cachedInputTokens || 0));
      appendMiniMetric(usageMetrics, "LLM output", formatNumber(transcript.llmUsage.outputTokens || 0));
      outcome.appendChild(usageMetrics);
    }
    refs.tabContent.appendChild(outcome);

    if (hasMeaningfulValue(transcript.contextUpdates)) {
      var updates = collapsibleSection("Context Updates", false);
      appendStructuredObject(updates.body, transcript.contextUpdates, "No context updates recorded.");
      refs.tabContent.appendChild(updates.details);
    }

    if (hasMeaningfulValue(transcript.compactState)) {
      var compact = collapsibleSection("Compact Debate State", false);
      renderCompactDebateState(compact.body, transcript.compactState);
      refs.tabContent.appendChild(compact.details);
    }

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
    var pathNodes = state.run && state.run.root ? findPath(state.run.root, node.id) : [];

    var originalIntent = section("Original Intent");
    appendTextOrEmpty(originalIntent, context.originalIntent, "No original intent recorded.");
    refs.tabContent.appendChild(originalIntent);

    var decomposition = collapsibleSection("Intent Decomposition", true);
    renderIntentDecomposition(decomposition.body, context.intentDecomposition);
    refs.tabContent.appendChild(decomposition.details);

    var dossier = collapsibleSection("Intent Dossier", true);
    renderIntentDossier(dossier.body, context.intentDossier);
    refs.tabContent.appendChild(dossier.details);

    if (hasMeaningfulValue(context.domainFacts)) {
      var domainFacts = collapsibleSection("Domain Facts", false);
      appendStructuredObject(domainFacts.body, context.domainFacts, "No domain facts recorded.");
      refs.tabContent.appendChild(domainFacts.details);
    }

    if (context.humanRevisionPrompt) {
      var humanRevision = section("Human Revision Prompt");
      appendTextOrEmpty(humanRevision, context.humanRevisionPrompt, "No human revision prompt recorded.");
      refs.tabContent.appendChild(humanRevision);
    }

    var toolRequests = section("Tool Requests");
    renderToolRequests(toolRequests, node.toolRequests);
    refs.tabContent.appendChild(toolRequests);

    var toolEvidence = section("Tool Evidence");
    renderToolEvidence(toolEvidence, context.toolEvidence);
    refs.tabContent.appendChild(toolEvidence);

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
    appendTimelineOrEmpty(ancestors, buildAncestorTimeline(node, pathNodes), "No ancestor summaries recorded.");
    refs.tabContent.appendChild(ancestors);
  }

  function renderLeafTab(node) {
    if (Array.isArray(node.children) && node.children.length > 0) {
      refs.tabContent.appendChild(emptyBlock("This node is not a leaf. Select a terminal node to inspect execution and score details."));
      return;
    }

    if (!node.executionResult && !node.score && !node.implementationSketch && !node.skippedExecutionReason) {
      refs.tabContent.appendChild(emptyBlock("This leaf does not have execution, sketch, or judge output yet."));
      return;
    }

    if (node.implementationSketch || node.skippedExecutionReason) {
      var sketch = section("Implementation Sketch");
      if (node.skippedExecutionReason) appendKeyValue(sketch, "Execution", node.skippedExecutionReason);
      if (node.implementationSketch) {
        appendTextOrEmpty(sketch, node.implementationSketch.approach, "No sketch approach recorded.");
        appendKeyValue(sketch, "Leaf", node.implementationSketch.leafId || node.id || "Not recorded");
        appendKeyValue(sketch, "Complexity", node.implementationSketch.estimatedComplexity || "Not recorded");
        appendKeyValue(sketch, "Confidence", formatPercent(node.implementationSketch.confidence || 0));
        appendStructuredList(sketch, "Algorithm / Architecture", node.implementationSketch.algorithmOrArchitecture, "No architecture sketch recorded.");
        appendStructuredList(sketch, "Likely Files", node.implementationSketch.filesLikelyChanged, "No likely files recorded.");
        appendStructuredList(sketch, "Expected Tests", node.implementationSketch.expectedTests, "No expected tests recorded.");
        appendStructuredList(sketch, "Risk Areas", node.implementationSketch.riskAreas, "No sketch risks recorded.");
        appendField(sketch, "Rationale", node.implementationSketch.rationale || "No sketch rationale recorded.");
        var ce = node.implementationSketch.criticEvaluation;
        if (ce) {
          var axes = section("Critic Decision Axes");
          appendKeyValue(axes, "Reversibility", (ce.reversibility.value || "n/a") + " — " + (ce.reversibility.note || ""));
          appendKeyValue(axes, "Blast radius", (ce.blastRadius.value || "n/a") + " — " + (ce.blastRadius.note || ""));
          appendKeyValue(axes, "Time to signal", (ce.timeToSignal.value || "n/a") + " — " + (ce.timeToSignal.note || ""));
          appendField(axes, "Counter-case", ce.counterCase || "None recorded.");
          appendField(axes, "Falsifier", ce.falsifier || "None recorded.");
          sketch.appendChild(axes);
        }
      }
      refs.tabContent.appendChild(sketch);
    }

    if (node.context && node.context.coverageAudit) {
      var audit = node.context.coverageAudit;
      var auditSection = section("Coverage Audit");
      if (audit.coverageGaps && audit.coverageGaps.length > 0) {
        var gapList = document.createElement("ul");
        gapList.className = "gap-list";
        audit.coverageGaps.forEach(function (gap) {
          var li = document.createElement("li");
          li.textContent = gap.dimension + ": " + gap.reason;
          gapList.appendChild(li);
        });
        auditSection.appendChild(gapList);
      } else {
        appendKeyValue(auditSection, "Gaps", "None — all required dimensions addressed.");
      }
      if (audit.followUpRoundFired) appendKeyValue(auditSection, "Follow-up round", "Yes");
      appendField(auditSection, "Premortem", audit.premortem || "None recorded.");
      refs.tabContent.appendChild(auditSection);
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

      if (node.executionResult.verification) {
        var verification = section("Verification Results");
        appendKeyValue(verification, "Passed", formatNumber(node.executionResult.verification.passed || 0));
        appendKeyValue(verification, "Failed", formatNumber(node.executionResult.verification.failed || 0));
        appendKeyValue(verification, "Required failed", formatNumber(node.executionResult.verification.requiredFailed || 0));
        if (Array.isArray(node.executionResult.verification.results) && node.executionResult.verification.results.length > 0) {
          node.executionResult.verification.results.forEach(function (result) {
            var resultCard = document.createElement("div");
            resultCard.className = "compact-card";
            appendKeyValue(resultCard, "Command", result.command || result.commandId || "Not recorded");
            appendKeyValue(resultCard, "Exit", result.exitCode === null || result.exitCode === undefined ? "n/a" : result.exitCode);
            appendKeyValue(resultCard, "Result", result.passed ? "Passed" : "Failed");
            appendKeyValue(resultCard, "Duration", formatDuration(result.durationMs));
            if (result.stdout) appendField(resultCard, "Stdout", result.stdout);
            if (result.stderr) appendField(resultCard, "Stderr", result.stderr);
            verification.appendChild(resultCard);
          });
        }
        refs.tabContent.appendChild(verification);
      }

      if (node.executionResult.usage) {
        var usage = section("Codex Usage");
        appendKeyValue(usage, "Total", formatCodexTokens(node.executionResult.usage));
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
      appendScoreRow(score, "Functional", node.score.functionalCompleteness);
      appendScoreRow(score, "Architecture", node.score.architecturalQuality);
      appendScoreRow(score, "Tests", node.score.testCoverage);
      appendScoreRow(score, "Intent", node.score.intentAlignment);
      appendScoreRow(score, "Real-world", node.score.realWorldFit);
      appendScoreRow(score, "Simplicity", node.score.simplicity);
      appendScoreRow(score, "Uncertainty", node.score.uncertainty);
      appendTextOrEmpty(score, node.score.rationale, "No rationale recorded.");
      appendStructuredList(score, "Evidence", node.score.evidence, "No judge evidence recorded.");
      appendStructuredList(score, "Failures", node.score.failures, "No judge failures recorded.");
      refs.tabContent.appendChild(score);
    }

    if (node.fitness) {
      var fitness = section("Fitness Score");
      appendKeyValue(fitness, "Composite", formatScore(node.fitness.composite));
      appendScoreRow(fitness, "Verification", node.fitness.verification);
      appendScoreRow(fitness, "Functional", node.fitness.functionalCompleteness);
      appendScoreRow(fitness, "Maintainability", node.fitness.maintainability);
      appendScoreRow(fitness, "Simplicity", node.fitness.simplicity);
      appendScoreRow(fitness, "Intent", node.fitness.intentAlignment);
      appendScoreRow(fitness, "Risk reduction", node.fitness.riskReduction);
      appendScoreRow(fitness, "Cost efficiency", node.fitness.costEfficiency);
      appendScoreRow(fitness, "Uncertainty penalty", node.fitness.uncertaintyPenalty);
      appendStructuredList(fitness, "Evidence", node.fitness.evidence, "No fitness evidence recorded.");
      appendStructuredList(fitness, "Failures", node.fitness.failures, "No fitness failures recorded.");
      refs.tabContent.appendChild(fitness);
    }
  }

  function renderRunOverview() {
    var run = state.run;
    if (!run) {
      return;
    }

    var overview = section("Run Overview");
    var metrics = document.createElement("div");
    metrics.className = "mini-metrics metric-grid-wide";
    appendMiniMetric(metrics, "Run", run.id || "Not recorded");
    appendMiniMetric(metrics, "Status", run.status || "Not recorded");
    appendMiniMetric(metrics, "Mode", run.runMode || "Not recorded");
    appendMiniMetric(metrics, "Leaves", Array.isArray(run.leafNodeIds) ? String(run.leafNodeIds.length) : "0");
    appendMiniMetric(metrics, "Tool requests", formatNumber(countToolRequests(run.root)));
    appendMiniMetric(metrics, "Tool evidence", formatNumber(countToolEvidence(run.root)));
    appendMiniMetric(metrics, "Started", formatDateTime(run.startedAt));
    appendMiniMetric(metrics, "Completed", formatDateTime(run.completedAt));
    overview.appendChild(metrics);

    appendField(overview, "Intent", run.intent || "No intent recorded.", "summary-block");
    appendKeyValue(overview, "Selected agents", formatListValue(run.selectedAgents));
    appendKeyValue(overview, "Leaf node IDs", formatListValue(run.leafNodeIds));
    appendKeyValue(overview, "Total debate tokens", formatNumber(run.totalTokensUsed || 0));

    if (run.llmUsage) {
      var llm = document.createElement("div");
      llm.className = "mini-metrics";
      appendMiniMetric(llm, "LLM input", formatNumber(run.llmUsage.inputTokens || 0));
      appendMiniMetric(llm, "LLM cached", formatNumber(run.llmUsage.cachedInputTokens || 0));
      appendMiniMetric(llm, "LLM output", formatNumber(run.llmUsage.outputTokens || 0));
      overview.appendChild(llm);
    }

    if (run.cacheStats) {
      var cache = document.createElement("div");
      cache.className = "mini-metrics";
      appendMiniMetric(cache, "Cache hits", formatNumber(run.cacheStats.hits || 0));
      appendMiniMetric(cache, "Cache misses", formatNumber(run.cacheStats.misses || 0));
      appendMiniMetric(cache, "Cache writes", formatNumber(run.cacheStats.writes || 0));
      overview.appendChild(cache);
    }

    refs.tabContent.appendChild(overview);

    if (run.config) {
      var routing = collapsibleSection("Model Routing", false);
      renderRunConfig(routing.body, run.config);
      refs.tabContent.appendChild(routing.details);
    }
  }

  function renderRunConfig(parent, config) {
    var primary = document.createElement("div");
    primary.className = "mini-metrics metric-grid-wide";
    appendMiniMetric(primary, "Provider", config.llmProvider || "Not recorded");
    appendMiniMetric(primary, "Reasoning", config.reasoningModel || "Not recorded");
    appendMiniMetric(primary, "Judge", config.judgeModel || "Not recorded");
    appendMiniMetric(primary, "API env", config.llmApiKeyEnv || "Not recorded");
    appendMiniMetric(primary, "Depth", formatNumber(config.maxDepth || 0));
    appendMiniMetric(primary, "Branching", formatNumber(config.maxBranching || 0));
    appendMiniMetric(primary, "Debate rounds", formatNumber(config.maxDebateRounds || 0));
    appendMiniMetric(primary, "Concurrency", formatNumber(config.leafConcurrency || 0));
    parent.appendChild(primary);

    appendKeyValue(parent, "Working dir", config.workingDirectory || "Not recorded");
    appendKeyValue(parent, "Dry run", String(Boolean(config.dryRun)));
    appendKeyValue(parent, "Interactive plan", String(Boolean(config.interactivePlan)));
    appendKeyValue(parent, "Deterministic cache", String(Boolean(config.enableDeterministicCache)));
    appendKeyValue(parent, "Sketch ranking", String(Boolean(config.enableSketchRanking)));
    appendKeyValue(parent, "Sketch top N", config.sketchExecutionTopN === undefined ? "Not recorded" : config.sketchExecutionTopN);
    appendKeyValue(parent, "Prune threshold", config.pruneThreshold === undefined ? "Not recorded" : config.pruneThreshold);
    appendKeyValue(parent, "Verification timeout", formatDuration(config.verificationTimeoutMs));
    appendKeyValue(parent, "Cloud env", config.cloudEnv || "Not recorded");
    appendKeyValue(parent, "Cloud attempts", config.cloudAttempts === undefined ? "Not recorded" : config.cloudAttempts);
    appendStructuredObject(parent, {
      modelTiers: config.modelTiers,
      modelAssignments: config.modelAssignments,
      phaseDepths: config.phaseDepths,
      pruneSchedule: config.pruneSchedule,
      verificationCommands: config.verificationCommands,
    }, "No routing detail recorded.");
  }

  function renderRankedResults() {
    var run = state.run;
    if (!run || !Array.isArray(run.rankedResults) || run.rankedResults.length === 0) {
      return;
    }

    var ranked = collapsibleSection("Ranked Results", false);
    run.rankedResults.forEach(function (result, index) {
      var card = document.createElement("div");
      card.className = "alt-card";
      var title = document.createElement("h4");
      title.className = "alt-title";
      title.textContent = "#" + String(index + 1) + " " + (Array.isArray(result.path) ? result.path.join(" / ") : result.nodeId || "Result");
      card.appendChild(title);
      appendKeyValue(card, "Node", result.nodeId || "Not recorded");
      appendKeyValue(card, "Path", Array.isArray(result.path) ? result.path.join(" / ") : "Not recorded");
      if (result.fitness) appendKeyValue(card, "Fitness", formatScore(result.fitness.composite));
      if (result.score) appendKeyValue(card, "Judge", formatScore(result.score.composite));
      if (result.score && result.score.rationale) appendField(card, "Rationale", result.score.rationale);
      ranked.body.appendChild(card);
    });
    refs.tabContent.appendChild(ranked.details);
  }

  function renderIntentDecomposition(parent, decomposition) {
    if (!hasMeaningfulValue(decomposition)) {
      parent.appendChild(emptyBlock("No intent decomposition recorded."));
      return;
    }

    appendStructuredList(parent, "Load Bearing Claims", decomposition.loadBearingClaims, "No load-bearing claims recorded.");
    appendStructuredList(parent, "Undefined Terms", decomposition.undefinedTerms, "No undefined terms recorded.");
    appendStructuredList(parent, "In Scope", decomposition.inScope, "No in-scope items recorded.");
    appendStructuredList(parent, "Out of Scope", decomposition.outOfScope, "No out-of-scope items recorded.");
    appendStructuredList(parent, "Known Unknowns", decomposition.knownUnknowns, "No known unknowns recorded.");
    appendStructuredList(parent, "Feasibility Flags", decomposition.feasibilityFlags, "No feasibility flags recorded.");
    appendField(parent, "Rationale", decomposition.rationale || "No decomposition rationale recorded.");
  }

  function renderIntentDossier(parent, dossier) {
    if (!hasMeaningfulValue(dossier)) {
      parent.appendChild(emptyBlock("No intent dossier recorded."));
      return;
    }

    appendField(parent, "Goal", dossier.goal || "No goal recorded.", "summary-block");
    appendField(parent, "User Value", dossier.userValue || "No user value recorded.");
    appendStructuredList(parent, "Non-goals", dossier.nonGoals, "No non-goals recorded.");
    appendStructuredList(parent, "Constraints", dossier.constraints, "No constraints recorded.");
    appendStructuredList(parent, "Acceptance Criteria", dossier.acceptanceCriteria, "No dossier acceptance criteria recorded.");
    appendStructuredList(parent, "Required Checks", dossier.requiredChecks, "No required checks recorded.");
    appendStructuredList(parent, "Risk Areas", dossier.riskAreas, "No risk areas recorded.");
    appendStructuredList(parent, "Known Unknowns", dossier.knownUnknowns, "No dossier known unknowns recorded.");
    appendStructuredList(parent, "Success Signals", dossier.successSignals, "No success signals recorded.");
    appendStructuredList(parent, "Failure Modes", dossier.failureModes, "No failure modes recorded.");
  }

  function renderCompactDebateState(parent, compactState) {
    if (!hasMeaningfulValue(compactState)) {
      parent.appendChild(emptyBlock("No compact debate state recorded."));
      return;
    }

    appendStructuredList(parent, "Accepted Facts", compactState.acceptedFacts, "No accepted facts recorded.");
    appendStructuredList(parent, "Locked Decisions", compactState.lockedDecisions, "No locked decisions recorded.");
    appendStructuredList(parent, "Live Alternatives", compactState.liveAlternatives, "No live alternatives recorded.");
    appendStructuredList(parent, "Killed Alternatives", compactState.killedAlternatives, "No killed alternatives recorded.");
    appendStructuredList(parent, "Unresolved Questions", compactState.unresolvedQuestions, "No unresolved questions recorded.");
    appendStructuredList(parent, "Risks", compactState.risks, "No compact risks recorded.");
    appendStructuredList(parent, "Verification Ideas", compactState.verificationIdeas, "No verification ideas recorded.");
    appendField(parent, "Last Round Summary", compactState.lastRoundSummary || "No compact summary recorded.", "summary-block");
  }

  function renderToolRequests(parent, requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      parent.appendChild(emptyBlock("No tool requests recorded for this node."));
      return;
    }

    requests.forEach(function (request) {
      var card = document.createElement("div");
      card.className = "compact-card";
      appendKeyValue(card, "Tool", request.toolName || "Not recorded");
      appendKeyValue(card, "Query", request.query || "Not recorded");
      appendKeyValue(card, "Status", request.status || "Not recorded");
      appendKeyValue(card, "Requested by", request.requestedBy || "Not recorded");
      appendKeyValue(card, "Round", request.roundNumber === undefined ? "Not recorded" : request.roundNumber);
      appendKeyValue(card, "Created", formatDateTime(request.createdAt));
      appendKeyValue(card, "Completed", formatDateTime(request.completedAt));
      if (request.reason) {
        appendField(card, "Reason", request.reason);
      }
      parent.appendChild(card);
    });
  }

  function renderToolEvidence(parent, evidence) {
    if (!Array.isArray(evidence) || evidence.length === 0) {
      parent.appendChild(emptyBlock("No tool evidence recorded for this node."));
      return;
    }

    evidence.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "compact-card";
      var title = document.createElement("h4");
      title.className = "alt-title";
      title.textContent = (item.toolName || "tool") + ": " + (item.query || "query");
      card.appendChild(title);

      appendField(card, "Summary", item.summary || "No summary recorded.", "summary-block");
      appendKeyValue(card, "Request", item.requestId || "Not recorded");
      appendKeyValue(card, "Requested by", item.requestedBy || "Not recorded");
      appendKeyValue(
        card,
        "Additional requesters",
        Array.isArray(item.additionalRequesters) && item.additionalRequesters.length > 0
          ? item.additionalRequesters.join(", ")
          : "None",
      );
      appendKeyValue(card, "Round", item.roundNumber === undefined ? "Not recorded" : item.roundNumber);
      appendKeyValue(card, "Confidence", typeof item.confidence === "number" ? formatScore(item.confidence) : "n/a");
      appendKeyValue(card, "Created", formatDateTime(item.createdAt));
      appendStructuredList(card, "Findings", item.findings, "No findings recorded.");
      appendStructuredList(card, "Decision Relevance", item.decisionRelevance, "No decision relevance recorded.");
      appendStructuredList(card, "Constraints", item.constraintsDiscovered, "No constraints discovered.");
      appendStructuredList(card, "Risks", item.risksDiscovered, "No risks discovered.");
      appendStructuredList(card, "Open Questions", item.openQuestions, "No open questions recorded.");
      appendStructuredList(card, "Limitations", item.limitations, "No limitations recorded.");
      renderToolSources(card, item.sources);
      parent.appendChild(card);
    });
  }

  function renderToolSources(parent, sources) {
    var wrapper = document.createElement("div");
    wrapper.className = "field";

    var label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "Sources";
    wrapper.appendChild(label);

    if (!Array.isArray(sources) || sources.length === 0) {
      wrapper.appendChild(emptyBlock("No sources recorded."));
      parent.appendChild(wrapper);
      return;
    }

    var list = document.createElement("ul");
    list.className = "list";
    sources.forEach(function (source) {
      var item = document.createElement("li");
      var sourceParts = [];
      if (source.title) sourceParts.push(source.title);
      if (source.path) sourceParts.push(source.path);
      if (source.url) sourceParts.push(source.url);
      if (source.quote) sourceParts.push(source.quote);
      if (source.retrievedAt) sourceParts.push("retrieved " + formatDateTime(source.retrievedAt));
      item.textContent = sourceParts.length > 0 ? sourceParts.join(" / ") : formatStructuredValue(source);
      list.appendChild(item);
    });
    wrapper.appendChild(list);
    parent.appendChild(wrapper);
  }

  function renderRunCodexUsage() {
    var total = runCodexUsageTotal(state.run);
    var rows = leafCodexUsageRows(state.run && state.run.root);
    if (!total && rows.length === 0) {
      return;
    }

    var usage = section("Run Codex Usage");
    if (total) {
      var metrics = document.createElement("div");
      metrics.className = "mini-metrics";
      appendMiniMetric(metrics, "Total", formatCodexTokens(total));
      appendMiniMetric(metrics, "Input", formatNumber(total.inputTokens || 0));
      appendMiniMetric(metrics, "Cached", formatNumber(total.cachedInputTokens || 0));
      appendMiniMetric(metrics, "Output", formatNumber(total.outputTokens || 0));
      appendMiniMetric(metrics, "Reasoning", formatNumber(total.reasoningOutputTokens || 0));
      usage.appendChild(metrics);
    }

    if (rows.length > 0) {
      rows.forEach(function (row) {
        var card = document.createElement("div");
        card.className = "alt-card";

        var title = document.createElement("h4");
        title.className = "alt-title";
        title.textContent = row.label || row.nodeId;
        card.appendChild(title);

        appendKeyValue(card, "Node", row.nodeId);

        var rowMetrics = document.createElement("div");
        rowMetrics.className = "mini-metrics";
        appendMiniMetric(rowMetrics, "Total", formatCodexTokens(row));
        appendMiniMetric(rowMetrics, "Input", formatNumber(row.inputTokens || 0));
        appendMiniMetric(rowMetrics, "Cached", formatNumber(row.cachedInputTokens || 0));
        appendMiniMetric(rowMetrics, "Output", formatNumber(row.outputTokens || 0));
        appendMiniMetric(rowMetrics, "Reasoning", formatNumber(row.reasoningOutputTokens || 0));
        card.appendChild(rowMetrics);

        usage.appendChild(card);
      });
    }

    refs.tabContent.appendChild(usage);
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

      var layoutNode = {
        id: node.id,
        depth: fallbackDepth,
        x: MARGIN + fallbackDepth * (NODE_WIDTH + COLUMN_GAP),
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
          fromId: layoutNode.id,
          toId: child.id,
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

  function edgePath(edge) {
    var midX = edge.x1 + (edge.x2 - edge.x1) / 2;
    return "M " + edge.x1 + "," + edge.y1 + " C " + midX + "," + edge.y1 + " " + midX + "," + edge.y2 + " " + edge.x2 + "," + edge.y2;
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
    appendMiniMetric(
      metrics,
      "Relevance",
      typeof alternative.relevanceToIntent === "number" ? formatScore(alternative.relevanceToIntent) : "n/a",
    );
    alt.appendChild(metrics);

    appendKeyValue(alt, "ID", alternative.id || "Not recorded");
    appendField(alt, "Description", alternative.description || "No description recorded.");
    appendField(alt, "Rationale", alternative.rationale || "No rationale recorded.");
    return alt;
  }

  function appendScoreRow(parent, label, value) {
    var row = document.createElement("div");
    row.className = "score-row";

    var name = document.createElement("span");
    name.textContent = label;
    row.appendChild(name);

    var track = document.createElement("div");
    var fill = document.createElement("b");
    fill.className = "score-fill";
    fill.style.width = scorePercent(value) + "%";
    track.appendChild(fill);
    row.appendChild(track);

    var number = document.createElement("strong");
    number.textContent = formatScore(value);
    row.appendChild(number);

    parent.appendChild(row);
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
    chip.className = "meta-chip " + chipClassName(text);
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

  function appendStructuredObject(parent, value, emptyText) {
    if (!hasMeaningfulValue(value)) {
      parent.appendChild(emptyBlock(emptyText));
      return;
    }

    var pre = document.createElement("pre");
    pre.textContent = formatStructuredValue(value);
    parent.appendChild(pre);
  }

  function appendStructuredList(parent, label, values, emptyText) {
    var wrapper = document.createElement("div");
    wrapper.className = "field";

    var fieldLabel = document.createElement("div");
    fieldLabel.className = "field-label";
    fieldLabel.textContent = label;
    wrapper.appendChild(fieldLabel);

    if (!Array.isArray(values) || values.length === 0) {
      wrapper.appendChild(emptyBlock(emptyText));
      parent.appendChild(wrapper);
      return;
    }

    var list = document.createElement("ul");
    list.className = "list";
    values.forEach(function (value) {
      var item = document.createElement("li");
      item.textContent = typeof value === "string" ? value : formatStructuredValue(value);
      list.appendChild(item);
    });
    wrapper.appendChild(list);
    parent.appendChild(wrapper);
  }

  function buildAncestorTimeline(node, pathNodes) {
    var summaries = node && node.context && Array.isArray(node.context.ancestorSummaries)
      ? node.context.ancestorSummaries
      : [];
    if (summaries.length === 0) {
      return [];
    }

    var ancestors = Array.isArray(pathNodes) ? pathNodes.slice(0, -1) : [];
    return summaries.map(function (summary, index) {
      var ancestor = ancestors[index] || null;
      var intervention = ancestor && ancestor.humanIntervention ? ancestor.humanIntervention : null;
      var summaryText = String(summary || "");
      var isHumanRevision = Boolean(intervention && (
        summaryText.toLowerCase().indexOf("human revision") >= 0 ||
        (intervention.prompt && summaryText.indexOf(intervention.prompt) >= 0)
      ));

      return {
        summary: summaryText,
        label: ancestor ? ancestor.branchLabel || "root" : "Ancestor",
        nodeId: ancestor && ancestor.id ? ancestor.id : "",
        phase: ancestor && ancestor.phase ? ancestor.phase : "",
        status: ancestor && ancestor.status ? ancestor.status : "",
        timestamp: isHumanRevision && intervention ? intervention.createdAt : ancestor ? ancestor.updatedAt || ancestor.createdAt : undefined
      };
    });
  }

  function normalizeTimelineEntry(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return {
        summary: value.summary || value.text || "",
        label: value.label || "",
        nodeId: value.nodeId || "",
        phase: value.phase || "",
        status: value.status || "",
        timestamp: value.timestamp
      };
    }

    return {
      summary: String(value || ""),
      label: "",
      nodeId: "",
      phase: "",
      status: "",
      timestamp: undefined
    };
  }

  function appendTimelineOrEmpty(parent, values, emptyText) {
    if (!Array.isArray(values) || values.length === 0) {
      parent.appendChild(emptyBlock(emptyText));
      return;
    }

    var note = document.createElement("div");
    note.className = "timeline-note";
    note.textContent = "Oldest first";
    parent.appendChild(note);

    var list = document.createElement("ol");
    list.className = "timeline";
    values.forEach(function (value, index) {
      var entry = normalizeTimelineEntry(value);
      var item = document.createElement("li");
      item.className = "timeline-item";

      var marker = document.createElement("div");
      marker.className = "timeline-index";
      marker.textContent = String(index + 1);
      item.appendChild(marker);

      var card = document.createElement("div");
      card.className = "timeline-card";

      var label = document.createElement("div");
      label.className = "timeline-label";
      label.textContent = "Step " + String(index + 1) + " of " + String(values.length) + (entry.label ? " / " + entry.label : "");
      card.appendChild(label);

      var time = document.createElement("div");
      time.className = "timeline-time";
      time.textContent = formatDateTime(entry.timestamp);
      card.appendChild(time);

      var text = document.createElement("div");
      text.className = "timeline-text";
      splitSummaryParagraphs(entry.summary).forEach(function (paragraph) {
        var paragraphNode = document.createElement("p");
        paragraphNode.textContent = paragraph;
        text.appendChild(paragraphNode);
      });
      card.appendChild(text);

      item.appendChild(card);
      list.appendChild(item);
    });
    parent.appendChild(list);
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

  function hasMeaningfulValue(value) {
    if (value === undefined || value === null || value === "") {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return true;
  }

  function splitSummaryParagraphs(value) {
    var normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return ["Not recorded"];
    }

    var sentences = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
    if (!sentences || sentences.length <= 2) {
      return [normalized];
    }

    var paragraphs = [];
    for (var index = 0; index < sentences.length; index += 2) {
      paragraphs.push(sentences.slice(index, index + 2).join(" ").replace(/\s+/g, " ").trim());
    }
    return paragraphs;
  }

  function formatListValue(values) {
    return Array.isArray(values) && values.length > 0 ? values.join(", ") : "Not recorded";
  }

  function formatStructuredValue(value) {
    if (value === undefined || value === null) {
      return "Not recorded";
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
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

  function nodeClassName(node) {
    var classes = [
      "node-card",
      "node-status-" + classToken(node.status || "pending"),
      "node-phase-" + classToken(node.phase || "phase")
    ];

    if (isHumanRevision(node)) {
      classes.push("node-human-revision");
    }

    return classes.join(" ");
  }

  function isHumanRevision(node) {
    return Boolean(
      node &&
      ((node.humanIntervention && node.humanIntervention.action === "revise") ||
        (node.context && node.context.humanRevisionPrompt) ||
        String(node.branchLabel || "").toLowerCase().includes("human-revision") ||
        String(node.branchDescription || "").toLowerCase().includes("human revision"))
    );
  }

  function setStatusPill(element, text) {
    element.className = "status-pill " + statusClassName(text);
    element.textContent = text;
  }

  function chipClassName(text) {
    var value = String(text || "").toLowerCase();
    if (value.includes("best") || /^\\d+(\\.\\d+)?$/.test(value)) {
      return "score-chip";
    }
    if (isStatusValue(value)) {
      return "status-chip " + statusClassName(value);
    }
    return "";
  }

  function statusClassName(text) {
    var value = String(text || "").toLowerCase();
    if (value.includes("error")) {
      return "status-error";
    }
    if (value.includes("fail")) {
      return "status-failed";
    }
    if (value.includes("pruned") || value.includes("kill")) {
      return "status-pruned";
    }
    if (value.includes("paused") || value.includes("pending") || value.includes("no saved")) {
      return "status-paused";
    }
    if (value.includes("loading") || value.includes("running") || value.includes("executing") || value.includes("debating") || value.includes("branched")) {
      return "status-running";
    }
    if (value.includes("complete") || value.includes("score") || value.includes("consensus") || value.includes("loaded")) {
      return "status-completed";
    }
    return "status-running";
  }

  function isStatusValue(value) {
    return [
      "completed",
      "complete",
      "running",
      "failed",
      "paused",
      "pending",
      "debating",
      "branched",
      "consensus",
      "executing",
      "scored",
      "pruned"
    ].some(function (status) {
      return value.includes(status);
    });
  }

  function maxVisibleDepth() {
    if (!state.layout || !state.layout.nodes.length) {
      return 0;
    }
    return state.layout.nodes.reduce(function (max, node) {
      return Math.max(max, node.depth || 0);
    }, 0);
  }

  function countVisibleLeaves(node) {
    if (!node || (!state.showPruned && node.status === "pruned")) {
      return 0;
    }
    var children = Array.isArray(node.children) ? node.children.filter(function (child) {
      return state.showPruned || child.status !== "pruned";
    }) : [];
    if (children.length === 0) {
      return 1;
    }
    return children.reduce(function (total, child) {
      return total + countVisibleLeaves(child);
    }, 0);
  }

  function countAllNodes(node) {
    if (!node) {
      return 0;
    }
    var children = Array.isArray(node.children) ? node.children : [];
    return 1 + children.reduce(function (total, child) {
      return total + countAllNodes(child);
    }, 0);
  }

  function countToolRequests(node) {
    if (!node) {
      return 0;
    }
    var children = Array.isArray(node.children) ? node.children : [];
    return (Array.isArray(node.toolRequests) ? node.toolRequests.length : 0) + children.reduce(function (total, child) {
      return total + countToolRequests(child);
    }, 0);
  }

  function countToolEvidence(node) {
    if (!node) {
      return 0;
    }
    var children = Array.isArray(node.children) ? node.children : [];
    var context = node.context || {};
    return (Array.isArray(context.toolEvidence) ? context.toolEvidence.length : 0) + children.reduce(function (total, child) {
      return total + countToolEvidence(child);
    }, 0);
  }

  function bestScore(node) {
    if (!node || (!state.showPruned && node.status === "pruned")) {
      return undefined;
    }
    var score = node.fitness && typeof node.fitness.composite === "number"
      ? node.fitness.composite
      : node.score && typeof node.score.composite === "number"
        ? node.score.composite
        : undefined;
    var children = Array.isArray(node.children) ? node.children : [];
    children.forEach(function (child) {
      var childScore = bestScore(child);
      if (typeof childScore === "number" && (typeof score !== "number" || childScore > score)) {
        score = childScore;
      }
    });
    return score;
  }

  function runCodexUsageTotal(run) {
    if (!run || !run.root) {
      return undefined;
    }
    if (run.codexUsageTotal) {
      return normalizeCodexUsage(run.codexUsageTotal);
    }
    var rows = leafCodexUsageRows(run.root);
    if (rows.length === 0) {
      return undefined;
    }
    return sumCodexUsage(rows);
  }

  function leafCodexUsageRows(root) {
    var rows = [];

    function visit(node) {
      if (!node) {
        return;
      }
      var children = Array.isArray(node.children) ? node.children : [];
      if (children.length === 0) {
        var usage = node.executionResult && node.executionResult.usage;
        if (usage) {
          rows.push(Object.assign({
            nodeId: node.id || "",
            label: node.branchLabel || node.id || "leaf"
          }, normalizeCodexUsage(usage)));
        }
        return;
      }
      children.forEach(visit);
    }

    visit(root);
    return rows;
  }

  function sumCodexUsage(usages) {
    return usages.reduce(function (total, usage) {
      return {
        inputTokens: total.inputTokens + (usage.inputTokens || 0),
        cachedInputTokens: total.cachedInputTokens + (usage.cachedInputTokens || 0),
        outputTokens: total.outputTokens + (usage.outputTokens || 0),
        reasoningOutputTokens: total.reasoningOutputTokens + (usage.reasoningOutputTokens || 0)
      };
    }, normalizeCodexUsage());
  }

  function normalizeCodexUsage(usage) {
    usage = usage || {};
    return {
      inputTokens: Number(usage.inputTokens) || 0,
      cachedInputTokens: Number(usage.cachedInputTokens) || 0,
      outputTokens: Number(usage.outputTokens) || 0,
      reasoningOutputTokens: Number(usage.reasoningOutputTokens) || 0
    };
  }

  function totalCodexTokens(usage) {
    usage = normalizeCodexUsage(usage);
    return usage.inputTokens + usage.outputTokens + usage.reasoningOutputTokens;
  }

  function scorePercent(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0;
    }
    var normalized = value <= 1 ? value * 100 : value <= 10 ? value * 10 : value;
    return Math.max(0, Math.min(100, normalized));
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

  function formatPercent(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "n/a";
    }
    return Math.round(value * 100) + "%";
  }

  function formatNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "0";
    }
    return new Intl.NumberFormat().format(value);
  }

  function formatCodexTokens(usage) {
    return formatNumber(totalCodexTokens(usage)) + " tok";
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }
}`;
}
