import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: [
      "packages/llm-providers/live-tests/**/*.test.ts",
      "tests/providers/live-cto-provider.test.ts",
    ],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    passWithNoTests: false,
  },
});
