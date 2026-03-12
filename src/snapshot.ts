import { NodeSnapshot, Snapshot } from "./types";

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return "[]";
  }
}

function extractFills(node: SceneNode): string {
  if ("fills" in node) {
    const fills = node.fills;
    if (fills === figma.mixed) return '"mixed"';
    return safeStringify(fills);
  }
  return "[]";
}

function extractStrokes(node: SceneNode): string {
  if ("strokes" in node) {
    return safeStringify(node.strokes);
  }
  return "[]";
}

function extractEffects(node: SceneNode): string {
  if ("effects" in node) {
    return safeStringify(node.effects);
  }
  return "[]";
}

function extractCornerRadius(node: SceneNode): number | string {
  if ("cornerRadius" in node) {
    const r = (node as any).cornerRadius;
    if (r === figma.mixed) return "mixed";
    return typeof r === "number" ? r : 0;
  }
  return 0;
}

function safeMixed(value: any): string {
  if (value === figma.mixed) return "mixed";
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return safeStringify(value);
  return String(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function serializeNode(node: SceneNode): NodeSnapshot {
  const n = node as any;

  const snap: NodeSnapshot = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: false,
    x: round2(node.x),
    y: round2(node.y),
    width: round2(node.width),
    height: round2(node.height),
    rotation: "rotation" in n ? round2(n.rotation) : 0,
    opacity: "opacity" in n ? n.opacity : 1,
    blendMode: "PASS_THROUGH",
    isMask: false,
    fills: extractFills(node),
    strokes: extractStrokes(node),
    effects: extractEffects(node),
    strokeWeight: "strokeWeight" in n ? safeMixed(n.strokeWeight) : "0",
    strokeAlign: "",
    strokeCap: "",
    strokeJoin: "",
    dashPattern: "[]",
    cornerRadius: extractCornerRadius(node),
    cornerSmoothing: 0,
  };

  // Text-specific properties
  if (node.type === "TEXT") {
    const t = node as TextNode;
    const chars = t.characters;
    snap.characters = chars.length > 500 ? chars.substring(0, 500) + "…" : chars;
    snap.fontSize = t.fontSize === figma.mixed ? "mixed" : t.fontSize;

    const fontName = t.fontName;
    snap.fontName = fontName === figma.mixed ? "mixed" : `${fontName.family} ${fontName.style}`;

    const fontWeight = t.fontWeight;
    snap.fontWeight = fontWeight === figma.mixed ? undefined : (fontWeight as number);

    snap.textAlignHorizontal = t.textAlignHorizontal;

    const lh = t.lineHeight;
    snap.lineHeight = lh === figma.mixed ? "mixed" : safeStringify(lh);

    const ls = t.letterSpacing;
    snap.letterSpacing = ls === figma.mixed ? "mixed" : safeStringify(ls);

    const td = t.textDecoration;
    snap.textDecoration = td === figma.mixed ? "mixed" : td;
  }

  // Auto-layout — only the key properties
  if ("layoutMode" in n) {
    snap.layoutMode = n.layoutMode;
    if (n.layoutMode !== "NONE") {
      snap.itemSpacing = n.itemSpacing;
      snap.paddingTop = n.paddingTop;
      snap.paddingRight = n.paddingRight;
      snap.paddingBottom = n.paddingBottom;
      snap.paddingLeft = n.paddingLeft;
    }
  }

  // Children IDs
  if ("children" in node) {
    snap.children = (node as ChildrenMixin & SceneNode).children.map(
      (c: SceneNode) => c.id
    );
  }

  return snap;
}

const MAX_NODES = 5000;

function countDescendants(node: SceneNode): number {
  let count = 1;
  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      count += countDescendants(child as SceneNode);
    }
  }
  return count;
}

function walkTree(
  node: SceneNode,
  nodes: Record<string, NodeSnapshot>,
  limit: number
): void {
  if (Object.keys(nodes).length >= limit) return;
  nodes[node.id] = serializeNode(node);

  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      if (Object.keys(nodes).length >= limit) return;
      walkTree(child as SceneNode, nodes, limit);
    }
  }
}

export interface CaptureResult {
  snapshot: Snapshot | null;
  warning: string | null;
  error: string | null;
}

export function captureSnapshot(node: SceneNode, label: string): CaptureResult {
  // Pre-check node count
  const totalNodes = countDescendants(node);

  if (totalNodes > MAX_NODES) {
    return {
      snapshot: null,
      warning: null,
      error: `This selection has ${totalNodes.toLocaleString()} nodes — too large to capture. Maximum is ${MAX_NODES.toLocaleString()} nodes. Try selecting a smaller frame or component.`,
    };
  }

  const nodes: Record<string, NodeSnapshot> = {};
  walkTree(node, nodes, MAX_NODES);

  const snapshot: Snapshot = {
    id: generateId(),
    label,
    timestamp: Date.now(),
    rootNodeId: node.id,
    rootNodeName: node.name,
    nodeCount: Object.keys(nodes).length,
    nodes,
  };

  // Estimate size before saving
  const estimatedSize = JSON.stringify(snapshot).length;
  const sizeMB = (estimatedSize / (1024 * 1024)).toFixed(1);
  const warning = estimatedSize > 500000
    ? `Large snapshot (${sizeMB} MB, ${snapshot.nodeCount} nodes). If save fails, try a smaller selection.`
    : null;

  return { snapshot, warning, error: null };
}
