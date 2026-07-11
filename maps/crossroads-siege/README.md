# Crossroads Siege

A wave-survival / siege map source that exercises **every moving part the
toolkit supports**. 1-4 human defenders (allied, players 0-3) hold the
Crossroads Keep at the center of a 64x64 map against ten timed waves of the
Withering Legion (player 4, hostile computer). Built and validated headlessly:

```bash
node tools/build-map.js maps/crossroads-siege maps/builds/crossroads-siege.w3x
node tools/validate-map.js maps/builds/crossroads-siege.w3x
```

## Gameplay (war3map.lua, ~536 lines of plain Lua)

- Ten escalating waves spawn at the four gate regions and attack-move to the
  Keep; wave composition, gate rotation and a per-wave count bonus escalate
  difficulty. Announcements via `DisplayTextToPlayer`. The count bonus
  applies to the first listed type — except on a boss wave, where it shifts
  to the second: the headless logic sim (test/maplogic.test.js full
  playthrough) caught the original code spawning FIVE Colossi on wave 10.
- Wave 5: the Legion burns the **Shortcut Grove** — the script kills the
  preplaced destructible trees inside the `ShortcutGrove` region.
- Wave 10: boss wave — the **Dreadflesh Colossus** (custom unit `u000`,
  custom `A000` slam ability); on death it drops the custom items
  `I000`/`I001`.
- Periodic war-chest income + wave-clear bounties; the Legion gives bounty.
- **Defeat** when the Crossroads Keep (custom unit `h001`) dies; **victory**
  after wave 10 is cleared.
- Scripted camera intro panning over the three `w3c` cameras; rain weather
  over the eastern pond matching the `PondMist` region.
- Ward Crystals (custom unit `n000`, generated MDX model) pulse heals.

Syntax-checked headlessly with `luaparse` (Lua 5.3 grammar); there is no
Lua binary in this environment.

## What each file exercises

| File | Contents |
| --- | --- |
| `terrain.json` | 64x64 Lordaeron Summer; all 6 palette tiles used; sinusoidal ground-height hills; 3 cliff layers (plain 2, plateau 3, keep pad 4) with ramp flags on the lanes; 4 water ponds (water flag + depressions); blight at the north gate |
| `info.json` | 5 players (4 user + 1 computer), 2 custom forces, fixed start positions, camera bounds for the 64x64 extent, TRIGSTR references throughout |
| `strings.json` | 21 TRIGSTR entries referenced from info.json, object data and the script |
| `units.json` | 74 entries: 5 start locations, 4 full defender bases, 4 gold mines, 14 neutral-hostile creeps at chokepoints, 2 neutral shops (`ngme`, `ntav`), the custom Keep and 4 Ward Crystals |
| `doodads.json` | 161 doodads: border/plateau tree lines, base woods, the destructible Shortcut Grove (script-referenced), rock chunks at gates |
| `regions.json` | 8 regions: 4 spawn gates, CenterKeep, BossArena, ShortcutGrove, PondMist (with `RLlr` rain weather) |
| `cameras.json` | 3 cameras used by the scripted intro/boss beats |
| `sounds.json` | 2 built-in game sounds referenced **by path** (nothing redistributed) |
| `objects-units.json` | original tweak (`hfoo` HP) + 4 custom units: `h000` militia, `h001` Keep, `u000` boss, `n000` crystal with the imported model |
| `objects-items.json` | original tweak (`phea` cost) + 2 custom boss-drop items |
| `objects-abilities.json` | original tweak (`Aslo`) + custom `A000:ACtc` boss slam |
| `imports/war3mapImported/SiegeCrystal.mdx` | tiny generated model (team-color texture via ReplaceableId 1; sanity-clean per CLAUDE.md gotcha 14); `war3map.imp` is auto-generated at build time |
| `files/` | `war3map.wpm`/`shd` regenerated for the 64x64 size (docs/PIPELINE.md §3); `war3map.mmp` + `war3mapMap.tga` are auto-generated at build time from the JSON |

## Regenerating the custom asset

```bash
node maps/crossroads-siege/assets/generate-banner.mjs
```

authors a minimal MDL (crystal geoset, additive/unshaded team-color layer,
Stand + Death sequences, GeosetAnim death fade, Origin attachment), converts
it via war3-model `parseMDL` → `generateMDX`, and writes the MDX into
`imports/`. Deterministic — safe to re-run. The result must stay clean under
mdx-m3-viewer's sanityTest (enforced by test/fixes.test.js): a malformed MDX
hard-crashes the game on map load.

## Invariants (do not break)

- All JSON is a **translator fixed point** (build → extract → map-to-json
  reproduces it byte-for-byte as JSON). If you edit values, run one cycle
  and commit the stabilized output (CLAUDE.md gotcha 6).
- `test/siege.test.js` builds this source and asserts the fixed point, the
  import round-trip and the map's headline stats.
- Keep `info.json` players/forces, the five `sloc` entries in `units.json`,
  and `config()` in `war3map.lua` consistent with each other.
