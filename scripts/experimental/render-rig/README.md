# render-rig (experimental) — headless model previews

Closes the "generated models are eyeball-blind until playtest" gap: renders
every custom MDX in the fleet to PNGs + labeled contact sheets, entirely
headlessly. Promoted 2026-08-07 from the scratchpad prototype that rendered
**90/90 fleet models** (12 generated + 8 Sol batch + 70 community/specimen)
via Playwright headless Chromium driving the **mdx-m3-viewer-th UMD bundle**
(the same parser stack as `lib/viewer.js`) with `--enable-unsafe-swiftshader`
software WebGL — no GPU needed. A pure-node **war3-model flat-shade
cross-check** (`softrender.mjs`) disambiguates rig bugs from geometry bugs.

The prototype's render read drove real fixes: the **CannonKeep silhouette**
weakness (fixed) and the **NorthLongship sail** (still unfixed) were both
found from these renders, not in-game.

## Usage

```bash
node scripts/experimental/render-rig/stage-fleet.mjs      # maps/*/imports -> _build/render-rig/stage/
node scripts/experimental/render-rig/server.mjs &         # rig server on 127.0.0.1:8931
node scripts/experimental/render-rig/shoot.mjs            # all staged groups -> out/models/*.png + shoot-report.json
node scripts/experimental/render-rig/shoot.mjs coinstead  # or just one group
python3 scripts/experimental/render-rig/sheets.py         # contact sheets  -> out/sheet-<group>.png

# cross-check a suspicious render without the browser (same camera defaults):
node scripts/experimental/render-rig/softrender.mjs coinstead/Orepit.mdx /tmp/orepit-soft.png
```

All work happens under `<repo>/_build/render-rig/` (gitignored; override
with `RENDER_RIG_DIR`). Outputs are throwaway diagnostics — never commit
sheets or PNGs; commit fixes to the model *generators* they reveal.

Env: `RENDER_RIG_PORT` (default 8931), `RENDER_RIG_PLAYWRIGHT` (playwright
package dir; falls back to the repo, then the environment-global install),
`RENDER_RIG_CHROMIUM` (browser binary; default `/opt/pw-browsers/chromium`,
else Playwright's own).

## Rig quirks worth keeping (cost real debugging time)

- **Synthesized TGAs need the TRUEVISION-XFILE v2 footer** — the viewer's
  TGA sniffer rejects a bare header, so `server.mjs` appends the footer to
  every solid-color fill it fabricates. Strip it and every stock-texture
  model fails to texture.
- **This mdx-m3-viewer-th build has no `resource.ok`** — a failed load
  still resolves; `page.html` probes `typeof model.addInstance` to tell a
  parsed model from a failure.

## Limitations (read renders accordingly)

- **Stock game textures render as deterministic hash-colored solid fills**
  (we never ship Blizzard textures — Legal in CLAUDE.md). Team color/glow
  renders near-white so authored geoset tints read. Silhouette, proportions,
  animation pose and UV seams are judgeable; final surface art is not.
  Real textures ARE used when staged (imports' BLPs/TGAs land in
  `stage/tex/`, matched case-insensitively by basename).
- **The Hive CDN is dead from this environment** — community models must
  already be on disk (fetched per docs/ASSETS.md Tier 4); the rig stages
  only local files.
- Camera framing is a node-side vertex-bound fit (three-quarter view,
  Stand sequence when present) — fine for review, not composition.
- Experimental tier: no tests depend on it; it is not part of preflight.
