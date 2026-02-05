# Data Circuits

Data-driven **series/parallel** circuit visualizer + reducer + exporter.

## Features (current MVP)
- Freeform **node-based editor** (drag nodes, connect components)
- Automatically converts reducible graphs into the strict **series/parallel** layout for reduction/export
- Components: **Resistor**, **Ammeter (ideal 0-ohm)**, **Voltage source**, **Current source**
- SVG circuit drawing (right angles)
- Automatic reduction trace (deepest-first, one depth level per step) + LaTeX formulas (per level)
- Export:
  - CircuitikZ for the current circuit (European resistors)
  - Standalone LaTeX document with every reduction level + formulas

## Run
```bash
npm install
npm run dev
```

## Notes
- Circuits that create a **short** (0-ohm path, typically via a parallel ammeter-only branch) are blocked during reduction/export.

## Deploy to GitHub Pages
This repo is configured with `.github/workflows/deploy-pages.yml` and deploys automatically on pushes to `main`.

After pushing:
1. Open repository **Settings -> Pages**
2. Set **Source** to **GitHub Actions**
3. Wait for the "Deploy to GitHub Pages" workflow to finish

The site URL will be:
- `https://<your-username>.github.io/data-circuits/`
