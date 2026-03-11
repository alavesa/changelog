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
    locked: node.locked,
    x: round2(node.x),
    y: round2(node.y),
    width: round2(node.width),
    height: round2(node.height),
    rotation: "rotation" in n ? round2(n.rotation) : 0,
    opacity: "opacity" in n ? n.opacity : 1,
    blendMode: "blendMode" in n ? n.blendMode : "PASS_THROUGH",
    isMask: "isMask" in n ? n.isMask : false,
    fills: extractFills(node),
    strokes: extractStrokes(node),
    effects: extractEffects(node),
    strokeWeight: "strokeWeight" in n ? safeMixed(n.strokeWeight) : "0",
    strokeAlign: "strokeAlign" in n ? n.strokeAlign : "",
    strokeCap: "strokeCap" in n ? safeMixed(n.strokeCap) : "",
    strokeJoin: "strokeJoin" in n ? safeMixed(n.strokeJoin) : "",
    dashPattern: "dashPattern" in n ? safeStringify(n.dashPattern) : "[]",
    cornerRadius: extractCornerRadius(node),
    cornerSmoothing: "cornerSmoothing" in n ? n.cornerSmoothing : 0,
  };

  // Individual corner radii
  if ("topLeftRadius" in n) {
    snap.topLeftRadius = round2(n.topLeftRadius);
    snap.topRightRadius = round2(n.topRightRadius);
    snap.bottomLeftRadius = round2(n.bottomLeftRadius);
    snap.bottomRightRadius = round2(n.bottomRightRadius);
  }

  // Individual stroke weights
  if ("strokeTopWeight" in n) {
    snap.strokeTopWeight = round2(n.strokeTopWeight);
    snap.strokeBottomWeight = round2(n.strokeBottomWeight);
    snap.strokeLeftWeight = round2(n.strokeLeftWeight);
    snap.strokeRightWeight = round2(n.strokeRightWeight);
  }

  // Constraints
  if ("constraints" in n) {
    snap.constraints = safeStringify(n.constraints);
  }

  // Clips content (frames)
  if ("clipsContent" in n) {
    snap.clipsContent = n.clipsContent;
  }

  // Text-specific properties
  if (node.type === "TEXT") {
    const t = node as TextNode;
    snap.characters = t.characters;
    snap.fontSize = t.fontSize === figma.mixed ? "mixed" : t.fontSize;

    const fontName = t.fontName;
    snap.fontName = fontName === figma.mixed ? "mixed" : `${fontName.family} ${fontName.style}`;

    const fontWeight = t.fontWeight;
    snap.fontWeight = fontWeight === figma.mixed ? undefined : (fontWeight as number);

    snap.textAlignHorizontal = t.textAlignHorizontal;
    snap.textAlignVertical = t.textAlignVertical;
    snap.textAutoResize = t.textAutoResize;

    const lh = t.lineHeight;
    snap.lineHeight = lh === figma.mixed ? "mixed" : safeStringify(lh);

    const ls = t.letterSpacing;
    snap.letterSpacing = ls === figma.mixed ? "mixed" : safeStringify(ls);

    const td = t.textDecoration;
    snap.textDecoration = td === figma.mixed ? "mixed" : td;

    const tc = t.textCase;
    snap.textCase = tc === figma.mixed ? "mixed" : tc;

    snap.paragraphIndent = t.paragraphIndent;
    snap.paragraphSpacing = t.paragraphSpacing;
  }

  // Layout-specific (auto-layout frames)
  if ("layoutMode" in n) {
    snap.layoutMode = n.layoutMode;
    snap.layoutWrap = n.layoutWrap;
    snap.primaryAxisSizingMode = n.primaryAxisSizingMode;
    snap.counterAxisSizingMode = n.counterAxisSizingMode;
    snap.primaryAxisAlignItems = n.primaryAxisAlignItems;
    snap.counterAxisAlignItems = n.counterAxisAlignItems;
    if (n.layoutMode !== "NONE") {
      snap.itemSpacing = n.itemSpacing;
      snap.counterAxisSpacing = n.counterAxisSpacing === null ? "auto" : n.counterAxisSpacing;
      snap.paddingTop = n.paddingTop;
      snap.paddingRight = n.paddingRight;
      snap.paddingBottom = n.paddingBottom;
      snap.paddingLeft = n.paddingLeft;
    }
  }

  // Layout sizing (available on nodes in auto-layout)
  if ("layoutSizingHorizontal" in n) {
    snap.layoutSizingHorizontal = n.layoutSizingHorizontal;
    snap.layoutSizingVertical = n.layoutSizingVertical;
  }

  // Auto-layout child properties
  if ("layoutAlign" in n) {
    snap.layoutAlign = n.layoutAlign;
    snap.layoutGrow = n.layoutGrow;
  }
  if ("layoutPositioning" in n) {
    snap.layoutPositioning = n.layoutPositioning;
  }

  // Min/max dimensions
  if ("minWidth" in n) {
    snap.minWidth = n.minWidth === null ? "none" : n.minWidth;
    snap.maxWidth = n.maxWidth === null ? "none" : n.maxWidth;
    snap.minHeight = n.minHeight === null ? "none" : n.minHeight;
    snap.maxHeight = n.maxHeight === null ? "none" : n.maxHeight;
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
