import { captureSnapshot, captureThumbnail } from "./snapshot";
import { compareSnapshots, changelogToMarkdown, changelogToJSON, changelogToCSV } from "./diff";
import { saveSnapshot, getSnapshots, getSnapshot, deleteSnapshot, saveReview, loadReview, saveThumbnail, getThumbnail } from "./storage";

figma.showUI(__html__, { width: 360, height: 520, themeColors: false });

// Discriminated union for all incoming plugin messages
type PluginMessage =
  | { type: "capture-snapshot"; label?: string; annotation?: string }
  | { type: "list-snapshots" }
  | { type: "compare-snapshots"; fromId: string; toId: string }
  | { type: "delete-snapshot"; id: string }
  | { type: "highlight-node"; nodeId: string }
  | { type: "node-timeline"; nodeId: string; nodeName: string }
  | { type: "export-changelog" }
  | { type: "export-json" }
  | { type: "export-csv" }
  | { type: "save-review"; key: string; data: any }
  | { type: "load-review"; key: string }
  | { type: "clear-all-data" };

// Cache the last computed changelog in the plugin sandbox so export handlers
// use plugin-owned data instead of UI-supplied data.
let lastChangelog: ReturnType<typeof compareSnapshots> | null = null;

async function handleMessage(msg: PluginMessage) {
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
        let message = result.message;
        if (capture.warning) {
          message += " ⚠ " + capture.warning;
        }
        figma.ui.postMessage({ type: "snapshot-saved", message });
        const list = getSnapshots();
        figma.ui.postMessage({ type: "snapshot-list", snapshots: list });

        // Capture thumbnail after UI is updated (non-blocking)
        try {
          const thumb = await captureThumbnail(node);
          if (thumb) {
            saveThumbnail(snapshot.id, thumb);
          }
        } catch (e) {
          console.warn("Thumbnail capture skipped:", e);
        }
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
      if (!msg.fromId || !msg.toId) {
        figma.ui.postMessage({ type: "error", message: "Invalid snapshot IDs." });
        return;
      }

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
      lastChangelog = changelog;
      const fromThumbnail = getThumbnail(msg.fromId);
      const toThumbnail = getThumbnail(msg.toId);
      figma.ui.postMessage({ type: "changelog-result", changelog, fromThumbnail, toThumbnail });
      break;
    }

    case "delete-snapshot": {
      if (!msg.id) {
        figma.ui.postMessage({ type: "error", message: "Invalid snapshot ID." });
        return;
      }
      const result = deleteSnapshot(msg.id);
      if (!result.ok) {
        figma.ui.postMessage({ type: "error", message: result.message });
        return;
      }
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
      if (!msg.nodeId) {
        figma.ui.postMessage({ type: "error", message: "Invalid node ID." });
        return;
      }
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node && "type" in node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
        // Verify the node belongs to the current page to avoid a runtime crash
        // when assigning cross-page nodes to currentPage.selection.
        let parent = node.parent;
        while (parent && parent.type !== "PAGE") {
          parent = parent.parent;
        }
        if (!parent || parent.id !== figma.currentPage.id) {
          figma.ui.postMessage({
            type: "error",
            message: "Node not found in current document.",
          });
          return;
        }
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
      if (!msg.nodeId) {
        figma.ui.postMessage({ type: "error", message: "Invalid node ID." });
        return;
      }
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
      if (!lastChangelog) {
        figma.ui.postMessage({ type: "error", message: "No changelog available to export." });
        return;
      }
      const markdown = changelogToMarkdown(lastChangelog);
      figma.ui.postMessage({ type: "export-markdown", markdown });
      break;
    }

    case "export-json": {
      if (!lastChangelog) {
        figma.ui.postMessage({ type: "error", message: "No changelog available to export." });
        return;
      }
      const json = changelogToJSON(lastChangelog);
      figma.ui.postMessage({ type: "export-data", data: json, format: "JSON" });
      break;
    }

    case "export-csv": {
      if (!lastChangelog) {
        figma.ui.postMessage({ type: "error", message: "No changelog available to export." });
        return;
      }
      const csv = changelogToCSV(lastChangelog);
      figma.ui.postMessage({ type: "export-data", data: csv, format: "CSV" });
      break;
    }

    case "save-review": {
      if (!msg.key) {
        figma.ui.postMessage({ type: "error", message: "Invalid review key." });
        return;
      }
      const result = saveReview(msg.key, msg.data);
      if (!result.ok) {
        figma.ui.postMessage({ type: "error", message: result.message });
      } else {
        figma.ui.postMessage({ type: "review-saved", message: "Review saved." });
      }
      break;
    }

    case "load-review": {
      if (!msg.key) {
        figma.ui.postMessage({ type: "error", message: "Invalid review key." });
        return;
      }
      const data = loadReview(msg.key);
      figma.ui.postMessage({ type: "review-loaded", data });
      break;
    }

    case "clear-all-data": {
      lastChangelog = null;
      // Remove all plugin data keys from the file
      const keys = figma.root.getPluginDataKeys();
      try {
        for (const key of keys) {
          figma.root.setPluginData(key, "");
        }
        figma.ui.postMessage({ type: "snapshot-list", snapshots: [] });
        figma.ui.postMessage({ type: "data-cleared", message: "All plugin data cleared. You can start fresh." });
      } catch (e) {
        figma.ui.postMessage({ type: "error", message: "Failed to clear some data." });
      }
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

let selectionTimer: ReturnType<typeof setTimeout> | null = null;
figma.on("selectionchange", () => {
  if (selectionTimer) clearTimeout(selectionTimer);
  selectionTimer = setTimeout(sendSelectionInfo, 50);
});

// Send initial selection state
sendSelectionInfo();
