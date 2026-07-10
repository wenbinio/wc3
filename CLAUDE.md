# wc3-map-toolkit — agent instructions

Headless Warcraft III `.w3x` map toolkit (read / translate / edit / build).
No game install needed. Everything runs on Linux with node + smpq.

## First step in any session

```bash
bash scripts/setup.sh   # idempotent: apt-get smpq if missing + npm install
npm test                # 26 tests; should all pass before you change anything
```

## Commands

```bash
node tools/w3x-extract.js  <map.w3x> <outdir>        # header -> _header.json, extract MPQ
node tools/map-to-json.js  <extracted-dir> <json-dir> # binaries -> editable map source
node tools/json-to-map.js  <json-dir> <out-dir>       # map source -> binaries
node tools/w3x-pack.js     <dir> <out.w3x>            # binaries -> MPQ v1 + HM3W header
node tools/build-map.js    <map-source-dir> <out.w3x> # one-step: source -> .w3x
node tools/validate-map.js <map.w3x>                  # pass/fail report, exit 0 = good
```

Map source layout (editable form): see README.md and `maps/demo/` (a working
template — copy it to start a new map); `maps/crossroads-siege/` is the
full-featured reference (terrain/regions/cameras/sounds/object data/imports).
Scratch build outputs go to `_build/` (gitignored). Exception: `maps/builds/`
holds the committed compiled `.w3x` artifacts of the bundled map sources —
regenerate them with `node tools/build-map.js maps/<name> maps/builds/<name>.w3x`
whenever a map source changes. Never commit any other `.w3x` (and never
third-party maps, see gotcha 9).

## Gotchas (each of these cost real debugging time)

1. **Pin `wc3maptranslator@5.0.0`.** Unpinned resolves to 4.0.4 which has a
   different, broken API. v5 API is static methods:
   `InfoTranslator.warToJson(buffer)` → `{json}`,
   `InfoTranslator.jsonToWar(json)` → `{buffer}`.
2. **Reforged formats only**: classic maps' w3i/w3e/object files throw
   `VersionError`-style messages. The tools catch this and copy such files
   raw (check `manifest.json` → `errors`). Don't "fix" it — it's upstream.
3. **512-byte HM3W pre-header**: smpq reads `.w3x` directly but creates bare
   MPQs. w3x-pack prepends the header from `_header.json` (or synthesizes
   one). MPQ must be **v1** (`smpq -M 1`) for the game.
4. **Protected maps have no `(listfile)`** — extraction falls back to probing
   known names (`lib/mpq.js` KNOWN_FILES). Unknown custom imports are lost.
5. **stormlib-node / war3-model want ArrayBuffer, not Buffer.**
   Passing a Node Buffer to `SFileReadFile` SIGABRTs the whole process.
   `SFileGetFileSize` returns BigInt. Convert:
   `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`.
6. **JSON round-trips are stable, not byte-identical**: rotations go through
   float32 radians (270° → 269.977…°), null FourCCs read as `'0000'`.
   Always compare warToJson(jsonToWar(x)) against x, not bytes. The demo
   source JSON is a translator fixed point — keep it that way (build once,
   re-extract, and commit the stabilized JSON if you edit values).
7. **Lua maps**: set `info.json` `scriptLanguage: 1` AND ship `war3map.lua`
   defining `config()` and `main()`. JASS = 0 + `war3map.j`.
8. If you resize terrain, regenerate `files/war3map.wpm` and `war3map.shd`
   (sizes depend on terrain dimensions — see docs/PIPELINE.md §3).
9. **Copyright**: never commit Blizzard-authored or downloaded third-party
   maps. Fixtures here are MIT (see fixtures/ATTRIBUTION.md).
10. **war3mapUnits.doo is EDITOR-ONLY** — the game never reads it; WE compiles
    placements into `CreateAllUnits()` in the map script. build-map therefore
    generates a marker-delimited `CreateAllUnits()` Lua block from units.json
    and appends it to the packed war3map.lua (`lib/unitscript.js`). Map
    scripts should call `CreateAllUnits()` from `main()` (before any code
    that enumerates preplaced units); if they never mention it, main() is
    auto-wrapped to call it last. units.json stays the single source of truth.
11. **The `'0000'` FourCC dialect must NOT reach the binary**: jsonToWar
    writes `globalWeather: '0000'` as the literal ASCII bytes `30303030`,
    which the map picker rejects as an invalid weather id (WE writes four
    ZERO bytes). `lib/source.js` normalizes `'0000'`/null → `''` before
    translating (translator then emits int 0). Keep `'0000'` in source JSON
    (gotcha 6); never bypass sourceToExtracted for info.json.
12. **Maps need a minimap preview or the picker shows nothing** (and older
    clients can crash): every real map ships `war3mapMap.blp/.tga` + a
    populated `war3map.mmp`. build-map auto-generates a 256x256 TGA from
    terrain.json and an mmp (one colored entry per `sloc`, entries for gold
    mines/neutral buildings — `lib/minimap.js`); drop your own files under
    `files/` to override. mmp entry: i32 type (0 mine, 1 neutral bldg,
    2 start loc), i32 x, i32 y (0-255, y flipped), u8[4] BGRA.
13. **HM3W header flags mirror the w3i flags dword** (WE writes the same
    value in both places). w3x-pack derives flags from the packed
    war3map.w3i when `_header.json` has flags 0 (`readW3iFlags` in
    lib/header.js). Flags 0 is a pick-time divergence every tool notices.
14. **Custom MDX must pass mdx-m3-viewer's sanityTest (0 errors/severes)** or
    the game hard-crashes at load. Classic traps: a Bone with unspecified
    GeosetAnimId defaults to 0 → "invalid geoset animation 0" when there is
    no GeosetAnim chunk (write `GeosetAnimId None` or add a GeosetAnim);
    missing "Death" sequence; missing "Origin Ref" attachment. Test with
    `mdx-m3-viewer-th` (devDependency) — and pass it a fresh
    `new Uint8Array(fs.readFileSync(p))`, NEVER a Node Buffer.

## Where things live

- `lib/filemap.js` — the war3-file ⇄ translator ⇄ JSON-name table (add new
  formats here; tools pick them up automatically)
- `lib/header.js` / `lib/mpq.js` — HM3W header (+ w3i flags reader), smpq wrapper
- `lib/source.js` — map-source ⇄ extracted-dir conversion (the core logic)
- `lib/minimap.js` — war3mapMap.tga + war3map.mmp generation (gotcha 12)
- `lib/unitscript.js` — CreateAllUnits() Lua generation/injection (gotcha 10)
- `docs/FORMATS.md` — format knowledge + external references
- `docs/PIPELINE.md` — step-by-step workflows incl. asset imports
- `docs/ASSETS.md` — sourcing/converting models & textures (MDX/MDL, BLP1
  encoding, glTF→MDX chain, legal rules)
- `.claude/skills/` — wc3-read-map, wc3-build-map, wc3-new-map,
  wc3-import-asset (asset inspect/convert/import recipe)
