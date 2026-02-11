import { Snapshot, SnapshotMeta } from "./types";

const INDEX_KEY = "changelog_index";
const SNAP_PREFIX = "changelog_snap_";
const MAX_SNAPSHOTS = 20;

async function getIndex(): Promise<SnapshotMeta[]> {
  const index = await figma.clientStorage.getAsync(INDEX_KEY);
  return index || [];
}

async function saveIndex(index: SnapshotMeta[]): Promise<void> {
  await figma.clientStorage.setAsync(INDEX_KEY, index);
}

export async function saveSnapshot(snapshot: Snapshot): Promise<{ ok: boolean; message: string }> {
  const index = await getIndex();

  if (index.length >= MAX_SNAPSHOTS) {
    return {
      ok: false,
      message: `Maximum of ${MAX_SNAPSHOTS} snapshots reached. Delete some before capturing more.`,
    };
  }

  const meta: SnapshotMeta = {
    id: snapshot.id,
    label: snapshot.label,
    timestamp: snapshot.timestamp,
    rootNodeName: snapshot.rootNodeName,
    nodeCount: snapshot.nodeCount,
  };

  index.push(meta);
  await saveIndex(index);
  await figma.clientStorage.setAsync(SNAP_PREFIX + snapshot.id, snapshot);

  return { ok: true, message: `Snapshot "${snapshot.label}" saved (${snapshot.nodeCount} nodes).` };
}

export async function getSnapshots(): Promise<SnapshotMeta[]> {
  return getIndex();
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const data = await figma.clientStorage.getAsync(SNAP_PREFIX + id);
  return data || null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const index = await getIndex();
  const filtered = index.filter((m) => m.id !== id);
  await saveIndex(filtered);
  await figma.clientStorage.deleteAsync(SNAP_PREFIX + id);
}
