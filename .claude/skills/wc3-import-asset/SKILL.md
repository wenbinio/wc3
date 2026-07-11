---
name: wc3-import-asset
description: Inspect/convert Warcraft 3 assets (MDX/MDL models, BLP textures) and import them into a map source so units/doodads can use them. Use when asked to add a custom model or texture to a map, convert MDL/MDX, or make a BLP.
---

# Import a custom asset into a map

Prereq (once per session): `bash scripts/setup.sh`
Background + legal rules: docs/ASSETS.md. Pipeline mechanism: docs/PIPELINE.md §4.

## Inspect an MDX/MDL

```bash
node -e "
const fs=require('fs');
const {parseMDX}=require('war3-model');
const b=fs.readFileSync(process.argv[1]);
const m=parseMDX(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)); // ArrayBuffer, NOT Buffer
console.log('version',m.Version);                       // 800 classic; 900/1000/1100 Reforged
console.log('sequences',m.Sequences.map(s=>s.Name));    // must be non-empty to animate
console.log('textures',m.Textures.map(t=>t.Image));     // paths the map must satisfy
" model.mdx
```

## Convert MDL ⇄ MDX

```bash
node -e "
const fs=require('fs');
const {parseMDX,parseMDL,generateMDX,generateMDL}=require('war3-model');
const b=fs.readFileSync('in.mdx');
fs.writeFileSync('out.mdl', generateMDL(parseMDX(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))));
// reverse: fs.writeFileSync('out.mdx', Buffer.from(generateMDX(parseMDL(fs.readFileSync('in.mdl','utf8')))));
"
```

From glTF/OBJ/FBX there is NO direct converter — chain: headless Blender 3.x
+ khalv/mdl-exporter (tw1lac fork for 3.x) → MDL → MDX as above. See
docs/ASSETS.md.

Authoring MDL text for war3-model (generating original models): start from
`maps/northreach/assets/mdl-lib.mjs` (known-good, sanity-self-checking) and
mind CLAUDE.md gotcha 19 — `static Color { R, G, B }` takes plain RGB
(generateMDX writes the game's B,G,R order itself), and parseMDL rejects a
comma after the `Triangles { ... }` closing brace (WE-style MDL has one).
Sanity bar for the result: CLAUDE.md gotcha 14 (0 errors / 0 severes).

## PNG → BLP1 texture (Pillow)

```bash
pip install pillow   # if needed
python3 -c "
from PIL import Image
im = Image.open('tex.png').convert('RGB')
im.save('tex.blp', blp_version='BLP1')   # REQUIRED: default BLP2 does not work in WC3
"
```

Decode BLP→image: war3-model's `decodeBLP` (it cannot encode). Classic WC3
accepts `.blp`/`.tga`; Reforged also `.dds`.

## Add the asset to a map source and reference it

1. Place under `imports/` — the path relative to `imports/` IS the archive path:
   `maps/<name>/imports/war3mapImported/MyModel.mdx` (+ its textures at the
   exact paths the model's `Textures` entries name).
2. Build — `war3map.imp` is auto-generated (skipped if the source has its own
   `imports.json`):
   ```bash
   node tools/build-map.js maps/<name> _build/<name>.w3x
   node tools/validate-map.js _build/<name>.w3x   # must exit 0
   ```
3. Reference from object data (`objects-*.json`), e.g. give a custom unit the
   model: field `umdl`, type `string`, value `war3mapImported\MyModel.mdl`
   (doodads `dfil`, destructables `bfil`, items `ifil`). **Model field values
   ALWAYS use the `.mdl` extension** even though the archive member is
   `.mdx` — the engine swaps the extension at load; a literal `.mdx` value
   renders an invisible unit with no error (CLAUDE.md gotcha 22). Only the
   field value takes `.mdl`; the file under `imports/` and its archive path
   keep `.mdx`. Referencing Blizzard's built-in assets needs NO import —
   just use the in-game path (`units\human\Footman\Footman.mdl`).

## Legal rules (non-negotiable)

- Reference Blizzard assets by in-game path; NEVER commit/redistribute
  extracted Blizzard files (models, textures, SLKs).
- Hive Workshop assets: free to use in maps, but credit each author; no
  re-hosting, no bulk scraping.
- Clean-room alternative: CC0 packs (Kenney.nl, OpenGameArt) via the Blender
  conversion chain.
