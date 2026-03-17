import { Snapshot, SnapshotMeta } from "./types";

// Uses figma.root.setPluginData / getPluginData so that all data is saved
// to the Figma file itself — shared with anyone who opens the file.

const INDEX_KEY = "changelog_index";
const SNAP_PREFIX = "changelog_snap_";
const CHUNK_PREFIX = "changelog_chunk_";
const THUMB_PREFIX = "changelog_thumb_";
const MAX_SNAPSHOTS = 20;
const CHUNK_SIZE = 50; // nodes per chunk

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

    // Split nodes into chunks to stay under pluginData size limits
    const nodeIds = Object.keys(snapshot.nodes);
    const chunkCount = Math.ceil(nodeIds.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
      const chunkIds = nodeIds.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkNodes: Record<string, any> = {};
      for (const id of chunkIds) {
        chunkNodes[id] = snapshot.nodes[id];
      }
      setData(CHUNK_PREFIX + snapshot.id + "_" + i, chunkNodes);
    }

    // Save header (without nodes) pointing to chunks
    const header = {
      id: snapshot.id,
      label: snapshot.label,
      annotation: snapshot.annotation,
      timestamp: snapshot.timestamp,
      rootNodeId: snapshot.rootNodeId,
      rootNodeName: snapshot.rootNodeName,
      nodeCount: snapshot.nodeCount,
      chunkCount: chunkCount,
    };
    setData(SNAP_PREFIX + snapshot.id, header);

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

    return { ok: true, message: `Snapshot "${snapshot.label}" saved (${snapshot.nodeCount} nodes).` };
  } catch (e) {
    console.error("saveSnapshot error:", e);
    // Clean up any partial chunks on failure
    cleanupChunks(snapshot.id);
    deleteData(SNAP_PREFIX + snapshot.id);

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
  const header = getData(SNAP_PREFIX + id);
  if (!header) return null;

  // Legacy format: nodes stored directly in header
  if (header.nodes) return header as Snapshot;

  // Chunked format: reassemble from chunks
  const nodes: Record<string, any> = {};
  const chunkCount = header.chunkCount || 0;

  for (let i = 0; i < chunkCount; i++) {
    const chunk = getData(CHUNK_PREFIX + id + "_" + i);
    if (chunk) {
      Object.assign(nodes, chunk);
    }
  }

  return {
    id: header.id,
    label: header.label,
    annotation: header.annotation,
    timestamp: header.timestamp,
    rootNodeId: header.rootNodeId,
    rootNodeName: header.rootNodeName,
    nodeCount: header.nodeCount,
    nodes,
  };
}

function cleanupChunks(id: string): void {
  // Remove all chunk keys for a snapshot
  for (let i = 0; i < 200; i++) {
    const key = CHUNK_PREFIX + id + "_" + i;
    const raw = figma.root.getPluginData(key);
    if (!raw) break;
    deleteData(key);
  }
}

export function saveThumbnail(snapshotId: string, base64: string): boolean {
  try {
    setData(THUMB_PREFIX + snapshotId, base64);
    return true;
  } catch (e) {
    console.warn("saveThumbnail failed (too large?):", e);
    return false;
  }
}

export function getThumbnail(snapshotId: string): string | null {
  try {
    const raw = figma.root.getPluginData(THUMB_PREFIX + snapshotId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function deleteSnapshot(id: string): void {
  const header = getData(SNAP_PREFIX + id);
  if (header && header.chunkCount) {
    for (let i = 0; i < header.chunkCount; i++) {
      deleteData(CHUNK_PREFIX + id + "_" + i);
    }
  }
  deleteData(SNAP_PREFIX + id);
  deleteData(THUMB_PREFIX + id);

  const index = getIndex();
  const filtered = index.filter((m) => m.id !== id);
  saveIndex(filtered);
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
