# Research briefs for an external model — the WC3 AI question

Seven self-contained prompts to hand to an external research model (ChatGPT
deep research or equivalent), covering the open questions in the Fall of Rome
AI programme. Each is copy-pasteable on its own. Written 2026-08-09, after
the S9 probe proved the engine AI subsystem runs on a non-melee custom map.

**Why external research at all.** Our agents decompose artifacts well — they
read shipped `.j` files, probe MPQs, measure pathing data. What they are bad
at is *community memory*: forum threads from 2004, tool documentation nobody
indexed, the tacit knowledge of people who shipped AI scripts twenty years
ago. That is exactly the gap a broad web-research model fills.

**Standards to demand in every brief** (repeated inside each prompt, because
these models drop instructions that appear only once):

- **Distinguish documented from inferred from folklore.** This project has
  been burned three times by confident claims that dissolved on measurement
  (see gotcha 34 in CLAUDE.md — a rule five agents "confirmed" and two
  published maps refute). Ask for the evidence class on every claim.
- **Cite specifics**: file, function, forum thread, tool version, map name.
  "It is well known that…" is worthless here.
- **Say when the answer is unknown.** A confident wrong answer costs us a
  playtest cycle; "no source found" costs nothing.
- **Prefer primary artifacts** — script sources, decompiled files, official
  documentation — over tutorials that copy each other.

---

## Brief 1 — What actually works inside the Warcraft III AI VM

> Warcraft III (Reforged, patch 1.36/2.0, and classic 1.26–1.31) runs AI
> scripts (`.ai` files, JASS compiled against `common.ai`) in a **separate
> virtual machine** from the map script. I need to know precisely what is
> available inside that VM, because I have measured that **declaration is not
> availability**: `I2S` is declared as a native in `common.j` and passes the
> pjass syntax check inside an `.ai` script, but at runtime in the AI VM it
> returns an empty string. `B2S` is worse — it lives in `Blizzard.j`, which is
> not loaded in the AI VM at all.
>
> Questions, in priority order:
>
> 1. Which `common.j` natives are actually **implemented** in the AI VM as
>    opposed to merely declared? Is there any published list, decompilation,
>    or community-maintained table? I specifically care about string
>    conversion (`I2S`, `R2S`, `S2I`), string manipulation, `DisplayTextToPlayer`
>    and the game-state query natives (`GetPlayerState`, `GetUnitTypeId`,
>    unit group enumeration).
> 2. What exactly *is* loaded in the AI VM — `common.ai` alone, `common.ai` +
>    `common.j`, anything else? Does this differ between Reign of Chaos, The
>    Frozen Throne, and Reforged?
> 3. Is `Blizzard.j` genuinely unavailable there, and if so, what is the
>    accepted workaround for functionality that lives in it?
> 4. What is the AI VM's execution model — is it a coroutine/thread per AI
>    player, does it support `sleep`/`TriggerSleepAction`-style yielding, and
>    what happens on a runtime error inside it? Does it fail silently?
> 5. Are there known differences between the `common.ai` shipped with ROC
>    (2003), TFT, and current patches? I have a copy from jassdoc that appears
>    to be the 2003 ROC-era file and is missing `RemoveGuardPosition`, which
>    other sources reference.
>
> Sources worth checking: the Hive Workshop's JASS and AI sections, wc3c.net
> archives, the jassdoc project, the `common.ai` file itself as shipped in
> the game's MPQs, AMAI's source and its documentation, the World Editor's
> AI Editor output, and any decompilation work on `Game.dll`'s AI subsystem.
>
> For every claim, state whether it is documented, inferred from code, or
> community folklore, and cite the specific source. Where you find no
> evidence, say so explicitly rather than reasoning from plausibility.

---

## Brief 2 — Driving the engine AI from a custom, non-melee map

> I have just established experimentally that Warcraft III's native AI
> subsystem (`.ai` scripts via `StartMeleeAI`/`CreateCaptains`) **does run on
> a custom non-melee map with no town halls, no gold mines and no workers** —
> but only after calling `SetPlayerController(player, MAP_CONTROL_COMPUTER)`
> first. The map in question sets all twelve slots to `MAP_CONTROL_USER`, and
> with that left alone the `.ai` script produces no output whatsoever: it
> fails completely silently.
>
> This appears to be a significant and under-documented fact. I measured that
> only 82 of 5,350 archived custom maps reference any AI native at all, and
> that zero of the top 70 currently-hosted maps drive one — and that most of
> the 82 pass `"map.ai"`, the World Editor's placeholder filename, which is
> absent from every one of those archives. My hypothesis is that many authors
> tried, got silence, and gave up.
>
> Questions:
>
> 1. Is the `MAP_CONTROL_COMPUTER` requirement documented anywhere — official
>    docs, World Editor help, tutorials, forum posts? Has anyone written this
>    up? If it is folklore, who states it and on what evidence?
> 2. What *other* preconditions does the engine AI have on a custom map? Does
>    `CreateCaptains` or the assault-wave system require: a town hall, a hero,
>    a `DefineStartLocation` per player, `SetPlayerRace`, `SetPlayerTeam`, a
>    minimum food/supply structure, or specific `war3map.w3i` flags such as
>    `isMeleeMap`?
> 3. Which custom (non-melee) maps demonstrably ship working `.ai` scripts?
>    I know of Footmen Frenzy 9.0 AI. I want more examples, with specifics
>    about what they do and how they set up.
> 4. How does the AI script get *assigned* — `SetPlayerAIScript`, the w3i's
>    AI field, the `.ai` filename convention, `CommandAI`? What are the
>    correct call order and timing (before/after `InitBlizzard`, inside
>    `config()` vs `main()`, before/after unit creation)?
> 5. What can the map script and the AI script actually exchange? I know of
>    `CommandAI`/`CommandsWaiting` map→AI. Is there any AI→map channel, or
>    does the AI have to act on shared game state only?
> 6. Are there known incompatibilities between engine AI and heavily
>    trigger-driven maps — e.g. does the AI fight with trigger-issued orders,
>    and what is the accepted pattern for co-owning units between them?
>
> Cite specific maps, files and threads. Distinguish what is documented from
> what is inferred. If the answer to (1) is that nobody has written it up,
> say so plainly — that is itself a valuable answer.

---

## Brief 3 — `common.ai` captain semantics and unit co-ownership

> I am driving Warcraft III's engine AI captains (`CreateCaptains`,
> `AttackMoveXY`, `CaptainAttack`, `SetCaptainHome`, `FormGroup`,
> `InitAssault`/`AddAssault`/`SuicideOnPoint`) on a custom map, alongside a
> hand-written JASS AI that also issues orders. I need the precise semantics.
>
> Questions:
>
> 1. **Which units join a captain, and when?** My first test moved only siege
>    engines while preplaced infantry stood still, which I believe is the
>    guard-position mechanism — preplaced units hold guard positions and will
>    not join. Confirm or correct this. What exactly is a guard position, what
>    sets one, and what clears it (`RemoveGuardPosition`,
>    `RemoveAllGuardPositions`)? Does the captain re-issue guard positions
>    underneath you, and if so how do working AIs handle that?
> 2. What is the difference between the **attack captain** and the **defence
>    captain**, and how does the engine decide which units go to which?
> 3. What do the state-query functions actually mean —`CaptainAtGoal`,
>    `CaptainIsHome`, `CaptainRetreating`, `CaptainIsEmpty`, `CaptainInCombat`?
>    In particular, is `CaptainIsHome` genuinely "failed to path and returned
>    home", as the comment in `common.ai` suggests?
> 4. How do `AttackMoveXY`, `CaptainAttack` and `SuicideOnPoint` differ in
>    behaviour, and when does each terminate?
> 5. What are the captain system's known **failure modes and quality ceilings**?
>    I have seen it described as chasing strays and breaking off winning
>    attacks when proximity clears. What else? What do experienced AI authors
>    work around?
> 6. **Co-ownership**: what is the accepted pattern for a map script and an AI
>    script both commanding the same player's units? AMAI reportedly calls
>    `RemoveGuardPosition` in 61 places, which suggests the answer is "with
>    difficulty". Is there a cleaner handoff — e.g. give the captain a subset
>    of units, or take units out of the AI's pool entirely?
> 7. Does the engine AI respect fog of war, and does it cheat on resources by
>    default? Is there a handicap or difficulty setting that changes this?
>
> Prefer the `common.ai` source, AMAI's source, and Blizzard's own stock
> `.ai` scripts as evidence. Cite functions and line references where you can.

---

## Brief 4 — AMAI and the actual state of the art in Warcraft III AI

> I want a thorough technical account of **AMAI (Advanced Melee AI)** for
> Warcraft III and any comparable projects, aimed at someone who will read
> the source afterwards — so: architecture, not marketing.
>
> Questions:
>
> 1. What is AMAI's overall architecture? How does it decide what to build,
>    when to attack, where to attack, and when to retreat? What is its tick
>    or decision cadence?
> 2. Its army-tracking model specifically: I have a second-hand description
>    of clustering all players' units at radius 1500, keeping centroid,
>    velocity and strength per cluster, projecting several ticks ahead, and
>    scoring towns by summed strength over distance with a heading-angle
>    override. Verify this against the actual source, correct it, and give me
>    the real constants and formulas.
> 3. How does AMAI handle **custom maps** and non-standard tech trees, if at
>    all? What breaks?
> 4. What did AMAI's authors find hard? Are there design notes, changelogs or
>    post-mortems explaining decisions?
> 5. What comparable projects exist — other AI replacements, tournament AIs,
>    academic work using Warcraft III as a testbed, bot frameworks? Include
>    anything from the StarCraft: Brood War AI competition scene that
>    transfers, since that community went much deeper than WC3's.
> 6. Is there any Warcraft III AI, anywhere, that plays a **custom map with
>    real geography** competently — territory control, chokepoints, sieges —
>    as opposed to a melee-style build-and-attack loop? I believe the answer
>    is essentially no, and I want that either confirmed with reasoning or
>    refuted with examples.
>
> Distinguish documented facts from inference. Cite repositories, file names,
> forum threads and version numbers.

---

## Brief 5 — RTS AI design for a territory-control game with real geography

> I am writing an AI for a Warcraft III custom map with these properties, and
> I want the applicable literature and known-good design patterns — including
> from outside Warcraft III entirely.
>
> The game: twelve factions on a large map of Europe and the Mediterranean.
> The scored objective is **control points**, which also pay income (10 gold
> and 10 lumber each, every two minutes). Cities are walled with destructible
> gates; armies must find a crossing — an existing breach, their own gate
> which they can open, or an enemy gate they must break with siege engines.
> There is water, and some factions need naval transport to reach the fight.
> Each faction has one hero, which cannot be revived. Food caps differ by
> faction (100 default, 200 and 300 for some). Games run about thirty minutes.
>
> Questions:
>
> 1. **Influence maps and threat fields** — the practical design: cell size,
>    decay function, update cadence, how to combine threat with objective
>    value, and how to avoid the classic failure of an army oscillating
>    between two similarly-scored targets.
> 2. **Objective selection and commitment.** My current AI re-scores goals
>    every tick with a small incumbency bonus and a dwell timer, and it
>    produces decisions that are individually defensible but wrong over time —
>    a goal stays selected while unable to make progress. What are the standard
>    architectures that avoid this: behaviour trees, hierarchical task
>    networks, goal-oriented action planning, blocking procedures with
>    interrupt flags? Which is actually used in shipped RTS games, and what
>    are the trade-offs?
> 3. **Formation and movement through chokepoints.** How do shipped RTS AIs
>    move a large army through a narrow crossing without piling up? What is
>    the standard solution — column formation, waypoint queues, flow fields,
>    lane assignment?
> 4. **Siege decision-making**: deciding to break a wall versus route around,
>    and how to represent "this crossing costs a siege" in a value model.
> 5. **Multi-agent coordination between allied AIs** — claim ledgers, task
>    allocation, market-based assignment. What works at this scale (a dozen
>    agents, one shared map)?
> 6. **Economy and army-size decisions under a hard food cap**, especially the
>    "when do I stop massing and commit" problem.
> 7. Any published post-mortems from RTS developers (Age of Empires, Company
>    of Heroes, Supreme Commander, Total War, StarCraft II) on the parts of
>    AI that turned out to matter most for *perceived* competence.
>
> I want practical, implementable specifics — formulas, constants, cadences —
> not a survey of AI as a field. Where a technique has a known failure mode,
> name it.

---

## Brief 6 — Difficulty design: competence versus cheating

> A finding I want tested. In Warcraft III's custom-map scene, essentially
> every "hard" AI achieves difficulty through **resource cheating** — extra
> gold, faster production, free vision — rather than through better play. The
> one counter-example I have found is the DotA AI line, which gates its
> reflexes behind random rolls at low difficulty, i.e. **stochastic
> inattention** layered on top of resource cheats.
>
> Questions:
>
> 1. Is that characterisation correct across the WC3 scene? Which custom-map
>    AIs offer difficulty levels, and what does each level actually change?
>    Cite specifics.
> 2. More broadly, across all RTS games: what are the known techniques for
>    making an AI *feel* harder without giving it material advantages —
>    reaction-time modelling, imperfect information, decision-quality dials,
>    attention limits, error injection? Which are used in shipped games?
> 3. What does the research and the design-practice literature say about
>    **which cheats players notice and resent** versus which pass unnoticed?
>    (Vision cheating is often cited as the most resented; verify.)
> 4. Has anyone published a serious attempt to quantify **how much cheating a
>    competent AI needs** to match a given human skill level in an RTS? I want
>    to answer that question empirically for my map and would like prior art
>    on methodology.
> 5. What are the accepted ways to make an AI's *fallibility* legible and
>    fun rather than frustrating — telegraphing, consistency, recoverable
>    mistakes?
>
> Cite games, papers and post-mortems. Distinguish evidence from designer
> opinion.

---

## Brief 7 — Fall of Rome (Warcraft III custom map): how humans actually play it

> I need a decomposition of how strong human players play the Warcraft III
> custom map **Fall of Rome** (version 1.06, author ToaNoah), so I can encode
> the strategy into an AI. I have the map and can read its triggers; what I
> lack is the community's tacit strategic knowledge.
>
> Setup, for context: twelve factions — three Roman powers (West, East, North
> Rome) starting with 20-plus cities each and a 300 food cap, against nine
> barbarian factions starting with two to five cities and a 100 food cap
> (Persia has 200). Control points score and pay income. Cities are walled
> with gates. A mid-game mechanic lets the Romans temporarily ally a barbarian
> player.
>
> Questions:
>
> 1. What are the recognised **opening strategies** for each side? What does a
>    strong Roman player do in the first five minutes that a weak one does not?
>    Same for barbarians.
> 2. Which objectives actually matter? I have been told that rushing
>    Byzantium's capital early loses to territorial expansion — verify and
>    explain the reasoning.
> 3. How much does **naval** matter? The map's own hint text says fleets are
>    extremely important and control the flow of reinforcements; a strong
>    player tells me naval warfare is worthless in practice and only transport
>    matters. Which is right, and why the discrepancy?
> 4. Do factions have distinct **unit preferences or strengths** in practice,
>    and what are the counter relationships that matter? (The map states
>    cavalry beats skirmishers and swordsmen but loses to cavalry and
>    spearmen.)
> 5. How is the temporary Roman–barbarian alliance mechanic used competitively?
> 6. What are the standard **defensive** patterns — garrisoning, gate
>    management, when to abandon a city rather than defend it?
> 7. Are there replays, guides, streams, tier lists or forum strategy threads?
>    Anything from the map's own community — Hive Workshop, Discord, Russian
>    or Chinese communities — is useful.
>
> If the community material is thin, say so, and give me instead the general
> principles from comparable territory-control RTS scenarios (Risk-style maps,
> Total War campaign AI, Europa Universalis-style expansion heuristics) that
> would transfer.

---

## Brief 8 — Headless evaluation harnesses for Warcraft III

> I need to evaluate an AI's *play* — not its decisions — without a human in
> the loop. Today my only headless harness executes the map script against
> mocked natives: it records the orders the AI issues but never executes them,
> so there is no movement, no pathing, no combat and no outcome. Decisions are
> testable; outcomes are not. Every real bug in five rounds of development was
> found by a human playing the map, and none by a checker that passed
> completely.
>
> Questions:
>
> 1. **WarsmashModEngine** — an open-source Java reimplementation of the
>    Warcraft III engine. How complete is its simulation layer? Can it be run
>    headlessly (no rendering) and ticked programmatically? How faithful are
>    its pathing, combat, ability and order execution to the real game? What
>    are its known divergences? Is anyone using it as an evaluation or RL
>    environment, and are there forks that do?
> 2. What other reimplementations or emulation projects exist that can execute
>    a real `.w3x` — anything comparable to OpenRA for Command & Conquer, or
>    to the StarCraft: Brood War API (BWAPI) which enabled an entire bot
>    research scene? Why does Warcraft III have no equivalent of BWAPI, and
>    has anyone tried?
> 3. Can the retail game itself be driven headlessly — a dedicated/host mode,
>    a fast-forward or no-render flag, replay simulation, or a documented
>    automation interface? What do map-testing and tournament-automation
>    setups actually use?
> 4. **Replay files** as an evaluation channel: what is in a `.w3g`, what
>    tooling parses them, and can an AI's play be scored from a replay
>    (territory over time, army positions, orders per minute) without
>    re-simulating? This might be the cheapest possible outcome measurement —
>    a human plays once, and the replay yields quantitative data.
> 5. If someone wanted to build an RL-style gym environment on Warcraft III
>    today, what is the shortest credible path, and who has attempted it?
>
> Be concrete about effort and blockers. I care most about whether an
> *outcome-level* metric — did the army leave the city, did territory change
> hands — can be measured without a person watching, and second about how
> faithful such a measurement would be.

---

## What I would do with the answers

- **Briefs 1–3** decide whether we hand movement, staging, retreat and
  arrival to the engine and keep only the scorer, or keep hand-rolling. That
  is the largest open architectural question in the programme.
- **Brief 4** tells us whether the ~200-line army-tracking model we are about
  to copy from a second-hand description is actually what AMAI does.
- **Brief 5** is the one most likely to contain something we have not thought
  of, because it reaches outside the Warcraft III scene entirely — which,
  measured across 5,350 archived maps, has approximately no prior art on
  scoring destinations on a map with real geography.
- **Brief 6** turns "let the AI cheat" into a measurable programme rather
  than a knob someone turned.
- **Brief 7** is the cheapest of the seven and possibly the highest value:
  every threshold in our module is a plausible number someone chose, and five
  of them have been proven wrong by a human playing the map.
