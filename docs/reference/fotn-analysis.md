# Founders of the North 1.24 — decompilation dossier

Source: downloaded from hiveworkshop.com resource 14017 (thread 184407), file
`FoundersOfTheNorth1.24.w3x`, 4,001,757 bytes, HM3W magic verified
(`name="Founders of the North 1.24"`, flags 64632, maxPlayers 8).
Author: Shade Gabriel / Sifonseal. Loading screen title: "Spice And Wolf"
(the map borrows heavily from the anime — Horo Shrine, Holo unit, merchantry).
All artifacts live in the scratchpad (`.../scratchpad/fotn/`): map, `extracted/`,
`json/` (map-to-json output incl. `_viewer/`), `strings.txt`, `w3u-units.txt`,
`items.txt`, `createunit-tally.txt`. Nothing was copied into the repo.

The map is **protected**: `(listfile)` stripped (335 archive entries, only 21
war3map.* files recoverable by name), editor-only files (`war3mapUnits.doo`,
`.wtg`, `.wct`, `.imp`) deleted, `war3map.j` run through an optimizer/obfuscator
(2,195,361 bytes on 18 lines, all identifiers 1–2 chars). Analysis below is from
the obfuscated JASS (string literals, rawcodes, natives and numeric constants
survive), the wts string table (297 strings, including the in-game help guide),
and object data recovered via the toolkit's mdx-m3-viewer fallback.
Claims marked *(help text)* come from the map's own F9 guide strings and were
not independently verified in code; everything else was read from the script
or object data.

## 1. What the game actually is

**Not** a settlement-race/wave-defense map. FoTN is an open-ended
**medieval life/economy sandbox RPG** ("rise from nothing") for 2–8 players,
set in a trade-rich pseudo-north-European land with three neutral NPC main
towns, small NPC villages with a diplomacy system, an ongoing scripted NPC
crusade (Pagans vs Church), wolves, bandits, dungeons, bosses, guilds, and a
wife/companion system. Players each control a single **Founder** hero and try
to get rich by any of ~8 income professions, eventually building a private
town and army; players who lose everything become **Bandits** and play a
robbery/stealth variant. There is no scripted victory — only defeats — and no
score display of any kind.

### 1a. Core loop and founding mechanic (verified in code/object data)

- Every player starts with exactly one **Founder** hero (`H008`, base `Hpal`,
  model MilitiaHeroBLPIII.mdl) plus a pre-placed hidden **mounted Founder**
  variant (`H02D`, MountedFounder.mdl) used by the mount system. All 8 start
  heroes spawn together in one central-south starting area (~(0,-1500));
  there are **no per-player bases or start towns**.
- Starting resources: **320 gold, 20 lumber** (script sets both per player).
- "Founding" is free-form base building, not a scripted claim: the Founder
  himself builds a **Store House** (`h00A`) anywhere, which upgrades to
  **Farm House** (`h00J`, 320g/200w) → **Town Tower** (`h00K`, 3200g/800w).
  Town Tower trains **Worker** (`h011`), **Villager** (`h010`) and
  **Engineer** (`h015`); the Engineer unlocks tier-2 town buildings:
  Town Center (`h00Y`, 1600g/600w), Castle (`h01M`, 4000g/2500w, trains the
  military roster), Blacksmith, Stables, Bakery, Tannery, Mine, Alchemist
  guild, Inn/Brewery, Gatherer's Post. The `-town` command only *pings
  recommended spots* — location is unconstrained.
- The Founder hero has **no hero skills** (`uhab` emptied); his kit is
  ability-book based: "Founder's Ledger" (spellbook), "Inspired Acts"
  (spellbook), "Converse", "Companionship", harvest, inventory. Mana is
  renamed **Inspiration** and (help text) regenerates only from
  "Companionship" — being near other heroes/companions.
- Reduced vision baked into unit data: Founder sight 1000 day / 600 night.

### 1b. Income systems (no periodic settlement income exists)

All income is **active**, item-based, sold at the three neutral **Town
Markets** (one per NPC main town: North/South/West):

- **Hunting**: kill deer/rabbits/wolves while carrying Hunting Equipment →
  hide/fur items → sell at market. Animals have hunting-pressure-based
  migration *(help text)*.
- **Fishing**: Fishing Equipment used on ~36 preplaced Fishing Spot units
  (`n00L..n00Q`, 20+ catch types, per-spot loot tables; catch messages are
  hardcoded per region).
- **Farming**: buy seeds, plant Crop Field buildings (wheat/corn/cabbage/
  cucumber/potato/strawberry/blackberry/tomato/watermelon/grapes), harvest
  drops. Crops die in constant-snow areas; rabbits damage crops; other
  players can steal harvests *(help text)*.
- **Herding**: Barn trains sheep/pigs (100g); their mana bar (x/220) is a
  fatness meter; killing one at mana ≥ 200 drops Wool/Meat trade goods
  (verified item set; threshold from help text).
- **Gathering/Alchemy**: Gathering Equipment finds herbs; Cauldron extracts
  "properties" into a per-player property pool; properties + Potion Vials
  craft potions (unique alchemy system).
- **Merchantry**: each of the 3 town markets prices each Trade Good
  differently; prices move with supply (buying raises, selling drops); a
  "Market Report" item shows current prices. Regional price bonuses exist.
- **Mining**: one Mine per player, built on neutral ore deposit units —
  Iron (7+6 deposits), Silver (2), Sulfur (3, rarest) + Stone Quarry, and
  Pearl Reefs (6) worked by Pearling Boats.
- **Production chains**: Fish+Fireplace→Meat; Wheat/Corn→(Windmill)Flour→
  (Bakery)Bread; ore→weapons/armor via Blacksmith, etc.
- **Guilds** (v1.20+ system): 4 guild slots map-wide at Guild Houses; found
  for 3000g (founder starts with contribution 2000, two NPC-faction
  co-owners), join for 3000g; income distributed by control %, 50% of
  payouts auto-reinvested; guild reps dying costs the guild. Types:
  Bandit Organization, Mercenary Guild (more "coming soon").
- **NPC faction diplomacy** (new in 1.24): gift → relation → alliance →
  request military/monetary aid, fund village defense towers, or demand
  tribute (relation hit; causes war with the faction's player allies).
- **Basic Quests / Request Board**: 1 quest generated per day (3 every third
  day, max 13 banked, all reset every 3 days); request-board payouts scale
  inversely with supply of the delivered item category.

### 1c. The anti-hoarding "corruption" tax (verified, exact)

The only periodic gold mechanic in the map is **negative**: every **40 s**, a
periodic trigger takes **gold/20 (5%)** from every player who owns a
**Town Center** (`h00Y`) or **Bandit Fortress** (`harm`). (The help text says
"Town Tower"; the code actually keys on Town Center.) The intended
counter-play is converting gold to **Coin items** (denominations 50 / 100 /
500 / 1000 / 5000 g) at the Merchants Guild: coins pawn back at full value
(engine pays 50%, a trigger tops up the other 50% — "Currency Return").

### 1d. Grace period, death, bandit play (verified)

- **Grace period: 900 s** (visible timer dialog "Grace Period"). During it
  PvP is disabled; dying during grace revives you and gives free hunting
  equipment.
- After grace: dying with a Farm House or Town Tower → revive there. Dying
  **without** one → respawn as a **Bandit** in a random town with **gold and
  lumber zeroed**: new hero (`Hpal` "Bandit": Sneak (wind-walk w/ backstab),
  Hide, Converse) and a bandit build set: Store House→**Hide Out** (`htow`),
  Thieves Guild, Bandit Camp, Bandit Fortress, Guard Post. Bandits sell loot
  at their Hide Out, prey on NPC travellers/caravans, are attacked by town
  guards/road patrols, can't buy some items (e.g. Guard Tower), and their
  towers give no bounty (anti-farm rule).
- Becoming a bandit is marked by researching tech `R001` "Bandittry".

### 1e. Victory / defeat (verified)

- **There is no victory trigger.** No `CustomVictoryBJ`, no multiboard, no
  leaderboard, no score anywhere in the script. "Become the one and only
  lord of the north" is purely social/implicit.
- Defeats: (1) leaving the game = "retired from life in the north" →
  `CustomDefeatBJ`; (2) after the endgame is declared, any player with zero
  Hide Outs (`htow`) **and** zero hero (`Hpal`) is "purged from the north
  entirely" → `CustomDefeatBJ`.
- The endgame is player-declared: researching upgrade `R008` "**END GAME**"
  (base `Rnen`) fires the **Purge** announcement (TRIGSTR_2581) — from then
  on bandits stop auto-respawning and elimination becomes possible. (A
  "Bandit WAR" variant string exists in the wts but is unreferenced by the
  script — likely vestigial.)

### 1f. Day/night (help text + partial code verification)

Night matters: global movement-speed drop (wolves exempt), massive line-of-
sight reduction (Founder unit data: 1000→600), wolves begin hunting and call
their pack when attacked, some areas only open at night. Wolf kills drive a
wolf **migration** system; heavily hunted areas empty out. Standard
Lordaeron DNC models are used; several dozen periodic triggers (0.5 s–600 s)
run the ambient simulation (villager/traveller/caravan respawns every 600 s,
wolf/game spawning at 80/90/100/120 s cadences — functions identified but
individually unverified due to obfuscation).

### 1g. Events, RPG layer

- **Fun Fact Quiz**: periodic multiple-choice trivia; answer with `-A/-B/-C/-D`;
  first correct answer wins lumber or a "Dark Age Literature" special item.
- **Awakenings**: spend Dark Age Literature at Talia The Collector to spawn
  a boss (White Fang, Okkun the Enraged Bear Spirit, Frozen Bear Spirit,
  Countess Draculara, Famriel the Great Owl Spirit); bosses drop artifacts
  (White Fang, Burning Soul, Blood Vengeance, Sword of Damnation, Jewel of
  the North) which can be **unsealed** (soulbound true forms) via Spirit Of
  The North / Heart of Darkness.
- **Calamities**: 2× Dark Age Literature at the Overgrown Altar starts a
  map-wide event (Plague — with Plague Rats/Infected Crops/Plague Cure —,
  The Covenant vampires, "Dakenstein" abomination); opt-out per player via
  `-calamityoff`.
- **Dungeons**: 3 entrances (Everwood Depths, Amarti Mine, Bedstone Seaside
  Mine) — hero-only instances with chests; boss "Fallen Shepherd of
  Everwood"; repeatable entry quests.
- **Companions ("wives")**: 4 findable NPC heroes — Apprentice Merchant,
  Wolf Spirit, Shepherdess, Alchemist/Bird Spirit (`H01G..H01J`, base
  `Hjai`) — claimed with the Ceremonial Ring item, ceremony at the Northern
  Shrine or Great Church; each grants extra skills + Companionship.
- **Conversing**: the Converse ability on any NPC raises relationship, 100+
  villager responses, random rare item gifts.
- **Special recruitment sites**: Bran Castle, Mercenary Camp, Knights
  Templar Castle; wandering NPC vendors (Leonardo The Thinker, Talia The
  Collector, William Of The North, Shames The Bard); periodic mercenary-army
  visits.

### 1h. Military / tech notes (object data)

No conventional upgrades: units gain attack speed per attack and armor per
hit taken ("sparring" training is intended play). Units have inventories and
are equipped by buying weapon/armor **items** from your Blacksmith (large
Kitabatake/Sunchips attachment-item set). No trainable cavalry — you mount
infantry onto horses trained at Stables (Young/Adult Horse units; mounted
variants exist as separate unit types, e.g. Mounted Swordsman `h01R`/`h01S`).
Castle roster: Swordsman, Elite Swordsman, Spearman, Axeman, Conscript/
Archer/Elite/Mounted Archer, Catapult. Naval: Lake Boatyard and Port Docks
(few legal build spots), Lake Fishing Boat, Pearling Boat, Trade Boat/Ship,
**Warship** (`h029`, base hdes). Walls, gates, pike barricades, guard/sentry/
ballista towers for town defense.

## 2. Chat commands (complete, extracted from TriggerRegisterPlayerChatEvent)

All-players commands:
- Pings: `-hunting -fishing -farming -gathering -wood -tower -market -town
  -inn -guild -altar -caverns -everwood -companions -wife -advent`
- Utility: `-cam` (camera reset), `-cl` (clear messages), `-lag`, `-skip`
  (skip intro tutorial), `-split <slot> <n>` (split item stack),
  `-name <name>` (rename faction), `-quest`
- Diplomacy menus: `-ally -unally -vision -unvision`
- Systems: `-calamityon -calamityoff`, `-spy` (find active spies)
- Quiz answers: `-A -B -C -D`; also `gl hf` (responds to the greeting)
- Author-gated Easter eggs (only if player name == "Sifonseal"):
  `-spiceandwolf -spiceandwife -spiceandquest -spiceandknife -spiceandbook
  -spiceandalchem` (e.g. spawns `h02T` "Holo", a white-wolf worker)

Host-only (registered to Player 0/red only; several created disabled, one
gated on the author's name — this is the de-facto debug mode; there is no
`-test`):
`day`, `night`, `fund` (all start disabled), `-worker`, `-trade`, `-t`
(shares a trigger with a 60 s periodic), `-order`, `-merc`, `-hawk`,
`-guildava`, `-demand` (dumps internal Bandit/Security/Trade counters),
`-cult`, `-check` (author-name-gated; prints founder count), `-bandit`
(toggles a spawn flag), `-aqset` (substring match).

## 3. Object data summary (via `_viewer/` fallback JSONs)

Counts (modified-standard + custom): units 36+370, items 3+337, abilities
17+357, destructables 6+18, doodad types 8+27, buffs 3+19, upgrades 3+13.

Notable upgrades: `R008` "END GAME" (purge), `R001` "Bandittry", `R000`
Seed House plans, `R007` Basic War Machine plans, achievement-flag techs
("Killed 20 Deer", "Fished 40 Times", "Herded 15 Sheep", "Sold 40 Items").

Unit roster highlights (name | id | base | model): Founder H008/Hpal
(MilitiaHeroBLPIII), mounted Founder H02D (MountedFounder), Bandit hero
Hpal-modified, 4 companion heroes (Hjai), economy buildings on `hhou` base
(Store House→Farm House→Town Tower chain, 10 crop fields, Barn, Windmill,
Bakery, Blacksmith, Mine, Castle...), 3 Town Markets/Merchants Guilds/
Inns (ngme base neutral shops), ore/pearl deposit "buildings", ~36 fishing
spots, NPC-faction dummy heroes (Hamg base "NPC Fraction", guild-name
dummies), bosses on nwwg/nadr bases, wolves/werewolves (nwwf), bandit-camp
creeps (uske base with Bandit models), dungeon creeps, wedding guests,
festival stands. Full 406-line dump in `w3u-units.txt`.

Item economy highlights: 5 coin denominations, 9 Trade Goods, hides/furs,
12 fish/haul types, 10 crops + 9 seed types, ores/flour/bread/beer/roast,
hunting/fishing/gathering equipment, building-plan items, ping/location
items, 5 artifacts + unsealed variants, potions, quest tokens. Full dump in
`items.txt`.

## 4. Imports (names lost to protection; counts + recovered internals)

335 MPQ entries total: 21 named war3map.* files + `(listfile)`/`(attributes)`
+ **~122 anonymous .mdx models and ~188 anonymous .blp textures/icons**
(stormlib pseudo-names `FileNNNNNNNN.mdx/.blp`; original paths unrecoverable).
Internal MODL names were recovered from the MDX bytes: medieval building set
(Academy, Armory, Market, Mill, Stables, TownCenter, Church, Tavern ×3,
LumberMill, GuardTower, Encampment, Workshop, Plantation, House, walls),
unit models (Spearman, CrossbowWarrior and armor/weapon attachments by
Kitabatake; boot/armor/helmet/sword sets by Sunchips; Mounted Footman/
Swordsman, HorsebackArcher, Horse, HighElfArcher, Human Archer, Militia,
Assassin, BrownBalverine werewolf, VillagerMan1, PeregrinFalcon, Faerie,
butterflies), economy props (IronOre/SilverOre/GoldOre, strawberry/melon/
cucumber/potato/kohlrabi crops, Grapevine, Cauldron, Chest04, treasure
chests), fireworks, BannerHuman1/"Team Banner II" flags, CustomLoadingScreen.
Credits string confirms sources: Hive Workshop / War3Campaigns authors
(Kitabatake, Sunchips, olofmoleman, OgeRfaCes, Karland90, ...).

## 5. Map info (parsed manually from classic w3i v25 + viewer w3e)

- w3i format 25 (TFT), editor version 6059, **1538 editor saves**.
- Terrain 225×193 vertices = **224×192 cells** (playable 212×180),
  tileset **Q (Village Fall)** with custom tile mix (`Qdrt Qcbp Qgrs Qrck
  Qgrt Fgrd` + crop tiles `cOc1 cWc1`), cliff sets CQdi/CQgr.
- **11,848 doodads** of 127 types (top: custom D000 ×2113, fall trees
  FTtw ×1956, rocks LRrk ×1571, winter trees WTst ×1397 — snowy north /
  autumn south split matches the "constant snow kills crops" rule).
- Players: **8 human slots** (indices 0–5,7,9) + **2 computer slots**:
  Player 10 "Pagans of the North", Player 11 "Believers of the Church"
  (the scripted crusade armies). Forces: "Founders / Bandits" (the 8
  humans, allied-start flags) vs "Pagans / Church".
- The w3i is **protector-truncated**: it ends 1 byte after the forces block
  (upgrade/tech-availability and random-tables sections removed).
- Suggested players "2 - 8"; description: "In a land of countless perils
  and infinite opportunities you begin your journey..."

## 6. Unit placement (from script — no war3mapUnits.doo exists)

Preplaced units are compiled into the script; 238 `CreateUnit` calls total:
- Per player: 1 Founder + 1 mounted-Founder (8 players ×2).
- Neutral towns/shops: 3 Town Markets, 3 Inns/Taverns, 3 Merchants Guilds,
  2 Hunters Guilds, 2 Farmers Guilds, 2 Fishermans Guilds, 6 Guild Houses,
  4 Adventurer's Guilds, Cathedral of the North, Southern Castle, Knights
  Templar Castle, Great Southern Port, Mercenary Army Post, Bran Castle,
  4 festival stands, sign posts/obelisks.
- Economy nodes: 13 iron/ore deposits, 2 silver, 3 sulfur, 6 pearl reefs,
  ~36 fishing spots.
- Defenses/NPC: 33 town guard towers (`h02X`), 32 stone walls, 2 guard
  posts, 7 town guards, 11 patrol guards, 13 bandit spawn markers, 2 bandit
  camps, 3 dungeon entrances, dungeon NPCs, 4 companions, 5 bosses/spirits,
  Everwood spirits, 1 False Founder (H02N).
- Everything else (villagers, travellers, caravans, wolves, deer, creeps)
  is spawned/respawned by ~70 periodic ambient-simulation triggers.

## 7. Toolkit friction on classic maps (first real-world test of the fallback path)

What worked:
- `tools/w3x-extract.js`: HM3W header parsed; KNOWN_FILES probing recovered
  all 21 name-recoverable files from the listfile-stripped archive under
  both stormlib. (smpq backend not exercised.)
- `tools/map-to-json.js`: wts→strings.json translated; all 9 classic
  binaries raw-copied with errors recorded in `manifest.json`; viewer
  fallback produced fully usable `_viewer/*.json` for **w3u w3t w3a w3b w3d
  w3h w3q w3e** — object names, modifications and terrain header all
  readable. This is what made the analysis above possible.

Bugs/gaps found (file:line):
1. **`lib/source.js:117` — viewer-fallback gate too narrow.** Fallback only
   fires when the translator error matches `/cannot currently parse this
   version/i`. Classic `war3map.doo` (v8) instead fails wc3maptranslator
   with `RangeError: The value of "offset" is out of range ... Received
   592552`, so no fallback ran — although `lib/viewer.js:48` parses this
   exact file fine (verified directly: 11,848 doodads, 3.4 MB JSON).
   Suggest attempting the viewer fallback on *any* translator failure.
2. **`lib/source.js:80` — fallback failures swallowed silently.**
   `war3map.w3i` passed the gate but produced no `_viewer/war3map.w3i.json`
   and no diagnostic: mdx-m3-viewer-th's w3i parser throws `ByteStream:
   readInt32: premature end - want 4 bytes but have 1` on the
   protector-truncated w3i (see §5), and the bare `catch {}` hides it.
   Suggest recording failures in the manifest (e.g. `viewerFallbackErrors`).
   Note a hand-rolled classic w3i reader (v25 header→forces) recovered
   everything useful in ~40 lines — worth adding as a second-tier fallback,
   tolerating truncated tails (protectors routinely cut the availability
   sections).
3. **`lib/mpq.js` (PSEUDO_NAME filtering, listFiles:154 / extract path) —
   anonymous members are invisible.** The tool reported "extracted 21
   file(s)" with no hint that the archive holds 335 entries; the ~310
   pseudo-named imports are never extracted. Their content is still
   valuable (this dossier recovered 122 model identities from MODL chunks
   of pseudo-named `.mdx`). Suggest: report the unresolved count in
   w3x-extract output, and optionally extract pseudo-files under
   `_unknown/` (clearly non-build diagnostics, like `_viewer/`).
4. Minor: stormlib-node `SFileFindNextFile` fatally aborts the process
   (napi_throw on a non-exception path) if called with a wrong handle —
   already encapsulated correctly by `slListNames` (`lib/mpq.js:105-120`),
   just reinforcing gotcha 5's "never call stormlib-node directly".

## 8. Deltas vs our Northreach assumptions

The forum-thread-derived brief given to the Northreach builder does **not**
match the real map on nearly every mechanic:

| Northreach assumption | FoTN reality |
|---|---|
| Coastal starts, Captain hero + workers | All 8 players spawn **together** at one inland starting area with a single Founder hero, 320g/20w, **no workers** (workers are trained much later, at Town Tower tier) |
| Expansion sites with gold mines | **No gold mines at all.** Gold comes from selling items (hunting/fishing/farming/herding/gathering/alchemy/trade) at 3 neutral town markets with supply-driven prices; mines are player-built structures on ore deposits (iron/silver/sulfur) yielding crafting materials, one mine per player |
| Found settlements by building town halls at sites | Free-form building anywhere: Store House → Farm House → Town Tower → (Engineer) → Town Center/Castle. `-town` merely pings suggested spots. No site capture/claim logic |
| Periodic income per settlement | **Inverted**: the only periodic gold effect is a 5%-per-40 s *drain* ("corruption") once you own a Town Center or Bandit Fortress; counter is storing wealth as coin items |
| Founders score | No score, no multiboard, no leaderboard of any kind |
| Victory = N settlements or last capital | **No victory condition exists.** Only defeats: leavers, and post-"END GAME"-research purge elimination (lose all Hide Outs + hero). Endgame is *declared by a player* via the R008 research |
| Creep raid waves | No wave system. Ambient dangers: wolves that hunt (and pack-call) at night with a migration model, NPC bandits/road patrols, opt-in Calamities (plague, vampires, abomination) and awakened bosses, plus PvP and player-bandits |
| Longship/banner/cairn custom models | 122 custom MDX are mostly medieval buildings, villagers, mounted units, and item attachments; boats are stock rowboat/ship edits (no longship); banners exist (BannerHuman1, Team Banner II); no cairns |
| `-test` debug mode | No `-test`. Debug = host-slot (red) commands (`day`/`night`/`fund` created disabled, `-check` gated on the author's name "Sifonseal", plus counter dumps/toggles) and author-only `-spiceand*` Easter eggs |

Genuinely shared DNA worth keeping in Northreach: the *word* "founding" and
the Founder hero concept; day/night as a threat cycle (wolves at night);
grace-period peace timer (FoTN: 900 s); death→bandit second-life idea;
economy-first design where military is late-game; northern snow/autumn map
split; naval economy niches (limited port/boatyard spots).
