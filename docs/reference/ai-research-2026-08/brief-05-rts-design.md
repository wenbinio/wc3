# Brief 5 — RTS AI design for territorial control on real geography

## Bottom line

The most defensible design is a **graph-and-field hybrid**, not one global score recomputed every tick.

1. Put cities, gates/breaches, ports, islands, and control points in a strategic graph. Represent “break this gate” and “load, sail, unload” as explicit route actions with prerequisites and costs.
2. Use influence fields to price danger and congestion *along* candidate routes, not to replace reachability or to make every army chase the largest cell value.
3. Select an objective with utility plus hysteresis, then execute a persistent multi-stage plan. Reconsider it on progress failure or a material world-state change, not merely because a timer expired.
4. Give movement its own persistent state: shared high-level route, gate/portal reservations, staged entry, local separation, and reforming after the choke.
5. Coordinate each current team/alliance with its own visibility-scoped objective ledger and a centralized auction. The agents do not need a distributed-consensus protocol if they live in one simulation, but enemy state and expired-alliance state must not leak through the coordinator. **[INFERENCE]**

No published source supplies universal WC3-ready cell sizes, decay constants, reconsideration periods, or “attack at *n* food” thresholds. Where a formula below is a project recommendation rather than a published implementation, it is marked **[INFERENCE]**.

## Evidence labels

- **[SHIPPED]** Primary developer description of a released game's implementation.
- **[SOURCE]** Inspectable source/configuration from a maintained game or bot project.
- **[EMPIRICAL]** A reported experiment; scope and sample are stated.
- **[RESEARCH]** A research prototype or paper, not evidence that a commercial game shipped it.
- **[DESIGNER]** Practitioner advice or retrospective without a controlled evaluation.
- **[INFERENCE]** An implementable recommendation derived for this map.
- **[UNKNOWN]** A claim for which an adequate accessible source was not found.

## 1. Influence maps and threat fields

### What the primary literature actually implements

| System | Resolution and update | Field construction | How it affects choice | Important boundary |
|---|---|---|---|---|
| UAlbertaBot influence-map pathfinder | **[RESEARCH]** One influence cell per StarCraft build tile. The StarCraft map is typically 128×128 build tiles and at most 256×256. Vision and damage maps are read from the live game and recalculated every frame; the common-path map is calculated once at game start. | A unit's contribution at cell `(x,y)` is `m_xy = p - (p * dist/d)^4` inside radius `d`. Separate vision, damage, and common-path layers are retained. | A* uses a lexicographic cost tuple `{distance, vision, damage, common-path}` with the published priority `vision > damage > common-path > distance`. | The authors call the results preliminary and identify evaluation as future work. The resolution, fourth-power falloff, and every-frame cadence are prototype choices, not established optima. [Critch & Churchill 2020](https://ieee-cog.org/2020/papers/paper_282.pdf) |
| Glest group movement prototype | **[RESEARCH][EMPIRICAL]** Same world extent as the path grid but “typically” fewer influence tiles; influence is updated incrementally by subtracting a unit's old contribution and adding its new one. | Combat influence is `c_u = D_u × HP_u / 100`, decayed linearly over sight range. A path edge is priced as `tau = delta × exp(psi(x,y))`; the paper derives `psi` from the field difference, clamps it to `[-1,1]`, and uses 180 as a scaling value that worked in that project. | A* becomes risk-sensitive. If the group is judged stronger, it can use the direct path rather than a long avoidance path. | Experiments used Glest 2.0, 500 random seeds, and formation parameters selected for the test map. The authors warn that safe paths can become excessively long. Do not transplant 180 as a Warcraft constant. [Danielsiek et al. 2008](https://scispace.com/pdf/intelligent-moving-of-groups-in-real-time-strategy-games-4tpss876tq.pdf) |
| Influence-map trees | **[RESEARCH]** Multiple tactical maps feed a spatial tree. | Weighted attraction to vulnerable enemies and repulsion from strong enemies. | The tree returns spatially meaningful tactical positions rather than only a target unit. | This is an evolutionary research system, not a shipped RTS architecture. [Miles & Louis 2006](https://www.cse.unr.edu/~sushil/pubs/newestPapers/ogre/newestPapers/2006/cec2006/cec2006.pdf) |

### Recommended representation for this map

**[INFERENCE]** Use two spatial resolutions with different jobs:

- A **strategic graph** whose nodes are control-point regions, city interiors, staging areas, ports, islands, and sea zones; edges are open crossings, owned gates, hostile gates, and transports.
- A **coarse threat field** for regional danger and route exposure. Choose its cell size by topology: it must resolve the narrowest crossing whose two sides must receive different costs. If it cannot distinguish “outside the wall” from “inside the city,” it is too coarse. Do not make it unit-footprint resolution unless tactical micro truly consumes it.
- A **local congestion/reservation layer** near gates, landing sites, and rally points. It should expire quickly and should not be conflated with enemy threat.

Store layers separately: observed enemy combat power, recently observed/stale power, friendly power, hero-lethality risk, objective value, terrain/route cost, and congestion. Separate layers make the decision explainable and prevent a large objective value from silently cancelling lethal danger.

For a route `r` to objective `j`, a usable project cost is:

`routeCost(r,j) = travelTime(r) + w_loss × expectedLoss(r) + breachCost(r) + transportCost(r) + congestionCost(r)`

and an objective score is:

`U(j) = scoreValue(j) + 10 w_gold × expectedGoldTicks(j) + 10 w_lumber × expectedLumberTicks(j) - min_r routeCost(r,j) - opportunityCost(j)`

The `10` values come from the map specification; all weights and estimators are **[INFERENCE]**. Keeping route cost and objective benefit distinct is preferable to adding all raster layers and selecting the maximum cell. If hero death is strategically unacceptable, make that a feasibility veto or a very large lexicographic cost rather than hoping a scalar weight dominates every circumstance.

### Update cadence

There is no credible universal cadence. The evidence supports three patterns:

- **[RESEARCH]** Full per-frame rebuild is feasible on StarCraft-sized build-tile maps in the UAlbertaBot prototype, but the paper does not establish that it is necessary.
- **[RESEARCH]** Incremental subtract/add updates avoid rebuilding the whole Glest map.
- **[SHIPPED]** Supreme Commander 2 time-slices dirty integration fields and portal-graph/path rebuilding; work is placed in priority queues rather than forcing a global synchronous refresh. [Elijah Emerson, *Crowd Pathfinding and Steering Using Flow Field Tiles*](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf)

**[INFERENCE]** For Warcraft scripting, update threat on events (unit sighted, unit dies, ownership changes, gate opens/breaks) and incrementally age stale sightings. Re-evaluate routes when a relevant graph edge or threat band changes. A slow safety sweep can repair missed events, but its number should be measured under the map's script budget; the literature does not justify inventing an 0.25 s, 1 s, or 8 s universal tick.

### Stop target oscillation

A dwell timer alone merely changes the frequency of oscillation. *Game AI Pro*'s hysteresis discussion distinguishes a Schmitt trigger—different activation and deactivation thresholds—from a timer, which does not create true hysteresis. [Kevin Dill, *What Is Game AI?* preview, hysteresis section](https://api.pageplace.de/preview/DT0400.9781466565975_A37880051/preview-9781466565975_A37880051.pdf)

Use all four of these controls:

1. **[INFERENCE] Hysteresis:** switch from incumbent `i` to challenger `j` only if `U(j) > U(i) + H + switchCost(i,j)`. `H` may depend on plan phase; it should be high after siege engines have committed and low before departure.
2. **[DESIGNER] Inertia:** Mark Dill's utility-practice slides add utility to the current choice and permit vetoes and response curves. [Dill, GDC 2010](https://media.gdcvault.com/gdc10/slides/MarkDill_ImprovingAIUtilityTheory.pdf)
3. **[INFERENCE] Progress, not elapsed dwell:** give each phase an observable milestone—force assembled, route waypoint advanced, gate HP decreased, transport loaded, control point contested. Abort on “no progress within a phase-specific budget,” not because another objective is momentarily 2% better.
4. **[SOURCE] Persistent route state:** the current FAF `AttackForceAI` retains `LastAttackDestination`, replans when its command queue is empty or it is stuck, tries a safe path, and falls back to transport/return logic. This is inspectable community-maintained code descended from Forged Alliance, not proof of the retail version's exact constants. [FAF `lua/platoon.lua`, pinned revision](https://github.com/FAForever/fa/blob/965191f259ad971293149d0cc429b51b86439d91/lua/platoon.lua)

## 2. Objective selection and commitment

The current “score every tick + incumbency bonus + 20-second dwell” conflates three decisions: selecting a campaign objective, executing its route, and detecting failure. A blocked plan can remain the highest-scoring plan indefinitely because its score says nothing about whether its current action is making progress.

### Architecture comparison

| Architecture | Strength here | Failure/cost | Evidence boundary |
|---|---|---|---|
| Behaviour tree | Reactive guards, readable designer control, good local combat and emergency interrupts. | A large flat tree repeatedly re-enters branches unless state is stored explicitly; strategic commitment is not automatic. | Widely used game-AI practice, but no accessible primary source found that establishes a named commercial RTS in the requested list used one for its entire strategy layer. **[UNKNOWN]** |
| HTN / hierarchical plan | Natural decomposition: `TakeCity → Muster → ReachGate → Breach → Enter → Hold`. Preconditions and failure reasons are explicit. | Authoring domain methods and repairing a partially executed plan take work; a brittle method set can fail when geography changes. | Wargus research uses ABL reactive planning, managers, joint intentions, and dynamic subgoals; this is research, not a shipped-game confirmation. [McCoy & Mateas 2008](https://eis.ucsc.edu/papers/AAAI08Mccoy.pdf) **[RESEARCH]** |
| GOAP | Searches alternatives such as breach, detour, or naval transport when preconditions/costs change. | State/action modeling and heuristic/debug cost grow quickly; naïve replanning recreates thrashing. | A secondary historical account says Empire/Napoleon/Shogun 2 used GOAP, but an accessible primary technical source confirming the exact campaign architecture was not located. Treat this as unverified for implementation claims. [secondary account](https://www.gamedeveloper.com/design/revolutionary-warfare-the-ai-of-total-war-part-3-) **[UNKNOWN]** |
| Stateful blocking procedure + interrupt flags | Cheapest deterministic fit for WC3 triggers; phase-local progress watchdogs and cleanup are straightforward. | Can become tangled if interrupts can jump anywhere or procedures own hidden state. Needs explicit phase contracts and one cleanup path. | FAF's attack-platoon loop is a concrete open-source example of persistent procedural execution with replanning/fallbacks. [FAF source](https://github.com/FAForever/fa/blob/965191f259ad971293149d0cc429b51b86439d91/lua/platoon.lua) **[SOURCE]** |
| Case/planned timing + reactive discrepancy handler | Keeps a strategic line while reacting when an expectation becomes false. | Needs authored cases/expectations and a way to recover when none fit. | EISBot uses planned attack timings, opportunities, pressure, and build-order expectations; a violated expectation becomes a discrepancy that selects a new strategy. It is a StarCraft research bot. [Weber et al. 2012](https://cdn.aaai.org/ocs/4209/4209-17783-1-PB.pdf) **[RESEARCH]** |

### Recommended hybrid

**[INFERENCE]** Keep the selector and executor separate:

- **Campaign selector:** utility with vetoes, route feasibility, current-plan inertia, and switch cost.
- **Persistent executor:** a small HTN-like or procedural state machine with phases `CLAIM → MUSTER → ROUTE → BREACH/EMBARK → OCCUPY → HOLD/RECOVER`.
- **Reactive layer:** local targeting, spell use, formation, retreat, and only a short list of strategic interrupts.

An interrupt should name a broken assumption: route edge became impassable; required transport/siege died; hero/base emergency crossed a policy threshold; objective changed owner and no longer has value; force fell below minimum; or phase progress stalled. “Re-score tick fired” is not an interrupt condition.

For each phase record: start time, last-progress time, progress metric, reserved assets, expected world facts, and cleanup action. This turns “unable to make progress” from an emergent symptom into a tested state transition.

## 3. Formation and movement through chokepoints

There is no single industry-standard “column formation” switch. The strongest shipped evidence combines a shared high-level route with persistent movement/formation state and local obstacle handling.

- **[SHIPPED]** Dave Pottinger's Age of Empires movement articles emphasize that an optimal path can still look stupid if execution repeatedly reverses decisions. The group stores its units, centroid, maximum speed, and a commander; the commander obtains a shared high-level route. Formation state persists as `Broken`, `Forming`, and `Formed`; slots are scheduled inside-out. At obstacles the group can shrink offsets, break and reform beyond the obstruction, or split and rejoin. Collision priority and memory of a resolved collision prevent units from immediately undoing the resolution on the next update. [Coordinated Unit Movement](https://www.gamedeveloper.com/programming/coordinated-unit-movement), [Implementing Coordinated Movement](https://www.gamedeveloper.com/programming/implementing-coordinated-movement)
- **[SHIPPED]** Supreme Commander 2 uses tiled flow fields. The world is divided into sectors containing 10×10 grids of 1×1 m squares. The cost field is 8-bit (`255` wall, `1–254` traversable cost); the integration field is 24-bit (16 cost bits plus 8 flags); the flow field is 8-bit (4 direction bits plus 4 flags). Portal nodes connect sectors, portal-graph A* chooses the sector corridor, and integration work is time-sliced. Multiple sources heading to one goal can merge and reuse fields. These are exact game-specific implementation details, not WC3 tuning recommendations. [Emerson](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf)
- **[SHIPPED/DESIGNER]** The Maestros team describes destination offsets and a “SmartCenter” that recomputes the group center after discarding units more than one standard deviation away, preventing stragglers from pulling the formation target. The post explicitly presents a practical shipped solution, not state of the art. [The Maestros group movement](https://www.gamebreaking.com/posts/group-pathfinding-movement-in-rts-style-games)

**[INFERENCE]** For WC3, do not fight the engine's native unit pathfinder with a second low-level steering system. Implement the strategic half:

1. Choose and reserve a gate/portal for the group.
2. Put a staging point on the near side and a dispersal arc on the far side.
3. Admit bounded subgroups; siege and durable frontliners enter first, fragile ranged units and the unique hero wait for clear space.
4. Give each subgroup a distinct far-side waypoint, not the gate center. Do not issue a new destination every AI tick.
5. Mark the crossing complete only when a defined fraction or required asset set reaches the far side; then reform.
6. If throughput stays at zero, release the reservation and return a typed failure (`BLOCKED`, `GATE_REBUILT`, `NO_SIEGE`, `NAVAL_REQUIRED`) to the strategic executor.

Flow fields are attractive when many units share one goal, but a flow field for one army does not solve several armies with different goals. Emerson's implementation shares cached fields where paths/goals overlap; it still creates path requests and supports different movement types. In WC3 custom-map scripting, strategic gateway selection and destination spacing are attainable; replacing native locomotion generally is not.

## 4. Siege: break the wall or route around

The goal is not “attack a wall.” It is “cross this frontier and obtain/hold the region.” Model the gate as a route edge with an action.

### Edge types

| Edge | Preconditions | Cost components | Completion fact |
|---|---|---|---|
| Open breach | Reachable on both sides | travel, exposure, congestion | required force is across |
| Friendly gate | ownership/open command works | travel, open latency, congestion | gate is open and force is across |
| Hostile gate | siege or adequate damage, staging space | approach loss, breach time, siege opportunity cost, reinforcements likely during breach | engine reports pathable/open, not merely 0 expected HP |
| Sea transport | port/shore reachability, available capacity, valid landing | load wait, sailing exposure, unload time, transport-loss risk | required units unloaded |

**[INFERENCE]** A first-pass hostile-gate estimate is:

`breachTime = remainingGateHP / effectiveSiegeDPS`

`breachCost = breachTime + w_loss × expectedApproachAndBreachLoss + siegeDiversionCost + congestionCost`

Use effective DPS after range, uptime, and space constraints—not paper DPS. Recompute on a typed event (gate repaired, siege engine lost, defenders arrive), and compare the entire route via that edge with open-breach, friendly-gate, and transport routes. A wall with the shortest Euclidean distance can still be the most expensive route.

**[SOURCE]** FAF's attack-vector code is a relevant, inspectable precedent for treating route safety and transport fallback explicitly: it calls `GetBestThreatTarget`, invokes `PathToWithThreatThreshold`, stores the route, and can request transport if no suitable land path exists or the distance warrants it. The source uses a surface-threat-derived threshold in this implementation; it is not a WC3 siege-cost formula. [FAF `lua/AI/aiattackutilities.lua`](https://github.com/FAForever/fa/blob/965191f259ad971293149d0cc429b51b86439d91/lua/AI/aiattackutilities.lua), [FAF platoon source](https://github.com/FAForever/fa/blob/965191f259ad971293149d0cc429b51b86439d91/lua/platoon.lua)

**[UNKNOWN]** The Company of Heroes GDC session “Dealing with Destruction: AI From the Trenches of Company of Heroes” is primary developer metadata, but no accessible slides/transcript were found. It cannot substantiate a particular destructible-wall algorithm. [GDC Vault session page](https://gdcvault.com/play/765/Dealing-with-Destruction-AI-From)

## 5. Coordination among twelve allied AIs

The classic Contract Net assigns a manager to announce tasks, accepts bids from eligible agents, awards contracts, and receives results. [Smith 1980, *The Contract Net Protocol*](https://ieeexplore.ieee.org/document/1675516/). Market-based multi-robot systems similarly place local execution cost in bids while optimizing a team objective; the survey distinguishes local planning from optional central redistribution and role fitness. [Dias et al. survey landing page](https://publications.ri.cmu.edu/market-based-multirobot-coordination-a-survey-and-analysis), [paper PDF](https://cse-robotics.engr.tamu.edu/dshell/cs689/papers/dias06market.pdf). These are **[RESEARCH]** coordination patterns, not RTS difficulty studies.

For the members of each current team/alliance in one map script, a central coordinator is a simpler deterministic design **[INFERENCE]**:

1. **Visibility-scoped snapshot:** objective owner/value, legally observed threat with timestamps, known route-edge states, claimed transports/siege, and each allied faction's available force/role. Never populate it from omniscient enemy state unless an explicit difficulty handicap permits that.
2. **Candidate tasks:** defend, capture, support assault, screen a gate, escort siege, provide transport, raid income, reserve/recover.
3. **Hard feasibility filter:** route/domain exists; required asset exists; minimum force can arrive before the deadline.
4. **Bid:** `objectiveValue + roleFit - travelCost - expectedLoss - opportunityCost - switchCost`. This formula is **[INFERENCE]**, not from Contract Net.
5. **Award with capacity:** some tasks take one faction, an assault may require a coalition, and every award records the assets committed, lease/expiry, progress state, and release condition.
6. **Re-auction on events:** objective captured/lost, route invalid, force destroyed, missed deadline, no progress, or a materially better emergency. Do not clear all claims on a fixed global tick.

A ledger entry should be a contract, not a Boolean:

`{task, objective, owner/coalition, role, promisedForce, ETA, phase, lastProgress, expiry, dependencies}`

Temporary alliances need lifecycle rules: create or join a ledger only when the alliance takes effect; tag every shared observation and claim with its provenance; stop new sharing immediately on expiry; revoke outstanding cross-alliance claims; and do not retain enemy positions merely because they were observed through a former ally. The exact memory policy is a game-design choice, but it must match the information rules exposed to human players. **[INFERENCE]**

Failure modes and controls:

- **Everyone chases the top objective:** task capacity and marginal coalition value prevent excess awards.
- **Weak bids win because they are nearby:** hard minimum-force feasibility precedes score.
- **Claims become stale:** lease plus progress heartbeat, with release on typed failure.
- **Allies deadlock on dependencies:** the coordinator awards an atomic bundle such as `{transport provider, assault force}` or rejects it.
- **Coordination erases faction personality:** keep team feasibility/value global but let role fit, risk tolerance, and opportunity cost remain faction-specific.

## 6. Economy, hard food caps, and when to commit

### Relevant evidence

- **[RESEARCH]** Build-order search formalizes RTS production as concurrent resource allocation and searches for the shortest makespan to a goal. It explicitly captures the early worker-versus-military/technology tradeoff with actions that require, borrow, consume, and produce resources. Combat and full late-game strategy are outside its scope. [Churchill & Buro 2011](https://davechurchill.ca/publications/pdf/aiide11-bo.pdf)
- **[RESEARCH]** A StarCraft combat predictor based on generalized Lanchester models improved tournament win percentages versus the authors' prior simulator. Its comparison uses conditions such as `alpha A_0^n > beta B_0^n`; the average best fixed exponent was about 1.56 on their StarCraft data. Terrain, range, and movement are substantially abstracted. That exponent must not be transplanted into WC3. [Stanescu, Barriga & Buro 2015](https://skatgame.net/mburo/ps/aiide15-combat.pdf)
- **[RESEARCH]** The Wargus integrated agent records an expert “probe stop”: pause economy and direct all income to military for a temporary production spike. This is evidence for a deliberate strategic phase change, not a universal threshold. [McCoy & Mateas](https://eis.ucsc.edu/papers/AAAI08Mccoy.pdf)

### Implementable policy

**[INFERENCE]** Separate three controllers:

- **Desired composition:** what counters known threats and satisfies route prerequisites (siege, anti-air, transports).
- **Production plan:** how to reach that composition within resources, queues, and food.
- **Commitment trigger:** why the current force should leave now.

At a hard cap, the marginal value of waiting is usually zero if production cannot improve the force. Waiting can still be rational for a named reason: synchronize an ally/transport, finish siege prerequisites, defend an imminent payout/control point, recover cooldowns/health, or exploit a known enemy timing. Require the executor to record that reason and its deadline; otherwise cap saturation is a forced commitment signal.

Commit when at least one **window** exists and feasibility passes:

- **Cap pressure:** food is blocked and no near-term composition swap is more valuable.
- **Planned timing:** a completed tech/composition spike or coalition rendezvous.
- **Perishable opportunity:** enemy force displaced, gate open, transport window, or capture before the next two-minute payout.
- **Strategic necessity:** losing score/income by waiting exceeds expected combat loss.

Feasibility means a valid route, required siege/transport, a combat estimate above the faction's risk margin, and a survivable reserve for mandatory defense. Measure strength by composition and effective local combat power, not unit count, because caps are 100/200/300 and unit food costs differ.

There is no evidence-backed universal “attack at 80% food” or “wait 45 seconds.” Log food, predicted win probability, route cost, objective value, and actual outcome, then calibrate thresholds by faction and phase from real games.

## 7. What shipped-RTS retrospectives say matters for perceived competence

| Game/source | Primary takeaway | Strength of conclusion |
|---|---|---|
| Age of Empires / Dave Pottinger | Correct path selection is insufficient: persistent collision resolution, formation transitions, and shared group routing keep movement from visibly reversing or dissolving. [movement articles](https://www.gamedeveloper.com/programming/coordinated-unit-movement) | **[SHIPPED][DESIGNER]** Primary implementation account; not a controlled perception experiment. |
| Supreme Commander 2 / Elijah Emerson | One-way fixed A* paths plus collisions required player babysitting; tiled, cached, dynamically integrated flow fields provided immediate movement feedback for hundreds or thousands of units. [developer chapter](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf) | **[SHIPPED][DESIGNER]** Detailed primary implementation chapter. |
| Total War: Warhammer III AI beta | Official developers describe task evaluation using target/owned strength, distance in turns including stances and recruitment, and priority horizons. The beta narrowed personality/difficulty effects on perceived player threat from 50–200% to 90–120%, player-strength multiplier to 100–120%, and removed/deprioritized “attack human” tasks to reduce anti-player fixation. Larger empires received farther planning horizons. [official technical blog](https://community.creative-assembly.com/total-war/total-war-warhammer/blogs/69) | **[SHIPPED/BETA]** Exact public-beta tuning, not a universal recipe. |
| Total War beta feedback | Creative Assembly reports more than 50,000 beta campaigns and that about 65% passed the early game; feedback highlighted anti-player bias and suicidal behavior. The studio also notes the beta difficulty distribution differed from live, so the sample is self-selected. [official feedback blog](https://community.creative-assembly.com/total-war/total-war-warhammer/blogs/68) | **[EMPIRICAL]** Large telemetry/feedback pool but not a randomized perception trial. |
| Company of Heroes | Two relevant primary GDC pages were found, but accessible technical content was insufficient to support a specific implementation claim. [destruction session](https://gdcvault.com/play/765/Dealing-with-Destruction-AI-From), [single-player mission session](https://gdcvault.com/play/719/Theory-into-Practice-Single-Player) | **[UNKNOWN]** Session metadata only. |
| StarCraft II | No accessible Blizzard postmortem isolating perceived strategic competence was found in this search. EISBot and AlphaStar are valuable research systems but are not Blizzard's shipped opponent AI. | **[UNKNOWN]** Do not substitute research-bot architecture for a shipped-game claim. |

Across the strongest sources, visible competence comes less from finding a mathematically best target than from **carrying out an intelligible campaign**: units move without babysitting, armies do not suicide or fixate on the human, strategic reach grows with empire capacity, and plans persist until success or an explainable failure.

## Implement now

1. Build and validate the crossing/port/control-point graph; expose a debug overlay for edge type and current feasibility.
2. Replace the dwell-timer goal loop with a selector plus persistent phase executor and typed failure reasons.
3. Add gate reservation, near-side staging, far-side dispersal, and no-progress detection before adding sophisticated influence fields.
4. Add observed/stale enemy threat and integrate it into route pricing. Preserve raw layers in logs.
5. Add the alliance task ledger and event-driven auction.
6. Instrument every campaign: selected utility terms, route, phase transitions, progress, abort reason, food, composition, estimated and actual losses, and objective payout gained/lost.

This order is **[INFERENCE]**. It prioritizes topology and execution because the shipped developer accounts repeatedly identify movement and coherent task pursuit as what forces the player to babysit—or trust—the AI.

## Evidence limits

- Exact published constants are reported only with their originating system. None is validated for Warcraft III, this map's scale, or twelve simultaneous factions.
- FAF is a current community-maintained open-source fork of Forged Alliance lineage. Its source is useful implementation evidence, but its present loops and numbers must not be attributed verbatim to the 2007 retail executable. [repository](https://github.com/FAForever/fa)
- The search found no primary, accessible technical postmortem proving the exact strategic architecture used by retail Company of Heroes or Blizzard's StarCraft II opponent AI.
- No controlled study found here compares column formation, lane assignment, waypoint queues, and flow fields on the same RTS choke. The recommended choke protocol is an engineering synthesis, not an empirical winner.
- No paper establishes a universal threat falloff, influence-grid resolution, progress timeout, alliance auction cadence, or food-cap attack threshold.
