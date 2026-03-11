import { captureSnapshot } from "./snapshot";
import { compareSnapshots, changelogToMarkdown } from "./diff";
import { saveSnapshot, getSnapshots, getSnapshot, deleteSnapshot } from "./storage";

figma.showUI(__html__, { width: 360, height: 520, themeColors: true });

async function handleMessage(msg: { type: string; [key: string]: any }) {
  switch (msg.type) {
    case "capture-snapshot": {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: "error",
          message: "Please select a frame or node to capture.",
        });
        return;
      }

      const node = selection[0];
      const label = msg.label || `Snapshot ${Date.now()}`;
      const snapshot = captureSnapshot(node, label);
      if (msg.annotation) {
        snapshot.annotation = msg.annotation;
      }
      const result = await saveSnapshot(snapshot);

      if (result.ok) {
        figma.ui.postMessage({ type: "snapshot-saved", message: result.message });
        const list = await getSnapshots();
        figma.ui.postMessage({ type: "snapshot-list", snapshots: list });
      } else {
        figma.ui.postMessage({ type: "error", message: result.message });
      }
      break;
    }

    case "list-snapshots": {
      const list = await getSnapshots();
      figma.ui.postMessage({ type: "snapshot-list", snapshots: list });
      break;
    }

    case "compare-snapshots": {
      const oldSnap = await getSnapshot(msg.fromId);
      const newSnap = await getSnapshot(msg.toId);

      if (!oldSnap || !newSnap) {
        figma.ui.postMessage({
          type: "error",
          message: "Could not load one or both snapshots.",
        });
        return;
      }

      const changelog = compareSnapshots(oldSnap, newSnap);
      figma.ui.postMessage({ type: "changelog-result", changelog });
      break;
    }

    case "delete-snapshot": {
      await deleteSnapshot(msg.id);
      const list = await getSnapshots();
      figma.ui.postMessage({
        type: "snapshot-list",
        snapshots: list,
      });
      figma.ui.postMessage({
        type: "snapshot-deleted",
        message: "Snapshot deleted.",
      });
      break;
    }

    case "highlight-node": {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node && "type" in node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      } else {
        figma.ui.postMessage({
          type: "error",
          message: "Node not found in current document.",
        });
      }
      break;
    }

    case "node-timeline": {
      const index = await getSnapshots();
      const timeline: Array<{
        snapshotId: string;
        snapshotLabel: string;
        timestamp: number;
        node: any;
      }> = [];

      for (const meta of index) {
        const snap = await getSnapshot(meta.id);
        if (snap && snap.nodes[msg.nodeId]) {
          timeline.push({
            snapshotId: meta.id,
            snapshotLabel: meta.label,
            timestamp: meta.timestamp,
            node: snap.nodes[msg.nodeId],
          });
        }
      }

      timeline.sort((a, b) => a.timestamp - b.timestamp);

      figma.ui.postMessage({
        type: "node-timeline",
        nodeId: msg.nodeId,
        nodeName: msg.nodeName,
        timeline,
      });
      break;
    }

    case "export-changelog": {
      const markdown = changelogToMarkdown(msg.changelog);
      figma.ui.postMessage({ type: "export-markdown", markdown });
      break;
    }

    case "save-review": {
      await figma.clientStorage.setAsync(msg.key, msg.data);
      break;
    }

    case "load-review": {
      const data = await figma.clientStorage.getAsync(msg.key);
      figma.ui.postMessage({ type: "review-loaded", data: data || {} });
      break;
    }
  }
}

figma.ui.onmessage = handleMessage;
