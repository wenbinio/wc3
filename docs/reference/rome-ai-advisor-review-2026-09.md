# Rome AI — independent advisor review (2026-09-05)

**Question answered**: after fourteen playtest-driven rounds, is the Fall of
Rome AI programme (`scripts/experimental/rome-ai/`) working, is its current
experiment sound, and what should the next session do and stop doing?

**Method.** Read in the order the brief prescribed: `handover-2026-09-05.md`,
`DESIGN.md` §1–§32 in full, `SIMPLE-AI-PLAN.md`, `wc3-ai-lessons.md`, the
research synthesis, the three decompositions, `for-ai.j` (skimmed; read
closely where cited), `trace.py`, `parse-events.py`. Nothing under
`scripts/experimental/rome-ai/` or `test/` was modified. Where the record
makes a claim I could check against code or data, I did:

- `trace.py` was run (exit 0, 645 PASS, 0 FAIL) and its assertion population
  characterised by grep.
- The third-party map still in the ephemeral scratchpad was extracted
  read-only with the toolkit into a fresh scratch directory, and
  `info.json` / `units.json` were used to measure the experiment's
  geography with the plan's own metric (points within 5000 of an owned
  point). Those numbers are mine, not the record's; they are straight-line
  and use "within 2000 of a gate" as a wall proxy.

Evidence classes used below: **[V]** verified against code or data in this
review; **[R]** taken from the record and not independently checkable here;
**[I]** my inference.

---

## 0. Verdict in six lines

1. **Not working, by the programme's own criterion.** The success metric
   adopted in DESIGN §12.2 — territory counts move — has never been measured
   for any AI faction in fourteen rounds. Zero territory-over-time numbers
   appear anywhere in DESIGN.md [V]. The only outcome data are "territory did
   not change hands" (§12.2) and "Rome 25/34/24 against barbarians on 2–4"
   (§21.5).
2. **The four-shape diagnosis is half story.** Two of the four shapes are
   real and architectural; one is a harness property mis-filed as an AI
   property; and the shape the record under-names — *the previous round's
   fix is this round's bug* — accounts for roughly fourteen of the defects [V,
   §2 below].
3. **The experiment as built cannot answer its question.** The matched pairs
   are allies competing for the same frontier, the geography is lopsided in
   a known direction per pair, the primary endpoint rewards the simple arm's
   defining behaviour, two of the secondary instruments are vacuous for the
   simple arm, and the cost condition is un-triggerable as measured [V].
4. **The harness is a design-time checker being used as a regression gate.**
   645 single-tick assertions and source-shape guards; one regression caught
   by an existing assertion in fourteen rounds [V, §10.6].
5. **The audit backlog is drift**, with one honourable exception per item.
6. **Do next**: get the one log (§6), fix the experiment's readings before
   reading it, build a closed-loop toy world (2–4 days) before any further AI
   change, and delete what the toy world proves inert — starting with the S3
   projection, which is already proven inert.

---

## 1. Is it working?

### 1.1 What the record actually shows about trajectory

Calendar: rounds 1–6 all on 2026-08-09; 7–10 on 08-10; then 08-12, 08-13,
08-18, 08-21, 09-05 [V, git log]. Module growth 1,326 → 6,591 lines across
39 commits [V]. Harness growth 10 scenario checks → 645 PASS lines [V].

Outcome measurements in the same period: **none that a reader could plot.**
The record's own instrument (§20, the `FORAI` log + `parse-events.py`)
received exactly one live log (§21.3) and DESIGN cites four `mis` lines from
it; its territory table is not recorded. Playtest 12 "came with no log"
(§27.1). Every other verdict is a screenshot and a sentence [V, DESIGN grep
for "territory"/"forai-events"/"left home at" — no per-faction numbers].

So the trajectory question has an uncomfortable answer: **the programme
cannot show a trajectory**, because it never plotted the number it said
counts. What it can show is fourteen rounds of the owner's one-line
verdicts, which run: stutter → tunnel vision → jams → passive → passive →
idle after capture → inert factions → half the army at home → cannot leave
camp → does not fight properly → opens gates for the enemy → Rome does
nothing → crashes midway → too much chat. That sequence does not narrow.

### 1.2 The four-shape diagnosis, checked

Plan §1 tabulates ~15 defects as four shapes and hypothesises that all four
are "intrinsic to weighted scoring over hand-chosen thresholds". Checking
each shape against the record:

| shape | instances claimed | what the record supports |
|---|---|---|
| goal selected while unable to progress | 5 | Real, and genuinely a scoring-architecture property (§11.1, §12.1, §13.1, §13.2, §21.3). |
| execution destroys its own precondition | 3 | Real (§27.2, §27.3, §30.3). But it is a *control-loop* property, not a scoring one — the simple arm's muster/march loop can do it too. |
| barbarian-scale measure wrong at Roman scale | 4 | Real (§9.2, §12.1, §21.4, §27.2). It is a *constants* property; the simple arm carries constants too (`AI_ADJ_R`, `AI_PROSECUTE_CV`, `AI_MUSTER_FRAC`, `AI_MS_STAGE_T` — plan §5). |
| instrument that could not fire | 5 | Real — but these are **harness** defects (§12.5, §14.1, §17.3, §21.1 defect 1, gotcha 34). Listing them as a failure shape of the AI's architecture, and then hypothesising that a procedural AI "does not arise" them, is a category error [V, plan §1]. |

So two of four shapes bear on the thesis, and one of those two is not
specific to scoring.

The more useful classification the record never makes is **by layer**. From
DESIGN's own root causes [V]:

| layer | defects (section) |
|---|---|
| goal selection / scoring | R2 writeOff+recall (§8.2), R4 CONSOLIDATE ramp (§11.1), R5 gold floor + prox scale (§12.1), R6 TECH (§13.1), early posture (§21.5), capital flat value (§10.4) — **~6** |
| execution, dispatch, world model, state | order storm (§8.1), corridor/gate selection (§9.1, §11.3), food-cap state (§10.10), lanes on a bridge (§11.2), leash (§11.6), `APPROACH_MIN` (§12.1), completed objective left claimed (§13.2), centroid in the sea (§14.2), abort/restart (§21.3), garrison 0.55×army (§21.4), muster no-op (§21.4), arrival tolerance (§22.2), slice starvation (§23.1), lane piling (§23.2), gates opened into a threat (§24.1), muster denominator (§24.2), garrison feedback loop (§27.3), recursion (§28.1), boolexpr leak (§30) — **~19** |

**The simple AI removes the selector and keeps the execution layer.** [V]
`AI_SimpleTick` (for-ai.j 6107–6158) calls `AI_Watchdog`, `AI_ManageGates`,
`AI_Spend`, `AI_MusterFrac`, `AI_SendArmy`; `AI_ScanWorld` and `AI_SetFlags`
(which run `AI_TrackArmies`/`AI_ThreatField`, lines 3179–3180) execute for
both engines (6177–6178). So the experiment tests the layer that produced
the minority of the defects, against a control that shares the layer that
produced the majority. The handover's own Agreement Audit names the
competent counter-argument ("a procedural AI will simply fail in shapes we
have not seen yet"); the layer table says something sharper: it will fail in
the shapes already seen, because it inherits the code that produced them.

### 1.3 The shape the record under-names: fix-induced regression

Tracing each defect to its origin in DESIGN [V]:

| defect | introduced or armed by |
|---|---|
| R4 deadlock (§11.1) | R3 food-cap fix × R1 CONSOLIDATE ramp |
| R5 re-ordering units at home (§12.1) | R2 dedup/slice |
| R5 Gray at the gate (§12.1) | R3 `AI_APPROACH_MIN` |
| R6 idle after capture (§13.2) | R5 aggression floor that could not fire |
| churn (§21.3) | S1 mission layer (§18) |
| half the army home (§21.4) | R2 garrison formula |
| muster no-op (§21.4) | §18.2's deliberate deviation |
| cannot leave camp (§22.2) | R5 arrival guard × §21 muster |
| berserkers never move (§23.1) | R2 fixed slice |
| self-blocking (§23.2) | R3 lanes |
| gates opened for the enemy (§24.1) | R3 "open unconditionally" + `AI_ForceOpenNear` |
| muster never completes (§24.2) | §21.4 muster |
| watchdog never fires for Rome (§27.2) | §26 watchdog, **one round earlier** |
| East Rome oscillates (§27.3) | §18 S1 recall test |
| infinite recursion (§28.1) | §28's own bulk edit |

Fourteen. The genuinely "original" defects are the round-2 five, the
sea-centroid (§14.2) and the leak (§30). **That is the trajectory: each round
relocates the problem into the machinery the previous round added.** The
record half-knows this — §22 opens with "third venue for one failure", §30.3
names the class — and then adds another mechanism with its own chaperone
(§13.5: "any future goal added to this module must carry its own possibility
gate").

### 1.4 What is genuinely good, with reasons

- **Retraction discipline.** §14.1 withdraws a measurement that credited the
  human's conquests to the AI, and says why; §11.0 retracts its own hero
  evidence; §21.1 accepts seven of seven external audit findings after
  checking each against source. This is rare and it is real.
- **Artifact-first diagnosis.** Gates as units with a pathing texture only on
  the closed variant (§8.3); the camp perimeter as invisible destructables
  with 49° gaps (§22.1); the food-cap state confusion (§9.2). Each replaced a
  plausible story with a measured fact.
- **The telemetry channel (§20)** is the single highest-value artifact in the
  programme and the record says so (lessons Part 5). It is also the artifact
  the programme then failed to use (§1.1 above).
- **Negative controls as doctrine** (66 in `trace.py` [V]). The instinct is
  right; §3 below is about why it is not enough.
- The harness did catch things — two design errors before any playtest
  (§7: the EXPAND normaliser, the additive writeOff) and one inversion via an
  existing assertion flipping (§10.6). The lessons doc's "none by a checker
  that passed" (Part 7) is slightly too strong; the accurate statement is
  "no regression caught by a pre-existing assertion except §10.6".

### 1.5 Where the record is self-congratulatory

- "The voices earned their keep" (§27.5) rests on two chat lines and is
  followed by the owner asking for a mute (§31). The voice system is an
  876-line spec, 600 strings and 1,777 generated lines [R] for an AI that has
  not moved a scoreboard.
- README.md still says **"Fog is respected"** and "~2,600 lines" [V]; the
  retraction in §21.1 defect 6 and the handover's "do not restate fog is
  respected flat" never reached it.
- Every section from §10.11 onward closes with the PASS count as if it were
  a result. It is a count of things the author thought to assert.
- "Pre-registered": plan committed 12:54, "pre-registration" 12:56, build
  the same session by the same agent [V, git]. It is a commit ordering, and
  the parser's reading thresholds (§2.4 below) were written after it.

---

## 2. Is the current experiment sound?

No, as designed. The log it will produce is still worth having (§6) — as
per-faction outcome data, not as a pair verdict. Eight specific problems:

### 2.1 The matched pairs are allies, not opponents [V]

`info.json` forces: Rome = purple/lightblue/darkgreen, Barbarians =
red/blue/teal/yellow/orange/green/pink/gray/brown; both forces `allied: true,
shareVision: true`. DESIGN §25.3 says the same ("barbarians never unally on a
timer"). Visigoths–Ostrogoths and Saxons–Burgundians therefore **cannot
fight each other**; they compete for one finite Roman frontier. Plan §2.4's
"a matched pair in direct contact is the cleanest possible head-to-head" is
wrong on its face. Worse, the interaction is asymmetric: the complex control
discounts targets its allies have claimed (§10.7 ledger) and corridors they
are walking (§23.3); the simple member never claims and never yields. A
simple "win" can be free-riding on the control's courtesy.

### 2.2 The geography is lopsided per pair, in known directions [V]

Measured from `units.json` with the plan's metric (enemy points within 5000
of any owned point):

| faction | arm | frontier targets, by owner | targets within 2000 of a gate | hero-to-hero |
|---|---|---|---|---|
| Visigoths | simple | West Rome 6 (only) | 0 of 3 nearest | Vis–Ost 7,891 |
| Ostrogoths | complex | West Rome 5, East Rome 5 | 2 of 7 | |
| Saxons | simple | North Rome 5 | 1 of 3 | Sax–Bur 4,968 |
| Burgundians | complex | North Rome 2 | **1 of 1** | |
| Franks | "non-adjacent reference" | **West Rome 9**, North Rome 2 | 2 of 6 | Fra–Vis **6,640**, Fra–Bur 4,987 |

- **Franks are adjacent to two simple factions** by the plan's own standard:
  6,640 from the Visigoths (closer than the Visigoth–Ostrogoth pair the plan
  calls adjacent) and the single largest barbarian exposure of West Rome
  (simple). `parse-events.py` lists them as a non-adjacent reference [V,
  line 283].
- **Burgundians have one frontier target and it is behind a wall.** The
  northern pair compares three open targets against one walled one.
- **The Visigoths (simple) attack only West Rome (simple).** The Gothic
  pair's simple member is fighting the simple arm's own Roman.
- **The Roman pair is unmatched on incoming pressure.** West Rome's land
  frontier: Franks 9 + Visigoths 6 + Ostrogoths 5 = 20 points. North Rome's:
  Vandals 17 (across water — the ferry the handover calls "the binding
  constraint") + Saxons 5 + Britons 3 (island) + Franks 2 + Burgundians 2 ≈
  9 effective. Plan §2.2 checked that North Rome runs the same *code paths*
  (`wm_capLost` is shared); it did not check what marches at each of them.

Bias per pair, before the game starts: Roman pair toward "complex wins";
both barbarian pairs toward "simple wins". A 2–1 either way is the
geography.

### 2.3 The primary endpoint rewards the simple arm's defining behaviour [V]

`parse-events.py` 143–149 counts every `ctrl` event as ±1 regardless of
kind: a shipyard or a plot equals a capital. The complex arm was
deliberately taught (§8.4) to value a shipyard at 0.02 and walk past it. The
simple arm takes the **nearest contested adjacent point** — and the Saxons'
nearest enemy point is a North Roman shipyard at 3,280 [V]. So the endpoint
is a count of ownership flips, and the simple arm is a flip-maximiser by
construction. The map itself scores control points only (§9.2, the
"Cities" column is `udg_CP_*`). Any pair reading on the kind-blind count is
a reading about junk.

### 2.4 Two of the secondary instruments are vacuous for the simple arm [V]

- **Muster ratio.** The complex arm emits `mus` with the real reason and
  fraction (5742 arrival, 5757 timeout). The simple arm emits
  `"|0|1000|0|0"` — reason *arrival*, fraction *100%* — from a single site
  that fires for **either** branch of its release condition (6147–6149).
  The simple arm's muster ratio is hard-coded to the good value, and it
  contaminates the parser's OVERALL share. This is the sixth "instrument
  that cannot fire", inside the experiment built to escape them.
- **Mission churn.** The simple arm has no missions and emits no `mis`
  events; its churn is zero by construction.
- **Watchdog firings are not architecture-neutral.** `AI_WatchdogAct`
  (5973–6004) clears `ai_target` but not `ai_simTarget`/`ai_simStage`; the
  next simple tick re-adopts the same target, emits a fresh `obj`, and
  restarts the muster (6133–6153). The complex arm gets a target hold-off
  through `AI_MissionAbort` (§21.3). Same firing, different consequences.
- **The joint reading fires on 0 vs 0.** Line 342: `s_wd * 4 < max(c_wd, 1)`
  is true when neither arm ever fires. "Draw" is exact equality; 1–1–1 is
  "drawish"; there is no magnitude threshold; the ×4 was quantified in the
  build commit, not the pre-registration.

### 2.5 The cost falsification cannot trigger as measured [V]

`trace.py` 2087–2113 stubs `AI_Spend`, `AI_ManageGates`, `AI_SendArmy`,
`AI_MusterFrac`, `AI_Watchdog`, `AI_ScanWorld`, `AI_SetFlags` to no-ops for
the simple tick and compares it with `AI_SelectGoal` **alone** — not
`AI_MissionTick` + `AI_UpdatePosture` + `AI_SelectGoal` + `AI_Execute` — on
a 60-point registry with a 40-point slice. "519 vs 1017" is neither side's
per-tick cost. The plan's HARD RULE (§8) is satisfied by a number that
cannot fail.

### 2.6 The simple arm has no way through a wall, and the plan has no reading for it [V]

`AI_ChooseApproach` is reachable only from `AI_MoveOnTarget`, which is
called only from the mission layer (5063, 5781–5883); the simple arm
dispatches `AI_SendArmy` directly (6157). Rams are bought off
`ai_wallSince`, which only the approach layer stamps (`AI_Spend`). So a
simple faction facing a gate attack-moves at the point behind it and stands
there — round 2's finding 3, by design. Routing and rams are on neither the
refuses list (plan §4) nor the keeps list (§6), so "simple stuck at a wall"
has no pre-registered interpretation. (Burgundians' one target is walled;
Saxons' third.)

### 2.7 The human is unspecified

The plan says "same human" and nothing else. The owner usually plays Huns,
whose nearest enemy point is East Rome at 5,719 and whose 5000-radius
frontier is empty [V] — which happens to be ideal. If he plays anything
else, or reaches West or North Rome, the Roman pair is gone and the parser
will not know: it excludes the human's own row, not the human's effect on
others.

### 2.8 Readings that would be treated as wins and should not be

1. Simple wins the two barbarian pairs on the kind-blind count → geography
   (§2.2) plus shipyards (§2.3), not architecture.
2. Draw with low simple-arm watchdog firings → possibly 0 vs 0 (§2.4), or
   the simple arm re-mustering under its own watchdog and never looking
   stuck by the signature.
3. Complex wins the Roman pair → West Rome faced twice the land pressure
   (§2.2); the parser prints "THE THESIS IS FALSIFIED" on that alone.
4. High simple-arm commitment % → it holds no garrison worth the name and
   emits a fabricated muster line.

### 2.9 What to salvage

Before reading the log, and honestly labelled as a post-hoc amendment:
report **per-faction delta against own start**, **kind-filtered** (control
points, or value-weighted); tabulate the geography above as the covariate;
strike the pair-win verdict and the joint reading from the parser output or
mark them exploratory; fix the simple `mus` event; state which slot the
human took. Then treat this game as a **pilot** of the instruments, not a
test of the thesis. That is a smaller claim than the plan makes, and it is
the one the data can bear.

---

## 3. What the harness should have caught, and why it did not

### 3.1 What `trace.py` is [V]

An interpreter for a restricted JASS subset (`Interp`, lines 79–140) that
reads `for-ai.j` and evaluates named functions against a hand-built state
vector (`make_env`, 250–393) with every enumeration native replaced by a
scenario lookup (`make_natives`, 396–450). Assertion population: 137
`it.run(` evaluations, 81 regex source guards, 12 string-presence checks,
66 negative controls, 645 PASS lines. Time advances in four sections
(watchdog: six 20 s windows; pacing: 40 ticks of the order path; the hero
break/re-engage loop; the hero-leash horizon). Everything else is one tick.

Every defect in the dominant class was a property of the closed loop —
state → decision → orders → world → state — over tens of seconds to minutes.
The record diagnosed this precisely in round 4 (§11.7: "right every tick and
wrong every game") and then added ~455 more single-tick assertions.

### 3.2 Has it become a place where confidence is manufactured?

Partly. Three mechanisms:

- **Source-shape guards** assert that the code *looks like* the fix. They
  break on cosmetics (§21.6, §26.4 — twice the record rewrote a guard because
  the shape changed and the invariant did not) and they pass when the fix is
  present and inert (§21.1 defect 1: green tests over displacement that is
  always zero). 81 of them.
- **Scenario assertions pin the current constants.** "CONSOLIDATE 0.147 at
  clock 300" (§11.1) is a regression pin on a number the next round will
  change, not a property.
- **The PASS count is reported as a score**, and `test/rome-ai-trace.test.js`
  floors it at >300 — a guard against silence, not vacuity.

The negative-control discipline is real and it is the right instinct. But a
negative control proves the assertion can fail *on the state it was handed*;
it cannot prove the state is reachable. §21.1 defect 1 is exactly that gap:
`threat()` injects `ai_clDX` values production never produces (trace.py
1593–1604 [V]; for-ai.j 2581–2582 are the only writes and they are `0.0`
[V]).

### 3.3 What a test has to look like to catch the shipped class

A **closed-loop toy world**, run by the interpreter that already exists:

- **World**: units as points with speed and HP; orders executed
  kinematically (move/attack-move toward a point, arrive within tolerance,
  stop); capture when own CV at a point exceeds a threshold for N seconds;
  supply from buildings, income every 120 s, squads of 12; gates as
  impassable segments on a coarse grid with open/closed state; fog as a
  radius. Walkability from `war3map.wpm`, which §8.6 already parses.
- **Natives**: implement the ~25 enumeration/order/state natives over that
  world (`GroupEnumUnitsInRange/OfPlayer`, `ForGroup`, `IssuePointOrder`,
  `GetUnitX/Y`, `GetPlayerState`, `IsUnitVisible`, `IsTerrainPathable`,
  `Filter`/`CreateGroup`/`DestroyGroup` **with an allocation counter**).
- **Run**: `AI_Think` at 1 s for 1,800 s, all twelve factions, default seed.
- **Assert outcomes, not decisions**:
  1. every faction with a reachable un-owned point leaves home within 120 s;
  2. no field centroid frozen > 60 s while such a point exists — the
     watchdog's own criterion, applied to the *decision layer* as a test
     rather than bolted on as a backstop;
  3. no unit is counter-ordered within 5 s of an order more than K times;
  4. every barbarian's control-point count rises by T=900 on a wall-free
     frontier;
  5. unreleased handles per tick bounded, cumulative < N;
  6. orders per player per tick ≤ slice, and every unit reached within
     ⌈n/slice⌉ dispatches;
  7. a mission that ends is followed by a different target or a hold-off.
- **Negative-control the harness itself**: revert three shipped fixes
  (§22.2, §23.1, §24.2) and require the corresponding assertion to fail.

What it would have caught [I, from the root causes]: R4 deadlock, R5 gold
floor, R6 TECH, §13.2 completed objective, §21.3 churn, §21.4 garrison
formula, §22.2 arrival tolerance, §23.1 slice starvation, §24.2 muster bar,
§27.2 watchdog-at-scale (income modelled), §27.3 garrison feedback, §28.1
recursion, §30 leak. What it cannot: bridge lanes, gate jams from real
pathing, the chorus. Cost [I]: 2–4 days; the interpreter, the point
registry and the wpm parser exist. It needs nothing from the owner and runs
in seconds, which is why it should precede the Warsmash route
(`warsmash-eval-2026-08.md`: 4.5–6 days *after* a data bundle the owner has
not supplied).

---

## 4. What is being avoided

§21.7 (2026-08-10) queued five audit defects in order. Since then: ten
DESIGN sections, five module commits, twenty-six days; none of the five has
landed; §30.3 re-queues them behind two more items [V]. Shipped instead:
the twelve voices (§25), the watchdog (§26–27), pacing (§28), an
assertion-only product-decision round (§29), chatter (§31), the simple AI
(§32).

The owner-driven items — §22, §23, §24, §27, the crash (§30), chat spam
(§31) — were correctly prioritised. The rest is drift toward what the
harness can assert and away from what needs the game. Item by item:

- **S3 displacement (defect 1)** — `ai_clDX/DY` written only as `0.0` [V].
  The static term still works (`ai_ifThreat` is raised from `wm_townThreat`
  at 5486 [V]). The proposed fix — add an assertion that fires if
  displacement is always zero — is the wrong shape: dead code with green
  tests is resolved by **deletion**, not by a tenth assertion. Delete the
  projection; keep the static field; note it in §19.
- **Remote defence (defect 2)** — `wm_townIdx` is computed and read once,
  to raise a boolean (5486); DEFEND still marches home [V]. Small, real,
  and it is the difference between "threat field" and decoration. Do it.
- **The ferry (defect 5)** — decides whether two of twelve factions exist.
  The plan excludes them from the experiment for this reason; the handover
  calls it the binding constraint. Six rounds of "next" is not a priority
  decision, it is an absence of one. Either build a real ferry (nearest
  ship, per-ship cargo accounting, a second trip) or officially retire
  Vandals and Britons from the product and say so in the banner.
- **Order acknowledgement (defect 7)** — `AI_TryOrder` caches before
  issuing and discards the boolean (2113–2131) [V]. One `if`. Ship it with
  remote defence.
- **Fog contract (defect 6)** — `ai_ptOwner` written at 2957, never read
  [V]. The code choice is the owner's; the README claim is not — fix
  README.md today. When you put the choice to him, put the cost: routing
  ownership through `ai_ptOwner` makes 267 points stale by up to a scan
  cycle, and the staleness discount to absorb that already exists (§4.3).

The deeper avoidance is §1.1: the programme declared a success number and
then did not measure it for eleven rounds while measuring 645 other things.

---

## 5. What the next session should do — and stop doing

**Stop**

- Adding mechanisms. The record's rule that "any future goal must carry its
  own possibility gate" (§13.5) is the tell: each mechanism now needs a
  chaperone, and the chaperones have become the bugs (§27.2).
- Adding source-shape guards. Assert behaviour in the toy world or do not
  assert.
- Reporting the PASS count. Report the territory timeline or say there is
  none.
- Writing more prose than code per round. §25 and §31 are the size of the
  original module.
- Treating `trace.py` as a gate. It is a design-time checker; keep it, stop
  citing it as evidence a change works.

**Do, in this order**

1. **Get the log** (§6). No AI change before one full game's territory
   timeline exists. That includes the crash retest, which outranks
   everything if it fails.
2. **Amend the experiment's readings before opening the log** (§2.9),
   labelled as an amendment. If the log has already arrived, report
   per-faction deltas and the geography covariate; do not print pair wins.
3. **Build the toy world** (§3.3), 2–4 days, with the harness-level negative
   control (revert three shipped fixes; three assertions must fail). This is
   the first instrument in the programme that can see the dominant bug
   class before a human does.
4. **Decide architecture from the toy world and the log, not from the
   thesis.** My prior [I]: the fragility is in the execution layer (§1.2),
   which the simple arm shares, so the experiment cannot settle it either
   way. Brytenwalda's actual lesson per its own decomposition (§7, §10) is
   *design elimination plus the engine captain* — one order per wave to
   `FormGroup`/`AttackMoveKillA` — not "procedure beats scores". The cheaper
   experiment on that axis is the one never run: the S9 captain probe v3
   with a real army (`probe.py`, handover). It tests the execution layer
   directly.
5. **Delete what the toy world proves inert**, starting today with the S3
   projection. Candidates the world will adjudicate: harasser, tribal
   preferences, the consort ledger, corridor claims. Not blind deletion —
   the programme's own rule, measure first, applies to removals too.

Should you delete half the module? Not on this review's evidence alone: the
record shows fragility, not which halves. It does show one half that is
provably inert (S3 projection) and one that is provably load-bearing (the
order choke point, §8.1 — the one fix the owner never complained about
again). The toy world is how you find the rest.

---

## 6. Where the owner's help matters most

**One playtest, to the end, with the file.** Current build (`65a3ce2`,
19,086,080 bytes). Owner in the **Huns** seat — their only frontier is East
Rome, the reference faction, and nothing of theirs is within 5000 of any
pair member [V] — ideally idle, otherwise playing normally but not
touching West Rome, North Rome, or the four barbarian pair members'
holdings. Play to T=1800. Attach `forai-events.txt` (WC3 dir or
`CustomMapData`; `-ailog` fallback), and say whether it crashed and at what
game time.

That single file answers, in order of value: whether the boolexpr leak was
the whole crash (§30); the first per-faction territory timeline in fourteen
rounds; watchdog counts per arm; the complex arm's real muster ratio;
whether Vandals and Britons do anything at all; and the exit time and
commitment census for every faction. The pair verdict will be confounded
(§2) — that is fine; the twelve timelines are the value.

Second, only if it costs him nothing: the answer to "75 + 15 per town" —
request or description. Third, and lower than the toy world: the game-data
bundle for Warsmash. Do not ask for a second playtest until the toy world
exists; the next bug is already findable without him.

---

## 7. Limits of this review

I did not run the game. The geography numbers are straight-line distances
over the registered point set with a 5000 radius and a 2000-unit wall
proxy; the record's corridor and pathing work may change what "adjacent"
means in play. The layer classification in §1.2 is mine and some defects
straddle layers. The toy-world cost estimate is an estimate.
