# Work order for Sol — Warcraft III ambience models (MDL text format)

You are authoring **static ambience models** for a Warcraft III custom map set in
Singapore ("Last Train from Yio Chu Kang"). Deliverable: one `.mdl` **text** file
per model (Warcraft III MDL 800 dialect). They will be machine-converted to MDX
and hard-gated by mdx-m3-viewer's sanityTest (0 errors, 0 severe) — models that
fail the gate get returned with the exact error list for a revision pass.

## Models wanted (priority order)

1. **HDB block facade** — a tall slab apartment block, ~10 storeys read as
   window bands, void deck (open pillared ground floor), one accent color band.
   Footprint ~256×128, height ~700.
2. **Hawker centre** — low wide pavilion: pitched roof on pillars, open sides,
   stall counters as interior masses. ~384×256, height ~180.
3. **MRT overhead bridge / station canopy segment** — curved roof canopy on two
   pylons, platform slab. ~256×96, height ~220. (Modular: will be placed in a row.)
4. **Bus stop shelter** — thin flat roof, two posts, bench mass. ~96×48, height ~90.
5. **Lamp post** (pair with additive glow head) — ~24×24, height ~180.
6. **Storm drain / canal segment** — open concrete channel, sloped sides. ~128×64.
7. **Overhead pedestrian bridge** — deck + stairs at both ends, railings. ~288×64, height ~140.
8. **Kopitiam table cluster** — round table + stools, one mass each. ~64×64.

Style: low-poly (WC3 classic: aim < 400 triangles per model, hard cap 800),
strong silhouettes, flat-shaded masses. Night map: models should read in dim light.

## HARD format rules (violations = automatic gate failure)

- **MDL 800 text dialect.** `Version { FormatVersion 800, }`.
- **Textures**: use ONLY these two kinds:
  - Team color / replaceable: `Bitmap { ReplaceableId 1, }` (team-tinted parts — use sparingly, e.g. one accent band).
  - Stock Blizzard textures referenced by path, e.g.
    `Bitmap { Image "Textures\\Brick2.blp", }`, `"Textures\\Concrete.blp"`,
    `"Textures\\Steel.blp"`, `"Textures\\Wood5.blp"` (only well-known stock paths;
    if unsure, prefer ReplaceableId 1 + vertex-color-free geometry with Material
    `static Color` tints).
  - NO custom texture files.
- **Materials**: `static Color { R, G, B }` takes **plain RGB floats 0–1 in R,G,B
  order** — do NOT pre-swap to BGR (the converter handles the engine's B,G,R order).
- **No comma after the closing brace of a `Triangles { ... }` block** (the parser
  rejects the WE-style trailing comma).
- **Every model MUST have**:
  - A `Sequences` block with at least `Anim "Stand" { Interval { X, Y }, }` and a
    **non-looping `Anim "Death"`** sequence (even for props — missing Death is a
    hard sanity error).
  - An `Attachment "Origin Ref"` node.
  - For every Bone: either reference a valid `GeosetAnim` or specify **no
    GeosetAnimId at all** (an implicit/0 GeosetAnimId with no GeosetAnim chunk is
    a hard crash). Simplest safe pattern: one Bone, no GeosetAnim blocks, geosets
    attached to that bone via `VertexGroup`/`Groups`.
  - Correct `Extent` blocks (MinimumExtent/MaximumExtent/BoundsRadius) on the
    model and each sequence — compute from your geometry, don't guess.
- **Coordinate/scale conventions**: Z-up, 1 WC3 unit ≈ 1/128 of a terrain tile
  edge × 128 (i.e. a 128×128 footprint ≈ one tile). Ground plane at Z=0.
- Keep it to ONE geoset per material; 1–4 geosets per model total.

## Reference skeleton (known-good minimal shape)

```
Version { FormatVersion 800, }
Model "BusStop" { BlendTime 150, MinimumExtent { -48, -24, 0 }, MaximumExtent { 48, 24, 90 }, BoundsRadius 60, }
Sequences 2 {
  Anim "Stand" { Interval { 0, 1000 }, MinimumExtent { -48, -24, 0 }, MaximumExtent { 48, 24, 90 }, BoundsRadius 60, }
  Anim "Death" { Interval { 2000, 3000 }, NonLooping, MinimumExtent { -48, -24, 0 }, MaximumExtent { 48, 24, 90 }, BoundsRadius 60, }
}
Textures 1 { Bitmap { ReplaceableId 1, } }
Materials 1 { Material { Layer { FilterMode None, static TextureID 0, } } }
Geoset { ... Vertices/Normals/TVertices/VertexGroup/Faces/Groups ...
  MinimumExtent { -48, -24, 0 }, MaximumExtent { 48, 24, 90 }, BoundsRadius 60,
  MaterialID 0, SelectionGroup 0, }
Bone "root" { ObjectId 0, }
Attachment "Origin Ref" { ObjectId 1, AttachmentID 0, }
```

## Delivery + iteration protocol

- One file per model: `HDBBlock.mdl`, `HawkerCentre.mdl`, `MRTCanopy.mdl`,
  `BusStop.mdl`, `LampPost.mdl`, `StormDrain.mdl`, `PedBridge.mdl`, `Kopitiam.mdl`.
- Files are dropped into the toolkit repo; the pipeline runs
  parse (war3-model) → MDX conversion → sanityTest. You will receive back, per
  failing model, the exact parser/sanity error lines — fix and resubmit only the
  failing files.
- A model passing the gate is considered accepted; final in-game look review
  happens at the next human playtest.
