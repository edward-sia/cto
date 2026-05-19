import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("package boundaries", () => {
  it("keeps provider-package live tests independent from CTO src", () => {
    const liveTestPath = fileURLToPath(new URL("../live-tests/live-providers.test.ts", import.meta.url));
    const liveTest = readFileSync(liveTestPath, "utf8");

    expect(liveTest).not.toContain("../../../src/");
  });
});
