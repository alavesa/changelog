import { Snapshot, SnapshotMeta } from "./types";

// Uses figma.root.setPluginData / getPluginData so that all data is saved
// to the Figma file itself — shared with anyone who opens the file.

const INDEX_KEY = "changelog_index";
const SNAP_PREFIX = "changelog_snap_";
const MAX_SNAPSHOTS = 20;

function getData(key: string): any {
  const raw = figma.root.getPluginData(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setData(key: string, value: any): void {
  figma.root.setPluginData(key, JSON.stringify(value));
}

function deleteData(key: string): void {
  figma.root.setPluginData(key, "");
}

function getIndex(): SnapshotMeta[] {
  return getData(INDEX_KEY) || [];
}

function saveIndex(index: SnapshotMeta[]): void {
  setData(INDEX_KEY, index);
}

export function saveSnapshot(snapshot: Snapshot): { ok: boolean; message: string } {
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
  setData(key, data);
}

export function loadReview(key: string): any {
  return getData(key) || {};
}
