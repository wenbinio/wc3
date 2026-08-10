# Brief 6 — Difficulty design: competence versus cheating

## Verdict

The proposed scene-wide characterization is **not established**. The named WC3 examples do show that material bonuses are common, but the accessible evidence is a convenience sample, not a census of 5,350 maps. The evidence also prevents a simple “difficulty equals resources only” conclusion across Warcraft III AI more broadly:

- AMAI, a melee AI rather than a custom-map scenario AI, changes feature availability, target selection, uncertainty, strategy-change speed, and access to off-screen information—not only resources.
- `Assassins v4.1 +AI` has an author statement that difficulty does not affect its basic AI, so it is evidence that a map's difficulty setting need not be an AI ladder rather than a behavioral counterexample.
- `DotA Allstars v6.54b AIPlus 1.52 Rev. 02.w3x` combines weaker/inconsistent behavior on Easy with very large XP/gold bonuses. This exact map supports “behavioral degradation layered on material cheats,” but its author documentation does not establish the narrower mechanism “reflexes gated by random rolls.”

The stronger conclusion is: **material and information advantages are prominent in the named, documented WC3 examples; prevalence across the archive remains unknown; and no source-verified custom-map difficulty ladder using behavioral changes alone was found in this pass.** AMAI establishes that a broader WC3 AI can vary non-material competence, not that custom-map authors commonly do so.

For the new map, difficulty should be a vector of observable competence constraints—information, attention, decision quality, execution, coordination, and adaptation—while material handicaps are a separately named setting. There is no published universal conversion from “AI competence” to “required resource cheat.” It must be calibrated on the actual map.

## Evidence labels

- **[SHIPPED]** Primary developer description of a released game implementation.
- **[SOURCE]** Inspectable source/configuration from a game, map, or bot.
- **[MAP DOC]** A named map's author-published description; stronger than folklore, weaker than extracted trigger/source verification.
- **[EMPIRICAL]** A reported experiment or human match evaluation.
- **[RESEARCH]** Research system/paper; not evidence that commercial opponent AI shipped it.
- **[DESIGNER]** Practitioner opinion or retrospective without controlled comparison.
- **[PROPOSAL]** A design issue or plan that is not shown to have shipped.
- **[INFERENCE]** Recommendation for this project.
- **[UNKNOWN]** Not established by the accessible evidence.

## 1. What WC3 difficulty levels actually change

### Named maps and AI packages with specific evidence

| File/map/package | Difficulty behavior | Evidence and limits |
|---|---|---|
| `DotA Allstars v6.54b AIPlus 1.52 Rev. 02.w3x` | Easy: 15% bonus XP (35% with high-XP mode), no bonus gold (4 with high-gold mode), and “inconsistent/weaker AI.” Normal: 40% XP (75% high-XP) and 4 bonus gold (8 high-gold). Insane: 75% XP (120% high-XP), 8 bonus gold (16 high-gold), plus innate WC3 engine bonuses. A pool of 100 gold is divided among AI teams; Normal multiplies it by 3 and Insane by 5. `-ne` removes extra XP, but the README says no mode removes the gold bonuses. Dynamic XP mode starts normal, adds 15 percentage points when an AI dies, and subtracts 15 when it kills, within the documented bounds. | **[MAP DOC]** Exact file and author-bundled README reproduced on its map page. This proves material bonuses plus a qualitative Easy behavior downgrade for this version. It does **not** reveal the implementation of “inconsistent/weaker” or prove random reflex rolls. [Hive map page and README](https://www.hiveworkshop.com/threads/dota-allstars-v6-54b-ai-1-52-rev-02.97753/) |
| `The Reforged Blade V1.33 Ai.w3x` | Human: +0% creep bounty, 4 gold/s, 80% XP. Easy: +50%, 6 gold/s, 80% XP. Medium: +70%, 8 gold/s, 100% XP. Hard: +90%, 10 gold/s, 120% XP. | **[MAP DOC]** Exact public map table, updated map page; no extracted source was inspected. This is an unambiguous material-difficulty example. [Hive map page](https://www.hiveworkshop.com/threads/the-reforged-blade-v1-33-ai.237298/page-2) |
| `Assassins v4.1 +AI` | The author calls the AI basic and says it is not affected by difficulty. | **[MAP DOC]** Direct author reply on the named map page, not source verification. It is a counterexample to the premise that every custom-map difficulty selector necessarily changes the AI. [Hive thread](https://www.hiveworkshop.com/threads/assassins-v4-1-ai.141082/) |
| AMAI, pinned revision `2ab10ee…` | Easy/Normal/Insane alter information and behavior. `EASY=1`, `NORMAL=2`, `HARD=3` and the UI labels Hard as Insane. Hard obtains exact cached player-strength estimates; lower levels perturb strength by multiplicative and additive randomness. Easy excludes at least the `rushcreep` feature and does not enable hero targeting in the universal attack/focus-fire paths. The strategy timer code divides by a Hard-only difficulty term, documented in source as faster strategy change on Insane. | **[SOURCE]** Exact open-source branches. AMAI is a melee AI package designed for melee maps, not evidence about all custom game modes. [`common.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/common.eai), [`races.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/races.eai), [repository](https://github.com/SMUnlimited/AMAI) |
| AMAI fountain and expansion jobs | Normal fountain logic reacts to enemy strength detected around the traveling unit once it is within 600 range; Hard additionally queries strength at the fountain within radius 1000 even when the unit is not there. Both health and mana fountain jobs use this branch and queue an 8-second reset on retreat. The expansion job checks danger around the worker at radius 600 for all levels; Hard additionally checks the remote expansion and explicitly comments “map-hack behaviour,” retrying after 10 seconds. | **[SOURCE]** Concrete information-cheating branches and source-local constants, not recommended tuning. [`HEALTH_FOUNTAIN.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/HEALTH_FOUNTAIN.eai), [`MANA_FOUNTAIN.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/MANA_FOUNTAIN.eai), [`BUILD_EXPANSION.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/BUILD_EXPANSION.eai) |

### AMAI as a particularly useful counterexample

AMAI's own manual describes the intended distinction as Easy omitting features, Normal playing strongly with less “map hacking” and more visible evidence, and Insane “map hacks everything.” That page is headed as future work/known issues, so its wording is **[DESIGNER] intent**, not proof that every intended distinction is complete. [AMAI `KnownIssues.htm`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm)

Its source provides several exact, currently inspectable mechanisms:

- `GetUnexactPlayerStrength`: Hard returns exact strength; Easy/Normal perturb it using `GetRandomReal(1 - uncertainty/50, 1 + uncertainty/50)` plus `GetRandomDiff(uncertainty/5)`, cached until its timeout. **[SOURCE]**
- `calculate_strat_timer_seconds`: begins with `GetRandomInt(-30,30) - seconds`, applies a tier term, then divides by `1 + 0.5 × max(difficulty-2,0)` after integer conversion; the source comments that this makes change faster on Insane. **[SOURCE]** Do not reuse the expression without understanding AMAI's timer-queue sign conventions.
- `UPDATE_STRENGTH` schedules itself after `15 × sleep_multiplier`; this is an implementation cadence, not “human reaction time.” **[SOURCE]** [`UPDATE_STRENGTH.eai`](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Jobs/UPDATE_STRENGTH.eai)
- The profile manual recommends uncertainty 5–15 and illustrates 6 as strength error of roughly ±6 or less. It also exposes aggression, minimum attack strength, farm timing, expansion timing, and strategy persistence. These are **[DESIGNER] project knobs**, not empirically optimized constants. [AMAI profile tutorial](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/Tutorial.htm)
- `income_per_mine *= max(difficulty-1,1)` doubles AMAI's *internal income estimate* on Hard. The inspected line does not itself grant resources; it should not be reported as the source of a bonus without tracing the engine's melee-difficulty rules. **[SOURCE]**

This refutes “difficulty is only resources” within a major WC3 AI project. It does not establish that AMAI is fair: its Hard branches deliberately use information unavailable to a human.

### Negative search and prevalence boundary

**[UNKNOWN]** No source-level difficulty implementation was located in the accessible indexed material for the following named lines/pages:

- later DotA AI map versions often discussed online (including 6.77b/6.78c);
- `Footmen Frenzy 6.2 AI` ([map page](https://wc3maps.com/map/149133)) and `Footmen Frenzy 1000 AI 4.0 AR` ([map page](https://wc3maps.com/map/172824));
- other listings that advertise several difficulties but provide only a binary map or prose without trigger excerpts.

The search did not extract and audit the full 5,350-map corpus. Map listings prove a file exists, not what its JASS/triggers do. Therefore no percentage such as “essentially every,” “most,” or “only DotA” is supportable from this evidence.

## 2. Non-material ways to make an RTS AI harder

Here “fair/non-material” means the AI receives the same income, production, unit stats, cooldowns, and visibility rules as the player. Omniscience is an **information cheat** even though it is not a resource bonus.

| Axis | Difficulty controls that preserve rules | Concrete evidence | Common failure |
|---|---|---|---|
| Perception and memory | Observation latency; field-of-view enforcement; stale-contact memory and decay; scouting quality; opponent-model accuracy; uncertainty/noise. | **[SOURCE]** AMAI changes exact versus noisy strength and visible versus remote danger queries. **[RESEARCH]** EISBot uses fog-limited observations plus a particle model to estimate unseen unit locations rather than reading their current position. [EISBot](https://cdn.aaai.org/ocs/4209/4209-17783-1-PB.pdf) | Random noise independently resampled every tick causes flicker; omniscience invalidates scouting and ambush counterplay. |
| Attention | Limit simultaneously active fronts, spell casters, or urgent queues; add a context-switch cost; batch observations; prioritize emergencies. | **[EMPIRICAL]** AlphaStar's final evaluation used a camera interface and a cap of 22 agent actions per five seconds; camera movement also consumed an agent action. This is an action/attention constraint used for human comparability, not a retail difficulty mode. [DeepMind](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/) | A single global “sleep” makes the whole army comatose and is easy to exploit. |
| Reaction and execution | Observation-to-command delay; action budget; command batching; reduced focus-fire precision; overkill allowance; less exact kiting/spell timing; slower production-queue refill. | **[PROPOSAL]** An OpenRA maintainer proposed 0–5 s structure-queue delay and possibly 0–2 s unit delay for Normal, no delays for Hard, and separate cheating Brutal. It was an unassigned issue with no linked implementation, so these numbers are not shipped evidence. [OpenRA issue #16126](https://github.com/OpenRA/OpenRA/issues/16126) | Pure independent random failures look broken; exact repeated latency becomes exploitable metronome behavior. |
| Decision quality | Smaller strategy repertoire; lower planning/search budget; coarser combat estimate; suboptimal but reasonable target ranking; utility noise; lower-quality counter selection; weaker timing-window detection. | **[SOURCE]** AMAI Easy disables features/hero targeting and lower levels use uncertain strength. **[DESIGNER]** Mark Dill describes utility response curves, vetoes, inertia, and noise as action-selection tools. [Dill slides](https://media.gdcvault.com/gdc10/slides/MarkDill_ImprovingAIUtilityTheory.pdf) | Choosing arbitrary nonsense is not “easy”; the player cannot form a causal model or improve against it. |
| Commitment and tempo | More/less hysteresis; longer plan commitment; minimum attack size; attack interval; composition variety; expansion timing; risk/aggression. | **[SOURCE]** OpenRA's shipped RA bot archetypes expose distinct `SquadSize`, `RushInterval`, build delays and production mixes, although they are personality archetypes—not a clean Easy/Hard ladder. [OpenRA `ai.yaml`](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/ai.yaml) **[SOURCE]** AMAI profiles expose aggression, minimum attack strength, expansion timing and persistence. | Too little inertia thrashes; too much keeps a dead plan; merely sending smaller suicidal armies can make Easy feel maliciously irrational. |
| Tactical competence | Formation/cohesion, path safety, retreat threshold, focus fire, target-class priorities, spell combinations, siege/transport execution. | **[SOURCE]** AMAI Easy does not enable hero targeting in inspected attack/focus-fire paths. **[PROPOSAL]** OpenRA's issue proposed optimal non-cheaty support-power targeting and unit-type priorities for Hard. | Perfect micro concentrated on one screen while ignoring every other front still feels superhuman unless attention is also modeled. |
| Coordination | Claim/task quality, information-sharing latency, coalition formation, assist response, reserve discipline. | **[SOURCE/DESIGNER]** AMAI's known-issues page documents allies wandering away from fights and late help responses, showing coordination can dominate apparent competence. [AMAI known issues](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm) | Perfect hive-mind coordination is an information/attention advantage; uncoordinated allies can look treacherous rather than easy. |
| Adaptation | Opponent-model fidelity; number of remembered games; counter-strategy repertoire; learning speed. | **[RESEARCH]** EISBot separates strategy selection/execution, uses expert-replay cases, and creates a discrepancy when a build-order expectation fails. [EISBot](https://cdn.aaai.org/ocs/4209/4209-17783-1-PB.pdf) | Immediate hard counters with no scouting reveal hidden information; adaptation that resets each tick lacks identity. |
| Director/mercy | Quietly choose a still-reasonable second-best action or soften dice/accuracy only while far ahead. | **[EMPIRICAL]** Wetzel and Anderson's “managed/hustling” AIs reduced their rolls when ahead; players did not distinguish their perceived difficulty from unsoftened versions in a small turn-based study. [Game AI Pro 3 chapter](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf) | Rubber-banding that reverses a deserved result, or boosts the AI after player success, is likely to feel punitive. This experiment softened *for* the player and was not an RTS. |

### A clean difficulty matrix for this map

**[INFERENCE]** Keep two UI controls:

1. **AI skill:** Apprentice / Standard / Veteran / Expert, changing only perception, attention, decision and execution profiles.
2. **Handicap:** None / disclosed resource multiplier / disclosed information assistance. Never hide these inside “Hard.”

Each skill profile should be a coherent bounded agent, not a bag of unrelated percentages:

- **Apprentice:** same fog; longer, jittered observation-to-action queues; fewer concurrent fronts; smaller strategic repertoire; noisy but persistent strength beliefs; reasonable target choices with more second-best selections; defensive spell/retreat basics retained.
- **Standard:** same fog; moderate attention and action budgets; full basic strategy set; imperfect opponent model; ordinary coordination.
- **Veteran:** faster observation and queue service; stronger route/combat evaluation; better focus fire, composition, coalition bidding, and adaptation.
- **Expert:** strongest fair code with the same visibility and rules. If this is not difficult enough, add an explicitly named handicap instead of silently turning on omniscience.

No numeric reaction delays are claimed here. Measure human command-response distributions and script performance first; any interim values must be labeled **starting estimates**, not literature constants.

### Shipped/source reality versus proposal

- **[SOURCE]** AMAI is the best exact WC3 example found of a multidimensional difficulty implementation.
- **[SHIPPED/BETA]** Total War: Warhammer III's official AI beta changes strategic threat evaluation and task priorities, including narrowing personality/difficulty effects on player threat and reducing human-target fixation. This shows that strategic target quality and bias—not only income—are live tuning surfaces. [Creative Assembly technical blog](https://community.creative-assembly.com/total-war/total-war-warhammer/blogs/69)
- **[SOURCE]** OpenRA ships configurable bot personalities with composition, building delay, squad size, scan and rush controls; its neat Easy/Normal/Hard/Brutal separation is only a proposal in issue #16126.
- **[RESEARCH]** AlphaStar proves a very strong RTS agent can operate under fog/camera and action-rate constraints. It is not a practical scripted-WC3 difficulty implementation.

## 3. Which cheats players notice and resent

### The “vision is most resented” claim is not verified

No comparative RTS experiment was found that randomizes resource, production, combat-stat, and vision cheats and ranks player resentment. Therefore “vision cheating is the most resented” remains **[UNKNOWN]**.

There is supporting design logic, but it is not a ranking:

- **[DESIGNER/RESEARCH POSITION]** Laird and van Lent call AI cheating a common complaint that can destroy the experience and use sensing a human in a dark room as their concrete example. They argue for human-like perception, reaction, and movement. [AAAI paper](https://cdn.aaai.org/AAAI/2000/AAAI00-213.pdf)
- **[DESIGNER]** AMAI's documentation itself frames Normal's reliance on visible evidence and Insane's map hacking as a difficulty distinction. [AMAI manual](https://github.com/SMUnlimited/AMAI/blob/2ab10eea16beb06d80278593c16016167e5bb7e0/Manual/Pages/KnownIssues.htm)
- **[INFERENCE]** Vision cheating is especially corrosive in an RTS when the AI's action reveals it: dodging an unseen ambush, countering unscouted production, or avoiding an unseen defended expansion. It does not merely change the result; it invalidates scouting, concealment, and feints. That causal argument is plausible but not an empirical resentment ranking.

### What the one useful perception experiment does show

Wetzel and Anderson tested 22 opponent algorithms in a symmetric turn-based, Heroes-like combat game without movement. The reported final iteration used 12 game-design students, each playing multiple games against every AI on the same day in randomized opponent order and rating fun, realism, and difficulty on five-point scales. Actual win rates ranged from 7% to 76%, while all but one perceived-difficulty average fell between 3.0 and 3.6. Eighty-three percent did not recognize a literal random-target bot. Players accused some non-cheating or player-favoring AIs of cheating; managed AIs that secretly softened while ahead were not perceived as easier than their unsoftened versions. [Full chapter](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf) **[EMPIRICAL]**

The result cautions against assuming players accurately reverse-engineer an AI. It does **not** show that hidden RTS bonuses are acceptable: the sample is tiny and specialized, the task is turn-based, there is no fog/economy/movement, exposure occurs in one day, and no cheat-type resentment manipulation is performed. It also notes that a large player community may eventually discover and publish the rules even if individual study participants do not.

Practical policy **[INFERENCE]**:

- Treat rules, stats, income, cooldowns, and fog as a player contract.
- If a handicap changes that contract, disclose its dimension and magnitude in the lobby.
- Prefer cheats whose effects are attributable and reversible (a visible “AI +20% income” handicap) over undisclosed omniscience.
- Test notice and fairness separately: a cheat can go unnoticed yet still be judged unfair once disclosed.

## 4. How much cheating is needed to match a human skill level?

### Prior art found—and the gap

- **[EMPIRICAL] AlphaStar:** played anonymously on Battle.net using the same maps and conditions, a camera interface, similar information, and action restrictions; it reached Grandmaster with all three races and ranked above 99.8% of active players. The action cap was 22 agent actions per five seconds; one agent action could contain selection, ability and target and count as up to three in-game APM actions. This is a zero-material-handicap existence proof at very high skill, not a claim about the feasibility/cost of a scripted WC3 AI. [Nature paper](https://www.nature.com/articles/s41586-019-1724-z), [DeepMind conditions](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/)
- **[EMPIRICAL] EISBot:** 250 games on the ICCup StarCraft ladder, 32% win rate, achieved 1063 points and an average score of 1027, outranking 33% of ladder players and classified D/amateur. Opponents averaged 1205 points. The authors explicitly note the bot had no action-count restriction and directly queried game state for perception, though enemy current positions were not observable in its illustrated model. This is useful human-rating methodology and a candid interface limitation, but it tests one competence profile and no handicap dose. [EISBot paper](https://cdn.aaai.org/ocs/4209/4209-17783-1-PB.pdf)
- **[MAP DOC] DotA AI+:** its author says extra gold/XP is needed because the AI is below humans and publishes chosen bonus levels. No human-skill stratification, confidence interval, or controlled dose-response is reported. [map README](https://www.hiveworkshop.com/threads/dota-allstars-v6-54b-ai-1-52-rev-02.97753/)

**[UNKNOWN]** No serious RTS study was found that holds AI code fixed, sweeps a resource/production/vision handicap, matches against rated human strata, and estimates the handicap required for 50% win probability. AlphaStar shows the answer can be zero for one extraordinarily expensive learned agent; it does not give a calibration curve for conventional game AI.

### Empirical program for this map

This is a proposed method **[INFERENCE]**, not simulated results:

1. **Freeze a competence profile.** Version every sensor, decision, action, coordination and adaptation setting. Otherwise “10% more gold” is confounded with a better build.
2. **Represent handicap as a vector:** income yield, production speed, HP/damage, and information assistance are separate axes. Do not call unlike cheats one scalar percentage.
3. **Define human strata before testing:** map-specific rating or placement set, then novice/intermediate/expert bands. Record prior map experience.
4. **Use paired scenarios:** mirror faction/side where possible; reuse map and random seeds across handicap levels; randomize condition order; balance AI faction and human faction.
5. **Use adaptive allocation:** after broad pilot brackets, spend games near the estimated 50% boundary rather than wasting most trials at 0% or 100% win probability.
6. **Fit wins, do not eyeball them.** A starting mixed logistic model is:

   `logit P(AI win) = beta0 + beta_skill × humanSkill + beta_h × handicap + beta_ch × competence × handicap + random(map) + random(faction) + random(player)`

   For one fixed competence and skill stratum, solve the fitted curve for `P=0.5`; report bootstrap/profile confidence intervals. Use splines or separate levels if the handicap response is not approximately linear. The formula is a study-design recommendation, not a published RTS constant.
7. **Report a Pareto surface:** the smallest income boost, production boost, or information aid that reaches target win rate may have different fairness costs. Never infer that 20% income equals 20% damage.
8. **Measure experience separately:** after each match ask perceived difficulty, fairness, suspected assistance and causal explanation; randomize disclosed versus undisclosed labels only with informed study consent.
9. **Validate out of sample:** new players, seeds, factions and balance version. A calibrated cheat can merely overfit the test roster.

Primary outcome: win probability by human skill and condition. Secondary outcomes: objective-control time, income, casualties, hero survival, first irreversible advantage, game duration, player rematch intent, perceived fairness, and whether the player correctly identifies the assistance dimension.

## 5. Legible, fun fallibility

Fallibility works when players can say what the AI believed, attempted, and failed to do—and can exploit it without watching it self-destruct.

### Evidence

- **[SHIPPED/DESIGNER]** Jeff Orkin's F.E.A.R. retrospective says the team treated uncommunicated AI reasoning as effectively nonexistent. Squad dialogue broadcasts mental state and intent and can explain apparent inaction—for example, an agent that recognizes danger but has no safe position. This is an FPS developer retrospective, not a controlled RTS study. [Orkin, *Combat Dialogue in F.E.A.R.*](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter02_Combat_Dialogue_in_FEAR_The_Illusion_of_Communication.pdf)
- **[EMPIRICAL]** Wetzel and Anderson found players often failed to identify strategies, believed random behavior was intelligent, and accused fair/player-favoring AIs of cheating. Fun was not meaningfully correlated with the other reported measures in their small turn-based experiment. Consistency alone is therefore not guaranteed to be perceived, and difficulty is not the same as fun. [study](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf)
- **[DESIGNER]** Soren Johnson's “Playing to Lose” talk frames strategy-game AI around player experience rather than maximizing victory. The available page links the talk/slides; it is design philosophy, not a measured prescription. [Designer Notes](https://www.designer-notes.com/playing-to-lose-the-slides/)

### Implementable patterns

**[INFERENCE]** Make mistakes come from bounded faculties:

- **Belief error:** the AI last saw an army at Rome and searches/defends plausible exits; it does not alternate randomly between London and Cairo.
- **Attention error:** a low-skill AI notices a secondary landing late because its attention queue was occupied, then responds coherently.
- **Decision error:** choose the second-best *reasonable* route/target within a bounded utility band, not an arbitrary suicide target.
- **Execution error:** imperfect focus fire or spell timing, while maintaining retreat and hero-preservation rules.
- **Commitment error:** persist a little too long in a plausible siege, but expose progress, recognize failure, retreat, and recover.

Make the reasoning visible with RTS-native cues rather than exposition:

- scouts before a counter-strategy;
- map pings or ally messages for `MUSTER`, `BREACH`, `RETREAT`, and transport requests;
- siege staging and a visible rally before the assault;
- formations that show which gate/landing is claimed;
- retreat/reform rather than units going idle after a failed route;
- a short post-event explanation in debug/replay UI (“assault abandoned: siege lost” or “defending payout at Athens”).

Errors should create **counterplay windows**: stale intelligence can be exploited by feints; attention limits by multi-front pressure; slower composition adaptation by timing attacks; imperfect coordination by interdicting a rendezvous. Preserve competence floors—pathfinding, no-progress recovery, hero preservation, basic spell legality, and not donating armies—at every difficulty. Those are reliability, not difficulty.

Avoid these patterns:

- independent per-tick coin flips for whether to act;
- hidden omniscience followed by fake mistakes;
- global idle delays that freeze every front simultaneously;
- rubber-banding that punishes the player immediately after success;
- deliberately suicidal target selection;
- changing personality and core rules so much that the same labeled difficulty has no learnable identity.

## Implement now

1. **Split difficulty from handicap in data and UI.** Add a `SkillProfile` object for perception/attention/decision/action/coordination and a separate, disclosed `HandicapProfile` for income/production/stats/information.
2. **Enforce a belief API.** Strategic code may read only visible observations plus timestamped memory. Put omniscient state behind an explicit debug or handicap interface so accidental map hacking is testable.
3. **Build one strongest fair Expert AI first.** Derive lower levels by bounded observation, attention, repertoire, and execution—not by disabling pathing/recovery or making armies suicide.
4. **Instrument the faculties.** Log observation time, belief age, decision candidates, chosen rank, command queue delay, attention ownership, route/plan failure, and any handicap read.
5. **Start a human calibration ladder.** Freeze versions, pair seeds/sides, collect map-specific ratings, and fit win probability with uncertainty. Publish the difficulty profile and any handicap in the lobby.
6. **Add legibility hooks with the architecture.** Every strategic phase and abort reason should have a player-facing ping/message option and a richer replay/debug explanation.

No numeric reaction time, attention slot count, utility-noise width, or skill breakpoint is proposed as a fact. Initial values should be explicitly labeled **starting estimates** until human telemetry calibrates them.

## Evidence limits

- The WC3 findings are exact for the named files/pages or AMAI revision; they do not estimate prevalence across the archive.
- Author map documentation may differ from triggers inside the binary. Only AMAI was inspected at source level in this pass.
- AMAI is a custom melee AI package, not a representative sample of scenario/AoS/arena maps.
- OpenRA issue #16126 is a proposal, not shipped evidence; current `ai.yaml` demonstrates exposed knobs and personalities, not the proposed four-tier system.
- The player-perception experiment has 12 game-design students in a non-RTS, turn-based task. It cannot rank resentment of RTS cheat types.
- The Laird/van Lent vision example and the AMAI manual are practitioner/research opinions about fairness, not comparative player-respect data.
- AlphaStar and EISBot benchmark competence against humans but do not estimate a cheat dose-response. AlphaStar's scale and learned architecture are not practical evidence for a WC3 script budget.
- No empirical source found here validates “vision is the most resented cheat,” a universal fair-difficulty constant, or a universal amount of cheating needed for parity.
