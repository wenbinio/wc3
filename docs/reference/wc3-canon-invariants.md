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
