# Toolkit upgrade plan — 15 September 2026

## Scope and evidence boundary

This patch builds on `1ebd89ef09ac0a8de74e69c6b374fdb64c20b8aa`; it does not
upgrade dependencies, rewrite maps, change game assets or tune the Rome AI.
Blizzard's official 3.0.0 / build 24268 notes are dated 12 September 2026.
Neither a Warcraft client nor user-supplied 3.0 `common.j` / `Blizzard.j`
was available for this patch. Consequently **3.0 map-format preservation,
new-native runtime behaviour and actual game acceptance remain unverified**.

Official release notes (features, not a machine-readable format contract):
https://us.forums.blizzard.com/en/warcraft3/t/warcraft-iii-reforged-forsaken-kingdom-patch-notes/38400

## Implemented in this patch

1. **Independent CI:** `.github/workflows/toolkit.yml` runs base and head with
   explicitly selected StormLib and smpq backends, locked npm dependencies,
   pinned pjass, native Lua 5.3, unit tests and preflight. The test command's
   failure cannot prevent preflight from running. Action permissions are
   read-only and checkout does not persist credentials. This is not a required
   branch-protection rule yet. Without local game API files, pjass is not proof
   against the exact installed native API. Existing WARNs remain visible.
2. **Skin preservation:** `extractedToSource` defers companion-file disposal
   until its parent's conversion succeeds. Orphan skins and skins whose
   parents fail conversion survive under `files/`, with an explanatory manifest
   entry. Successfully merged pairs retain the existing path and do not gain
   stale raw-file overrides. Three regression tests cover the registered pairs.
   This does NOT establish losslessness when a parser silently ignores new data.
3. **Member comparison:** `tools/compare-map-members.js` hashes actual files in
   two extracted directories and reports changed, added and removed members.
   It includes `_header.json`; allows only explicit operation/path exceptions;
   records ignored MPQ metadata and diagnostic files; bounds reads; rejects
   symlinks, unsafe names and ambiguous ASCII case/separator collisions.
   Anonymous `_unknown/` members or empty inventories force `INCOMPLETE`.
4. **API inspection:** `tools/inspect-game-api.js` snapshots actual user-supplied
   `common.j` native declarations with a source hash, and compares two versions.
   Removed natives, changed parameter types/order/constness/return types, and
   missing explicitly required names cause a nonzero exit. Parameter renaming
   alone does not. A user-entered build label remains explicitly unverified.
   This is not a JASS compiler, implementation audit or binary-format check.
5. **Portable agent entrypoint:** `AGENTS.md` points agents to the existing
   hard-won instructions and records the preservation/evidence requirements.

The 27 standalone utility tests use authored parser/byte fixtures, not game
telemetry. Their passing is not a client result. Full-suite and preflight
results belong to the exact PR head's Actions run; do not carry a previous
head's green status across code changes.

## Using the added tools

Keep authorized original maps and game files outside the repository. Always
write a fresh output and a fresh extraction directory. Example: for an approved
script-only edit, extract ORIGINAL and REBUILT maps using the existing tools,
record each extraction's extracted/total/unresolved counts, then run:

```sh
node tools/compare-map-members.js /tmp/before /tmp/after \
  --allow-changed war3map.j > /tmp/member-report.json
```

Do not reuse `war3map.j` as the allowance for a Lua map: name the actual intended
member. No wildcard exemptions exist. `--allow-added` and `--allow-removed`
are deliberately different from `--allow-changed`. An allowance authorizes a
reviewed delta; it does not verify that the changed script behaves correctly.

Exit 0 means `MATCH_WITHIN_SCOPE`, not a complete archive audit. Exit 1 means
unexpected differences or an incomplete inventory; exit 2 means invalid input
or an inspection error. If the extractor silently omitted a member and did not
write `_unknown/`, this directory-only tool cannot discover it. Known MPQ
metadata is ignored by default but included in the report; use
`--include-mpq-metadata` to compare it too. Repacking can invalidate signatures.
The comparator's filesystem checks do NOT repair extraction vulnerabilities.

For API declarations, obtain the files from the authorized installed client;
do not download an unrelated patch's copy and call it current:

```sh
node tools/inspect-game-api.js snapshot /private/current/common.j \
  --label 'locally reported build; verify separately' > /tmp/api-current.json
node tools/inspect-game-api.js diff /private/previous/common.j \
  /private/current/common.j > /tmp/api-diff.json
```

Use repeated `--require NAME` on `snapshot` for names taken from inspected code
or files, never invented names. Exit 1 signals a missing requirement or breaking
declaration delta; exit 2 signals bad input. No breaking declaration change does
not imply game compatibility. Constants, typedefs, Blizzard.j helper bodies,
Lua native implementation and map-format changes are outside this tool's scope.

## Recommended next work, in order

### 1. Harden extraction and introduce a separate release gate

Audit both archive backends for path traversal, absolute/drive/UNC names,
symlink escape, collisions, per-member expansion and aggregate budgets. Reject
before writing outside the destination; make extraction completeness a JSON
manifest rather than console-only counts. Extend comparison to consume that
manifest and require complete inventories for preservation acceptance.

Keep development preflight's useful WARNs, but add an explicit release profile:
required tools/API files cannot be absent; unresolved required imports and
unapproved provenance cannot silently pass. Classify warnings and require
narrow, versioned exceptions with reasons rather than blanket suppression.
Credit is not enough for assets that disallow redistribution or rehosting.
Add a required CI status only after this workflow proves reliable; no repository
settings were changed by this patch. Cache-free reproduction should remain
possible. Do not convert every existing cosmetic warning into a blocker.

### 2. Build a real 3.0 compatibility corpus before upgrading codecs

Create small maps in the actual new editor, one feature at a time: plain
JASS/Lua baselines; changed environment/lighting data; transforms/alpha tiles;
equipment-related object data; HUD configuration; Lua persistence. Record the
editor/game build and hashes. These must be actual editor outputs, not hand-
invented binary samples presented as interoperability evidence.

For each: original extraction inventory -> source conversion -> rebuild ->
member report -> editor reopen -> actual client load. Explain expected changes,
check parser byte consumption/version dispatch and preserve unknown fields or
leave the whole member opaque. A successful parse is not proof of losslessness.
Use minimal, authorized self-authored fixtures; do not commit game API files or
third-party protected maps. Keep wc3maptranslator pinned until a proposed update
passes old and new fixtures on both backends without unexplained member loss.

### 3. Bind API and mock support to actual installed builds

Feed a real old/new `common.j` pair into the new inspector, associate its hash
with the separately verified client build, and configure full pjass checking
using matching local `common.j` + `Blizzard.j`. Then add new Lua natives to the
simulation only with explicit statuses: implemented approximation, deliberate
stub, or unsupported. A declaration does not establish semantics. Add tests
only after inspecting signatures; do not guess reset/cooldown/aura names.

### 4. Close the actual-client feedback loop

Use an authorized online Windows machine to copy a fresh build, launch the
client, load the map, exercise a minimal scenario and collect real logs,
screenshots and where applicable replays. Keep executable/artifact/build hashes
with each result. Separately track picker/lobby/load, graphics, input, camera,
pathfinding, save/load, performance and multiplayer checks. A GUI launch alone
proves none of those. Multiplayer needs genuinely distinct clients/networks.

The 3.0 Reforged online requirement changes isolated-test assumptions; do not
promise LAN/offline automation for that client. Existing legacy behaviour is a
separate compatibility target. No client automation or live test was performed
in this patch because the connected computer was offline.

For Rome, first reproduce a documented failure with real telemetry and fix its
regression test. Do not substitute toy-world outcomes for measured territory,
combat or stability, or alter the experiment endpoints to make a run look good.

### 5. Optional visual-authoring upgrades, not another build system

Evaluate HiveWE 0.10 for terrain/pathing and asset inspection alongside the
source pipeline. It is not a replacement for actual game acceptance. Evaluate
War3Net selectively as an independent parser; do not depend on roadmap-only
headless emulation, unified CLI or IDE features. Defer broad package upgrades
and new art/native wrappers until the real fixture corpus identifies a need.

Primary project release pages:
https://github.com/stijnherfst/HiveWE/releases
https://github.com/Drake53/War3Net/releases
