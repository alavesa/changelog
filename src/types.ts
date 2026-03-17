export interface NodeSnapshot {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  blendMode: string;
  isMask: boolean;
  // Fills & strokes
  fills: string;
  strokes: string;
  effects: string;
  strokeWeight: number | string;
  strokeAlign: string;
  strokeCap: string;
  strokeJoin: string;
  dashPattern: string;
  // Individual stroke weights
  strokeTopWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  strokeRightWeight?: number;
  // Corner radius
  cornerRadius: number | string;
  cornerSmoothing: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  // Constraints
  constraints?: string;
  clipsContent?: boolean;
  // Text-specific
  characters?: string;
  fontSize?: number | string;
  fontName?: string;
  fontWeight?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textAutoResize?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textDecoration?: string;
  textCase?: string;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  // Layout-specific
  layoutMode?: string;
  layoutWrap?: string;
  itemSpacing?: number;
  counterAxisSpacing?: number | string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  // Auto-layout child properties
  layoutAlign?: string;
  layoutGrow?: number;
  layoutPositioning?: string;
  // Min/max dimensions
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  // Children IDs only
  children?: string[];
}

export interface Snapshot {
  id: string;
  label: string;
  annotation?: string;
  timestamp: number;
  rootNodeId: string;
  rootNodeName: string;
  nodeCount: number;
  nodes: Record<string, NodeSnapshot>;
}

export interface SnapshotMeta {
  id: string;
  label: string;
  annotation?: string;
  timestamp: number;
  rootNodeName: string;
  nodeCount: number;
  hasThumbnail?: boolean;
}

export interface PropertyChange {
  property: string;
  group: "structure" | "layout" | "style" | "typography" | "naming";
  oldValue: string;
  newValue: string;
}

export interface ChangeEntry {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  category: "added" | "removed" | "modified";
  changes: PropertyChange[];
}

export interface Changelog {
  fromSnapshot: { id: string; label: string; timestamp: number };
  toSnapshot: { id: string; label: string; timestamp: number };
  summary: { added: number; removed: number; modified: number };
  entries: ChangeEntry[];
}
