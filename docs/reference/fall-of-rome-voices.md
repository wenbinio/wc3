# Fall of Rome - twelve faction voices for the AI chat layer

**Question answered**: what should each of the twelve factions in *The Fall
of Rome 1.06* (ToaNoah, wc3maps 421339) sound like when
`scripts/experimental/rome-ai/for-ai.j` narrates itself, and what strings
does an implementer need?

**Date**: 2026-08-10, read against `for-ai.j` at commit `3c24de5`
(playtest 10). **Status**: spec only. Nothing here is implemented, and the
AI module was not modified - it was another agent working tree while this
was written.

**Scope**: strings and a selection rule. There is no dialogue engine here,
no state, no new decision input. Presentation only, exactly as the round-7
voice pass was (DESIGN.md 21.6): no line adds information, and every line
still goes out through `AI_Say` -> `AI_BroadcastAllies`, so the round-4
information-leak fix (DESIGN.md 11.4) is untouched.

---

## 1. Why this exists

The round-7 pass gave the AI four voices keyed on `AI_Voice(pid)`: horde
(Huns, Visigoths, Vandals, Ostrogoths), tribes (Franks, Saxons, Britons,
Burgundians), Rome (all three), Persia. Twelve speakers sharing four
scripts collide, and the owner caught the collision in one screenshot:
three factions emitted the identical string in the same second.

```
Vandals: I am not waiting all day. move, with whoever turned up
Saxons:  I am not waiting all day. move, with whoever turned up
Britons: I am not waiting all day. move, with whoever turned up
```

That reads as a system, which is the precise opposite of the point.

Note the collision domain: the map puts all nine barbarians in one force
and all three Romans in the other (`war3map.w3i` forces "Rome" = P3/P9/P10,
"Barbarians" = the rest, both `allied: true`). Because reports are
ally-scoped, a barbarian human is reading **up to nine** speakers in one
feed and a Roman human **three**. Nine speakers sharing two scripts is why
this shows up so hard on the barbarian side.

**The structural fix is per-faction pools, not a better shuffler.** If no
two factions share a string, the exact collision above becomes impossible
by construction rather than improbable. The suppression window in section 6
is then only a backstop for the small shared tier.

---

## 2. What the artifact says (decomposed before any line was written)

Extracted with `w3x-extract --recover-names` + `map-to-json`, working copy
in scratch, map not committed (gotcha 9). Everything in this section is
read off the file.

### 2.1 The names are the scoreboard names, and the w3i disagrees

The multiframe scoreboard (`udg_CPs8`, war3map.j 7706-7722) names the
twelve rows, and those names are what `AI_Name` already uses:

> Huns, Franks, Saxons, West Rome, Visgoths, Vandals, Britons, Persians,
> Ostrogoths, East Rome, North Rome, Burgundians

The `war3map.w3i` player names are **different strings** for the three
Romans: P3 is "Western Roman Empire", P9 "Eastern Roman Empire", P10
"Western Romans" - not "North Rome". The map calls P10 "North Rome" on the
scoreboard and in its own quest log, and "Western Romans" in the w3i. Use
the scoreboard set; `AI_Name` already does. (The scoreboard also misspells
the Visigoths as "Visgoths", and the map repeats that spelling in its
alliance upgrade text. Our lines never print a faction name, so this only
matters if someone adds one.)

### 2.2 The map ships a per-faction brief, and it differentiates the Romans

All twelve factions have a quest entry (`Trig_Quests_Actions`). These are
the strongest voice evidence in the file because they are the author
speaking about each faction in his own register. Condensed:

| faction | the map says |
|---|---|
| Huns | "extremely mobile, only utilizing cavalry units. Atilla is also a powerful hero. Use your superior cavalry to outflank and outmaneuver"; "Burn and pillage their lands as you seek to establish your own kingdom" |
| Franks | "a powerful faction of barbarians who hail from the north of Gaul" |
| Saxons | "You control the Saxons in the north of Gaul." Nothing else. The thinnest brief in the map |
| West Rome | "vast, but is beset by many enemies on all sides. You will have to chose which areas to defend, as you will be unable to defend them all... you will find yourself lacking in available supply as your empire dwindles" |
| Visigoths | "a proud faction of vicious warriors hailing from Western Gaul" |
| Vandals | "start in North Africa. Both the fertile plans of Africa and the rugged hills of Spain are wide open to you. A strong navy will be important" |
| Britons | "the furthest northern corner of the Empire, Britannia. While there is weak Roman resitance there, the opportunities for expansion are limited" |
| Persians | "the easternmost reaches of the Empire. The Eastern Roman Empire is vast, but most of it lies empty. Strike quickly and take as much as you can before your enemies can react" |
| Ostrogoths | "north of the Danube River, located in the just north of the center of the Roman Empire" |
| East Rome | "Consolidate your defenses and protect Constantinople while you try to defend the rest of the empire from assault", and not to let itself be cut off from the West |
| North Rome | "protect Rome... **You have no capital city and instead must buy as much time as you can for your allies**" |
| Burgundians | "a hardy group of barbarians just north of Gaul" |

The Roman split, which the brief asked for, is **given by the artifact**
and does not have to be invented: West Rome triages and is running out of
supply, East Rome consolidates around a capital and fears being cut off,
and North Rome **has no capital at all** and exists to sell time.

### 2.3 Measured starting holdings (counted from units.json)

| player | camp | capital | cities | towns | control pts | shipyards |
|---|---|---|---|---|---|---|
| 0 Huns | 1 | - | - | - | 3 | - |
| 1 Franks | 1 | - | - | - | 3 | - |
| 2 Saxons | 1 | - | - | - | 2 | - |
| 3 West Rome | - | 1 (Rome) | 10 | 15 | 27 | 19 |
| 4 Visigoths | 1 | - | - | - | 3 | - |
| 5 Vandals | **-** | - | 1 | - | 2 | 1 |
| 6 Britons | 1 | - | - | - | **1** | - |
| 7 Persians | **-** | - | 2 | - | 2 | - |
| 8 Ostrogoths | 1 | - | - | - | 3 | - |
| 9 East Rome | - | 1 (Constantinople) | 10 | 20 | 35 | 23 |
| 10 North Rome | - | **none** | 10 | 17 | 26 | 20 |
| 11 Burgundians | 1 | - | - | - | 2 | - |

Three things fall out of the table that the prose does not say:

* **Vandals and Persians are the only barbarians with no Barbarian Camp.**
  They start with real cities. They are not camp-dwellers in this map.
* **North Rome owning no `h000` is real**, not just quest flavour.
* **Britons are the poorest faction on the board** at one control point,
  which matches "opportunities for expansion are limited" exactly.

### 2.4 Heroes: the map names them, and only two are special

Preplaced hero types with `-skin` `upro` and `unam`:

| player | type | display name | proper name | unique ability |
|---|---|---|---|---|
| 0 | H003 | **Scourge of God** | Attila | A00N Superior Tactics (+dmg, +5 armour aura) |
| 1 | H00G | Barbarian General (Frank) | Childeric I | A01N Dispair (-enemy attack) |
| 2 | H00O | Barbarian General (Saxon) | Eadwacer | A00Q, base ACsi (enemies cannot cast) |
| 4 | H00I | Barbarian General (Visigoth) | Alaric | A01C Fury (+10 flat attack) |
| 5 | H008 | Barbarian General (Vandal) | Gaiseric | A01E Rally (+200% movement) |
| 6 | H00M | Barbarian General (Briton) | Vortigern | A00P Druidic Power (+500% regen) **and A00O Camouflage** |
| 7 | H00E | **Persian General** | Bahram V | A01A Old Hatred (+50% attack speed) |
| 8 | H00H | Barbarian General (Ostrogoth) | Theodoric the Amal | A01B Willpower (+5 armour) |
| 11 | H020 | Barbarian General (Burgundian) | Gundahar | A01Z Blood Pact (links 12, spreads damage) |
| 3/9/10 | H00F | **Roman General** | Julian, Jovian, Valentinian I, Theodosius I, Arcadius, Honorius | A021 Local Support (summon 12 at a City) |

Only the Huns get a titled hero. Persia gets its own noun. Everyone else
is "Barbarian General" with a bracketed tribe. **All three Romans share one
hero type** and draw an emperor name from one six-name pool - so at the
hero level the map does not distinguish the Romans at all. The Britons are
the only faction whose hero can hide.

### 2.5 The map has its own register, and it is not uniform

* Romans **train**; barbarians and Persians **hire**. Every Roman unit
  tooltip reads "Train Roman Legionaire"; every barbarian and Persian one
  reads "Hire Barbarian Berserker", "Hire Persian Swordsman", "Hire
  Cavalry". Free vocabulary split, straight from the artifact.
* Its nouns for places are: Roman Forum (capital), Roman City, Roman Town,
  Barbarian Camp, Control Point ("Grants gold and lumber every turn"),
  Forge, Shipyard, City Gate, Bagage Train ("Grants 20 supply").
* Persia is the only faction with a full roster of its own name: Persian
  Swordsman / Spearman / Cavalry / Archer / Immortal, plus a Supply Center
  (Persian). The Huns get exactly one: Hunic Horsearcher. Every other
  barbarian unit is a generically named "Barbarian Warrior / Berserker /
  Spearman / Skirmisher / Cavalry" with a parenthetical tribe suffix, and
  DESIGN.md 10.9 already established those variants are stat-identical.

### 2.6 Rome can buy eight of the nine barbarians. Not Persia.

`R000`-`R006` and `R009` are "Alliance with the &lt;faction&gt;" researches
bought at an Alliance Center. On research the barbarian is allied to that
one Roman for 300 s, is handed +250 gold / +250 lumber, and is **unallied
from every other barbarian**. The eight buyable factions are Huns, Franks,
Saxons, Visigoths, Vandals, Britons, Ostrogoths, Burgundians.

**Persia (P7) has no alliance research.** It is the one power Rome cannot
put on a retainer. That is a real, checkable differentiator and it is used
in the Persian voice below.

(Two related oddities: the Saxon alliance announces itself as "has entered
into a temporary alliance with the **Goths**!" while allying `Player(2)`,
and the alliance window opens at 300 s and the centres are removed at
1500 s.)

### 2.7 Economy asymmetries that shape attitude

* Everyone starts at 300 gold / 300 lumber, food cap ceiling 100.
* Ceiling raised for Persia (200) and each Roman (300).
* Every 120 s turn: a normal control point pays 10/10, a home control point
  pays 50/50, and **Persia is handed a flat +50/+50 regardless of holdings**
  (`Trig_CP_Gold_Actions`).
* XP handicap is 50% for everyone; `R007` "Appoint New General" is disabled
  for every player at init (DESIGN.md 11.0 already found this).
* `R008` "Raze City" exists and is barred to the Romans.

---

## 3. Three things the artifact contradicts

Reported because the brief asked for them, and because each is the same
shape as DESIGN.md 11.0 - the map advertises a mechanism it does not run.

**(a) The advertised alternate victory conditions are not implemented.**
The Victory quest text says: "if a player has at 70 control points, a
majority, then that player wins" and "If neither of these conditions are
met, the winner is the player with the most control points". There is no
control-point count anywhere in the victory path. The only `CustomVictoryBJ`
calls are in the Rome/Constantinople checks on the 1800 s timer, exactly as
DESIGN.md 1.2 says. **DESIGN.md is right and the map lies to the player.**
A voice line must therefore never talk about winning on points, because
points cannot win.

**(b) The advertised barbarian free-for-all does not happen.** The Strategy
hint says "After 10 minutes the Barbarian players will unally, thus making
the game a free for all." There is no 600 s timer in the script - the only
registered timers are 120 s (turn), 300 s (alliance window opens), 1500 s
(alliance centres removed) and 1800 s (game end). Barbarians only ever
unally as a **side effect of one of them accepting a Roman bribe** (2.6).
So the ally-scoped chat feed keeps all nine barbarians in it for the whole
game unless somebody defects, which is the opposite of what the hint
implies and makes cross-faction de-duplication matter for 30 minutes, not
10.

**(c) The advertised barbarian reinforcement spawns do not exist.** "Every
2 minutes the Barbarian players will recieve reinforcement spawns at each
of their main camps." There is no such trigger; every `CreateNUnitsAtLoc`
in the file is a gate-state swap, an alliance centre, or the 12th unit of a
train order. Barbarian AI lines must not promise or expect free troops.

Two smaller ones: the historical picture would put the Vandals in Africa
and reachable only by sea, but DESIGN.md 11.5 already retired that from a
flood fill; and the historically Roman-federate Burgundians and Ostrogoths
get no special treatment in the file at all - both are plain buyable
barbarians with a camp and 2-3 control points.

---

## 4. The twelve character briefs

Constraint restated because it governs every line below: **register,
attitude, imagery and rhythm only.** No phonetic spelling, no dropped
articles, no broken grammar, no dialect comedy. A Hun and a Roman differ
the way a raider differs from a bureaucrat.

**Huns (P0, red).** The only faction the map bothers to title: the hero is
"Scourge of God", the only faction-specific unit on the board is the Hunic
Horsearcher, and the brief tells the player to burn and pillage and to
outflank rather than fight. So: impatient, appetite-first, allergic to
standing still, speaks in the first person singular because this is one
man with horses. Short clauses, imperative, never explains itself twice.

**Franks (P1, blue).** The map gives them "a powerful faction of barbarians
who hail from the north of Gaul" and then three sentences of "Cooperation
between Barbarian players is key". They are the cooperative default: plain,
workmanlike, uses "we" for everything, announces things so allies can plan
around them. The least ornamented barbarian, deliberately - the map made
them the baseline.

**Saxons (P2, teal).** The map wrote them one sentence and stopped, and
their hero silences people. Lean into it: the shortest lines on the board.
Two or three words where anyone else uses eight. Not curt from rudeness -
curt because saying more is not worth the breath. This is the cheapest
distinctive voice in the whole spec and it costs the fewest characters.

**West Rome (P3, purple).** The map says it plainly: vast, beset on all
sides, "you will be unable to defend them all", and losing supply as it
shrinks. This is a man doing triage against a budget he knows will not
stretch. Administrative vocabulary - priority, orders, the interior, write
it off, record it. Weary rather than pompous. He talks about choosing what
to lose, which no other faction does.

**Visigoths (P4, yellow).** "A proud faction of vicious warriors", and
Alaric with a flat +10 attack that rewards massed cheap bodies. Proud and
declarative: things are owed, taken by right, as they should be. Uses "the
host". Bristles at being raided at home. The only faction that talks about
honour, and it should never sound apologetic.

**Vandals (P5, orange).** No camp, a real city and a shipyard, Africa and
Spain "wide open to you", and Gaiseric grants +200% movement. Speed is the
whole character: everything is done before the enemy turns round, and
standing still is an embarrassment. Sea-aware without ever being made of
naval jargon. Talks about being quick more than about being strong.

**Britons (P6, green).** One control point - the poorest start on the board
- on an island the map itself calls limited, with the only hero that hides
and regenerates. Hemmed in, patient, counting the men. Faintly wry about
its own position. It is the only voice that talks about having few of
something, and it should sound like husbandry, not self-pity.

**Persians (P7, pink).** Not a barbarian in any sense the file supports: a
full roster with its own name, two cities rather than a camp, a 200 food
ceiling, a flat +50/+50 stipend every turn, and the only power Rome cannot
buy. So it speaks as a peer empire, not a raider - courtly, measured,
unhurried in tone but acquisitive in content, because the brief tells it to
"strike quickly and take as much as you can". Uses "the host". Never
whines, never boasts.

**Ostrogoths (P8, gray).** North of the Danube, Theodoric, +5 armour. The
enduring one: stolid, orderly, thinks in lines and ground held. Withdraws
without drama and says so. Where the Visigoths take a thing by right and
the Huns take it by appetite, the Ostrogoths take it and then intend to
keep standing on it.

**East Rome (P9, light blue).** The largest holdings on the board, told to
consolidate around Constantinople and not to be cut off from the West.
Methodical and solvent: rolls, administration, reassignment, the field army
as an asset to be spent carefully. Where West Rome sounds like a man
choosing what to abandon, East Rome sounds like an office that expects to
still be there tomorrow.

**North Rome (P10, dark green).** No capital, and the map tells it outright
that its job is to "buy as much time as you can for your allies". This is
the sharpest Roman voice and it is entirely artifact-given: a garrison
commander spending himself for a city he does not own. Everything is
denominated in time - hours bought, delay, holding the road. It has nothing
to lose in the victory condition and knows it, which makes it the least
precious of the three Romans and the only one that can sound almost cheerful
about being expendable.

**Burgundians (P11, brown).** "A hardy group of barbarians", and Gundahar
whose Blood Pact links exactly twelve units and spreads damage among them.
The mechanic is the character: the load is shared, nobody is left, we all
go or none of us does. Clannish and plural - "the band", "our people", "all
of us". Warm where the Visigoths are proud.

---

## 5. Line pools

### 5.1 Placeholders

Two placeholders, both already computed at every call site. The implementer
concatenates; there is no formatter.

| token | substitute | yields |
|---|---|---|
| `{kind}` | `AI_KindName(ai_ptKind[t])` | `a capital`, `a city`, `a town`, `a camp`, `a building plot`, `a shipyard`, `a control point` |
| `{owner}` | `AI_OwnerName(t)` | a colour-coded faction name, or `no one` |

`{kind}` always arrives with its article attached, so a line must not write
"a {kind}". `{owner}` may be `no one`, so a line must read correctly when
it is: "held by no one" is fine, "we take it off no one" is not.

### 5.2 Event kinds, confirmed from the code and ranked by traffic

Read off the `AI_Say` call sites in `for-ai.j`, not from the brief. There
are eighteen distinct sites. The brief listed one that does not exist -
see the note under `ALLY_HELP`.

| kind | call site | fires | tier |
|---|---|---|---|
| `OBJ_POINT` | EXPAND branch, on target change | **very often** | A |
| `ABORT_HOME` | `AI_MissionAbort` reason 1 | **often** | A |
| `ABORT_LOST` | reason 2 | **often** | A |
| `ABORT_TAKEN` | reason 3 | **often** | A |
| `ABORT_STALL` | reason 4 | **often** | A |
| `TAKEN` | micro tick, objective achieved | often | A |
| `TIMEOUT` | muster deadline released | often | A |
| `FORMED` | muster complete | often | A |
| `OBJ_CAPITAL` | SIEGE branch, on target change | sometimes | A |
| `RAID` | `AI_Raid` dispatch | sometimes | A |
| `FALLBACK` | idle floor, nearest contestable | sometimes | B |
| `REGROUP` | scattered-field edge | rare (edge-fired since 21.4) | B |
| `GATE` | stall backstop force-open | rare | B |
| `HERO_OUT` | hero withdraw | rare | B |
| `HERO_FOCUS` | enemy hero in leash | rare | B |
| `NAVAL_NEED` | objective across water | rare | B |
| `NAVAL_BOARD` | boarding | rare | B |
| `NAVAL_ASHORE` | unloaded | rare | B |
| `NAVAL_CANCEL` | crossing stood down | rare | B |
| `ALLY_HELP` | **no call site exists** | never | B |
| goal / posture names | `AI_GoalName`, `AI_PostureName` | on edge, dwell-gated | C |

**`ALLY_HELP` is not wired.** The brief listed "asking an ally for help" as
something the AI already narrates; it does not. There is no such site,
`AI_Say` is never called with a request, and the ally ledger shares intent
by claiming targets silently (DESIGN.md 10.7). Pools are given below so the
strings exist if someone adds the site, but **nothing should be wired to
them as part of a text change** - a new speaking event is a behaviour
change and belongs with whatever makes the AI actually ask.

**Tier A pools are per faction: twelve pools, three lines each.** These are
the lines a player reads over and over, and they are where the reported
collision happened.

**Tier B pools are per house: six houses, three lines each.** A line that
fires once or twice a game does not repay twelve variants, and the honest
tradeoff is worth stating rather than hiding. The six houses keep the
existing `AI_Voice` grouping for barbarians and **split Rome three ways**,
so the constraint that West, East and North Rome must not be interchangeable
holds at every tier:

| house | members |
|---|---|
| `H_HORDE` | Huns, Visigoths, Vandals, Ostrogoths |
| `H_TRIBES` | Franks, Saxons, Britons, Burgundians |
| `H_PERSIA` | Persians |
| `H_WEST` | West Rome |
| `H_EAST` | East Rome |
| `H_NORTH` | North Rome |

**Tier C is one line per house per state**, not three. A goal or posture
announcement is a state name on an edge, already gated by the 9 s dwell and
`AI_SAY_GAP`; three synonyms for "we are consolidating now" is noise rather
than variety. This is a deliberate deviation from "three per kind" and the
reason is that these fire on transitions a player can see anyway.

### 5.3 Tier A - per faction

#### P0 Huns

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `next is {kind}. taking it from {owner}` | `we ride on {kind}. it is held by {owner}` | `I want {kind}. it belongs to {owner}` |
| OBJ_CAPITAL | `the great city, then. it is held by {owner}` | `I want the capital of {owner}` | `we ride on the capital of {owner}` |
| TAKEN | `{kind} is mine now` | `{kind} taken. do not slow down` | `{kind} is ours. next` |
| ABORT_HOME | `home is burning. turn around` | `someone is in my camp. back` | `leave it. my own ground first` |
| ABORT_LOST | `this one is lost. ride out` | `no more of my men here. out` | `let it go. we bled enough` |
| ABORT_TAKEN | `someone else took it. fine` | `beaten to it. find me another` | `taken already. not by me` |
| ABORT_STALL | `this is going nowhere. off` | `we are wasting the day here` | `enough of this. we ride elsewhere` |
| FORMED | `everyone is here. go` | `that is the lot. move` | `good. now we ride` |
| TIMEOUT | `I am done waiting. the rest can catch up` | `no more standing about. go` | `we ride now, with who we have` |
| RAID | `burning {kind} while they look the other way` | `we take {kind} behind their backs` | `riders are on {kind}. no one has noticed` |

#### P1 Franks

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `we take {kind} next. held by {owner}` | `marking {kind} for us. it is {owner}` | `{kind} then. it belongs to {owner}` |
| OBJ_CAPITAL | `we go for the capital of {owner}` | `the capital next. it is held by {owner}` | `all of us on the capital of {owner}` |
| TAKEN | `{kind} is ours. mark it` | `{kind} taken. on to the next` | `that is {kind} done` |
| ABORT_HOME | `home first. we turn back` | `our own people need us. back` | `leave it. there is trouble at home` |
| ABORT_LOST | `this one is lost. pull out` | `no sense dying here. out` | `we cannot hold this. leave` |
| ABORT_TAKEN | `an ally has it. good enough` | `already taken. we look elsewhere` | `someone got there first. fine` |
| ABORT_STALL | `this is going nowhere. calling it off` | `we are stuck. try somewhere else` | `no progress here. we move on` |
| FORMED | `all here. move out` | `we are gathered. go` | `that will do. forward` |
| TIMEOUT | `long enough. we go as we are` | `stragglers can follow. moving` | `no more waiting. out we go` |
| RAID | `we take {kind} while they are busy` | `horsemen are on {kind} already` | `{kind} is undefended. taking it` |

#### P2 Saxons

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `{kind}. we go. held by {owner}` | `{kind} next. from {owner}` | `{kind}. take it off {owner}` |
| OBJ_CAPITAL | `the capital. from {owner}` | `we go. capital of {owner}` | `capital next. it is {owner}` |
| TAKEN | `{kind} taken` | `{kind} ours` | `{kind}. done` |
| ABORT_HOME | `home. back now` | `trouble at home. we turn` | `our camp first. back` |
| ABORT_LOST | `lost. out` | `no. we leave` | `done here. out` |
| ABORT_TAKEN | `taken. someone else` | `not ours. find another` | `beaten to it` |
| ABORT_STALL | `nothing doing. off` | `stuck. we go` | `no. elsewhere` |
| FORMED | `all here. move` | `ready. go` | `formed. out` |
| TIMEOUT | `waited enough. go` | `no more. move` | `we go. now` |
| RAID | `{kind}. while they look away` | `horse on {kind}. quietly` | `taking {kind}. unwatched` |

#### P3 West Rome

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `the field army moves on {kind}. held by {owner}` | `orders are for {kind}. it belongs to {owner}` | `{kind} is the priority. held by {owner}` |
| OBJ_CAPITAL | `the field army marches on the capital of {owner}` | `we take back the capital of {owner}` | `the capital, then. it is held by {owner}` |
| TAKEN | `{kind} is back under Roman order` | `{kind} recovered. record it` | `that is {kind} restored` |
| ABORT_HOME | `we are needed at home. turn about` | `the province is threatened. back` | `leave it. we cannot lose the interior` |
| ABORT_LOST | `this position is lost. withdraw` | `we cannot hold it. pull them out` | `write it off. save the men` |
| ABORT_TAKEN | `another hand has it. very well` | `taken already. we turn elsewhere` | `it is done without us. good` |
| ABORT_STALL | `this is achieving nothing. break off` | `we are spending men for no ground` | `call it off. there is better work` |
| FORMED | `the column is formed. advance` | `ranks are made. we march` | `assembled. forward` |
| TIMEOUT | `we will wait no longer. advance as we are` | `the hour is past. march with those here` | `enough delay. forward` |
| RAID | `cavalry are detached against {kind}` | `we strike {kind} while they are engaged` | `a squadron takes {kind} behind them` |

#### P4 Visigoths

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `{kind} is owed to us. it is held by {owner}` | `we go to {kind}. it is held by {owner}` | `{kind} will be ours. taken from {owner}` |
| OBJ_CAPITAL | `the capital is owed to us. held by {owner}` | `we march on the capital of {owner}` | `the great prize, then. held by {owner}` |
| TAKEN | `{kind} is ours by right` | `{kind} taken. as it should be` | `that is {kind} in our hands` |
| ABORT_HOME | `our own land is touched. back` | `home is threatened. we return` | `leave it. no one raids us` |
| ABORT_LOST | `there is no honour here. out` | `this is lost. we go` | `enough. we do not die for this` |
| ABORT_TAKEN | `another has taken it. so be it` | `the prize is gone. find another` | `taken. we were not needed` |
| ABORT_STALL | `this achieves nothing. away` | `we gain no ground. break off` | `call it off. there is better` |
| FORMED | `the host is gathered. we go` | `all are come. forward` | `we are ready. onward` |
| TIMEOUT | `we have waited long enough. we go` | `no more delay. those here will do` | `we move, ready or not` |
| RAID | `we take {kind} while their backs are turned` | `riders on {kind}. easy work` | `{kind} is theirs no longer` |

#### P5 Vandals

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `we move quickly on {kind}. held by {owner}` | `{kind} is open. it belongs to {owner}` | `take {kind} before they look. it is {owner}` |
| OBJ_CAPITAL | `the capital, and quickly. held by {owner}` | `we move on the capital of {owner}` | `the capital is open. it is held by {owner}` |
| TAKEN | `{kind} taken. we were quick` | `{kind} is ours. do not settle in` | `that is {kind}. keep moving` |
| ABORT_HOME | `home is exposed. we turn back` | `our coast is threatened. back` | `leave it. the port comes first` |
| ABORT_LOST | `this is lost. move before we are` | `no ground is worth this. out` | `we leave. quickly` |
| ABORT_TAKEN | `someone was faster. rare` | `already gone. find another` | `taken. we lose nothing` |
| ABORT_STALL | `we are stuck. that is not our way` | `no ground here. away` | `calling it off. speed elsewhere` |
| FORMED | `all up. we move` | `gathered. quickly now` | `ready. go before they are` |
| TIMEOUT | `no more waiting. we go light` | `the rest can follow. moving` | `we go now. speed is the point` |
| RAID | `we are already on {kind}` | `riders take {kind} before they turn` | `{kind} falls while they look elsewhere` |

#### P6 Britons

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `{kind} it is. not much choice. held by {owner}` | `we try for {kind}. it belongs to {owner}` | `{kind} is within reach. held by {owner}` |
| OBJ_CAPITAL | `the capital, if we can reach it. held by {owner}` | `we try for the capital of {owner}` | `the great city, then. held by {owner}` |
| TAKEN | `{kind} taken. that is rare enough` | `{kind} is ours. we keep it` | `that is {kind} won` |
| ABORT_HOME | `home needs us. we have little to spare` | `back. we cannot lose what we hold` | `leave it. our own ground first` |
| ABORT_LOST | `this is lost. we cannot spend men so` | `out. we have too few for this` | `let it go. we keep the rest` |
| ABORT_TAKEN | `someone else has it. fewer of ours die` | `already taken. just as well` | `gone. we look nearer home` |
| ABORT_STALL | `this is going nowhere. back to it later` | `no ground gained. we stop` | `calling it off. no sense in it` |
| FORMED | `everyone we have is here. go` | `that is all of us. move` | `gathered. such as we are` |
| TIMEOUT | `we go with what came. it is enough` | `no more waiting. we are few anyway` | `off we go. the rest can follow` |
| RAID | `horse are on {kind}. quietly` | `we take {kind} while no one watches` | `{kind} is unwatched. taking it` |

#### P7 Persians

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `we will have {kind}. it is held by {owner}` | `{kind} is marked. it belongs to {owner}` | `the host turns to {kind}. held by {owner}` |
| OBJ_CAPITAL | `the capital will be ours. held by {owner}` | `the host marches on the capital of {owner}` | `we turn to the capital of {owner}` |
| TAKEN | `{kind} is added to us` | `{kind} taken. quickly, as intended` | `that is {kind}. ours` |
| ABORT_HOME | `our own cities call. we return` | `back. the east is not to be left` | `leave it. home has the first claim` |
| ABORT_LOST | `this is lost. withdraw in order` | `we spend no more here. out` | `let it go. there is no profit` |
| ABORT_TAKEN | `another has taken it. no matter` | `it is done. we choose again` | `taken already. we lose nothing` |
| ABORT_STALL | `nothing is gained here. break off` | `we make no ground. enough` | `call it off. we go elsewhere` |
| FORMED | `the host is gathered. we ride` | `all are come. let us go` | `the host is ready. onward` |
| TIMEOUT | `we have waited long enough. we ride` | `no more delay. those here suffice` | `we go, ready or not` |
| RAID | `horse are sent against {kind}` | `we take {kind} while they attend elsewhere` | `{kind} falls to the riders` |

#### P8 Ostrogoths

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `we take {kind} and stand on it. held by {owner}` | `{kind} will do. held by {owner}` | `we set ourselves at {kind}. held by {owner}` |
| OBJ_CAPITAL | `we set ourselves at the capital of {owner}` | `the capital, then. held by {owner}` | `the capital of {owner}. we go` |
| TAKEN | `{kind} taken. it will hold` | `{kind} is ours. we stay on it` | `that is {kind} secured` |
| ABORT_HOME | `home is struck. we go back` | `our ground is threatened. back` | `leave it. we defend our own` |
| ABORT_LOST | `this cannot be held. out` | `we withdraw. no shame in it` | `lost. we go back in order` |
| ABORT_TAKEN | `another has it. good` | `taken before us. we pick again` | `done without us. no matter` |
| ABORT_STALL | `we gain nothing standing here` | `no ground. we break off` | `call it off. elsewhere then` |
| FORMED | `the line is formed. advance` | `all here. we move together` | `ready. forward, steady` |
| TIMEOUT | `long enough. we advance as we stand` | `no more waiting. the line moves` | `we go now. the rest will find us` |
| RAID | `riders take {kind} while they look away` | `we take {kind} unopposed` | `{kind} is lightly held. taking it` |

#### P9 East Rome

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `the army is directed at {kind}. held by {owner}` | `{kind} is assigned to us. held by {owner}` | `we move on {kind}. it belongs to {owner}` |
| OBJ_CAPITAL | `the army is directed at the capital of {owner}` | `we recover the capital of {owner}` | `we proceed to the capital of {owner}` |
| TAKEN | `{kind} is under our administration` | `{kind} recovered. enter it in the rolls` | `that is {kind} accounted for` |
| ABORT_HOME | `the interior is threatened. we return` | `back. Constantinople comes first` | `leave it. we will not be cut off` |
| ABORT_LOST | `the position is untenable. withdraw` | `we will not spend the army here` | `write it off. keep the field army` |
| ABORT_TAKEN | `it is in friendly hands. very well` | `already taken. we reassign` | `done without us. good` |
| ABORT_STALL | `no ground for the cost. break off` | `this is unprofitable. we withdraw` | `call it off. reassign the army` |
| FORMED | `the army is assembled. march` | `ranks made. proceed` | `the column stands ready. advance` |
| TIMEOUT | `we march with those assembled` | `the hour is past. advance` | `no further delay. proceed` |
| RAID | `cavalry are sent against {kind}` | `we take {kind} while their eyes are elsewhere` | `a detachment takes {kind}` |

#### P10 North Rome

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `we buy time at {kind}. held by {owner}` | `{kind} will cost them a while. held by {owner}` | `we go to {kind}. it belongs to {owner}` |
| OBJ_CAPITAL | `the capital. it buys the most time. held by {owner}` | `we spend ourselves at the capital of {owner}` | `the capital of {owner}, while we still can` |
| TAKEN | `{kind} taken. that is time bought` | `{kind} is ours for now` | `that is {kind} held a while longer` |
| ABORT_HOME | `our own line is thin. we go back` | `back. we hold the road or no one does` | `leave it. the allies need the line` |
| ABORT_LOST | `this is lost. spend the men better` | `out. we are worth more elsewhere` | `let it go. we have no city to lose` |
| ABORT_TAKEN | `another has it. that suits us` | `taken. our time is better spent` | `done. we were only the delay` |
| ABORT_STALL | `we buy nothing here. break off` | `no time gained. call it off` | `this delays no one. we move` |
| FORMED | `the column is formed. march` | `we are assembled. move` | `ready. we go while we can` |
| TIMEOUT | `we cannot wait. march as we stand` | `time is what we sell. moving` | `no more delay. advance` |
| RAID | `horse are on {kind} while we still can` | `we take {kind} to stretch them` | `{kind} taken. it buys an hour` |

#### P11 Burgundians

| kind | 0 | 1 | 2 |
|---|---|---|---|
| OBJ_POINT | `we all go to {kind}. held by {owner}` | `{kind} next. it belongs to {owner}` | `the band moves on {kind}. held by {owner}` |
| OBJ_CAPITAL | `all of us to the capital of {owner}` | `the band goes for the capital of {owner}` | `the capital of {owner}. together` |
| TAKEN | `{kind} taken. together, as always` | `{kind} is ours` | `that is {kind}. no one fell alone` |
| ABORT_HOME | `home calls. we all go back` | `our people are threatened. back` | `leave it. we do not leave them` |
| ABORT_LOST | `this is lost. we go together` | `out. we lose no more of ours` | `let it go. the band comes first` |
| ABORT_TAKEN | `another has it. we share the gain` | `taken. no loss to us` | `already done. we look elsewhere` |
| ABORT_STALL | `we gain nothing. all of us, off` | `no ground here. calling it off` | `this is going nowhere. we move` |
| FORMED | `all of us here. move` | `the band is whole. go` | `no one left behind. forward` |
| TIMEOUT | `we go together, with who came` | `no more waiting. the band moves` | `off we go. the rest will find us` |
| RAID | `riders are on {kind}` | `we take {kind} while they look elsewhere` | `{kind} is ours quietly` |

### 5.4 Tier B - per house

#### H_HORDE (Huns, Visigoths, Vandals, Ostrogoths)

| kind | 0 | 1 | 2 |
|---|---|---|---|
| FALLBACK | `nothing worth much here. I take the nearest` | `no great prize about. the nearest will do` | `thin pickings. we take what is close` |
| REGROUP | `my lot are scattered. pulling them in` | `we are strung out. gather up` | `too spread out. form up` |
| GATE | `we are getting nowhere. open that gate` | `the gate. open it and be done` | `no more of this. get the gate open` |
| HERO_OUT | `get him out. I cannot buy another` | `pull him back before he falls` | `he is done. bring him home` |
| HERO_FOCUS | `kill their champion first` | `their leader. him first` | `take the big one down` |
| NAVAL_NEED | `that is over water. we need a boat` | `no walking there. find a ship` | `water in the way. a boat then` |
| NAVAL_BOARD | `everyone on the boat` | `aboard, all of you` | `get on. we cross` |
| NAVAL_ASHORE | `ashore. that was the hard part` | `we are across. off the boat` | `land. now we ride` |
| NAVAL_CANCEL | `crossing is off. bring the boat back` | `no crossing. turn it around` | `forget the water. back` |
| ALLY_HELP | `I could use a hand here` | `come in on my side of this` | `send what you can spare` |

#### H_TRIBES (Franks, Saxons, Britons, Burgundians)

| kind | 0 | 1 | 2 |
|---|---|---|---|
| FALLBACK | `nothing here is worth much. we take the nearest` | `no better target. the closest will do` | `we take what is near and move on` |
| REGROUP | `we are spread out. pulling in` | `the men are scattered. gathering` | `too far apart. form up` |
| GATE | `we are stuck. open that gate` | `get the gate open` | `the gate first. open it` |
| HERO_OUT | `get him out. we cannot replace him` | `pull him out now` | `he is hurt. bring him back` |
| HERO_FOCUS | `their leader first` | `put their champion down` | `the leader. take him` |
| NAVAL_NEED | `that is across water. we need a boat` | `we cannot walk there. a ship then` | `water in the way. find a boat` |
| NAVAL_BOARD | `everyone aboard` | `on the boat, all of you` | `get on. we are crossing` |
| NAVAL_ASHORE | `ashore. the worst is behind us` | `we are across` | `land under us again. move` |
| NAVAL_CANCEL | `no crossing after all. bring the boat back` | `no crossing now. turn back` | `forget it. back to land` |
| ALLY_HELP | `we could use help here` | `a hand here if you have one` | `send men if you can` |

#### H_PERSIA (Persians)

| kind | 0 | 1 | 2 |
|---|---|---|---|
| FALLBACK | `nothing of worth here. we take the nearest` | `no prize about. the closest will serve` | `we take what is near and go on` |
| REGROUP | `the host is scattered. gathering it` | `we are strung out. close up` | `too far apart. form the host` |
| GATE | `we make no ground. open that gate` | `the gate. have it opened` | `open the gate and be done` |
| HERO_OUT | `bring him out. he cannot be replaced` | `withdraw him at once` | `he is spent. bring him home` |
| HERO_FOCUS | `their champion first` | `kill their leader first` | `the leader. before anything else` |
| NAVAL_NEED | `that lies over water. we need a ship` | `no road there. a ship then` | `water in the way. find a ship` |
| NAVAL_BOARD | `every man aboard` | `the host embarks` | `on the ship. we cross` |
| NAVAL_ASHORE | `ashore. the hard part is done` | `we are across. close up` | `land. onward` |
| NAVAL_CANCEL | `the crossing is off. recall the ship` | `no crossing. bring it back` | `the water is not worth it. back` |
| ALLY_HELP | `your help would be welcome here` | `send such men as you can spare` | `we would take assistance` |

#### H_WEST (West Rome)

| kind | 0 | 1 | 2 |
|---|---|---|---|
| FALLBACK | `nothing of value here. take the nearest` | `no priority stands out. the nearest then` | `we take what is close and move on` |
| REGROUP | `the army is scattered. re-forming` | `the ranks are broken up. gathering` | `too dispersed. form up` |
| GATE | `we make no progress. open that gate` | `the gate is to be opened` | `open the gate. we are wasting time` |
| HERO_OUT | `get the general out. he cannot be replaced` | `withdraw the general at once` | `the general is spent. bring him back` |
| HERO_FOCUS | `their commander first` | `bring their champion down first` | `the leader. deal with him first` |
| NAVAL_NEED | `that is across water. we require a ship` | `no land route. arrange a ship` | `water in the way. we need shipping` |
| NAVAL_BOARD | `the army embarks` | `aboard the ships, all of you` | `on the ships. we cross` |
| NAVAL_ASHORE | `ashore. the difficult part is done` | `we are across. re-form and proceed` | `landed. proceed` |
| NAVAL_CANCEL | `the crossing is cancelled. recall the ship` | `no crossing. the ship returns` | `abandon the crossing. return` |
| ALLY_HELP | `we need support here` | `we need men here, if any can be spared` | `assistance here would be welcome` |

#### H_EAST (East Rome)

| kind | 0 | 1 | 2 |
|---|---|---|---|
| FALLBACK | `nothing of value stands out. take the nearest` | `no priority here. the closest will do` | `we take the nearest and reassign later` |
| REGROUP | `the army is dispersed. re-forming` | `the column has come apart. gathering` | `too scattered. close ranks` |
| GATE | `we are making no progress. open that gate` | `have the gate opened` | `the gate. open it and proceed` |
| HERO_OUT | `withdraw the general. he is not replaceable` | `get the general out now` | `the general is spent. recall him` |
| HERO_FOCUS | `their commander before the rest` | `the champion. him first` | `their leader is to be killed first` |
| NAVAL_NEED | `that lies over water. arrange a crossing` | `there is no road to it. a ship` | `water in the way. we will need shipping` |
| NAVAL_BOARD | `aboard. we cross` | `the column embarks` | `on the ships. cross` |
| NAVAL_ASHORE | `ashore. the crossing is done` | `we are landed. form up` | `across. proceed` |
| NAVAL_CANCEL | `the crossing is abandoned. recall the ship` | `no crossing. return the ship` | `stand down the crossing` |
| ALLY_HELP | `support would be welcome here` | `send whatever can be spared` | `we ask for men here` |

#### H_NORTH (North Rome)

| kind | 0 | 1 | 2 |
|---|---|---|---|
| FALLBACK | `nothing worth the time. take the nearest` | `no prize here. the closest buys as much` | `we take what is near. it costs them the same` |
| REGROUP | `the column is coming apart. gathering` | `we are too scattered to hold. form up` | `pulling them back together` |
| GATE | `we are held up. open that gate` | `open the gate. every minute counts` | `the gate. open it now` |
| HERO_OUT | `get the general out. we have little else` | `withdraw him. we cannot replace him` | `the general is spent. pull him back` |
| HERO_FOCUS | `kill their leader. it buys time` | `the champion first. it slows them` | `take their leader down` |
| NAVAL_NEED | `that is over water. we need shipping` | `no road there. find a ship` | `water in the way. a ship then` |
| NAVAL_BOARD | `aboard. we are crossing` | `on the ships` | `embark. quickly` |
| NAVAL_ASHORE | `ashore. now we hold something` | `landed. dig in` | `across. we hold here` |
| NAVAL_CANCEL | `the crossing is off. we need the ship elsewhere` | `no crossing. bring them back` | `stand down. no crossing` |
| ALLY_HELP | `we cannot hold this alone` | `send men. we are buying time here` | `help here, if you have any` |

### 5.5 Tier C - goal and posture names, one per house

Replaces the four-way branch in `AI_GoalName` and `AI_PostureName`.

| state | H_HORDE | H_TRIBES | H_PERSIA | H_WEST | H_EAST | H_NORTH |
|---|---|---|---|---|---|---|
| GOAL_CONSOLIDATE | `waiting. I hate waiting` | `building up a bit first` | `patience. the host grows` | `we cannot hold everything. choosing` | `we consolidate what is ours` | `we have no capital. we have time to sell` |
| GOAL_EXPAND | `right. who is next` | `time to take something` | `there is land to be had. I intend to have it` | `we recover what we can` | `the borders will be extended` | `every hour we take is an hour they lose` |
| GOAL_DEFEND | `someone is at my door and they will regret it` | `trouble at home. dealing with it` | `my house is threatened. that will be answered` | `we hold. as we always have` | `Constantinople will not be uncovered` | `we hold the road. that is the job` |
| GOAL_SIEGE | `enough raiding. I want a capital` | `going for a capital` | `the time is right. a capital, then` | `the legions march on a capital` | `the army moves against a capital` | `if we take a capital, we end it` |
| GOAL_TECH | `sharpening things` | `upgrading the men` | `better steel first, then war` | `the armouries are at work` | `the armouries are set to work` | `better arms. we will need them` |
| GOAL_RETREAT | `not today. back, all of you` | `falling back` | `we withdraw. there is no shame in it` | `a withdrawal. it is not a rout` | `we withdraw in order` | `we fall back and keep the line` |
| POSTURE_PUSH | `no more scraps. a throne` | `thinking about a capital now` | `a capital is within our reach` | `we set ourselves against a capital` | `we commit against a capital` | `a capital, then. it is the only way out` |
| POSTURE_HARASS | `I will bleed them at the edges` | `working the edges` | `we will trouble their edges` | `their flanks are soft. we will use that` | `we will work their flanks` | `we stretch them. it costs them hours` |
| POSTURE_CONSOLIDATE | `fine. we wait and we grow` | `tightening up` | `we gather strength first` | `we set our house in order` | `we close ranks and hold` | `we tighten the line` |
| POSTURE_EXPAND | `more land. always more land` | `looking outward` | `outward, and quickly` | `outward, then` | `we extend, carefully` | `forward while we still can` |

---

## 6. Selection and de-duplication

### 6.1 Picking within a pool

Do **not** draw from `AI_Rand`. That is the map-owned Park-Miller stream
and spending it on cosmetic text forks every downstream decision (gotcha
29/30). `AI_VLine` already avoids it with a time-derived index and says so
in a comment - keep that decision. The recommendation here is only to swap
the index for a per-faction sequence counter, which is cheaper, fully
deterministic and guarantees no immediate repeat:

```
globals
    integer array ai_vSeq            // one per player, init 0
endglobals

function AI_VPick takes integer pid, integer kind returns integer
    set ai_vSeq[pid] = ai_vSeq[pid] + 1
    return ModuloInteger(ai_vSeq[pid] + kind, 3)
endfunction
```

`+ kind` decorrelates two different events fired back to back by the same
faction. The counter advances on every voiced line, so a faction that says
three things in a row walks its pools instead of sitting on index 0.

If a stateless form is preferred, use
`ModuloInteger(pid*5 + kind*7 + R2I(ai_now/11.0), 3)`. Both `5` and `7` are
coprime to 3, so neither term collapses; the current `pid*7` does collapse
(7 is congruent to 1 mod 3, so it only distinguishes `pid` mod 3, and
players 0, 3, 6 and 9 always share an index).

### 6.2 Suppressing a repeat across factions

Tier A makes exact cross-faction collision impossible: no string appears in
two factions. Tier B pools are shared inside a house, so the horde and
tribes houses can still collide four ways. One ring buffer covers it:

```
globals
    constant integer AI_ECHO_N    = 8
    constant real    AI_ECHO_T    = 6.0
    string  array    ai_echoMsg
    real    array    ai_echoAt
    integer          ai_echoHead   = 0
endglobals
```

On every line, before broadcasting:

1. Scan the ring. If the identical string is present with
   `ai_now - ai_echoAt[i] < AI_ECHO_T`, advance the pool index by one and
   take the next variant.
2. Re-check once. If the second variant also collides, **drop the line
   entirely** and do not stamp `ai_sayLast`/`ai_sayAt`. Silence is a valid
   outcome; the existing `AI_SAY_GAP` of 8 s already means the module is
   quiet most of the time, and a dropped rare line costs nothing.
3. Otherwise record the string and `ai_now` in the ring and broadcast.

The ring is global rather than per-player on purpose: the collision the
owner saw was between different players, so a per-player memory (which
`ai_sayLast` already is) cannot see it.

Two things to keep as they are. `AI_Say` still refuses an identical
consecutive line from the same player, and it still rate-limits to one line
per player per `AI_SAY_GAP`; the echo ring sits **in front of** both, not
instead of them. And `AI_BroadcastAllies` stays the only exit - no voice
helper may be reachable from `AI_Tel`, so the machine event stream stays
byte-exact and parseable (DESIGN.md 21.6 asserts this today, and the
assertion must keep passing).

### 6.3 Rate, honestly

Twelve speakers at up to one line per 8 s each is a theoretical 90 lines a
minute, which no amount of variety would rescue. The variety work here does
not remove the need for the existing gates; it makes the lines that do get
through read as people. If the next playtest says the chat is still too
busy, the lever is `AI_SAY_GAP` and the tier B pools, not more strings.

---

## 7. Shared vocabulary

The cheap half of the work. Twelve factions sound different mostly because
they call the same five things by different names. Every noun below is
plain English and none of it is dialect.

| faction | a city | a control point | the enemy | its own army | Rome |
|---|---|---|---|---|---|
| Huns | the town | the crossing | them | the riders | the great city |
| Franks | the town | the post | the Romans | the men | Rome |
| Saxons | the town | the ground | them | us | the capital |
| West Rome | the city | the station | the barbarians | the field army | Rome itself |
| Visigoths | the town | the ground | them | the host | Rome |
| Vandals | the port | the crossroads | them | the column | Rome |
| Britons | the town | the stone | the Romans | the levy | the great city |
| Persians | the city | the post | Rome | the host | the West |
| Ostrogoths | the town | the ford | them | the line | Rome |
| East Rome | the city | the post | the barbarians | the field army | the West |
| North Rome | the town | the post | them | the column | Rome |
| Burgundians | the town | the holding | them | the band | Rome |

Two register rules that come from the artifact rather than from taste:

* **Romans train, everyone else hires** (2.5). If a line ever mentions
  raising troops, a Roman "trains" or "raises" and a barbarian or Persian
  "hires" or "takes on".
* **First person singular is a Hun and Persian trait.** The Huns are one
  man with horses ("I want", "my camp") and Persia speaks as a person of
  rank ("I intend"). Everyone else is plural. The three Romans are
  institutionally plural even when a single general is speaking.

Note that `{kind}` already supplies the map noun ("a city", "a control
point"), so the vocabulary column is for lines that name the thing a second
time, not for overriding `AI_KindName`. Overriding `AI_KindName` per faction
is possible and would deepen the effect, but it touches a function the
telemetry path also uses, so it is deliberately left out of scope here.

---

## 8. Invariants worth asserting

Cheap structural checks, in the spirit of the source guards in `trace.py`.
All of them key on structure, never on the text of a line - DESIGN.md 21.6
recorded the lesson that a guard keyed on player-facing text fails for
cosmetic reasons, and that text is meant to change.

1. **Pool arity.** Every tier A pool has exactly 3 entries for each of the
   10 kinds and each of the 12 factions; every tier B pool has 3 for each
   of 10 kinds and 6 houses. A missing branch in a JASS if-chain returns
   the fallthrough silently, so count them.
2. **Cross-faction uniqueness in tier A.** The multiset of all 360 tier A
   strings has 360 distinct members. This is the assertion that makes the
   reported bug structurally impossible, so it is the one worth having.
3. **No ASCII apostrophe** in any line (gotcha 34 - disputed as a failure
   mode, kept because rephrasing is free and the module is injected into
   `war3map.j`). Assert the delta form as well: the module introduces no
   apostrophe inside a double-quoted literal beyond the baseline.
4. **ASCII only**, byte range 0x20-0x7E, in every line.
5. **Length.** No line body exceeds 64 characters after substitution with
   the longest `{kind}` (`a building plot`, 15) and a colour-coded
   `{owner}`. `AI_Say` prepends the coloured faction name, so the visible
   string is longer than the literal. The current
   `nothing here is worth much. I will take the nearest thing and move on`
   is 69 characters and would fail this check, which is the point of
   having it.
6. **Voice helpers stay unreachable from `AI_Tel`** and no `AI_Tel` site
   interpolates a readable name. This assertion exists today; extending the
   voice must not weaken it.
7. **No `GetLocalPlayer`** anywhere in the voice or broadcast path.

A negative control for check 2 is the cheapest one available and should be
written at the same time: copy one Hun line into the Frank table and the
uniqueness assertion must fail. A probe that cannot fire proves nothing
(gotcha 32b), and this repo has shipped five such probes.

The tables in section 5 were checked against 1 to 5 before this document
was committed - 360 distinct tier A strings, 180 distinct tier B, 60
distinct tier C, all within the length bound, all ASCII, no apostrophes -
and that checker was itself negative-controlled four ways (a duplicated
line, an over-length line, an injected apostrophe and a dropped variant all
made it fail). The checker is a throwaway that reads this markdown; it is
not committed, because the assertion that matters belongs against the JASS
tables once they exist, not against the spec.

---

## 9. What this does not do

* It does not make the AI say anything new. `ALLY_HELP` has no call site
  and wiring one is a behaviour change, not a text change.
* It does not change what any faction decides. Voices are keyed on `pid`,
  and `pid` already selects tribal preferences (DESIGN.md 10.9) - those are
  separate tables and must stay separate.
* It does not deepen `AI_KindName` per faction, which is the obvious next
  increment and is left out because that function feeds paths beyond chat.
* It cannot be validated by playing. `lib/sim` cannot execute JASS, and
  even for Lua it records orders without executing them. Everything above
  is checkable structurally and readable by a human; whether the twelve
  actually sound like twelve is a playtest question.
