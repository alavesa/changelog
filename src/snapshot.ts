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

function serializeNode(node: SceneNode): NodeSnapshot {
  const snap: NodeSnapshot = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    x: Math.round(node.x * 100) / 100,
    y: Math.round(node.y * 100) / 100,
    width: Math.round(node.width * 100) / 100,
    height: Math.round(node.height * 100) / 100,
    opacity: "opacity" in node ? (node as any).opacity : 1,
    fills: extractFills(node),
    strokes: extractStrokes(node),
    effects: extractEffects(node),
    cornerRadius: extractCornerRadius(node),
  };

  // Text-specific properties
  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    snap.characters = textNode.characters;

    const fontSize = textNode.fontSize;
    snap.fontSize = fontSize === figma.mixed ? "mixed" : fontSize;

    const fontName = textNode.fontName;
    if (fontName === figma.mixed) {
      snap.fontName = "mixed";
    } else {
      snap.fontName = `${fontName.family} ${fontName.style}`;
    }

    const fontWeight = textNode.fontWeight;
    snap.fontWeight = fontWeight === figma.mixed ? undefined : (fontWeight as number);
  }

  // Layout-specific (auto-layout frames)
  if ("layoutMode" in node) {
    const frame = node as FrameNode;
    snap.layoutMode = frame.layoutMode;
    if (frame.layoutMode !== "NONE") {
      snap.itemSpacing = frame.itemSpacing;
      snap.paddingTop = frame.paddingTop;
      snap.paddingRight = frame.paddingRight;
      snap.paddingBottom = frame.paddingBottom;
      snap.paddingLeft = frame.paddingLeft;
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

function walkTree(
  node: SceneNode,
  nodes: Record<string, NodeSnapshot>
): void {
  nodes[node.id] = serializeNode(node);

  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      walkTree(child as SceneNode, nodes);
    }
  }
}

export function captureSnapshot(node: SceneNode, label: string): Snapshot {
  const nodes: Record<string, NodeSnapshot> = {};
  walkTree(node, nodes);

  return {
    id: generateId(),
    label,
    timestamp: Date.now(),
    rootNodeId: node.id,
    rootNodeName: node.name,
    nodeCount: Object.keys(nodes).length,
    nodes,
  };
}
