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
