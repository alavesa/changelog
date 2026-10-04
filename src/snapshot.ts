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

// Collect raw token references (variable/style IDs) from a node.
// Refs are resolved to human-readable names in resolveTokenNames after the
// tree walk, so name lookups can be batched and cached across nodes.
function extractTokenRefs(node: SceneNode): Record<string, string> | undefined {
  const n = node as any;
  const refs: Record<string, string> = {};

  const bv = n.boundVariables;
  if (bv) {
    for (const key of Object.keys(bv)) {
      const val = bv[key];
      if (Array.isArray(val)) {
        const ids: string[] = [];
        for (const alias of val) {
          if (alias && typeof alias.id === "string") ids.push("var:" + alias.id);
        }
        if (ids.length > 0) refs[key] = ids.join("|");
      } else if (val && typeof val.id === "string") {
        refs[key] = "var:" + val.id;
      }
    }
  }

  const styleProps: Array<[string, string]> = [
    ["fillStyleId", "fillStyle"],
    ["strokeStyleId", "strokeStyle"],
    ["effectStyleId", "effectStyle"],
    ["textStyleId", "textStyle"],
  ];
  for (const [prop, key] of styleProps) {
    if (prop in n) {
      const id = n[prop];
      if (typeof id === "string" && id !== "") refs[key] = "style:" + id;
    }
  }

  return Object.keys(refs).length > 0 ? refs : undefined;
}

// Format a resolved variable value for the token string. Colors become hex,
// primitives become plain strings; unsupported shapes are dropped.
function formatVariableValue(value: unknown, type: string): string | null {
  if (type === "COLOR" && value && typeof value === "object") {
    const c = value as { r: number; g: number; b: number; a?: number };
    const to255 = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
    const hex =
      "#" +
      [to255(c.r), to255(c.g), to255(c.b)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    const a = c.a === undefined ? 1 : c.a;
    return a < 1 ? hex + to255(a).toString(16).padStart(2, "0") : hex;
  }
  if (type === "FLOAT" || type === "STRING" || type === "BOOLEAN") {
    return String(value);
  }
  return null;
}

// Resolve raw token refs (var:<id> / style:<id>) into names, in place.
// Variables also get their value resolved for the consuming node appended as
// "name = value" — so editing a token's VALUE (not just rebinding) is
// detected as a change. Unresolvable refs (deleted variables, remote styles
// that fail to load) are dropped rather than stored as opaque IDs.
async function resolveTokenNames(
  nodes: Record<string, NodeSnapshot>,
  liveNodes: Record<string, SceneNode>
): Promise<void> {
  const varCache = new Map<string, Variable | null>();
  const styleCache = new Map<string, string | null>();

  async function getVariable(id: string): Promise<Variable | null> {
    const cached = varCache.get(id);
    if (cached !== undefined) return cached;
    let v: Variable | null = null;
    try {
      v = await figma.variables.getVariableByIdAsync(id);
    } catch (e) {
      v = null;
    }
    varCache.set(id, v);
    return v;
  }

  async function getStyleName(id: string): Promise<string | null> {
    const cached = styleCache.get(id);
    if (cached !== undefined) return cached;
    let name: string | null = null;
    try {
      const s = await figma.getStyleByIdAsync(id);
      name = s ? s.name : null;
    } catch (e) {
      name = null;
    }
    styleCache.set(id, name);
    return name;
  }

  for (const nodeId of Object.keys(nodes)) {
    const tokens = nodes[nodeId].tokens;
    if (!tokens) continue;
    const liveNode = liveNodes[nodeId];
    for (const key of Object.keys(tokens)) {
      const names: string[] = [];
      for (const ref of tokens[key].split("|")) {
        if (ref.indexOf("var:") === 0) {
          const v = await getVariable(ref.slice(4));
          if (!v) continue;
          let label = v.name;
          if (liveNode) {
            try {
              const resolved = v.resolveForConsumer(liveNode);
              const fv = formatVariableValue(resolved.value, resolved.resolvedType);
              if (fv !== null) label += " = " + fv;
            } catch (e) {
              // value resolution is best-effort; keep the name
            }
          }
          names.push(label);
        } else if (ref.indexOf("style:") === 0) {
          const name = await getStyleName(ref.slice(6));
          if (name) names.push(name);
        }
      }
      if (names.length > 0) {
        tokens[key] = names.join(", ");
      } else {
        delete tokens[key];
      }
    }
    if (Object.keys(tokens).length === 0) {
      delete nodes[nodeId].tokens;
    }
  }
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

  const tokenRefs = extractTokenRefs(node);
  if (tokenRefs) {
    snap.tokens = tokenRefs;
  }

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
  liveNodes: Record<string, SceneNode>,
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
    const snap = serializeNode(node);
    nodes[node.id] = snap;
    // Keep a live reference only for nodes with token bindings — needed to
    // resolve variable values per consumer after the walk.
    if (snap.tokens) liveNodes[node.id] = node;
    counter.count++;
  } catch (e) {
    console.warn(`Failed to serialize node ${node.id} (${node.name}):`, e);
    return false;
  }

  if ("children" in node) {
    for (const child of (node as ChildrenMixin & SceneNode).children) {
      if (walkTree(child as SceneNode, nodes, liveNodes, limit, counter, depth + 1)) return true;
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

export async function captureSnapshot(node: SceneNode, label: string): Promise<CaptureResult> {
  const nodes: Record<string, NodeSnapshot> = {};
  const liveNodes: Record<string, SceneNode> = {};
  const counter = { count: 0 };
  const hitLimit = walkTree(node, nodes, liveNodes, MAX_NODES, counter, 0);

  if (hitLimit) {
    return {
      snapshot: null,
      warning: null,
      error: `This selection has more than ${MAX_NODES.toLocaleString()} nodes — too large to capture. Try selecting a smaller frame or component.`,
    };
  }

  await resolveTokenNames(nodes, liveNodes);

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
