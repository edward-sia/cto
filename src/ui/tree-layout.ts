import type { TreeNode, NodeStatus } from "../types/index.js";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;
const COLUMN_GAP = 120;
const ROW_GAP = 28;
const MARGIN = 60;

export interface TreeLayoutOptions {
  showPruned: boolean;
}

export interface LayoutNode {
  id: string;
  parentId: string | null;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: NodeStatus;
  branchLabel: string;
  branchDescription: string;
}

export interface LayoutEdge {
  id: string;
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export function layoutTree(root: TreeNode, options: TreeLayoutOptions): TreeLayout {
  const nodesById = new Map<string, LayoutNode>();
  let nextLeafY = MARGIN;

  function visibleChildren(node: TreeNode): TreeNode[] {
    return node.children.filter((child) => options.showPruned || child.status !== "pruned");
  }

  function placeNode(node: TreeNode, layoutDepth: number): LayoutNode {
    const children = visibleChildren(node);
    const childLayouts = children.map((child) => placeNode(child, layoutDepth + 1));
    const y =
      childLayouts.length > 0
        ? (childLayouts[0].y + childLayouts[childLayouts.length - 1].y) / 2
        : nextLeafY;

    if (childLayouts.length === 0) {
      nextLeafY += NODE_HEIGHT + ROW_GAP;
    }

    const layoutNode: LayoutNode = {
      id: node.id,
      parentId: node.parentId,
      depth: layoutDepth,
      x: MARGIN + layoutDepth * (NODE_WIDTH + COLUMN_GAP),
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      status: node.status,
      branchLabel: node.branchLabel,
      branchDescription: node.branchDescription,
    };

    nodesById.set(node.id, layoutNode);
    return layoutNode;
  }

  if (!options.showPruned && root.status === "pruned") {
    return { nodes: [], edges: [], width: MARGIN, height: MARGIN };
  }

  placeNode(root, 0);

  const nodes = [...nodesById.values()].sort((a, b) => a.depth - b.depth || a.y - b.y);
  const edges = nodes.flatMap((parent) =>
    visibleChildren(findNode(root, parent.id) ?? root).flatMap((child) => {
      const childLayout = nodesById.get(child.id);

      if (!childLayout) {
        return [];
      }

      return {
        id: `${parent.id}->${child.id}`,
        fromId: parent.id,
        toId: child.id,
        x1: parent.x + NODE_WIDTH,
        y1: parent.y + NODE_HEIGHT / 2,
        x2: childLayout.x,
        y2: childLayout.y + NODE_HEIGHT / 2,
      };
    }),
  );

  const width = Math.max(...nodes.map((node) => node.x + NODE_WIDTH)) + MARGIN;
  const height = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT)) + MARGIN;

  return { nodes, edges, width, height };
}

function findNode(root: TreeNode, id: string): TreeNode | undefined {
  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const match = findNode(child, id);

    if (match) {
      return match;
    }
  }

  return undefined;
}
