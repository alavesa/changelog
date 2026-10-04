import {
  Snapshot,
  NodeSnapshot,
  Changelog,
  ChangeEntry,
  PropertyChange,
} from "./types";

type PropGroup = PropertyChange["group"];

const PROPERTY_GROUPS: Record<string, PropGroup> = {
  // Structure (children are compared separately, by name/type signature —
  // raw child IDs always differ across duplicated frames)
  visible: "structure",
  // Layout — position & size
  x: "layout",
  y: "layout",
  width: "layout",
  height: "layout",
  rotation: "layout",
  // Layout — auto-layout
  layoutMode: "layout",
  itemSpacing: "layout",
  paddingTop: "layout",
  paddingRight: "layout",
  paddingBottom: "layout",
  paddingLeft: "layout",
  // Style
  fills: "style",
  strokes: "style",
  effects: "style",
  opacity: "style",
  cornerRadius: "style",
  strokeWeight: "style",
  // Typography
  characters: "typography",
  fontSize: "typography",
  fontName: "typography",
  fontWeight: "typography",
  textAlignHorizontal: "typography",
  lineHeight: "typography",
  letterSpacing: "typography",
  textDecoration: "typography",
  // Naming
  name: "naming",
};

// Ignore changes smaller than this threshold for numeric properties
const NUMERIC_THRESHOLD = 0.5;

const COMPARED_PROPERTIES = Object.keys(PROPERTY_GROUPS);

function valueToString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}

const NUMERIC_PROPS = new Set(["x", "y", "width", "height", "rotation", "opacity", "itemSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "cornerRadius", "strokeWeight", "fontSize"]);

function compareNodes(
  oldNode: NodeSnapshot,
  newNode: NodeSnapshot,
  skipProps?: Record<string, true>
): PropertyChange[] {
  const changes: PropertyChange[] = [];

  for (const prop of COMPARED_PROPERTIES) {
    if (skipProps && skipProps[prop]) continue;
    const oldVal = valueToString((oldNode as unknown as Record<string, unknown>)[prop]);
    const newVal = valueToString((newNode as unknown as Record<string, unknown>)[prop]);

    if (oldVal !== newVal) {
      // Skip sub-pixel noise for numeric properties
      if (NUMERIC_PROPS.has(prop)) {
        const oldNum = parseFloat(oldVal);
        const newNum = parseFloat(newVal);
        if (!isNaN(oldNum) && !isNaN(newNum) && Math.abs(newNum - oldNum) < NUMERIC_THRESHOLD) {
          continue;
        }
      }

      changes.push({
        property: prop,
        group: PROPERTY_GROUPS[prop],
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  compareTokens(oldNode, newNode, changes);

  return changes;
}

// Token strings are "name" (older snapshots) or "name = value" (current
// format, which also captures the variable's resolved value).
function tokenBase(s: string): string {
  const i = s.indexOf(" = ");
  return i === -1 ? s : s.slice(0, i);
}

// Diff bound variable / style names per property. "(none)" marks a property
// that gained a token binding; "(detached)" marks one that lost it — a key
// signal for design-system maintainers. Because values are captured too, a
// change to the token's own value ("color/alarm/red = #e03131 → #ff2040")
// is detected even though the binding is unchanged.
function compareTokens(
  oldNode: NodeSnapshot,
  newNode: NodeSnapshot,
  changes: PropertyChange[]
): void {
  const oldTokens = oldNode.tokens || {};
  const newTokens = newNode.tokens || {};

  const keys: Record<string, true> = {};
  for (const k of Object.keys(oldTokens)) keys[k] = true;
  for (const k of Object.keys(newTokens)) keys[k] = true;

  for (const key of Object.keys(keys)) {
    const oldVal = oldTokens[key] || "";
    const newVal = newTokens[key] || "";
    if (oldVal !== newVal) {
      // Same binding where only one side carries a resolved value means one
      // snapshot predates value capture — not a real change, skip it.
      if (
        oldVal !== "" &&
        newVal !== "" &&
        tokenBase(oldVal) === tokenBase(newVal) &&
        (oldVal.indexOf(" = ") === -1 || newVal.indexOf(" = ") === -1)
      ) {
        continue;
      }
      changes.push({
        property: "token:" + key,
        group: "token",
        oldValue: oldVal || "(none)",
        newValue: newVal || "(detached)",
      });
    }
  }
}

// Children as a readable, ID-free signature ("FRAME:Button, TEXT:Label, …")
// so structural changes are detected by what the children are, not by their
// IDs — which always differ when a frame has been duplicated.
function childrenSignature(node: NodeSnapshot, snap: Snapshot): string {
  if (!node.children || node.children.length === 0) return "";
  const parts: string[] = [];
  for (const id of node.children) {
    const child = snap.nodes[id];
    parts.push(child ? child.type + ":" + child.name : id);
  }
  return parts.join(", ");
}

// Structural path keys: nodeId → "type:name#occ/…" chain from the snapshot
// root, with an occurrence index to disambiguate same-named siblings. The
// root's key is "" so two different roots always correspond to each other.
// Nodes not reachable from the root (truncated subtrees) get no key and can
// only match by ID.
function buildPathKeys(snap: Snapshot): Record<string, string> {
  const keys: Record<string, string> = {};
  if (!snap.nodes[snap.rootNodeId]) return keys;

  const queue: Array<{ id: string; key: string }> = [
    { id: snap.rootNodeId, key: "" },
  ];
  while (queue.length > 0) {
    const item = queue.shift()!;
    const node = snap.nodes[item.id];
    if (!node) continue;
    keys[item.id] = item.key;
    if (node.children) {
      const seen: Record<string, number> = {};
      for (const childId of node.children) {
        const child = snap.nodes[childId];
        if (!child) continue;
        const base = child.type + ":" + child.name;
        const occ = seen[base] || 0;
        seen[base] = occ + 1;
        queue.push({ id: childId, key: item.key + "/" + base + "#" + occ });
      }
    }
  }
  return keys;
}

export function compareSnapshots(
  oldSnap: Snapshot,
  newSnap: Snapshot
): Changelog {
  const entries: ChangeEntry[] = [];
  const oldIds = Object.keys(oldSnap.nodes);
  const newIds = Object.keys(newSnap.nodes);
  const crossRoot = oldSnap.rootNodeId !== newSnap.rootNodeId;
  let added = 0;
  let removed = 0;
  let modified = 0;

  // Pass 1: match by node ID (same root compared over time).
  const pairs: Array<{ oldId: string; newId: string }> = [];
  const matchedOld: Record<string, true> = {};
  const matchedNew: Record<string, true> = {};
  for (const id of oldIds) {
    if (newSnap.nodes[id]) {
      pairs.push({ oldId: id, newId: id });
      matchedOld[id] = true;
      matchedNew[id] = true;
    }
  }

  // Pass 2: match remaining nodes by structural path — handles comparing a
  // duplicated frame against the original, detached/recreated nodes, and any
  // other case where Figma assigned fresh IDs to equivalent nodes.
  const oldKeys = buildPathKeys(oldSnap);
  const newKeys = buildPathKeys(newSnap);
  const newByKey: Record<string, string> = {};
  for (const id of newIds) {
    if (matchedNew[id]) continue;
    const key = newKeys[id];
    if (key !== undefined) newByKey[key] = id;
  }
  for (const id of oldIds) {
    if (matchedOld[id]) continue;
    const key = oldKeys[id];
    if (key === undefined) continue;
    const newId = newByKey[key];
    if (newId !== undefined) {
      pairs.push({ oldId: id, newId });
      matchedOld[id] = true;
      matchedNew[newId] = true;
    }
  }

  // Added nodes: in new, never matched
  for (const id of newIds) {
    if (!matchedNew[id]) {
      const node = newSnap.nodes[id];
      entries.push({
        nodeId: id,
        nodeName: node.name,
        nodeType: node.type,
        category: "added",
        changes: [],
      });
      added++;
    }
  }

  // Removed nodes: in old, never matched
  for (const id of oldIds) {
    if (!matchedOld[id]) {
      const node = oldSnap.nodes[id];
      entries.push({
        nodeId: id,
        nodeName: node.name,
        nodeType: node.type,
        category: "removed",
        changes: [],
      });
      removed++;
    }
  }

  // Modified nodes: matched pairs with property changes. When comparing two
  // different roots, the roots' own x/y is just where each copy sits on the
  // canvas — pure noise, so it's skipped.
  const ROOT_SKIP: Record<string, true> = { x: true, y: true };
  for (const pair of pairs) {
    const isRootPair =
      pair.oldId === oldSnap.rootNodeId && pair.newId === newSnap.rootNodeId;
    const oldNode = oldSnap.nodes[pair.oldId];
    const newNode = newSnap.nodes[pair.newId];
    const changes = compareNodes(
      oldNode,
      newNode,
      crossRoot && isRootPair ? ROOT_SKIP : undefined
    );
    const oldSig = childrenSignature(oldNode, oldSnap);
    const newSig = childrenSignature(newNode, newSnap);
    if (oldSig !== newSig) {
      changes.push({
        property: "children",
        group: "structure",
        oldValue: oldSig || "(none)",
        newValue: newSig || "(none)",
      });
    }
    if (changes.length > 0) {
      const node = newSnap.nodes[pair.newId];
      entries.push({
        nodeId: pair.newId,
        nodeName: node.name,
        nodeType: node.type,
        category: "modified",
        changes,
      });
      modified++;
    }
  }

  const summary = { added, removed, modified };

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
    rootNodeName: newSnap.rootNodeName,
    summary,
    entries,
  };
}

function escapeMd(s: string): string {
  return s.replace(/([*_#`\[\]()>\-+.!|\\])/g, '\\$1');
}

export function changelogToMarkdown(changelog: Changelog): string {
  const lines: string[] = [];
  const fromDate = new Date(changelog.fromSnapshot.timestamp).toISOString();
  const toDate = new Date(changelog.toSnapshot.timestamp).toISOString();

  lines.push(`# Design Changelog`);
  lines.push(``);
  lines.push(
    `**From:** ${escapeMd(changelog.fromSnapshot.label)} (${fromDate})`
  );
  lines.push(
    `**To:** ${escapeMd(changelog.toSnapshot.label)} (${toDate})`
  );
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(
    `- **${changelog.summary.added}** added | **${changelog.summary.removed}** removed | **${changelog.summary.modified}** modified`
  );
  lines.push(``);

  const grouped = new Map<string, ChangeEntry[]>();
  for (const entry of changelog.entries) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }
  const addedEntries = grouped.get("added") ?? [];
  const removedEntries = grouped.get("removed") ?? [];
  const modifiedEntries = grouped.get("modified") ?? [];

  if (changelog.summary.added > 0) {
    lines.push(`## Added`);
    for (const entry of addedEntries) {
      lines.push(`- **${escapeMd(entry.nodeName)}** (${entry.nodeType})`);
    }
    lines.push(``);
  }

  if (changelog.summary.removed > 0) {
    lines.push(`## Removed`);
    for (const entry of removedEntries) {
      lines.push(`- **${escapeMd(entry.nodeName)}** (${entry.nodeType})`);
    }
    lines.push(``);
  }

  if (changelog.summary.modified > 0) {
    lines.push(`## Modified`);
    for (const entry of modifiedEntries) {
      lines.push(`### ${escapeMd(entry.nodeName)} (${entry.nodeType})`);
      for (const change of entry.changes) {
        const safeOld = change.oldValue.replace(/`/g, "\\`");
        const safeNew = change.newValue.replace(/`/g, "\\`");
        lines.push(
          `- **${change.property}** [${change.group}]: \`${safeOld}\` → \`${safeNew}\``
        );
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

function changelogToObject(changelog: Changelog): object {
  return {
    from: { label: changelog.fromSnapshot.label, timestamp: changelog.fromSnapshot.timestamp },
    to: { label: changelog.toSnapshot.label, timestamp: changelog.toSnapshot.timestamp },
    summary: changelog.summary,
    entries: changelog.entries.map((e) => ({
      nodeId: e.nodeId,
      nodeName: e.nodeName,
      nodeType: e.nodeType,
      category: e.category,
      changes: e.changes.map((c) => ({
        property: c.property,
        group: c.group,
        oldValue: c.oldValue,
        newValue: c.newValue,
      })),
    })),
  };
}

export function changelogToJSON(changelog: Changelog): string {
  return JSON.stringify(changelogToObject(changelog), null, 2);
}

// Human-friendly rendering of a diff value for the readable section of the
// agent export. Solid paints collapse to hex; long raw values are truncated
// (the JSON appendix always carries the full data).
function prettyValue(property: string, value: string): string {
  if (value === "") return "(empty)";
  if (property === "fills" || property === "strokes") {
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr)) {
        if (arr.length === 0) return "(none)";
        const parts = arr.map((p: any) => {
          if (p && p.type === "SOLID" && p.color) {
            const to255 = (x: number) =>
              Math.max(0, Math.min(255, Math.round(x * 255)));
            const hex =
              "#" +
              [p.color.r, p.color.g, p.color.b]
                .map((x: number) => to255(x).toString(16).padStart(2, "0"))
                .join("");
            const op =
              typeof p.opacity === "number" && p.opacity < 1
                ? " @ " + Math.round(p.opacity * 100) + "%"
                : "";
            return hex + op;
          }
          return p && p.type ? String(p.type) : "?";
        });
        return parts.join(", ");
      }
    } catch (e) {
      // fall through to raw value
    }
  }
  if (value.length > 120) return value.slice(0, 117) + "…";
  return value;
}

// Export shaped for pasting into an AI coding assistant (Claude Code, Cursor,
// Copilot, …): readable markdown sections per node, plus the full
// machine-readable change set as a JSON appendix — so the agent can update an
// implementation from the design diff instead of re-reading the whole design.
export function changelogToAgentPrompt(
  changelog: Changelog,
  fileName: string
): string {
  const lines: string[] = [];
  const fromDate = new Date(changelog.fromSnapshot.timestamp).toISOString();
  const toDate = new Date(changelog.toSnapshot.timestamp).toISOString();
  const s = changelog.summary;
  const frame = changelog.rootNodeName
    ? escapeMd(changelog.rootNodeName)
    : "selection";

  lines.push(`# Design change set — ${frame}`);
  lines.push(``);
  lines.push(
    `> Generated by the Design Trail Figma plugin. The design changed in Figma; ` +
    `update the implementation to match. Apply **only** the changes listed below — leave everything else untouched.`
  );
  lines.push(``);
  lines.push(`**Figma file:** ${escapeMd(fileName)}`);
  lines.push(`**Frame:** ${frame}`);
  lines.push(
    `**Diff:** ${escapeMd(changelog.fromSnapshot.label)} (${fromDate}) → ${escapeMd(changelog.toSnapshot.label)} (${toDate})`
  );
  lines.push(
    `**Summary:** ${s.added} added · ${s.removed} removed · ${s.modified} modified`
  );
  lines.push(``);
  lines.push(`## How to read this`);
  lines.push(``);
  lines.push(`- Numeric values are Figma units (= CSS px). \`x\`/\`y\` are relative to the parent node.`);
  lines.push(`- \`token:\` entries are design-token changes — update the token/variable reference in code instead of hardcoding the value. \`name = #hex\` shows the token's resolved value.`);
  lines.push(`- Each node lists its Figma node ID — with Figma MCP access you can inspect the node for more context.`);
  lines.push(`- The readable sections below simplify some values (solid paints shown as hex); the JSON appendix has the full raw data.`);
  lines.push(``);

  const added = changelog.entries.filter((e) => e.category === "added");
  const removed = changelog.entries.filter((e) => e.category === "removed");
  const modified = changelog.entries.filter((e) => e.category === "modified");

  if (added.length > 0) {
    lines.push(`## Added`);
    lines.push(``);
    for (const e of added) {
      lines.push(`- **${escapeMd(e.nodeName)}** (${e.nodeType}) — node \`${e.nodeId}\``);
    }
    lines.push(``);
  }

  if (removed.length > 0) {
    lines.push(`## Removed`);
    lines.push(``);
    for (const e of removed) {
      lines.push(`- **${escapeMd(e.nodeName)}** (${e.nodeType})`);
    }
    lines.push(``);
  }

  if (modified.length > 0) {
    lines.push(`## Modified`);
    for (const e of modified) {
      lines.push(``);
      lines.push(`### ${escapeMd(e.nodeName)} (${e.nodeType}) — node \`${e.nodeId}\``);
      lines.push(``);
      for (const c of e.changes) {
        const oldVal = prettyValue(c.property, c.oldValue).replace(/`/g, "\\`");
        const newVal = prettyValue(c.property, c.newValue).replace(/`/g, "\\`");
        lines.push(`- \`${c.property}\` _(${c.group})_: \`${oldVal}\` → \`${newVal}\``);
      }
    }
    lines.push(``);
  }

  lines.push(`## Machine-readable change set`);
  lines.push(``);
  lines.push("```json");
  lines.push(JSON.stringify(changelogToObject(changelog), null, 2));
  lines.push("```");
  return lines.join("\n");
}

export function changelogToCSV(changelog: Changelog): string {
  const rows: string[] = [];
  rows.push("Category,Node Name,Node Type,Node ID,Property,Group,Old Value,New Value");
  for (const entry of changelog.entries) {
    if (entry.changes.length === 0) {
      rows.push(csvRow([entry.category, entry.nodeName, entry.nodeType, entry.nodeId, "", "", "", ""]));
    } else {
      for (const c of entry.changes) {
        rows.push(csvRow([entry.category, entry.nodeName, entry.nodeType, entry.nodeId, c.property, c.group, c.oldValue, c.newValue]));
      }
    }
  }
  return rows.join("\r\n");
}

function csvRow(fields: string[]): string {
  return fields.map((f) => {
    const s = String(f).replace(/"/g, '""');
    const needsQuote = s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1
      || s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@");
    return needsQuote ? `"${s}"` : s;
  }).join(",");
}
