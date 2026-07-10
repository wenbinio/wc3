# wc3-map-toolkit — agent instructions

Headless Warcraft III `.w3x` map toolkit (read / translate / edit / build).
No game install needed. Everything runs on Linux with node + smpq.

## First step in any session

```bash
bash scripts/setup.sh   # idempotent: apt-get smpq if missing + npm install
npm test                # 21 tests; should all pass before you change anything
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
template — copy it to start a new map). Build outputs go to `_build/`
(gitignored); never commit `.w3x` files.

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

## Where things live

- `lib/filemap.js` — the war3-file ⇄ translator ⇄ JSON-name table (add new
  formats here; tools pick them up automatically)
- `lib/header.js` / `lib/mpq.js` — HM3W header, smpq wrapper
- `lib/source.js` — map-source ⇄ extracted-dir conversion (the core logic)
- `docs/FORMATS.md` — format knowledge + external references
- `docs/PIPELINE.md` — step-by-step workflows incl. asset imports
- `.claude/skills/` — wc3-read-map, wc3-build-map, wc3-new-map
