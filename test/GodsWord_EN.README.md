# test/GodsWord_EN.w3x

> **Shipped in two parts.** At 115.36 MB the archive exceeds GitHub's
> hard 100 MB per-file limit, so it is committed as
> `GodsWord_EN.w3x.part00` + `.part01`. Reassemble with:
>
> ```bash
> cat test/GodsWord_EN.w3x.part* > GodsWord_EN.w3x
> ```
>
> The result must be **120,965,053 bytes**, sha256
> `e046fb12ee777afe6fbadca3e347f674429e291ed7e403129be66620e9736ad2`.
> (Verified: the concatenation reproduces that hash exactly.)

English translation of **God's Word: The True Way (v.0.80)** by
**PUVer** and the **Divine Style Team** — credited in-map as
`DST (PUVer, KO3bMA, Hate, Darkowlom & Co)`, filed at
xgm.guru/p/gw (RU) — a single-player, first-person-scale village RPG
built on the WC3 engine and filed by its authors under "mods" because
it is a total conversion in spirit: the lumber counter is
**Learning Points**, the upkeep bar is a **Hunger/Satiety** meter, and
the idle-worker button is a settings panel.

You wake with amnesia in **Vilgard**, a farming hamlet on the northern
frontier of Stronvart that everyone with means has already fled for the
south — the elder has sealed the south gate and posted guards on the
north one specifically to stop the rest leaving. It is not a
hero-and-creeps map: the tavern keeper, the cattleman, the farming
co-op chairman and the gnome bard all have hours of written dialogue,
opinions about each other, and errands. The verbs are conversation,
jobs, crafting and theft — 10 skill trees (Combat Craft, Alchemy,
Smithing, Cooking, Hunting, Thievery, Farming, Eloquence and the three
god-powers of Balladore, Sylvargar and Necros), paid piecework for the
Farmers' Co-op, lockpicking, pickpocketing, a jail sentence you sleep
off, and 10 achievements with names like *Mouse Killer*, *Blasphemer*,
*Sleeping Beauty*, *Butterfingered Beekeeper* and *Dirty Pig*. 120
quest-journal beats thread a cursed lute, missing sheep, the lost
armour of Duncan Silb, Olvert's fighting arena and a necromancer behind
a burned farm. The writing is loose, profane and funny; the village
drunk's monologue about spotting an elf is a genuine set piece.

**The largest prose pass in this set.** Every player-facing surface was
measured per file rather than assumed:

| surface | fields | Cyrillic chars |
|---|---|---|
| `war3map.j` string literals | 4,727 | 140,240 |
| object data (units/items/abilities/upgrades/buffs/destructables) | 4,904 | 121,066 |
| `war3map.wts` | 393 | 44,287 |
| `war3mapSkin.txt` | 18 | 388 |
| **total** | **10,042** | **305,981** |

`info.json` holds no direct text — name, author, description, players
and forces are all TRIGSTR references into the wts. The quest journal
is *cumulative* (each state re-prints every prior paragraph) and
upgrade tooltips repeat verbatim across five levels, so a cross-surface
translation memory reduced the work to **4,754 distinct units /
171,515 Cyrillic characters**, rendered as ~41,200 English words
against a glossary locked before the pass (Vilgard, Portwallum,
North/South Stronvart, Godertal, Elmagix, Dwarmaun, Farrield; Balladore
/ Sylvargar / Necros / Neptos / Borodir / Orcvarrog / Oromir; Learning
Points, Satiety, Combat Craft, Marauding, Thieves' Cant).

Register was kept, not sanitised: Olvert's abuse, the bandits' criminal
cant, Ronhren's profanity tic, Varnas's pirate patter, Faut's stammer,
Tain's lip-smacking, Marcus's rustic proverbs and Niki's stoner drawl
all survive as distinct English voices. The gravestone jokes, the two
logic puzzles, the bard's ballad, the four royal decrees and the
torn-fragment riddle were re-authored so the fragments still
reassemble into the verse.

**Gameplay byte-identical.** No stat, rawcode, trigger or timing
changed. 9 members were spliced; every other member is untouched:
**2,033 anonymous imports identical by content hash (2,033 of 2,033)**
plus 12 untouched named members identical, and all 9 spliced members
read back out of the finished archive byte-exact. All 4,904 edited
object-data fields were re-read field-by-field from the rebuilt
binaries with **0 mismatches** and the total mod-field count held at
26,107; the wts round-tripped 405 entries with 0 mismatches and its
`_dialect` sidecar (UTF-8 BOM, CRLF, no separator line) intact.
Markup parity was machine-checked across all 4,754 units — colour
codes, `|r`, `|n`, `%d`, CR/LF, escaped quotes and backslashes:
**0 mismatches**. Cyrillic sweep of the rebuilt map source: **0
characters remaining**.

**Gotcha-35 dialect check** (the one that has actually shipped a
crash): every archive text member was read and written in binary.
`war3mapSkin.txt` 36 CRLF / 0 CR / 0 LF / no BOM before and after;
`war3map.j` 87,419 CR / 22,479 LF / 6 CRLF / no BOM before and after —
identical on both sides.

**Gotcha-34 delta lint**: the original carries 2 ASCII apostrophes
inside double-quoted JASS literals (`Клан Орок'лок'Тар`); the
translation carries **2**. English possessives would have pushed that
to 272, so 224 literals had their apostrophes written as the
typographic `’` in `war3map.j` only — the documented cost-free
precaution. The wts and object data keep ASCII apostrophes, which is
safe. No claim is made that the underlying failure is real.

**Validation**: verdict parity with the original. Both archives exit 1
on the **same single inherited FAIL** —
`translate war3mapUnits.doo (WC3MapTranslator cannot currently parse
this version of a war3map file)`. That FAIL is pre-existing in the
Russian original, it is **not** caused by this translation, and
`war3mapUnits.doo` was never touched. Original: 32/33 checks, 1,658
warnings. Translated: 33/34 checks, 1,657 warnings. The one moved line
is an improvement, not a regression: `viewer opens archive` was a WARN
on the original ("viewer found no named members — stripped/fake
listfile — though StormLib reads it") and is a PASS on the translated
build ("9 member(s) via mdx-m3-viewer-th MPQ reader"), because the
splice writes a real `(listfile)` covering the nine replaced members.
Every other PASS/FAIL line is identical.

**pjass parity**: the toolkit's JASS gate reports
`PASS  jass syntax scripts/war3map.j  (pjass grammar check OK)` on the
original **and** on the translated archive — byte-for-byte the same
verdict line. (Invoking `pjass` bare, without the gate's
`+nosemanticerror +noruntimeerror` and without a user-supplied
`common.j`/`Blizzard.j`, yields the original's baseline of 76,435
undeclared-API errors; that is the expected shape of an unresolved-API
parse, not a defect signal, and it is why the gate runs grammar-only.)
The grammar gate is the check that would catch a splice which broke a
string literal, and it passes.

**Disclosed changes beyond the text.** (a) The protector stored an
invalid `dwHeaderSize` (`0x504F7856`) which forces StormLib read-only;
one dword at offset 516 was repaired to 32, the only legal MPQ v1
value — 4 bytes, game-neutral, done on a copy. (b) The original
`war3map.j` contains **5 dialogue literals truncated mid-character** by
the editor's string-length limit, each ending on a dangling `0xD0`/
`0xD1` byte that the game already renders as a mojibake tail;
translating those five lines removes the dangling byte as a side
effect, so the shipped script is valid UTF-8 throughout. The English
renderings are cut at the same point so the truncation still reads as
truncation. (c) The internal map name is
`God's Word: The True Way (v.0.80) EN` in **both** the HM3W pre-header
and the w3i's TRIGSTR (gotcha 17); HM3W flags 130168 and maxPlayers 1
are preserved.

**Non-ASCII sweep** of every text-bearing member of the shipped
archive returns exactly four distinct characters, all whitelisted:
`…` (835 — the author's own ellipsis style, kept), `’` (270 — the
gotcha-34 precaution above), `№` (1 — preserved verbatim from an
internal ability name) and U+FEFF (1 — the wts byte-order mark, i.e.
the preserved `_dialect`). No Cyrillic, no replacement characters.

**Chat commands: nothing to remap.** All 15 distinct
`TriggerRegisterPlayerChatEvent` registrations are dev/debug hooks on
Player(0) (one also on Player(1)) with ASCII-only literals (`+`, empty, `!!`, `-0`, `-m`, `-w1`,
`-w2`, `-mrgoblin`, `b`, ` `, `-1`, `-2`, `-3`); both `SubStringBJ`
sites parse numeric arguments out of
`GetEventPlayerChatString()` at fixed offsets 1-5 and 2-9, and neither
literal was touched. There is no save-code system (0 `NameToInteger`,
0 `StringHash`, 0 `Preload`), so no checksum literal was at risk.

Author fields credit
`DST (PUVer, KO3bMA, Hate & Co), translated by Serendipity`. The map is
an unfinished demo — it ends on "To be continued..." and the loading
screen still reads `Alpha`; the untranslated remainder does not exist.

**Status**: owner-directed translation set (2026-08-09) — same
exception terms as SchoolGhostStory_EN.README.md (download convenience
only, not a bundled map, excluded from preflight, the builds-freshness
guard and all toolkit doctrine).
