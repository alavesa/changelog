export interface NodeSnapshot {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  fills: string;
  strokes: string;
  effects: string;
  cornerRadius: number | string;
  // Text-specific
  characters?: string;
  fontSize?: number | string;
  fontName?: string;
  fontWeight?: number;
  // Layout-specific
  layoutMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  // Children IDs only
  children?: string[];
}

export interface Snapshot {
  id: string;
  label: string;
  timestamp: number;
  rootNodeId: string;
  rootNodeName: string;
  nodeCount: number;
  nodes: Record<string, NodeSnapshot>;
}

export interface SnapshotMeta {
  id: string;
  label: string;
  timestamp: number;
  rootNodeName: string;
  nodeCount: number;
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
