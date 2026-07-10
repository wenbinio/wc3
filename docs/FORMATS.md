# Warcraft III map format notes

Knowledge collected while building/validating this toolkit. For byte-level
specs see the references at the bottom.

## The .w3x container

A `.w3x` map is a **512-byte HM3W pre-header followed by an MPQ archive**:

```
offset 0    char[4]  'HM3W'            magic
offset 4    u32      unknown (0)
offset 8    cstring  map name          null-terminated
            u32      map flags
            u32      max players
            ...      zero padding up to offset 512
offset 512  'MPQ\x1a'                  the MPQ archive starts here
```

- StormLib/smpq **read** `.w3x` directly (they scan for the MPQ magic), but
  **create** bare MPQs — when repacking you must prepend the 512 bytes
  yourself (tools/w3x-pack.js does this; `_header.json` holds the fields).
- Warcraft III expects **MPQ format version 1**. smpq defaults to v4, so this
  toolkit always creates archives with `smpq -M 1`.
- MPQ member paths use `\` separators, but StormLib's name hashing treats
  `/` and `\` identically, so adding/extracting with `/` works fine.
- smpq automatically maintains a `(listfile)`. **Protected maps** strip it;
  files can then only be extracted by exact name (hash lookup still works) —
  `lib/mpq.js` probes a built-in KNOWN_FILES list as a fallback.
- Reforged also reads loose directories named `*.w3x/` (an "extracted map
  folder", e.g. wc3-ts-template's `maps/map.w3x/`) — handy for reference.

## war3map.* file inventory

Translatable via wc3maptranslator@5 (JSON name used by this toolkit):

| Archive file | Content | Format version | JSON |
| --- | --- | --- | --- |
| war3map.w3i | map info, players, forces | **v33** (Reforged; v31 also accepted) | info.json |
| war3map.w3e | terrain heightmap/tiles | **v12** | terrain.json |
| war3map.doo | doodads/destructables | v8 | doodads.json |
| war3mapUnits.doo | preplaced units/items, start locations | v8 subver 11 | units.json |
| war3map.w3r | regions | v5 | regions.json |
| war3map.w3c | cameras | v0 | cameras.json |
| war3map.w3s | sounds | v3 | sounds.json |
| war3map.wts | trigger strings (TRIGSTR_n) | text | strings.json |
| war3map.imp | imported-file manifest | v1 | imports.json |
| war3map.w3u/w3t/w3b/w3d/w3a/w3h/w3q | object data: units/items/destructables/doodads/abilities/buffs/upgrades | **v3** | objects-*.json |
| war3mapSkin.w3u/w3t/w3d/w3a/w3h/w3q | Reforged skin-mode object overrides (same v3 format) | v3 | objects-*-skin.json |

**war3mapSkin.w3b split**: Reforged splits destructable data across
`war3map.w3b` + `war3mapSkin.w3b` (visual "skin" fields like `bnam`, `bfil`,
`bmmr`... live in the skin file). wc3maptranslator@5's ObjectsTranslator
merges both into one JSON on read and re-splits on write
(`jsonToWar('destructables', ...)` returns `{buffer, bufferSkin}`).
This toolkit maps the pair to a single `objects-destructables.json`.

Opaque (copied verbatim, under `files/` in a map source):

| File | Content | Notes |
| --- | --- | --- |
| war3map.lua / war3map.j | map script | kept at map-source top level (it IS the editable form); sometimes at `scripts\war3map.j` |
| war3map.shd | shadow map | raw `width*4 × height*4` bytes (terrain tiles ×4) |
| war3map.wpm | path map | `'MP3W'` + i32 version(0) + i32 w + i32 h + w×h flag bytes |
| war3map.mmp | minimap icons | i32 format(0) + i32 count + 16-byte entries |
| war3mapMap.blp / .tga | minimap image | BLP decodable with war3-model's `decodeBLP` |
| war3mapPreview.tga | custom preview | |
| war3map.wtg / war3map.wct | GUI triggers + custom text triggers | no translator in wc3maptranslator@5; mdx-m3-viewer has parsers |
| war3map.w3f | campaign info | campaigns only |
| war3mapMisc.txt / war3mapSkin.txt / war3mapExtra.txt | ini-style gameplay constants/skins | plain text |
| *.mdx *.blp *.wav ... | imported assets | parse models with war3-model |

## Classic vs Reforged — THE gotcha

`wc3maptranslator@5.0.0` supports **only current Reforged-era formats**
(w3i v33, w3e v12, object data v3, doo v8). Files from classic-era maps
(w3i v18/v25, w3e v11, object data v1/v2) throw:

```
Error: WC3MapTranslator cannot currently parse this version of a war3map file
```

Consequences:

- Classic maps (most Hive Workshop archives, all original Blizzard maps) can
  be **extracted and repacked** but not fully JSON-translated. map-to-json
  copies untranslatable files raw and records errors in `manifest.json`.
- The wc3-ts-template repo's `maps/map.w3x/` folder is classic-format:
  its `.doo`, `w3r`, `w3c`, `wts`, `Units.doo` parse fine, but `w3i`/`w3e`
  do not. This repo's `maps/demo/` was therefore built in current formats
  from scratch (derived from WC3MapTranslator's MIT test fixtures).
- For classic parsing, fall back to mdx-m3-viewer's parsers or War3Net (C#).

Also note: **do not use unpinned `wc3maptranslator`** — npm resolves it to
4.0.4, which has a different (instance-method) API and broken behavior.
5.0.0 exposes static `warToJson(buffer)` / `jsonToWar(json)` per translator.

## Misc format facts learned the hard way

- w3e ground height `8192` = ground level zero; `layerHeight` 2 = default
  layer; a `width×height`-tile map has `(width+1)×(height+1)` vertices;
  one tile = 128 world units.
- Rotations in `units.json`/`doodads.json` are degrees in JSON but stored as
  float32 radians — they do NOT round-trip exactly (270° → 269.977°...).
  JSON stabilizes after one write/read cycle; the committed demo source is
  such a fixed point.
- Null FourCC values (e.g. "no weather") read back as the ASCII string
  `'0000'`, not `'\0\0\0\0'` — keep the `'0000'` form in JSON.
- Gold mines (`ngol`) gain a `gold` field on read (default 12500).
- `info.json` `scriptLanguage`: 0 = JASS, 1 = Lua. The game then expects
  `war3map.j` or `war3map.lua` respectively.
- HM3W name is null-terminated; keep it under ~495 bytes so flags/maxPlayers
  fit in the 512-byte block.

## stormlib-node (optional npm alternative to smpq)

Works, but has sharp edges (why the toolkit shells out to smpq instead):

- `SFileGetFileSize` returns a **BigInt** — `Number(size)` before use.
- `SFileReadFile` requires an **ArrayBuffer**; passing a Node Buffer causes a
  **native SIGABRT** (process death, not an exception).
- Same ArrayBuffer rule applies to war3-model's `parseMDX`:
  `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.

## References

- WC3 map file spec: https://github.com/ChiefOfGxBxL/WC3MapSpecification
- wc3maptranslator (JSON translators): https://github.com/ChiefOfGxBxL/WC3MapTranslator
- HiveWE (C++ world editor, format docs in wiki): https://github.com/stijnherfst/HiveWE
- War3Net (C# full map/campaign lib, classic+reforged): https://github.com/Drake53/War3Net
- mdx-m3-viewer (JS parsers incl. wtg/wct/mdx/blp — good fallback): https://github.com/flowtsohg/mdx-m3-viewer
- pjass (JASS syntax checker): https://github.com/lep/pjass
- jassdoc (JASS native documentation): https://github.com/lep/jassdoc
- Lua map scripting: the game calls `config()` (lobby) and `main()` (start);
  common.j natives are exposed to Lua 1:1 (`FourCC('hfoo')` for rawcodes).
