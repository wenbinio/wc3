# wc3-map-toolkit

A headless, Linux-friendly toolkit for **reading, writing, translating and
building Warcraft III maps (`.w3x`)** — designed to be operated by AI agents
and humans alike, with no Warcraft III installation or World Editor required.

- Read any `.w3x`: extract the MPQ archive and translate `war3map.*` binaries
  to editable JSON.
- Edit maps as a plain folder of JSON + Lua ("map source").
- Build a working `.w3x` from a map source with one command.
- Validate the result end to end.

Supports the **current (Reforged) map formats** (w3i v33, w3e v12, object
data v3) plus first-class read+write codecs for the versions real published
maps actually ship (w3e v11, w3i v25/v31, object data v1/v2). Only classic
`war3map.doo` stays read-only — see `docs/FORMATS.md`.

## Quickstart

```bash
bash scripts/setup.sh        # npm deps (+ optional smpq fallback via apt), idempotent
npm test                     # round-trip + build + validate test suite
npm run test:smpq            # same suite forced onto the smpq CLI MPQ backend

# Build the bundled demo map
node tools/build-map.js maps/demo _build/demo.w3x
node tools/validate-map.js _build/demo.w3x
```

## Committed builds

`maps/builds/` holds the **committed compiled `.w3x` artifacts** of the
bundled map sources (`.gitignore` re-includes `maps/builds/*.w3x`; every
other build output, e.g. `_build/`, stays ignored). They are regenerated
from source with build-map — rebuild them whenever a map source changes:

```bash
node tools/build-map.js maps/<name> maps/builds/<name>.w3x
# bundled sources: demo, crossroads-siege, tidewatch-arena, northreach, vaults-of-ash
```

## Pipeline

```
                 w3x-extract               map-to-json
  .w3x  ────────────────────►  extracted/ ─────────────►  map source/
 (HM3W + MPQ)                 (war3map.* binaries)       (JSON + lua + assets)
                                                              │  edit with any
                                                              ▼  text tooling
  .w3x  ◄────────────────────  extracted/ ◄─────────────  map source/
                 w3x-pack                  json-to-map

  build-map = json-to-map + w3x-pack in one step (map source ──► .w3x)
  validate-map = extract + parse everything + report
```

## Tools

All tools are plain Node scripts: `node tools/<name>.js ...`

| Tool | Usage | Purpose |
| --- | --- | --- |
| `w3x-extract.js` | `[--dump-unknown] [--recover-names] <map.w3x> <outdir>` | Save the 512-byte HM3W pre-header (`_header.json`) and extract all MPQ contents; `--dump-unknown` also dumps anonymous members of protected maps under `_unknown/`; `--recover-names` additionally recovers their real names by harvesting paths from the extracted content and hash-probing the archive |
| `w3x-pack.js` | `[--bare] <dir> <out.w3x>` | Pack a directory into an MPQ v1 and prepend the preserved/synthesized HM3W header (`--bare`: no pre-header, modern 1.31+ container) |
| `map-to-json.js` | `<extracted-dir> <json-dir>` | Translate every known `war3map.*` file to JSON; copy opaque files through with a manifest |
| `json-to-map.js` | `<json-dir> <out-dir>` | Inverse: JSON map source back to raw archive members |
| `build-map.js` | `[--bare] <map-source-dir> <out.w3x>` | Top-level compiler: map source → `.w3x` (`--bare` passes through to the packer) |
| `validate-map.js` | `<map.w3x>` | Extract, re-parse every translatable file, check script presence; pass/fail summary |

## Map source layout

A map source directory (see `maps/demo/` for a minimal working example and
`maps/crossroads-siege/` for a full-featured one — non-flat 64x64 terrain,
5 players/2 forces, regions/cameras/sounds, custom object data, a generated
MDX import and a complete Lua game mode; `maps/tidewatch-arena/` is the
custom-forces lobby reference, `maps/northreach/` the economy /
custom-models reference and `maps/vaults-of-ash/` the flagship: a seeded
co-op roguelike — 3 playable heroes, rotating affixed Floor Guardians,
seeded room-interior variants — with a machine-verified golden-run replay
and 70 headless logic tests — each has its own README):

```
maps/mymap/
├── info.json           map settings, players, forces   (war3map.w3i)
├── terrain.json        heightmap + tiles               (war3map.w3e)
├── units.json          preplaced units + start locs    (war3mapUnits.doo +
│                       generated CreateAllUnits() in the packed war3map.lua)
├── doodads.json        doodads/destructables           (war3map.doo)
├── strings.json        TRIGSTR_* table                 (war3map.wts)
├── objects-*.json      object data edits               (war3map.w3u/w3t/...)
├── war3map.lua         map script (config() + main())
├── files/              opaque binaries copied verbatim (shd, wpm, ...); the
│                       minimap (war3mapMap.tga + war3map.mmp) is generated
│                       at build time unless provided here
├── imports/            custom assets (MDX/BLP/...); war3map.imp auto-generated
├── assets/             committed generator scripts (*.mjs) that reproduce
│                       generated imports/terrain data (regen, don't hand-edit)
└── _header.json        HM3W pre-header fields {name, flags, maxPlayers}
```

## Docs

- `docs/PIPELINE.md` — end-to-end workflows (read, modify, create, import assets)
- `docs/FORMATS.md` — format knowledge: HM3W header, MPQ notes, file inventory,
  versions, classic-vs-Reforged gotchas, external references
- `docs/ASSETS.md` — **assets & models**: MDX/MDL versions, PNG→BLP1, the
  glTF/OBJ→MDX conversion chain, and legal sourcing rules (Blizzard paths,
  Hive Workshop credits, CC0 packs)
- `docs/reference/roguelike-comparison.md` — honest capability matrix of
  `maps/vaults-of-ash/` against the three strongest WC3 roguelike maps
  (what was adapted from each, with credit, and what they still win)
- `CLAUDE.md` — operational notes for AI agent sessions
- `.claude/skills/` — agent skills: `wc3-read-map`, `wc3-build-map`,
  `wc3-new-map`, `wc3-import-asset`

## Stack

- [`stormlib-node`](https://www.npmjs.com/package/stormlib-node) (native StormLib bindings) — primary MPQ backend
- [`smpq`](https://packages.debian.org/smpq) (StormLib CLI) — fallback MPQ backend
  (used when the native module can't build; force with `WC3_MPQ_BACKEND=smpq`)
- [`wc3maptranslator@5.0.0`](https://github.com/ChiefOfGxBxL/WC3MapTranslator) — war3map.* ⇄ JSON (pinned; see CLAUDE.md)
- [`mdx-m3-viewer-th`](https://www.npmjs.com/package/mdx-m3-viewer-th) — second-opinion parsers
  (validate-map cross-validation incl. wpm/shd/mmp + MDX sanity; classic-format fallback reader)
- [`war3-model`](https://www.npmjs.com/package/war3-model) — MDX/MDL model + BLP texture parsing

Fixtures in `fixtures/` are MIT-licensed WC3MapTranslator test data
(see `fixtures/ATTRIBUTION.md`). Never commit Blizzard-authored or other
third-party protected maps to this repository.
