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
});
