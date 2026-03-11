import { Snapshot, SnapshotMeta } from "./types";

// Uses figma.root.setPluginData / getPluginData so that all data is saved
// to the Figma file itself — shared with anyone who opens the file.

const INDEX_KEY = "changelog_index";
const SNAP_PREFIX = "changelog_snap_";
const MAX_SNAPSHOTS = 20;

function getData(key: string): any {
  try {
    const raw = figma.root.getPluginData(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("getData error for key", key, e);
    return null;
  }
}

function setData(key: string, value: any): void {
  try {
    const json = JSON.stringify(value);
    console.log("setData:", key, "size:", json.length, "bytes");
    figma.root.setPluginData(key, json);
  } catch (e) {
    console.error("setData error for key", key, e);
    throw e;
  }
}

function deleteData(key: string): void {
  try {
    figma.root.setPluginData(key, "");
  } catch (e) {
    console.error("deleteData error for key", key, e);
  }
}

function getIndex(): SnapshotMeta[] {
  return getData(INDEX_KEY) || [];
}

function saveIndex(index: SnapshotMeta[]): void {
  setData(INDEX_KEY, index);
}

export function saveSnapshot(snapshot: Snapshot): { ok: boolean; message: string } {
  try {
    const index = getIndex();

    if (index.length >= MAX_SNAPSHOTS) {
      return {
        ok: false,
        message: `Maximum of ${MAX_SNAPSHOTS} snapshots reached. Delete some before capturing more.`,
      };
    }

    const meta: SnapshotMeta = {
      id: snapshot.id,
      label: snapshot.label,
      annotation: snapshot.annotation,
      timestamp: snapshot.timestamp,
      rootNodeName: snapshot.rootNodeName,
      nodeCount: snapshot.nodeCount,
    };

    index.push(meta);
    saveIndex(index);
    setData(SNAP_PREFIX + snapshot.id, snapshot);

    return { ok: true, message: `Snapshot "${snapshot.label}" saved (${snapshot.nodeCount} nodes).` };
  } catch (e) {
    console.error("saveSnapshot error:", e);
    const errMsg = String(e);
    if (errMsg.includes("size") || errMsg.includes("quota") || errMsg.includes("large") || errMsg.includes("exceed")) {
      return {
        ok: false,
        message: `Snapshot too large to save (${snapshot.nodeCount} nodes). Try selecting a smaller frame or component.`,
      };
    }
    return { ok: false, message: `Failed to save snapshot: ${e}` };
  }
}

export function getSnapshots(): SnapshotMeta[] {
  return getIndex();
}

export function getSnapshot(id: string): Snapshot | null {
  return getData(SNAP_PREFIX + id);
}

export function deleteSnapshot(id: string): void {
  const index = getIndex();
  const filtered = index.filter((m) => m.id !== id);
  saveIndex(filtered);
  deleteData(SNAP_PREFIX + id);
}

// Review data — also stored in the file
export function saveReview(key: string, data: any): void {
  try {
    setData(key, data);
  } catch (e) {
    console.error("saveReview error:", e);
  }
}

export function loadReview(key: string): any {
  return getData(key) || {};
}
