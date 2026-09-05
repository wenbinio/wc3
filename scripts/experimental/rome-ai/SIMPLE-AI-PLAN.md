# Simple-AI experiment — design, for review before implementation

**Status**: PLAN ONLY. Nothing implemented. Reported for review as instructed.

**Date**: 2026-08-22. **Author**: this session. **Approved in principle by the
owner** ("Do it. Plan it out in detail. Set it so it only applies to several
factions - one on the Roman side.").

---

## 1. The thesis, and what would falsify it

Eleven rounds, roughly fifteen real defects, **every one found by a human
playing the map and none by 628 assertions**. They are not fifteen mistakes.
They are four, repeated:

| failure class | instances |
|---|---|
| a goal selected while unable to progress | 5 |
| a decision whose execution destroys the condition that authorised it | 3 |
| a measure calibrated on barbarian scale, wrong at Roman scale | 4 |
| an instrument that could not fire | 5 |

**Hypothesis**: that failure mode is intrinsic to weighted scoring over
hand-chosen thresholds, and does not arise in a procedural design, because a
procedure has no scores to be wrong and no thresholds to drift.

**The corpus supports it.** Brytenwalda reads as competent to a strong player
while picking war targets **uniformly at random** from an adjacency table,
issuing **one order per attack wave**, with no route, chokepoint or region
model. Squid Game reads as competent on one- and two-bit decisions with the
whole complexity budget spent on pacing. Neither can get stuck, because neither
has the machinery to get stuck in.

### 1.1 Falsification, stated before the run

**The thesis is falsified if the simple AI loses on equal geography** —
specifically if, at end of game, simple ends with lower net territory than its
matched control in **2 of the 3 pairs**. In that case the complexity was
load-bearing and we say so plainly rather than defend it.

**It is also falsified, in part, if the simple AI needs any item from the
refuses-to-model list (§4) to function at all.** That is the more interesting
outcome and the list exists to make it detectable: adding one back is a finding,
not a patch.

**Null result**: if *both* arms move roughly nothing, the experiment has
measured the shared substrate rather than the architectures, and the correct
response is to fix the substrate first — not to declare either winner. The
naval gap and the march/muster interaction are known candidates and are why two
factions are excluded outright (§2.3).

---

## 2. Faction assignment

Per-faction assignment **within a single game** — same map, same human, same
opponents, same run. No cross-game confound, which is exactly the error that
produced a confident wrong table earlier in this project.

### 2.1 Measured from the artifact

267 registrable points (`AI_MAX_POINTS` is 400, so the registry fits). Per
faction, from `units.json`:

| faction | points | frontier¹ | nearest enemy | note |
|---|---:|---:|---:|---|
| West Rome | 72 | 8 | — | owner's most-reported failure |
| North Rome | 73 | 13 | — | **size match to West, within 2%** |
| East Rome | 89 | 11 | — | 24% larger |
| Visigoths | 4 | 3 | 4301 | |
| Ostrogoths | 4 | 4 | 4471 | **best match to Visigoths** |
| Saxons | 3 | 2 | 3402 | |
| Burgundians | 3 | 2 | 3874 | **best match to Saxons** |
| Franks | 4 | 3 | 3866 | |
| Huns | 4 | **0** | 6676 | isolated: no enemy point within 5000 |
| Persians | 4 | 4 | 2400 | unique economy, comparable to nothing |
| Vandals | 4 | 3 | 4180 | sea-locked |
| Britons | 2 | 2 | 3073 | sea-locked, poorest start on the board |

¹ own points within 5000 of an enemy point.

### 2.2 The assignment

**SIMPLE (3 factions, exactly one Roman):**

| faction | matched control | why this pair |
|---|---|---|
| **West Rome** (P3) | **North Rome** (P10) | 72 vs 73 points — the closest size match available. East Rome (89) stays on the current AI as a **free second Roman reference**, since it is in the game regardless. |
| **Visigoths** (P4) | **Ostrogoths** (P8) | 4 vs 4 points, 3 vs 4 frontier, 4301 vs 4471 nearest enemy. The best-matched pair on the board. |
| **Saxons** (P2) | **Burgundians** (P11) | 3 vs 3 points, 2 vs 2 frontier, 3402 vs 3874. The second-best-matched pair. |

Everything else stays on the current AI and is a control by default.

**This corrects the coordinator's proposal in two places**, both from the data:

* **Saxons↔Burgundians replaces Franks↔Saxons.** Franks have 4 points and a
  different contact profile; Saxons and Burgundians match on every measured
  axis. Franks is left on the current AI as an unpaired control.
* **North Rome, not East Rome, is the primary Roman control** — 73 points
  against West's 72, versus East's 89. I checked the obvious objection: North
  Rome has no capital, but `wm_capLost` is computed from the two *actual*
  capital units and is shared across all three Romans, so North Rome runs the
  same code paths. It is not structurally disqualified.

The two simple barbarians are **14,396 apart**, so the simple arm is not a
contiguous bloc that could snowball together.

### 2.3 Excluded, with reasons

* **Vandals, Britons** — sea-locked, and the ferry is unimplemented. Their
  result would measure the missing naval work, not the architecture.
* **Huns** — zero frontier within 5000. Would measure nothing for many minutes.
* **Persians** — flat +50/+50 stipend, 200 food ceiling, unbribable by Rome.
  Comparable to nothing on the board.

### 2.4 The confound I cannot remove, declared

**Matched pairs are adjacent**: Visigoths–Ostrogoths 7,558; Saxons–Burgundians
5,352. On a single-landmass map, the most comparable factions are the ones in
the same region, so comparability and adjacency cannot both be optimised.

Rather than pretend otherwise: **a matched pair in direct contact is the
cleanest possible head-to-head**, provided we report it as such. Both members
face the same third parties. What we must not do is treat the two arms as
independent samples — so the report will give both the pair delta *and* each
faction's delta against its own starting holdings.

---

## 3. What the simple AI is

A fixed procedure, ~400 lines, no scorer.

1. **Adjacency, derived from the registry** — a point is a candidate if it lies
   within `AI_ADJ_R` of any point this faction owns. Expand from your border.
2. **Pick the nearest contested candidate.** Random tie-break, as Brytenwalda
   does.
3. **Muster** at the existing rally, march, fight, repeat.
4. **Brytenwalda's coupling**: the single `AI_CanProsecute` constant gates both
   adopting an objective and marching on it.
5. **Pacing**: inertia gate, constant action rate, reaction latency.
6. **The watchdog** as the only safety net.

That is the whole loop. There is no goal selection, because there are no goals.

---

## 4. What it refuses to model

**This list is the point of the experiment.** If any of these has to come back
for the simple AI to function, that is the finding.

* the threat field (S3 clusters, projection, heading override)
* corridor claims
* the congestion layer
* the posture layer
* incumbency, dwell, and goal hysteresis
* the interrupt-hysteresis bars and the garrison snapshot
* capital readiness and capital targeting
* the supply-hunger term
* the point-value table and all six weighted goal scores
* the ally claim ledger
* write-off / raze-or-hold economics
* proximity scale
* the harasser role and tribal preferences
* mission hold-offs and the stall/abort reason taxonomy
* naval entirely — it will not select an across-water objective

It also does **not** get a difficulty dial beyond what pacing already provides.

---

## 5. Every threshold it has, and where the number comes from

A number someone chose is what we are testing against; it cannot be the thing
we rebuild with. So:

| constant | value | justification |
|---|---:|---|
| `AI_ADJ_R` | 5000 | **Derived**: over the 267 points, nearest-neighbour distance is median 870, p90 2470. At R=5000 mean degree is 7.2 and exactly **1 of 267** points is isolated; at 4000, three are. The smallest radius that leaves the graph effectively connected. |
| `AI_PROSECUTE_CV` | existing | **Cited**: Brytenwalda's war gate `FoodUsed >= 25` and attack gate `FoodUsed > 25` — one shared constant (`brytenwalda-ai-decomposition.md` §5). |
| `AI_INERTIA_KEEP` | 0.75 | **Cited**: `Game6AI` leaves a busy bot alone 75% of the time (`squid-game-ai-decomposition.md` §3.6). |
| `AI_ORDER_SLICE` | existing | **Measured**: peak 72→24 orders/tick on the shipped path (§28.4). |
| `AI_REACT_*` | existing | **Cited**: pacing as a first-class property (Squid Game §7). |
| muster fraction / gather radius | existing | **Measured**: the whole-army denominator put only 34–40% of a faction inside the radius (§24.2). |
| watchdog window / strikes | existing | **Measured**: army signature constant over 6 windows for a parked Roman (§27.2). |

Any threshold that cannot be filled in from that column does not get added.

---

## 6. Reuse — facts and safety, never architecture

Kept, so the comparison is like-for-like: the point registry; gate rawcodes,
camp composition and gate open/close discipline; the centroid-validity
correction; food-ceiling facts; the order choke point with its rotating budget;
the formation slots (a physical fact about units blocking each other, not a
decision); the telemetry emitter; the watchdog; the voices and the new chatter
control; and the `no_cheating()` / `plays_to_win()` / `leaks()` assertions.

**The simple AI speaks with the same voices and reports through the same
channel**, or the comparison is not like-for-like.

---

## 7. Ownership, safety and telemetry

* **Strict per-faction ownership.** A single assignment table maps pid → engine.
  The two AIs must never both order the same unit; this will be asserted by
  construction (one dispatch entry point per faction per tick) and by test.
* **Every telemetry event gains an engine label** so `parse-events.py` can
  report matched pairs directly. *That labelling is the experiment* — without
  it we get impressions again.
* The parser will report, per pair: net territory, army-exit time, commitment
  %, watchdog firings, mission churn, and muster arrival ratio.
* Order economy measured **separately for the simple path**; it must not
  regress.
* Everything standing applies: no material or information cheat beyond the
  existing disclosed split, no human-adjacency branching, ally-scoped chat, no
  engine-AI calls in the playable build.

---

## 8. Cost note the implementation must respect

Candidate selection is O(own × all): 72 × 267 ≈ 19k distance tests for West
Rome. That is too much every tick, so it is **sliced** with a cursor the way
`AI_RefreshPointMemory` already is — a bounded number of points per tick, with
a running best committed when the sweep completes.

**HARD RULE, not a note**: the simple AI's per-tick cost is measured against the
complex arm's and asserted with a bound. **If the "simple" design costs more per
tick, the comparison is contaminated and the finding is worthless** — so this
is a falsification condition (§9.2), not a performance nicety.

---

## 9. PRE-REGISTERED ENDPOINTS AND READINGS

**Written before any data exists. Not to be revised once numbers arrive** —
that is the only thing that stops a null being reinterpreted as a victory.

| endpoint | measure | what it decides |
|---|---|---|
| **Primary** | net territory per matched pair | whether the simple architecture can play the map |
| **Secondary** | stuck-ness: watchdog firings, mission churn, commitment %, time-to-first-objective | whether the **bug class** is architectural |
| **Third reference** | Franks and East Rome — on the current AI, **not adjacent to any simple faction** | baseline drift, so an inflated pair delta is visible rather than assumed away |

### 9.1 The joint reading, declared now

**If territory draws while the simple arm shows near-zero watchdog firings
against a complex arm that fires repeatedly, that is BOTH:**

1. **support for the thesis** — the scoring architecture demonstrably generates
   the failure class; and
2. **an indictment of the programme** — the failure class demonstrably did not
   cost territory, so eleven rounds of machinery bought no measurable
   advantage.

**Both halves go in the report.** Better to deliver that than a comfortable win.

### 9.2 Falsification, restated against these endpoints

* Simple loses territory in **2 of 3 pairs** → complexity was load-bearing.
* Simple needs any item from §4 to function → falsified in part.
* Both arms move nothing → null result about the shared substrate.
* **Simple costs more per tick than complex** → the comparison is contaminated
  and the finding is worthless regardless of the territory result. This is an
  assertion with a bound (§8), not a note.

---

## 10. Resolved before build

**Answered by the coordinator before implementation**: a territory draw with a
large stuck-ness gap is **support for the diagnosis and simultaneously an
indictment of the programme**, and is to be reported as both (§9.1).
