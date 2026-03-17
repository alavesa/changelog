import { captureSnapshot, captureThumbnail } from "./snapshot";
import { compareSnapshots, changelogToMarkdown, changelogToJSON, changelogToCSV } from "./diff";
import { saveSnapshot, getSnapshots, getSnapshot, deleteSnapshot, saveReview, loadReview, saveThumbnail, getThumbnail } from "./storage";

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
      const capture = captureSnapshot(node, label);

      if (capture.error) {
        figma.ui.postMessage({ type: "error", message: capture.error });
        return;
      }

      const snapshot = capture.snapshot!;
      if (msg.annotation) {
        snapshot.annotation = msg.annotation;
      }
      const result = saveSnapshot(snapshot);

      if (result.ok) {
        // Capture thumbnail (non-blocking — snapshot already saved)
        try {
          const thumb = await captureThumbnail(node);
          if (thumb) {
            saveThumbnail(snapshot.id, thumb);
          }
        } catch (e) {
          console.warn("Thumbnail capture skipped:", e);
        }

        let message = result.message;
        if (capture.warning) {
          message += " ⚠ " + capture.warning;
        }
        figma.ui.postMessage({ type: "snapshot-saved", message });
        const list = getSnapshots();
        figma.ui.postMessage({ type: "snapshot-list", snapshots: list });
      } else {
        figma.ui.postMessage({ type: "error", message: result.message });
      }
      break;
    }

    case "list-snapshots": {
      const list = getSnapshots();
      figma.ui.postMessage({ type: "snapshot-list", snapshots: list });
      break;
    }

    case "compare-snapshots": {
      const oldSnap = getSnapshot(msg.fromId);
      const newSnap = getSnapshot(msg.toId);

      if (!oldSnap || !newSnap) {
        figma.ui.postMessage({
          type: "error",
          message: "Could not load one or both snapshots.",
        });
        return;
      }

      const changelog = compareSnapshots(oldSnap, newSnap);
      const fromThumbnail = getThumbnail(msg.fromId);
      const toThumbnail = getThumbnail(msg.toId);
      figma.ui.postMessage({ type: "changelog-result", changelog, fromThumbnail, toThumbnail });
      break;
    }

    case "delete-snapshot": {
      deleteSnapshot(msg.id);
      const list = getSnapshots();
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
      const index = getSnapshots();
      const timeline: Array<{
        snapshotId: string;
        snapshotLabel: string;
        timestamp: number;
        node: any;
      }> = [];

      for (const meta of index) {
        const snap = getSnapshot(meta.id);
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

    case "export-json": {
      const json = changelogToJSON(msg.changelog);
      figma.ui.postMessage({ type: "export-data", data: json, format: "JSON" });
      break;
    }

    case "export-csv": {
      const csv = changelogToCSV(msg.changelog);
      figma.ui.postMessage({ type: "export-data", data: csv, format: "CSV" });
      break;
    }

    case "save-review": {
      saveReview(msg.key, msg.data);
      break;
    }

    case "load-review": {
      const data = loadReview(msg.key);
      figma.ui.postMessage({ type: "review-loaded", data });
      break;
    }

    case "clear-all-data": {
      // Remove all plugin data keys from the file
      const keys = figma.root.getPluginDataKeys();
      for (const key of keys) {
        figma.root.setPluginData(key, "");
      }
      figma.ui.postMessage({ type: "snapshot-list", snapshots: [] });
      figma.ui.postMessage({ type: "data-cleared", message: "All plugin data cleared. You can start fresh." });
      break;
    }
  }
}

figma.ui.onmessage = handleMessage;

// Send selection info to UI whenever it changes
function sendSelectionInfo() {
  const selection = figma.currentPage.selection;
  if (selection.length > 0) {
    const node = selection[0];
    figma.ui.postMessage({
      type: "selection-changed",
      hasSelection: true,
      nodeName: node.name,
      nodeType: node.type,
    });
  } else {
    figma.ui.postMessage({
      type: "selection-changed",
      hasSelection: false,
    });
  }
}

figma.on("selectionchange", sendSelectionInfo);

// Send initial selection state
sendSelectionInfo();
