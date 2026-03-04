# Design Trail

A Figma plugin that captures design snapshots and generates visual changelogs. Track how your designs evolve over time by comparing snapshots and seeing exactly what changed — added, removed, or modified nodes with detailed property diffs.

## Features

- **Capture snapshots** of any selected frame or node
- **Compare snapshots** to generate a structured changelog
- **Visual diff** showing added, removed, and modified nodes with property-level detail
- **Click to highlight** — jump to any changed node in your Figma file
- **Export as Markdown** for sharing changelogs with your team
- Tracks layout, style, typography, structure, and naming changes

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
  storage.ts    # Persistence via Figma clientStorage
  types.ts      # TypeScript interfaces
ui/
  ui.html       # Plugin UI (capture, compare, changelog tabs)
manifest.json   # Figma plugin manifest
```

## License

MIT
