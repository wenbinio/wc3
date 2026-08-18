# test/SurviveInNorthrend_EN.w3x

English translation of **Survive in Northrend (ver. 08.02.23)**, a Russian
map published at **warcraft3map.github.io** (Telegram **@warcraft3map**) —
the only author identity the artifact carries: the w3i author field is the
site URL, there is no personal byline in the wts, the script or the object
data. Translated by Serendipity.

A 1–11 player survival/settlement builder on a frozen Northrend coast.
Your ship wrecks, the captain dies, and the survivors loyal to you have to
make a living out of snow: mine ore out of rock with pickaxes, cut wood,
fish, tame animals, breed (units have Male/Female/Pregnancy states and
children who grow up), and feed the settlement or watch it starve — Hunger
is a real counter and a clan that runs out loses hit points. Every night
monsters attack, and which ones is announced by flavour line — skeletons
crawling out of the snowdrifts, drifting snow that turns out to be snow
elementals, ice cracking under fishmen. You fortify with walls, gates,
watchtowers, scarecrows and spike traps, or hide in burrows until morning.
Crafting is the spine: a Craft Table turns Handles, Thread, Planks, Cloth,
Leather, Hide, Ingots, Sulfur and Mineral Powder into tools, bows, arrow
types, shields, armour, fur coats and alchemy; a Cauldron renders corpses
into food and brews potions. Eleven skill tracks level up (Physical Health,
Alchemy, Prospecting, Blacksmithing, Weaving, Carpentry, Fishing, Magic,
Evasion, Special Coating, Wall Defense/Durability). Clans can declare war,
surrender into tributary alliances, and release each other from tribute.
The scenario ends when someone builds a Ship — or, in the alternate modes,
when the last clan is left standing.

**Source language: measured, not assumed.** 13,969 Cyrillic characters
across the source's distinct text units, with **308 `ы`, 8 `э`, 4 `ъ`,
1 `ё`** and **zero** Ukrainian (`і ї є ґ`), Belarusian (`ў`) or
Serbian/Macedonian (`ј љ њ ђ`) letters. Russian.

## Per-surface measurement

The map is not wts-shaped at all: **89% of the Russian lives in object
data** and the wts holds 1.4%.

| surface | fields with Cyrillic | Cyrillic chars | distinct units translated |
|---|---:|---:|---:|
| `war3map.w3u` units | 436 | 8,070 | |
| `war3map.w3a` abilities | 493 | 6,013 | |
| `war3map.w3q` upgrades | 230 | 4,982 | |
| `war3map.w3t` items | 304 | 4,144 | |
| `war3map.w3h` buffs | 68 | 926 | |
| `war3map.w3b` destructables | 39 | 385 | |
| **object data subtotal** | **1,570** | **24,520** | **694 distinct values** |
| `scripts\war3map.j` string literals | 127 | 2,477 | 42 distinct literals |
| `war3map.wts` | 18 | 398 | 18 entries |
| `war3mapSkin.txt` | 6 | 105 | 6 lines |
| `war3mapMisc.txt` | 1 | 7 | 1 line (`TWN4` tier name) |
| **total** | **1,722** | **27,507** | |

`war3map.w3d` (doodads), `war3mapExtra.txt` and `Units\CommandFunc.txt`
carry no Cyrillic. `info.json` holds no direct text — name, author,
description, players and forces are all TRIGSTR references into the wts.

**The map was already half-bilingual, and that shaped the work.** 542 of
the 694 object-data values were `Russian|nEnglish` two-line strings, and
the script runs a genuine per-player language switch (`udg_LanguageChoice`,
picked in-game by killing one of two flag-iconned boats; `udg_TEXT[1]` is
the Russian branch, `udg_TEXT[2]` the English one). The author's English
half is machine-grade in places — *"Every night the dungeon is attacked by
monsters"* for a map with no dungeon, *"ice on the water cracked..."*,
*"Skillfish Shield"* for `Щит череп` (skull), *"You hear the lingering beep
of a hunting horn"*. So this is a re-translation, not a cut-and-keep: every
bilingual pair was collapsed to **one** English line written from the
Russian, and the 32 English siblings of the 42 translated script literals
were **unified onto the same text**, so both language branches now read
identically and no player is routed to the weaker English. That is a
text-only change; the switch itself, its two units and its triggers are
untouched.

A glossary was locked before the pass and applied mechanically: Settlement,
Craft Table, Cauldron, Burrow, Elder (not "patriarch"), Clan/Tribe,
Handle, Thread, Plank, Cloth, Leather, Hide, Ingot, Ore/Iron Ore, Ore Pile,
Firewood, Magic Dust, Mineral Powder, Poison Stinger, Empty Bottle,
Prospecting (`Рудознание`), Special Coating, Wall Defense / Wall Durability,
Resource Refund, Scarecrow (`Чучело`), Rotroot / Large Rotroot / Rotwood,
Fishman, Hellhound, Faceless One, Tuskarr, Ship (win condition) vs Dinghy.
Recipe lines (`Needs:|N- Thread (3)|N- Handle (2)`) use exactly those nouns,
so an item's name, its tooltip, its craft button and every recipe that
consumes it agree.

**Gameplay byte-identical.** No stat, rawcode, trigger, hotkey or timing
changed. Of the 512 archive entries, **10 members were spliced** and every
other member is untouched: **491 of 491 anonymous imports identical by
content hash** plus **11 of 11** untouched named members byte-identical
(`war3map.w3i`, `war3map.w3e`, `war3map.w3d`, `war3map.doo`, `.wpm`,
`.shd`, `.mmp`, `war3mapMap.blp`, `war3mapPreview.tga`,
`war3mapExtra.txt`, `Units\CommandFunc.txt`). In the rebuilt script the
**548 distinct `0x…` unit/ability id constants are an identical set**, and
there are **0** four-character rawcode literals in either build.

## Verification battery

**Pipeline proven byte-faithful before editing.** The unedited source was
round-tripped through `map-to-json` → `json-to-map` and all ten
translatable binaries (`w3a w3b w3d w3e w3h w3i w3q w3t w3u wts`) came back
**byte-identical**. Because an unedited round-trip does not prove edited
data is written correctly, every edited entry was then re-read
field-by-field out of the rebuilt binaries: **11,594 object-data mod fields
(6,418 of them strings) compared, 0 mismatches**; **25 wts entries
compared, 0 mismatches**, `_dialect` sidecar (BOM + CRLF + no separator
line) intact. `war3map.w3i`, `war3map.w3e` and `war3map.w3d` came out of
the rebuild byte-identical to the originals and were therefore not spliced
at all.

**Validation: verdict parity.** Both archives exit 1 on the **same single
inherited FAIL** — `viewer parse war3map.w3i (ByteStream: readInt32:
premature end - want 4 bytes but have 1)`. That FAIL is pre-existing in the
Russian original, it is **not** caused by this translation, and
`war3map.w3i` was never touched (it is byte-identical between the two
builds). Both report **31/32 checks passed, 577 warnings**, and the WARN
profile is line-for-line identical. Only two verdict lines differ, both
expected: the HM3W name (deliberate, below) and `viewer opens archive`
counting 11 members instead of 10, because the splice writes a real
`(listfile)` covering the replaced members.

**pjass parity**: the toolkit's JASS gate reports
`PASS  jass syntax scripts/war3map.j  (pjass grammar check OK)` on the
original **and** on the translated archive — the same verdict line.

**Markup parity, machine-checked.** Script side: across all 74 replaced
literals, **0** deltas in `|cXXXXXXXX` / `|r` / `|n` / `%` / `<…>` counts.
Object-data side, over all 694 distinct values: **0** differences in the
set of `<A00P,DataA1>`-style field references, **0** colour codes not
present in the original, **0** newly introduced `|c`/`|r` imbalances (11
strings carry a stray `|r` with no opening `|c` — all 11 are inherited
verbatim from the Russian original), **0** `%`-specifier count differences.
`|n` counts differ in 507 strings **by design**: that is exactly the
`Russian|nEnglish` pair collapsing to a single English line.

**Gotcha-35 dialect check** (the one that has actually shipped a crash):
every archive text member was read and written in binary via a latin1 byte
view, so line endings and BOMs were never touched. Read back out of the
finished archive:

| member | original | translated |
|---|---|---|
| `scripts\war3map.j` | 0 CRLF / 22,093 CR / 4,579 LF / no BOM | **0 / 22,093 / 4,579 / no BOM** |
| `war3mapSkin.txt` | 78 CRLF / 0 CR / 0 LF / no BOM | **78 / 0 / 0 / no BOM** |
| `war3mapMisc.txt` | 20 CRLF / 0 CR / 0 LF / no BOM | **20 / 0 / 0 / no BOM** |
| `war3mapExtra.txt` | 3 CRLF / no BOM | **3 / no BOM** (untouched) |
| `Units\CommandFunc.txt` | 83 CRLF / no BOM | **83 / no BOM** (untouched) |
| `war3map.wts` | 122 CRLF / 9 LF / BOM | **118 CRLF / 9 LF / BOM** |

The wts is the one row that moves, and it moves for content, not dialect:
the file **scaffold is 96 CRLF on both sides**, and the 122→118 delta is
entirely CRLFs *inside string values* (26 → 22) — the quest text that used
to print a Russian paragraph, a `---` rule and then an English paragraph
now prints one English paragraph. BOM, CRLF scaffold and "no blank
separator line" are preserved exactly.

**Gotcha-34 delta lint**: the original carries **0** ASCII apostrophes
inside double-quoted JASS literals; the translation carries **0** — delta
zero. One draft line ("Northrend's hungry inhabitants") was rephrased to
keep it there. The literal count is unchanged at **783 → 783**. No claim is
made that the underlying failure is real; pjass was not used as an oracle
for it. Object data and the wts keep ASCII apostrophes, which is safe.

**Non-ASCII sweep** of every text-bearing member of the shipped archive
returns exactly **one** distinct non-ASCII character: **U+FEFF ×1**, the
wts byte-order mark — i.e. the preserved `_dialect`. No Cyrillic, no
replacement characters, nothing else to whitelist.

**Chat commands: nothing to remap, and nothing at risk.** All 37
`TriggerRegisterPlayerChatEvent` registrations are ASCII and byte-identical
between the builds: `"-color"` and `"-name"` and `"-zoom"` on all 12
players, plus `"--w"` (weather off) on Player 0. All three `SubStringBJ`
sites parse `GetEventPlayerChatString()` at unchanged offsets — `(7,100)`
for the name argument, `(8,9)` for the colour index, `(7,4)` for zoom — and
no literal feeding them was touched. There is **no save-code system**: 0
`NameToInteger`, 0 `StringHash`, 0 `Preload` sites, so no checksum literal
was ever in play.

## Disclosed changes beyond the text

**(a) Header repair.** The protector stored an invalid `dwHeaderSize`
(`0x504F7856`) at offset 516, which forces StormLib read-only. One dword
was repaired to `32`, the only legal MPQ v1 value — 4 bytes, game-neutral,
done on a copy. The original upload was never modified.

**(b) Internal name (gotcha 17).** `Survive in Northrend EN` in **both**
the HM3W pre-header and the w3i, the latter through wts string 1 which the
w3i references as `TRIGSTR_001`. HM3W flags 121952 and maxPlayers 11 are
preserved.

**(c) Author credit.** wts string 3, which the w3i uses as its author
field, reads `https://warcraft3map.github.io/, translated by Serendipity`.
The map ships no personal author name to credit instead; the site and
Telegram links in the F9 Contacts page are intact and untouched.

**(d) The language selector is kept, and labelled.** The two selector boats
(`Рус` with a Russian flag icon, `Eng` with an English one) and the trigger
that reads them are untouched, so the mechanic still works — but since both
branches now show English, the `Рус` boat's extended tooltip reads
`Russian language. This build is English-only, so both options display
English.`, and the trigger's confirmation message says the same. Picking
either boat gives an identical game.

## Deliberately left untranslated

- **The author's own English that was never Russian.** Beyond the 32
  English siblings unified above, the script's already-English strings were
  left alone — they are the author's writing, not a translation surface,
  and touching them adds risk without need.
- **Monster-faction player names** `"Neutral"`, `"Skeletons"`,
  `"Hungry taiga"` — already English and kept verbatim. The two that
  collided with the glossary were fixed: `"Fishmans"` → `Fishmen`,
  `"Tuskars"` → `Tuskarr`.
- **An author bug, preserved.** In the craft menu the two submenu
  descriptions are swapped in the original — *Tools* is described as "for
  hunting and defending the settlement" and *Weapons* as "for gathering
  wood, stone and food". Both were translated in place; correcting the swap
  would be a design edit, not a translation.
- **Internal editor labels were translated anyway** (`Дамми:` → `Dummy:`,
  `Индикатор(спелбук):` → `Indicator(spellbook):`, `Скин: Морж` →
  `Skin: Walrus`, and the rest) — zero risk, and they surface in the buff
  bar and object editor.
- `_unknown/File00000377.txt`, an anonymous 120-byte JASS preload snippet,
  carries no player-facing text and was not touched; nor were the 491
  anonymous `.blp`/`.mdx`/`.dds` imports.

**Status**: owner-directed translation set (2026-08-18) — same exception
terms as SchoolGhostStory_EN.README.md (download convenience only, not a
bundled map, excluded from preflight, the builds-freshness guard and all
toolkit doctrine). Needs `git add -f`; at 2.4 MB it is an ordinary blob,
no git-lfs path required.
