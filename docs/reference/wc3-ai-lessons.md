# Building an AI for a Warcraft III map — transmittable lessons

What we learned building a self-directed AI for a large custom map, written so
it transfers to *any* map rather than to ours. Two sources feed it: eight
playtest-driven rounds on Fall of Rome 1.06 (`scripts/experimental/rome-ai/`),
and eight commissioned research briefs against primary artifacts
(`docs/reference/ai-research-2026-08/`). Where a claim comes from one and not
the other, it says so.

Nothing here is theory. Every entry cost either a playtest or a wrong answer
shipped with confidence.

---

## Part 1 — Platform facts you cannot discover by reading `common.j`

These are engine truths. They apply to every map, and most of them fail
**silently**, which is why they are worth writing down.

**The engine ships a complete AI subsystem and almost nobody uses it.**
`common.ai` is 123 natives: attack captains, an assault-wave manager,
`FormGroup` staging with a built-in timeout, and state read-back including
`CaptainAtGoal`, `CaptainRetreating`, `CaptainIsEmpty` and `CaptainIsHome`.
Measured across 5,350 archived maps, 82 reference any AI native — and most of
those pass `"map.ai"`, the World Editor's **placeholder default**, which is
absent from every one of those archives. Zero of the top 70 hosted maps drive
it.

**The likely reason is one line.** `StartMeleeAI`/`StartCampaignAI` require a
**computer-controlled** player. Custom maps overwhelmingly set their slots to
`MAP_CONTROL_USER`. With a user-controlled slot the `.ai` produces *no output
whatsoever* — no error, no warning, nothing. Call
`SetPlayerController(p, MAP_CONTROL_COMPUTER)` first and the identical script
loads and runs. The requirement is documented in World Editor help; what is not
written down anywhere we could find is that converting an already-configured
user slot at runtime works. Our best guess at the history: authors tried, got
silence, and concluded the subsystem was unavailable.

**The AI VM is not the map VM.** An `.ai` script is compiled from `common.j` +
`common.ai` + your file. **`Blizzard.j` is not loaded there.** And critically:

> **Declaration is not availability.** A native declared in `common.j` will
> compile inside an `.ai` and still not work at runtime.

`I2S` is the canonical case — it returns an empty string on some
patches and crashes the game on others, corroborated across independent reports
in 2010, 2019, 2023 and 2026. `SubString` returns garbage. **All callback
enumeration** (`ForGroup`, filters, `boolexpr`) is unsafe; the working idiom is
`GroupEnumUnitsOfPlayer(g, p, null)` consumed with
`FirstOfGroup`/`GroupRemoveUnit`. There are **six thread slots per AI player**
and they are never recycled. Write your own integer-to-string. Maintain a
tested allowlist rather than trusting the header.

**None of that applies to map-script JASS.** If your AI lives in `war3map.j`
— which is where a custom-map AI usually belongs — you have the whole API. Do
not let AI-VM restrictions frighten you out of map-side code. (We nearly
rewrote working scans because of exactly this confusion.)

**Other landmines with teeth:**

- **`SuicideOnPlayer` crashes Reforged on maps with a dimension ≥ 256.** Point
  targets do not. Large-map authors: use `SuicideOnPoint`.
- **Captain calls are reported to freeze when the AI owns no structures.** The
  VM launching and the captains being safe to command are *different states*.
  Model `VM_READY` and `CAPTAIN_READY` separately.
- **`RemoveGuardPosition` is a map-side `common.j` native**, not a `common.ai`
  one, and it has no effect on heroes or peon-type units. Preplaced units hold
  guard positions and will not join a captain until those are cleared — this is
  why a captain often moves only your *trained* units and leaves the preplaced
  army standing.
- **`CommandAI` is map→AI only.** There is no reverse queue. The portable
  AI→map channel is a dedicated mailbox unit plus
  `SetUnitUserData`/`GetUnitUserData`.
- **Captains allocate by unit type and count, not by handle.** You cannot say
  "this captain owns these seventeen units". Plan ownership around that.

---

## Part 2 — The one bug class that will dominate your project

If you take a single thing from this document, take this.

> **A goal that stays selected while unable to make progress.**

We shipped it **five separate times**, in five disguises, across five rounds.
Each instance was individually plausible, each produced an army standing
still, and **none was caught by a checker that passed completely** — because
none of them was wrong at any single tick. They were wrong *over time*.

| Round | Disguise |
|---|---|
| 4 | Consolidate on a clock ramp a food-capped army could never satisfy |
| 5 | Consolidate on a gold floor a rich empire could never fall below |
| 6 | Research selected on money it did not have |
| 6 | A *completed* objective left claimed, so the idle floor saw "committed" |
| 8 | A failed mission restarting on the target it had just failed |

The structural fixes, in increasing order of robustness:

1. **Possibility gates.** A goal whose action is impossible must score **zero**,
   not merely less. Over food cap plus no gold means every train-or-build action
   is unavailable, so any goal expressed only through production is worth
   nothing. Small scores win when everything else is smaller, and then the AI
   does nothing at all.
2. **Deadlines beat gates.** A gate must *predict* what makes a goal
   impossible. We wrote three and found a fourth unanticipated state each time.
   A deadline just notices nothing happened. Give every phase a progress
   metric and a budget; abort on no-progress, not on elapsed time.
3. **An unconditional idle floor, beneath the decision layer.** "Nothing scored
   above threshold" must never be a terminal state. If nothing scores, the
   thresholds are wrong — and meanwhile the army should be moving toward the
   nearest contestable objective anyway. Put it *under* the scorer so no
   threshold can tune it away.
4. **Completion must expire the plan.** Taking the objective has to release the
   claim, expire the dwell, reset progress and re-arm the idle detector. A
   stale completed objective is indistinguishable from an active one, and in a
   multi-agent ledger it also blocks your allies.
5. **Failure must be consumed.** If you set a `stuck` flag, something must read
   it. Ours was write-only for four rounds. Aborting must tear down target,
   claim, progress and any subsystem state — otherwise the next tick re-derives
   the identical answer from an unchanged world.

---

## Part 3 — Architecture

**Attacks are procedures, not scores.** Every working AI in the corpus does
*stage → issue one order → sleep until a terminal state*, with break/threat/flee
as **flags set by other subsystems**, never as competing scores. If you find
yourself adding an incumbency bonus and a dwell timer to stop oscillation, you
are patching hysteresis over what is really a control-flow problem.

**Hysteresis needs two thresholds, not a timer.** A timer only changes the
*frequency* of oscillation. A real Schmitt trigger has different activation and
deactivation thresholds — switching from incumbent to challenger costs `+H`,
and switching back costs `+H` again.

**"Re-score timer fired" is not an interrupt.** Valid interrupts name a broken
assumption: route became impassable, required siege or transport died, force
fell below minimum, objective changed owner, home under real threat, or phase
progress stalled.

**A centroid is not a position.** A value-weighted mean of your holdings can
land somewhere no unit can stand — for an empire spread around a sea, it lands
*in the sea*. Everything geometric downstream then measures from a point in the
water, including "do I need a boat". Validate the centroid against pathing and
snap it to real ground. Related: **a loaded unit reports its transport's
position**, so cargo voting on where the army is drags the centre toward the
water and makes the AI want *more* boats — a self-reinforcing loop. Count cargo
toward strength, never toward position.

**Registries go stale.** If the map can change a thing, the AI must re-read it.
We registered gates once; the map's own triggers replace gate units when they
open and close, and only *our* replacements updated the registry — so a newly
**closed** gate could read as an open breach, inverting the entire
cheapest-crossing decision.

**Perimeter egress is a class, not a venue.** We fixed "army stuck behind its
own city gate", then the same class reappeared at a **bridge**, then again
inside **barbarian camps**. Each fix addressed the venue. State the invariant
generally: *an army whose objective lies outside its own perimeter must produce
either a crossing selection or an explicit break decision — never a bare move
order.*

**Never commit to a break you cannot perform.** An army that walks to a
2000-HP armour-5 gate with no siege will stand there doing eight points of
damage until the game ends. Price the crossing: an existing breach is free,
your own gate is nearly free, an enemy gate costs a siege you must *have*.

**Formation frontage must be measured, not assumed.** A five-lane 1000-unit
formation is physically impossible on a bridge. Sample terrain pathability
along the route and collapse to a column at constrictions, reforming past
them.

**Cache intent, but do not mistake it for acknowledgement.** An order-issuing
choke point with per-unit last-order memory is the right way to stop order
spam (ours went from 1705 orders/tick peak to 234). But if you cache *before*
issuing and ignore the result, a failed or overwritten order suppresses
correction for the whole memory window.

**Preplaced units are usually enrolled and simply never ordered.** We spent a
round hunting "why are Roman armies invisible to their own AI" and the answer
was that 139–185 preplaced units per player had been counted since round one.
They were never told to go anywhere. Check the order path before the
enumeration path.

---

## Part 4 — Instruments, and the way they lie

This is the second-biggest lesson and it generalises well beyond WC3.

> **A check that can pass for the wrong reason is worse than no check, because
> it gets counted as evidence.**

We produced **five** such instruments:

1. Guards whose regex `function X\b.*?` ran past `endfunction` and matched a
   *later* function.
2. A guard that passed against a different function than the one it named — a
   green light over a fix that did not exist.
3. Five independent probes for a suspected bug, all "passing", all
   structurally incapable of firing.
4. A test suite that verified a projection formula the production code **could
   never reach**, because the value it consumed was always zero.
5. A trace harness that scores exit 0 with zero failures when stubbed out
   entirely.

The countermeasures, all cheap:

- **Negative-control every probe before you trust a clean sweep.** Break the
  thing on purpose; the failure must appear. If you cannot make your check
  fail, it is not a check.
- **Assert the unreachable state is reachable.** If a test injects a value the
  production path is supposed to supply, add an assertion that fires when
  production never supplies it.
- **Floor your pass count.** A harness that goes quiet exits 0. Only a minimum
  assertion count catches that.
- **Key guards on structure, never on user-facing text.** Ours were keyed on
  chat strings and broke when we rewrote the dialogue for flavour.
- **An instrument that can be silent for two different reasons is not an
  instrument.** Our first captain probe reported nothing, and "never started"
  and "started and found nothing" were indistinguishable. Announce at every
  stage, on a timer that fires even when the previous stage failed.

---

## Part 5 — Measuring whether the AI actually plays

**Decisions are testable; outcomes are not.** A checker that executes the
script against mocked natives records the orders an AI issues without executing
them — no movement, no pathing, no combat, no outcome. It is genuinely useful,
and it cannot tell you whether the AI *plays*.

**A replay is not an outcome database.** A `.w3g` records player *input*. It
does not record computer-AI actions, unit deaths, fight results or authoritative
world state. In an all-computer match the interesting orders may not appear at
all. Replay parsing cannot be your oracle.

**So the map must emit its own events.** This was the highest-leverage thing we
built, and we built it eight rounds too late. Every verdict until then came
from a human reading chat and typing it back — which is why "the AI seems less
active" cost a full round to resolve, and why a confident wrong measurement got
published.

A workable schema, emitted on **state transitions** with a monotonic sequence
number and a running checksum:

| Event | Answers |
|---|---|
| `run` — seed, **AI-slot bitmask**, handicap | reproducibility, and *whose numbers to exclude* |
| `ctrl` — objective, old owner, new owner | **territory over time: the scoreboard** |
| `exit` / `home` — faction, army value, distance | **did the army ever leave home** |
| `obj` — objective, score components, posture | why it chose that, and whether the action could fire |
| `mis` — start/end, reason, target | stalls, churn, terminal states |

Two warnings from experience. **The standard telemetry library elects its
emitter only from human-controlled slots** — in an all-computer match a stock
integration emits nothing. And a **file-write channel** (`PreloadGenEnd`) is
more robust than a chat channel, but only the real game can tell you whether it
lands; ship a chat fallback with an *identical schema* so the parser does not
care which arrives.

**Define the success criterion as an outcome number before you tune anything.**
Ours is territory over time. Three rules learned by getting it wrong:
same game at two times (not two different games), exclude the human's own
faction, and make the parser **refuse to produce a number** when it cannot tell
which faction was human. A tool that guesses will hand you a confident wrong
answer, exactly as I did.

---

## Part 6 — Difficulty, cheating and honesty

**Separate information cheats from material cheats, put both on a labelled
dial, and keep the honest path working at zero.** Only then can you answer the
interesting question — *how much cheating does competence actually need?* — and
that answer is worth more than the AI.

**Audit every read against your stated contract.** We told our playtester for
several rounds that fog was respected. It was — for enemy *strength*. Enemy
*territorial ownership* was read live through fog by every consumer, because
the fog-honest field was written and never read. **Partial fog honesty is the
easy failure**: one subsystem respects visibility, another quietly does not,
and the startup banner claims the stronger thing.

**Be careful what you claim about the field.** Two claims we made and had to
retract: "essentially every hard WC3 AI is a resource cheat" (unmeasured — a
convenience sample, not a census) and "nobody has a competence dial" (false —
AMAI varies uncertainty, feature availability, hero targeting and strategy
tempo by difficulty). Also unverified despite being widely repeated: that
vision cheating is the *most resented* cheat. Plausible, no controlled study.

**And do not transplant an algorithm from a description of it.** We nearly
copied a well-known army-tracker described as "clusters with velocity, projected
several ticks ahead". Read against source, it has no velocity (a single-sample
displacement, no time normalisation), no projection horizon, an apparent
point/vector mix-up that biases predicted heading by distance from map origin,
an array indexed by the wrong loop variable, and an unconditional assignment
that discards the maximum it just computed. It is also strategically omniscient.
Read the source; use famous code as a *shape reference*.

---

## Part 7 — Process

**Only the game proves it.** Structural validity is not game acceptance, and a
green checker is not competence. Every real bug in eight rounds was found by a
human playing the map; none by a checker that passed.

**Your playtester is the oracle, and often the only one.** For most custom maps
there is no public strategy corpus at all — no replays, no guides, no tier
lists, no tournament records. Treat player claims as named hypotheses with
provenance, and prefer them over your own inference: ours overturned "naval is
important" (the map's own hint text said so; the player said transport only),
"heroes are irreplaceable" (a research existed, disabled), and several
thresholds.

**Watch for composition failures.** Twice, two individually-correct changes
combined into one broken behaviour: a real food-cap read plus a rising
consolidate weight deadlocked the AI at home; a rally-point muster plus an
unregistered perimeter may have concentrated an army into its own trap. Per-change
gates cannot catch these. Only an outcome metric can.

**Fix the class, not the venue.** Three separate rounds fixed "army cannot get
out" at three different kinds of wall.

**Commit incrementally.** We lost a day's work to an environment restart that
destroyed the checkout; the only surviving code was what had been pushed.

**Prefer making a behaviour possible over making a number bigger.** Almost every
fix that actually worked was structural — a possibility gate, a deadline, a
floor, a registry read. Almost every fix that did not was a constant.

---

## Appendix — quick reference

| Symptom | First thing to check |
|---|---|
| `.ai` script does nothing, no error | Player controller is not `MAP_CONTROL_COMPUTER` |
| String output is blank or the game crashes | `I2S` in the AI VM; write your own |
| Captain moves only some units | Preplaced units still hold guard positions |
| Army stands still in its own base | A goal selected whose action cannot fire |
| Army piles up at a wall doing no damage | Committed to a break with no siege |
| Army piles up on a bridge | Formation frontage wider than the crossing |
| Army never leaves its own perimeter | Perimeter type not in the crossing registry |
| AI abandons and restarts the same target | Abort does not clear target/claim/progress |
| It "seems" worse than last build | You have no outcome metric; build one |
| Everything passes and the AI is still bad | Negative-control your checks |
