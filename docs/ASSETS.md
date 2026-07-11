# Sourcing and using assets (models, textures, data)

How to get MDX models / BLP textures / object data into a map built with this
toolkit — and how to do it legally. For the import mechanism itself see
docs/PIPELINE.md §4; this doc covers the assets themselves.

## MDX/MDL model formats

- **MDL** (text) and **MDX** (binary) encode the same model data; convert
  freely between them (see below).
- Version **800** = classic WC3. Versions **900/1000/1100** = Reforged: add
  `TANG`/`SKIN` chunks, HD materials, and DDS textures.
- Texture formats the game accepts: classic WC3 reads `.blp` and `.tga`;
  Reforged additionally reads `.dds`.
- Specs: GhostWolf's "MDX Specifications" thread on Hive Workshop,
  https://wowdev.wiki/MDX, and
  https://github.com/ChiefOfGxBxL/WC3MapSpecification.

## Tooling (all headless-capable on Linux)

- **`war3-model`** (npm, already a dependency of this repo):
  `parseMDX` / `generateMDX` / `parseMDL` / `generateMDL` handle all versions
  (800–1100) with ~99.7% byte-identical round-trips. `decodeBLP` decodes
  BLP1/DDS to PNG-able RGBA, but it **cannot encode BLP**. Remember the
  ArrayBuffer-not-Buffer rule (CLAUDE.md gotcha 5).
- **Pillow** (Python) is the practical PNG→BLP encoder:
  `im.save("out.blp", blp_version="BLP1")` — you **must** pass
  `blp_version="BLP1"`; Pillow's default is BLP2 (a WoW format), which WC3
  does not read.
- **Kanma/BLPConverter** (C++ CLI) — alternative for BLP→PNG.

```js
// inspect / convert a model with war3-model
const fs = require('fs');
const { parseMDX, generateMDX, parseMDL, generateMDL } = require('war3-model');
const buf = fs.readFileSync('model.mdx');
const model = parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(model.Version, model.Sequences.map(s => s.Name), model.Textures.map(t => t.Image));
fs.writeFileSync('model.mdl', generateMDL(model));            // MDX -> MDL text
fs.writeFileSync('model2.mdx', Buffer.from(generateMDX(model))); // MDL/JSON -> MDX
```

```python
# PNG -> BLP1 with Pillow
from PIL import Image
im = Image.open("tex.png").convert("RGB")
im.save("tex.blp", blp_version="BLP1")   # blp_version is REQUIRED
```

## Converting standard 3D formats (glTF/OBJ/FBX) to MDX

There is **no direct glTF/OBJ/FBX → MDX converter**. The working headless
chain (verified July 2026):

1. **Headless Blender 3.x** (`blender -b --python script.py`) imports the
   glTF/OBJ.
2. Export MDL with **khalv/mdl-exporter** (active as of Oct 2025; the
   **tw1lac fork** adds MDL *import* and Blender 3.x compatibility; Blender
   4.x is unverified — stay on 3.x).
3. MDL → MDX with `war3-model` (`parseMDL` + `generateMDX`).

Caveats: the exporter derives animation sequences from **timeline markers**
(one pair per sequence, e.g. "Stand", "Death") — a model with no sequences
will not animate in-game; rigging and materials usually need manual attention.
For visual validation with a GUI, use **Retera Model Studio** (Java, MIT,
active 2026; the Twilac fork adds FBX import).

## Legal sourcing — read before fetching anything

- **Blizzard's own assets**: maps normally reference in-game assets **by
  path** (e.g. `units\human\Footman\Footman.mdl`) so nothing is
  redistributed — this is the sanctioned, safest route and needs no import
  at all. **Never commit or redistribute extracted Blizzard files** (SLKs,
  models, textures). Extracting from *your own* install for local inspection:
  CascLib (Reforged) / StormLib (classic).
- **Hive Workshop** (hiveworkshop.com): the main community asset repository.
  Assets are free to *use in maps*, but **credit to each author is
  mandatory** and terms are per-author. **No re-hosting, no bulk scraping** —
  there is no public API and the community is strongly hostile to mass
  mirroring. XGM.guru is the similar Russian-language site.
- **Clean-licensed content**: CC0 packs (Kenney.nl, OpenGameArt, itch.io CC0
  collections) ship glTF/OBJ — convert via the Blender chain above. No CC0
  MDX pack is known to exist.
- **Object data**: per-map overrides live in `war3map.w3u/.w3t/...`, which
  this toolkit already translates to `objects-*.json`. Game-wide SLK data
  must come from the user's own game install; do not hunt for redistributed
  dumps. If obj⇄readable-text conversion is ever needed, w3x2lni exists
  (GPL, Windows-centric).

## Using an asset in a map (this repo's pipeline)

1. Drop the file under the map source `imports/` tree. The path **relative to
   `imports/` becomes the archive path**, so use:
   `maps/<name>/imports/war3mapImported/MyModel.mdx`.
2. `build-map.js` packs it at that path and auto-generates `war3map.imp`
   from the imports tree (backslash-separated paths) — unless the source has
   its own `imports.json`, in which case that is used instead.
3. Reference it from object data, e.g. in `objects-units.json` set a custom
   unit's model field (`umdl`) to `war3mapImported\MyModel.mdl`; doodads use
   `dfil`, destructables `bfil`, items `ifil`. **Model FIELD values always
   use the `.mdl` extension, even though the archive member is
   `MyModel.mdx`** — the engine swaps the extension at load, and a literal
   `.mdx` field value renders NOTHING (invisible unit, no error; CLAUDE.md
   gotcha 22). Only object-data model fields follow this rule: the file
   under `imports/`, its archive path and the war3map.imp entry all keep
   the real `.mdx` extension. Textures referenced *inside* an MDX must be
   imported at exactly the path the MDX's `Textures` entries name.
4. Rebuild and check: `node tools/build-map.js maps/<name> _build/<name>.w3x`
   then `node tools/validate-map.js _build/<name>.w3x`.

Details and the war3-model ArrayBuffer example: docs/PIPELINE.md §4.
Operational recipe: `.claude/skills/wc3-import-asset/`.
