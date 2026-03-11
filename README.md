# Design Trail 

A Figma plugin that captures design snapshots and generates visual changelogs. Track how your designs evolve over time by comparing snapshots and seeing exactly what changed — added, removed, or modified nodes with detailed property diffs.

## Features

### Intuitive workflow
- **Guided 3-step flow** — Capture → Compare → Review, with a visual progress indicator
- **Live selection indicator** — see what's selected in Figma before you capture (green dot = ready)
- **Quick compare** — one-click comparison of your two most recent snapshots
- **Auto-versioning** — snapshot labels auto-suggest `v1`, `v2`, `v3`, etc.
- **Relative timestamps** — "2m ago", "1h ago" instead of full dates for easier scanning

### Capture & compare
- **Capture snapshots** of any selected frame or node
- **Compare snapshots** to generate a structured changelog
- **Visual diff** showing added, removed, and modified nodes with property-level detail
- **Annotations** — add notes to snapshots explaining *why* something changed
- **Comparison header** — always see which snapshots you're comparing (e.g. "v1 → v2")

### Changelog & review
- **Smart summaries** — plain-English descriptions: "Moved right by 10px. Font changed to Inter Bold."
- **Collapsible details** — summary first, expand for property-level diffs
- **Filter & search** — filter by change group (style, layout, typography) or search by node name
- **Click to highlight** — jump to any changed node in your Figma file
- **Snapshot timeline** — view how a single node evolved across multiple snapshots
- **Design review mode** — approve, flag, or comment on each change. Export a structured review report.
- **Export as Markdown** for sharing changelogs with your team

### Collaboration
- **Shared with team** — all snapshots, changelogs, and reviews are saved to the Figma file, visible to everyone
- **Deep property tracking** — 55+ properties across layout, style, typography, structure, and naming

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [Figma desktop app](https://www.figma.com/downloads/)

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch (auto-rebuild on save)

```bash
npm run watch
```

### Load in Figma

1. Open the Figma desktop app
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select the `manifest.json` file from this repo

## Project Structure

```
src/
  code.ts       # Plugin entry point, message handling
  snapshot.ts   # Captures node tree as serializable snapshots
  diff.ts       # Compares snapshots, generates changelogs + markdown export
  storage.ts    # Persistence via Figma pluginData (shared with team)
  types.ts      # TypeScript interfaces
ui/
  ui.html       # Plugin UI (capture, compare, changelog tabs)
manifest.json   # Figma plugin manifest
```

## Roadmap

### Near-term
- [x] Filter & search changelog by change group (style, layout, typography) or node name
- [x] Snapshot auto-versioning — auto-suggest `v1`, `v2`, etc.
- [x] Annotations — add notes to snapshots explaining *why* something changed
- [x] Snapshot timeline — view how a single node evolved across multiple snapshots

### Mid-term
- [ ] Visual side-by-side preview — capture thumbnail exports at snapshot time, show before/after images
- [ ] Compare across different root nodes — match by node name/structure instead of ID
- [ ] Export to JSON/CSV for external tools and design system docs
- [ ] Auto-snapshot on page change or interval

### Long-term
- [ ] Component-level tracking — detect component swaps and detaches
- [ ] Design token awareness — map raw fill/stroke values to variable/style names
- [ ] Team changelog — aggregate changelogs across multiple pages/files
- [ ] Slack/webhook integration — post changelogs to a channel automatically

## License

MIT
