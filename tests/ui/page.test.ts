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
