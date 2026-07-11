# Roguelike comparison — The Vaults of Ash vs. the field

An honest capability matrix of the three strongest WC3 roguelike custom
maps against `maps/vaults-of-ash/` (phase 2, 2026-07). The three
competitor columns are measured facts from decomposing the actual
artifacts, not forum lore. **Bold** marks the dimension winner; where a
competitor wins, we say so plainly.

The design intent behind the matrix: The Vaults of Ash deliberately
*adapts* the best mechanic of each competitor and fixes the fairness flaw
it shipped with — every adaptation is credited in-game (quest log +
`-help`), in the map README, and below.

## The contenders

- **Roguelike 2.6** (DeathdruidX) — the content colossus: 26 heroes,
  198 items, 55 enemy species, 71 bosses, 486 abilities. Fixed geometry
  every run, no seeds, no saves; full wipe = hours lost; duplicate-relic
  state bugs; wait-timed boss logic.
- **Ulfsire's Roguelike 0.6.7** — the systems pioneer: procedural floors
  (~12k biome combos), build-grid character sheet (structures = spells),
  2-of-12 element lock, 11 gods with piety, no-regen health, boss-kill
  difficulty doubling, escape-revive co-op, procedural Guardians. Core
  synergy rule invisible, difficulty math hidden, generation stalls, no
  seeds.
- **Just Another Roguelike v1.01a** (PortusM) — the economy designer:
  18 classes, 264 items in 5 rarity tiers, Q/W/E/R spell-drafting,
  looting-as-a-stat, healer gold economy, 13 democratic per-floor risk
  contracts, save-code meta. RNG with no pity, save wipes, favoritism
  content, one difficulty, no defeat handler.

## The matrix

| Dimension | Roguelike 2.6 | Ulfsire's 0.6.7 | JAR v1.01a | Vaults of Ash |
| --- | --- | --- | --- | --- |
| Run generation | fixed geometry, randomized fills | **procedural floors (~12k biome combos)** | fixed floors, randomized shops/votes | fixed islands, seeded deal of 20 authored templates onto doors (3-of-4 per floor + trial) |
| Seeding / determinism | none | none | none | **full: one Park-Miller PRNG, `-seed N` replays any run move-for-move, in game AND in the headless sim** |
| Run length | hours (wipe loses all) | 1-2h typical | 1-2h | **~30 min by design** |
| Content: heroes/classes | **26 heroes** | 1 (build-grid IS the class) | 18 classes | 1 hero (identity = covenant x sigil build; see run identities) |
| Content: items | 198 | ~40 structures/relics | **264 (5 tiers)** | 41 (30 sigil boons in 3 tiers, 6 relics, 5 consumables) |
| Content: enemies | **55 species** | ~30 + procedural Guardians | ~45 | 20 species x 6 affixes + 6 elites + revenant + boss (multiplicative, but raw count conceded) |
| Content: bosses | **71** | procedural Guardians | ~12 | 1 boss x 2 seeded aspects + ambush elite — conceded |
| Run identities | hero pick | god + element lock (**terms hidden**) | class + drafted spells | **covenant (4, explicit terms) x sigil set (5) x epic build-arounds (6) — all tooltipped** |
| Choice cadence | room-to-room | floor + build screen | **13 votes + shop cards** | door omens every room + drafts + trial + campfire + spend-vs-feast (every 3-5 min) |
| Fairness / telegraphing | Sin ambush is HIDDEN | synergy rule invisible, difficulty dial hidden | contracts explicit, RNG opaque | **everything announced: omens (Insight-scaled), Wrath at 50/75/100 + one-room-ahead ambush, trial terms, covenant price, ember feast inscribed** |
| Pity mechanics | none (duplicate-relic bugs) | none | none (no-pity RNG) | **structural: drafts can never offer held boons; every deal guarantees an unseen boon; bounty rarity floors** |
| Co-op death handling | full wipe = hours lost | escape-revive (exit hostage to AFK) | none (no defeat handler!) | **rekindle on next cleared landing + shrine revive; only full wipe ends; defeat ALWAYS summarized** |
| Wipe cost | hours | run | run + save risk | **~30 min, and the seed lets you replay the exact dungeon** |
| Meta-progression | none | none | **save codes (account level)** — but wipeable | vow knowledge-code (4th covenant) — unwipeable but shallower; conceded vs JAR's breadth |
| Economy sinks / threat | shop-greed boss (clever, hidden) | piety | healer economy + wagers | **campfire sinks + the Heart FEEDS on unspent embers — announced and inscribed** |
| Correctness verification | none (wait-timer bugs shipped) | none | none | **52 headless logic tests execute the packed script: golden-run replay is byte-exact** |
| Replay drivers | content mass | biome/build variety | class/draft variety | seeds + covenants + sigil builds + trial/wrath gambles |

## Verdicts

**vs Roguelike 2.6** — It wins raw content by an order of magnitude (26
heroes, 71 bosses, 486 abilities); no 30-minute map should pretend
otherwise. Everything else — determinism, wipe cost, fairness, state
correctness — goes to Vaults: RL 2.6's three cleverest systems (the Sin
ambush, the shopkeeper's greed, the knowledge-code tradition) live on
here as Wrath, the ember feast and the vow, each with the hiding removed,
and its signature bug class (duplicate relics) is structurally impossible
in our draft/deck model.

**vs Ulfsire's Roguelike** — The only competitor that beats us on
generation: true procedural floors vs our seeded template deal, and its
build-grid is deeper than our sigil sets. But every one of its systems
ships with the rules hidden — the synergy radius, the difficulty
doubling, the pact terms — and it has no seeds, so its depth can't be
studied, shared or replayed. Vaults takes its four best ideas (structure
synergy, god pacts, prime monsters, escape-revive) and prints the rules
on every tooltip. Legibility over mystery is the deliberate trade.

**vs Just Another Roguelike** — It wins item count (264 vs 41) and has
the broader meta (account save codes vs our single vow phrase). Its risk
contracts and looting stat are the field's best economy designs, and
Vaults adapts both (trial doors, Insight). But JAR ships no pity, no
second difficulty, no defeat handler and wipeable saves — the four
fairness gaps Vaults exists to close: hard pity on drafts, covenant-
scaled difficulty, a defeat path that always fires, and a meta unlock no
wipe can delete.

## Credits

Design inspirations, adapted with credit (mirrored in the map README and
in-game in the credits quest and `-help`):

- **Roguelike** by **DeathdruidX** — Sin ambush → telegraphed Wrath;
  shopkeeper's greed → the Heart's ember feast; knowledge-code meta →
  the vow of the fourth altar.
- **Ulfsire's Roguelike** by **Ulfsire** — structure synergies → legible
  sigil sets; god pacts → covenants with printed terms; prime monsters →
  elite affixes; escape-revive → rekindling.
- **Just Another Roguelike** by **PortusM** — risk contracts → trial
  doors; looting-as-a-stat → Insight.

No assets, code or text from any of the three maps are used or
redistributed; the inspiration is mechanical, from decomposition-driven
study (CLAUDE.md "Decomposition-driven design").
