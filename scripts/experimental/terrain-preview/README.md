# terrain-preview (experimental)

Headless terrain previews of bundled maps. Two tiers. Promoted from a
session scratchpad prototype 2026-08-08 (all 7 bundled maps rendered);
outputs go to `_build/`, never committed.

## Tier 1 — top-down layout map (pure node, always works)

```bash
node preview-terrain.mjs <map-source-or-extracted-dir> <out.png>
```

~1600px PNG: per-tile ground color, hillshaded heightfield (NW light,
cliff-edge darkening, ramp-aware), depth-scaled water, blight/boundary
tints, doodad dots by class, unit markers in player colors (slocs ringed
+ numbered, gold mines annotated), labeled region rectangles, legend +
scale bar. Extracted dirs are translated on the fly via lib/filemap.js
(w3e v11 and v12 both work).

**Honest limits**: colors are OUR palette (copied from lib/minimap.js
TILE_COLORS; names from docs/FORMATS.md) — layout-truth, not look-truth.
No tile blending; nearest-vertex sampling; ramps only soften edges.
TODO on next touch: export TILE_COLORS from lib/minimap.js instead of
the copy.

## Tier 2 — true 3D obliques via mdx-m3-viewer's War3MapViewer

```bash
node map-server.mjs <map.w3x>   # serves the archive + synthesized base data
node shoot-map.mjs <views.json> # playwright/chromium screenshots (rig conventions)
```

Renders the real .w3x: terrain mesh, cliffs, water, and the map's OWN
imported models with real geometry (Sol/community sets render properly).
Stock doodads render as colored stand-in boxes; units are skipped.

### Quirks (hard-won — read before touching)

- **w3e v12 water bug in mdx-m3-viewer-th**: `War3MapViewerMap` stores the
  raw corner water flag (bit 0x100 on v12) into a `Uint8Array` — truncates
  to 0, water never renders on v12 maps. Workaround: the page recomputes
  0/1 flags and re-uploads `map.waterBuffer` after load. Candidate
  upstream report (docs/upstream/ convention) — not yet drafted.
- Base data is synthesized as **INI** (MappedData accepts INI; CRLF line
  splits ONLY), 11 files; unit rows are served WITHOUT a `file` key so
  units skip cleanly while w3u clone lookups still find base rows (a
  missing base row hard-crashes).
- Water fragment shader multiplies texture x SLK color — the synthesized
  water texture must be near-white or water goes black.
- Cliff pieces are generated sloped quads from the AAAB corner tags (via
  war3-model), not Blizzard sculpts.
- Inherits render-rig conventions (scripts/experimental/render-rig):
  `--enable-unsafe-swiftshader`, TGA needs the TRUEVISION-XFILE v2
  footer, geoset tints render R<->B swapped — judge hues accordingly.
- "Unknown modification ID" log spam is expected (only dfil/dvar/bfil/
  bvar meta rows are synthesized).

Env: `WC3_REPO` points at the repo root (defaults to cwd).
