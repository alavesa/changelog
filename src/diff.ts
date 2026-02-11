import {
  Snapshot,
  NodeSnapshot,
  Changelog,
  ChangeEntry,
  PropertyChange,
} from "./types";

type PropGroup = PropertyChange["group"];

const PROPERTY_GROUPS: Record<string, PropGroup> = {
  visible: "structure",
  children: "structure",
  x: "layout",
  y: "layout",
  width: "layout",
  height: "layout",
  layoutMode: "layout",
  itemSpacing: "layout",
  paddingTop: "layout",
  paddingRight: "layout",
  paddingBottom: "layout",
  paddingLeft: "layout",
  fills: "style",
  strokes: "style",
  effects: "style",
  cornerRadius: "style",
  opacity: "style",
  characters: "typography",
  fontSize: "typography",
  fontName: "typography",
  fontWeight: "typography",
  name: "naming",
};

const COMPARED_PROPERTIES = Object.keys(PROPERTY_GROUPS);

function valueToString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function compareNodes(
  oldNode: NodeSnapshot,
  newNode: NodeSnapshot
): PropertyChange[] {
  const changes: PropertyChange[] = [];

  for (const prop of COMPARED_PROPERTIES) {
    const oldVal = valueToString((oldNode as any)[prop]);
    const newVal = valueToString((newNode as any)[prop]);

    if (oldVal !== newVal) {
      changes.push({
        property: prop,
        group: PROPERTY_GROUPS[prop],
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
}

export function compareSnapshots(
  oldSnap: Snapshot,
  newSnap: Snapshot
): Changelog {
  const entries: ChangeEntry[] = [];
  const oldIds = new Set(Object.keys(oldSnap.nodes));
  const newIds = new Set(Object.keys(newSnap.nodes));

  // Added nodes: in new but not in old
  for (const id of newIds) {
    if (!oldIds.has(id)) {
      const node = newSnap.nodes[id];
      entries.push({
        nodeId: id,
        nodeName: node.name,
        nodeType: node.type,
        category: "added",
        changes: [],
      });
    }
  }

  // Removed nodes: in old but not in new
  for (const id of oldIds) {
    if (!newIds.has(id)) {
      const node = oldSnap.nodes[id];
      entries.push({
        nodeId: id,
        nodeName: node.name,
        nodeType: node.type,
        category: "removed",
        changes: [],
      });
    }
  }

  // Modified nodes: in both, compare properties
  for (const id of oldIds) {
    if (newIds.has(id)) {
      const changes = compareNodes(oldSnap.nodes[id], newSnap.nodes[id]);
      if (changes.length > 0) {
        const node = newSnap.nodes[id];
        entries.push({
          nodeId: id,
          nodeName: node.name,
          nodeType: node.type,
          category: "modified",
          changes,
        });
      }
    }
  }

  const summary = {
    added: entries.filter((e) => e.category === "added").length,
    removed: entries.filter((e) => e.category === "removed").length,
    modified: entries.filter((e) => e.category === "modified").length,
  };

  return {
    fromSnapshot: {
      id: oldSnap.id,
      label: oldSnap.label,
      timestamp: oldSnap.timestamp,
    },
    toSnapshot: {
      id: newSnap.id,
      label: newSnap.label,
      timestamp: newSnap.timestamp,
    },
    summary,
    entries,
  };
}

export function changelogToMarkdown(changelog: Changelog): string {
  const lines: string[] = [];
  const fromDate = new Date(changelog.fromSnapshot.timestamp).toLocaleString();
  const toDate = new Date(changelog.toSnapshot.timestamp).toLocaleString();

  lines.push(`# Design Changelog`);
  lines.push(``);
  lines.push(
    `**From:** ${changelog.fromSnapshot.label} (${fromDate})`
  );
  lines.push(
    `**To:** ${changelog.toSnapshot.label} (${toDate})`
  );
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(
    `- **${changelog.summary.added}** added | **${changelog.summary.removed}** removed | **${changelog.summary.modified}** modified`
  );
  lines.push(``);

  if (changelog.summary.added > 0) {
    lines.push(`## Added`);
    for (const entry of changelog.entries.filter(
      (e) => e.category === "added"
    )) {
      lines.push(`- **${entry.nodeName}** (${entry.nodeType})`);
    }
    lines.push(``);
  }

  if (changelog.summary.removed > 0) {
    lines.push(`## Removed`);
    for (const entry of changelog.entries.filter(
      (e) => e.category === "removed"
    )) {
      lines.push(`- **${entry.nodeName}** (${entry.nodeType})`);
    }
    lines.push(``);
  }

  if (changelog.summary.modified > 0) {
    lines.push(`## Modified`);
    for (const entry of changelog.entries.filter(
      (e) => e.category === "modified"
    )) {
      lines.push(`### ${entry.nodeName} (${entry.nodeType})`);
      for (const change of entry.changes) {
        lines.push(
          `- **${change.property}** [${change.group}]: \`${change.oldValue}\` → \`${change.newValue}\``
        );
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}
