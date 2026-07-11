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
- `_viewer/` — read-only mdx-m3-viewer-th parses of classic-format files the
  translator rejected (diagnostics only, NOT build-source — never edit/repack)
- `_header.json` — the .w3x HM3W pre-header (lobby name, maxPlayers)
- `_unknown/` (extraction dir, only with `w3x-extract --dump-unknown` or
  `WC3_EXTRACT_UNKNOWN=1`) — content of anonymous members of protected maps,
  content-sniffed extensions; diagnostics only, real names are lost

Quick summary one-liner:

```bash
node -e "const i=require('/tmp/work/src/info.json');console.log(i.map.name, i.players.length+'p', 'lang='+i.scriptLanguage)"
```

Interpreting problems:

- `manifest.json.errors` mentioning "cannot currently parse this version"
  (or a bare `RangeError: offset out of range`) → classic-format map; those
  files are copied raw (everything else still works) and, where possible,
  parsed read-only into `_viewer/<name>.json` (`manifest.json` →
  `viewerFallback`; viewer failures in `viewerFallbackErrors`; a truncated
  classic w3i gets a tolerant lib/classicw3i.js read).
- w3x-extract reporting unresolved (anonymous) entries → protected map
  (no listfile); rerun with `--dump-unknown` to recover their content
  under `_unknown/`; see docs/FORMATS.md.
- `TRIGSTR_123` values in info.json resolve via `strings.json` key `123`.

Validate any map: `node tools/validate-map.js <map.w3x>` (exit 0 = healthy).
Besides the wc3maptranslator round-trip checks, this cross-validates with
mdx-m3-viewer-th (`viewer ...` lines): its independent MPQ reader, parsers
for wpm/shd/mmp that the translator lacks, and an MDX sanity test on every
imported model (0 errors + 0 severes required — crash bar).

If you script against mdx-m3-viewer-th yourself, go through `lib/viewer.js`
and always pass `new Uint8Array(fs.readFileSync(p))`, never a Node Buffer —
its MPQ code mutates the input in place and misparses (and never use its MPQ
save path; it is read-only here for a reason). MPQ extraction uses
stormlib-node when available, else the smpq CLI (`WC3_MPQ_BACKEND=smpq`
forces the fallback).
