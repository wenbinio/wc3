# docs/reference/ — index

Worked decompositions, comparison dossiers and audit reports. Per file: the
question it answers, its date, and how it goes stale.

- **fotn-analysis.md** (2026-07) — what does a protected 2011 classic
  actually do, vs its forum lore? FoTN 1.24 decomposed. Stable history;
  its §7 toolkit-friction items are already fixed.
- **modern-maps-analysis.md** (2026-07-11) — what do real 2023–2026
  production maps ship (formats/protection/assets), and which toolkit gaps
  did they expose? §3 gap table carries per-item fix status — check it, not
  the prose, for currency.
- **ambitious-maps-analysis.md** (2026-07-11) — what would
  persistence/competitive/campaign-class maps need? Four flagship profiles;
  §6 is the standing ranked deferred-capabilities list.
- **roguelike-comparison.md** (2026-07) — is vaults-of-ash honest vs the 3
  strongest WC3 roguelikes? The comparison-dossier exemplar. Re-check rows
  after any vaults balance phase.
- **economy-survival-comparison.md** (2026-07, phase-3 update) — same for
  coinstead vs Economy TD / Gold TD / Legion TD / LTW. Coinstead is now
  game-verified; its "proven in game" row predates that playtest.
- **zombie-survival-comparison.md** (2026-08-07; ZCD appendix added with
  phase 2A) — same for last-train vs the zombie genre (5 archetypes, 4
  decomposed maps with real numbers, 4 surveyed), plus the Zombie Defense
  Custom decomposition (Lions_Blood, EpicWar 258931/296128 — the fun-loop
  numbers behind the phase-2A transplant). Written from session research
  reports; sources re-downloadable (EpicWar 246910, 257009, 148016, 2253).
  Revisit at phase 2B (golden run, horde-side depth).
- **wc3-canon-invariants.md** (2026-08-07) — what do the most-downloaded
  AND most-hosted WC3 maps never violate? Four evidence bases, seven
  graded invariants (I1–I7), rejected theses, the negative space, fleet
  application and evidence-ranked next builds (tower-wars, random
  defense). Caveats inline (public-bot-lobby bias); goes stale slowly —
  re-check the hosted-count rows before citing numbers.
- **headless-tooling-audit-2026-07.md** (2026-07-12) — what should the
  toolkit improve next? Ranked program; Tiers 1–3 largely landed (status
  notes inline) — only Tier 3 item 7 remains open.
- **preflight-2026-07.md** (2026-07-12) — what can/can't we verify before a
  playtest? Fully automated as `npm run preflight`; read for the rationale
  and the residual only-the-game-can-check list.
- **ai-model-workorder.md** (2026-08) — reusable work-order template for
  commissioning MDL models from an external code LLM (gotchas 14+19 baked
  in). Update the skeleton if the sanity gate ever tightens.
- **fall-of-rome-voices.md** (2026-08-10) — what should each of the twelve
  Fall of Rome factions sound like in the rome-ai chat layer, and what
  strings does an implementer need? Decomposed from the map itself (quest
  briefs, heroes, measured holdings, alliance researches); twelve character
  briefs, 600 lines in three tiers, a PRNG-free selection rule and a
  cross-faction echo suppressor. Also records three mechanics the map
  advertises and does not implement (70-CP victory, the 10-minute barbarian
  free-for-all, camp reinforcement spawns). Spec only — nothing wired;
  goes stale if the AI adds or renames an AI_Say site, so re-check §5.2
  against the call sites before implementing.
- **translation-candidates-2026-08.md** (2026-08-08) — which non-English
  maps are worth a full EN translation pass (KR/CN + RU/EU/JP/VN sweep,
  concept-forward non-RPG criterion)? Merged top-5 + decomposition
  candidates + scene sourcing notes; staleness: hosting/obtainability
  facts decay fast — re-verify URLs before starting a pass.
- **brytenwalda-ai-decomposition.md** (2026-08-12) — how does the one WC3
  map with a genuinely good territorial AI actually do it? Reads the
  shipped artifact (1.37a): a real engine-`.ai` user (`StartCampaignAI`,
  one WE-generated script for 19 factions, **one** move order per wave)
  under a map-script diplomacy layer with a hand-drawn 49-edge adjacency
  graph. Verdict: competent by **design elimination** — buildings can only
  upgrade in place on pre-placed plots, the sea crossing is a tech-gated
  waygate, and the AI is forbidden to close gates — plus three named
  cheats (a +250 lumber/45 s subsidy, a free movement-speed upgrade,
  150–500% hero XP; gold and vision are fair). §8 is the ranked steal list
  tied to our five playtest failures, §9 what not to copy, §10 corrects
  brief-04-amai.md §9's "competence UNKNOWN". **Staleness**: structural
  findings age well; the §4 cheat magnitudes are balance values — re-read
  `Trig_SetupAI_Func001A` before citing them.
- **squid-game-ai-decomposition.md** (2026-08-13) — what does an AI that
  *plays a game* rather than *commands an army* actually compute? Reads
  Squid Game v1.5 (konvan5 & GhostHeroine, wc3maps 258947 — the only one
  of four Squid Game maps still hosted, and Hive-tagged AI) plus Baradé's
  slot-playing minimal version. Verdict: **no engine AI at all**, ~12
  per-minigame trigger brains, 200 NPC contestants over 3 computer slots
  (a third option beside slot-filling and slot-playing), **no material
  cheat** and three handicaps in the *player's* favour. Carries the exact
  red-light cascade, the `2.0/N` one-bot-per-tick glass-bridge scheduler,
  the 120 s dalgona budget and the tug-of-war fumble rates (20% base,
  +20% against a human). §5 is why it passes the eye (five tempo
  mechanisms, plus the one place it fails: no hesitation at the bridge
  frontier); §7 is the short, honest transfer list — inertia gate,
  load-normalised action budget, error-rate-as-difficulty. §8 corrects
  wc3-ai-prior-art.md §4 points 2 and 3 and the CLAUDE.md storagebox URL.
  **Staleness**: structural findings age well; every probability is a
  balance value from the hosted `v1_5_4` build (Hive now ships a later
  `_FIX`) — re-read the named triggers before citing numbers.
- **rome-ai-advisor-review-2026-09.md** (2026-09-05) — is the Fall of Rome AI programme working after fourteen rounds, is the simple-AI A/B sound, and what should the next session stop doing? Independent advisor read of DESIGN §1–§32, the plan, harness and parser, checked against `for-ai.j` and the map's own `info.json`/`units.json`. Verdict: the success metric of §12.2 was never measured; ~14 defects trace to the previous round's fix; the matched pairs are allies on lopsided frontiers with a kind-blind endpoint and two vacuous instruments; build a closed-loop toy world before any further AI change. **Staleness**: pinned to build `65a3ce2`; the geometry table is straight-line over the registry and should be re-measured if the point set or pairs change.

## wc3-ai-prior-art.md (2026-08-09)

**Question answered**: does a good AI for a WC3 custom map exist, and what
can we reuse? **Answer: no, and almost nothing.** Reads the actual code of
the native AI system, AMAI, and four shipped custom-map AIs. Headlines:
the best readable custom-map AI decides once every 10 seconds and never
moves a combat unit; 100% of measured "hard" AIs achieve difficulty by
resource-cheating (nobody has a competence dial); slot FILLING is free and
universal via GHost++ `!comp` while slot PLAYING is the unmet need; and
the target genre (Warhammer: Tides of Chaos, Footmen vs Grunts) has
literally zero AI. Ends with an 8-point gap statement and the
sim-testability constraint (we can test decisions, never outcomes).
**Staleness**: the code read is current as of 2026-08; the gap statement
is structural and should age well.

## wtoc-ai-spec.md (2026-08-09)

**Question answered**: what would an AI have to do to play Warhammer:
Tides of Chaos, and can we iterate on it headlessly? Decomposition of the
live artifact (map by Krazlo; not committed, per Legal). Refutes the
earlier "zero micro" note — that was the map's lobby blurb describing the
metronome, not the game; the map has no builder, food-gates spawns so an
unspent army skips its next wave, excludes heroes from the army macro,
and ships a unit-selection-priority tuner. Carries the spawn/income/
upgrade economics (incl. the 50/25/0% research-salvage tiers), the
permanent-death hero rules and the XP rule that pulls heroes into danger,
the two 300-second ritual instant-wins, a tempo×difficulty decision
table, and the sim-testability verdict: lib/sim cannot run it (JASS) and
even after a Lua port reaches only one of the six decisions the map's
player named as hard. Buildability is excellent (unprotected, clean
round-trip, validate exit 0) and the map ships its own in-game debug
harness. **Staleness**: measured against v1.89K.

## wc3-map-ai-decompositions.md (2026-08-09)

**Question answered**: how do real maps actually drive a computer player —
engine AI subsystem, hand-rolled triggers, or hybrid — and what should
rome-ai steal? Artifact-heavy counterpart to wc3-ai-prior-art.md, and it
corrects that file in nine places (§10). Verdict: the engine ships a full
AI subsystem (123 `common.ai` natives: captains, assault waves, staging,
arrival/unreachability read-back, `CommandAI` interop) and **essentially
nobody uses it** — 1.55% of 5,350 archive.org 2002 maps and 0 of the top
70 live maps drive it, and most calls pass the World Editor's placeholder
`"map.ai"`, a file hash-probing proves absent. But it **does** work on
non-melee custom maps (Footmen Frenzy 9.0 AI: `isMeleeMap:false`, w3i v33,
eight WE-generated `.ai` scripts) and the DotA `AI Plus` line is a hybrid
that hides `AIScripts\AI_Plus.ai` from its listfile and runs per-hero item
logic at 0.1 s. Decompositions: AMAI (hybrid; army clustering + projected
threat field + stall-blacklist + jittered load-adaptive job heap), the WE
AI Editor template (~60 lines of policy), DotA IMBA AI, Castle Fight DE,
Survival Chaos, Risk Europe, the Footmen family, and Fall of Rome itself
(zero AI code, zero `.ai`, but all twelve start locations present). §8 is
the ranked steal list tied to our five playtest failures; §9 is what
nobody has solved (destination scoring, terrain/route models, deadline
planning, determinism). **Staleness**: hosted-count rows move monthly and
the surveys are snapshots; the structural claims and §8 should age well.
The one open premise is S9 — whether the engine captain works on a
workerless, hall-less map — which is a 30-minute in-game experiment.


## warsmash-eval-2026-08.md (2026-08-10)

**Question answered**: can WarsmashModEngine be driven headlessly as an
**outcome** harness for Fall of Rome — ticked programmatically so an AI's
territory-over-time can be measured without a human? **Answer: not blocked by
code, blocked by data.** The engine's `:core` builds headlessly here (system
Gradle 8 + JDK 21; the bundled `./gradlew` 7.3.3 cannot), the simulation
package has zero `Gdx.*` calls and a data-only `CSimulation` constructor, it
parses this map's w3i **v31** (so the drafted v32/v33 fix is NOT on this path),
and — the strong result — its JASS front end **parses and fully resolves** the
map's 553 KB `war3map.j` AND the rome-ai build in ~100 ms with zero unresolved
functions, then executes `main()`. But `CSimulation` is constructed in exactly
one place inside the 3,472-line renderer (no headless entry point exists), and
object data needs **69 Blizzard SLK/TXT tables** the project ships none of; no
game data was downloaded, so no run and **no territory data** was produced.
Also: 71 of the 260 natives this map needs are unimplemented and **fail
silently** (nulled returns) — 45 cosmetic, 14 gameplay-relevant, incl.
`IssuePointOrder` and `IsUnitVisible`. §5 is the effort estimate (4.5–6
engineer-days *after* a user-supplied few-MB headless data bundle, plus an
unbounded validation bill), §6 the fidelity warnings, and **§8 the spin-off
worth more than the harness**: Warsmash's `:jassparser` is standalone and
game-data-free, so it could give `lib/sim` JASS execution — the layer rome-ai
has never had. Reproduction kit: `scripts/experimental/warsmash-eval/`.
**Staleness**: engine facts pinned to commit `f9e0aee` (2025-12-08); re-run
`native-coverage.py` rather than citing its numbers. The data requirement and
the missing headless entry point are structural and age slowly.
