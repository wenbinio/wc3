# Roguelike comparison — The Vaults of Ash vs. the field

An honest capability matrix of the three strongest WC3 roguelike custom
maps against `maps/vaults-of-ash/` (phase 3, 2026-07). The three
competitor columns are measured facts from decomposing the actual
artifacts, not forum lore. **Bold** marks the dimension winner; where a
competitor wins, we say so plainly.

Phase 3 flipped three previously conceded rows with measured content:
three playable heroes (run-identity math 3 x 4 x 5 = 60), a rotating
6-pool of affixed Floor Guardians with corpse-door descents (Ulfsire's
Guardian promotion + exit-from-corpse, credited), and 3 seeded interior
variants per room template (60 authored interiors). Raw item/species
counts and true procedural terrain remain conceded — see the rows.

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
| Run generation | fixed geometry, randomized fills | **procedural floors (~12k biome combos)** | fixed floors, randomized shops/votes | fixed islands; seeded deal of 20 authored templates x 3 interior variants x 5 spawn patterns (+ trial doors) = 60 authored interiors, two seeds provably differ (tested) — true procedural terrain conceded |
| Seeding / determinism | none | none | none | **full: one Park-Miller PRNG, `-seed N` replays any run move-for-move, in game AND in the headless sim** |
| Run length | hours (wipe loses all) | 1-2h typical | 1-2h | **~30 min by design** |
| Content: heroes/classes | 26 heroes (raw count unmatched) | 1 (build-grid IS the class; 55 race/class combos) | 18 classes | **3 heroes with distinct kits + trigger-tested innates (Torchbearer / Ashblade's Cinder Step blink / Chorister's Kindled Chorus heal) x 4 covenants x 5 sigil paths = 60 run identities** |
| Content: items | 198 | ~40 structures/relics | **264 (5 tiers)** | 41 (30 sigil boons in 3 tiers, 6 relics, 5 consumables) — raw count conceded |
| Content: enemies | **55 species** | ~30 + procedural Guardians | ~45 | 20 species x 6 affixes + 6 elites + revenant + boss (multiplicative, but raw count conceded) |
| Content: bosses | 71 (raw count unmatched, but fixed geometry + wait-timer logic) | procedural Guardians | ~12 | **finale (2 seeded aspects + ember feast) + 6 rotating Floor Guardians x 6 affixes = 36 affixed mid-boss variants, each with a scripted signature behavior, every fight seeded + sim-tested; the descent door spawns at the Guardian's corpse** |
| Run identities | hero pick | god + element lock (**terms hidden**) | class + drafted spells | **3 heroes x 4 covenants (explicit terms) x 5 sigil sets = 60 — all tooltipped, counted live by the map (IdentityCount)** |
| Choice cadence | room-to-room | floor + build screen | **13 votes + shop cards** | door omens every room + drafts + trial + campfire + spend-vs-feast (every 3-5 min) |
| Fairness / telegraphing | Sin ambush is HIDDEN | synergy rule invisible, difficulty dial hidden | contracts explicit, RNG opaque | **everything announced: omens (Insight-scaled), Wrath at 50/75/100 + one-room-ahead ambush, trial terms, covenant price, ember feast inscribed** |
| Pity mechanics | none (duplicate-relic bugs) | none | none (no-pity RNG) | **structural: drafts can never offer held boons; every deal guarantees an unseen boon; bounty rarity floors** |
| Co-op death handling | full wipe = hours lost | escape-revive (exit hostage to AFK) | none (no defeat handler!) | **rekindle on next cleared landing + shrine revive; only full wipe ends; defeat ALWAYS summarized** |
| Wipe cost | hours | run | run + save risk | **~30 min, and the seed lets you replay the exact dungeon** |
| Meta-progression | none | none | **save codes (account level)** — but wipeable | vow knowledge-code (4th covenant) — unwipeable but shallower; conceded vs JAR's breadth |
| Economy sinks / threat | shop-greed boss (clever, hidden) | piety | healer economy + wagers | **campfire sinks + the Heart FEEDS on unspent embers — announced and inscribed** |
| Correctness verification | none (wait-timer bugs shipped) | none | none | **70 headless logic tests execute the packed script: golden-run replay is byte-exact (61 pinned beats)** |
| Replay drivers | content mass | biome/build variety | class/draft variety | seeds + 3 hero kits + covenants + sigil builds + guardian pool + interior variants + trial/wrath gambles |

## Verdicts

**vs Roguelike 2.6** — It still wins raw content mass (26 heroes, 198
items, 486 abilities, 71 bosses by count); no 30-minute map should
pretend otherwise. But the two dimensions those numbers used to buy it —
heroes and bosses — no longer read as wins: Vaults' 3 kits x 4 covenants
x 5 sigil paths is 60 distinct run identities against 26 hero picks, and
its boss slate (a 2-aspect finale that feeds on your hoard, plus 6
rotating affixed Floor Guardians with scripted signature behaviors) is
seeded, telegraphed and machine-verified where RL 2.6's 71 are fixed
encounters on wait-timer logic. Everything else — determinism, wipe
cost, fairness, state correctness — was already Vaults': the Sin ambush,
the shopkeeper's greed and the knowledge-code tradition live on here as
Wrath, the ember feast and the vow, each with the hiding removed, and
its signature bug class (duplicate relics) is structurally impossible in
our draft/deck model.

**vs Ulfsire's Roguelike** — Still the only competitor that beats us on
generation: true procedural floors vs our seeded template deal — phase 3
narrows that gap honestly (20 templates x 3 interior variants x 5 spawn
patterns = 60 authored interiors, two seeds provably differ, tested) but
does not close it, and we say so in the row. Its other crowns have moved:
its 55 race/class combos are now second to our 60 identities, and its
procedural Guardians live on HERE — the Floor Guardian pool and the
descent-door-from-the-corpse beat are its ideas, adapted with credit and
made deterministic, affixed and sim-tested. Every one of its systems
still ships with the rules hidden — the synergy radius, the difficulty
doubling, the pact terms — and it has no seeds, so its depth can't be
studied, shared or replayed. Vaults takes its five best ideas (structure
synergy, god pacts, prime monsters, escape-revive, Guardian promotion +
exit-from-corpse) and prints the rules on every tooltip. Legibility over
mystery is the deliberate trade.

**vs Just Another Roguelike** — It wins item count (264 vs 41) and has
the broader meta (account save codes vs our single vow phrase). Its risk
contracts and looting stat are the field's best economy designs, and
Vaults adapts both (trial doors, Insight). Its 18 classes, though, now
face 3 kits x 20 build combinations each: 60 tooltipped identities. And
JAR still ships no pity, no second difficulty, no defeat handler and
wipeable saves — the four fairness gaps Vaults exists to close: hard
pity on drafts, covenant-scaled difficulty, a defeat path that always
fires, and a meta unlock no wipe can delete.

## Credits

Design inspirations, adapted with credit (mirrored in the map README and
in-game in the credits quest and `-help`):

- **Roguelike** by **DeathdruidX** — Sin ambush → telegraphed Wrath;
  shopkeeper's greed → the Heart's ember feast; knowledge-code meta →
  the vow of the fourth altar.
- **Ulfsire's Roguelike** by **Ulfsire** — structure synergies → legible
  sigil sets; god pacts → covenants with printed terms; prime monsters →
  elite affixes; escape-revive → rekindling; Guardian promotion +
  exit-from-corpse → the Floor Guardian pool and the descent door that
  spawns at the Guardian's corpse.
- **Just Another Roguelike** by **PortusM** — risk contracts → trial
  doors; looting-as-a-stat → Insight.

No assets, code or text from any of the three maps are used or
redistributed; the inspiration is mechanical, from decomposition-driven
study (CLAUDE.md "Decomposition-driven design").
