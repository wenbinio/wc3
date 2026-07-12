# End-to-end workflows

All commands run from the repo root. Run `bash scripts/setup.sh` once first.
Everything is headless — no Warcraft III installation needed.

## 1. Read an existing map

```bash
node tools/w3x-extract.js path/to/somemap.w3x /tmp/work/extracted
node tools/map-to-json.js /tmp/work/extracted /tmp/work/src
```

- `extracted/` holds the raw archive members (`war3map.w3e`, `war3map.w3i`, ...)
  plus `_header.json` (the parsed 512-byte HM3W pre-header).
- `src/` is the editable map source: JSON for every translatable file,
  scripts (`war3map.lua`/`war3map.j`) at top level, everything else copied
  verbatim under `files/`, and a `manifest.json` describing what happened.

Inspect quickly:

```bash
node -e "const i=require('/tmp/work/src/info.json'); console.log(i.map.name, i.players.length + ' players')"
```

Gotchas:

- **w3e v11 / w3i v25/v31 / object data v1/v2 are NOT a problem**: real
  published maps (including 1.36/2.0-editor-saved, Wurst-built and classic
  ones) ship these versions, and `lib/codecs/` translates them into the
  normal editable terrain.json/info.json/objects-*.json (with a
  `"version"` marker that routes the write path back through the same
  codec byte-faithfully). Expect NO manifest error and no `_viewer/` entry
  for them — edit and rebuild as usual. A w3i v25/v31 whose TAIL a
  protector truncated (players section onward) also lands editable, with
  `_truncated`/`_truncatedAt` markers that keep the write-back
  byte-faithful — keep the markers.
- **Classic (pre-Reforged) maps**: remaining old-version files (w3i v18,
  classic doo, ...) fail in wc3maptranslator@5 —
  sometimes with its version message, but often with a plain
  `RangeError: offset out of range` (e.g. classic `war3map.doo` v8).
  `map-to-json.js` handles ANY such throw: the file is copied through raw
  under `files/` and the error is recorded in `manifest.json` → `errors`. You
  can still edit scripts/assets and repack. Additionally, on any translator
  failure a fallback parse via mdx-m3-viewer-th is attempted for every file
  the viewer has a parser for, written to `_viewer/<name>.json` (listed in
  `manifest.json` → `viewerFallback`). **`_viewer/` is read-only diagnostics**
  in the viewer's own object schema — it is *not* the build-source dialect:
  json-to-map/build-map ignore it entirely (underscore paths never enter an
  archive), so use it to inspect classic maps, never to edit them.
  - When even the viewer's own parser throws (common with protector-truncated
    files), the failure is recorded in `manifest.json` →
    `viewerFallbackErrors` and warned about on stderr — never swallowed. A
    truncated **classic** `war3map.w3i` additionally gets a tolerant
    second-tier read via `lib/classicw3i.js` (header through forces, tolerant
    of a chopped tail; output tagged `_schema: wc3-map-toolkit-classic-w3i`
    with `_truncated`/`_truncatedAt`). This read-only path is only reached
    when the w3i is cut inside the settings block (or is a version with no
    codec, e.g. v18) — a v25/v31 truncated in the tail sections stays fully
    editable via the codec (see the bullet above).
- **Protected maps**: the MPQ `(listfile)` is stripped, so member names are
  unrecoverable and every entry enumerates as a `FileNNNNNNNN` pseudo-name
  (both backends). `w3x-extract.js` falls back to probing a built-in list of
  known `war3map.*` names — you still get the standard files. It **always
  prints entry counts** (`archive entries: N — named extracted: X,
  unresolved (anonymous): Y`) so you can see how many custom imports remain
  hidden. To recover those anonymous members, rerun with `--dump-unknown`
  (or `WC3_EXTRACT_UNKNOWN=1`): each unresolved member is written under
  `_unknown/FileNNNNNNNN.<ext>` with a content-sniffed extension (`MDLX`→
  `.mdx`, `BLP1`/`BLP2`→`.blp`, text→`.txt`, else `.bin`; duplicates of
  named extractions are skipped). **`_unknown/` is diagnostics only** —
  map-to-json skips it (recorded in `manifest.json` → `skipped`) and it never
  re-enters a rebuilt archive.
  - Most anonymous NAMES are recoverable after all: `w3x-extract
    --recover-names` (implies `--dump-unknown`) harvests candidate paths
    from the extracted content itself — scripts, object-data art/model
    fields, `.toc` lines, MDX TEXS texture paths, derived BTN/DISBTN and
    `.mdl`↔`.mdx` variants — and hash-probes them against the archive
    (exact-name MPQ lookup needs no listfile), iterating to a fixpoint
    (`lib/recover.js`). Hits are extracted under their real names and their
    `_unknown/` duplicates pruned; 448 and 401 imports were renamed this
    way on two real protected maps. Only what the map never references by
    path stays anonymous.
- **MPQ backends**: archive I/O uses the stormlib-node native module when
  loadable and the smpq CLI otherwise. Force the fallback with
  `WC3_MPQ_BACKEND=smpq` (e.g. `npm run test:smpq` runs the whole test suite
  that way — do that whenever you touch lib/mpq.js).

## 2. Modify a map and rebuild it

```bash
# ... edit /tmp/work/src/info.json, units.json, war3map.lua, etc ...
node tools/json-to-map.js /tmp/work/src /tmp/work/rebuilt
node tools/w3x-pack.js /tmp/work/rebuilt /tmp/work/modified.w3x
node tools/validate-map.js /tmp/work/modified.w3x
```

`_header.json` is carried through automatically so the original HM3W
pre-header (map name/flags/maxPlayers) is preserved. Edit it to change the
lobby-visible map name.

Shortcut: `node tools/build-map.js /tmp/work/src /tmp/work/modified.w3x`
does json-to-map + pack in one step. Add `--stabilize` to also run the
gotcha-6 stabilization cycle (§3) after the build, and
`--variant-name <name>` for pack-time A/B name overlays (§7).

## 3. Build a new map from scratch

Start from the demo template:

```bash
cp -r maps/demo maps/mymap
# edit maps/mymap/{info,terrain,units,doodads,strings}.json and war3map.lua
node tools/build-map.js maps/mymap _build/mymap.w3x
node tools/validate-map.js _build/mymap.w3x
```

Things that must stay consistent with each other:

- `terrain.json` `map.width/height` (tiles) ⇒ all per-vertex arrays have
  `(width+1)*(height+1)` entries; world coords span `width*128` centered on
  `map.offset`.
- `files/war3map.wpm` and `files/war3map.shd` sizes derive from terrain size
  (`width*4 × height*4` cells) — but you no longer hand-craft them:
  build-map **auto-generates** all-passable/no-shadow defaults from
  terrain.json when the source ships neither under `files/`
  (lib/pathing.js; byte layouts in docs/FORMATS.md). A provided `files/`
  copy is packed verbatim — never clobbered — and build-map WARNs when its
  size doesn't match the terrain dims (the classic resize foot-gun,
  gotcha 8). After a terrain resize, simply delete the two files (or fix
  your own pathing data to the new dims).
- `info.json` `players[].startingPos` ⇔ `units.json` `sloc` entries ⇔
  `DefineStartLocation`/`SetPlayerStartLocation` calls in `war3map.lua`.
- `info.json` `scriptLanguage`: **1 for Lua, 0 for JASS.** Ship `war3map.lua`
  defining `config()` and `main()` (see `maps/demo/war3map.lua`); for JASS
  ship `war3map.j` instead.
- `info.json` `camera.bounds` should sit inside the terrain extent.
- `info.json` `forces` must contain at least one force covering the players
  (every WE map has ≥1) — `[]` is another pick-time divergence.

### Preplaced units actually spawn via CreateAllUnits() (generated)

`war3mapUnits.doo` is **editor-only**: the game spawns only script-created
units (WE compiles placements into `CreateAllUnits()`; map protectors delete
Units.doo freely). On every build, build-map appends a marker-delimited block
to the **packed** `war3map.lua` (the source file is never modified):

- `function CreateAllUnits()` — one `CreateUnit` per non-`sloc` entry of
  `units.json` (position/facing/player), plus `SetResourceAmount` for gold
  mines, `SetHeroLevel/Str/Agi/Int` where relevant, and
  `SetUnitAcquireRange(u, 200)` for camp-acquisition creeps
  (`targetAcquisition: -2`). `sloc` entries are skipped — start locations
  belong in `config()`'s `DefineStartLocation` calls.
- Your `main()` should call `CreateAllUnits()` (before any code that
  enumerates preplaced units — see maps/crossroads-siege/war3map.lua). If the
  script never mentions `CreateAllUnits`, the block additionally wraps
  `main()` so the units are created right after your `main()` returns.
- The block is stripped and regenerated each build, so extracted sources
  repack cleanly. Edit units.json, not the generated Lua — units.json stays
  the single source of truth. JASS sources (`war3map.j`) are copied
  untouched; write your own `CreateAllUnits` there.
- **Stabilization cycle is one command now**: `build-map --stabilize`
  runs the build → extract → map-to-json round trip and rewrites ONLY the
  translatable `*.json` files that changed (float rotations etc., CLAUDE.md
  gotcha 6), printing which ones; one run reaches the fixed point. It never
  touches `war3map.lua`/`war3map.j`, `files/` or `imports/` — the old
  manual cycle's trap (copying the extracted `war3map.lua`, which contains
  this generated block, back into the source) is structurally impossible.
  If you still run the cycle by hand, commit the `*.json` files ONLY.

### Named constants instead of raw FourCCs (generated)

Never hand-type `FourCC("xxxx")` rawcodes in map code — every industrial WC3
pipeline generates named constants, and hand-typed rawcodes caused real bugs
here (wrong-case codes, stale clone ids, region coordinates duplicated out of
sync with regions.json). On every build, build-map PREPENDS a second
marker-delimited block (`lib/constants.js`, same strip-and-regenerate
lifecycle as CreateAllUnits) above the user script in the **packed**
`war3map.lua`, defining one Lua global per:

- object-data entry in `objects-*.json` — all seven types, custom and
  modified-original entries, Reforged skin twins merged onto the same
  rawcode, `TRIGSTR_n` names resolved through strings.json:
  `UNIT_CROSSROADS_MILITIA = FourCC("h000")`;
- distinct type placed/referenced in `units.json` (unit types, inventory /
  customItemSets items, preplaced abilities) and `doodads.json` — entries
  with no display name use the rawcode verbatim (`UNIT_hfoo`; Lua
  identifiers are case-sensitive, exactly like rawcodes);
- region in `regions.json` / sound in `sounds.json` — inert data tables,
  since war3map.w3r is editor data and Lua maps create their own rects:
  `Rect(REGION_SPAWN_NORTH.minX, REGION_SPAWN_NORTH.minY,
  REGION_SPAWN_NORTH.maxX, REGION_SPAWN_NORTH.maxY)` and
  `CreateSound(S.path, S.looping, S.is3D, S.stopOutOfRange, S.fadeIn,
  S.fadeOut, S.effect)`.

Naming: `PREFIX_` (UNIT_/ITEM_/DEST_/DOOD_/ABIL_/BUFF_/UPGR_/REGION_/SOUND_)
plus the sanitized ASCII display name (CamelCase split, uppercased); name
collisions suffix ALL colliders with `_<rawcode>` (regions `_<id>`, sounds
`_<index>`), so the scheme is order-independent. build-map also rewrites a
machine-readable index `<map-source>/constants.json`
(constant → rawcode/name → source file) — grep it to find the right name.
`maps/demo/war3map.lua` uses `UNIT_hfoo` as the worked example. Traps:
CLAUDE.md gotcha 27 (renames/collisions RENAME constants — stale references
are runtime nil, not parse errors; don't define your own globals with these
prefixes; the block shifts packed-script line numbers in build errors).
Doodads vs destructables placed in doodads.json can only be told apart via
the map's own object data, so unclassified codes default to `DOOD_`.

**Generated-constant lint (build FAIL)**: build-map walks the packed
script's AST (lib/constlint.js) and fails the build on (a) any
reserved-prefix identifier REFERENCED but not defined by the generated
block — the object-rename runtime-nil trap, reported with the
source-relative line and the nearest same-prefix defined name when edit
distance suggests a rename — and (b) any user assignment/declaration
(global, local, function, parameter, loop variable) squatting on the nine
prefixes. The game's own API constants that share the prefixes
(`UNIT_STATE_LIFE`, `UNIT_TYPE_HERO`, `SOUND_VOLUMEGROUP_*`, ...) are
whitelisted from (a) via the sim's JASS API table. Direct identifiers
only: dynamic access (`_G["UNIT_" .. x]`) is out of scope, as are table
fields and goto labels. JASS (`war3map.j`) gets no lint (no injection).

### Minimap preview (generated)

Every real map ships a minimap image + icons file; the map picker renders
them. When the source provides neither, build-map generates:

- `war3mapMap.tga` — a 256×256 preview rendered from terrain.json (tile
  colors, water/blight tint, cliff/height shading);
- `war3map.mmp` — one player-colored icon per `sloc`, plus gold-mine and
  neutral-building icons (see lib/minimap.js; format in docs/FORMATS.md).

Override by shipping your own `files/war3mapMap.blp` (or `.tga`) and/or
`files/war3map.mmp`.

Script syntax gate: build-map parses the **packed** `war3map.lua` (source
script + generated blocks) with luaparse in Lua 5.3 mode and fails the build
on a syntax error, reporting the line in the packed script. validate-map
runs the same check on any packed map (`lua syntax war3map.lua` line).

JASS note: if you write `war3map.j`, you can optionally syntax-check it with
pjass (https://github.com/lep/pjass, builds with `make`); it needs the
`common.j`/`Blizzard.j` from the game data, which are not shipped here.

## 4. Import custom assets (MDX models, BLP textures, ...)

Drop assets into the map source `imports/` tree; the path relative to
`imports/` becomes the archive path:

```
maps/mymap/imports/war3mapImported/MyModel.mdx
maps/mymap/imports/war3mapImported/MyTexture.blp
```

`build-map.js` packs them at those paths and **auto-generates `war3map.imp`**
(the import manifest) — unless you provide your own `imports.json`
(array of archive paths, backslash-separated, e.g.
`"war3mapImported\\MyModel.mdx"`).

Reference the assets from object data, e.g. in `objects-units.json` set a
custom unit's model field (`umdl`) to `war3mapImported\MyModel.mdl` — model
FIELD values always use the `.mdl` extension even for an `.mdx` archive
member (the engine swaps the extension at load; a literal `.mdx` value
renders an invisible unit — CLAUDE.md gotcha 22). Archive paths and
imports.json entries keep the real `.mdx`; only object-data model fields
(`umdl`/`dfil`/`bfil`/`ifil`) take `.mdl`.

Working with models/textures programmatically — use `war3-model`:

```js
const fs = require('fs');
const { parseMDX, generateMDX, parseMDL, generateMDL, decodeBLP } = require('war3-model');
const buf = fs.readFileSync('model.mdx');
// parseMDX wants an ArrayBuffer, NOT a Node Buffer:
const model = parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(model.Version, model.Geosets.length);
fs.writeFileSync('model.mdl', generateMDL(model)); // MDX -> readable MDL text
```

## 5. Validate anything

```bash
node tools/validate-map.js somemap.w3x
```

Checks: HM3W pre-header, MPQ magic at offset 512, extraction, presence of
`war3map.w3i`/`w3e` and a map script, a Lua syntax check on `war3map.lua`
(luaparse, Lua 5.3 grammar — a broken script loads as a silently dead map),
and for every translatable file a parse **plus** a JSON→binary→JSON
stability cycle. Exit code 0 = all pass.

Object data additionally gets a **semantic lint** (lib/objectlint.js) whose
findings print as `WARN` lines and never fail the map (exit stays 0): model
fields ending in `.mdx` or `war3mapImported` model references with no
matching archive member after `.mdl`↔`.mdx` normalization (gotcha 22),
items overriding `unam` with neither `ifil` nor `iico` (gotcha 23), and
units with a build list whose overridden `uabi` lacks a repair ability
(Ahrp/Arep/Aetr/Awha; only the human AHbu+Ahrp pair is playtest-verified —
gotcha 25). These encode in-game playtest bugs that are structurally valid,
so they warn instead of failing.

Then a **second-opinion cross-validation** via mdx-m3-viewer-th's independent
parser stack (`viewer ...` lines in the report):

- its MPQ reader must open the archive and see the members;
- every inner file it has a parser for must parse — this covers
  `war3map.wpm`/`shd`/`mmp`/`wct`, which wc3maptranslator has no translator
  for (`war3map.w3c` and `war3map.wtg` are excluded — see docs/FORMATS.md);
- every packed `.mdx`/`.mdl` gets its MDX sanity test; findings are **WARN
  only** here — repacked third-party maps ship hundreds of models that fail
  the 0-errors/0-severes bar yet run in game. The STRICT tier lives in
  **build-map**, which FAILS the build when any model under the map
  source's `imports/` has errors or severe issues (a malformed custom
  model hard-crashes the game at map load — e.g. a missing Death sequence
  or a Bone referencing a nonexistent GeosetAnim; CLAUDE.md gotcha 14).

The viewer is read-only here: its MPQ *write* path is known-broken
(locale/platform swap) and is never used, and it is always fed fresh
`Uint8Array` copies, never Node Buffers (see docs/FORMATS.md).

## 6. Optional third opinion: War3Net (.NET)

For gnarly cases (classic formats, campaign files, disputed field layouts),
[War3Net](https://github.com/Drake53/War3Net) (C#, MIT) is the most complete
independent implementation. It is **not** a dependency of this toolkit —
nothing here requires dotnet. `scripts/crossvalidate-war3net.sh` documents
the recipe: it checks for `dotnet` (`apt-get install -y dotnet-sdk-8.0`),
scaffolds a tiny console project referencing
`War3Net.Build.Core`, and runs `MapInfo.Parse`/`MapEnvironment.Parse` over an
extracted map directory, reporting per-file parse results. Use it when the
two bundled parser stacks disagree and you need a tie-breaker.

## 7. Diagnostics / A-B testing maps in-game

The game's map list shows the map NAME stored **inside** the file (HM3W
header + w3i name), never the filename — so `siege-no-sounds.w3x` and
`siege-no-import.w3x` both appear identically as "Crossroads Siege" and
cannot be told apart in-game. When building variant maps for in-game
bisection/A-B testing, give EACH variant a distinct in-game name — one
command per variant:

```bash
node tools/build-map.js --variant-name "Siege DIAG-1 no-objabil" \
  maps/crossroads-siege _build/siege-diag1.w3x
```

The overlay is applied at pack time in every place the game reads the name
(HM3W header name + w3i map name, with any `TRIGSTR_n` indirection resolved
to the plain variant string); the source directory is not modified.
(Manual equivalent: change the TRIGSTR entry in `strings.json` that
`info.json` `name` points to — or `name` directly — AND `_header.json`
`name`.) Renaming the `.w3x` alone is invisible in-game. `--variant-name`
is mutually exclusive with `--stabilize`, which would write the overlay
into the source.

**Known-working-reference debugging**: before (or instead of) in-game
bisection, decompose a map where the misbehaving mechanic provably works
(§1; for classic/protected maps use the `_viewer/` dumps) and copy its
exact object-data field IDs and art paths. The decomposed FoTN
(docs/reference/fotn-analysis.md) is the worked example — its live w3u/w3t
entries exposed the `.mdl` model-field rule, the item identity field set
and the AHbu+Ahrp builder pair (CLAUDE.md gotchas 22, 23, 25).

## 8. Logic-test map mechanics headlessly (before any human playtest)

Everything in §5 is STRUCTURAL — a script can pass every parse gate and
still be semantically broken (a grace period that never sets alliances, a
victory check that never fires, tax math off by a divisor, a spawn table
wired to the wrong slot). The logic-sim tier actually EXECUTES the map:

```bash
node tools/test-map-logic.js maps/<name>          # run maps/<name>/tests/*.test.js
node tools/test-map-logic.js                      # every map with a tests/ dir
node tools/test-map-logic.js --coverage maps/<name>  # real vs auto-stubbed natives
npm run test:logic                                # same as the no-args form
```

`lib/sim` loads the **packed** `war3map.lua` — assembled through the real
build pipeline (`sourceToExtracted`), so the generated named-constants and
`CreateAllUnits()` blocks are exactly what ships — into fengari (a pure-JS
Lua 5.3 VM, the same Lua the game runs) with mocked natives, runs
`config()` then `main()`, and hands back a deterministic harness
(virtual clock at t=0/08:00, seeded RNG, timers fire in due order):

```js
const { loadMap } = require('../../../lib/sim');   // from maps/<name>/tests/
const sim = loadMap(path.join(__dirname, '..'));

sim.advance(301);                 // fire every timer due in 301 virtual seconds
sim.chat(0, '-test');             // deliver a chat event to player 0's triggers
sim.kill(sim.findUnit('nder'), sim.findUnit('H000', 0));  // death event + killer
sim.damage(src, tgt, 40);         // real UnitDamageTarget path: DAMAGING/DAMAGED
                                  // events, BlzSetEventDamage, death w/ kill credit
sim.moveUnit(u, x, y);            // position + enter/leave-region events
sim.constructFinish(u); sim.upgradeFinish(u, 'h003'); sim.pawn(hero, item);
sim.leave(1);                     // player-leave event

sim.player(0).gold                // PLAYER_STATE_RESOURCE_GOLD readback
sim.alliance(0, 1, 'ALLIANCE_PASSIVE')   // per-direction alliance state
sim.unitsOf(pid, 'h003')          // live unit records {typeStr, x, y, alive...}
sim.dests('LTlt')                 // destructable records (from doodads.json)
sim.itemsByType('I000')           // dropped/created items
sim.results                       // pid -> 'victory' | 'defeat' (Custom*BJ)
sim.messages / sim.messagesTo(0)  // DisplayText* transcript
sim.calls / sim.callsOf(name)     // every native call, with virtual timestamps
sim.global('someGlobal'); sim.run('lua...')      // reach into the VM
```

Test files are plain `node:test` JS under `maps/<name>/tests/*.test.js`
(the ONE convention — they run standalone via the tool above AND are
auto-discovered by the repo-wide `npm test`). Write one for every mechanic
you script; maps/northreach/tests/founders.test.js is the worked example
(grace truce, corruption tax, debug gating, endgame purge, hunting drops,
market currency return, revives, leavers).

Mock tiers and their honesty rules (details in lib/sim/natives.js):

- **Real semantics**: timers/virtual clock (default day = 480s, starts
  08:00), players (alliances per direction+type, resources, slots,
  controllers), units/heroes, groups, items, rects/regions, triggers +
  events (chat substring/exact, deaths with killer, enter/leave region,
  construct/upgrade/pawn/leave, timer-expire), FourCC, seeded RNG;
  **damage** — `UnitDamageTarget` applies FLAT (no mitigation, and
  deliberately NO crit/miss randomness: engine randomness would consume or
  fork a map's seeded PRNG stream, gotcha 30), fires
  `EVENT_PLAYER_UNIT_DAMAGING` then `EVENT_PLAYER_UNIT_DAMAGED` BEFORE
  hit points are deducted (`GetEventDamage`/`GetEventDamageSource`/
  `BlzGetEventDamageTarget`; `BlzSetEventDamage` replaces the pending
  amount that then gets applied), and a lethal hit runs the normal death
  path with kill credit to the source; damage handlers may nest damage up
  to depth 8, deeper hard-errors naming the trigger (no infinite loops);
  **destructables** — instantiated at load from the map source's OWN
  doodads.json (map-delta classification: a type in objects-doodads.json
  is decorative and skipped, everything else is modeled; max life/name
  from objects-destructables.json `bhps`/`bnam` when overridden, neutral
  100/typeStr otherwise — never fabricated Blizzard stats), with real
  `EnumDestructablesInRect` (dead ones still enumerate, like the game),
  `KillDestructable`, life get/set, and the widget-death event
  (`TriggerRegisterDeathEvent` / `TriggerRegisterDestDeathInRegionEvent`,
  first 64 like the real BJ). Full policy text: lib/sim/natives.js header.
- **Auto-stub**: any OTHER name in the real JASS API surface (native + BJ
  list extracted from the community jassdoc into
  lib/sim/data/jass-constants.json) resolves to an inert recording
  function returning a unique handle string. Stubs never simulate — if a
  mechanic depends on one (check `--coverage`), the sim is silently not
  testing it. A stub result reaching arithmetic fails LOUDLY with the
  native's name: implement the native in lib/sim/natives.js rather than
  papering over it. Names OUTSIDE the API surface stay nil, so map-author
  globals keep normal Lua truthiness.
- **Not modeled** (drive outcomes explicitly instead): pathing/movement,
  combat and AI (units never fight on their own — use `sim.kill`/
  `sim.damage`), abilities, object-data stat effects (only
  igol/uhpm/unam/bhps/bnam are read, for pawn values, max life and names),
  `TriggerSleepAction`/`PolledWait` (recorded no-ops). The sim complements
  the in-game protocol (§7); it never replaces it.

**Golden-run re-pin doctrine** (applies every time a stub is promoted to
real semantics — this is how sim-fidelity tiers land): promoting a native
can shift a pinned golden-run beat sequence (gotcha 30), because behavior
the map script already invokes starts actually happening. A shifted golden
run is NEVER regenerated blindly. The procedure: (1) run the golden-run
test and capture the old vs new beat sequences; (2) diff them and review
EVERY changed beat — each change must be explainable by the specific
semantics that were promoted (if a change has no such explanation, it is a
regression, not drift); (3) record the reviewed diff and the explanation in
the commit/report; (4) only then update the pinned expectation. If the
golden run does NOT shift, say so explicitly when landing the tier.
(WP-B1, the damage+destructables tier, shifted nothing: vaults-of-ash has
zero doodads.json entries and never calls the promoted natives.)

Proof of value: the sim's first full playthrough caught crossroads-siege
wave 10 spawning FIVE Dreadflesh Colossi — the per-wave escalation bonus
applied to the first-listed unit type, which on the boss wave was the boss
itself (five loot drops included). Every parse-level gate passed that map
for months (test/maplogic.test.js keeps the regression).
