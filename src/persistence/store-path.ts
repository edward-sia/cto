import { join } from "node:path";

export const STORE_DIR = ".cambrian-tree";
export const STORE_DIR_ENV = "CAMBRIAN_TREE_STORE_DIR";

export function resolveStoreDir(baseDir?: string): string {
  return baseDir ?? process.env[STORE_DIR_ENV] ?? join(process.cwd(), STORE_DIR);
}
