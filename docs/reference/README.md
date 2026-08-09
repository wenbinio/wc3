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
- **translation-candidates-2026-08.md** (2026-08-08) — which non-English
  maps are worth a full EN translation pass (KR/CN + RU/EU/JP/VN sweep,
  concept-forward non-RPG criterion)? Merged top-5 + decomposition
  candidates + scene sourcing notes; staleness: hosting/obtainability
  facts decay fast — re-verify URLs before starting a pass.

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

