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
data v3). Classic-era files can still be extracted and repacked, just not
translated to JSON — see `docs/FORMATS.md`.

## Quickstart

```bash
bash scripts/setup.sh        # installs smpq (apt) + npm deps, idempotent
npm test                     # round-trip + build + validate test suite

# Build the bundled demo map
node tools/build-map.js maps/demo _build/demo.w3x
node tools/validate-map.js _build/demo.w3x
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
| `w3x-extract.js` | `<map.w3x> <outdir>` | Save the 512-byte HM3W pre-header (`_header.json`) and extract all MPQ contents |
| `w3x-pack.js` | `<dir> <out.w3x>` | Pack a directory into an MPQ v1 and prepend the preserved/synthesized HM3W header |
| `map-to-json.js` | `<extracted-dir> <json-dir>` | Translate every known `war3map.*` file to JSON; copy opaque files through with a manifest |
| `json-to-map.js` | `<json-dir> <out-dir>` | Inverse: JSON map source back to raw archive members |
| `build-map.js` | `<map-source-dir> <out.w3x>` | Top-level compiler: map source → `.w3x` |
| `validate-map.js` | `<map.w3x>` | Extract, re-parse every translatable file, check script presence; pass/fail summary |

## Map source layout

A map source directory (see `maps/demo/` for a working example):

```
maps/mymap/
├── info.json           map settings, players, forces   (war3map.w3i)
├── terrain.json        heightmap + tiles               (war3map.w3e)
├── units.json          preplaced units + start locs    (war3mapUnits.doo)
├── doodads.json        doodads/destructables           (war3map.doo)
├── strings.json        TRIGSTR_* table                 (war3map.wts)
├── objects-*.json      object data edits               (war3map.w3u/w3t/...)
├── war3map.lua         map script (config() + main())
├── files/              opaque binaries copied verbatim (shd, wpm, mmp, blp...)
├── imports/            custom assets (MDX/BLP/...); war3map.imp auto-generated
└── _header.json        HM3W pre-header fields {name, flags, maxPlayers}
```

## Docs

- `docs/PIPELINE.md` — end-to-end workflows (read, modify, create, import assets)
- `docs/FORMATS.md` — format knowledge: HM3W header, MPQ notes, file inventory,
  versions, classic-vs-Reforged gotchas, external references
- `CLAUDE.md` — operational notes for AI agent sessions
- `.claude/skills/` — agent skills: `wc3-read-map`, `wc3-build-map`, `wc3-new-map`

## Stack

- [`smpq`](https://packages.debian.org/smpq) (StormLib CLI) — MPQ archive I/O
- [`wc3maptranslator@5.0.0`](https://github.com/ChiefOfGxBxL/WC3MapTranslator) — war3map.* ⇄ JSON (pinned; see CLAUDE.md)
- [`war3-model`](https://www.npmjs.com/package/war3-model) — MDX/MDL model + BLP texture parsing
- `stormlib-node` (optional) — programmatic StormLib bindings

Fixtures in `fixtures/` are MIT-licensed WC3MapTranslator test data
(see `fixtures/ATTRIBUTION.md`). Never commit Blizzard-authored or other
third-party protected maps to this repository.
