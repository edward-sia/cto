import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const testRunRoot = mkdtempSync(join(tmpdir(), "cto-vitest-"));
const originalStoreDir = process.env.CAMBRIAN_TREE_STORE_DIR;

process.env.CAMBRIAN_TREE_STORE_DIR = join(testRunRoot, "runs");

afterAll(() => {
  if (originalStoreDir === undefined) {
    delete process.env.CAMBRIAN_TREE_STORE_DIR;
  } else {
    process.env.CAMBRIAN_TREE_STORE_DIR = originalStoreDir;
  }
  rmSync(testRunRoot, { recursive: true, force: true });
});
