# Last Train from Yio Chu Kang — phase 2A design walkthrough (the fun gate)

Written BEFORE the phase-2A implementation, per docs/PIPELINE.md §10: the
implementation must match this document, not the other way round. Phase 1's
playtest verdict was blunt — **"constant typing is bad, core loop is
unfun."** Four studies (design diagnosis, fun-first redesign, the Zombie
Defense Custom decomposition, the WC3 canon-invariants study) converged on
one reconciled spec; this walkthrough is that spec played out minute by
minute, then audited: interaction ledger, decision density, the
player-owned growing numbers, and the threat schedule with no safe gap
over 90 seconds.

Doctrine (CLAUDE.md gotcha 33): **chat is meta only.** Every verb at
combat tempo is a click, an ability, an item, or proximity. A chat row at
combat tempo in the ledger below would be a design FAIL.

## 1. The minute-by-minute walkthrough

### Minutes 0–3 (T+0 to T+180): wake up, choose, arm up

- **T+0.** Four survivors walk out of the void deck into the rain. A
  **countdown window** is already on screen: *"Last train: 12:00"* — the
  clock is a metronome from the first frame (ZCD's "Final Wave In..."
  pattern), not a distant deadline. The multiboard shows Train / Power
  0/3 / SURGE — / estate quiet.
- **T+0–40.** Four **class circles** glow at the void deck's south edge,
  each with a statue of the class standing on it (Heartlander, Auxiliary
  Police Officer, Paramedic, Town Council Technician). **Walk onto a
  circle → you transform.** No typing; second thoughts are free inside
  the 40s window; after 40s the circles go dark, silently (no scolding
  — the old policing announcements are cut). Anyone who never steps on a
  circle stays a Heartlander (the default keeps its semantics).
- **T+0–90.** The spawn deck is furniture-dense. **Stand near a bench for
  ~3 seconds and your survivor rummages it** — loot pops out on the
  ground, you click it up. Or **shoot/chop the bench open** (props are
  ~30 HP): instant loot, but the district's **Noise** climbs (+10 per
  smash, +1 per gunshot). Loud is fast, quiet is slow — the first real
  decision, and it's made with the mouse in the first minute (canon
  negative space: first decision under 60s).
- **Pickup = craft.** Grab Cloth then Bottled Water and they **snap into
  a Wet Bandage in your pack** — chime, floating text. Four recipes, each
  material in exactly one recipe, so a pickup is never ambiguous:
  Cloth+Water=Wet Bandage · Plank+Pipe=Parang · Bottle+Kerosene=Molotov ·
  Wire+Battery=Sentry Kit. The recipe book stays in the quest log and
  `-recipes` (reference, not a verb).
- **T+45.** One scripted dread line (a car alarm dies mid-wail). The 35s
  dread metronome is gone — dread now only speaks when it means something.
- **T+90.** First **ambient wanderers** drift between districts (1–2
  zombies, texture, not pressure; this draw locks the seed).
- **T+100. The SIREN.** Twenty seconds of warning, one dread line, a
  minimap ping: the first **surge** is coming for the survivors'
  district. Decision under pressure: stand at the void deck barricades,
  or scatter? (All of it mouse-driven: move, attack, R to reload.)
- **T+120. Surge 1 lands** — small (escalation level 1, scaled by player
  count and district Noise). Shots draw rounds; **R reloads** (4s of no
  attacks — but your legs still work: reload-while-fleeing is the
  genre's tension moment, so the old PauseUnit is gone); **E sprints**.
  Kills pay **XP** and sometimes **spill** a clip pack or a material on
  the ground — roaming and fighting both pay (ZCD's bundle economy,
  adapted).
- **T+120–180.** Loot the spill drops, auto-combine a Molotov, watch the
  first level-up land (+HP, +damage). The multiboard shows it all.

### A mid-game 60 seconds (T+340 → T+400): the loop at full tempo

- **T+340.** SIREN — surge 3 warned, targeting Cheng San, where the
  Technician is standing in a **substation yard**: repair is now
  **presence, not typing** — progress accrues every second you stand in
  the yard un-hit; a bite knocks 3 seconds off (progress persists;
  damage is a setback, not a reset). The rest of the team has 20
  seconds to decide: reinforce Cheng San, or trust the Technician's
  sprint?
- **T+345.** The Paramedic, two districts away, rummages a locker while
  the window ticks — quiet, zero Noise, worth one more draw before
  running. The Heartlander smashes a car open instead: instant Plank,
  +10 Noise — the NEXT surge here will be bigger. Same verb budget,
  opposite tempo choices.
- **T+352.** The APO pops **Riot Discipline** (level-3 signature) and
  holds the yard mouth; the Technician keeps repairing THROUGH the surge
  — every un-hit second counts, every hit costs three.
- **T+360.** Surge lands on the yard. Reload rhythm: 12 shots, R, 4
  vulnerable seconds, repeat. A Molotov burns the corpse pile before it
  stands back up (denies the rise AND the defector's Feast).
- **T+370.** Substation completes: **the district relights** — lamp
  posts flare on along the roads, the map itself is the progress bar.
  Power 2/3 on the board. +40 XP to the fixer; the Technician hits
  level 3 and unlocks **Overclock** (next repair instant).
- **T+385.** A nest reveals itself on the minimap ping of the spill: the
  team detours, Molotovs the **rat-king nest** (+XP, escalation drip
  trimmed one step) — downtime is spendable (ZCD's radiation fragments,
  adapted).
- **T+395.** Back to the Provision Shop at the void deck: clips are
  lumber, and the shop sells tools FOR clips — a Barricade Kit banked
  for the finale, at the price of two reloads. Ammo-vs-tools, every
  purchase a real trade.

### The pre-train crunch (T+580 → T+720)

- **T+580.** SIREN — the LAST cyclical surge (T+600) is the night's
  biggest; from here the **Last Mile** begins: a continuous trickle
  spawns at the map edges and drifts station-ward, and the ambient horde
  turns toward Yio Chu Kang station. The countdown window reads 2:00.
- **T+600–700.** The team fights ITS way east along the main road,
  spending the night's bank: barricades at the fare-gate forecourt,
  sentries on the flanks, Molotovs on the corpse piles. Power 3/3 or
  bust — an unpowered platform means sealed doors.
- **T+680.** SIREN — the **final oversized surge** converges on the
  forecourt.
- **T+700–720.** Hold the line at the fare gates. The Paramedic triages
  (AoE cure/heal); the defected teammate (if any) **Shrieks** the surge
  onto the platform mouth — the traitor conducts the horde at the exact
  vulnerability window.

### The boarding window (T+720 → T+900): the platform siege

- **T+720.** The train slides in; the countdown window flips to *"Doors
  close: 3:00."* The whole horde converges on the forecourt — the
  night's banked barricades and sentries ARE the chokepoint now (the
  fort as shared team artifact, ZCD's deepest lesson).
- **T+720–900.** Board = walk onto the platform. The decision is
  per-player and continuous: step over the gap now (safe, selfish), or
  hold the gate so the Paramedic can drag the infected Heartlander
  through a cure first? A defector's Feast raises every unburned corpse
  in the kill zone; their Shriek re-aims the trickle at the platform.
- **T+900.** Doors close. Boarders win; the platform lights gutter out
  on everyone else. (Or nobody made it — and the kampong walk remains.)

## 2. Interaction ledger (verb × input × uses/min × pressure)

Every gameplay verb, its input, expected uses per minute at peak, and
whether it happens under combat pressure. **Zero chat rows at combat
tempo** — chat is meta/reference only.

| Verb | Input | Uses/min (peak) | Under pressure? |
| --- | --- | --- | --- |
| Move / flee | right-click | 10–30 | yes |
| Attack | right-click / A-click | 10–20 | yes |
| Reload | **ability R** | 1–2 | yes — the panic window |
| Sprint | **ability E** | 1–3 | yes |
| Rummage | **proximity** (~3s stand) | 2–6 (downtime) | no — the quiet verb |
| Smash a prop | attack the prop | 2–6 | optional — the loud verb |
| Pick up loot / spill | click item | 2–8 | yes |
| Craft | **automatic on pickup** | 0 (free) | n/a |
| Use Molotov / Bandage / kit | item click | 1–3 | yes |
| Repair substation | **stand in yard** | continuous | yes |
| Buy at Provision Shop | click shop, click ware | 0–2 (downtime) | no |
| Class pick | **walk onto circle** | once | no (first 40s) |
| Board the train | walk onto platform | once | yes |
| Signature ability | ability hotkey | 0.5–2 | yes |
| Feast / Shriek (defector) | ability on point | 1–2 | yes |
| — meta only — | | | |
| `-seed N` | chat (pre-commit only) | once/never | no |
| `-help` `-status` `-recipes` `-credits` | chat (reference) | rare | no |
| `-test` debug family | chat (dev only) | n/a | no |

Deleted phase-1 chat verbs (all responded at combat tempo — the design
FAIL the playtest named): `-class` `-search` `-craft` `-reload` `-sprint`
`-fix` `-board`. They no longer respond at all.

## 3. Decision density per phase

Target band: a meaningful decision every 20–60s (canon invariant I5).

- **Setup (0–120s)**: class choice; rummage-vs-smash per prop (~6
  props); what to carry (4-recipe pack planning); stand or scatter at
  the first siren → **~8–10 decisions / 2 min.**
- **Mid-game (120–600s, per 60s)**: surge response (fight/kite/split),
  reload timing under contact, noise budget (smash or rummage), repair
  window (who stands, who guards), nest detour (yes/now/later), shop
  trade (clips→tool?), spill pickup routing → **4–7 decisions / min.**
- **Crunch (600–720s)**: route east now vs one more substation; spend
  banked kits where; Molotov the pile or save it → **~5 / min.**
- **Boarding (720–900s)**: board now vs hold the gate (continuous,
  per-player); cure-then-board sequencing; defense placement →
  **3–5 / min plus one standing dilemma.**
- No phase falls under one decision per 60s; no phase demands typing.

## 4. The player-owned growing numbers (canon I2 — zero-exception)

Phase 1's deepest canon violation: nothing the player owned visibly
compounded. Phase 2A's owned, legible, growing numbers:

1. **Hero level + XP** (kills, substations, nests, cures) — small stats
   each level, a signature ability at level 3.
2. **The clip bank** (lumber) — scavenged, spilled, spent at the shop.
3. **The pack → tool pipeline** — materials auto-combining into named
   tools (Parang, Molotov, Sentry Kit, Wet Bandage) that persist.
4. **Power 0/3 → 3/3** — and the estate **visibly relights** district by
   district: the map is the progress bar.
5. **Banked defenses** — barricades and sentries standing at the finale
   are score, chokepoint, and monument ("defenses standing" is a scored
   outcome).
6. **Nests burned** — each one permanently trims the horde's growth.
7. (Threat-side mirror, legible on the board: escalation level, district
   Noise, surge countdown.)

## 5. The threat schedule (no safe gap > 90s)

```
T+0    intro; countdown window running from frame one
T+45   scripted dread beat (tone-setter)
T+90   first ambient wanderers (texture; seed lock)      gap 0→90 = 90s  ✓
T+100  SIREN + dread line (surge 1 warned)               gap 10s
T+120  SURGE 1 (players' district; noise-scaled)
T+135+ wanderers every 45s between surges                max gap ≤ 45s
T+220  SIREN        T+240  SURGE 2
T+300  train PA timeline beat ("...departs Tampines...")
T+340  SIREN        T+360  SURGE 3
T+460  SIREN        T+480  SURGE 4
T+540  train PA: "the last train departs Yishun" (T-180)
T+580  SIREN        T+600  SURGE 5 (the big one) → LAST MILE:
       trickle every 20s, ambient horde drifts station-ward
T+660  train PA: one minute (T-60)
T+680  SIREN        T+700  FINAL SURGE (fare-gate forecourt)
T+720  train arrives → PLATFORM SIEGE: everything converges
       on the forecourt for the whole 180s boarding window
T+900  doors close
```

Longest quiet stretch: the opening 90 seconds (deliberate setup grace,
exactly at the limit, textured by the T+45 beat). After T+90 no gap
exceeds 45s without either a wanderer, a siren, a surge, a PA beat, or
the trickle. Surges target the players' district or an active repair
yard — camping is answered by the schedule; Noise makes loud play answer
itself.

## 6. What was cut, and why (the fun transplant's debit side)

- All 7 gameplay chat verbs (the playtest verdict, verbatim).
- 6 of 10 recipes — ambiguity kills auto-crafting; each material now
  appears in exactly one recipe. Blowtorch and Kopi Set are gone;
  **Generator Part is gone entirely** (the instant-fix item deleted the
  best tension beat in the map — the vulnerable repair stand);
  Barricade Kit / Flare / Mobile Phone moved to shop/loot.
- The 35s dread metronome (dread now only pre-surge + scripted beats).
- Searches×5 score term (score = outcomes only: aboard, brood, power,
  defenses standing).
- The residents multiboard row (civvies stay as ambience and rise fuel).
- The pick-window policing announcements (the window stays; the nagging
  goes).
- The every-5th-kill invisible clip strip → replaced by **visible ground
  spills** (same economy, on the ground where roaming pays).
- Deviation from the reconciled spec, documented: the shop's "extra
  Clips" ware is circular (clips are the currency) — the fourth ware is
  the **Wet Bandage** instead (ammo-vs-medicine is the same trade); and
  `-cam N` is declined to keep the map's zero-GetLocalPlayer doctrine.

## 7. Sim-testability note (gotcha 33's sim clause)

Every verb above lands on a sim-exercisable event: circles/rummage/
repair/boarding = `sim.moveUnit` + region/proximity ticks; smash =
`sim.damage`/`sim.kill` on the prop; auto-combine = `sim.pickup`; R/E/
signatures/Feast/Shriek = `sim.cast`; shop = `sim.sell`; spills/surges/
noise = PRNG-driven state asserted via RUNLOG. The interface is designed
for the player; the sim adapts — never the reverse.
