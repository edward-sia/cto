import { describe, expect, it } from "vitest";
import { renderUiPage } from "../../src/ui/page.js";

describe("renderUiPage", () => {
  it("emits parseable browser JavaScript for the live monitor", () => {
    const html = renderUiPage({ initialRunId: "run-live" });
    const script = html.match(/<script>([\s\S]+)<\/script>/)?.[1];

    expect(script).toContain("EventSource");
    expect(script).toContain("human-review");
    expect(() => new Function(script)).not.toThrow();
  });

  it("includes saved-state blind spot sections in the browser UI script", () => {
    const html = renderUiPage({ initialRunId: "run-live" });

    expect(html).toContain("Run Overview");
    expect(html).toContain("Model Routing");
    expect(html).toContain("Intent Decomposition");
    expect(html).toContain("Intent Dossier");
    expect(html).toContain("Compact Debate State");
    expect(html).toContain("Context Updates");
    expect(html).toContain("Ranked Results");
    expect(html).toContain("Evidence");
    expect(html).toContain("Verification Results");
    expect(html).toContain("Tool Requests");
    expect(html).toContain("Tool Evidence");
    expect(html).toContain("renderToolEvidence");
    expect(html).toContain("renderToolSources");
  });

  it("includes a chronological timeline treatment for ancestor summaries", () => {
    const html = renderUiPage({ initialRunId: "run-live" });

    expect(html).toContain("buildAncestorTimeline");
    expect(html).toContain("appendTimelineOrEmpty");
    expect(html).toContain("Oldest first");
    expect(html).toContain("Step \" + String(index + 1)");
    expect(html).toContain("timeline-time");
    expect(html).toContain("formatDateTime(entry.timestamp)");
  });

  it("keeps browser tree edges tied to their parent and child nodes with one connector style", () => {
    const html = renderUiPage({ initialRunId: "run-live" });

    expect(html).toContain('fromId: layoutNode.id');
    expect(html).toContain('toId: child.id');
    expect(html).toContain('edge.x1 + "," + edge.y1');
    expect(html).toContain('underlay.setAttribute("class", "edge edge-underlay")');
    expect(html).toContain('path.setAttribute("class", "edge")');
    expect(html).toMatch(/\.edge\.edge-underlay\s*\{[^}]*stroke-dasharray: 8 10;/);
    expect(html).not.toContain(".edge-status-consensus");
    expect(html).not.toContain("edge-human-revision");
  });
});
