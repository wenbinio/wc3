# The WC3 custom-map canon: invariants of what people actually play

**Question answered**: across the maps Warcraft III players have actually
downloaded and hosted at scale — not the maps critics praise — what design
properties are invariant? What does the canon never do? And what does that
imply for this toolkit's fleet?

Date: 2026-08-07. Method: four independent evidence bases, cross-checked;
every invariant below carries its evidence class and measured confidence.
Companion appendix: the Zombie Defense Custom decomposition in
docs/reference/zombie-survival-comparison.md (the single-map close-read
that motivated several of these rows).

## 1. The four evidence bases

- **(A) EpicWar top-200 all-time downloads** (fetched 2026-08-07):
  98.75M downloads across the 200 entries; 48.4% of them are DotA
  point-versions; the #1 single entry is *Map Tong Hop V49.0* at 6.97M.
  Class: **acquisition evidence only** — a download is an intent, not a
  played game.
- **(B) maps.w3reforged.com most-played all-time top 120** (real
  hosted-lobby counts): *Legion TD Team OZE* 2,880,350 hosted games — #1
  by **7.8×** over the field; *Direct Strike* 518k; *Pumpkin TD* 371k;
  *Castle Fight DE* 232k; *Line Tower Wars Reforged* 195k; *Survival
  Chaos* 184k; *One Piece Random Defense* 177k; DotA is **thirteenth** at
  125k. Class: behavioral evidence of what gets HOSTED and re-hosted.
- **(C) Hive Workshop Top-100 (2017)** — curated classic-era
  retrospective: DotA, Legion TD, Wintermaul, Footmen Frenzy, Loap, Green
  TD, Castle Fight, Enfo's, Line Tower Wars, Tree Tag, X-Hero Siege,
  Vampirism, Sheep Tag, Uther Party, Azeroth Wars in the top 15. Class:
  curated, not data — used to test era-stability, not to rank.
- **(D) wc3tracker.com live telemetry 2024–26**: *Ordr* (random defense)
  587k sessions / 20k hosts; Legion TD 146k; Direct Strike 68k. Class:
  live behavioral, small window.

**Era divergence, stated plainly**: the classic canon (A/C) is
genre-diverse — RPGs, party maps, social sandboxes all chart. The modern
HOSTED canon (B/D) is narrow: build-and-watch defense dominates. The
invariants below are graded against BOTH; where an invariant only holds
in the hosted era, that is said.

## 2. The seven invariants

**I1 — Built for a lobby, always.** 100% of the top 200 are 6+ player
slots; 153/200 are exactly 10; zero are 1–2 player. Confidence: as high
as this method allows. Caveat that keeps it honest: co-presence, not
interaction — much of the canon is parallel solitaire on a shared board
(Legion TD lanes, TD slots). The lobby is the room, not necessarily the
conversation.

**I2 — You own one thing that visibly compounds.** 60/60 of the modern
hosted maps examined have a player-owned, persistently growing quantity
(a tower array, an income, a hero, a lane army). The apparent
falsifiers — Uther Party, Pudge Wars — are party maps absent from the
hosted lists. Refinement that matters: it is compounding **legibility**,
not compounding power — Legion TD grows numbers relentlessly while never
letting you feel powerful. This is the closest thing the canon has to a
zero-exception law.

**I3 — Threat on an uncontrolled clock.** 90% of examined maps / 96% of
hosted games run pressure the player cannot pause (waves, sends, creep
cycles). The 6 exceptions cluster exactly where expected: the
RPG/strategy shelf. Era note: only 43/100 of the classic curated list
qualifies — the escalation shape is what SURVIVED into the hosted era,
not what always was.

**I4 — The player composes; the engine adjudicates.** 87% of hosted
games are build-and-watch: no APM gate anywhere in the modern canon.
Verb census across the hosted top maps: build tower 21, control hero 15,
build producer 6, roll unit 5, and a long tail. Micro exists (hero
maps); mandatory micro superiority does not.

**I5 — A decision every 20–60 seconds.** Inferential (from wave/round
pacing across the hosted canon), and the WEAKEST-evidenced row here —
flagged as such. Kept because nothing in any base contradicts it and the
pacing structures (wave gaps of 20–60s) imply it.

**I6 — Elimination is nearly forbidden.** 2% of hosted games allow
permanent removal of a player. The canon answers death with respawn,
never-die (builder safe behind the lines), or **side-switch**. The
side-switch answer is rare and prized — it is the structurally correct
reading of Last Train's defection mechanic.

**I7 — The unit of success is a maintained franchise, not a map.** DotA:
102 versions in the download top-200 alone. Legion TD: an unbroken
2007→2026 lineage. Ordr: 105 versions. **No map in the canon ever
"shipped"** — the canonical state of a successful map is
perpetually-patched. Corollary for this fleet: a bundled map's phase
roadmap is not overhead; it IS the canonical form.

## 3. Rejected and narrowed theses

- **"A simple verb mastered in two minutes"** — rejected as stated
  (Legion TD value-decisions are deep). Survives narrowed: a **tiny
  RTS-native input vocabulary** (build/move/attack/buy), with all
  complexity in composition, never in input. New input grammars are
  effectively absent from the canon.
- **"The social stage is the product"** — rejected for the hosted era:
  Loap, Uther Party, Vampirism were classically huge and are absent from
  the hosted lists. The social-sandbox canon did not survive the bot-
  lobby transition (see caveats — private hosting is undercounted).

## 4. The negative space (what the canon never does)

No solo maps. No permanent ejection of a player. No APM gate. No long
setup before the first decision (**first decision < 60s** everywhere
examined). No hidden state — multiboards are near-universal. No
unbounded sessions. No finished maps (I7). No reading requirement. No
narrative-first map in any top list. And — flagged as inference, not
measurement — **typing is never the minute-to-minute verb**; chat is
lobby-config and meta everywhere the canon was examined (difficulty
votes, mode picks at t=0), never combat input.

## 5. Application to this fleet

- **Last Train (phase 1)**: the deepest violation was **I2** — nothing
  the player owned visibly compounded (score was invisible, gear churned,
  no levels). Second: the train was a deadline, not a metronome (I3
  wants pressure you can SEE counting). Its one canon-RIGHT mechanic was
  defection (I6's rare side-switch answer) — phase 2A builds it up
  rather than down. The typing surface violated the negative space
  wholesale; the phase-2A fun transplant (DESIGN-WALKTHROUGH.md) is the
  systematic repair.
- **Coinstead** satisfies all seven invariants — and is exactly the map
  the 2026-08-07 playtest praised. Strongest internal corroboration this
  study has. Instructive detail: coinstead's `-link` chat verb passed
  playtest because it is SETUP-typed-once-and-persists; Last Train's
  per-action typing did not. The line is not "chat bad" — it is "chat at
  combat tempo bad" (now CLAUDE.md gotcha 33).
- **Vaults-of-ash** is structurally download-era: a player-paced
  roguelike hosts poorly (violates I3 in hosted terms). Fine as built —
  but its audience model is single-download, not bot-lobby.
- **Tidewatch**: hero-arena is 1/60 in modern hosting; same caveat.

## 6. Strategic notes (next builds, evidence-ranked)

1. **Tower-wars / send-and-defend** is the highest-evidence next build:
   LTW 195k hosted + Castle Fight 232k + Direct Strike 518k triangulate
   the send-economy loop, and every subsystem it needs (income ticks,
   producer buildings, shared-board legibility, deterministic waves)
   already exists in coinstead.
2. **Random-defense** is the best canon-fit-per-effort: Ordr is #1 live
   (587k sessions); the loop is roll → combine → watch; and a seeded
   roll stream is EXACTLY a Park-Miller draw — seeded determinism is the
   fleet differentiator no canon map has. The competitive claim "same
   deck, played better" (two lobbies, one seed) is available to this
   toolkit alone.
3. Everything narrative-first, solo-first, or new-input-grammar-first
   swims against every base at once. Do it knowingly or not at all.

## 7. Caveats (read before citing)

- B and D count PUBLIC bot lobbies; private/clan hosting (where classic
  RPGs live on) is undercounted by an unsized amount. The social-canon
  rejection in §3 could be partially an artifact of this.
- wc3tracker per-map pages returned 403 at fetch time; only its
  aggregate pages informed D.
- The Hive Top-100 is a curated 2017 retrospective, not measurement — it
  is used only to test which properties are era-stable.
- Downloads (A) measure acquisition; a 2006 download and a 2026 hosted
  game are not the same act. Where A and B disagree, B was trusted for
  "what people play".

## 2026-08-08 addendum (new-maps scout, measured)

- **I7 ("no map ever ships") holds, stronger**: the hosted top are
  INSTITUTIONS — Pumpkin TD (own domain + Patreon + Discord savecode
  escrow, 934k group hosted), NOTD Aftermath (GitHub org + issue
  tracker + domain, 22-year lineage still in beta), Legion TD OZE (two
  versions in live rotation), ORDR (seasons). New maps reach hosting
  within weeks via Discord-first communities; Hive is where maps get
  REVIEWED, not played.
- **New infrastructure post-dating this study**: W3Champions runs
  RANKED LADDERS for custom maps (Legion TD ×2, Direct Strike, Castle
  Fight, Survival Chaos, Risk Europe, MiniDota — live API). Codeless
  persistence (FileIO + BlzSendSyncData) is the standard stack; Wild-
  Hunt 1.2.0 ships a clean open-source reference implementation.
- **Hosted-canon snapshot 2026-08**: Zombie Defense 0.25z6 at 18,011
  hosted/month is #1–2; Pumpkin TD, Legion TD OZE, Direct Strike,
  HELLHALT follow. Genre spread unchanged (defense/autobattler/TD; no
  deduction/sim/board game in the top — novel concepts live in the
  long tail). Notable novel 2026 entries: Poker Strike (autobattler ×
  poker hands, 1,141 hosted/mo), Iron Sceptre (full CCG, WE-open),
  Particle Party (N-body physics arena on the ALICE framework).

## 2026-08-08 CORRECTION + scope warning (blind-spot scout, measured)

**Pumpkin TD is a KOREAN map.** The addendum above lists it as a
Western hosted-canon institution; that is wrong by omission. From the
artifacts' own w3i fields: 호박숲디펜스 (id 279453) reads
`*PumpkinForestDefence / *제작 : king50` and still hosts 1,012/mo in
Korean; `Pumpkin TD v1.12-ENG` (363950) has author `king50 (소쩍새
#31549)` and credits `*English Version: kvickan#1134`; the current
Pumpkin TD v2.3b (429910) — **#2 in the entire live hosted canon at
11,597 games/month** — lists `Advy, ABlackDeath, kvickan` and has
**dropped king50 from the byline**. So the #2 map in the canon is a
translated Korean map whose localization outgrew and then de-credited
its original author. Lineage is a four-branch forest: KR original
(king50), EN fork (kvickan→Advy), 호박숲리버스 (미로즈), 호박숲디펜스Z
(주디).

**Scope warning — this dossier under-models the Korean scene.** It was
built from EpicWar downloads, w3reforged and wc3tracker, all
Latin-facing. Ranking the ENTIRE live hosted canon via
`wc3maps /api/search?order=hosted_month` (1,199 maps hosted in the last
month) measures: Latin-script 926 maps / 301,541 games (79.5%),
**Korean 211 / 71,219 (18.8%)**, Chinese 51 / 6,200, Russian 11 / 438.
126 non-Latin maps host ≥100 games/month. Two Korean maps sit in the
top 25 (동물과 벽 짓고 살아남기 #13, 뿔레전쟁 #22). Any claim here
about "what the canon plays" should be read as "what the LATIN canon
plays" until re-derived over the full ranking.

**Corollary on translation vs maintainership** [M]: Korean authors DO
ship their own English builds (navia2, loveisanswer, king50 all did) and
those builds die at 0–935 hosted while the Korean lines run in the
thousands. The one that thrived is the one a separate Western
maintainer adopted with community infrastructure. The scarce resource
is maintainership, not translation.

**Era-divergence evidence upgrade** [M]: the archive.org `wc3_maps_2002`
snapshot (5,359 maps, per-file browsable with pre-parsed metadata
sidecars) shows genres the modern canon has abandoned were alive in
2002 — Mario Kart, Monopoly (6 point-versions), Musical Chairs (5
versions), Stealth Operations, a weapons-factory automation map. The
diversity existed and DIED; that is stronger support for §3 than
anything currently cited there.

## 2026-08-08 wave-6 corrections (five-agent sweep, measured)

**Numbers**: wave 5's counts were an instrument artifact — with
`groups=""` the API sorts by the group aggregate but returns each
lineage's LATEST row. Walking `groups=false` gives 9,600+ live builds /
3.05M games vs 3,192 lineages / 402K. And page-walking `order=` is not
a stable total order (pages 61–100 surface maps pages 1–60 never
returned). **Treat every canon count in this dossier as a FLOOR.**
Language shares survive; KR is 23–30%, not 18.8%. `/api/stats` is stale
(series ends 2024-11).

**§3's "the social-sandbox canon did not survive the bot-lobby
transition" is FALSIFIED.** Life of a Peasant Ascension (24p, jobs with
real production chains, gangs, arena ladder, school scenarios with
lawsuits) hosts 227/mo, and it is not alone: Uther Party Ultima-X 272,
Are you a Lucker? 123, Canned Bread 104, Banjoball 135. Narrow the claim
to "social sandboxes lost the HEAD", not "died".

**I1 ("no solo maps") is a property of the modern HOSTED canon, not of
WC3 custom maps.** 4.6% of the 5,359-map 2002 corpus declares 1–2 player
slots (9.2% of index rows).

**I6 (no elimination) needs the same narrowing**: Risk Europe — real
elimination, 23 players — hosts 1,245/mo, and the 2002 corpus contains a
Survivor-format elimination game (Dog Eat Dog) with permanent knockout
as a designed feature.

**The era-divergence thesis is refined, not just supported.** Matched
corpus comparisons (2002 n=5,359 vs a 2009 kept-on-disk sample n=1,442,
and 2002 descriptions vs an EpicWar 2005–09 sample n=4,500) show the
collapse was NOT uniform: deduction (1.08×), board games (0.88×) and
city-sim (0.95×) HELD their share from 2002 into 2005–09, while the
party/novelty/physical-experiment shelf died (sandbox 0.12×, racing →0,
elimination shows →0, drawing →0, golf →0, physics-aim →0) and
TD/RPG/AoS/survival roughly tripled. A SECOND collapse (2009→2026) took
the rest, and deduction migrated wholesale into the KR/CN/RU scenes.

**Two genre rows have NEVER been occupied in any era measured**:
courtroom/trial and automation/logistics. They are openings against the
entire 24-year record, not just against the 2026 index.

**Better evidence is now cheaply available**: the EpicWar dump on
archive.org is per-file addressable for ids 1–117,529 (2005-02-24 →
2009-12-03), carrying category, submission date, RATING (good/bad) and
DOWNLOAD COUNT per map — ~53MB of metadata, ~3 hours to pull. That would
replace this dossier's evidence base (A), currently a top-200 scrape,
with a five-year census.

**Fork topology matters for any "what the canon plays" claim**: median
lineage = 93 versions ever with 11 live simultaneously; the top build
holds a median 70% of its lineage's hosting and `latest=1` is often not
the played build; and one lineage's top-hosted build was a cheat fork.
Use the `saves`-cohort heuristic (see the translation dossier) before
attributing hosting to a design.

## 2026-08-08 wave-6d: THE CANON IS KOREAN (supersedes the counts above)

**Third and decisive metric correction.** Every prior count in this
dossier — including the wave-6 correction above — summed the per-row
`hosted_month` field. That field is CORRUPT for high-volume lines (an
all-time count leaks into the month field). **`group_hosted_month` is
the sound metric.** Over 3,089 live groups: **Korean 58.3%** (207,000),
Latin 40.3% (143,316), Chinese 1.3%, Russian 0.1%. Confirmed twice
independently of map language: the `/api/activity` gateway split
(**62.1% of 64,429 games over 28h came from the kr gateway**, peak
76.6%) and a live lobby snapshot (40.6% kr). `/api/stats` had shown kr
at 27–35% since 2020 — the field was never read.

**One map is half the network.** 원피스랜덤디펜스R (ORDR) hosts 169,133
group-games/month = **47.6% of every game on the network**, 5.8× the #2
map worldwide. **Zombie Defense, called #1–2 in the addendum above, is
#8 globally** — that snapshot is a *Latin*-canon statement and should be
read as such. Korean top-1 concentration is 81.7% (Latin: 19.7%): the
Latin canon is a distribution, the Korean canon is one franchise plus a
500-map graveyard (471 of 527 groups host <100/mo).

**What this canon actually is**: random-defense = **83.8% of Korean
play** across 23 groups. 523 JASS / 4 Lua / **zero transpilers** — the
Lua/TS/C# migration visible in the Latin mid-tail has not happened here.
**481 of 527 groups are classic w3i v25**, so our v25 codecs are the
load-bearing ones, not the Reforged path. Median editor saves 2,876.
Korea also runs its own **JN API** alongside CN's DzAPI (frame UI, raw
keyboard, process memory) — those maps are outside vanilla and
un-simulatable by lib/sim by construction.

**I-invariant support from the most-played map on earth**: ORDR's verb
census is **zero combat-tempo typing** — all 16 chat commands are meta
(reroll, story, scoreboard, vision, treasure, door, offline). Gotcha 33
holds at the top of the canon. It also demonstrates three mechanics
worth adopting: a machine-readable (lintable) tooltip schema across
~2,300 abilities; timed side-objectives whose failure penalty is
**denial of a future roll** rather than damage; and `-기여도`, a
per-player contribution metric INSIDE a co-op team (an anti-freeloader
surface our team-scored maps lack).

**Franchise-vs-file, quantified**: an author's own English build of his
Korean map retains ~0.1% of its hosting (849× and 369× drops measured on
two authors), while **KR→CN localization retains ~10%** (20 CJK-titled
groups in the live canon are Korean-authored). The Korean scene has one
working export channel and it points east. Translation alone does not
move a map; a maintainer does (the Pumpkin TD pattern above).

## 2026-08-09 wave-6e: LIVE TELEMETRY — the window, I1 qualified, I7 quantified

**THE FIELD WINDOW IS 69 DAYS, NOT 30** [M]. Every wave (3–6) read
`hosted_month` as games/month. Partitioning 350 top versions by whether
`hosted_month == hosted_total` and sorting by age gives **zero overlap**
between the two classes at 68 vs 69 days ⇒ the counter window is
**68 < w ≤ 69 days** (counting since ~2026-06-01). `group_hosted_month`
is a *different* window: month-to-date. Triangulated three ways to
games/day: activity feed (6 full days) **46,897**; Σ`hosted_month`/69
**42,545**; Σ`group_hosted_month`/8.19 **43,463** — the counter-derived
pair agree to 2.1%. Under a 30-day reading, Σ`hosted_month` would imply
97,855 games/day, ~2× the platform's own feed.
**Consequence: every "N hosted/month" figure in these dossiers overstates
monthly rates by ~2.3× (69/30).** Zombie Defense's "18,011/mo" ≈ 7,900.
Also: `/api/stats` is frozen at 2024-11; `/api/activity?range=` IGNORES
its parameter (always 7 days); `order=hosted_month` actually sorts by
`group_hosted_month`; version grouping is unstable (5 of 589 lineages
re-partitioned within 6 minutes); and **counter deltas are unusable** —
counters refresh in bursts, so a 22-minute delta over-reported by 3.7×.
Use the two fixed windows only.

**I1 IS MEASURABLY QUALIFIED — and it validates our own authoring
shape.** I1 ("built for a lobby… 100% of the top 200 are 6+ slots") was
derived from EpicWar *download* counts. On live *hosting*: **the #1
lineage in the entire canon is a 4-SLOT map** (ORDR, `users: 4`,
confirmed across 242 observed lobbies) at 47.5% of all measured games.
Share of games from ≤4-slot lineages: top-10 **71.9%**, all 3,081
lineages **53.7%**. And fill rate declines monotonically with size —
**4-slot lobbies reach full 29% of the time; 10-slot, 2%**. So a
1–4-player co-op map is the best-filling and highest-volume shape in the
live canon, not a niche. The "no solo maps" half of I1 stands (1–2 slot
= 1.1% of games).

**I7 IS QUANTIFIED**: across 74,123 version records from the top 400
lineages, **88.8% of games played this month are on a lineage patched
within the last 30 days; 95.5% within 90; 99.0% within a year** (median
21 days since last version; median 13 versions per year). ORDR ships
~2.5 point-versions per DAY, sustained. The counter-example proves it:
Pumpkin TD — the de-crediting fork noted above — has shipped nothing in
90 days and its momentum is 0.30× its lifetime average.

**What is rising** [M]: CHAOS is mid-lineage-migration — the 14-day-old
`R0.02 WCC` runs at 5.14× its own recent rate while the incumbent
`B1.A1` sits at 0.48×, and **72.7% of the new lineage's entire lifetime
hosting happened in 8 days**. Other genuine risers: Poker Strike
(1.97×), Green Circle Autumn Codex (28 days old, 2.34×), 동물과 벽
(1.64×). Decliners: Legion TD Crazy 0.08×, DotA 0.13×, Pumpkin TD 0.30×.

**Language, weighted by games played** [M]: JASS **88.6%**, Lua 9.9%,
TypeScript 0.9%, C# 0.6%. Lua is only 2.7% of live lineages, so it
**over-indexes 3.7× on being played** and holds the #2 lineage — our
Lua-first authoring is not fringe. But **anything that reads only Lua is
blind to ~89% of live play**, and the freshest riser measured (Green
Circle Autumn Codex) is JASS on classic-adjacent w3i v31 — the tier our
`lib/codecs/` covers, not the v33 tier our own maps author in.

**A second distribution channel this dossier never modelled** [M]:
W3Champions runs 15 ranked ladders, 8 of them custom maps. **Direct
Strike's ladder is 83% the size of its entire public bot hosting** and is
21.5% of all W3Champions activity — so Direct Strike is nearly twice as
big as any bot-lobby index says. Correlation with hosting is weak and
mode-specific (Legion TD is 2.6× Direct Strike in lobbies but 1/8th its
ladder): **laddering is a distribution decision, not a popularity
consequence.**

**Honest limits of all of the above**: public bot lobbies only (private/
clan/LAN invisible; Chinese play happens on Netease/KK, outside this
index entirely); fill/region figures come from ONE 41-minute window that
over-samples KR+US-west and under-samples EU ~2×; `hosted_*` counts
lobbies hosted, not games completed — **36% of lobbies never exceed one
player**; `group_hosted_total` starts 2018-02-04, so every "lifetime"
figure is over the index window and momentum is biased high for older
lineages; and nothing here measures whether a map is *fun*, only whether
it is started. Method trap for anyone reusing `/api/lobbies`: **the `id`
field is re-minted on every poll** (0 of ~75 carried-over lobbies kept
their id between consecutive samples) — key on `(host, map_id, created)`.
Snapshot-share ≠ game-share: an open-lobby snapshot measures lobbies ×
dwell time and so over-represents maps that FAIL to fill.
