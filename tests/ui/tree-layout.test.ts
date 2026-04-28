import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src/types/index.js";
import { layoutTree } from "../../src/ui/tree-layout.js";

function node(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: overrides.id ?? "node-root",
    parentId: overrides.parentId ?? null,
    depth: overrides.depth ?? 0,
    phase: overrides.phase ?? "requirements",
    status: overrides.status ?? "pending",
    context: overrides.context ?? {
      originalIntent: "Build a test app",
      ancestorSummaries: [],
    },
    children: overrides.children ?? [],
    branchLabel: overrides.branchLabel ?? "",
    branchDescription: overrides.branchDescription ?? "",
    createdAt: overrides.createdAt ?? "2026-04-28T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T00:00:00.000Z",
    debate: overrides.debate,
    executionResult: overrides.executionResult,
    score: overrides.score,
  };
}

describe("layoutTree", () => {
  it("lays out a consensus chain left to right", () => {
    const grandchild = node({ id: "node-c", parentId: "node-b", depth: 2, branchLabel: "leaf" });
    const child = node({ id: "node-b", parentId: "node-a", depth: 1, branchLabel: "consensus", children: [grandchild] });
    const root = node({ id: "node-a", children: [child] });

    const layout = layoutTree(root, { showPruned: true });

    expect(layout.nodes.map((n) => n.id)).toEqual(["node-a", "node-b", "node-c"]);
    expect(layout.edges).toEqual([
      { id: "node-a->node-b", fromId: "node-a", toId: "node-b", x1: 260, y1: 96, x2: 380, y2: 96 },
      { id: "node-b->node-c", fromId: "node-b", toId: "node-c", x1: 580, y1: 96, x2: 700, y2: 96 },
    ]);
    expect(layout.width).toBe(960);
    expect(layout.height).toBe(192);
  });

  it("stacks branching leaves and centers the parent", () => {
    const left = node({ id: "node-left", parentId: "node-root", depth: 1, branchLabel: "REST" });
    const right = node({ id: "node-right", parentId: "node-root", depth: 1, branchLabel: "GraphQL" });
    const root = node({ id: "node-root", children: [left, right] });

    const layout = layoutTree(root, { showPruned: true });

    expect(layout.nodes.find((n) => n.id === "node-root")?.y).toBe(110);
    expect(layout.nodes.find((n) => n.id === "node-left")?.y).toBe(60);
    expect(layout.nodes.find((n) => n.id === "node-right")?.y).toBe(160);
  });

  it("hides pruned nodes when requested", () => {
    const kept = node({ id: "node-kept", parentId: "node-root", depth: 1, branchLabel: "Kept" });
    const pruned = node({ id: "node-pruned", parentId: "node-root", depth: 1, status: "pruned", branchLabel: "Pruned" });
    const root = node({ id: "node-root", children: [kept, pruned] });

    const layout = layoutTree(root, { showPruned: false });

    expect(layout.nodes.map((n) => n.id)).toEqual(["node-root", "node-kept"]);
    expect(layout.edges.map((e) => e.id)).toEqual(["node-root->node-kept"]);
  });
});
