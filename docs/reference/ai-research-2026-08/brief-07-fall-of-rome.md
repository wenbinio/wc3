# Brief 7 — Fall of Rome 1.06: what public evidence says about strong play

Research date: 2026-08-10  
Map: *The Fall of Rome* 1.06 by ToaNoah

## Bottom line

The public, indexable strategy record is too thin to support a genuine decomposition of expert play. I found the release pages, older-version metadata, the map Discord invite, and one tiny YouTube playthrough, but no public replay corpus, opening guide, faction guide, tier list, tournament record, or substantive strategy discussion for this map. The Hive thread has one approval comment and no player discussion.

Accordingly, none of the requested opening, naval, alliance, faction-counter, or defensive claims can be presented as established community knowledge. The two strong-player claims in the research prompt—“an early Constantinople rush loses to expansion” and “warships are worthless; only transport matters”—remain valuable hypotheses, but they are not independently verified by a public source.

The highest-value next step is therefore not more broad web search. It is to collect replays and short structured interviews from the map's Discord, then instrument future replays with event telemetry. A compact protocol appears below.

## Evidence labels

- **P — primary artifact:** map listing, version metadata, source code, replay, or direct map text.
- **C — community report:** a public player's or developer's statement, not independently measured here.
- **S — supplied claim:** information in the research brief, not independently sourced here.
- **I — inference:** a testable consequence of documented rules; not evidence that strong players actually behave that way.
- **N — negative search:** no relevant public result found after the documented searches. This does not prove that private Discord knowledge or unindexed replays do not exist.

## What is publicly established

| Claim | Evidence | Confidence |
|---|---|---|
| Version 1.06 is by ToaNoah, is a 12-player, 480×480 Reforged map, and was uploaded on 2026-01-02. | [Hive release page](https://www.hiveworkshop.com/threads/the-fall-of-rome-1-06.370125/) | P, high |
| Units are trained in groups of 12; control points award gold/lumber; heroes provide auras; Romans can temporarily ally a barbarian; barbarians must capture Rome and Constantinople before 30 minutes. | [Hive release page](https://www.hiveworkshop.com/threads/the-fall-of-rome-1-06.370125/) | P, high for the published summary |
| The Hive description says “1 of 122 factions,” while the same page says 12 players. “122” is almost certainly a typo, but the page itself does not resolve it. | [Hive release page](https://www.hiveworkshop.com/threads/the-fall-of-rome-1-06.370125/) | P for the text; I for “typo” |
| Version 1.03 says control points give gold/lumber, cities and towns give supply, expansion brings victory closer, ships can carry attacks by sea, barbarians need both capitals, and Romans win if one capital remains. | [wc3maps version 1.03](https://wc3maps.com/map/284877) | P, high for 1.03; not automatically current |
| Version 1.01c said the barbarian alliance ended at 20 minutes, and its public faction line listed Huns, Franks, Goths, West Rome, Visigoths, Vandals, Picts, Persians, Ostrogoths, and East Rome. | [wc3maps version 1.01c](https://wc3maps.com/map/260920) | P, high for 1.01c; incomplete/stale for 1.06 |
| A public Discord invite is published: `ctEhJKHVAH`; this research did not verify that it is still active. | [wc3maps version 1.03](https://wc3maps.com/map/284877) | P for publication; activity unknown |
| One indexed video titled “Warcraft III — Fall of Rome” exists, with 15 views in the search snapshot and no discoverable strategy annotation. | [YouTube result](https://www.youtube.com/watch?v=jVS5LJEiqcY) | P for existence; non-probative for strategy |
| The Hive review is only an approval note; it contains no strategic analysis. | [Hive release page](https://www.hiveworkshop.com/threads/the-fall-of-rome-1-06.370125/) | P, high |

The version history matters. Public descriptions changed at least the barbarian-alliance rule between 1.01c and 1.03. Advice from an older build must therefore be tagged with the exact version before it is used as training data or encoded into policy.

## Answers to the seven questions

### 1. Recognised openings

**No sourced answer found.** There is no public opening guide or replay set from which to distinguish strong and weak first-five-minute play. The public pages establish objectives and some rules, not build sequences, first targets, army splits, or faction-specific timings. **N**

The following are useful hypotheses, not community findings:

- **Roman triage hypothesis:** a Roman side starts with more territory than it can protect equally, so expert play should classify holdings as capital/bridgehead/income/dispensable rather than garrison every city. **I**
- **Barbarian compounding hypothesis:** early control-point and city captures can be worth more than early capital damage because they increase recurring income or supply and shorten later reinforcement routes. **I**
- **Concentration hypothesis:** a 100-food attacker should avoid distributing forces across many Roman cities, because a 300-food Roman side benefits from fragmented threats it can defeat locally. **I**

Each hypothesis needs replay or controlled-match evidence before becoming an AI rule.

### 2. Which objectives matter, including the Constantinople claim

The current public description establishes only the terminal condition: the barbarians need Rome and Constantinople before 30 minutes, while control points fund the game. It does not establish the optimal capture order. **P**

The supplied statement that rushing Constantinople loses to territorial expansion is strategically plausible: a capital assault can consume time and units without changing recurring income, supply, reinforcement distance, or the number of fronts; a sequence of control-point/city captures can improve all four before the terminal push. That is a mechanism, not verification. **S + I**

A minimal test should compare matched barbarian runs on:

- capital contact time;
- control points and cities held at minutes 5, 10, 15, and 20;
- cumulative income and usable food cap;
- army value lost at gates;
- reinforcement travel time to the active front;
- whether the first capital attack produces a capture, breach only, or no durable progress;
- final capital-control result.

Until those data exist, encode “expand before capital” as an experimental policy arm, not a universal rule.

### 3. Naval value

The older public map text says to load units into ships to attack by sea. The research prompt reports stronger in-map wording that fleets are extremely important, but that exact wording was not present on the public pages I could verify. **P + S**

The strong-player statement that naval combat is worthless but transport matters was not independently sourced. **S**

The apparent contradiction can be reconciled as a testable distinction:

- **Transport value:** bypassing a land choke, opening a second front, shortening reinforcement time, or reaching an otherwise disconnected theatre.
- **Sea-control value:** fighting warships to keep those routes open or deny the opponent's routes.

A map can make the first decisive and the second weak if transports are cheap/fast, interception is unreliable, shore objectives dominate, or replacement armies matter more than fleet preservation. **I**

Measure embarkations, successful disembarkations, cargo losses, travel-time savings, warship-versus-warship engagements, and whether a naval investment changes control of a land objective. This will answer the design question more reliably than counting ships built.

### 4. Faction strengths, unit preferences, and counters

**No public faction guide, tier list, or counter table was found.** **N**

The counter sentence in the supplied prompt—cavalry beats skirmishers and swordsmen but loses to cavalry and spearmen—contains an unresolved cavalry-versus-cavalry ambiguity. It may distinguish cavalry subtypes that the summary omitted, but no subtype can be safely inferred. **S**

Before encoding faction preferences, extract for every trainable unit:

- rawcode and displayed name;
- train batch size and total resource/food cost;
- hit points, armor type/value, attack type/damage/cooldown/range;
- speed, collision size, acquisition range, and relevant abilities;
- faction availability and upgrade dependencies;
- performance against gates, mass infantry, heroes, and transports.

Then run fixed-composition microbenchmarks and contextual tests at gates and open ground. Object-data advantage is not the same as competitive preference: travel time, batch production, choke width, hero aura, and overkill can reverse a paper counter. **I**

### 5. Temporary Roman–barbarian alliance

The mechanic exists, and old public descriptions show that alliance rules changed across versions. No public source explains competitive selection, timing, bargaining convention, betrayal pattern, or counterplay. **P + N**

Treat these as distinct hypotheses:

- Rome buys relief on its most dangerous front.
- Rome allies a geographically distant barbarian to split the barbarian coalition rather than to obtain immediate military help.
- A barbarian accepts to gain uncontested expansion, then prepares for the alliance expiry.
- The mechanic is principally kingmaking and its value depends on lobby diplomacy, which a deterministic AI cannot reproduce from geography alone.

All are **I**. Replay annotation must record who proposed/received the alliance, the game time, territorial changes during it, attacks displaced to third parties, and positions at expiry.

### 6. Defensive patterns

**No sourced competitive pattern found.** **N**

For AI experiments, replace the binary “defend/abandon” choice with a recoverable-value test:

\[
V_{defend} = P(hold)\,V_{city} + V_{enemy\ losses} - V_{friendly\ losses} - V_{opportunity\ cost}
\]

This is a design model, not a discovered player formula. **I** The important measurable terms are time until breach, friendly reinforcement time, enemy siege present, retreat path, capital/control-point role, and whether the garrison can delay without being trapped.

Candidate policies to test:

- hold capitals and unique crossings to a higher threshold than ordinary cities;
- defend a gate only when the army can arrive before expected breach;
- withdraw a hero earlier than ordinary units because death is permanent;
- leave a delay force only if it changes the opponent's objective timing;
- abandon exposed holdings when defense would destroy the field army needed to retake several objectives.

### 7. Replays, guides, streams, and forums

Found:

- [Hive 1.06 release page](https://www.hiveworkshop.com/threads/the-fall-of-rome-1-06.370125/): release metadata, rules summary, and one non-strategic approval reply.
- [wc3maps 1.03 page](https://wc3maps.com/map/284877): older rules/hints and Discord invite.
- [wc3maps 1.01c page](https://wc3maps.com/map/260920): older rules and a partial faction/color list.
- [one low-view YouTube playthrough](https://www.youtube.com/watch?v=jVS5LJEiqcY): discoverable, but no indexed analysis or transcript sufficient for reliable strategic extraction.
- [ToaNoah's YouTube channel](https://www.youtube.com/@TheToaNoah): videos for other Warcraft III maps were indexed; no indexed Fall of Rome strategy series was found.

Not found in public search:

- downloadable `.w3g` replays for this map;
- opening/build-order guides;
- faction guides or tier lists;
- tournament or league results;
- substantive Hive strategy replies;
- indexed Reddit, Russian-language, or Chinese-language strategy discussions;
- public Discord message archives.

## Map-rule-derived project hypotheses

These are engineering hypotheses derived from the published map rules and general strategic reasoning. This research pass did not source them to specific comparable games, so they should not be described as established transferable findings:

1. **Value income by remaining ticks.** The earlier a control point is captured, the more payout cycles remain. Compare this discounted income with the expected unit loss and travel delay required to take it.
2. **Value topology, not just points.** A low-income crossing can dominate a high-income cul-de-sac if it opens several subsequent targets or cuts reinforcement time.
3. **Protect force continuity.** With fixed batch training and hard food caps, preserving a mobile field army often matters more than preserving every peripheral city.
4. **Separate terminal objectives from enabling objectives.** Capitals end the game; income, supply, gates, and transport routes make the ending attack feasible.
5. **Commit until a progress test fails.** Re-score normally, but break commitment when no distance, breach damage, territory, or local force-ratio progress occurs for a bounded interval.
6. **Price siege and transport as access costs.** A target behind a closed enemy gate or across water has an additional composition, travel, and failure cost; do not compare it to an open-land target on nominal value alone.
7. **Use asymmetric loss functions.** A permanent hero death, trapped transport cargo, or destroyed field army should carry a larger penalty than loss of a replaceable peripheral garrison.

## Evidence-collection protocol

### Ask the community for artifacts, not conclusions

Post a request in the map Discord for:

- exact map version and replay file;
- player faction and self-assessed experience;
- first three intended objectives and why;
- one decision they believe won or lost the game;
- whether ships were used for transport, combat, both, or neither;
- alliance participants, start/end times, and purpose;
- any point at which a city was deliberately abandoned;
- permission to quote/anonymize the explanation.

Request losing replays as deliberately as winning ones; otherwise every observed opening will be selected on success.

### First useful sample

Do not claim a population meta from a handful of games. Use an initial convenience sample only to construct candidate policies, then test those policies prospectively. At minimum, include both Roman and barbarian perspectives, more than one faction/geographic theatre, wins and losses, and the exact 1.06 build hash.

### Replay annotation schema

| Event | Required fields |
|---|---|
| Objective chosen | time, faction, objective ID, reason code, local force estimate |
| Control change | time, city/control-point ID, old owner, new owner |
| Gate interaction | time, gate ID, open/friendly/enemy, first damage, destruction |
| Army movement | time, army ID, origin region, crossing, destination region |
| Naval movement | embark/disembark time, ports/regions, cargo value, losses |
| Alliance | time, parties, start/end, territory gained during interval |
| Hero death | time, faction, location, immediate cause |
| End state | winner, capitals, objectives by faction, surviving army value |

Brief 8 explains why ordinary `.w3g` parsing cannot recover most of these outcome events and why the map should emit them explicitly.

## Decision for the AI programme

- Do not hard-code “expert” first-five-minute openings from current public evidence; none were found.
- Preserve the two supplied player claims as named hypotheses with provenance, not facts.
- Prioritize objective sequencing, transport utility, and abandon/defend thresholds in the first replay collection because they map directly to contested AI rules.
- Version every claim. The public rule text already changed between 1.01c and 1.03, so an unversioned replay or recollection is unsafe training evidence.

## Search record and limits

Searches covered exact title/version/filename/author combinations; YouTube and replay terms; Hive, wc3maps, Reddit, and general web results; the Discord invite code; and Russian/Chinese title variants. Searches were performed on 2026-08-10. Discord content is not publicly indexed and was not accessed. Video existence was discoverable, but no reliable transcript or match metadata sufficient for strategic coding was available. The absence of public results is therefore a finding about the public web, not about the private community.
