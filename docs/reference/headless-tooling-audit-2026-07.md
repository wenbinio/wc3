# Headless tooling audit — can we improve further? (2026-07-12)

Three-agent parallel discovery: (A) internal gap/friction audit of this toolkit,
(B) external ecosystem sweep 2024–2026, (C) sim-fidelity feasibility study.
This doc is the synthesis: a ranked improvement program, the watch list, and the
consolidated "not worth doing" list. Originally assessment-only; Tier 1 has
since been implemented (see its status note). Every claim below was verified by the agents against the
current tree (HEAD `8d6d2cf`) or against live commit/release feeds fetched on
the audit date (not README claims).

**Verdict: yes — meaningfully improvable, on three independent axes.** The
core stack needs no replacement (formats are unchanged through game patch
2.0.4; our codecs already write the newest on-disk versions; no external
project replaces the fengari sim — it appears to be genuinely novel, with
Wurst's compiletime interpreter the only architectural sibling). The gains are:
(1) small internal automations that convert documented foot-guns into build
errors, (2) a legally clean sim-fidelity expansion, (3) a handful of cheap
ecosystem adoptions.

---

## 1. Ranked improvement program

### Tier 1 — internal quick wins (all S effort, low risk)

> **Status update 2026-07-12: Tier 1 is IMPLEMENTED** (work package WP-A) —
> lib/constlint.js (build FAIL), lib/pathing.js, `build-map --stabilize` /
> `--variant-name`, test/builds-freshness.test.js (default-on, ~1s; found
> and fixed two stale committed artifacts: northreach.w3x and
> tidewatch-arena.w3x predated the constants-block feature). Tiers 2–3
> remain assessment-only.

1. **Stale generated-constant lint in build-map** — highest value-for-effort in
   the repo. Gotcha 27's worst trap (object rename → constant rename → runtime
   `nil`, invisible to luaparse) becomes a deterministic build FAIL: build-map
   already parses the packed script AND holds the full constant set; walk the
   AST for identifiers with the nine reserved prefixes and fail on any not in
   the generated block. Also catches trap (b) (user globals squatting on the
   prefixes) mechanically.
2. **Auto-generate `war3map.wpm`/`war3map.shd` from terrain.json** — same
   treatment lib/source.js already gives the minimap (generate when absent
   under `files/`, WARN on size mismatch when present; never clobber real
   pathing data). Kills gotcha 8's hand-crafted-binary step; unlocks safe
   terrain resizing / from-scratch terrain generation.
3. **Stabilization-cycle automation** (`build-map --stabilize` or a script) —
   the gotcha-6 four-command manual loop with its copy-the-lua-back trap
   becomes one command: round-trip into a temp dir, rewrite only the
   translatable `*.json` (lib/filemap.js `byJson` already knows which).
4. **`--variant-name` flag on build-map** — overlay the internal name
   (`_header.json` + w3i + resolved TRIGSTR) at pack time. One command per
   A/B diagnostic variant instead of three hand-edits (gotcha 17 /
   PIPELINE §7); the useful kernel of "matrix builds" without CI machinery.
5. **`maps/builds/` freshness guard test** — no test references the committed
   artifacts today, so drift from committed sources is silent. Rebuild each
   bundled source, compare extracted member CONTENT (not archive bytes — MPQ
   is nondeterministic) against the committed `.w3x`; gate behind an env var
   if suite runtime matters.

### Tier 2 — sim fidelity (the biggest capability gain; all legally clean)

Doctrine that makes this clean: **map-delta-only semantics**. The map's own
objects-*.json deltas are ours to read; Blizzard base stats are not. For total
conversions (all our flagship maps), the deltas ARE the stats. W3x2Lni's data
model (object data = a patch over SLK parents) independently vindicates this.
The escape hatch for base stats is the Warsmash model — optional user-supplied
game dir read at runtime (`WC3_GAME_DIR`), never committed, and **forbidden in
committed tests / golden runs** (different patch = different stats =
nondeterminism across machines).

1. **Damage-event skeleton + destructables** (recommended as one work
   package, ~150 lines + mirror-of-unit-table respectively):
   - `UnitDamageTarget` deducts life (flat, no mitigation by default) and
     fires `EVENT_PLAYER_UNIT_DAMAGED` (+ the 1.31 pre-armor variant);
     `GetEventDamage`/`BlzSetEventDamage`/`GetEventDamageSource`/
     `BlzGetEventDamageTarget`; killer attribution flows into the existing
     death path; harness `sim.damage(src, tgt, amt)`. Explicit documented
     recursion policy. NO internal randomness (crit/miss) — that would consume
     or fork the map PRNG stream and break gotcha 30's one-stream doctrine.
   - Destructables instantiated from the map's own doodads.json: real
     `EnumDestructablesInRect`/`KillDestructable`/life/death events. A bundled
     map is provably blind here TODAY: crossroads-siege wave 5's Shortcut
     Grove kill (war3map.lua:334) is silently inert in the sim.
   - Damage events are the largest unwired event class, and the gap is
     already distorting design: vaults expresses combat as recorded
     `BlzSetUnitBaseDamage` calls and drives outcomes with `sim.kill` because
     the sim can't do better.
2. **Spell/ability EVENT bookkeeping** (not an ability engine):
   `EVENT_PLAYER_UNIT_SPELL_EFFECT/…`, `GetSpellAbilityId/TargetUnit/X/Y`,
   real `UnitAdd/RemoveAbility` + `Get/Set/IncUnitAbilityLevel` bookkeeping,
   harness `sim.cast(...)`. No cooldowns/mana/effects — the modern pattern is
   "dummy ability + trigger does the work" and the TRIGGER is what needs
   testing. Prerequisite for hero-ability-driven maps.
3. **Map-delta object-data stats** — widen the 3-field `readObjectData`
   (`igol`/`uhpm`/`unam` today) to the fields bundled maps already set
   (`ua1b`, `udef`, `umvs`, `ugol`/`ulum`, `uabi` → feeds spell tier,
   `ubui`, `ustr/uagi/uini`, `ulev`). Un-overridden field = documented
   neutral default, never a fabricated Blizzard value. Makes gotcha 23-class
   identity-leak bugs assertable in tests.
4. **Script LINE coverage** — `debug.sethook(fn, 'l')` verified working in
   our fengari; luaparse supplies the executable-line set; map hits back
   through the generated-block offset to source lines. Native-call coverage
   says "which natives ran"; line coverage says "which BEATS no test walks" —
   the five-boss bug class. Hooks observe, don't perturb; keep them off any
   path a golden run reads.
5. **Item manipulation events + 6-slot inventories** — RPG/roguelike staple;
   vaults' market tests currently cover only the pawn path.

Determinism rule for ALL sim tiers: promoting a stub to real semantics can
shift golden-run beat sequences — each tier lands with a deliberate,
beat-by-beat-reviewed golden-run re-pin, never silently (add to PIPELINE §8
when the first tier lands).

Explicitly NOT sim work (see §3): full ability engine, combat AI,
auto-movement, pathing.

### Tier 3 — ecosystem adoptions (all cheap, all optional-path)

1. **War3Net v6.x for the cross-validator + a wtg→JSON dump command** —
   War3Net is the most alive project in the ecosystem (v6.0.3 tagged
   2026-07-04, MIT, .NET 10). Its `Build.Core` parses war3map.wtg/wct — the
   one format class we mark opaque. A thin dotnet-side dump gives read-level
   trigger visibility on unprotected maps at near-zero new-dependency cost
   (dotnet is already optional). Honest scope: protectors delete wtg/wct and
   the game never reads them — this is unprotected-map ANALYSIS, not a build
   path; ambitious-maps §6's deferral of wtg AUTHORING stands.
2. **pjass gate for `war3map.j`** — actively maintained (commits 2026-06),
   Linux-native (flex/bison), the community-standard JASS2 checker. Wire as
   the JASS twin of the luaparse gate (present → gate, absent → WARN — same
   pattern as the smpq fallback). Value ROSE since deferral: classic maps are
   now byte-faithfully editable (objects v1/v2 codecs), so repacking a .j is
   a supported workflow that today ships entirely unchecked. Note: pjass
   wants common.j/Blizzard.j for full checking — we cannot ship those; accept
   user-supplied paths or run grammar-only.
3. **Upstream engagement with wc3maptranslator** — upstream woke up (5.0.0
   published 2025-12-21, responsive maintainer, December commit stream). File:
   (a) the classic-.doo 8-bytes-past-end overread (repro in hand — standing
   open thread), (b) the UTF-8 readString bugs, (c) the falsy-zero
   write-throughs, (d) unbounded readString. Payoff: shrink
   lib/translator-fixes.js over time. Keep the 5.0.0 pin regardless.
4. **Regenerate lib/sim/data/jass-constants.json against patch 2.0.4** —
   2.0.3 fixed dozens of `BlzSetAbility*Field` natives and 2.0.x added
   names; post-1.36 natives currently auto-stub silently. Rerun
   scripts/gen-jass-constants.js against current common.j/blizzard.j inputs
   (same community-sourced legal pattern as before).
5. **Check mdx-m3-viewer-th 5.13.4 for w3i v33 parsing** — upstream took a
   "new map info format" PR in Aug 2025; whether our pinned -th fork includes
   it directly affects the validate-map second opinion on 2.0-editor maps.
6. **MDX v1000+ sanity spot-check** — the two-tier model bar is calibrated
   entirely on v800 models; one synthetic/CC0 v1000 fixture through
   sanityCheckModel de-risks it before a Reforged-version model bites.
7. **Community-listfile dictionary probe in recover.js** (M) — the hash-probe
   machinery exists; a dictionary source raises the forensics ceiling on
   every protected map (EaW 237, GWZ 52, Gaias ~600, DotA ~800 residual
   anonymous members). Fetch-on-demand, not vendored; per-source licensing
   diligence required.

## 2. Watch list (no action while green)

- **stormlib-node ABI rot** — the binding is unmaintained (last publish Nov
  2023; our documented sharp edges live in the BINDING, not StormLib, which
  is active at v9.31). If it stops loading on a future Node: vendor/patch the
  binding, or lean on the first-class smpq fallback.
- **Pinta365/blp** (TS, MIT) — claims BLP1 encode as of v0.2.0 (2026-03);
  if real, deletes the Python/Pillow dependency. Trial against the sanityTest
  bar before adopting; single-author and young.
- **w3gjs replay parser** (active, 4.1.0 Apr 2026, MIT) — a replay-driven
  validation tier the sim can't reach: parse real .w3g replays of our maps
  and machine-verify playtests (e.g. the pending vaults verification). Adopt
  only once real-game replays enter the loop.
- **invoker-bot/war3map** (npm, pre-1.0) — the closest thing to a same-stack
  wtg parser (byte-preserving); too young to depend on.
- **Warsmash** (AGPL, Java) — real gameplay semantics but GUI-oriented, needs
  user game assets, no headless entry point. If a headless mode matures it
  becomes the "second-opinion sim". Meanwhile: mine it (and Wurst's native
  mocks) for disputed native semantics.
- **Patch 2.0.4 "additional cliff types"** — first candidate for a future
  w3e/cliff change; Blizzard has changed payloads WITHOUT version bumps
  before (unitsdoo skinId, 1.32) — the byte-faithful round-trip tests are
  the tripwire.
- **W3CE** (community client, custom natives) — only matters if maps start
  targeting it; would need a constants-table variant.

## 3. Not worth doing (consolidated, with reasons)

- **Full ability engine / combat AI / pathing in the sim** — takes a real
  engine PLUS the user's game data to do honestly (the Warsmash comparison);
  community docs of buff/orb/stacking semantics are folklore-grade; would be
  systematically wrong exactly where it matters. The sim-honesty doctrine is
  the toolkit's best feature.
- **Auto-movement in the sim** (orders resolve over time, straight-line) —
  manufactures false confidence; real arrival depends on pathing. The current
  explicit `sim.moveUnit` idiom keeps the assumption visible in the test.
- **TriggerSleepAction/PolledWait coroutines** — no bundled consumer; the
  wait-heavy use case (third-party classic maps) is JASS, which the sim
  can't execute anyway.
- **JASS execution in the sim** — a different project.
- **Full FDF/frame-UI authoring** — new format family + semantics only
  provable in-game; no bundled map needs it. (A cheap TOC/FDF reference LINT
  — script's `BlzLoadTOCFile` literals → members exist — is worthwhile if
  custom-UI maps ever land here; no library to adopt, FDF grammar is a small
  self-write informed by Warsmash's.)
- **w3x2lni adoption** — GPL-3, Windows-oriented, and it COMMITS SLK-derived
  Blizzard data tables (the exact legal path we forbid); we already read
  slk-optimized maps.
- **TSTL/w3ts, Wurst, Ceres, cheapack as toolchain** — transpile layers with
  no new capability over direct Lua authoring; Ceres is dead.
- **Rust/Java MPQ backends, wc3libs, flo** — third backends/opinions with no
  capability delta; War3Net already tie-breaks.
- **Streaming MPQ rework, skin-file generation, Misc/Skin txt schema lint,
  script minification, migrations-as-code, UjAPI allowlist** — stand by the
  original deferrals (modern-maps §3 / ambitious-maps §6 reasons unchanged).
- **Anonymous-member carry-through on repack** — real but niche (forensic
  rebuilds); smpq backend can't address nameless slots, so it would break the
  both-backends doctrine; counts are already reported loudly. Revisit when a
  forensic rebuild actually matters.

## 4. Cross-cutting facts worth remembering

- **Formats: no changes needed.** Current on-disk maximums through 2.0.4 are
  exactly what we write (w3i v33 / w3e v12 / objects v3; container still
  MPQ v1). 2.0's HD work is client-CASC-side, invisible to map archives.
- **The ecosystem consolidated onto four living poles**: War3Net (.NET),
  Wurst+wc3libs (Java), HiveWE (C++, AGPL — reference only for disputed
  layouts), and the young WarRaft Rust cluster. The JS/TS pole is thin —
  which is why upstreaming our translator fixes matters: we are among its
  most serious production users.
- **Nothing external replaces the sim**; available improvements are INPUTS
  to it (2.0.4 native tables, replay assertions), not replacements.
- **The highest-value open item is not tooling**: vaults-of-ash has still
  never been loaded in the real game. The sim-is-not-the-game doctrine says
  that playtest outranks every row above.
