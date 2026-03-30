import { NodeSnapshot, Snapshot } from "./types";

let _idCounter = 0;

function generateId(): string {
  _idCounter++;
  const part1 = Date.now().toString(36);
  const part2 = _idCounter.toString(36).padStart(4, '0');
  const part3 = Math.random().toString(36).slice(2);
  return (part1 + part2 + part3).slice(0, 16);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return "null";
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
    locked: 'locked' in n ? n.locked : false,
    x: round2(node.x),
    y: round2(node.y),
    width: round2(node.width),
    height: round2(node.height),
    rotation: "rotation" in n ? round2(n.rotation) : 0,
    opacity: "opacity" in n ? n.opacity : 1,
    blendMode: 'blendMode' in n ? n.blendMode : 'PASS_THROUGH',
    isMask: 'isMask' in n ? n.isMask : false,
    fills: extractFills(node),
    strokes: extractStrokes(node),
    effects: extractEffects(node),
    strokeWeight: "strokeWeight" in n ? safeMixed(n.strokeWeight) : "0",
    strokeAlign: 'strokeAlign' in n ? n.strokeAlign : '',
    strokeCap: 'strokeCap' in n ? safeMixed(n.strokeCap) : '',
    strokeJoin: 'strokeJoin' in n ? n.strokeJoin : '',
    dashPattern: 'dashPattern' in n ? safeStringify(n.dashPattern) : '[]',
    cornerRadius: extractCornerRadius(node),
    cornerSmoothing: 'cornerSmoothing' in n ? n.cornerSmoothing : 0,
  };

  // Text-specific properties
  if (node.type === "TEXT") {
    const t = node as TextNode;
    const chars = t.characters;
    snap.characters = chars.length > 500 ? [...chars].slice(0, 500).join('') + "…" : chars;
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

const MAX_DEPTH = 500;

function walkTree(
  node: SceneNode,
  nodes: Record<string, NodeSnapshot>,
  limit: number,
  counter: { count: number },
  depth: number
): boolean {
  if (counter.count >= limit) return true;
  if (depth > MAX_DEPTH) {
    console.warn(`walkTree: max depth (${MAX_DEPTH}) reached at node ${node.id} (${node.name})`);
    return false;
  }
  try {
    nodes[node.id] = serializeNode(node);
    counter.count++;
  } catch (e) {
    console.warn(`Failed to serialize node ${node.id} (${node.name}):`, e);
    return false;
  }

  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      if (walkTree(child as SceneNode, nodes, limit, counter, depth + 1)) return true;
    }
  }
  return false;
}

export interface CaptureResult {
  snapshot: Snapshot | null;
  warning: string | null;
  error: string | null;
}

export async function captureThumbnail(node: SceneNode): Promise<string | null> {
  try {
    const maxDim = Math.max(node.width, node.height);
    const scale = maxDim > 512 ? 512 / maxDim : 1;

    const bytes = await (node as any).exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });

    const base64 = figma.base64Encode(bytes);
    return "data:image/png;base64," + base64;
  } catch (e) {
    console.warn("Thumbnail capture failed:", e);
    return null;
  }
}

export function captureSnapshot(node: SceneNode, label: string): CaptureResult {
  const nodes: Record<string, NodeSnapshot> = {};
  const counter = { count: 0 };
  const hitLimit = walkTree(node, nodes, MAX_NODES, counter, 0);

  if (hitLimit) {
    return {
      snapshot: null,
      warning: null,
      error: `This selection has more than ${MAX_NODES.toLocaleString()} nodes — too large to capture. Try selecting a smaller frame or component.`,
    };
  }

  const snapshot: Snapshot = {
    id: generateId(),
    label,
    timestamp: Date.now(),
    rootNodeId: node.id,
    rootNodeName: node.name,
    nodeCount: counter.count,
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
