# Building a game AI — principles, patterns and foibles

**Question answered**: what does the established game-AI discipline say an
engineer should know *before* designing an AI subsystem for a real-time
strategy map — and where did the Fall of Rome programme
(`scripts/experimental/rome-ai/`) diverge from it?

**Date**: 2026-09-05. **Position in the docs**: this sits *above*
`wc3-ai-lessons.md` (the programme's own hard-won list) and beside
`rome-ai-advisor-review-2026-09.md` (the independent review that prompted
it). Where the lessons doc already says a thing well, this file points at it
instead of restating it. Where the literature contradicts the programme's
record, this file says so.

**How to read the evidence labels.** Every claim carries one:

| label | meaning |
|---|---|
| **[DOC]** | documented practice — stated independently by two or more practitioners or in a standard text, and consistent with shipped games |
| **[PRAC]** | one practitioner's account of one game; take the shape, re-measure the numbers |
| **[RES]** | research prototype or academic result; may not survive contact with a shipped engine |
| **[PROG]** | this programme's own finding (DESIGN.md / lessons / advisor review) |
| **[SYN]** | my synthesis — an inference joining sources, not something any one source says |

Sources are cited inline as `[Author Year]` and listed with links in §10.
Numbers are kept with their source; if a number has no source it is
**[SYN]** and you should re-derive it for your map.

---

## 0. The one-paragraph version

Choose a goal rarely and deliberately; run it as a persistent plan with
phases, preconditions, a progress metric and typed failure; let interrupts be
flags that name a broken assumption, never competing scores; never let an
action change the quantity that authorised it; model what you *believe*
separately from what you *see*; price routes with fields, pick targets with
value; move armies as bodies through staging points, never N units to one
click; be judged on hesitation and reaction time, so model both; explain
inaction out loud; and test the closed loop — decision → orders → world →
decision — against outcome metrics, with checks you have proven can fail.
Every item in that sentence has a citation below and, for most of them, a
round of the Rome programme that paid for it.

---

## 1. The architectures, honestly compared

### 1.1 Comparison table

Sources for the whole table: Isla's Halo 2 paper for behaviour trees and
impulses [Isla 2005]; Orkin's F.E.A.R. paper for FSM-vs-planning and GOAP
[Orkin 2006]; Humphreys for HTN [Humphreys 2013]; Graham, Dill, Mark/Dill and
Lewis for utility [Graham 2013; Dill 2015; Mark & Dill 2010; Lewis 2017];
Merrill for utility-inside-BT [Merrill 2013]; Champandard & Dunstan for the
BT execution model [Champandard & Dunstan 2013]; Isla's Halo 3 objectives
talk for declarative task allocation [Isla 2008]; Francis for blackboard
coupling [Francis 2017]; Millington's textbook for the taxonomy of
subsumption and blackboards (not re-read this session — **[DOC]** by
reputation, treat specifics as unverified) [Millington 2019].

| architecture | what it is good at | characteristic failure | the tell you picked the wrong one |
|---|---|---|---|
| **Finite state machine** | A handful of states with explicit, auditable transitions; execution-level control (F.E.A.R.'s whole FSM is *Goto* / *Animate*) [Orkin 2006] **[DOC]** | Transition count grows ~n², every new behaviour means revisiting every state; "overly complex, bloated, unmanageable" after two years [Orkin 2006]; Ocio: "does not scale when the number of reactions is very high" [Ocio 2021] | You are adding a transition to *every* state to support one new behaviour (Orkin's "turn on the lights" story) |
| **Hierarchical FSM** | Same, with sub-states hiding local transitions; the standard for encounter scripting before Halo 3 ("the imperative method": an FSM construction tool for designers) [Isla 2008] **[DOC]** | "Explicit transitions — n² complexity" once encounters have many generators [Isla 2008] | The hierarchy exists to hide transitions rather than to express structure |
| **Behaviour tree** | Prioritised-list decision over self-describing children; clean decomposition; designers can read it; interrupts via impulses / active selectors / monitors [Isla 2005; Champandard & Dunstan 2013; Merrill 2013] **[DOC]** | *Static priority*: "the same behavior may require different relative priorities depending on the context", solved by duplicating sub-trees [Merrill 2013]; dithering when relevancy flips each tick [Isla 2005]; over-engineering the node language before you need it [Francis 2017] | You are duplicating sub-trees under different conditions, or the tree's authors are inventing node types instead of behaviours |
| **Utility / scoring** | Analog trade-offs among *many concurrently valid* options; "always pick something sensible… rather than stand still" [Lewis 2017]; modular considerations tuned in data [Mark & Dill 2010] **[DOC]** | See §1.2 — dithering between near-equal scores; an option selected while its action cannot fire; weights that compose into a dead state; constants nobody can justify; "the AI will pick something utterly stupid" under weighted-random [Graham 2013] | You are adding incumbency bonuses and dwell timers to stop oscillation (§3), or you are scoring *postures* rather than executable actions |
| **GOAP** (backward-chaining STRIPS + A*) | Decoupling goals from actions so character types satisfy the same goal differently; layering behaviours without authoring transitions; re-planning around failures with knowledge recorded in working memory [Orkin 2006] **[DOC]** | Opaque to designers ("too organic and mysterious") and bad at fixed sequences [Merrill 2013]; fixed-size world-state array means one target / one weapon per plan [Orkin 2006]; slower than HTN in the Transformers comparison [Humphreys 2013] | Designers cannot predict what the agent will do from the data; you are adding "procedural preconditions" to encode sequences the planner should not discover |
| **HTN** (forward decomposition) | Designer-authored task hierarchies with plan *validation while running*; replan only on defined triggers; priority via method ordering (MTR) [Humphreys 2013] **[PRAC → DOC]** (the Transformers account is one practitioner, but HTN in games is well established) | Re-planning on *every* world-state change — including the effects of your own completed tasks — cancels valid plans ("the troll now combos a trunk slam directly into a whirlwind every time") [Humphreys 2013] | Your replan triggers include your own effects; your domain needs "expected effects" hacks to keep plans valid across navigation |
| **Declarative task allocation** (Halo 3 objectives) | Strategic layer as a tree of prioritised tasks with capacities and filters; squads "poured in at the top" and distributed by a cost function H(s,t) [Isla 2008] **[PRAC]** | "AI can look really stupid with wrong H(f)"; squads as the bucketing unit is sometimes wrong; designer training [Isla 2008] | You cannot write H(s,t) in one line, or the "task" and the unit doing it are the same object |
| **Blackboard** | Sharing information between components/agents; decoupling goals so death can know the agent was sitting [Orkin 2006; Millington] **[DOC]** | Routing *everything* through the blackboard couples tree API to blackboard API; "a lower level API change led to a month or more rewiring" [Francis 2017] | Your decision logic cannot run against a plain struct |
| **Subsumption** (layered reflexes) | Low layers reactive without high-level reasoning; a bottom "idle floor" no scorer can tune away [Millington; **PROG** lessons Part 2 item 3] **[DOC]** | A reflex layer that fires for its own reasons fights the plan above it (reflexive recall, §8) | You have a reflex that contradicts the committed plan more than once a game |

### 1.2 Utility scoring's known pathologies, with sources

The programme built a scorer (DESIGN §4) and hit every entry on this list.
Each is *documented in the utility literature itself*, which is the point:
they were foreseeable.

**(a) Dithering between near-equal options.** Isla lists it as the first
cost of complexity: "we must avoid at all costs the problem of dithering (the
rapid flipping back and forth between two or more actions)" [Isla 2005]
**[DOC]**. Graham's example is an FPS agent scoring *attack* and *run away*
both at 0.5 and re-deciding every frame: "the AI might shoot the player a
couple times, start to run away, then shoot again, then repeat" [Graham 2013].
Lewis: "even if the absolute best-scoring decision is always selected (highly
recommended), the two may oscillate or ping-pong as their respective scores
rise and fall" [Lewis 2017]. The literature's own remedies and their limits
are in §3.

**(b) An option stays selected while its action cannot fire.** The
literature's answer is a *veto*, not a smaller weight. Dill's appraisal has
"a Boolean allowing each consideration to prevent us from selecting the
associated choice … If any consideration sets Veto to false, utility is 0"
[Mark & Dill 2010]; the same slide deck's weapon-selection example has an
"Ammo consideration" that checks whether ammo *exists*. Lewis: "any
consideration can disqualify an entire decision … simply by scoring zero …
This makes it trivial to encode rules for when a decision is absolutely not
supposed to be used" [Lewis 2017]. Dill's dual-utility reasoner starts by
eliminating "any that have a weight that is less than or equal to zero"
[Dill 2015] **[DOC]**. The programme rediscovered this as the *possibility
gate* in round 4 (`AI_CanMass`, DESIGN §11.1) after CONSOLIDATE demanded an
army a food-capped faction could not build, and re-rediscovered it in round 6
when TECH "at 144 gold still scored ~0.047: small, until everything else is
smaller, at which point it wins" (DESIGN §13.1) **[PROG]**. Lessons Part 2
records the five disguises. The deeper cause is in (e).

**(c) Weights that compose into a dead state.** Additive scoring with
hand-tuned weights has no notion of *impossibility*, only of *less*. Graham's
Sims example is the canonical warning: a quadratic hunger curve means "there
would still be a chance they would choose to eat, even when their hunger stat
was mostly filled up … eventually [it would] get chosen" — the fix is a
piecewise curve with an explicit dead zone [Graham 2013] **[DOC]**. Mark's
"Cover = (0.2 + Reload + Heal×1.5) × (Threat×1.3)" is deliberately
*multiplicative* in Threat so that no amount of reload-urgency produces cover
behaviour with no threat present [Mark & Dill 2010]. The programme's
round-3/round-4 deadlock — a real food cap read *plus* a rising consolidate
weight — is the additive version of this: two individually-correct terms
whose sum had no floor at zero (DESIGN §11.1; lessons Part 7
"composition failures") **[PROG]**. Rule **[SYN]**: multiply by
enabling conditions, add only among things that are all possible.

**(d) Hand-tuned constants nobody can justify.** Graham says it plainly:
"Coming up with the proper function is really more art than science and is
usually where you'll spend most of your time" [Graham 2013]; Lewis's
production answer is to restrict to "a small palette of preset curves" and
hide arbitrary curves behind an advanced mode, plus a slider tool [Lewis
2017] **[DOC]**. Wetzel & Anderson's experiment is the sobering part:
"complicated strategies using multiple variables that require a lot of tuning
might not produce results that the player will notice or appreciate" — their
hand-tuned PowerCalculationFancy won 71% but was rated *less* difficult than
an AI that attacked units alphabetically [Wetzel & Anderson 2017] **[RES]**.
The programme's `0.78`, `350 + 750·clock`, `0.55 × army`, `AI_DWELL 9 s`
(DESIGN §4.7, §11.1, §21.4) are constants of this kind; the advisor review
notes the harness *pinned* them ("CONSOLIDATE 0.147 at clock 300") rather
than testing a property **[PROG]**.

**(e) Scoring postures instead of actions — the root of (b) and (c).**
Every utility example in the literature scores an *executable option*: eat at
table, reload, attack, seek medic, evade area, use weapon X [Graham 2013;
Merrill 2013; Lewis 2017; Mark & Dill 2010]. Dill: "It is not enough to
assign fixed weights to the options a priori. Only by evaluating them based
on the situation at the moment when the decision is being made can you
achieve the responsive, dynamic behavior" [Dill 2015]. Utility's promise —
"the AI will always pick something sensible from the list of options — even
if it is just doing something, anything rather than stand still" [Lewis 2017]
— holds only when the options *are* things it can do. The programme's goals
were `CONSOLIDATE`, `DEFEND`, `EXPAND`, `SIEGE`, `TECH`, `RETREAT` (DESIGN
§4): three of six are postures whose "action" can be nothing. **[SYN]**: a
utility reasoner over goals needs a possibility gate per goal *by
construction* (a veto consideration that asks "can the first step of this
goal's plan be issued now?"); a utility reasoner over actions gets it for
free.

**(f) Weighted random makes you look stupid.** "There is always some chance
that an option with very low utility will be selected. This can easily make
your AI look stupid" [Dill 2015]; Graham: "every now and then, they'll choose
something utterly stupid" [Graham 2013] **[DOC]**. Fixes: argmax for
strategy games ("A chess AI should definitely choose the highest scoring
move. A strategy game might do the same" [Graham 2013]); or dual utility —
rank buckets by absolute utility, then weighted-random *within* the top
bucket after dropping options below a percentage of the best [Dill 2015].

### 1.3 What the sources actually say about response curves

Standard palette (all **[DOC]**, formulas as given):

| curve | formula | use |
|---|---|---|
| linear | `U = x / m` | pure normalisation [Graham 2013] |
| polynomial | `U = (x / m)^k`; `k<1` "rotates" it toward urgency at low x | steep urgency; Mark's anxiety-by-distance `(100 − d^k)/100^k` [Graham 2013; Mark & Dill 2010] |
| logistic | `U = 1 / (1 + e^(−x))` on a clamped input, shifted by a constant | soft threshold; Graham's health-desire uses `+6` to centre it [Graham 2013] |
| piecewise linear | hand-placed points | dead zones and explicit thresholds; what The Sims uses for hunger [Graham 2013] |
| Lewis's presets | `y = 1 − (x−1)^4` (amplify moderate danger), runtime `y = 1 − x^6`, cooldown `y = x^5` | Guild Wars 2 [Lewis 2017] |

Three checklist questions per curve [Lewis 2017]: increasing or decreasing;
monotonic or not (non-monotonic only for "keep at arm's length"); what the
endpoints are — "Should the score drop to zero when an input reaches
minimum/maximum? Or should it simply deprioritize the decision instead of
invalidating it altogether?" That endpoint question *is* the possibility
gate. Inputs are normalised with "bookends" — a clamped range mapped to
[0,1], anything beyond scoring 1 [Lewis 2017].

Dave Mark's *Behavioral Mathematics for Game AI* (2009) is the book behind
all of this (response curves, marginal utility, weighted randoms); not
re-read this session — cited as the origin **[DOC]** via [Graham 2013;
Merrill 2013; Mark & Dill 2010].

### 1.4 Verdict for an RTS territory map

**[SYN]**, drawn from every source above plus the programme's record:

1. **Selection layer**: a *small* prioritised chooser over **executable
   objectives** (attack point X via corridor C, defend point Y, hold), not
   over postures. Dual utility fits: rank = category (capital under assault
   ≫ objective ≫ economy), weight = value among the rank; every option
   carries a veto ("can the first order of this plan be issued now?").
   Argmax within the rank, plus the hysteresis of §3.
2. **Execution layer**: a plan per objective with phases, preconditions,
   progress, deadlines and typed failure (§2) — an HTN-shaped procedure, not
   a scorer. Interrupts are monitors (BTSK's "continuously checking if
   assumptions are valid" [Champandard & Dunstan 2013]) that name a broken
   assumption.
3. **Beneath both**: a reflex floor (subsumption's lowest layer) that
   guarantees motion toward the nearest contestable objective when the
   layers above are silent — with the watchdog's rule that "every firing is
   a defect signal" (DESIGN §26.4) **[PROG]**.
4. **What not to build**: a full GOAP for the strategic layer (opaque, single
   target per plan, no fixed sequences [Orkin 2006; Merrill 2013]); a utility
   scorer that re-scores the committed objective every tick (§2.3); a BT with
   duplicated sub-trees standing in for dynamic priority [Merrill 2013].

The advisor review's layer table (defects: ~6 in selection, ~19 in
execution/world-model) is the empirical case for spending the design budget
on layer 2 and the world model (§4), not on the chooser **[PROG]**.

---

## 2. Selection versus execution

### 2.1 The separation every serious source insists on

- Orkin: goals "compete for activation, and the A.I. uses the planner to try
  to satisfy the highest priority goal"; the plan then drives a two-state FSM;
  "It is the separation between planning for individuals and planning for
  squads that is more important than any specific implementation" [Orkin
  2006] **[DOC]**.
- Humphreys: a plan is found on exactly three triggers — "the NPC finishes or
  fails the current plan, the NPC does not have a plan, or the NPC's world
  state changes via a sensor" — and then a *plan runner* executes it,
  "monitor[ing] these tasks' preconditions against a 'working world state'"
  and failing the plan when a precondition of the current *or any remaining*
  task becomes invalid [Humphreys 2013] **[DOC]**.
- Isla (Halo 3): "AI acts smart within the confines of the plan provided by
  the designer"; tasks are chosen by the objectives tree, and "within the
  task, the AI behaves autonomously" [Isla 2008] **[PRAC]**.
- Champandard & Dunstan: monitors ("assumptions that should be maintained
  while a behavior is active, and if those assumptions are found invalid the
  whole sub-tree should exit") and active selectors that re-check *higher*
  priority options only [Champandard & Dunstan 2013] **[DOC]**.
- Merrill's evaluation-vs-execution split: evaluate the tree in parallel
  "and only interject if the results vary from the presently executing plan"
  [Merrill 2013] **[PRAC]**.
- Barriga/Stanescu/Buro: search produces "a standing plan for multiple
  frames" while the next search runs; restart "once we find the opponent is
  acting inconsistently with the results of our search" [Barriga et al. 2017]
  **[RES]**.
- Brytenwalda (the one WC3 map with a territorial AI the owner rates
  "runs quite well"): one `FormGroup(3, true)` then one `AttackMoveKillA`
  per wave, "exactly one order site in the whole AI", 1–3 orders per minute
  across nineteen factions (`brytenwalda-ai-decomposition.md`) **[PROG]**.

### 2.2 The shape of a plan

Every plan the execution layer runs should carry, explicitly and inspectably
**[SYN]** (assembled from [Humphreys 2013; Champandard & Dunstan 2013; Orkin
2006; Ocio 2017a] and lessons Part 2):

| field | what it is | who reads it |
|---|---|---|
| objective | the thing being attempted, with a *completion predicate* on the world | completion check; telemetry |
| phases | ordered steps, each with its own entry precondition and its own orders (muster → cross → approach → assault → consolidate) | plan runner |
| preconditions | facts that must hold for the *remaining* phases (route passable, siege unit alive, force ≥ minimum) — monitored every tick, not only at start | monitors |
| progress metric | one number that must move (distance-to-objective of the field centroid, damage dealt to the gate, units arrived at the rally) | deadline |
| budget | per phase: abort on *no progress* over a window, not on elapsed time (lessons Part 2 item 2; `FormGroup`'s built-in "send anyway after 60 s" is the engine's version) | deadline |
| typed failure | *why* it ended: `COMPLETED`, `PRECONDITION_LOST(which)`, `NO_PROGRESS(phase)`, `PREEMPTED(by)`, `IMPOSSIBLE(reason)` | the selector, which must treat each differently |
| teardown | on any end: release claims, expire dwell, reset progress, re-arm the idle detector (DESIGN §13.3) | everything |

The typed failure is the part most designs omit and the programme paid for
most: "Abort does not clear target/claim/progress" (lessons appendix), "A
failed mission restarting on the target it had just failed" (lessons Part 2,
round 8), the advisor's finding that the simple arm's watchdog "clears
`ai_target` but not `ai_simTarget`/`ai_simStage`; the next simple tick
re-adopts the same target" (review §2.4) **[PROG]**. Orkin's blocked-door
example is the positive case: "As the A.I. discovers obstacles that
invalidate his plan, such as the blocked door, he can record this knowledge
in working memory, and take it into consideration when re-planning" [Orkin
2006] — a failure consumed by the next selection.

### 2.3 Why collapsing them into one re-scored tick is the most common structural mistake

Three independent mechanisms, each documented:

1. **Re-scoring is re-deciding.** Graham's frantic FPS agent and Lewis's
   ping-pong (§1.2a) are what a per-tick argmax *is*; the fixes (inertia,
   cooldown, "stall making another decision … until such time as the current
   action is finished" [Graham 2013]) are all ways of reintroducing the
   separation. Graham's own production answer: "On The Sims Medieval, a Sim
   would only attempt to make a decision when their interaction queue was
   empty. Once they chose an action, they would commit" [Graham 2013]
   **[DOC]**.
2. **Your own effects look like world changes.** Humphreys' whirlwind bug:
   "the planner is replanning on all world state changes, including changes
   by successfully completed primitive task's effects … the plan was found
   with those world state changes in mind anyway" [Humphreys 2013]
   **[PRAC]**. A single re-scored tick cannot distinguish "the world moved"
   from "I moved the world", which is exactly the feedback-loop trap of §3.4.
3. **Selection is measured, progress is not.** The programme's round-6
   finding: "the round-5 aggression floor counted the faction as committed
   and could never fire. The floor measured *selection*, not *progress*"
   (DESIGN §13.2) **[PROG]**. When the same tick both selects and executes,
   the only state you have is the selection.

The programme moved attacks to missions in S1 ("chosen once, then run to a
terminal state without re-scoring", DESIGN §18.1) and kept defend / retreat /
consolidate / tech on per-tick scoring. The advisor's layer table says the
remaining defects then migrated into the execution layer — which is where
the literature predicts they live once selection is stable **[PROG]**.

**Where the literature disagrees with the programme's record**: lessons
Part 3 states "attacks are procedures, not scores … every working AI in the
corpus does stage → issue one order → sleep". The corpus it means is WC3
maps, and for those it is right. The wider literature is subtler: Halo 3
scores squad-to-task assignment continuously [Isla 2008]; Dragon Age and
Guild Wars 2 score at combat tempo [Lewis 2017]. The invariant is not "no
scoring during execution" but **"scoring happens at the layer whose options
are all currently executable, and a chosen option is run by a runner that
re-scores only on typed events"** **[SYN]**.

---

## 3. Hysteresis, commitment and oscillation

### 3.1 The vocabulary

- **Schmitt trigger** (two thresholds): switch A→B when `input > T_on`; switch
  B→A only when `input < T_off`, with `T_on > T_off`. The band
  `[T_off, T_on]` is where the current state is *kept whatever the input
  does*. Electronics **[DOC]**; in AI terms, lessons Part 3: "switching from
  incumbent to challenger costs `+H`, and switching back costs `+H` again"
  **[PROG]**. Formula for a scorer:
  `switch iff score(challenger) > score(incumbent) + H`, with `H` a fixed
  *fraction* of the score range so it survives re-tuning **[SYN]**.
- **Commitment bonus / inertia consideration**: add utility to the current
  choice "so we don't change without a good reason" [Mark & Dill 2010];
  Graham's "add a weight to any action that you are already currently engaged
  in" [Graham 2013]; Lewis's "commitment bonus (small score boost factor)"
  [Lewis 2017] **[DOC]**. Mathematically the same as a one-sided Schmitt
  band.
- **Cooldown / runtime**: score-to-zero for a period after selection or after
  N repetitions; "useful for avoiding strobing between two otherwise
  competing decisions" [Lewis 2017]; Graham's cooldown "where the weighting
  for remaining in that action is extremely high" [Graham 2013] **[DOC]**.
- **Dwell / minimum time**: a timer during which re-selection is refused
  (DESIGN §4.7 `AI_DWELL` 9 s) **[PROG]**.
- **Commitment floor**: a phase may not be aborted below a minimum
  investment *unless a typed interrupt fires* (DESIGN §27.3: "Start bar 1.10,
  abort 1.85, marching 2.60. A threat that would prevent a start no longer
  aborts one in progress") **[PROG]**.
- **Latency window**: a reversal must survive a delay before it takes effect
  — "hysteresis raises the bar, latency requires the bar to stay crossed"
  (DESIGN §28.5) **[PROG]**; Rabin's reaction-time modelling supplies the
  human-plausible size of the delay (§6.1).

### 3.2 Why a dwell timer only changes the frequency

A timer does not change *which* state wins at the boundary; it changes how
often the boundary is consulted. Two near-equal scores that cross every tick
will, with a 9 s dwell, cross every 9 s — Graham's frantic soldier in slow
motion. Lewis's warning covers all the additive tricks: "all of these methods
(useful as they are) share a single common drawback. In effect, they do not
eliminate the possibility of two decisions oscillating — they simply shift
where the scores will land when the oscillation happens" [Lewis 2017]
**[DOC]**. Lessons Part 3 says the same from the other direction
("A timer only changes the frequency of oscillation") **[PROG]**.

What *does* eliminate a given oscillation, per Lewis: "add another
consideration to one of the decisions … increasing the chances that the
competing decision will consistently win (or lose)", or reshape the curves
"to minimize the zone of oscillation" — i.e. make the two options *not*
near-equal over the region the world actually visits. And per Graham,
Humphreys and the RTS corpus: stop consulting the boundary at all while a
plan runs, and consult it only on typed events (§2).

Ordering of remedies **[SYN]**, strongest first:

1. Do not re-score a running plan; re-score on typed events.
2. Freeze inputs that the plan itself moves (§3.4).
3. Two-threshold band on the *selector* for the events that do re-score.
4. Latency window on reversals.
5. Commitment bonus / cooldown / dwell — legitimate, but they tune the
   frequency, not the existence, of the flip.

### 3.3 The commitment floor and the emergency exemption

Every source that adds hysteresis also names the one thing it must *not*
damp. Isla's impulses exist so that "self-preservation impulses" can pre-empt
the engage stack [Isla 2005]; the BTSK active selector re-checks only
*higher*-priority options [Champandard & Dunstan 2013]; Zoo Tycoon's *die*
behaviour had rank 1,000,000 [Dill 2015]; the programme keeps `wm_capThreat`
("the capital itself under assault — recalls the army at any bar", DESIGN
§27.3) and "the capital emergency is exempt and fires on the first tick"
(§28.5) **[DOC + PROG]**. Rule: the interrupt list is short, named, and each
entry states a *broken assumption* — lessons Part 3: "route became
impassable, required siege or transport died, force fell below minimum,
objective changed owner, home under real threat, or phase progress stalled"
**[PROG]** — and nothing on it is a score.

### 3.4 The feedback-loop trap: an action that changes the input that authorised it

This is the class the programme under-named for twelve rounds and then
named in one line: **"Does taking this action change the quantity that
authorised it?"** (DESIGN §30.3) **[PROG]**. Its three instances, from the
record:

| instance | the loop | fix that worked |
|---|---|---|
| East Rome's recall oscillation (DESIGN §27.3) | recall test `wm_threat > k × wm_garrison`; garrison = own CV *near home*; the army marches out → garrison collapses → ratio crosses → abort → army returns → garrison recovers → new mission → leaves | freeze the garrison denominator at mission start; add the two-threshold band |
| The watchdog defeated by scale (DESIGN §27.2) | "has anything about this faction changed" — for a large empire, income, training and holdings always change, so a motionless army never reads as stuck; the measure counted the AI's own economy as motion | measure only the *field army* (quantised centroid, field CV, health); exclude gold/food/territory "each is precisely how a large empire disguises a still army" |
| Spread re-triggering muster (DESIGN §30.3, §31) | an army in transit is spread out; a spread test intended to detect *scattered at home* re-fires *because the march is happening* | (queued) freeze or phase-gate the spread test while marching |

The literature's instances of the same shape:

- Humphreys' replan-on-own-effects (§2.3) — the plan's effects re-trigger
  the planner [Humphreys 2013] **[PRAC]**.
- Steamhammer (a competitive StarCraft bot, Jay Scott): "2 bugs … each
  independently caused oscillation … being at the order point automatically
  made a unit 'near the enemy,' so that it might run away a short distance
  though not actually near the enemy" — reaching the destination flipped the
  retreat input [Scott 2024] **[PRAC]**. Same author, earlier: a
  siege-tank "siege-unsiege loop" fixed by "Tanks don't siege if they know
  they will immediately unsiege again" — i.e. evaluate the exit condition
  *before* committing [Scott 2018].
- The programme's cargo-drags-the-centroid loop: "a loaded unit reports its
  transport's position, so cargo voting on where the army is drags the centre
  toward the water and makes the AI want *more* boats" (lessons Part 3)
  **[PROG]**.

Design-review rule **[SYN]**: for every input `x` of every decision `d`, ask
whether executing `d` moves `x` (write it as a sign: does `x` go up or down
*because* `d` ran?). If yes, either (i) snapshot `x` at commitment and
compare against the snapshot for the plan's lifetime, (ii) measure the
quantity the action is *supposed* to change and treat its motion as
progress, not as a trigger, or (iii) phase-gate the test so it is inert
during the phase that moves `x`. Isla's memory taxonomy (§4.1) gives the
storage: per-behaviour short-term memory whose lifetime is the plan's
**[Isla 2005]**.

---

## 4. World model and perception

### 4.1 Observed, last-seen, inferred, unknown

Halo 2's model is the reference **[DOC]** (adopted by Halo 3, F.E.A.R.'s
working memory, Splinter Cell's LKP and everyone since):

- Isla's four memory categories: "Per-behavior (persistent) … Per-behavior
  (short-term): state lost when the behavior finishes; Per-object: perception
  information, last seen position, last seen orientation; Per-object
  per-behavior: last-meleed time, search failures, pathfinding-to failures"
  [Isla 2005]. Note the last two: *failures are memory*, keyed by object.
- Belief may diverge from truth on purpose: the prop system allows "the two
  representations to occasionally diverge — thus the actor can believe things
  that are not true", so the AI can be "tricked, confused, surprised,
  disappointed" [Isla 2005]; Bungie on eight years of Halo: "Each AI has an
  internal model of each target, and that model can be wrong. This allows the
  AI to be surprised by you, and this is very fun" [Bungie 2011].
- Ocio's *last known position* discipline: an LKP is set on detection,
  updated while line of sight holds, propagated to allies *after a delay*
  ("a window of opportunity"), given "some time buffering so that vision has
  to be broken for a few seconds before the enemy is considered as lost", and
  "time out … [to] allow our AI to recover" from an unreachable, invisible
  LKP [Ocio 2017a] **[PRAC → DOC]**.
- Ocio on reactions: when a new sighting is "far enough from our original
  guess, the AI should acknowledge it has been outsmarted"; if near, just
  update the move destination — "confusion" is the degree to which beliefs
  just proved false [Ocio 2021].

A minimal RTS-scale schema **[SYN]** — one record per enemy asset the AI
cares about (army cluster, point, gate):

| state | contents | transitions |
|---|---|---|
| `OBSERVED` | position, strength, owner, `t_seen = now` | → `LAST_SEEN` when visibility is lost |
| `LAST_SEEN` | frozen snapshot + `t_seen`; uncertainty radius `r(t) = v_max · (now − t_seen)` for mobile things, 0 for points/gates | → `INFERRED` when `r` exceeds the map's meaningful scale or `conf` drops below a floor; → `OBSERVED` on re-sight |
| `INFERRED` | a prediction (nearest enemy holding, last heading) with a confidence `conf(t) = conf₀ · e^(−(now − t_seen)/τ)` | → `UNKNOWN` at `conf < ε`; never used as a *fact* |
| `UNKNOWN` | nothing; the AI must scout or assume by rule | → `OBSERVED` on sight |

The decay constants are yours to pick; the shape (exponential in time,
radius linear in speed) is the standard one and matches the particle-filter
approach Barriga et al. recommend over cheating: "a particle filter can be
used to estimate the positions of previously seen units (Weber et al. 2011)"
[Barriga et al. 2017] **[RES]**.

### 4.2 Stale registries

Lessons Part 3: "If the map can change a thing, the AI must re-read it. We
registered gates once; the map's own triggers replace gate units when they
open and close … so a newly *closed* gate could read as an open breach,
inverting the entire cheapest-crossing decision" **[PROG]**. The literature's
form of the same rule is Humphreys' sensors: world state is "updated by the
NPC's sensors and by the successfully completed tasks" — a value nobody
updates is a lie with a timestamp [Humphreys 2013]. Rule **[SYN]**: every
registry entry carries `t_verified`; consumers treat age beyond the map's
change-rate as `LAST_SEEN`, not fact; and anything the *map script* can
replace (gate units, spawned structures) is re-enumerated, never cached by
handle.

### 4.3 "Read the live world" is a quiet cheat

Dill distinguishes material from informational cheats and says the latter
are harder to do honestly: "if I see a unit but then it goes out of sight,
how do I remember that it exists? How do I guess its location?" — Kohan 2
tracked "the approximate amount of enemy strength in an area (but not the
specific locations of units)" as a deliberate, bounded, disclosed information
cheat [Dill 2013] **[PRAC]**. Barriga et al.: "The easiest one is to let the
AI cheat, by giving it full game state access. However, players might become
suspicious … if the AI system keeps correctly 'guessing' and countering their
surprise tactics" [Barriga et al. 2017] **[RES]**.

The programme's split: enemy *strength* was fog-honest, enemy *territorial
ownership* "was read live through fog by every consumer, because the
fog-honest field was written and never read" while the startup banner claimed
"Fog is respected" (lessons Part 6; review §4 defect 6) **[PROG]**. That is
the general failure: partial honesty with a stronger claim. Rule: one
*contract* naming which fields are visibility-gated, every read audited
against it, the banner stating exactly the contract and nothing more.
Whether to cheat is then a labelled dial (lessons Part 6; §6.4 below).

### 4.4 The scale problem

A measure calibrated on one faction size is silently wrong at another. The
programme counted four: "the food cap (100 vs 300), the frontier (4200 vs
18000), the garrison (a share of a small army vs a huge one)" and the
watchdog's world signature (DESIGN §27.2) **[PROG]**. Creative Assembly hit
the same class in Total War: Warhammer III and fixed it by *scaling by empire
size explicitly* — minimum task-priority thresholds of "Small empires (<15
regions): 20% priority at 4+ turns; Medium empires (15–30 regions): 15%
priority at 6–7 turns; Large empires (30+ regions): 20% priority at 7–8
turns", because the old fixed horizon "restricts the AI's horizon so it
doesn't venture out from its holdings" and large AI empires were "stuck in
core provinces" [Creative Assembly 2024] **[PRAC]**. Rule **[SYN]**: any
threshold compared against a faction's own quantity must be expressed as a
*ratio to what it has to beat* (DESIGN §21.4's garrison fix) or *bucketed by
faction size*; and every such measure gets a two-point test — the smallest
and the largest faction on the map — before it ships.

---

## 5. Movement and space

### 5.1 Influence maps and threat fields: what they are actually for

Mark's modular system **[PRAC → DOC]** (the same shape appears in Tozour's
2001 Gems article he cites, and in AMAI's threat field per
`wc3-map-ai-decompositions.md`):

- Two base map types per faction: a **proximity map** ("where an agent could
  get to in a short period", linear falloff, radius = `max speed × refresh
  time`, e.g. 10 m/s × 1 s → radius 10 on a 1 m grid) and a **threat map**
  ("what it could potentially threaten", polynomial falloff, or a *ring* for
  ranged units "at its highest point in a ring surrounding the catapult")
  [Mark 2015].
- Propagation: linear `Influence = Max − Max × (Distance / MaxDistance)`;
  path distance instead of straight-line where walls matter ("precompute cell
  path-distances … using an undirected Dijkstra"); templates stamped per
  agent, scaled by agent strength ("the stronger character would start at 3
  and drop to 0"); updated **once per second** [Mark 2015].
- Uses, in Mark's order: *information* ("the total threat from our enemies
  at the location we are standing"), *targeting* (find the highest
  concentration), *movement* ("find me a location that is away from enemy
  threats but also spaced apart from my allies"; "run past one threat to get
  to another") [Mark 2015]. The "threat axis" (enemy threat × ally threat
  peaks along the front line) is a positioning aid.

For a territory RTS the right reading is **[SYN]**: fields **price routes and
positions**; they do not **choose objectives**. An objective is chosen by
*value* (control points, capitals, what the map scores — the advisor's §2.3
point that a shipyard and a capital are not the same "flip"); the field then
answers "what does it cost to get there this way, and where do I stand when I
arrive". The programme's S3 threat field was built and then "proven inert"
(review §4) because it was wired as a decoration on `wm_townThreat` rather
than as a route cost — the field had no consumer that priced anything
**[PROG]**.

### 5.2 Pathing through chokepoints

- Emerson's Supreme Commander 1 lesson: units on fixed A* paths collide,
  and "rebuilding a path every time there is a collision turns into a
  compounding problem, especially in large battles" — so the old code
  *stopped* units and waited; players then "babysit their units … watching
  and clicking" [Emerson 2013] **[PRAC]**. The remedy in SC2 was a field
  (§5.4) plus "merging" A* so that multiple sources to one goal "are more
  likely to path closer together".
- Mark's path-distance propagation is the choke-aware form of a threat
  field: a choke is where path distance ≫ straight-line distance [Mark
  2015].
- Total War's Medieval expanded its battle rules "to address bottlenecks —
  particularly unit pathfinding through constrained spaces like bridges"
  [Thompson 2019a] **[PRAC]**.
- Brytenwalda "has no gates or walls that can hold a choke, because AI gates
  cannot close and no wall destructables exist" — competence by design
  elimination (`brytenwalda-ai-decomposition.md`) **[PROG]**.

The programme's chokepoint record is the fullest in the repo: a five-lane
1000-unit formation "physically impossible on a bridge" (DESIGN §11.2), lanes
that block each other (§23.2), an army that sieges an intact gate beside an
existing breach (CLAUDE.md round-1 findings), and "perimeter egress is a
class, not a venue" (lessons Part 3) **[PROG]**. The literature's
generalisation: **a crossing is a plan phase with its own precondition
(passable for this formation width, breach exists or siege present), its own
progress metric (units past the line), its own budget, and its own failure
type** — which is §2.2 applied to geometry **[SYN]**.

### 5.3 Formations, staging and dispersal (Pottinger)

Pottinger's two-part Age of Empires article **[DOC]** (widely cited; the
engine-level truths have not changed):

- "pathfinding … is only half of the solution. Movement, the execution of a
  given path, is the other half" [Pottinger 1999a].
- Three levels of group cohesion: speed-matched; speed + shared path;
  speed + path + *arrival timing* ("units … wait or accelerate so the entire
  group reaches destinations simultaneously"), the last via a commander that
  paths for the group [Pottinger 1999b].
- Groups "move at the maximum speed of its slowest unit"; letting slow units
  boost is a *balance* decision, not a movement one [Pottinger 1999b].
- At an obstacle the formation reforms "at the first place along our
  formation's path where it will not be in collision", or *halves* into two
  sub-formations that rejoin — a column through the gap [Pottinger 1999b].
- "Unit overlap is unavoidable or, at best, incredibly difficult to prevent
  in all cases. You're better off simply writing code that can deal with the
  problem early" [Pottinger 1999b].

The engine's own staging primitive is `FormGroup(n, true)` with its built-in
timeout, and Brytenwalda uses it before every wave "so it arrives as a body
rather than trickling into a choke" (`brytenwalda-ai-decomposition.md`). The
programme's §18.2 deviation ("a staging hold is a new way to stand still",
so it marched while gathering) **contradicted Pottinger and the corpus and
was reversed in §21.4** ("it left `AI_MS_STAGE` a no-op that marched, so
nothing ever gathered") in favour of a *bounded* muster: gather at a rally
point on own ground, release on measured arrival, let the phase deadline
guarantee departure **[PROG]**. That is the right shape: staging is a phase
with a progress metric and a budget, not a hold.

Dispersal is the mirror: on arrival the plan must place units, not stack
them (DESIGN §10.8 rams and dispersal; Mark's "spaced apart from my allies"
query) **[DOC + PROG]**.

### 5.4 Flow fields (Emerson) and why you never order N units to one point

Emerson's flow-field tiles **[PRAC]**: a 10×10 m sector grid; per sector a
**cost field** (8-bit, 255 = wall), an **integration field** (cost-to-goal by
an Eikonal wave-front, with a line-of-sight pass so units near the goal steer
directly), and a **flow field** (best direction per cell); portal-graph A*
between sectors; fields cached and shared "despite having different goals";
dirty-flag rebuilds on a priority queue with a fixed per-tick millisecond
slice; "50–70% of the pathable space marked as clear" so most sectors cost
nothing [Emerson 2013]. The payoff: "agents move instantly despite path
complexity", thousands of units, physics pushing allowed.

Why the principle survives without the technology: a flow field is what
*one goal for many units* looks like when done right — every unit gets its
own direction from a shared computation. Ordering N units to one *point*
gives every unit the same destination and lets the engine's collision
resolution produce the ball: "Clumping is a very common problem in RTS games,
and most commercial games do not fix the problem" [GameDev.net thread,
folk-DOC]. The standard alternatives are a formation offset per unit
[Pottinger 1999b], a leader path followed by the group, or a target *area*
with dispersal. In WC3 you do not have flow fields; you have the engine
pathfinder, `FormGroup`, attack-move and per-unit orders. Emerson's SC1
account is the warning about the last of those.

### 5.5 Why you don't fight the engine's pathfinder

Emerson again: SC1's compounding re-path is what happens when the AI's
movement layer second-guesses the engine per collision [Emerson 2013]. The
programme's order economy is the RTS-map version: 1705 orders/tick peak in
round 1 → 204 with dedup + slice + phase → 234 → 24 peak / 15.4 mean per tick
after a per-tick budget and a Squid-Game-style inertia gate ("for a busy
unit, re-decide only 25% of the time"; a busy unit "is left alone 76% of the
time") (DESIGN §8.1, §18.3, §28.4) **[PROG]**. Brytenwalda's 1–3 orders per
minute reads as competent (`brytenwalda-ai-decomposition.md`). Rule
**[SYN]**: issue one order per unit per *phase*, re-issue only on a typed
event (order rejected, unit idle with the phase unfinished, phase changed),
cache intent but read the engine's acknowledgement (lessons Part 3: "if you
cache *before* issuing and ignore the result, a failed or overwritten order
suppresses correction for the whole memory window"), and let the pathfinder
do the pathing.

### 5.6 Combat evaluation, briefly

Deciding *whether* to engage is a world-model question, and the RTS
research has a cheap answer that beats simulation: Lanchester attrition,
`α·A^n − β·B^n = k`, with per-unit strengths `α_i = Cost_i × HP_i/MaxHP_i`
(or damage-per-frame × HP) and an attrition order `n ≈ 1.56` fitted for
StarCraft (between the linear law `n=1` for melee and the square law `n=2`
for ranged); in UAlbertaBot it lifted the attack-or-retreat win rate from
60.8% (simulation) to 63.9% (static) to 69.7% (learned) [Stanescu et al.
2017] **[RES]**. The programme's `CV` (combat value) is the static form;
the point of citing this is the *concentration* lesson: "the Blue force
completely destroys the Red army with only moderate loss (i.e., 30%)" when
Red arrives in two halves — which is why staging (§5.3) is a combat
decision, not a cosmetic one.

---

## 6. Pacing, legibility and the eye

### 6.1 The AI is judged on hesitation and reaction time

- Rabin's numbers **[DOC]** (from the mental-chronometry literature he
  cites): simple reaction time 0.16 s auditory / 0.19 s visual [Kosinski],
  0.22 s visual [Laming]; go/no-go (recognise then act) 0.38 s; "somewhere
  between 0.2 and 0.4 seconds, possibly longer depending on context"; add
  time for weak stimuli, aiming, complex choice, and "a lapse in focused
  attention, which is common in humans" [Rabin 2015a]. "Use these times as
  the baseline to always delay the results of a decision" [Rabin 2017].
- Rabin on hesitation: "your AI should stop pursuing the player relentlessly
  … Intelligent creatures sometimes stop, they reflect, they hesitate, they
  reconsider, they second-guess themselves, they size up their opponent, and
  they pause … enemies that temporarily back off are much more enjoyable
  adversaries" — Pac-Man's ghosts already did this [Rabin 2017] **[DOC]**.
- Ocio: "if all of the NPCs in our group react simultaneously, on the exact
  same frame … something will feel off to the player … Randomize reaction
  times" [Ocio 2021] **[DOC]**.
- Isla's transparency cost: "it must be possible for the untrained observer
  to make reasonable guesses as to the AI's internal state as well as explain
  and predict the AI's actions" [Isla 2005] **[DOC]**.

The programme adopted per-faction reaction latency (four distinct times
across twelve factions, scaled by difficulty: 4 / 2 / 1 s) and found it
doubles as an oscillation damper (DESIGN §28.5) **[PROG]**. Note the RTS
scale: a strategic decision "reacting" in 0.3 s is not human; the
*visible* decisions of a territory AI are minutes apart, so the plausible
latency is seconds to tens of seconds, and the number is a design choice
(Rabin: "it ultimately depends on the exact context and what feels right to
the player").

### 6.2 Error injection as a difficulty axis versus resource cheating

- Ocio's accuracy system **[PRAC]**: shots only *hit* when the shooter holds
  a token; the token is granted by a global timer `delay = base × Π rule_i`
  with multipliers from distance (×0.5 inside 5 m, ×1 beyond 15 m), stance
  (×2 crouched), cover (×2), facing (×2 if looking away), approach velocity
  (×0.5 running at the AI); base 0.5 s gives 2 s for a crouched player in
  cover at 30 m and 0.1875 s for one charging in the open; the most relevant
  shooter is chosen by a weighted sum of distance, exposure, archetype,
  under-attack and assignment history, re-checked every frame; misses are
  aimed at *visible* surfaces to "convey urgency" [Ocio 2017b]. The
  transferable idea: **difficulty is a rate of deliberate error at the
  decision, and the error must be legible as pressure, not as stupidity**.
- Wetzel & Anderson's "hustling" AIs shaved dice rolls when ahead and
  "never improve their chances since players are more likely to notice (and
  complain) when an AI does better than normal than when they do worse";
  their hustling variants won 57% vs 71% for the honest one, were rated
  *equally* difficult, and "no player commented on the several AI opponents
  who routinely cheated in their favor, but several were quite vocal about
  how much the AI cheated to beat them, even though no such AI existed"
  [Wetzel & Anderson 2017] **[RES]**.
- Johnson: Civilization's "progressive series of unit, building, and
  technology discounts … have never earned much ire from the players, as
  their effect is too small to notice on a turn-by-turn basis"; resented
  cheats are free units under fog, instant wonders, and the original Civ's
  "hardwired human-targeting strategy" that "violated consistency — the AI
  didn't apply identical logic to computer opponents" [Johnson 2008a]
  **[PRAC → DOC]**. Creative Assembly's WH3 patch is the same lesson at
  scale: player-targeting threat multiplier narrowed "from 50–200% range to
  90–120%" because "the current biggest source of anti-player bias in the
  game is the threat system" [Creative Assembly 2024] **[PRAC]**.
- Dill: "You should make the AI cheat if and only if it will improve the
  player's experience — but bear in mind that if you cheat and get caught,
  that in itself will change the player's experience" [Dill 2013] **[DOC]**.

The programme's dial (error rate 0.35 / 0.15 / 0.05 at the decision — "an
erring faction picks a real but worse objective, never nothing" — reaction
4 / 2 / 1 s, material handicap present, labelled, at 1.0; DESIGN §28.6,
§29) is the literature's recommendation implemented **[PROG]**. Two cautions
from the literature the record does not yet carry: Wetzel's "the AI made the
wrong *types* of errors" (a billiards AI that sank a hard shot then missed
three easy ones lost the player for good) — injected errors must be errors a
human would make; and Ocio's rule that the miss must still read as pressure.

### 6.3 "If the AI didn't say it, it didn't happen"

Orkin's F.E.A.R. principle **[DOC]** (restated by Rabin, Wetzel & Anderson,
Ocio, and the Bungie retrospective):

- "There is no point in expending significant effort implementing complex
  AI if the player doesn't notice it" [Orkin 2015].
- Dialogue *between* agents rather than barks: "What's your status?" /
  "I'm hit!" tells the player three things at once [Orkin 2015].
- **Explain inaction**: "If you're firing at someone and they're not
  repositioning, they look like dumb, unintelligent, broken AI. But if you
  overhear the dialogue 'Get out of there!' 'I've got nowhere to go!' you
  can understand that the AI is aware of the threat, and wants to move, but
  can't" [Orkin 2015]. This is the single most useful transfer to a
  territory RTS: an army stalled at a gate should *say* it is stalled at a
  gate, and why (no siege / waiting for the ram / route blocked).
- Intent can be manufactured: "We never wrote any code for the AI to call
  in reinforcements, but the reviews said we did!" [Orkin 2015].
- Wetzel & Anderson: "players did not seem to notice … an AI that flanks
  them … but they do appreciate when an AI explicitly shouts 'let's flank
  them' … In game AI, words sometimes speak louder than actions" [Wetzel &
  Anderson 2017].
- The limit: Ocio on "he is BY THE WELL" repeated — cooldowns, remember
  "cool moments", fall back to generic lines; and don't fire the same
  reaction on the same frame for a group [Ocio 2021] **[DOC]**.

The programme's voice layer (876-line spec, 600 strings) is the principle
over-applied: the owner asked for a mute and the advisor rates it as prose
spent on an AI "that has not moved a scoreboard" (review §1.5, §31)
**[PROG]**. The literature supports a *small* set of lines keyed to
state transitions and to *inaction*, suppressed by kind and rate-capped —
which is what DESIGN §31 converged on.

### 6.4 "Playing to lose" and the perception studies

- Johnson's dichotomy: "good" AI (Deep Blue — beat the player, fixed rules)
  versus "fun" AI (The Sims — game content, can be solved); Civ sits between,
  must "please players who seek a: challenge, sandbox, narrative"; "Perception
  is reality. The question is not whether the AI is playing 'fairly' but what
  is the game experience for the player?"; "Transparency and consistency of a
  game's rules contribute significantly to player immersion"; the AI is
  forbidden some diplomacy moves "to feel fair"; the AI "knows everything
  regarding espionage but cannot always act on that information" [Johnson
  2008a; 2008b] **[PRAC → DOC]**.
- Wetzel & Anderson's numbers **[RES]** (12 game-design students, 22 AIs,
  turn-based HoMM-style combat): perceived difficulty correlated 0.80 with
  actual difficulty and 0.81 with realism; **fun correlated with nothing**
  (0.04 / −0.19 / 0.18); "83% of players were unable to recognize an AI that
  was literally nothing more than a random number generator"; RandomBot tied
  second for fun and was rated harder than the two top-scoring AIs; an AI
  that "switched targets too frequently was seen as 'computery'" (so they
  added *persistency* as a trait); players invented personalities and
  grudges that did not exist. Their conclusion: "players have no idea what
  your AI is doing … it is the AI designer's job to make sure they do not
  miss it."
- Isla on the strategic illusion: "The dance is about the illusion of
  strategic intelligence … Designer provides the strategic intelligence"
  [Isla 2008]; Dill on the original Warcraft's spawn-at-the-fog AI creating
  "an epic battle … one in which you will ultimately, against all odds, be
  victorious" — "nobody likes being patronized" once it is noticed [Dill
  2013] **[PRAC]**.
- Hecker's structure-vs-style: the field's unsolved problem is the
  decomposition that lets an engine own the reasoning while a designer owns
  the expression, as texture-mapped triangles did for rendering [Hecker
  2008] **[PRAC]**. Relevant here because the programme's twelve faction
  "voices" and tribal preferences are *style* layered on an unproven
  *structure*.

What this means for a territory AI **[SYN]**: the scoreboard that matters
is the owner's one-line verdict per playtest, and those verdicts (review
§1.1: "stutter → tunnel vision → jams → passive → passive → idle …") are
about *motion and pacing*, never about decision quality. Wetzel's
persistency finding says a faction that visibly commits to a target and
keeps at it will be rated more intelligent than one that picks optimally and
switches. That is a reason to accept §3's commitment floors on legibility
grounds alone.

---

## 7. Testing an AI — the part most texts skip

### 7.1 Why unit tests of decisions do not catch behaviour bugs

The programme's own words, from round 4: "right every tick and wrong every
game" (DESIGN §11.7, via review §3.1). The advisor's finding: 137
evaluations, 81 regex source-shape guards, 12 string checks, 66 negative
controls, 645 PASS lines — and "Every defect in the dominant class was a
property of the closed loop — state → decision → orders → world → state —
over tens of seconds to minutes"; one regression caught by a pre-existing
assertion in fourteen rounds (review §1.4, §3.1) **[PROG]**. Ocio's
progression makes the same point from the other side: test "if things are
correct if left undisturbed, and increasingly generate problems and poke the
AI in different ways … How does the AI react when it is interrupted? … What
happens if we ask it to do two different things at the same time?" [Ocio
2017a] **[DOC]**. A single-tick assertion cannot interrupt anything.

### 7.2 Closed-loop simulation

Skarupke's automated AI tests (Game AI Pro Online 2021; written for the
cancelled vol. 4) **[PRAC]**:

- "you can reproduce a lot of AI bugs with no more than two characters";
  by analogy "96% of concurrency bugs can be reproduced by enforcing a
  certain execution order of just two threads" [Skarupke 2022].
- Tests are sequential code that "takes many seconds to run", written on
  fibers, in declarative test levels, as `WaitUntil(condition, timeout)`
  chains where "each of these wait is an upper bound, the test actually runs
  faster" — time-bounded, not frame-exact.
- Debug loop: pause, cancel, restart, "restart the test until the problem
  occurs" for rare failures.
- "most complicated failures are a result of simple underlying causes that
  can be tested in isolation" — vision, movement, cover, vehicles.
- "don't be too aggressive about your tests, and try to write specific
  tests" — write one for each new feature or reproduced bug, not for
  coverage.

The advisor's toy-world specification (review §3.3) is Skarupke's method at
RTS scale: kinematic units, capture-by-CV-over-time, supply and income,
gates as segments, fog as a radius, ~25 natives, `AI_Think` at 1 s for
1,800 s over twelve factions, 2–4 days of work **[PROG]**. Warsmash is the
higher-fidelity option, blocked on a data bundle (`warsmash-eval-2026-08.md`).
The literature's ordering is the advisor's: the cheap closed loop first,
because it runs in seconds and needs nobody.

### 7.3 Scenario suites with fixed seeds

Two rules the programme learned and the literature confirms:

- Seeded determinism is a *test* property, not only a gameplay one: the
  harness's `AI_Rand` "was running a sequence that repeated 0.978 forever.
  Every probabilistic assertion measured through the interpreter was reading
  a fake stream" (DESIGN §28.1) **[PROG]** — a scenario suite must assert
  its own randomness is live (CLAUDE.md gotchas 29–30: one Park-Miller
  stream, bit-exact across integer widths).
- Scenarios are the unit: Ocio's stress tests are each a *situation* (enemy
  at 59 m on a 60 m laser; LKP unreachable and invisible; shot mid-reload;
  two doors and one in use) [Ocio 2017a]; Skarupke's are two characters and
  a level. For a territory AI the scenario list is the foible list of §8
  with a seed each **[SYN]**.

### 7.4 Regression by outcome metric, not by assertion count

- Define the outcome number before tuning (lessons Part 5: "territory over
  time"; same game at two times; exclude the human; refuse to produce a
  number when the human's slot is unknown) **[PROG]**.
- Do not report the PASS count: "It is a count of things the author thought
  to assert" (review §1.5); "Report the territory timeline or say there is
  none" (review §5) **[PROG]**.
- Wetzel's design goals list is a usable metric set for *player-facing*
  regression: overall competence (win rate), visible error rate, visible error
  severity ("a mistake that causes the player to think 'Wow, this AI is really
  stupid'") [Wetzel & Anderson 2017] **[RES]**.
- Stanescu's tournament table (60.8 → 63.9 → 69.7% over 200 matches × 6
  opponents) is what an outcome regression looks like when it exists
  [Stanescu et al. 2017] **[RES]**.

A minimal outcome set for a territory AI **[SYN]**:

| metric | window | catches |
|---|---|---|
| per-faction control-point delta vs own start, kind-filtered | T = 300, 900, 1800 | passivity, inertness, "does not play" |
| time of first exit from home per faction | once | cannot-leave-camp, muster-never-completes |
| longest interval with field centroid frozen while a reachable un-owned point exists | whole game | goal-selected-while-unable, all five disguises |
| counter-orders per unit within 5 s of the previous order | whole game | oscillation, order spam |
| distinct objectives per faction per 10 min and re-adoption of a just-failed objective | whole game | churn, failure not consumed |
| orders per player per tick, peak and mean | whole game | order storm, slice starvation |
| unreleased handles per tick | whole game | leaks (DESIGN §30) |

### 7.5 Negative controls — a check that cannot fail is worse than no check

Lessons Part 4 is the reference text for this and does not need repeating
here; its headline — "A check that can pass for the wrong reason is worse
than no check, because it gets counted as evidence" — is corroborated by
gotcha 34 (five apostrophe probes "all passing, all structurally incapable of
firing") and by the advisor's finding that the simple arm's muster event was
"hard-coded to the good value" (review §2.4) **[PROG]**. The literature
mostly assumes this discipline rather than stating it; Skarupke's
"restart the test until the problem occurs" is a negative control in the
sense that the test is *known* to fail on the bug before it is trusted.

The advisor adds the level the lessons doc lacks: negative-control the
*harness*, not only the probe — "revert three shipped fixes (§22.2, §23.1,
§24.2) and require the corresponding assertion to fail" (review §3.3). And
the limit of the technique: "a negative control proves the assertion can
fail *on the state it was handed*; it cannot prove the state is reachable"
(review §3.2) — so pair each control with a reachability assertion in
production (lessons Part 4: "Assert the unreachable state is reachable").

### 7.6 Telemetry as the primary instrument

- Orkin's squad layer works because "each A.I. already has sensors keeping
  an up to date list" and the coordinator can "look at the current situation
  from a bird's eye view" [Orkin 2006]; Final Fantasy XV shipped a logging
  visualiser as an AI feature [Johnson et al. 2017, not read — listed in the
  Game AI Pro 3 contents] **[DOC]** by prevalence.
- The programme: "the highest-leverage thing we built, and we built it eight
  rounds too late" (lessons Part 5) with a schema (`run`, `ctrl`, `exit`,
  `obj`, `mis`, `wd`) on state transitions with a sequence number — and the
  advisor's note that the programme then did not use it (review §1.1)
  **[PROG]**.
- Rule: emit on *transitions*, carry the *reason* (typed failure, §2.2), make
  the parser refuse to guess, and read the log before the next change.

### 7.7 "Did it decide correctly" versus "did the world change"

The distinction the whole section reduces to. Ocio's "Is the AI stuck if the
LKP is unreachable?" is a world question [Ocio 2017a]; the programme's
watchdog asks "has anything about this faction's *field army* changed"
(DESIGN §27.2) and sits above the decision stack precisely so that "a
modelling gap cannot defeat it" (§26.4) **[PROG]**; the advisor's
outcome-assertion list (review §3.3, items 1–7) is entirely world
predicates. A decision test tells you the code you wrote does what you
meant; only a world test tells you what you meant was enough. Keep both;
report only the second.

---

## 8. The catalogue of foibles

Ranked by how often the sources and the programme's record report each
(rank 1 = most reported). Each entry: what the player sees, the usual cause,
the fix. Citations abbreviated; **[PROG]** rounds refer to DESIGN.md.

| # | foible | player-visible symptom |
|---|---|---|
| 1 | Standing still with a valid plan | "the AI does nothing"; army idle at home / at a gate / after a capture |
| 2 | Oscillation | vibrating between two goals; march-out / march-back; siege-unsiege |
| 3 | Fix-induced regression | last round's fix is this round's bug |
| 4 | Instruments that pass for the wrong reason | green harness, broken AI |
| 5 | Order spam | unit stutter, lag, units re-pathing every tick |
| 6 | All units to one point / piling at chokes | the ball; the jam at the bridge; self-blocking lanes |
| 7 | Scale blindness | works for the small faction, inert for the large one |
| 8 | Ignoring the objective for the nearest target | chases shipyards; sieges an intact gate beside a breach |
| 9 | Overcommitment and chasing | pursues into a trap; never disengages; suicides an army |
| 10 | Defence tunnel vision / reflexive recall | the whole army turns for any raid |
| 11 | Opening your own defences | opens gates into a threat; garrison walks out |
| 12 | Fog-honesty split | banner says honest, one subsystem reads through fog |
| 13 | Success not expiring the plan | pause after every capture proportional to stickiness |
| 14 | Replanning on your own effects | plans cancel themselves; combos that skip recovery |
| 15 | Simultaneous, instant reactions | robotic; "computery" |
| 16 | Positions that are not positions | centroid in the sea; cargo votes for the water |
| 17 | Write-only state | a stuck flag nobody reads; a threat field nobody prices with |
| 18 | Anti-player bias | the AI hates you and only you |

### 8.1 Standing still with a valid plan

*Cause*: a goal selected whose first action cannot fire (no food, no gold,
no siege, wrong controller); a completed objective left claimed; a staging
hold with no release; a floor that measures selection instead of progress
(lessons Part 2, five disguises; DESIGN §11.1, §13.1, §13.2, §21.4, §24.2)
**[PROG]**. Also the platform trap: `.ai` scripts silently do nothing on a
`MAP_CONTROL_USER` slot (lessons Part 1). *Fix*: veto considerations that
score zero on impossibility [Dill 2015; Lewis 2017; Mark & Dill 2010];
progress-based deadlines on every phase; an unconditional reflex floor
beneath the selector; completion teardown; a watchdog that reads the *world*
and treats every firing as a defect (DESIGN §26.4). Orkin's rat: "he fails to
formulate any valid plan to satisfy the KillEnemy goal, and he falls back to
the lower priority Patrol goal" — the planner's version of the same floor
[Orkin 2006].

### 8.2 Oscillation

*Cause*: near-equal scores re-scored every tick [Graham 2013; Lewis 2017;
Isla 2005]; an input that the action itself moves (DESIGN §27.3; Scott
2024); replanning on own effects [Humphreys 2013]. *Fix*: §3 in order —
stop re-scoring a running plan; freeze self-moved inputs at commitment;
two-threshold band; latency window; only then bonuses and cooldowns. Do not
reach for a dwell timer first; it changes the frequency (§3.2).

### 8.3 Fix-induced regression

*Cause*: each fix adds a mechanism with its own chaperone; fourteen of the
programme's defects trace to the previous round's fix (review §1.3) — the
round-3 food-cap fix × the round-1 ramp; the round-2 slice starving
berserkers; the round-3 lanes self-blocking; the round-5 arrival guard
trapping camps **[PROG]**. Humphreys' whirlwind bug is the literature's
example [Humphreys 2013]; Orkin's "Mimes and Mutants" is the FSM-scale
version ("a branch in the state machine … even though only one type of
character ever exhibited this behavior") [Orkin 2006]. *Fix*: prefer
*removing* a mechanism to adding one (review §5: "Delete what the toy world
proves inert"); fix the class, not the venue (lessons Part 7); make every
change pass the closed-loop outcome suite, not a per-change gate (lessons
Part 7: "Per-change gates cannot catch these. Only an outcome metric can").

### 8.4 Instruments that pass for the wrong reason

Lessons Part 4 and §7.5. *Fix*: negative-control every probe and the harness;
floor the pass count; key guards on structure not text; assert reachability;
an instrument silent for two reasons is not an instrument.

### 8.5 Order spam

*Cause*: re-issuing every unit's order every tick; multiple dispatch sites
each with a full budget; caching before acknowledgement (DESIGN §8.1, §18.3,
§28.3; lessons Part 3) **[PROG]**; Emerson's per-collision re-path [Emerson
2013]. *Fix*: one choke point for orders, per-unit last-order memory, a
per-tick budget opened once, an inertia gate for busy units, read the
engine's boolean; measure orders/tick on shipped code, not a model (DESIGN
§28.4).

### 8.6 All units to one point / piling at chokes

*Cause*: one destination for N units; formation frontage wider than the
crossing (DESIGN §11.2); lanes as a fixed geometry rather than a measured one
(§23.2); no staging so units trickle into the choke [Pottinger 1999b;
Emerson 2013; `brytenwalda-ai-decomposition.md`]. *Fix*: stage as a body
(`FormGroup`, bounded muster), give each unit an offset or an area, collapse
to a column at constrictions and reform past them (lessons Part 3), treat the
crossing as a phase with its own precondition and budget (§5.2).

### 8.7 Scale blindness

§4.4. *Fix*: ratios to what must be beaten; size buckets; two-point test on
the smallest and largest faction.

### 8.8 Ignoring the objective for the nearest target

*Cause*: a target chooser that scores proximity, or counts every flip alike
(review §2.3: the kind-blind endpoint rewards a "flip-maximiser"; CLAUDE.md
round 1: "chases worthless shipyards over control points"); a threat field
used to *pick* instead of to *price* (§5.1); a gate treated as an objective
rather than transit cost (DESIGN §11.3) **[PROG]**. Wetzel & Anderson's
target-choice study is a warning that reasonable-looking heuristics converge
on the same picks and players cannot tell — so pick by *the map's own
scoring* [Wetzel & Anderson 2017]. *Fix*: value comes from what the map
scores; distance and threat are costs on the route to it.

### 8.9 Overcommitment and chasing

*Cause*: no disengage precondition on the plan (force fell below minimum,
objective changed owner); an engagement decision with no outcome estimate
[Stanescu et al. 2017]; hero XP rules that "pull heroes into danger"
(`wtoc-ai-spec.md`); the leash (DESIGN §11.6). Creative Assembly: "excessive
safety margins caused AI factions misjudging their chances and suiciding
armies" — fixed by narrowing the strength modifier from 20% to 10%, not by
adding a mechanism [Creative Assembly 2024] **[PRAC]**. *Fix*: Lanchester or
CV-ratio engagement check *before* commitment, re-checked as a monitored
precondition; a leash as a phase invariant; write-off logic that lets a lost
position go (DESIGN §8.2).

### 8.10 Defence tunnel vision / reflexive recall

*Cause*: a reflex that recalls everything on any threat (CLAUDE.md round 1);
a garrison sized as a share of own army so "the bigger the army the more of
it stayed home" (DESIGN §21.4); remote defence that marches *home* instead of
to the threatened town (review §4 defect 2) **[PROG]**. *Fix*: split the
army by what the threat needs (DESIGN §4.8's `writeOff`); size garrisons by
the visible threat with a cap; defend the *place*, not the home.

### 8.11 Opening your own defences

*Cause*: "open unconditionally" gate policy plus force-open-near (DESIGN
§24.1) — an execution-layer convenience with no threat precondition
**[PROG]**; Brytenwalda avoids it by *forbidding* AI gates to close at all
(design elimination). *Fix*: gate state is a plan precondition ("open only
during the phase that crosses, only when the threat field at the gate is
below a bar, close after"); or eliminate the mechanic.

### 8.12 Fog-honesty split

§4.3. *Fix*: one contract, audited reads, banner states the contract.

### 8.13 Success not expiring the plan

DESIGN §13.3: release claim, expire dwell, arm the floor, reset progress,
stamp the idle clock on *change* not on re-selection **[PROG]**. Orkin's
desk-slump story is the literature's version — goals that "exit cleanly"
without sharing state produce a man who finishes his work, stands up, pushes
in his chair and then falls dead [Orkin 2006].

### 8.14 Replanning on your own effects

Humphreys' whirlwind: "Simply not replanning when the world state changes
via effects being applied from a primitive task will solve this problem"
[Humphreys 2013] **[PRAC]**; Merrill's evaluate-in-parallel-interject-on-
difference is the BT form [Merrill 2013]. *Fix*: replan on sensor changes,
plan end, or no plan — never on the plan's own effects.

### 8.15 Simultaneous, instant reactions

Rabin's 0.2/0.4 s floor [Rabin 2015a]; Ocio's group-timing rule [Ocio 2021]
**[DOC]**. *Fix*: per-faction latency with jitter; the emergency exempt.

### 8.16 Positions that are not positions

Lessons Part 3: the value-weighted centroid "lands in the sea"; cargo reports
the transport's position **[PROG]**. Isla's "DANGER: AI can look really
stupid with wrong H(f)" is the general form — a cost function over geometry
that nobody validated against the map [Isla 2008]. *Fix*: every derived
position is snapped to pathable ground and validated; strength and position
are separate sums.

### 8.17 Write-only state

A `stuck` flag "write-only for four rounds" (lessons Part 2); `ai_ptOwner`
"written … never read"; the S3 displacement always `0.0` (review §4)
**[PROG]**. *Fix*: a reachability assertion for every field the tests
inject; delete dead projections rather than assert around them.

### 8.18 Anti-player bias

Johnson's original-Civ lesson [Johnson 2008a]; Creative Assembly's threat
multiplier [Creative Assembly 2024] **[PRAC]**. *Fix*: the same logic for
every faction; if the design wants the AI to focus the human, make it a
labelled dial, not a hidden constant.

---

## 9. Start here: questions to answer before writing code

1. **What is the outcome number?** Name the per-faction metric, the window,
   and who is excluded, before any tuning (lessons Part 5; review §1.1).
2. **What can this faction *do* right now?** List the executable actions;
   if a "goal" has no first order, it is a posture, not an option (§1.2e).
3. **Where is the selection/execution seam?** Which layer scores, which
   layer runs, and what typed events cross the seam (§2).
4. **For every plan: phases, preconditions, progress metric, budget, typed
   failure, teardown?** Fill the §2.2 table for each; if a cell is blank,
   the plan is a score in disguise.
5. **For every decision input: does the action move it?** Sign the
   derivative; freeze, re-purpose as progress, or phase-gate (§3.4).
6. **What are the interrupts, by name?** Each names a broken assumption;
   none is a score; the emergency is exempt from every damper (§3.3).
7. **What does the AI believe versus see?** Which fields are observed /
   last-seen / inferred / unknown; what decays and how fast; what the
   banner claims (§4).
8. **What does the map itself change that you cache?** Gates, spawns,
   ownership — re-read it or timestamp it (§4.2).
9. **What breaks at 3× the faction size?** Run every threshold against the
   smallest and largest faction (§4.4).
10. **How do N units reach one place?** Staging point, formation width at
    the narrowest crossing, dispersal on arrival; one order per unit per
    phase (§5).
11. **What does the field price, and what chooses the target?** If the
    threat field is in the target chooser, move it to the route cost (§5.1).
12. **What will the player see in the first 90 seconds?** Exit time, first
    visible commitment, reaction latency — the verdict is written there
    (§6).
13. **What does the AI say when it cannot act?** One line per stall reason;
    rate-capped (§6.3).
14. **Which cheats exist, on which labelled dials, at what default?**
    Information and material, separately; honest path working at zero
    (§6.2, lessons Part 6).
15. **What closed-loop scenario would have caught each foible in §8, and
    which shipped fix must fail it when reverted?** If you cannot write the
    scenario, you cannot claim the fix (§7).

---

## 10. Sources

Primary sources read in full or in the cited sections this session, with
links. Numbers in this document come from these texts; where a source was
*not* reachable it is marked.

**Game AI Pro (free at gameaipro.com)**

- [Dill 2013] K. Dill, "What is Game AI?", *Game AI Pro* ch. 1 —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter01_What_is_Game_AI.pdf>
- [Champandard & Dunstan 2013] A. Champandard, P. Dunstan, "The Behavior
  Tree Starter Kit", *Game AI Pro* ch. 6 —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter06_The_Behavior_Tree_Starter_Kit.pdf>
- [Graham 2013] D. "Rez" Graham, "An Introduction to Utility Theory", *Game
  AI Pro* ch. 9 —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf>
- [Merrill 2013] B. Merrill, "Building Utility Decisions into Your Existing
  Behavior Tree", *Game AI Pro* ch. 10 —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter10_Building_Utility_Decisions_into_Your_Existing_Behavior_Tree.pdf>
- [Humphreys 2013] T. Humphreys, "Exploring HTN Planners through Example",
  *Game AI Pro* ch. 12 —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter12_Exploring_HTN_Planners_through_Example.pdf>
- [van der Sterren 2013] W. van der Sterren, "Hierarchical Plan-Space
  Planning for Multi-unit Combat Maneuvers", *Game AI Pro* ch. 13 (skimmed:
  multi-unit plans need explanation and roles; state-space planners "for all
  practical purposes … cannot" plan for groups) —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter13_Hierarchical_Plan-Space_Planning_for_Multi-unit_Combat_Maneuvers.pdf>
- [Emerson 2013] E. Emerson, "Crowd Pathfinding and Steering Using Flow
  Field Tiles", *Game AI Pro* ch. 23 —
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf>
- [Dill & Lewis 2015] M. Lewis, K. Dill, "Game AI Appreciation, Revisited",
  *Game AI Pro 2* ch. 1 (skimmed) —
  <http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter01_Game_AI_Appreciation_Revisited.pdf>
- [Orkin 2015] J. Orkin, "Combat Dialogue in FEAR: The Illusion of
  Communication", *Game AI Pro 2* ch. 2 —
  <http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter02_Combat_Dialogue_in_FEAR_The_Illusion_of_Communication.pdf>
- [Dill 2015] K. Dill, "Dual-Utility Reasoning", *Game AI Pro 2* ch. 3 —
  <http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter03_Dual-Utility_Reasoning.pdf>
- [Rabin 2015a] S. Rabin, "Agent Reaction Time: How Fast Should an AI
  React?", *Game AI Pro 2* ch. 5 —
  <http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter05_Agent_Reaction_Time_How_Fast_Should_An_AI_React.pdf>
- [Mark 2015] D. Mark, "Modular Tactical Influence Maps", *Game AI Pro 2*
  ch. 30 —
  <http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf>
- [Rabin 2017] S. Rabin, "The Illusion of Intelligence", *Game AI Pro 3*
  ch. 1 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter01_The_Illusion_of_Intelligence.pdf>
- [Wetzel & Anderson 2017] B. Wetzel, K. Anderson, "What You See Is Not
  What You Get: Player Perception of AI Opponents", *Game AI Pro 3* ch. 4 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf>
- [Ocio 2017a] S. Ocio Barriales, "But, It Worked on My Machine! How to
  Build Robust AI for Your Game", *Game AI Pro 3* ch. 7 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter07_How_to_Build_Robust_AI_for_Your_Game.pdf>
- [Francis 2017] A. Francis, "Overcoming Pitfalls in Behavior Tree Design",
  *Game AI Pro 3* ch. 9 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter09_Overcoming_Pitfalls_in_Behavior_Tree_Design.pdf>
- [Lewis 2017] M. Lewis, "Choosing Effective Utility-Based Considerations",
  *Game AI Pro 3* ch. 13 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter13_Choosing_Effective_Utility-Based_Considerations.pdf>
- [Barriga et al. 2017] N. Barriga, M. Stanescu, M. Buro, "Combining
  Scripted Behavior with Game Tree Search for Stronger, More Robust Game
  AI", *Game AI Pro 3* ch. 14 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter14_Combining_Scripted_Behavior_with_Game_Tree_Search_for_Stronger_More_Robust_Game_AI.pdf>
- [Stanescu et al. 2017] M. Stanescu, N. Barriga, M. Buro, "Combat Outcome
  Prediction for Real-Time Strategy Games", *Game AI Pro 3* ch. 25 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter25_Combat_Outcome_Prediction_for_Real-Time_Strategy_Games.pdf>
- [Ocio 2017b] S. Ocio Barriales, "Using Your Combat AI Accuracy to Balance
  Difficulty", *Game AI Pro 3* ch. 33 —
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter33_Using_Your_Combat_AI_Accuracy_to_Balance_Difficulty.pdf>
- [Skarupke 2022] M. Skarupke, "Automated AI Testing: Simple tests will
  save you time", *Game AI Pro Online Edition 2021* ch. 1, and the author's
  blog post —
  <http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter01_Automated_AI_Testing_Simple_tests_will_save_you_time.pdf>,
  <https://probablydance.com/2022/01/15/automated-game-ai-testing/>
- [Ocio 2021] S. Ocio Barriales, "You had me at 'AAAAHHH' — On the
  importance of reactions in game AI", *Game AI Pro Online Edition 2021*
  ch. 11 —
  <http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter11_You_had_me_at_AAAAHHH_On_the_importance_of_reactions_in_game_AI.pdf>
- Listed in the *Game AI Pro 3* contents, not read: [Johnson et al. 2017]
  "Logging Visualization in FINAL FANTASY XV" (ch. 3); Hanlon & Watts,
  "Behavior Decision System: Dragon Age Inquisition's Utility Scoring
  Architecture" (ch. 31 — the gameaipro.com link returned HTML, not the
  PDF, on 2026-09-05).

**GDC and practitioner writing**

- [Isla 2005] D. Isla, "Handling Complexity in the Halo 2 AI", GDC 2005
  proceeding —
  <https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai>
- [Isla 2008] D. Isla, "Building a Better Battle: The Halo 3 AI Objectives
  System", GDC 2008 slides —
  <https://web.cs.wpi.edu/~rich/courses/imgd4000-d09/lectures/halo3.pdf>;
  notes by A. Armstrong —
  <https://aarmstrong.org/journal/2008/03/02/gdc08-notes-building-a-better-battle-halo-3-ai-objectives>
- [Bungie 2011] "In-Depth: Bungie On Eight Years Of Halo AI" —
  <https://www.gamedeveloper.com/game-platforms/in-depth-bungie-on-eight-years-of-i-halo-i-ai>
- [Orkin 2006] J. Orkin, "Three States and a Plan: The A.I. of F.E.A.R.",
  GDC 2006 —
  <https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf>
  (mirror: <http://alumni.media.mit.edu/~jorkin/gdc2006_orkin_jeff_fear.pdf>)
- [Mark & Dill 2010] D. Mark, K. Dill, "Improving AI Decision Modeling
  Through Utility Theory", GDC 2010 slides —
  <https://media.gdcvault.com/gdc10/slides/MarkDill_ImprovingAIUtilityTheory.pdf>
- [Pottinger 1999a] D. Pottinger, "Coordinated Unit Movement" —
  <https://www.gamedeveloper.com/programming/coordinated-unit-movement>
- [Pottinger 1999b] D. Pottinger, "Implementing Coordinated Movement" —
  <https://www.gamedeveloper.com/programming/implementing-coordinated-movement>
- [Johnson 2008a] S. Johnson, "Analysis: Game AI & Our Cheatin' Hearts" —
  <https://www.gamedeveloper.com/game-platforms/analysis-game-ai-our-cheatin-hearts>
- [Johnson 2008b] S. Johnson, "Playing to Lose: AI and Civilization", GDC
  2008 — designer-notes.com was returning HTTP 503 on 2026-09-05; the talk
  is at <https://gdcvault.com/play/364/Playing-to-Lose-AI-and> and the
  session notes used here are the CivFanatics transcript thread
  <https://forums.civfanatics.com/threads/playing-to-lose-ai-and-civilization-soren-johnson.377317/>
- [Hecker 2008] C. Hecker, "Structure vs Style" —
  <https://www.chrishecker.com/Structure_vs_Style>
- [Thompson 2019a/b/c] T. Thompson, "The AI of Total War" parts 1–3 —
  <https://www.gamedeveloper.com/programming/the-road-to-war-the-ai-of-total-war-part-1->,
  <https://www.gamedeveloper.com/design/evolution-of-war-the-ai-of-total-war-part-2->,
  <https://www.gamedeveloper.com/design/revolutionary-warfare-the-ai-of-total-war-part-3->
  (part 2 carries Mike Simpson's line on the Empire GOAP campaign AI: it
  "plans furiously and brilliantly and long term, but disagrees with itself
  chronically and often ends up paralysed by indecision")
- [Creative Assembly 2024] "Total War: WARHAMMER III — Improving AI in
  Campaign, Part 2" —
  <https://community.creative-assembly.com/total-war/total-war-warhammer/blogs/69-total-war-warhammer-iii-improving-ai-in-campaign-part-2>
- [Scott 2018] J. Scott, "Steamhammer test version uploaded, the long change
  list" —
  <http://satirist.org/ai/starcraft/blog/archives/335-Steamhammer-test-version-uploaded,-the-long-change-list.html>
- [Scott 2024] J. Scott, "Steamhammer 3.5.1 change list" —
  <http://satirist.org/ai/starcraft/blog/archives/1098-Steamhammer-3.5.1-change-list.html>
- [GameDev.net thread] "RTS movement", General and Gameplay Programming
  forum (the "clumping is a very common problem … most commercial games do
  not fix the problem" line; forum folklore, cited as such) —
  <https://gamedev.net/forums/topic/430039-rts-movement/3862158/>

**Research**

- [Ontañón et al. 2013] S. Ontañón, G. Synnaeve, A. Uriarte, F. Richoux,
  D. Churchill, M. Preuss, "A Survey of Real-Time Strategy Game AI Research
  and Competition in StarCraft", *IEEE TCIAIG* 5(4):293–311, DOI
  10.1109/TCIAIG.2013.2286295. **Not fetched** — HAL, Semantic Scholar and
  the authors' pages all returned HTML or 429 on 2026-09-05. Cited only for
  its existence and its well-known strategy / tactics / reactive-control
  decomposition; nothing numerical from it is used above.
- [Churchill & Buro 2011/2013] "Build Order Optimization in StarCraft"
  (AIIDE 2011); "Portfolio Greedy Search and Simulation for Large-Scale
  Combat in StarCraft" (CIG 2013); SparCraft. Not re-read; cited via
  [Barriga et al. 2017; Stanescu et al. 2017].

**Textbooks (not re-read this session; cited for the taxonomy only)**

- [Millington 2019] I. Millington, *AI for Games*, 3rd ed. (FSM, HFSM,
  BT, subsumption, blackboard, goal-oriented behaviour).
- M. Buckland, *Programming Game AI by Example* (2005) — goal-driven agent
  with desirability arbitration (Raven).
- D. Mark, *Behavioral Mathematics for Game AI* (2009).
- K. Dill, "Design Patterns for the Configuration of Utility-Based AI"
  (2012) and "A Game AI Approach to Autonomous Control of Virtual
  Characters" (I/ITSEC 2011) — the hosted PDFs at Northeastern returned HTML
  on 2026-09-05; cited through [Graham 2013] and [Mark & Dill 2010].

**This programme**

- `scripts/experimental/rome-ai/DESIGN.md` §4.7, §8.1, §11.1, §13.1–13.3,
  §18, §21.4, §26.4, §27.2–27.4, §28, §30.3 (not modified).
- `docs/reference/wc3-ai-lessons.md` (Parts 1–7, appendix).
- `docs/reference/rome-ai-advisor-review-2026-09.md` (§1–§6).
- `docs/reference/brytenwalda-ai-decomposition.md`,
  `squid-game-ai-decomposition.md`, `wc3-map-ai-decompositions.md`,
  `warsmash-eval-2026-08.md`.

**Staleness**: the practitioner sources are 1999–2022 and describe
techniques, not versions — they age slowly. The Total War and Steamhammer
numbers are patch values. The programme citations are pinned to DESIGN.md
through §32 and build `65a3ce2`; re-check section numbers if DESIGN.md is
renumbered.
