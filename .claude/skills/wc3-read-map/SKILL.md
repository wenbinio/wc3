---
name: wc3-read-map
description: Inspect an existing Warcraft 3 map (.w3x): extract its MPQ archive and translate war3map.* files to editable JSON. Use when asked to read, inspect, analyze or diff a .w3x map.
---

# Read a .w3x map

Prereq (once per session): `bash scripts/setup.sh`

```bash
node tools/w3x-extract.js <map.w3x> /tmp/work/extracted   # header + MPQ contents
node tools/map-to-json.js /tmp/work/extracted /tmp/work/src
```

Then read `/tmp/work/src/`:

- `manifest.json` — what was translated vs copied raw, and any errors
- `info.json` — map name, players, forces, flags, scriptLanguage (1=Lua, 0=JASS)
- `terrain.json`, `units.json`, `doodads.json`, `strings.json`, `objects-*.json`
- `war3map.lua` / `war3map.j` — the map script (plain text)
- `files/` — opaque binaries (shd/wpm/mmp/blp/mdx/wtg...)
- `_header.json` — the .w3x HM3W pre-header (lobby name, maxPlayers)

Quick summary one-liner:

```bash
node -e "const i=require('/tmp/work/src/info.json');console.log(i.map.name, i.players.length+'p', 'lang='+i.scriptLanguage)"
```

Interpreting problems:

- `manifest.json.errors` mentioning "cannot currently parse this version"
  → classic-format map; those files are copied raw, everything else still works.
- Extraction found only standard files on a map known to have imports
  → protected map (no listfile); see docs/FORMATS.md.
- `TRIGSTR_123` values in info.json resolve via `strings.json` key `123`.

Validate any map: `node tools/validate-map.js <map.w3x>` (exit 0 = healthy).
