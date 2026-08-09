//===========================================================================
//
//  FoR-AI  --  a self-directed AI opponent for "The Fall of Rome 1.06"
//              by ToaNoah (wc3maps map id 421339).
//
//  This module is appended to the map script ahead of main(). It is
//  self-contained: it declares only globals prefixed AI_ / ai_ / wm_ and
//  functions prefixed AI_, and it hooks itself from a single call at the
//  end of InitCustomTriggers.
//
//  Design notes, scoring functions and the fog contract: DESIGN.md.
//
//  Style constraints obeyed here:
//    * NO ASCII apostrophe may appear inside a double-quoted string literal.
//      The JASS lexer treats ' as rawcode syntax even inside "..." and an
//      apostrophe makes the whole map fail to load. Rawcode literals like
//      'n003' are fine; string literals are written apostrophe-free.
//    * All state is global. JASS has no closures, so group enumeration uses
//      a global "current subject" plus filter/callback functions.
//
//  ROUND 2 (2026-08-09) -- driven by the first real playtest. Four reported
//  faults and one late fifth, each addressed in a named place:
//    (1) order spam / unit lag  -> the ORDER ECONOMY section: per-unit last
//        order memory in a hashtable, a per-tick issue budget, and a phase
//        offset so twelve AI players never think on the same tick.
//    (2) defence tunnel vision  -> AI_ScoreDefend asset gate + write-off at a
//        real ratio, AI_ShouldRecall, AI_RespondBudget.
//    (3) pathing / reroute      -> AI_ChooseApproach: waypoint through a real
//        opening instead of one long attack-move.
//    (4) gates ignored          -> the GATE REGISTRY: state read from the unit
//        type, opening/breaking/closing.
//    (5) target valuation       -> AI_VAL_* , the single structure value table.
//
//===========================================================================

//>>> FORAI-GLOBALS-BEGIN
    // ---- tuning ------------------------------------------------------
    constant integer AI_MAX_PLAYERS   = 12
    constant integer AI_MAX_POINTS    = 400   // registered capturable points
    constant integer AI_MAX_GATES     = 128   // registered wall gates

    constant real    AI_MICRO_PERIOD  = 1.0
    constant real    AI_HOME_R        = 2500.0
    constant real    AI_FIELD_R       = 1400.0
    constant real    AI_TOUCH_R       = 900.0
    constant real    AI_DWELL         = 9.0
    constant real    AI_GAME_LEN      = 1800.0

    constant integer AI_SEED_DEFAULT  = 20260809

    // difficulty ids
    constant integer AI_EASY          = 0
    constant integer AI_NORMAL        = 1
    constant integer AI_HARD          = 2

    // goal ids
    constant integer GOAL_NONE        = 0
    constant integer GOAL_CONSOLIDATE = 1
    constant integer GOAL_EXPAND      = 2
    constant integer GOAL_DEFEND      = 3
    constant integer GOAL_SIEGE       = 4
    constant integer GOAL_TECH        = 5
    constant integer GOAL_RETREAT     = 6

    // roles
    constant integer AI_ROLE_BARB     = 0
    constant integer AI_ROLE_ROME     = 1

    // ===================================================================
    //  STRUCTURE VALUE TABLE  -- the one place target worth is decided.
    //
    //  Every number below is a claim about what the MAP pays, checked
    //  against the decompiled war3map.j, not about what a building looks
    //  like. Move a number here and both EXPAND and SIEGE follow.
    //
    //   Capital   h000  the literal victory test at T=1800, plus +50 g /
    //                   +50 l on every 120 s turn.                  4.00
    //   CtrlPoint n003  +10 g / +10 l per turn. 110 of them. This is
    //                   the income currency of the game.            1.00
    //   City      h001  no income at all; trains 38 types; can be razed
    //                   for +250 g / +250 l (R008).                 0.65
    //   Town      h009  no income; trains 32 types; razes for +100.  0.45
    //   BarbCamp  h002  no income; trains 32 types; 5000 HP.         0.75
    //   Plot      n00E n00F n008 n009  capturable, upgradeable, pays
    //                   nothing until it is built.                  0.25
    //   Shipyard  h00J  63 of them, capturable like everything else --
    //                   and worth ESSENTIALLY NOTHING. Naval warfare
    //                   does not decide this map (playtest 2026-08-09,
    //                   which overturned a headless inference that the
    //                   sea mattered). Kept in the registry at ~0 so a
    //                   shipyard can never outscore a control point.  0.02
    //
    //  The raze terms are added only for a player the map lets research
    //  R008 (Romans and Persia are barred by Trig_Limit_Units), because
    //  the refund is the larger half of a settlement to anyone else.
    // ===================================================================
    constant real    AI_VAL_CAPITAL   = 4.00
    constant real    AI_VAL_CP        = 1.00
    constant real    AI_VAL_CITY      = 0.65
    constant real    AI_VAL_TOWN      = 0.45
    constant real    AI_VAL_CAMP      = 0.75
    constant real    AI_VAL_PLOT      = 0.25
    constant real    AI_VAL_SHIPYARD  = 0.02
    constant real    AI_VAL_RAZE_CITY = 0.60   // +250 g / +250 l on R008
    constant real    AI_VAL_RAZE_TOWN = 0.25   // +100 g / +100 l on R008
    // ROUND 3, queue item 6. A settlement we can KEEP is worth more than one
    // we would burn, and round 2 never counted any of what keeping it pays:
    //   25 supply for a city, 10 for a town (TRIGSTR_1005 / TRIGSTR_1868) --
    //     and food is the binding constraint in this map, gold is not;
    //   a +5 armour aura (A01M/A00M on the ACav base, Had1 = 5);
    //   a regeneration aura (A00K/A00J on Aoar);
    //   a 300 s zero-mana summon of 6 Militia h010 at a city (A01W).
    // So the hold premium is deliberately set ABOVE the raze refund: burning
    // something we are comfortable holding must always score worse.
    constant real    AI_VAL_HOLD_CITY = 0.70
    constant real    AI_VAL_HOLD_TOWN = 0.28

    // ===================================================================
    //  ROUND 3: CONDITIONAL CAPITAL VALUE  (queue item 4)
    //
    //  Round 2 gave every capital a flat AI_VAL_CAPITAL of 4.00, which IS a
    //  beeline instruction. The owner: "rushing Byzantium capital early
    //  guarantees a loss for Red as opposed to territorial dominance."
    //
    //  He is describing the map. The victory test fires only at T=1800, so a
    //  capital taken at T=600 must be HELD for twenty minutes against three
    //  Roman powers -- and because food binds while gold does not, and food
    //  comes from settlements (25 per city, 10 per town, the map own
    //  tooltips), capturing territory is the ONLY way a barbarian raises its
    //  army ceiling at all. Territory is self-reinforcing; a capital is not.
    //
    //  So capital worth is multiplied by a readiness term: a clock window
    //  that opens at AI_CAP_T0 and saturates at AI_CAP_T1, times the force
    //  ratio against the garrison we can actually SEE, over a floor so it
    //  never becomes worthless.
    // ===================================================================
    constant real    AI_CAP_T0        = 810.0
    constant real    AI_CAP_T1        = 1440.0
    constant real    AI_CAP_FLOOR     = 0.18   // capital worth never vanishes
    constant real    AI_CAP_COMMIT    = 0.55   // readiness that justifies PUSH

    // ---- posture: a stance that PERSISTS (queue item 4) ----------------
    // Goals are re-scored every tick. Posture is the slower layer above them
    // and moves only every AI_POSTURE_T, so an AI has a coherent plan rather
    // than a fresh opinion every second. It BIASES goal selection; it can
    // never override a DEFEND or RETREAT that would otherwise win -- see
    // AI_SelectGoal, where that is enforced explicitly.
    // ROUND 4, finding 1: what one train order actually costs. A train order
    // in this map spawns a SQUAD OF 12, so these are the real units of "can I
    // mass at all" -- not a tuning knob, a fact about the map.
    constant real    AI_SQUAD_FOOD    = 12.0
    constant real    AI_SQUAD_GOLD    = 50.0   // the cheapest squad in the table
    // ROUND 5, findings 3 and 4 -- the ROMAN lock. Measured on the round-4
    // build for a West Rome shape (army 2000 CV, gold 1500, nearest enemy
    // 18000 away): CONSOLIDATE 0.300 at EVERY clock against EXPAND 0.113
    // falling to 0.067. The 0.300 is a pure GOLD FLOOR -- the army term is
    // already zero because the army exceeds wantArmy, so 0.22*C01(gold/900)
    // alone pins the faction at home for the whole game. Rome is rich by
    // construction (25-33 control points at 10 gold each per round), so that
    // floor is permanent. "West Rome still stacks in Rome and does not use
    // the troops" is this number.
    constant real    AI_WANT_BAND     = 0.35   // how far below want still wants more
    // And the other half: EXPAND is crushed by a proximity term scaled to a
    // fixed 4200, which is a barbarian's world. Rome's nearest enemy is
    // ~18000 away, so every objective it owns scores prox 0.19 and nothing is
    // ever worth marching to. The scale now adapts to the faction's OWN
    // geography, so the nearest target is always a real objective to whoever
    // owns the frontier.
    constant real    AI_PROX_MIN      = 4200.0
    // ROUND 5, the standing bias. The owner, on the whole fleet: "Players
    // generally too static ... should always overcorrect for actual
    // aggressiveness". And the measurable proof: across a whole 30-minute
    // game the multiboard read West Rome 24/24/24, East Rome 32/33/32, North
    // Rome 20/21/20, barbarians 2-5 throughout. In a game about taking
    // territory, territory did not change hands.
    //
    // So an IDLE ARMY IS ALWAYS A BUG, and "nothing scored above threshold"
    // is never allowed to be a terminal state. If a faction has gone this
    // long without committing to anything, it takes the nearest contestable
    // objective unconditionally -- if nothing scores, the thresholds are
    // wrong, and in the meantime the army should still be moving at
    // something.
    constant real    AI_IDLE_T        = 25.0
    // The cheapest thing the Forge can research. Below this, TECH is not a
    // cheap goal, it is an impossible one. ROUND 6.
    constant real    AI_TECH_MIN_GOLD = 200.0
    constant real    AI_POSTURE_T     = 45.0
    constant real    AI_POSTURE_BIAS  = 0.20
    constant integer POSTURE_CONSOLIDATE = 0
    constant integer POSTURE_EXPAND      = 1
    constant integer POSTURE_PUSH        = 2
    constant integer POSTURE_HARASS      = 3
    integer array    ai_posture
    real    array    ai_postureAt
    boolean array    ai_harasser

    // point kinds
    constant integer AI_PK_CP         = 0
    constant integer AI_PK_TOWN       = 1
    constant integer AI_PK_CITY       = 2
    constant integer AI_PK_CAPITAL    = 3
    constant integer AI_PK_CAMP       = 4
    constant integer AI_PK_PLOT       = 5
    constant integer AI_PK_SHIPYARD   = 6

    // ===================================================================
    //  ORDER ECONOMY  -- playtest fault (1): "the Roman players stutter
    //  from unit lag and trying to move everything at once".
    //
    //  Round 1 re-issued an order to EVERY unit of EVERY AI player on
    //  every think tick and again on every micro tick, whether or not the
    //  unit already had that order, and every player thought on the same
    //  tick because they all started with nextThink = 0. Three fixes:
    //  remember the last order per unit and skip identical ones; cap how
    //  many orders one player may issue in one tick; offset the players.
    // ===================================================================
    constant integer AI_ORD_NONE      = 0
    constant integer AI_ORD_MOVE      = 1
    constant integer AI_ORD_ATTACKP   = 2   // attack-move to a point
    constant integer AI_ORD_ATTACKU   = 3   // attack a specific unit
    constant integer AI_ORD_LOAD      = 4   // board a transport (round 3)
    constant integer AI_ORD_UNLOAD    = 5   // unload a transport at a point
    constant real    AI_ORDER_TOL     = 350.0  // same destination if within
    constant real    AI_ORDER_REFRESH = 20.0   // safety re-issue interval
    constant integer AI_ORDER_SLICE   = 24     // orders per player per think
    constant integer AI_MICRO_SLICE   = 12     // orders per player per micro

    // ---- defence damping, playtest fault (2) --------------------------
    constant real    AI_WRITEOFF      = 1.60   // threat vs WHOLE army
    constant real    AI_DEF_FLOOR     = 0.35   // defend score with no asset
    constant real    AI_RECALL_RATIO  = 1.30   // threat vs garrison
    constant real    AI_DEF_MAX_FRAC  = 0.60   // most of the army that may respond
    constant real    AI_RESPOND_R     = 12000.0

    // ---- approach routing and gates, playtest faults (3) and (4) ------
    // AI_GATE_NEAR and AI_GATE_DETOUR were round 2 and are DELETED, not
    // merely unused: the objective-anchored radius is the gate-jam bug, and
    // leaving it declared invites it back. The corridor test replaces both.
    constant real    AI_GATE_BREAK    = 6000.0 // detour worth avoiding a siege
    constant real    AI_GATE_OWN      = 400.0  // opening our own gate is cheap
    // ROUND 5, the Gray jam. The screenshot: ~25 units stacked on a causeway
    // in front of a closed City Gate reading 1992/2000 HP, armour 5. Eight
    // points of damage. The army walked to a wall it must break and had no
    // way to break it, and this constant is half the reason.
    //
    // AI_ChooseApproach returned EARLY once the objective was closer than
    // 2200 -- "already on top of it, just go". But the gate is between the
    // army and the objective at exactly that range, so on arrival the whole
    // crossing model switched off: ai_apGate went to -1, ai_apBreak went
    // FALSE, the rams that existed were sent to the rear as having no work,
    // and no new ram was ever bought -- because round 4 correctly made
    // ai_apBreak the ONLY reason to buy one. The army then attack-moved into
    // an armour-5 gate with infantry and achieved eight damage.
    //
    // The early-out only ever meant "do not reroute a march that has already
    // arrived". A wall in the last 2000 units is precisely when routing
    // matters most, so it now only suppresses genuinely trivial distances.
    constant real    AI_APPROACH_MIN  = 600.0
    // How long a wall we met stays a reason to own rams. ai_apBreak is a
    // per-tick transient and AI_Spend runs BEFORE AI_MoveOnTarget in the same
    // tick, so buying on the raw flag is a phase race with the march.
    constant real    AI_WALL_MEM      = 90.0
    constant real    AI_RAM_LUMBER    = 100.0   // the map cost of h025
    constant real    AI_NOBREAK_COST  = 9000.0  // crossing we cannot perform
    constant real    AI_SIEGE_R       = 2000.0 // hit the gate itself inside this
    constant real    AI_GATE_GUARD    = 1200.0 // enemy proximity for gate control
    constant real    AI_GATE_CD       = 20.0   // the map cooldown on A00Z etc.

    // ---- ROUND 3: the corridor test and the stall backstop -------------
    // Round 2 only ever asked "is a gate near the OBJECTIVE?", so the gate an
    // army must cross leaving its OWN city was never a candidate and the
    // army jammed behind it. These drive the segment-based replacement.
    constant real    AI_GATE_CORRIDOR = 1600.0 // perp distance from the march line
    // ROUND 4, finding 7: "gates are over-prioritised when a nearby gate is
    // already broken -- they should go for control points instead." A gate has
    // ZERO intrinsic value; it is pure transit cost. So the search radius for
    // a crossing must scale with what the crossing SAVES: a breach costs
    // nothing to use and is therefore worth walking a long way sideways for,
    // while a gate we would have to besiege is only worth considering if it is
    // nearly on our line. Round 3 used one radius for both, so a breach a
    // little off the direct line was invisible and the army besieged an intact
    // gate it never needed to touch.
    constant real    AI_GATE_CORRIDOR_FREE = 4800.0
    constant real    AI_GATE_SAMEWALL = 0.15   // same wall when t is this close
    constant real    AI_GATE_ENTRY    = 300.0  // waypoint set just PAST the gate
    constant real    AI_STALL_EPS     = 400.0  // movement that counts as progress
    constant real    AI_STALL_T       = 12.0   // seconds of no progress = stalled
    constant real    AI_STALL_R       = 4000.0 // force-open radius around the army

    // ---- razing, playtest fault (5) -----------------------------------
    constant integer AI_RAZE_KEEP     = 3      // never drop below this many trainers
    // ROUND 3, queue item 6: what "comfortable being able to hold" means.
    constant real    AI_HOLD_DIST     = 5200.0 // behind our lines
    constant real    AI_HOLD_FOOD     = 26.0   // food headroom that still wants supply
    constant real    AI_HOLD_ARMY     = 240.0  // enough army to garrison anything

    // gate states
    constant integer AI_GS_CLOSED     = 0
    constant integer AI_GS_OPEN       = 1
    constant integer AI_GS_GONE       = 2

    // ---- per-player configuration ------------------------------------
    boolean array    ai_on
    integer array    ai_diff
    integer array    ai_role
    real    array    ai_handicap        // 1.0 = no cheat. Documented cheat hook.
    player  array    ai_p
    real    array    ai_homeX
    real    array    ai_homeY

    // ---- per-player world model --------------------------------------
    real    array    wm_army            // own combat value
    real    array    wm_garrison        // own CV within AI_HOME_R of home
    real    array    wm_threat          // VISIBLE enemy CV near own structures
    real    array    wm_threatX
    real    array    wm_threatY
    real    array    wm_fieldCV
    real    array    wm_fieldX
    real    array    wm_fieldY
    real    array    wm_fieldHPFrac
    real    array    wm_fieldEnemyCV
    real    array    wm_gold
    real    array    wm_lumber
    real    array    wm_food
    real    array    wm_foodCap
    integer array    wm_cpOwn
    real    array    wm_capReady        // readiness to TAKE AND HOLD a capital
    integer array    wm_capIdx          // nearest enemy capital, or -1
    real    array    wm_proxScale       // this faction own distance scale (round 5)
    integer array    wm_fieldComp       // land component the field army stands in
    boolean array    wm_wantBoat        // nothing left to take without a crossing
    boolean array    wm_landLeft        // something worth taking on our own landmass
    boolean array    wm_hasSiege        // we own something that can break a wall
    boolean array    wm_capThreat
    boolean array    wm_capLost
    real    array    wm_asset           // value of the best OWN point under threat
    boolean array    wm_canRaze         // may this player research R008

    // ---- per-player goal state ---------------------------------------
    integer array    ai_goal
    real    array    ai_goalSince
    integer array    ai_target          // index into the point registry
    real    array    ai_nextThink
    integer array    ai_bestT           // cached best target of this think
    real    array    ai_bestS           // cached raw score of that target

    // ---- per-player approach plan ------------------------------------
    real    array    ai_apX
    real    array    ai_apY
    integer array    ai_apGate          // gate index or -1
    boolean array    ai_apBreak         // must we break it

    // ---- ROUND 3: stall detection (a blocked exit is a failure state) --
    real    array    ai_commitAt        // last time we committed to an objective
    real    array    ai_wallSince       // last time a wall stood in our way
    real    array    ai_progD           // best distance-to-objective so far
    real    array    ai_progAt          // when that best was recorded

    // ---- point registry (static geography, dynamic state fogged) -----
    integer          ai_pointCount   = 0
    unit    array    ai_pt
    integer array    ai_ptKind
    real    array    ai_ptX
    real    array    ai_ptY
    // per-player fogged memory, flattened as [player*AI_MAX_POINTS + i]
    integer array    ai_ptOwner       // last observed owner id, -1 unknown
    real    array    ai_ptSeen        // game time of that observation
    real    array    ai_ptDef         // visible defender CV then

    // ---- gate registry -----------------------------------------------
    integer          ai_gateCount    = 0
    unit    array    ai_gate
    real    array    ai_gateX
    real    array    ai_gateY
    integer array    ai_gateOr        // 0 horizontal 1 diag1 2 diag2 3 vertical
    real    array    ai_gateCd        // next game time this gate may be toggled
    boolean array    ai_gateStuck     // a toggle we issued did not take effect

    // ---- deterministic PRNG (Park-Miller via Schrage) -----------------
    integer          ai_seed         = AI_SEED_DEFAULT

    // ---- enumeration scratch ------------------------------------------
    player           ai_curP         = null
    integer          ai_curPid       = 0
    real             ai_accCV        = 0.0
    real             ai_accX         = 0.0
    real             ai_accY         = 0.0
    real             ai_accW         = 0.0
    real             ai_accHP        = 0.0
    real             ai_accHPMax     = 0.0
    real             ai_snapX        = 0.0    // round 7: centroid validation
    real             ai_snapY        = 0.0
    real             ai_snapD        = 0.0
    real             ai_snapBX       = 0.0
    real             ai_snapBY       = 0.0
    integer          ai_accN         = 0
    integer          ai_accSiege     = 0
    unit             ai_orderTarget  = null
    real             ai_orderX       = 0.0
    real             ai_orderY       = 0.0
    integer          ai_ordKind      = 0
    unit             ai_trainer      = null
    unit             ai_razeUnit     = null
    real             ai_razeDist     = 0.0
    integer          ai_razeCount    = 0
    timer            ai_thinkTimer   = null
    timer            ai_microTimer   = null
    trigger          ai_cmdTrig      = null
    real             ai_now          = 0.0

    // ===================================================================
    //  ROUND 3: NAVAL TRANSPORT (queue item 2)
    //
    //  Transport only. There is no naval WARFARE here and there never will
    //  be -- the owner played the map and reported sea combat is worthless,
    //  so shipyards stay near-zero as targets (AI_VAL_SHIPYARD) and nothing
    //  below builds a warship, escorts a crossing or contests the water.
    //  This is pure logistics: board, cross, unload, hand straight back to
    //  the land layer.
    //
    //  Ship types are the map own: shipyard h00J trains h026 / h00R / h00Q
    //  on the hdes base. h00R is 50 g + 50 l, 4 food and carries 6 (S001,
    //  Car1 = 6), which is the best cargo per gold, so it is the one bought.
    //  h00S is artillery with no hold and is deliberately not used.
    // ===================================================================
    constant integer AI_NAV_SHIPYARD  = 'h00J'
    constant integer AI_NAV_SHIP      = 'h00R'  // 50 g + 50 l, carries 6
    constant real    AI_NAV_SHIP_G    = 50.0
    constant real    AI_NAV_SHIP_L    = 50.0
    constant real    AI_NAV_BOARD_R   = 2200.0  // gather radius around the ship
    constant real    AI_NAV_CD        = 5.0     // seconds between naval orders
    constant integer AI_NAV_MIN_LOAD  = 3       // sail once this many are aboard
    constant real    AI_NAV_LOAD_T    = 45.0    // ... or when boarding times out
    // ROUND 4, findings 5 and 8. "Most Barbarians should not be building
    // transports apart from orange and green" (P5 Vandals, P6 Britons), and
    // "orange and green should consolidate their islands early".
    //
    // Round 3's bug was that AI_TargetScore never knew about water at all, so
    // ANY faction whose best-scoring point happened to lie across a strait --
    // common on a Mediterranean map -- boarded a boat immediately. The phase
    // rule below is the real fix and needs no faction list: while anything
    // uncontested remains on our own landmass it outranks everything across
    // water, so a crossing only becomes eligible once home is consolidated.
    //
    // The second half is the Vandals, and it is where round 3's graph was
    // asking the wrong question. The flood fill says they are land-connected
    // to Europe, and they ARE -- via Egypt and Anatolia, which is most of the
    // map. Connectivity is not usefulness. So a crossing is ALSO wanted when
    // the straight line to the objective crosses water and the objective is
    // far, which is exactly a Mediterranean shipping lane and is not true of
    // anything reachable straight overland.
    constant real    AI_CROSS_PENALTY = 0.05    // across water, home not done
    constant real    AI_SEA_MIN       = 6000.0  // far enough that walking round hurts
    constant integer AI_NAV_NONE      = 0
    constant integer AI_NAV_LOAD      = 1
    constant integer AI_NAV_SAIL      = 2
    integer array    ai_navState
    unit    array    ai_navShip
    real    array    ai_navAt          // next time this player may act navally
    real    array    ai_navSince       // when boarding began
    real    array    ai_navSay         // rate limit on naval narration
    unit             ai_navPick     = null
    integer          ai_navLoaded   = 0

    // ---- land connectivity (round 3) ----------------------------------
    // Union-find over the POINT registry, not a terrain grid: JASS arrays
    // cap at 8192 entries, so a real flood fill of a 61440x61440 map does
    // not fit while 400 points and their near neighbours comfortably do.
    constant real    AI_LINK_R        = 2600.0  // points this close may link
    constant integer AI_LINK_SAMPLES  = 8       // walkability samples per link
    integer array    ai_comp

    // ===================================================================
    //  ROUND 3: COORDINATION AND HARASSERS  (queue item 7)
    //
    //  "AIs should act in consort" -- a shared claim ledger so two allied
    //  AIs do not duplicate or fight over the same objective, and one AI per
    //  front playing a harassing role CONCURRENTLY with the push rather than
    //  instead of it.
    //
    //  The ledger is a LABELLED allowance, in the spirit of AI_HANDICAP: it
    //  shares intent between allied AI players, which is exactly what human
    //  allies do out loud. It reveals nothing about the enemy and does not
    //  touch the fog contract -- enemy strength still comes only from
    //  IsUnitVisible -- and a claim binds only between players the map has
    //  actually allied. It is a discount, never a veto, so a claimed point
    //  is still taken when it is the only thing worth taking.
    //
    //  The harasser is chosen by the map own seeded stream. The front and
    //  the weighting are the owner: for the Byzantium fight, between Red
    //  (Huns), Gray (Ostrogoths) and Pink (Persians), strongly weighted
    //  towards Red. Player ids come from the map own multiboard rows rather
    //  than a guess: row 2 Huns = Player(0), row 10 Ostrogoths = Player(8),
    //  row 9 Persians = Player(7). The western front is left unassigned.
    // ===================================================================
    constant real    AI_CLAIM_TTL     = 30.0   // a claim this old is stale
    constant real    AI_CLAIM_PENALTY = 0.35   // discount, never a veto
    constant integer AI_HARASS_A      = 0      // Red    Huns
    constant integer AI_HARASS_B      = 8      // Gray   Ostrogoths
    constant integer AI_HARASS_C      = 7      // Pink   Persians
    constant integer AI_HARASS_WA     = 6      // out of 10: strongly Red
    constant integer AI_HARASS_WB     = 2
    constant integer AI_HARASS_WC     = 2
    constant real    AI_RAID_DEF      = 60.0   // "undefended" for a raid
    constant integer AI_RAID_SLICE    = 8      // orders one raid may spend
    integer array    ai_claim                  // point -> claiming player, -1
    real    array    ai_claimAt
    integer          ai_raidType    = 0
    string           ai_roster      = ""     // which slots the AI took (finding 2)
    // ROUND 5, hypothesis 0. Round 4 scoped AI reports to allies, correctly --
    // and the owner plays ROME, so from that build on they saw not one
    // barbarian message. The stream they used in playtest 4 to diagnose
    // "Huns: massing at home" went silent, and the next report was that
    // barbarians "seem" less active. An AI that announces nothing looks less
    // active than the same AI announcing constantly. Rather than revert a
    // correct fix, a playtester can opt IN to seeing everything, for
    // themselves only, per recipient, with no GetLocalPlayer anywhere.
    boolean array    ai_spy                  // this PLAYER sees every faction

    // ===================================================================
    //  ROUND 3: RAMS (item 8) AND DISPERSAL (item 10)
    //
    //  Rams. The map own hint text: "Battering Rams are particularly useful
    //  for bashing down city walls!" -- anti-structure by design intent, not
    //  merely by stat profile. h025 is the ram the AI already buys as role 4
    //  and h00S is the only ua1t = siege / ua1w = artillery unit in the
    //  table. So a ram gets ONE job: go at a wall when there is a wall to
    //  break, and hold behind the line when there is not, instead of
    //  drifting into a field engagement it cannot survive.
    //
    //  Dispersal. The owner screenshot: a 283/300 food army crammed into a
    //  single street. Ordering every unit to the SAME point is what makes a
    //  blob, because the engine then queues the whole army through one tile
    //  -- the same failure family as the gate jam, and it survives even an
    //  OPEN gate. Each unit instead gets a lane: a lateral offset
    //  perpendicular to the ARMY march line, keyed off the unit handle id.
    //  Both halves of that matter. Handle-keyed means a unit keeps its lane
    //  across ticks; army-line-keyed (rather than per-unit geometry) means
    //  the offset does not drift as the unit walks, so lanes cost ZERO extra
    //  orders and cannot undo the round-2 order economy.
    // ===================================================================
    constant real    AI_RAM_HOLD_R    = 1400.0  // how far behind the line rams sit
    // ROUND 4, finding 3: "gray still struggling with this" -- a screenshot of
    // ~40 units piled on and behind a BRIDGE leading to a walled coastal city.
    // A bridge is a terrain-narrow crossing, not a wall crossing, so the
    // round-3 corridor model never looked at it and, worse, the 5-lane
    // 1040-unit frontage is PHYSICALLY IMPOSSIBLE there: the outer lane
    // destinations land in water, the engine cannot path to them, and the
    // formation collapses into exactly the pile the owner photographed.
    // So the frontage is now MEASURED against the engine's own pathing at the
    // places the army is about to walk, and the lane count collapses to fit.
    // Past the constriction the same measurement widens again and the lanes
    // re-form, with no state to keep and nothing to reset.
    constant real    AI_LANE_PROBE    = 200.0   // step when measuring frontage
    constant integer AI_LANE_PROBE_N  = 6       // steps each side (max 1200)
    integer          ai_laneN       = 5         // lanes in use THIS dispatch
    integer          ai_laneMid     = 2         // (ai_laneN-1)/2, set together
    constant integer AI_LANES         = 5       // odd, so one lane is dead centre
    constant integer AI_LANE_MID      = 2       // (AI_LANES-1)/2, STATED not derived:
                                                // JASS integer division truncates and
                                                // the trace interpreter divides as a
                                                // real, so deriving it would make the
                                                // two disagree about the formation.
    constant real    AI_LANE_W        = 260.0   // lateral spacing between lanes
    integer          ai_ramType     = 0
    boolean          ai_ramWork     = false
    real             ai_ramX        = 0.0
    real             ai_ramY        = 0.0
    real             ai_laneNX      = 0.0       // march-line normal, per dispatch
    real             ai_laneNY      = 0.0

    // ===================================================================
    //  ROUND 3: HEROES  (queue item 5)
    //
    //  The decisive fact, established from the artifact: there is NO revive
    //  trigger anywhere in this map -- no ReviveHero call, no altar -- and
    //  each player has exactly ONE preplaced hero. A dead hero is dead for
    //  the rest of the game. Trig_Kill_Count levels non-hero killers only.
    //
    //  Both halves of the policy follow from that one fact, and neither is
    //  a normal RTS setting:
    //   * killing THEIR hero is permanently worth more than any building on
    //     the board, so it is worth a detour and a focus-fire override.
    //   * losing OURS is unaffordable, so the break point is deliberately
    //     conservative -- half health, not the 22 percent trip-wire the rest
    //     of the army uses -- and re-engagement waits for a real heal, with
    //     hysteresis so a hero cannot flicker in and out of a fight.
    // ===================================================================
    // ROUND 4 -- A CORRECTION TO ROUND 3'S OWN DIAGNOSIS. Round 3 said "there
    // is no revive trigger anywhere and each player has exactly one preplaced
    // hero, so a dead hero is gone for the game". The search was for a
    // TRIGGER, and absence of a trigger is not absence of a mechanism -- the
    // repo's own doctrine, and round 3 broke it.
    //
    // What the artifact actually says. The map's own tooltip, TRIGSTR_1000:
    // "Your hero cannot be revived if he dies, but you can get a new Hero by
    // researching Appoint a New General at your Forge." That research is R007
    // (TRIGSTR_1805 "Appoint New General"), it costs 250 gold + 250 lumber
    // (gglb/glmb) and it IS in the Forge's research list (h00W ures). What
    // there is NOT: any altar or tavern base, any revive ability, any
    // ReviveHero call, and any revive item -- the item every hero starts with,
    // I000, is a Battle Standard.
    //
    // And the twist: Trig_Melee_Initialization_Func003A runs over
    // udg_AllPlayers and calls SetPlayerTechMaxAllowedSwap('R007', 0), and
    // NOTHING anywhere sets it back. So in this build the replacement the map
    // advertises is disabled for everyone -- the conclusion round 3 reached,
    // reached for entirely the wrong reason.
    //
    // The owner reports heroes can be replaced for 100 gold, which matches
    // neither the 250/250 measured here nor a build with R007 disabled. Rather
    // than argue the point, the risk tolerance ASKS THE GAME at runtime, the
    // same way wm_canRaze asks about R008: if a replacement is purchasable the
    // hero is a setback and worth risking, and if it is not it is irreplaceable
    // and worth protecting. That is correct under every reading.
    constant real    AI_HERO_ENGAGE   = 0.78   // re-commit: irreplaceable hero
    constant real    AI_HERO_BREAK    = 0.50   // disengage: irreplaceable hero
    constant real    AI_HERO_ENGAGE_R = 0.55   // re-commit: replacement available
    constant real    AI_HERO_BREAK_R  = 0.30   // disengage: replacement available
    constant integer AI_HERO_REPLACE  = 'R007' // "Appoint New General", at the Forge
    constant real    AI_HERO_HUNT_R   = 3000.0 // focus a hero found this close
    // ROUND 4, finding 6: "they overpush for hero aim." The round-3 hunt was
    // bounded by distance from the ARMY -- a MOVING reference, so the bound
    // travelled with the chase and bounded nothing at all. These anchor it to
    // things that do not run away: the objective, and the formation.
    constant real    AI_HERO_LEASH    = 3400.0 // hunt only this far from the objective
    constant real    AI_HERO_SOLO_R   = 1200.0 // our hero never leaves the formation
    constant integer AI_HERO_SLICE    = 2      // orders the hero layer may spend
    boolean array    ai_heroOut       // withdrawn and healing
    boolean array    wm_canReplaceHero// R007 purchasable: a hero is a setback
    real             ai_anchorX     = 0.0     // the point a hero hunt is tied to
    real             ai_anchorY     = 0.0
    unit             ai_heroUnit    = null
    unit             ai_heroTarget  = null
    real             ai_heroDist    = 0.0
    real             ai_heroLeash   = 0.0

    // ---- ROUND 3: messaging -------------------------------------------
    // The AI narrates its STATE CHANGES so a playtest diagnoses itself. Rate
    // limited per player and de-duplicated, because twelve narrating players
    // would otherwise be a chat flood rather than a diagnostic.
    constant real    AI_SAY_GAP       = 8.0
    constant real    AI_SAY_TTL       = 12.0
    boolean array    ai_talk
    real    array    ai_sayAt
    string  array    ai_sayLast

    // ---- order accounting ---------------------------------------------
    hashtable        ai_ht           = null
    integer          ai_issued       = 0      // orders issued this ForGroup
    integer          ai_budget       = 0      // cap for this ForGroup
    integer          ai_ordersTick   = 0      // orders issued this whole tick
    real             ai_holdCV       = 0.0    // garrison CV still to hold back
    real             ai_respCV       = 0.0    // CV already committed to a response
    real             ai_respBudget   = 0.0

    // scan cursor: the point registry is refreshed in slices so a think tick
    // costs a bounded number of group enumerations regardless of map size
    integer array    ai_scanCursor
    constant integer AI_SCAN_SLICE    = 12
//>>> FORAI-GLOBALS-END

//===========================================================================
//  Small helpers
//===========================================================================

function AI_C01 takes real v returns real
    if v < 0.0 then
        return 0.0
    endif
    if v > 1.0 then
        return 1.0
    endif
    return v
endfunction

function AI_Max takes real a, real b returns real
    if a > b then
        return a
    endif
    return b
endfunction

function AI_Dist takes real ax, real ay, real bx, real by returns real
    return SquareRoot((ax-bx)*(ax-bx) + (ay-by)*(ay-by))
endfunction

// Park-Miller minimal standard generator, Schrage decomposition.
// Every intermediate stays below 2^31 so the stream is identical under
// 32-bit and 64-bit integer arithmetic.
function AI_Rand takes nothing returns integer
    local integer k = ai_seed / 127773
    set ai_seed = 16807*(ai_seed - k*127773) - 2836*k
    if ai_seed < 0 then
        set ai_seed = ai_seed + 2147483647
    endif
    return ai_seed
endfunction

// uniform real in [0,1)
function AI_RandReal takes nothing returns real
    return I2R(AI_Rand()) / 2147483647.0
endfunction

// symmetric noise in [-amp, +amp]
function AI_Noise takes real amp returns real
    return (AI_RandReal()*2.0 - 1.0) * amp
endfunction

function AI_ThinkPeriod takes integer pid returns real
    if ai_diff[pid] == AI_EASY then
        return 8.0
    endif
    if ai_diff[pid] == AI_HARD then
        return 2.0
    endif
    return 4.0
endfunction

function AI_NoiseAmp takes integer pid returns real
    if ai_diff[pid] == AI_EASY then
        return 0.25
    endif
    if ai_diff[pid] == AI_HARD then
        return 0.03
    endif
    return 0.10
endfunction

function AI_Clock takes nothing returns real
    return AI_C01(ai_now / AI_GAME_LEN)
endfunction

//===========================================================================
//  MESSAGING  (round 3, queue item 3)
//
//  "The AI should tell humans what it is doing and be able to request
//  things." Humans reading "Huns: pushing East Rome" is how the next
//  playtest gets diagnosed for free -- it is the only trace of the decision
//  layer a person inside the game can actually see.
//
//  Rules, so this stays a diagnostic and not a flood: state CHANGES only,
//  one line per player per AI_SAY_GAP seconds, identical consecutive lines
//  suppressed, and every line prefixed with the faction name in the faction
//  colour. The names and colour codes are the map OWN multiboard rows
//  (TRIGSTR_615..2396, read off war3map.wts), not invented ones, so what a
//  player reads in chat matches what the scoreboard calls that slot.
//===========================================================================

function AI_Name takes integer pid returns string
    if pid == 0 then
        return "|cffff0000Huns|r"
    elseif pid == 1 then
        return "|cff0000ffFranks|r"
    elseif pid == 2 then
        return "|cff00ffffSaxons|r"
    elseif pid == 3 then
        return "|cff6f2583West Rome|r"
    elseif pid == 4 then
        return "|cffffff00Visigoths|r"
    elseif pid == 5 then
        return "|cffd45e19Vandals|r"
    elseif pid == 6 then
        return "|cff00ff00Britons|r"
    elseif pid == 7 then
        return "|cffff8080Persians|r"
    elseif pid == 8 then
        return "|cff808080Ostrogoths|r"
    elseif pid == 9 then
        return "|cff8080ffEast Rome|r"
    elseif pid == 10 then
        return "|cff00af00North Rome|r"
    endif
    return "|cff964b4bBurgundians|r"
endfunction

// Broadcast to every human in the game. Deliberately NOT GetLocalPlayer:
// this is a plain loop over playing slots, so no asynchronous branch exists
// anywhere near it.
function AI_Broadcast takes string msg returns nothing
    local integer i = 0
    loop
        exitwhen i >= AI_MAX_PLAYERS
        if GetPlayerSlotState(Player(i)) == PLAYER_SLOT_STATE_PLAYING and GetPlayerController(Player(i)) == MAP_CONTROL_USER then
            call DisplayTimedTextToPlayer(Player(i), 0, 0, AI_SAY_TTL, msg)
        endif
        set i = i + 1
    endloop
endfunction

function AI_KindName takes integer kind returns string
    if kind == AI_PK_CAPITAL then
        return "a capital"
    elseif kind == AI_PK_CITY then
        return "a city"
    elseif kind == AI_PK_TOWN then
        return "a town"
    elseif kind == AI_PK_CAMP then
        return "a camp"
    elseif kind == AI_PK_PLOT then
        return "a building plot"
    elseif kind == AI_PK_SHIPYARD then
        return "a shipyard"
    endif
    return "a control point"
endfunction

function AI_GoalName takes integer goal returns string
    if goal == GOAL_EXPAND then
        return "taking ground"
    elseif goal == GOAL_DEFEND then
        return "defending"
    elseif goal == GOAL_SIEGE then
        return "committing to a capital"
    elseif goal == GOAL_TECH then
        return "researching"
    elseif goal == GOAL_RETREAT then
        return "pulling back"
    endif
    return "massing at home"
endfunction

// Owner of a registered point, safe for neutral and out-of-range ids.
function AI_OwnerName takes integer i returns string
    local integer o
    if ai_pt[i] == null then
        return "no one"
    endif
    set o = GetPlayerId(GetOwningPlayer(ai_pt[i]))
    if o < 0 or o >= AI_MAX_PLAYERS then
        return "no one"
    endif
    return AI_Name(o)
endfunction

// ROUND 4, FINDING 4 -- "Romans should not be able to see what the Barbarians
// are doing." The playtest screenshot is a ROMAN-side view reading
// "Huns: massing at home" and "Saxons: moving on a control point held by
// North Rome" straight off this module's chat. That is the human reading the
// enemy's plans out of a diagnostic, and it is a correctness bug, not a
// cosmetic one.
//
// Every AI report is therefore scoped to the sender's ALLIES. The point of
// the messaging layer survives intact -- it exists so an AI can co-operate
// with its human teammates, and a teammate still sees everything. It is still
// a plain per-recipient loop, so there is no GetLocalPlayer anywhere near it
// and no desync risk. Setup lines that describe the GAME rather than any
// player's intentions (which slots the AI took) stay global.
function AI_BroadcastAllies takes integer pid, string msg returns nothing
    local integer i = 0
    loop
        exitwhen i >= AI_MAX_PLAYERS
        if GetPlayerSlotState(Player(i)) == PLAYER_SLOT_STATE_PLAYING and GetPlayerController(Player(i)) == MAP_CONTROL_USER then
            // an ally, or an observer who has asked to see everything
            if IsPlayerAlly(Player(i), ai_p[pid]) or ai_spy[i] then
                call DisplayTimedTextToPlayer(Player(i), 0, 0, AI_SAY_TTL, msg)
            endif
        endif
        set i = i + 1
    endloop
endfunction

function AI_Say takes integer pid, string msg returns nothing
    if not ai_talk[pid] then
        return
    endif
    if msg == ai_sayLast[pid] then
        return                              // nothing changed; do not repeat
    endif
    if ai_now < ai_sayAt[pid] then
        return
    endif
    set ai_sayLast[pid] = msg
    set ai_sayAt[pid] = ai_now + AI_SAY_GAP
    // ROUND 4, finding 4: allies only. Never AI_Broadcast from here.
    call AI_BroadcastAllies(pid, AI_Name(pid) + ": " + msg)
endfunction

//===========================================================================
//  Structure value model
//===========================================================================

function AI_PointKind takes integer tid returns integer
    if tid == 'h000' then
        return AI_PK_CAPITAL
    endif
    if tid == 'h002' then
        return AI_PK_CAMP
    endif
    if tid == 'h001' then
        return AI_PK_CITY
    endif
    if tid == 'h009' then
        return AI_PK_TOWN
    endif
    if tid == 'h00J' then
        return AI_PK_SHIPYARD
    endif
    if tid == 'n00E' or tid == 'n00F' or tid == 'n008' or tid == 'n009' then
        return AI_PK_PLOT
    endif
    return AI_PK_CP
endfunction

// Base worth, before any player-specific term. See the value table above.
function AI_PointValue takes integer kind returns real
    if kind == AI_PK_CAPITAL then
        return AI_VAL_CAPITAL
    endif
    if kind == AI_PK_CITY then
        return AI_VAL_CITY
    endif
    if kind == AI_PK_TOWN then
        return AI_VAL_TOWN
    endif
    if kind == AI_PK_CAMP then
        return AI_VAL_CAMP
    endif
    if kind == AI_PK_PLOT then
        return AI_VAL_PLOT
    endif
    if kind == AI_PK_SHIPYARD then
        return AI_VAL_SHIPYARD
    endif
    return AI_VAL_CP
endfunction

// Worth to THIS player: a settlement is worth more to someone who can burn it.
// The clock window on capital appetite: shut before AI_CAP_T0, fully open by
// AI_CAP_T1. Stated as its own function so trace.py can assert the shape.
function AI_CapWindow takes nothing returns real
    return AI_C01((ai_now - AI_CAP_T0) / (AI_CAP_T1 - AI_CAP_T0))
endfunction

// Readiness to take a capital AND HOLD IT to the T=1800 test: the clock
// window times the force ratio against the garrison we can see, over a floor.
function AI_CapReadiness takes real army, real capDef returns real
    local real ratio = AI_C01(army / (2.0*capDef + 500.0))
    return AI_C01(AI_CAP_FLOOR + (1.0 - AI_CAP_FLOOR) * AI_CapWindow() * ratio)
endfunction

function AI_PointValueFor takes integer pid, integer kind returns real
    local real v = AI_PointValue(kind)
    if kind == AI_PK_CAPITAL then
        // ROUND 3, queue item 4: the flat 4.00 was a beeline instruction.
        return v * wm_capReady[pid]
    endif
    if wm_canRaze[pid] then
        if kind == AI_PK_CITY then
            set v = v + AI_VAL_RAZE_CITY
        endif
        if kind == AI_PK_TOWN then
            set v = v + AI_VAL_RAZE_TOWN
        endif
    endif
    return v
endfunction

//---------------------------------------------------------------------------
//  RAZE OR HOLD  (round 3, queue item 6)
//
//  The owner: "AI shouldnt burn cities its comfortable in being able to
//  hold." Round 2 added the raze refund UNCONDITIONALLY, which tells an AI
//  to burn its own supply and its own defences. What a settlement actually
//  gives you, from the object data: a +5 armour aura (A01M/A00M on the ACav
//  base, Had1 = 5), a regeneration aura (A00K/A00J on Aoar), 25 supply for a
//  city or 10 for a town (the map own tooltips, TRIGSTR_1005/1868) and a
//  300 s zero-mana summon of 12 Militia at a capital or 6 at a city
//  (A00V/A01W -> h010). The 250 gold refund is worth less than all of that
//  anywhere we can actually keep the building.
//
//  Three questions, each answerable from state already kept:
//   * is it behind our lines -- within AI_HOLD_DIST of home?
//   * do we want the supply -- are we near our real food cap?
//   * can we garrison it -- do we have an army at all?
//---------------------------------------------------------------------------
function AI_Holdable takes integer pid, real x, real y returns boolean
    if AI_Dist(x, y, ai_homeX[pid], ai_homeY[pid]) > AI_HOLD_DIST then
        return false                       // too far forward to keep
    endif
    if wm_food[pid] >= wm_foodCap[pid] - AI_HOLD_FOOD then
        return true                        // we NEED the supply it produces
    endif
    return wm_army[pid] >= AI_HOLD_ARMY
endfunction

// Value of a registered point to this player, WITH the holdability gate. The
// kind-only form above stays for callers that have no position.
function AI_PointValueIdx takes integer pid, integer i returns real
    local integer kind = ai_ptKind[i]
    local real v = AI_PointValue(kind)
    if kind == AI_PK_CAPITAL then
        return v * wm_capReady[pid]
    endif
    // Exactly one of the two premiums applies. A settlement we can hold pays
    // its supply, auras and militia summon; one we cannot pays its refund,
    // and only to a player the map lets research R008. The hold premium is
    // the larger of the two, which is the whole point of queue item 6.
    if AI_Holdable(pid, ai_ptX[i], ai_ptY[i]) then
        if kind == AI_PK_CITY then
            set v = v + AI_VAL_HOLD_CITY
        elseif kind == AI_PK_TOWN then
            set v = v + AI_VAL_HOLD_TOWN
        endif
    elseif wm_canRaze[pid] then
        if kind == AI_PK_CITY then
            set v = v + AI_VAL_RAZE_CITY
        elseif kind == AI_PK_TOWN then
            set v = v + AI_VAL_RAZE_TOWN
        endif
    endif
    return v
endfunction

//===========================================================================
//  Unit valuation
//===========================================================================

// Gold cost of the trainable combat types (section 1.6 of DESIGN.md).
function AI_BaseCost takes integer tid returns real
    // cheap melee, 50 gold
    if tid == 'h007' or tid == 'h022' or tid == 'h01C' or tid == 'h011' then
        return 50.0
    endif
    if tid == 'h01E' or tid == 'h017' or tid == 'h00B' or tid == 'h019' then
        return 50.0
    endif
    // spearmen, 75 gold
    if tid == 'h00K' or tid == 'h024' or tid == 'h01I' or tid == 'h00D' or tid == 'h01A' then
        return 75.0
    endif
    // heavy melee, 100 gold
    if tid == 'h006' or tid == 'h021' or tid == 'h014' or tid == 'h013' then
        return 100.0
    endif
    if tid == 'h00Z' or tid == 'h016' or tid == 'h00C' or tid == 'h00T' then
        return 100.0
    endif
    // cavalry, 150 gold
    if tid == 'h005' or tid == 'h023' or tid == 'h01J' or tid == 'h01G' then
        return 150.0
    endif
    if tid == 'h01F' or tid == 'h01H' or tid == 'h01D' or tid == 'h01B' or tid == 'h00A' then
        return 150.0
    endif
    // ranged
    if tid == 'n000' or tid == 'n001' or tid == 'n007' then
        return 50.0
    endif
    if tid == 'n005' then
        return 100.0
    endif
    // militia, praetor
    if tid == 'h00Y' or tid == 'h010' then
        return 25.0
    endif
    if tid == 'h012' then
        return 25.0
    endif
    // siege
    if tid == 'h025' then
        return 50.0
    endif
    if tid == 'o000' or tid == 'o006' or tid == 'n002' then
        return 200.0
    endif
    if tid == 'n00G' then
        return 75.0
    endif
    // heroes
    if tid == 'H003' or tid == 'H008' or tid == 'H00E' or tid == 'H00F' then
        return 300.0
    endif
    if tid == 'H00G' or tid == 'H00H' or tid == 'H00I' or tid == 'H00M' then
        return 300.0
    endif
    if tid == 'H00O' or tid == 'H020' then
        return 300.0
    endif
    return 50.0
endfunction

//---------------------------------------------------------------------------
//  TRIBAL PREFERENCES  (round 3, queue item 9)
//
//  Derived from the MAP, not from history. Two facts had to be established
//  from the artifact first, and both changed the shape of this:
//
//  1. Trig_Limit_Units does NOT restrict rosters by faction. It caps h012
//     Roman Praetor at 5 for Romans, bars R008 (raze) for Romans, and
//     disables A00V (the capital militia summon) for barbarians. That is
//     all. Every player can train every unit in the Forum utra list, and
//     the per-faction unit variants are stat-identical within a role. So a
//     tribal preference cannot be about ACCESS -- it is about composition.
//
//  2. Each faction hero carries exactly one unique ability alongside the
//     shared A005..A008/A00X/A019/A01K set, and the preplaced heroes map
//     them to players unambiguously (units.json placement x objects-units
//     uabi x the -skin upro field, which names the historical figure):
//
//     P0  Huns        Attila             A00N Superior Tactics  +damage, +5 armour aura
//     P1  Franks      Childeric I        A01N Dispair           -enemy attack damage
//     P2  Saxons      Eadwacer           A00Q (silence)         enemies cannot cast
//     P3  West Rome   Roman General      A021 Local Support     summon 12 at a City
//     P4  Visigoths   Alaric             A01C Fury              +10 flat attack
//     P5  Vandals     Gaiseric           A01E Rally             +200% movement speed
//     P6  Britons     Vortigern          A00P Druidic Power     +500% life regen
//     P7  Persians    Bahram V           A01A Old Hatred        +50% attack speed
//     P8  Ostrogoths  Theodoric          A01B Willpower         +5 armour
//     P9  East Rome   Roman General      A021 Local Support
//     P10 North Rome  Roman General      A021 Local Support
//     P11 Burgundians Gundahar           A01Z Blood Pact        links 12, spreads damage
//
//  The composition each passive actually rewards, which is where history
//  only breaks ties:
//   * FLAT per-unit buffs (+10 attack, +5 armour, +damage+armour) are worth
//     proportionally most on cheap massed bodies -- +10 on a 25-attack
//     Warrior is +40%, on a 50-attack Cavalry it is +20%. Visigoths,
//     Ostrogoths and Huns therefore mass.
//   * Blood Pact links exactly 12 units, and a train order in this map
//     spawns exactly a squad of 12. Burgundians mass for the same reason.
//   * PROPORTIONAL buffs (+50% attack speed) are worth most on high-damage
//     units, so Persia goes heavy and mounted.
//   * MOBILITY (+200% move speed) is a raiding tool: Vandals ride.
//   * SUSTAIN (+500% regen) and enemy-damage reduction pay off on units that
//     stand and take hits: Britons and Franks go heavy melee.
//   * Rome summons its reinforcements at a City, which is a defensive kit,
//     and is the only side with the Praetor line -- so it stays balanced and
//     infantry-weighted.
//
//  Weights are percentages across roles 0..3 (cheap melee, heavy melee,
//  ranged, cavalry) and sum to 100; siege is decided separately by the ram
//  rule (item 8). The draw runs on the map single seeded stream.
//---------------------------------------------------------------------------
function AI_RoleWeight takes integer pid, integer role returns integer
    if pid == 0 then                        // Huns: mass under an aura, and horse
        if role == 0 then
            return 40
        elseif role == 1 then
            return 15
        elseif role == 2 then
            return 10
        endif
        return 35
    elseif pid == 1 then                    // Franks: blunt the enemy, then stand
        if role == 0 then
            return 20
        elseif role == 1 then
            return 45
        elseif role == 2 then
            return 15
        endif
        return 20
    elseif pid == 2 then                    // Saxons: cheap bodies and missiles
        if role == 0 then
            return 40
        elseif role == 1 then
            return 20
        elseif role == 2 then
            return 30
        endif
        return 10
    elseif pid == 4 then                    // Visigoths: Fury is flat, so mass
        if role == 0 then
            return 50
        elseif role == 1 then
            return 20
        elseif role == 2 then
            return 15
        endif
        return 15
    elseif pid == 5 then                    // Vandals: Rally is a raiding tool
        if role == 0 then
            return 25
        elseif role == 1 then
            return 15
        elseif role == 2 then
            return 10
        endif
        return 50
    elseif pid == 6 then                    // Britons: regen rewards big bodies
        if role == 0 then
            return 25
        elseif role == 1 then
            return 45
        elseif role == 2 then
            return 20
        endif
        return 10
    elseif pid == 7 then                    // Persia: attack speed is proportional
        if role == 0 then
            return 15
        elseif role == 1 then
            return 35
        elseif role == 2 then
            return 15
        endif
        return 35
    elseif pid == 8 then                    // Ostrogoths: flat armour, so mass
        if role == 0 then
            return 45
        elseif role == 1 then
            return 25
        elseif role == 2 then
            return 15
        endif
        return 15
    elseif pid == 11 then                   // Burgundians: Blood Pact links 12
        if role == 0 then
            return 45
        elseif role == 1 then
            return 25
        elseif role == 2 then
            return 20
        endif
        return 10
    endif
    // Rome (3, 9, 10): a defensive summon kit and the only Praetor line
    if role == 0 then
        return 25
    elseif role == 1 then
        return 35
    elseif role == 2 then
        return 25
    endif
    return 15
endfunction

// Draw a role from this faction weights, on the single seeded stream.
function AI_PickRole takes integer pid returns integer
    local integer r = ModuloInteger(AI_Rand(), 100)
    if r < AI_RoleWeight(pid, 0) then
        return 0
    endif
    set r = r - AI_RoleWeight(pid, 0)
    if r < AI_RoleWeight(pid, 1) then
        return 1
    endif
    set r = r - AI_RoleWeight(pid, 1)
    if r < AI_RoleWeight(pid, 2) then
        return 2
    endif
    return 3
endfunction

// Faction unit ids. Each player trains its own visual variant of the same
// role. Round 3 kept this three-way (Rome / Persia / the rest) deliberately:
// the map ships six more cosmetic variants of each barbarian role, but they
// are STAT-IDENTICAL and nothing in the script maps a variant to a faction,
// so picking one per tribe would be inventing an association the artifact
// does not contain. The tribal difference lives in AI_RoleWeight instead.
function AI_UnitFor takes integer pid, integer role returns integer
    // role 0 cheap melee, 1 heavy melee, 2 ranged, 3 cavalry, 4 siege ram
    if ai_role[pid] == AI_ROLE_ROME then
        if role == 0 then
            return 'h00B'
        elseif role == 1 then
            return 'h00C'
        elseif role == 2 then
            return 'n001'
        elseif role == 3 then
            return 'h00A'
        endif
        return 'h025'
    endif
    if GetPlayerId(ai_p[pid]) == 7 then
        // Persia
        if role == 0 then
            return 'h019'
        elseif role == 1 then
            return 'h00T'
        elseif role == 2 then
            return 'n007'
        elseif role == 3 then
            return 'h01B'
        endif
        return 'h025'
    endif
    if role == 0 then
        return 'h007'
    elseif role == 1 then
        return 'h006'
    elseif role == 2 then
        return 'n000'
    elseif role == 3 then
        return 'h005'
    endif
    return 'h025'
endfunction

function AI_IsStructure takes unit u returns boolean
    return IsUnitType(u, UNIT_TYPE_STRUCTURE)
endfunction

// Combat value of one live unit: cost, scaled by health fraction and veterancy.
function AI_CV takes unit u returns real
    local real mx
    local real hp
    local real lv
    if u == null or GetUnitState(u, UNIT_STATE_LIFE) <= 0.405 then
        return 0.0
    endif
    if AI_IsStructure(u) then
        return 0.0
    endif
    set mx = GetUnitState(u, UNIT_STATE_MAX_LIFE)
    if mx <= 0.0 then
        return 0.0
    endif
    set hp = GetUnitState(u, UNIT_STATE_LIFE) / mx
    set lv = I2R(GetUnitLevel(u))
    if lv < 1.0 then
        set lv = 1.0
    endif
    return AI_BaseCost(GetUnitTypeId(u)) * hp * (1.0 + 0.12*(lv - 1.0))
endfunction

//===========================================================================
//  Order economy
//
//  AI_TryOrder is the ONLY place this module issues a movement order. It
//  refuses to re-issue an order the unit already has, and it refuses to
//  exceed the caller's per-tick budget. Both are why the round-1 build
//  produced a per-second order storm across the whole army.
//===========================================================================

// true when the unit does not already carry this exact order
function AI_NeedsOrder takes unit u, integer kind, real x, real y, integer tid returns boolean
    local integer h = GetHandleId(u)
    if GetUnitCurrentOrder(u) == 0 then
        return true                       // idle: it has lost or finished its order
    endif
    if LoadInteger(ai_ht, h, 0) != kind then
        return true
    endif
    if LoadInteger(ai_ht, h, 4) != tid then
        return true
    endif
    if AI_Dist(LoadReal(ai_ht, h, 1), LoadReal(ai_ht, h, 2), x, y) > AI_ORDER_TOL then
        return true
    endif
    return (ai_now - LoadReal(ai_ht, h, 3)) >= AI_ORDER_REFRESH
endfunction

function AI_TryOrder takes unit u, integer kind, real x, real y, unit tgt returns nothing
    local integer h = GetHandleId(u)
    local integer tid = 0
    if tgt != null then
        set tid = GetHandleId(tgt)
    endif
    if not AI_NeedsOrder(u, kind, x, y, tid) then
        return
    endif
    if ai_issued >= ai_budget then
        return                            // this player has spent its tick
    endif
    set ai_issued = ai_issued + 1
    set ai_ordersTick = ai_ordersTick + 1
    call SaveInteger(ai_ht, h, 0, kind)
    call SaveReal(ai_ht, h, 1, x)
    call SaveReal(ai_ht, h, 2, y)
    call SaveReal(ai_ht, h, 3, ai_now)
    call SaveInteger(ai_ht, h, 4, tid)
    if kind == AI_ORD_MOVE then
        call IssuePointOrder(u, "move", x, y)
    elseif kind == AI_ORD_ATTACKP then
        call IssuePointOrder(u, "attack", x, y)
    elseif kind == AI_ORD_UNLOAD then
        // point form: the transport sails there and drops its cargo
        call IssuePointOrder(u, "unloadall", x, y)
    elseif kind == AI_ORD_LOAD then
        // "smart" on a transport is the board order; the unit walks to it
        if tgt != null then
            call IssueTargetOrder(u, "smart", tgt)
        endif
    elseif tgt != null then
        call IssueTargetOrder(u, "attack", tgt)
    endif
endfunction

//===========================================================================
//  Point and gate registry
//===========================================================================

function AI_RegisterFilter takes nothing returns boolean
    local integer t = GetUnitTypeId(GetFilterUnit())
    if t == 'n003' or t == 'h000' or t == 'h001' or t == 'h009' or t == 'h002' then
        return true
    endif
    if t == 'h00J' or t == 'n00E' or t == 'n00F' or t == 'n008' or t == 'n009' then
        return true
    endif
    return false
endfunction

function AI_RegisterEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if ai_pointCount < AI_MAX_POINTS then
        set ai_pt[ai_pointCount]     = u
        set ai_ptKind[ai_pointCount] = AI_PointKind(GetUnitTypeId(u))
        set ai_ptX[ai_pointCount]    = GetUnitX(u)
        set ai_ptY[ai_pointCount]    = GetUnitY(u)
        set ai_pointCount = ai_pointCount + 1
    endif
    set u = null
endfunction

// The four gate orientations, three unit types each. Established from the
// map script: Trig_Open_* / Trig_Close_* replace the unit with the sibling
// type, and the closed type is the only one carrying a pathing texture.
function AI_GateOrient takes integer t returns integer
    if t == 'h01N' or t == 'h01P' or t == 'h01O' then
        return 0
    endif
    if t == 'h01Q' or t == 'h01S' or t == 'h01R' then
        return 1
    endif
    if t == 'h01T' or t == 'h01V' or t == 'h01U' then
        return 2
    endif
    if t == 'h01W' or t == 'h01X' or t == 'h01Y' then
        return 3
    endif
    return -1
endfunction

function AI_GateFilter takes nothing returns boolean
    return AI_GateOrient(GetUnitTypeId(GetFilterUnit())) >= 0
endfunction

function AI_GateEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if ai_gateCount < AI_MAX_GATES then
        set ai_gate[ai_gateCount]   = u
        set ai_gateX[ai_gateCount]  = GetUnitX(u)
        set ai_gateY[ai_gateCount]  = GetUnitY(u)
        set ai_gateOr[ai_gateCount] = AI_GateOrient(GetUnitTypeId(u))
        set ai_gateCd[ai_gateCount] = 0.0
        set ai_gateStuck[ai_gateCount] = false
        set ai_gateCount = ai_gateCount + 1
    endif
    set u = null
endfunction

// A closed gate blocks (it is the only variant with a pathing texture); an
// open one, and a dead one, are a hole in the wall.
function AI_GateState takes integer i returns integer
    local unit u = ai_gate[i]
    local integer t
    local integer r = AI_GS_GONE
    if u != null and GetUnitState(u, UNIT_STATE_LIFE) > 0.405 then
        set t = GetUnitTypeId(u)
        if t == 'h01N' or t == 'h01Q' or t == 'h01T' or t == 'h01W' then
            set r = AI_GS_CLOSED
        elseif t == 'h01P' or t == 'h01S' or t == 'h01V' or t == 'h01X' then
            set r = AI_GS_OPEN
        endif
    endif
    set u = null
    return r
endfunction

function AI_GateLifeFrac takes integer i returns real
    local unit u = ai_gate[i]
    local real mx
    local real r = 1.0
    if u != null then
        set mx = GetUnitState(u, UNIT_STATE_MAX_LIFE)
        if mx > 0.0 then
            set r = GetUnitState(u, UNIT_STATE_LIFE) / mx
        endif
    endif
    set u = null
    return r
endfunction

function AI_GateOpenType takes integer orient returns integer
    if orient == 0 then
        return 'h01P'
    endif
    if orient == 1 then
        return 'h01S'
    endif
    if orient == 2 then
        return 'h01V'
    endif
    return 'h01X'
endfunction

// Ours to open: we own it, or an ally does.
function AI_GateIsOurs takes integer pid, integer i returns boolean
    if ai_gate[i] == null then
        return false
    endif
    return GetOwningPlayer(ai_gate[i]) == ai_p[pid] or IsPlayerAlly(GetOwningPlayer(ai_gate[i]), ai_p[pid])
endfunction

// What crossing this gate costs us, in map units of equivalent detour. This
// is the ONE place the round-2 playtest complaint is answered -- "if there is
// a pre-existing hole in the gate, instead of sieging that gate ... you can
// choke them easily". A hole is free, our own gate is nearly free because we
// can simply open it, and an enemy gate costs a siege priced by how much of
// it is still standing, so a half-broken gate beats a fresh one.
// How far off the march line this crossing is worth looking for. A breach is
// free, so it earns a wide search; anything we must open or break earns only
// the narrow one. ROUND 4, finding 7.
function AI_GateCorridor takes integer pid, integer i returns real
    if AI_GateState(i) != AI_GS_CLOSED then
        return AI_GATE_CORRIDOR_FREE
    endif
    return AI_GATE_CORRIDOR
endfunction

function AI_GateCost takes integer pid, integer i returns real
    if AI_GateState(i) != AI_GS_CLOSED then
        return 0.0                        // an existing breach: free
    endif
    if AI_GateIsOurs(pid, i) then
        return AI_GATE_OWN
    endif
    // ROUND 5, the Gray jam. A crossing we have no way to PERFORM is not a
    // cheap crossing, it is a wall to stand in front of. An army with no
    // siege cannot meaningfully hurt a 2000 HP armour-5 gate -- the
    // screenshot was eight damage -- so a break we cannot execute is priced
    // out of the comparison and any breach, own gate or longer way round
    // wins instead. It is still finite: if it is the ONLY crossing we take
    // it, buy rams (AI_WALL_MEM) and chew, rather than idling forever.
    if not wm_hasSiege[pid] then
        return AI_GATE_BREAK * AI_GateLifeFrac(i) + AI_NOBREAK_COST
    endif
    return AI_GATE_BREAK * AI_GateLifeFrac(i)
endfunction

function AI_GateShutType takes integer orient returns integer
    if orient == 0 then
        return 'h01N'
    endif
    if orient == 1 then
        return 'h01Q'
    endif
    if orient == 2 then
        return 'h01T'
    endif
    return 'h01W'
endfunction

function AI_BuildRegistry takes nothing returns nothing
    local group g = CreateGroup()
    local integer i = 0
    local integer j = 0
    call GroupEnumUnitsInRect(g, GetPlayableMapRect(), Filter(function AI_RegisterFilter))
    call ForGroup(g, function AI_RegisterEnum)
    call DestroyGroup(g)
    set g = CreateGroup()
    call GroupEnumUnitsInRect(g, GetPlayableMapRect(), Filter(function AI_GateFilter))
    call ForGroup(g, function AI_GateEnum)
    call DestroyGroup(g)
    set g = null
    // fogged memory starts empty for every player
    loop
        exitwhen i >= AI_MAX_PLAYERS
        set j = 0
        loop
            exitwhen j >= ai_pointCount
            set ai_ptOwner[i*AI_MAX_POINTS + j] = -1
            set ai_ptSeen[i*AI_MAX_POINTS + j]  = -9999.0
            set ai_ptDef[i*AI_MAX_POINTS + j]   = 0.0
            set j = j + 1
        endloop
        set i = i + 1
    endloop
endfunction

//===========================================================================
//  LAND CONNECTIVITY  (round 3, the prerequisite for queue item 2)
//
//  Which registered points can be WALKED between. Built once at init from
//  the engine own pathing, by linking points that are close together and
//  have a walkable straight line between them, then unioning the links.
//
//  Two deliberate limits, both stated rather than hidden:
//   * it is a POINT graph, not a terrain flood fill. JASS arrays cap at
//     8192 entries and this map is 61440 units square, so a grid fill does
//     not fit; 400 registered points and their near neighbours do.
//   * it is used for exactly ONE decision -- does this objective need a
//     boat. It never filters targets and never changes a score for a land
//     objective, so a mislabelled component can cost a wasted transport and
//     nothing else. A false split in this graph must not be able to break
//     the land game, which is the whole of the rest of this module.
//
//  Ground truth for the shape it should find (flood-filling war3map.wpm
//  offline, three connectivity variants, DESIGN.md 8.6): exactly one of
//  twelve starts is water-locked, P6 Britons, and every other faction
//  including the Vandals walks to both capitals.
//===========================================================================

function AI_Find takes integer a returns integer
    loop
        exitwhen ai_comp[a] == a
        set ai_comp[a] = ai_comp[ai_comp[a]]   // path halving
        set a = ai_comp[a]
    endloop
    return a
endfunction

function AI_Union takes integer a, integer b returns nothing
    local integer ra = AI_Find(a)
    local integer rb = AI_Find(b)
    if ra != rb then
        set ai_comp[ra] = rb
    endif
endfunction

// IsTerrainPathable is INVERTED: it returns true when the terrain BLOCKS
// that pathing type. So a walkable sample is a false.
function AI_LandLine takes real ax, real ay, real bx, real by returns boolean
    local integer i = 1
    local real f
    loop
        exitwhen i >= AI_LINK_SAMPLES
        set f = I2R(i) / I2R(AI_LINK_SAMPLES)
        if IsTerrainPathable(ax + (bx-ax)*f, ay + (by-ay)*f, PATHING_TYPE_WALKABILITY) then
            return false
        endif
        set i = i + 1
    endloop
    return true
endfunction

function AI_BuildLandGraph takes nothing returns nothing
    local integer i = 0
    local integer j
    loop
        exitwhen i >= ai_pointCount
        set ai_comp[i] = i
        set i = i + 1
    endloop
    set i = 0
    loop
        exitwhen i >= ai_pointCount
        set j = i + 1
        loop
            exitwhen j >= ai_pointCount
            // the component test first: it makes most pairs cost one compare
            if AI_Dist(ai_ptX[i], ai_ptY[i], ai_ptX[j], ai_ptY[j]) <= AI_LINK_R and AI_Find(i) != AI_Find(j) then
                if AI_LandLine(ai_ptX[i], ai_ptY[i], ai_ptX[j], ai_ptY[j]) then
                    call AI_Union(i, j)
                endif
            endif
            set j = j + 1
        endloop
        set i = i + 1
    endloop
endfunction

// Component of the registered point nearest (x,y), or -1 if there are none.
function AI_CompAt takes real x, real y returns integer
    local integer i = 0
    local integer best = -1
    local real bd = 999999.0
    local real d
    loop
        exitwhen i >= ai_pointCount
        set d = AI_Dist(ai_ptX[i], ai_ptY[i], x, y)
        if d < bd then
            set bd = d
            set best = i
        endif
        set i = i + 1
    endloop
    if best < 0 then
        return -1
    endif
    return AI_Find(best)
endfunction

// Does reaching this point require crossing water? Measured from where the
// ARMY is, not from home, so that once a crossing has landed the naval layer
// stands itself down instead of trying to board all over again.
function AI_NeedsBoat takes integer pid, integer i returns boolean
    if wm_fieldComp[pid] < 0 or i < 0 or i >= ai_pointCount then
        return false
    endif
    return AI_Find(i) != wm_fieldComp[pid]
endfunction

// ROUND 4, findings 5 and 8. Whether this objective is worth a BOAT, which
// is a different question from whether it is on another landmass.
//
// Case 1 is the honest one: a different component, so there is no land route
// at all. Case 2 is the Vandals. Round 3's flood fill says they are
// land-connected to Europe and that is true -- via Egypt and Anatolia, which
// is most of the map -- so connectivity answered "yes, walk" where the owner
// reports they should be shipping. The straight line crossing water, over a
// distance where walking around is a real detour, is much closer to the right
// question and costs eight terrain samples.
function AI_WantsCrossing takes integer pid, integer i returns boolean
    if i < 0 or i >= ai_pointCount then
        return false
    endif
    if AI_NeedsBoat(pid, i) then
        return true
    endif
    if AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid]) < AI_SEA_MIN then
        return false
    endif
    return not AI_LandLine(wm_fieldX[pid], wm_fieldY[pid], ai_ptX[i], ai_ptY[i])
endfunction

//===========================================================================
//  World scan
//===========================================================================

function AI_OwnUnitFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and GetUnitState(GetFilterUnit(), UNIT_STATE_LIFE) > 0.405
endfunction

function AI_SumOwnArmy takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real cv = AI_CV(u)
    if GetUnitTypeId(u) == 'h025' or GetUnitTypeId(u) == 'h00S' then
        set ai_accSiege = ai_accSiege + 1
    endif
    if cv > 0.0 then
        set ai_accCV = ai_accCV + cv
        // ROUND 7: a LOADED unit reports its transport position, not its own.
        // Letting cargo vote on where the army is drags the centroid out to
        // sea and then makes the sea-origin water test want more boats -- a
        // self-reinforcing loop. Cargo counts towards strength, never towards
        // position.
        if not IsUnitLoaded(u) then
            set ai_accX  = ai_accX + GetUnitX(u)*cv
            set ai_accY  = ai_accY + GetUnitY(u)*cv
            set ai_accW  = ai_accW + cv
        endif
        set ai_accHP = ai_accHP + GetUnitState(u, UNIT_STATE_LIFE)
        set ai_accHPMax = ai_accHPMax + GetUnitState(u, UNIT_STATE_MAX_LIFE)
        set ai_accN  = ai_accN + 1
    endif
    set u = null
endfunction

// Only counts enemies the AI player can actually SEE. This is the fog contract.
function AI_SumVisibleEnemy takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real cv
    if IsUnitEnemy(u, ai_curP) and IsUnitVisible(u, ai_curP) then
        set cv = AI_CV(u)
        if cv > 0.0 then
            set ai_accCV = ai_accCV + cv
            set ai_accX  = ai_accX + GetUnitX(u)*cv
            set ai_accY  = ai_accY + GetUnitY(u)*cv
            set ai_accW  = ai_accW + cv
        endif
    endif
    set u = null
endfunction

//---------------------------------------------------------------------------
//  ROUND 7 -- A CENTROID IS NOT A POSITION.
//
//  Measured against the map's own war3map.wpm (1920x1920 cells at 32 units,
//  walkable = flag & 0x02 == 0, calibrated on six known-land points): the
//  STARTING field centroid of all three Roman powers is IN THE SEA --
//  West Rome (-4056,-14352), East Rome (16714,-13819), North Rome
//  (-21062,-54). The nine other factions are on land.
//
//  wm_fieldX/Y is a CV-weighted mean, and for an empire spread around a sea
//  -- Italy, Gaul, Hispania, Africa -- that mean is not a place. Everything
//  geometric then measures from open water:
//    * AI_WantsCrossing runs its water test FROM the centroid, so the line to
//      almost any objective is wet and West Rome and North Rome measure
//      wantsBoat = TRUE on their own nearest target. That is the
//      "West Rome: boarding a transport" report, and the milder form of the
//      hero-in-a-boat.
//    * the naval gather point, the ram hold point and the lane normal are all
//      derived from it, which is "transport parked in the middle of the sea".
//
//  So the centroid is VALIDATED as a position before anything is measured
//  from it: if the weighted mean is not walkable it snaps to the nearest real
//  unit standing on real ground, and to home if there is none. The snap costs
//  one extra enumeration and only for a faction that actually needs it -- nine
//  of twelve never pay it.
//---------------------------------------------------------------------------

function AI_SnapEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real d
    if AI_IsStructure(u) or GetUnitState(u, UNIT_STATE_LIFE) <= 0.405 or IsUnitLoaded(u) then
        set u = null
        return
    endif
    set d = AI_Dist(GetUnitX(u), GetUnitY(u), ai_snapX, ai_snapY)
    if d < ai_snapD then
        set ai_snapD = d
        set ai_snapBX = GetUnitX(u)
        set ai_snapBY = GetUnitY(u)
    endif
    set u = null
endfunction

// Make wm_fieldX/Y a real place. Returns true when it had to be moved.
function AI_ValidateField takes integer pid returns boolean
    local group g
    // IsTerrainPathable is INVERTED: true means BLOCKED.
    if not IsTerrainPathable(wm_fieldX[pid], wm_fieldY[pid], PATHING_TYPE_WALKABILITY) then
        return false                        // already a place
    endif
    set ai_snapX = wm_fieldX[pid]
    set ai_snapY = wm_fieldY[pid]
    set ai_snapD = 999999.0
    set ai_snapBX = ai_homeX[pid]
    set ai_snapBY = ai_homeY[pid]
    set ai_curP = ai_p[pid]
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
    call ForGroup(g, function AI_SnapEnum)
    call DestroyGroup(g)
    set g = null
    set wm_fieldX[pid] = ai_snapBX
    set wm_fieldY[pid] = ai_snapBY
    return true
endfunction

function AI_ResetAcc takes nothing returns nothing
    set ai_accCV = 0.0
    set ai_accX = 0.0
    set ai_accY = 0.0
    set ai_accW = 0.0
    set ai_accHP = 0.0
    set ai_accHPMax = 0.0
    set ai_accN = 0
    set ai_accSiege = 0
endfunction

// Refresh the fogged memory of ONE SLICE of the registry for this player.
// Slicing bounds the cost of a think tick: at most AI_SCAN_SLICE points are
// examined and only the visible ones pay for a group enumeration.
function AI_RefreshPointMemory takes integer pid returns nothing
    local integer done = 0
    local integer i
    local integer k
    local unit u
    local group g
    if ai_pointCount <= 0 then
        return
    endif
    set i = ai_scanCursor[pid]
    loop
        exitwhen done >= AI_SCAN_SLICE or done >= ai_pointCount
        if i >= ai_pointCount then
            set i = 0
        endif
        set u = ai_pt[i]
        set k = pid*AI_MAX_POINTS + i
        if u != null and IsUnitVisible(u, ai_p[pid]) then
            set ai_ptOwner[k] = GetPlayerId(GetOwningPlayer(u))
            set ai_ptSeen[k]  = ai_now
            // visible defenders around it
            set g = CreateGroup()
            call GroupEnumUnitsInRange(g, ai_ptX[i], ai_ptY[i], 800.0, null)
            call AI_ResetAcc()
            set ai_curP = ai_p[pid]
            call ForGroup(g, function AI_SumVisibleEnemy)
            set ai_ptDef[k] = ai_accCV
            call DestroyGroup(g)
            set g = null
        endif
        set i = i + 1
        set done = done + 1
    endloop
    set ai_scanCursor[pid] = i
    set u = null
endfunction

function AI_ScanWorld takes integer pid returns nothing
    local player p = ai_p[pid]
    local group g
    local integer i = 0
    local integer k
    local integer cnt = 0
    local integer yards = 0
    local integer capIdx = -1
    local real capDist = 999999.0
    local real capDef = 0.0
    local real cd
    local real nearest = 999999.0
    local boolean landWorth = false
    local boolean capThreat = false
    local boolean capLost = false
    local real asset = 0.0
    local real v

    set wm_gold[pid]    = I2R(GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD))
    set wm_lumber[pid]  = I2R(GetPlayerState(p, PLAYER_STATE_RESOURCE_LUMBER))
    set wm_food[pid]    = I2R(GetPlayerState(p, PLAYER_STATE_RESOURCE_FOOD_USED))
    // ROUND 3 BUG FIX. Round 2 read PLAYER_STATE_FOOD_CAP_CEILING, which is
    // the UPPER BOUND on the cap, not the cap. The map sets that ceiling to
    // 100 for everyone, then 200 for Persia and 300 for each Roman, while the
    // cap you actually have is produced by your buildings (25 per city, 10
    // per town, per the map own tooltips). A barbarian with a 100 ceiling and
    // 30 supply believed it had 70 food of headroom and issued train orders
    // that could never succeed -- wasted orders and an army that never grew.
    // PLAYER_STATE_RESOURCE_FOOD_CAP is the real cap.
    set wm_foodCap[pid] = I2R(GetPlayerState(p, PLAYER_STATE_RESOURCE_FOOD_CAP))
    set wm_canRaze[pid] = (GetPlayerTechMaxAllowed(p, 'R008') != 0)
    // ROUND 4: ask the game whether a dead hero can be replaced, exactly the
    // way wm_canRaze asks about razing. In THIS build the answer is no,
    // because Trig_Melee_Initialization disables R007 for everyone and never
    // re-enables it -- but the AI does not assume that, it checks.
    set wm_canReplaceHero[pid] = (GetPlayerTechMaxAllowed(p, AI_HERO_REPLACE) != 0)
    if wm_foodCap[pid] <= 0.0 then
        // A player with no settlements really does have no headroom. The
        // floor exists only to keep the CONSOLIDATE divisor non-zero -- it
        // must NOT be a plausible cap, or the round-2 bug comes straight
        // back in a new disguise.
        set wm_foodCap[pid] = 1.0
    endif

    // whole-army CV and centroid
    set ai_curP = p
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, p, Filter(function AI_OwnUnitFilter))
    call AI_ResetAcc()
    call ForGroup(g, function AI_SumOwnArmy)
    call DestroyGroup(g)
    set g = null
    set wm_army[pid] = ai_accCV
    set wm_hasSiege[pid] = (ai_accSiege > 0)
    if ai_accW > 0.0 then
        set wm_fieldX[pid] = ai_accX / ai_accW
        set wm_fieldY[pid] = ai_accY / ai_accW
    else
        set wm_fieldX[pid] = ai_homeX[pid]
        set wm_fieldY[pid] = ai_homeY[pid]
    endif
    if ai_accHPMax > 0.0 then
        set wm_fieldHPFrac[pid] = ai_accHP / ai_accHPMax
    else
        set wm_fieldHPFrac[pid] = 1.0
    endif
    // ROUND 7: before ANYTHING geometric is measured from it. Every later
    // consumer -- the water test, the nearest-target scan, the march origin,
    // the lane normal, the ram hold point -- assumes this is a place.
    if AI_ValidateField(pid) then
        call AI_Say(pid, "regrouping - the army was too scattered to have a centre")
    endif

    // garrison = own CV near home
    set g = CreateGroup()
    call GroupEnumUnitsInRange(g, ai_homeX[pid], ai_homeY[pid], AI_HOME_R, Filter(function AI_OwnUnitFilter))
    call AI_ResetAcc()
    call ForGroup(g, function AI_SumOwnArmy)
    call DestroyGroup(g)
    set g = null
    set wm_garrison[pid] = ai_accCV
    set wm_fieldCV[pid]  = AI_Max(0.0, wm_army[pid] - wm_garrison[pid])

    // visible threat near home
    set g = CreateGroup()
    call GroupEnumUnitsInRange(g, ai_homeX[pid], ai_homeY[pid], AI_HOME_R, null)
    call AI_ResetAcc()
    call ForGroup(g, function AI_SumVisibleEnemy)
    call DestroyGroup(g)
    set g = null
    set wm_threat[pid] = ai_accCV
    if ai_accW > 0.0 then
        set wm_threatX[pid] = ai_accX / ai_accW
        set wm_threatY[pid] = ai_accY / ai_accW
    else
        set wm_threatX[pid] = ai_homeX[pid]
        set wm_threatY[pid] = ai_homeY[pid]
    endif

    // visible enemy near the field army
    set g = CreateGroup()
    call GroupEnumUnitsInRange(g, wm_fieldX[pid], wm_fieldY[pid], AI_FIELD_R, null)
    call AI_ResetAcc()
    call ForGroup(g, function AI_SumVisibleEnemy)
    call DestroyGroup(g)
    set g = null
    set wm_fieldEnemyCV[pid] = ai_accCV

    call AI_RefreshPointMemory(pid)

    // ROUND 3: which landmass the army is standing on. One O(points) scan per
    // think tick, the same order of cost as AI_BestTarget, and the only input
    // the naval layer needs.
    set wm_fieldComp[pid] = AI_CompAt(wm_fieldX[pid], wm_fieldY[pid])

    // owned point counts, capital status, and the value of what is under
    // threat -- the last one is what stops a raid on a bare control point
    // from pulling the whole army home (playtest fault 2).
    loop
        exitwhen i >= ai_pointCount
        set k = pid*AI_MAX_POINTS + i
        if ai_pt[i] != null and not (GetOwningPlayer(ai_pt[i]) == p or IsPlayerAlly(GetOwningPlayer(ai_pt[i]), p)) then
            // ROUND 3: is anything worth taking still reachable on foot? This
            // is the ONE conditional that can lift a shipyard above its
            // near-zero table value, and it is deliberately narrow: only a
            // player with nothing left to walk to wants a boat at all.
            if AI_Find(i) == wm_fieldComp[pid] and AI_PointValue(ai_ptKind[i]) >= AI_VAL_CP then
                set landWorth = true
            endif
            // nearest enemy capital and the garrison we can SEE around it --
            // the two inputs to the round-3 readiness gate (queue item 4)
            // ROUND 5: the faction's own distance scale -- how far away its
            // nearest objective is. A frontier empire must not have every
            // objective crushed by a proximity term calibrated on a barbarian
            // whose neighbours are 3000 units away.
            set cd = AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid])
            if cd < nearest then
                set nearest = cd
            endif
            if ai_ptKind[i] == AI_PK_CAPITAL then
                if cd < capDist then
                    set capDist = cd
                    set capIdx = i
                    set capDef = ai_ptDef[k]
                endif
            endif
        endif
        if ai_pt[i] != null and GetOwningPlayer(ai_pt[i]) == p then
            if ai_ptKind[i] == AI_PK_SHIPYARD then
                set yards = yards + 1
            endif
            if ai_ptKind[i] == AI_PK_CP then
                set cnt = cnt + 1
            endif
            if wm_threat[pid] > 0.0 and AI_Dist(ai_ptX[i], ai_ptY[i], wm_threatX[pid], wm_threatY[pid]) < AI_HOME_R then
                set v = AI_PointValue(ai_ptKind[i])
                if v > asset then
                    set asset = v
                endif
                if ai_ptKind[i] == AI_PK_CAPITAL then
                    set capThreat = true
                endif
            endif
        endif
        set i = i + 1
    endloop
    set wm_cpOwn[pid] = cnt
    // Want a boat only when the reachable landmass is exhausted AND we do not
    // already hold a shipyard to build one from. Anything wider than this
    // recreates round 2 finding 5, where shipyards outscored real objectives.
    set wm_landLeft[pid] = landWorth
    set wm_wantBoat[pid] = (not landWorth) and yards == 0
    if nearest > 999998.0 then
        set nearest = AI_PROX_MIN
    endif
    if nearest < AI_PROX_MIN then
        set nearest = AI_PROX_MIN
    endif
    set wm_proxScale[pid] = nearest
    set wm_capIdx[pid] = capIdx
    set wm_capReady[pid] = AI_CapReadiness(wm_army[pid], capDef)
    set wm_capThreat[pid] = capThreat
    set wm_asset[pid] = asset

    // Rome only: is a capital that should be ours no longer ours?
    if ai_role[pid] == AI_ROLE_ROME then
        set capLost = not (GetOwningPlayer(gg_unit_h000_0008) == Player(3) or GetOwningPlayer(gg_unit_h000_0008) == Player(10) or GetOwningPlayer(gg_unit_h000_0092) == Player(9) or GetOwningPlayer(gg_unit_h000_0092) == Player(10))
    endif
    set wm_capLost[pid] = capLost
    set p = null
endfunction

//===========================================================================
//  Target selection
//===========================================================================

function AI_TargetScore takes integer pid, integer i returns real
    local integer k = pid*AI_MAX_POINTS + i
    local real v
    local real prox
    local real weak
    local real stale
    local real sw
    local unit u = ai_pt[i]

    if u == null then
        return 0.0
    endif
    // owned by me or an ally: not a target
    if GetOwningPlayer(u) == ai_p[pid] or IsPlayerAlly(GetOwningPlayer(u), ai_p[pid]) then
        return 0.0
    endif

    set v = AI_PointValueIdx(pid, i)
    // ROUND 3, the conditional shipyard term. A shipyard is worth ~nothing
    // (AI_VAL_SHIPYARD = 0.02) because naval warfare does not decide this
    // map. The single exception is a player that has run out of things to
    // walk to: for that player a shipyard ON ITS OWN LANDMASS is the way off
    // it, and only then. Raising the table value globally is exactly the bug
    // round 2 finding 5 reported, so the lift lives here and nowhere else.
    if ai_ptKind[i] == AI_PK_SHIPYARD and wm_wantBoat[pid] and not AI_NeedsBoat(pid, i) then
        set v = AI_VAL_CP * 1.10
    endif
    set prox = 1.0 / (1.0 + AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid]) / wm_proxScale[pid])
    set weak = AI_C01(1.0 - ai_ptDef[k] / (wm_army[pid] + 60.0))
    set stale = 1.0 - 0.35*AI_C01((ai_now - ai_ptSeen[k]) / 240.0)
    if ai_target[pid] == i then
        set sw = 1.0
    else
        set sw = 0.86
    endif
    // ROUND 3, queue item 7. A harasser is looking for something different:
    // OUTLYING and UNDEFENDED. Squaring the weakness term punishes any
    // garrison much harder, and the flatter distance falloff stops the AI
    // preferring whatever happens to be under its nose -- being out on the
    // flank is the job, not a cost.
    if ai_harasser[pid] then
        set weak = weak * weak
        set prox = 1.0 / (1.0 + AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid]) / (2.15*wm_proxScale[pid]))
    endif
    // ROUND 4, findings 5 and 8: the phase rule. While anything uncontested
    // remains on our own landmass it outranks everything across water. This is
    // what stops six land-connected barbarians building transports for a
    // control point across a strait, and it is what makes an island faction
    // clear its island FIRST instead of shipping out at minute one.
    if wm_landLeft[pid] and AI_WantsCrossing(pid, i) then
        set sw = sw * AI_CROSS_PENALTY
    endif
    // ROUND 3, the claim ledger: do not duplicate an ally's objective. A
    // DISCOUNT and not a veto, so a claimed point is still taken when it is
    // the only thing worth taking, and claims expire so a dead ally cannot
    // reserve half the map.
    if ai_claim[i] >= 0 and ai_claim[i] != pid and (ai_now - ai_claimAt[i]) < AI_CLAIM_TTL then
        if IsPlayerAlly(ai_p[ai_claim[i]], ai_p[pid]) then
            set sw = sw * AI_CLAIM_PENALTY
        endif
    endif
    set u = null
    return v * prox * weak * stale * sw * (1.0 + AI_Noise(AI_NoiseAmp(pid)*0.5))
endfunction

// Returns the best point index, or -1. Sets ai_accCV to the raw best score.
function AI_BestTarget takes integer pid returns integer
    local integer i = 0
    local integer best = -1
    local real bs = 0.0
    local real s
    loop
        exitwhen i >= ai_pointCount
        set s = AI_TargetScore(pid, i)
        if s > bs then
            set bs = s
            set best = i
        endif
        set i = i + 1
    endloop
    set ai_accCV = bs
    return best
endfunction

// Index of the nearest enemy-held capital, or -1.
function AI_CapitalTarget takes integer pid returns integer
    local integer i = 0
    local integer best = -1
    local real bd = 999999.0
    local real d
    loop
        exitwhen i >= ai_pointCount
        if ai_ptKind[i] == AI_PK_CAPITAL and ai_pt[i] != null then
            if not (GetOwningPlayer(ai_pt[i]) == ai_p[pid] or IsPlayerAlly(GetOwningPlayer(ai_pt[i]), ai_p[pid])) then
                set d = AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid])
                if d < bd then
                    set bd = d
                    set best = i
                endif
            endif
        endif
        set i = i + 1
    endloop
    return best
endfunction

//===========================================================================
//  Approach routing
//
//  Playtest faults (3) and (4): "serious pathing issues (if you open one
//  door they just get routed around to the worse route or if there is a
//  pre-existing hole in the gate, instead of sieging that gate, allowing
//  you to choke them easily)" and "AI does not know how to use gates".
//
//  A single attack-move at a distant objective hands the whole route to the
//  engine, which will happily walk an army the long way round a wall. This
//  picks a crossing before it marches and moves to THAT as a waypoint, and
//  only then engages.
//
//  ROUND 3 -- THE GATE JAM. Round 2 asked the wrong question. It only ever
//  considered a gate within a fixed radius of the OBJECTIVE, which can only
//  find the wall being broken INTO; the wall an army must cross on the way
//  OUT of its own city sits at the far end of the march and was therefore
//  never a candidate, ai_apGate stayed -1, and the open branch could not
//  fire. Measured on the shipped map, home -> nearest non-owned objective:
//  Player 3 owns 22 gates and round 2 considered 0 of them, Player 10 owns
//  18 and considered 0, and three of Player 9s gates sit 38, 85 and 1420
//  units off its own exit line -- ON it -- while round 2 saw none of them
//  because they are 7.2k-8.9k away from the objective. The army attack-moved
//  at something distant, walked into its own shut gate and stopped, which is
//  exactly the screenshot the owner sent.
//
//  Round 3 asks: which walls does the SEGMENT from here to the objective
//  cross? Every gate is projected onto that segment; it is a candidate when
//  its projection lands inside the segment (0 <= t <= 1) and it lies within
//  AI_GATE_CORRIDOR of the line. Walls are crossed in t order -- the nearest
//  first -- and inside one wall (t values within AI_GATE_SAMEWALL) the
//  CHEAPEST crossing wins, by AI_GateCost: a breach is free, our own gate is
//  nearly free, an enemy gate costs a siege. That cost ordering is the
//  round-2 fix being re-expressed rather than inherited, and trace.py pins
//  it: on a wall carrying both a hole and an intact gate, the hole wins.
//===========================================================================

function AI_ChooseApproach takes integer pid, real tx, real ty returns nothing
    local real fx = wm_fieldX[pid]
    local real fy = wm_fieldY[pid]
    local real dx = tx - fx
    local real dy = ty - fy
    local real len2 = dx*dx + dy*dy
    local real direct = SquareRoot(len2)
    local integer i = 0
    local integer best = -1
    local real bestT = 2.0
    local real bestCost = 999999.0
    local real t
    local real perp
    local real cost

    set ai_apGate[pid] = -1
    set ai_apBreak[pid] = false
    set ai_apX[pid] = tx
    set ai_apY[pid] = ty
    if len2 <= 0.0 or direct < AI_APPROACH_MIN then
        return                              // already on top of it
    endif

    // pass 1 -- the FIRST wall on the march: smallest t inside the corridor
    loop
        exitwhen i >= ai_gateCount
        if ai_gate[i] != null and not ai_gateStuck[i] then
            set t = ((ai_gateX[i]-fx)*dx + (ai_gateY[i]-fy)*dy) / len2
            if t >= 0.0 and t <= 1.0 and t < bestT then
                set perp = AI_Dist(ai_gateX[i], ai_gateY[i], fx + dx*t, fy + dy*t)
                if perp <= AI_GateCorridor(pid, i) then
                    set bestT = t
                    set best = i
                endif
            endif
        endif
        set i = i + 1
    endloop
    if best < 0 then
        return                              // no wall between us and it
    endif

    // pass 2 -- the cheapest crossing of THAT wall
    set i = 0
    loop
        exitwhen i >= ai_gateCount
        if ai_gate[i] != null and not ai_gateStuck[i] then
            set t = ((ai_gateX[i]-fx)*dx + (ai_gateY[i]-fy)*dy) / len2
            if t >= 0.0 and t <= 1.0 and (t - bestT) <= AI_GATE_SAMEWALL then
                set perp = AI_Dist(ai_gateX[i], ai_gateY[i], fx + dx*t, fy + dy*t)
                if perp <= AI_GateCorridor(pid, i) then
                    // crossing cost plus the real detour it imposes
                    set cost = AI_GateCost(pid, i) + AI_Dist(fx, fy, ai_gateX[i], ai_gateY[i]) + AI_Dist(ai_gateX[i], ai_gateY[i], tx, ty) - direct
                    if cost < bestCost then
                        set bestCost = cost
                        set best = i
                    endif
                endif
            endif
        endif
        set i = i + 1
    endloop

    set ai_apGate[pid] = best
    // The waypoint sits just PAST the gate, along the march line. Ordering the
    // army AT the gate parks it in the doorway; ordering it through makes the
    // crossing a waypoint the army actually clears, after which the gate falls
    // behind the segment (t < 0), drops out of the candidate set, and the next
    // tick routes at the objective itself. That progression is the answer to
    // "if you open one door they just get routed around to the worse route" --
    // the crossing is walked to deliberately instead of being left to the
    // engine pathfinder to find or ignore.
    set ai_apX[pid] = ai_gateX[best] + AI_GATE_ENTRY*dx/direct
    set ai_apY[pid] = ai_gateY[best] + AI_GATE_ENTRY*dy/direct
    // We only have to BREAK a crossing that is shut and not ours. An own gate
    // on our path is opened instead -- unconditionally, see AI_ManageGates.
    set ai_apBreak[pid] = (AI_GateState(best) == AI_GS_CLOSED) and not AI_GateIsOurs(pid, best)
    if ai_apBreak[pid] then
        set ai_wallSince[pid] = ai_now      // ROUND 5: rams stay justified
    endif
endfunction

//===========================================================================
//  Goal scoring
//===========================================================================

//---------------------------------------------------------------------------
//  ROUND 4, FINDING 1 -- "Red also got stuck at the first city".
//
//  The playtest screenshot is this module's own chat line, "Huns: massing at
//  home", over 25-plus Hun units stacked in their own city doing nothing, for
//  most of a game. It is a REGRESSION THIS PROJECT INTRODUCED IN ROUND 3, and
//  the mechanism is worth stating exactly because it is a trap anyone would
//  fall into again.
//
//  AI_ScoreConsolidate weights its first term 0.78, and that term compared the
//  army against wantArmy = 350 + 750*clock -- a pure CLOCK RAMP with no
//  relation to what the player can actually field. Round 3 fixed wm_foodCap to
//  read the REAL cap instead of the 100/200/300 ceiling. Both changes are
//  individually right and together they deadlock: a food-capped AI now
//  correctly knows it cannot train (AI_Spend refuses), while CONSOLIDATE keeps
//  demanding an army it can never build -- and because wantArmy grows with the
//  clock while a capped army cannot, the urge to sit at home RISES all game.
//  Measured on the round-3 build, barbarian at 96/100 food with a control
//  point 3000 away:
//
//      t= 300  CONSOLIDATE 0.440  EXPAND 0.333
//      t= 600  CONSOLIDATE 0.413  EXPAND 0.306
//      t= 900  CONSOLIDATE 0.449  EXPAND 0.279
//      t=1500  CONSOLIDATE 0.533  EXPAND 0.225
//
//  CONSOLIDATE never loses, and the gap widens. That is the whole finding.
//
//  The fix is a POSSIBILITY gate, not a smaller number: massing is only worth
//  scoring if massing can happen. You cannot buy an army you have no supply
//  for, and in this map the only way to raise supply is to take settlements
//  (25 per city, 10 per town) -- so an AI at its cap must expand, and
//  expanding is what raises the cap. That is the self-reinforcing territory
//  loop DESIGN.md 9.2 identified, finally wired into the scorer.
//---------------------------------------------------------------------------

// Can this player actually convert standing still into army? Zero when there
// is no room for even one squad, or no gold to buy one with.
function AI_CanMass takes integer pid returns real
    local real headroom = wm_foodCap[pid] - wm_food[pid]
    local real room = AI_C01(headroom / AI_SQUAD_FOOD)
    local real purse = AI_C01(wm_gold[pid] / AI_SQUAD_GOLD)
    if room < purse then
        return room
    endif
    return purse
endfunction

// Is more army even wanted? Once we are at or past the target there is
// nothing consolidation can buy, and a rich faction must not read its own
// treasury as a reason to stay home. ROUND 5, finding 4.
function AI_WantsMore takes integer pid returns real
    local real wantArmy = 350.0 + 750.0*AI_Clock()
    return AI_C01((wantArmy - wm_army[pid]) / (AI_WANT_BAND * wantArmy))
endfunction

function AI_ScoreConsolidate takes integer pid returns real
    local real clock = AI_Clock()
    local real wantArmy = 350.0 + 750.0*clock
    local real a = wm_army[pid]
    local real s
    set s = 0.78 * AI_C01((wantArmy - a) / wantArmy)
    set s = s + 0.22 * AI_C01(wm_gold[pid] / 900.0)
    set s = s + 0.15 * AI_C01((wm_foodCap[pid] - wm_food[pid]) / wm_foodCap[pid]) * AI_C01(wm_gold[pid] / 400.0)
    // ROUND 4: the possibility gate. An AI that cannot train must not want to.
    // ROUND 5: and the sufficiency gate. An AI that already HAS its army must
    // not want to either, however much gold it is sitting on.
    return s * AI_CanMass(pid) * AI_WantsMore(pid)
endfunction

// Playtest fault (2), "barbarians center on where they are being attacked".
// Two damping terms, both of which the round-1 design claimed and neither of
// which actually worked:
//   * write-off now compares the threat with the WHOLE army. The old form,
//     T > 2.2*(A + garrison), double-counted the garrison (it is a subset of
//     A), so the bar sat about 3x higher than intended and the AI defended
//     positions it could not hold.
//   * an asset gate. A threat that endangers nothing we own -- an army
//     merely walking past -- must not read as an emergency.
function AI_ScoreDefend takes integer pid returns real
    local real a = wm_army[pid]
    local real t = wm_threat[pid]
    local real outmatched
    local real raw
    local real assetF
    if t <= 0.0 then
        return 0.0
    endif
    set outmatched = AI_C01(t / (0.60*a + 150.0))
    set raw = 0.92*outmatched + 0.35*AI_C01(t/500.0)
    // do not defend a lost position: overwhelming force and not a capital
    if t > AI_WRITEOFF*a and not wm_capThreat[pid] then
        // Writing a position off has to COLLAPSE the urge to defend it, not
        // merely reduce it: an additive penalty still loses to a large
        // outmatched term, which is precisely the case where the army should
        // be saved instead.
        return raw * 0.18
    endif
    set assetF = AI_DEF_FLOOR + (1.0 - AI_DEF_FLOOR) * AI_C01(wm_asset[pid] / AI_VAL_CP)
    set raw = raw * assetF
    if wm_capThreat[pid] then
        set raw = raw + 0.85
    endif
    return raw
endfunction

function AI_ScoreExpand takes integer pid returns real
    local real clock = AI_Clock()
    local integer best = AI_BestTarget(pid)
    local real bs
    set ai_bestT[pid] = best
    set ai_bestS[pid] = ai_accCV
    if best < 0 then
        return 0.0
    endif
    // Normalise against a GOOD target, not the theoretical maximum. Dividing by
    // the capital value capped a plain control point at 0.28 and made
    // expansion lose to every other goal; 1.20 makes a nearby undefended point
    // score near 1.0 and a town or city saturate, which is the intent.
    set bs = AI_C01(ai_bestS[pid] / 1.20)
    return 0.86 * bs * AI_C01(wm_army[pid] / (260.0 + 240.0*clock)) * (1.0 - 0.45*clock)
endfunction

// ROUND 3, queue item 4. Round 2 multiplied appetite by a flat
// (0.30 + 0.95*clock) and valued the capital itself at a flat 4.00 -- between
// them, a standing instruction to beeline one. Both halves of the gate now
// live in wm_capReady: the clock window (shut before AI_CAP_T0, open by
// AI_CAP_T1) times the force ratio against the garrison actually observed.
// Early game a capital is worth little; late game with a real army it is
// decisive, which is what the map pays.
function AI_ScoreSiege takes integer pid returns real
    if ai_role[pid] == AI_ROLE_ROME then
        if wm_capLost[pid] then
            return 1.45
        endif
        return 0.0
    endif
    if wm_capIdx[pid] < 0 then
        return 0.0
    endif
    return AI_C01(wm_army[pid] / 900.0) * wm_capReady[pid]
endfunction

// ROUND 6 -- THE IMPOSSIBLE-GOAL INVARIANT. "Persia just sits around after
// winning a city", with gold 144, food 189/185 (OVER the cap), a full army
// inside the captured city and its rams idle outside an undamaged 500/500
// gate. Every production action that faction could take was unavailable by
// construction: it could not train (over food) and could not afford research
// (144 gold). Yet a production goal stayed selected, and a production goal's
// entire expression is production, so the AI executed nothing at all.
//
// The invariant, which generalises the round-5 fix that priced out a wall
// break we could not perform: A GOAL WHOSE ACTION IS IMPOSSIBLE MUST SCORE
// ZERO, NOT MERELY LESS. Round 5 gave CONSOLIDATE that gate (AI_CanMass).
// TECH never had one: at 144 gold it still scored ~0.065, which is small
// until every other goal is smaller, and then it wins and does nothing.
function AI_ScoreTech takes integer pid returns real
    local real clock = AI_Clock()
    if wm_gold[pid] < AI_TECH_MIN_GOLD or wm_lumber[pid] < AI_TECH_MIN_GOLD then
        return 0.0                          // no research in the Forge list is buyable
    endif
    return 0.58 * AI_C01(wm_gold[pid]/700.0) * AI_C01(wm_lumber[pid]/700.0) * (1.0 - 0.5*clock)
endfunction

function AI_ScoreRetreat takes integer pid returns real
    local real fcv = wm_fieldCV[pid]
    local real losing
    local real bleeding
    if fcv <= 1.0 then
        return 0.0
    endif
    // committed only when the army is genuinely away from home
    if AI_Dist(wm_fieldX[pid], wm_fieldY[pid], ai_homeX[pid], ai_homeY[pid]) < AI_HOME_R then
        return 0.0
    endif
    set losing = AI_C01((wm_fieldEnemyCV[pid] - 1.15*fcv) / AI_Max(200.0, fcv))
    set bleeding = AI_C01(1.0 - 1.6*wm_fieldHPFrac[pid])
    return 0.95*losing + 0.50*bleeding
endfunction

//---------------------------------------------------------------------------
//  POSTURE  (round 3, queue item 4)
//
//  A stance that persists. Goals are re-scored every tick; posture moves only
//  every AI_POSTURE_T, so an AI has a plan rather than a fresh opinion every
//  second. It branches on ROLE because the two sides play different games:
//  the three Romans hold ~72 control points between them and are trying not
//  to lose them, every barbarian holds 3-6 and is trying to accumulate.
//---------------------------------------------------------------------------

function AI_PostureName takes integer p returns string
    if p == POSTURE_PUSH then
        return "posture: pushing for a capital"
    elseif p == POSTURE_HARASS then
        return "posture: harassing the flanks"
    elseif p == POSTURE_CONSOLIDATE then
        return "posture: consolidating"
    endif
    return "posture: expanding"
endfunction

function AI_UpdatePosture takes integer pid returns nothing
    local integer np
    if ai_now < ai_postureAt[pid] then
        return
    endif
    set ai_postureAt[pid] = ai_now + AI_POSTURE_T
    if ai_role[pid] == AI_ROLE_ROME then
        if wm_capLost[pid] then
            set np = POSTURE_PUSH               // retaking it IS the win test
        elseif wm_threat[pid] > 0.35*wm_army[pid] then
            set np = POSTURE_CONSOLIDATE
        else
            set np = POSTURE_EXPAND
        endif
    else
        if ai_harasser[pid] then
            set np = POSTURE_HARASS             // assigned role, item 7
        elseif wm_army[pid] < 260.0 + 240.0*AI_Clock() and AI_CanMass(pid) > 0.5 then
            // ROUND 4, finding 1: "buy one" is only a posture if buying is
            // POSSIBLE. The same clock ramp that deadlocked the scorer would
            // otherwise pin a food-capped AI in a consolidating posture and
            // add AI_POSTURE_BIAS to the goal that already could not lose.
            set np = POSTURE_CONSOLIDATE        // no army yet, and we can fix that
        elseif wm_capReady[pid] >= AI_CAP_COMMIT then
            set np = POSTURE_PUSH
        else
            // the default, and deliberately so: food comes from settlements,
            // so territory is the only thing that raises the army ceiling
            set np = POSTURE_EXPAND
        endif
    endif
    if np != ai_posture[pid] then
        set ai_posture[pid] = np
        call AI_Say(pid, AI_PostureName(np))
    endif
endfunction

// The goal comparison, factored out so AI_SelectGoal can run it twice: once
// WITHOUT the posture bias to establish whether defence would have won, and
// once with it. Order of arguments is CONSOLIDATE, EXPAND, DEFEND, SIEGE,
// TECH, RETREAT.
function AI_ArgMaxGoal takes real sCon, real sExp, real sDef, real sSie, real sTec, real sRet returns integer
    local integer g = GOAL_CONSOLIDATE
    local real bs = sCon
    if sExp > bs then
        set bs = sExp
        set g = GOAL_EXPAND
    endif
    if sDef > bs then
        set bs = sDef
        set g = GOAL_DEFEND
    endif
    if sSie > bs then
        set bs = sSie
        set g = GOAL_SIEGE
    endif
    if sTec > bs then
        set bs = sTec
        set g = GOAL_TECH
    endif
    if sRet > bs then
        set bs = sRet
        set g = GOAL_RETREAT
    endif
    return g
endfunction

function AI_SelectGoal takes integer pid returns integer
    local real sCon = AI_ScoreConsolidate(pid)
    local real sDef = AI_ScoreDefend(pid)
    local real sExp = AI_ScoreExpand(pid)
    local real sSie = AI_ScoreSiege(pid)
    local real sTec = AI_ScoreTech(pid)
    local real sRet = AI_ScoreRetreat(pid)
    local real amp  = AI_NoiseAmp(pid)
    local integer bestGoal
    local boolean preempt

    set sCon = sCon + AI_Noise(amp)
    set sDef = sDef + AI_Noise(amp)
    set sExp = sExp + AI_Noise(amp)
    set sSie = sSie + AI_Noise(amp)
    set sTec = sTec + AI_Noise(amp)
    set sRet = sRet + AI_Noise(amp)

    // incumbency bonus stops a fast tick from vibrating between near-equal goals
    if ai_goal[pid] == GOAL_CONSOLIDATE then
        set sCon = sCon + 0.12
    elseif ai_goal[pid] == GOAL_DEFEND then
        set sDef = sDef + 0.12
    elseif ai_goal[pid] == GOAL_EXPAND then
        set sExp = sExp + 0.12
    elseif ai_goal[pid] == GOAL_SIEGE then
        set sSie = sSie + 0.12
    elseif ai_goal[pid] == GOAL_TECH then
        set sTec = sTec + 0.12
    elseif ai_goal[pid] == GOAL_RETREAT then
        set sRet = sRet + 0.12
    endif

    // ROUND 3, GUARD B. The posture layer biases which ACQUISITIVE goal we
    // prefer. It must never be able to talk the AI out of defending or
    // retreating: round 2 fixed "barbarians center on where they are being
    // attacked" with preemptive DEFEND/RETREAT, the army split and the
    // write-off, and a posture that overrides those is that same bug wearing
    // a strategy hat. So the comparison is run FIRST without the bias, and if
    // defence or retreat would have won, the bias is not applied at all.
    set bestGoal = AI_ArgMaxGoal(sCon, sExp, sDef, sSie, sTec, sRet)
    if bestGoal != GOAL_DEFEND and bestGoal != GOAL_RETREAT then
        if ai_posture[pid] == POSTURE_CONSOLIDATE then
            set sCon = sCon + AI_POSTURE_BIAS
        elseif ai_posture[pid] == POSTURE_PUSH then
            set sSie = sSie + AI_POSTURE_BIAS
        else
            // EXPAND and HARASS both want ground; HARASS differs in WHICH
            // ground, which is a targeting question, not a goal question.
            set sExp = sExp + AI_POSTURE_BIAS
        endif
        set bestGoal = AI_ArgMaxGoal(sCon, sExp, sDef, sSie, sTec, sRet)
    endif


    // DEFEND and RETREAT are preemptive; everything else respects the dwell.
    set preempt = (bestGoal == GOAL_DEFEND or bestGoal == GOAL_RETREAT)
    if not preempt and (ai_now - ai_goalSince[pid]) < AI_DWELL then
        return ai_goal[pid]
    endif
    return bestGoal
endfunction

//===========================================================================
//  Defence arithmetic (separated out so the trace harness can assert on it)
//===========================================================================

// Should the FIELD army abandon its objective and come home?
function AI_ShouldRecall takes integer pid returns boolean
    local real vObj = 0.0
    if wm_capThreat[pid] then
        return true
    endif
    if wm_threat[pid] <= AI_RECALL_RATIO * wm_garrison[pid] then
        return false                       // the garrison can deal with this
    endif
    if ai_target[pid] >= 0 then
        set vObj = AI_PointValueIdx(pid, ai_target[pid])
    endif
    return wm_asset[pid] > vObj
endfunction

// How much combat value may answer this threat. Capped, so a raid cannot
// swallow the whole army: "barbarians center on where they are attacked".
function AI_RespondBudget takes integer pid returns real
    local real need = 1.35*wm_threat[pid] - wm_garrison[pid]
    local real cap = AI_DEF_MAX_FRAC * wm_army[pid]
    if need <= 0.0 then
        return 0.0
    endif
    if need > cap then
        return cap
    endif
    return need
endfunction

//===========================================================================
//  Execution
//===========================================================================

// This unit lane, centred on zero: for AI_LANES = 5 the lanes are -2..2.
// Keyed off the handle id so a unit keeps the same lane every tick -- a lane
// that changed between ticks would be an order storm.
// The map's three cargo hulls, plus the artillery hull that has no hold.
// Nothing here is infantry and none of it may take a land order.
function AI_IsTransport takes unit u returns boolean
    local integer t = GetUnitTypeId(u)
    return t == 'h00R' or t == 'h026' or t == 'h00Q' or t == 'h00S'
endfunction

function AI_LaneOf takes unit u returns real
    return I2R(ModuloInteger(GetHandleId(u), ai_laneN) - ai_laneMid)
endfunction

// Set the formation width. Always odd so one lane stays on the march line, and
// the midpoint is set ALONGSIDE the count rather than derived, because JASS
// integer division truncates and the trace interpreter divides as a real --
// the round-3 lesson, kept.
function AI_SetLanes takes integer n returns nothing
    if n >= 5 then
        set ai_laneN = 5
        set ai_laneMid = 2
    elseif n >= 3 then
        set ai_laneN = 3
        set ai_laneMid = 1
    else
        set ai_laneN = 1
        set ai_laneMid = 0
    endif
endfunction

// Walkable distance from (x,y) along (sx,sy) before the ground stops being
// walkable, capped. IsTerrainPathable is INVERTED: true means blocked.
function AI_HalfSpan takes real x, real y, real sx, real sy returns real
    local integer i = 1
    local real span = 0.0
    local boolean blocked = false
    loop
        exitwhen i > AI_LANE_PROBE_N or blocked
        if IsTerrainPathable(x + sx*AI_LANE_PROBE*I2R(i), y + sy*AI_LANE_PROBE*I2R(i), PATHING_TYPE_WALKABILITY) then
            set blocked = true
        else
            set span = AI_LANE_PROBE*I2R(i)
            set i = i + 1
        endif
    endloop
    return span
endfunction

// How many lanes physically fit across the march line at (x,y).
function AI_LanesAt takes real x, real y returns integer
    local real width = AI_HalfSpan(x, y, ai_laneNX, ai_laneNY) + AI_HalfSpan(x, y, -ai_laneNX, -ai_laneNY)
    return R2I(width / AI_LANE_W)
endfunction

function AI_SendEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if AI_IsStructure(u) or GetUnitState(u, UNIT_STATE_LIFE) <= 0.405 then
        set u = null
        return
    endif
    // ROUND 3: a withdrawn hero stays withdrawn. Without this the think tick
    // would order it back to the front every time the micro tick pulled it
    // out, and the two layers would fight over an irreplaceable unit.
    if ai_heroOut[ai_curPid] and IsUnitType(u, UNIT_TYPE_HERO) then
        set u = null
        return
    endif
    // hold a garrison back when home is under threat: the round-1 build sent
    // literally every unit at the objective, which is half of "trying to move
    // everything at once"
    if ai_holdCV > 0.0 and AI_Dist(GetUnitX(u), GetUnitY(u), ai_homeX[ai_curPid], ai_homeY[ai_curPid]) < AI_HOME_R then
        set ai_holdCV = ai_holdCV - AI_CV(u)
        set u = null
        return
    endif
    // ROUND 5, finding 2. A transport is not infantry. Ordering it to
    // attack-move at a LAND objective makes the engine sail it as close as
    // water allows and stop -- which is, precisely, "parked in the middle of
    // the sea". West Rome starts with 6 h00R and 3 h00Q PREPLACED, so this
    // fired on nine boats it never even built. Boats are commanded by the
    // naval layer and by nothing else.
    if AI_IsTransport(u) then
        set u = null
        return
    endif
    // ROUND 5, findings 3 and 4. A unit already standing in the home radius
    // needs no order to go home. Round 4 re-issued "move home" to every idle
    // unit every tick, and with AI_ORDER_SLICE at 24 against a Roman army of
    // 139-185 preplaced units, CONSOLIDATE spent the ENTIRE order budget
    // telling troops that were already home to go home. That is the second
    // half of "the Romans do not use their starting units": they were
    // enrolled and scored all along, and every order slot was a no-op.
    if ai_ordKind == AI_ORD_MOVE and AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) < AI_HOME_R then
        set u = null
        return
    endif
    // ROUND 3, queue item 8: a ram with no wall to break holds behind the
    // line. It is the map own declared wall-breaker and nothing else.
    if GetUnitTypeId(u) == ai_ramType and not ai_ramWork then
        call AI_TryOrder(u, AI_ORD_MOVE, ai_ramX, ai_ramY, null)
        set u = null
        return
    endif
    if ai_ordKind == AI_ORD_ATTACKU then
        // focus fire converges: no lane offset on a specific target
        if AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) < AI_SIEGE_R then
            call AI_TryOrder(u, AI_ORD_ATTACKU, ai_orderX, ai_orderY, ai_orderTarget)
        else
            call AI_TryOrder(u, AI_ORD_ATTACKP, ai_orderX, ai_orderY, null)
        endif
    else
        // ROUND 3, queue item 10: march in lanes, not in one column
        call AI_TryOrder(u, ai_ordKind, ai_orderX + ai_laneNX*AI_LANE_W*AI_LaneOf(u), ai_orderY + ai_laneNY*AI_LANE_W*AI_LaneOf(u), null)
    endif
    set u = null
endfunction

function AI_SendArmy takes integer pid, real x, real y, integer kind, unit tgt returns nothing
    local group g = CreateGroup()
    local real dx = x - wm_fieldX[pid]
    local real dy = y - wm_fieldY[pid]
    local real d = SquareRoot(dx*dx + dy*dy)
    local integer n
    local integer k
    // ROUND 3, item 10: one march-line normal for the whole dispatch. Taking
    // it from the ARMY line rather than each unit own line is what keeps a
    // unit lane destination fixed while it walks, so lanes add no orders.
    if d > 1.0 then
        set ai_laneNX = -dy/d
        set ai_laneNY = dx/d
    else
        set ai_laneNX = 0.0
        set ai_laneNY = 0.0
    endif
    // ROUND 4, finding 3: size the formation to the ground it has to cross.
    // Sample the TIGHTEST point on the route -- a third of the way, two
    // thirds, and the destination -- because a bridge is usually between the
    // army and where it is going rather than at either end. One narrow sample
    // collapses the whole column to single file, which is the only formation
    // that fits a bridge.
    set n = AI_LanesAt(x, y)
    set k = AI_LanesAt(wm_fieldX[pid] + dx*0.34, wm_fieldY[pid] + dy*0.34)
    if k < n then
        set n = k
    endif
    set k = AI_LanesAt(wm_fieldX[pid] + dx*0.67, wm_fieldY[pid] + dy*0.67)
    if k < n then
        set n = k
    endif
    call AI_SetLanes(n)
    // ROUND 3, item 8: where a ram waits when there is no wall to break --
    // AI_RAM_HOLD_R back from the army, towards home.
    // ROUND 6: a waiting ram sits just BEHIND THE ARMY on the march line, not
    // back towards home. The screenshot showed Persia's rams parked outside
    // the walls of a city the army had already taken -- because the old hold
    // point was "towards home", which from a freshly captured city is
    // backwards, i.e. the wall they had just come through. Rams belong with
    // the army, one step back, so they arrive at the NEXT wall with it.
    if d > 1.0 then
        set ai_ramX = wm_fieldX[pid] - (dx/d)*AI_RAM_HOLD_R
        set ai_ramY = wm_fieldY[pid] - (dy/d)*AI_RAM_HOLD_R
    else
        set ai_ramX = wm_fieldX[pid]
        set ai_ramY = wm_fieldY[pid]
    endif
    set ai_ramType = AI_UnitFor(pid, 4)
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_orderX = x
    set ai_orderY = y
    set ai_ordKind = kind
    set ai_orderTarget = tgt
    set ai_issued = 0
    set ai_budget = AI_ORDER_SLICE
    set ai_holdCV = 0.0
    if wm_threat[pid] > 0.0 then
        set ai_holdCV = AI_C01(wm_threat[pid] / 400.0) * 0.55 * wm_army[pid]
    endif
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
    call ForGroup(g, function AI_SendEnum)
    call DestroyGroup(g)
    set g = null
    set ai_orderTarget = null
endfunction

// Only units near the threat answer it, and only up to a CV budget.
function AI_RespondEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real cv
    if AI_IsStructure(u) or GetUnitState(u, UNIT_STATE_LIFE) <= 0.405 then
        set u = null
        return
    endif
    if ai_respCV >= ai_respBudget then
        set u = null
        return
    endif
    if AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) > AI_RESPOND_R then
        set u = null
        return
    endif
    set cv = AI_CV(u)
    set ai_respCV = ai_respCV + cv
    call AI_TryOrder(u, AI_ORD_ATTACKP, ai_orderX, ai_orderY, null)
    set u = null
endfunction

function AI_Respond takes integer pid, real x, real y, real budget returns nothing
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_orderX = x
    set ai_orderY = y
    set ai_respCV = 0.0
    set ai_respBudget = budget
    set ai_issued = 0
    set ai_budget = AI_ORDER_SLICE
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
    call ForGroup(g, function AI_RespondEnum)
    call DestroyGroup(g)
    set g = null
endfunction

// ---- gate control -------------------------------------------------------

function AI_GateScanEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if IsUnitEnemy(u, ai_curP) and IsUnitVisible(u, ai_curP) then
        set ai_accCV = ai_accCV + AI_CV(u)
    elseif GetOwningPlayer(u) == ai_curP and not AI_IsStructure(u) then
        set ai_accW = ai_accW + AI_CV(u)
        set ai_accN = ai_accN + 1
    endif
    set u = null
endfunction

// Enemy CV (ai_accCV), own CV (ai_accW) and own field units (ai_accN) at a gate.
function AI_GateScan takes integer pid, integer i returns nothing
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    call AI_ResetAcc()
    call GroupEnumUnitsInRange(g, ai_gateX[i], ai_gateY[i], AI_GATE_GUARD, null)
    call ForGroup(g, function AI_GateScanEnum)
    call DestroyGroup(g)
    set g = null
endfunction

function AI_SetGate takes integer i, integer newType returns nothing
    local unit u = ai_gate[i]
    local integer before
    local boolean opening
    if u == null then
        return
    endif
    set before = AI_GateState(i)
    set opening = (newType == AI_GateOpenType(ai_gateOr[i]))
    // The map itself performs exactly this transition in Trig_Open_* and
    // Trig_Close_*; we do it directly rather than through the ability, because
    // the ability order string cannot be verified headlessly. The map cooldown
    // (20 s, BlzStartUnitAbilityCooldown) is imposed on ourselves instead --
    // see ai_gateCd. Owned gates only.
    call ReplaceUnitBJ(u, newType, bj_UNIT_STATE_METHOD_RELATIVE)
    set ai_gate[i] = GetLastReplacedUnitBJ()
    // ROUND 3: the map's own actions also play the animation. Without it an
    // opened gate is passable but can still LOOK shut, which is exactly the
    // kind of thing a playtester reports as "the gate did not open".
    if opening then
        call SetUnitAnimation(ai_gate[i], "Death Alternate")
    else
        call SetUnitAnimation(ai_gate[i], "stand")
    endif
    set ai_gateCd[i] = ai_now + AI_GATE_CD
    // ROUND 3: self-verify. If the state did not actually change, latch the
    // gate as stuck; AI_ChooseApproach then routes around it instead of
    // waiting forever on a crossing that will never open. A silent failure
    // becomes an adaptive one.
    if AI_GateState(i) == before then
        set ai_gateStuck[i] = true
    endif
    set u = null
endfunction

// Open the crossing we intend to use; shut one the enemy is standing in.
//
// ROUND 3: an OWN gate on our crossing opens UNCONDITIONALLY. Round 2 wrapped
// this in an enemy-proximity check, which is the wrong place for it -- an army
// that cannot leave its own city because an enemy is visible is an army that
// never leaves. The enemy check belongs only to the decision to shut a gate
// again, which is where it now lives.
function AI_ManageGates takes integer pid returns nothing
    local integer i = 0
    local integer st
    local integer ap = ai_apGate[pid]
    if ap >= 0 and ap < ai_gateCount and ai_now >= ai_gateCd[ap] then
        if AI_GateIsOurs(pid, ap) and AI_GateState(ap) == AI_GS_CLOSED then
            call AI_SetGate(ap, AI_GateOpenType(ai_gateOr[ap]))
            return                         // one toggle per tick
        endif
    endif
    loop
        exitwhen i >= ai_gateCount
        if ai_gate[i] != null and GetOwningPlayer(ai_gate[i]) == ai_p[pid] and ai_now >= ai_gateCd[i] then
            set st = AI_GateState(i)
            if st == AI_GS_OPEN and i != ap then
                call AI_GateScan(pid, i)
                if ai_accCV > 0.0 and ai_accN == 0 then
                    call AI_SetGate(i, AI_GateShutType(ai_gateOr[i]))
                    return
                endif
            endif
        endif
        set i = i + 1
    endloop
endfunction

// ---- stall backstop -----------------------------------------------------
//
// Everything above models gates. Nothing models mountain passes, bridges or
// any other chokepoint, and a toggle can still fail in a way we did not
// predict. So a blocked exit is made a first-class failure state: if the army
// has not closed on its objective for AI_STALL_T seconds, force the nearest
// own shut gate open and let the next tick re-path.

function AI_ForceOpenNear takes integer pid, real x, real y returns boolean
    local integer i = 0
    local integer best = -1
    local real bd = AI_STALL_R
    local real d
    loop
        exitwhen i >= ai_gateCount
        if ai_gate[i] != null and AI_GateIsOurs(pid, i) and ai_now >= ai_gateCd[i] then
            if AI_GateState(i) == AI_GS_CLOSED then
                set d = AI_Dist(ai_gateX[i], ai_gateY[i], x, y)
                if d < bd then
                    set bd = d
                    set best = i
                endif
            endif
        endif
        set i = i + 1
    endloop
    if best < 0 then
        return false
    endif
    call AI_SetGate(best, AI_GateOpenType(ai_gateOr[best]))
    return true
endfunction

// True when the army has stopped closing on its objective.
function AI_TrackProgress takes integer pid, real tx, real ty returns boolean
    local real d = AI_Dist(wm_fieldX[pid], wm_fieldY[pid], tx, ty)
    if d < ai_progD[pid] - AI_STALL_EPS then
        set ai_progD[pid] = d              // making ground
        set ai_progAt[pid] = ai_now
        return false
    endif
    if d > ai_progD[pid] + AI_STALL_EPS then
        set ai_progD[pid] = d              // new objective, or pushed back
        set ai_progAt[pid] = ai_now
        return false
    endif
    return (ai_now - ai_progAt[pid]) >= AI_STALL_T
endfunction

// ---- naval transport (round 3, queue item 2) ----------------------------
//
// Board, cross, unload. Nothing else. The crossing is UNCONTESTED -- nobody
// fights at sea in this map -- so there is no escort, no interception and no
// naval engagement model, and the whole thing hands straight back to the land
// layer the moment the cargo is ashore.
//
// Every order still goes through AI_TryOrder, including load and unload, or
// this undoes the round-2 order economy.

function AI_ShipFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and GetUnitTypeId(GetFilterUnit()) == AI_NAV_SHIP and GetUnitState(GetFilterUnit(), UNIT_STATE_LIFE) > 0.405
endfunction

function AI_YardFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and GetUnitTypeId(GetFilterUnit()) == AI_NAV_SHIPYARD and GetUnitState(GetFilterUnit(), UNIT_STATE_LIFE) > 0.405
endfunction

function AI_NavPickEnum takes nothing returns nothing
    if ai_navPick == null then
        set ai_navPick = GetEnumUnit()
    endif
endfunction

function AI_FindShip takes integer pid returns unit
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_navPick = null
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_ShipFilter))
    call ForGroup(g, function AI_NavPickEnum)
    call DestroyGroup(g)
    set g = null
    return ai_navPick
endfunction

function AI_FindYard takes integer pid returns unit
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_navPick = null
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_YardFilter))
    call ForGroup(g, function AI_NavPickEnum)
    call DestroyGroup(g)
    set g = null
    return ai_navPick
endfunction

function AI_LoadedEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if IsUnitLoaded(u) then
        set ai_navLoaded = ai_navLoaded + 1
    endif
    set u = null
endfunction

// How many of our units are currently aboard something. IsUnitLoaded is the
// engine own answer, so the state machine self-verifies rather than assuming
// an order took.
function AI_CountLoaded takes integer pid returns integer
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_navLoaded = 0
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
    call ForGroup(g, function AI_LoadedEnum)
    call DestroyGroup(g)
    set g = null
    return ai_navLoaded
endfunction

function AI_BoardEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if u == ai_orderTarget or AI_IsStructure(u) or GetUnitState(u, UNIT_STATE_LIFE) <= 0.405 or IsUnitLoaded(u) then
        set u = null
        return
    endif
    // ROUND 5, finding 2. The owner's whole account of West Rome's game was
    // "build troops in Rome, load its hero into a transport, and just put
    // said transport in the middle of the sea". A hero is the single
    // highest-value unit a faction owns and it was boarding first, alone,
    // and then being abandoned when the goal flipped. A hero crosses with
    // its army or not at all -- so it boards only once the army is aboard.
    if IsUnitType(u, UNIT_TYPE_HERO) and ai_navLoaded < AI_NAV_MIN_LOAD then
        set u = null
        return
    endif
    // A boat is not cargo either.
    if AI_IsTransport(u) then
        set u = null
        return
    endif
    if AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) <= AI_NAV_BOARD_R then
        call AI_TryOrder(u, AI_ORD_LOAD, ai_orderX, ai_orderY, ai_orderTarget)
    else
        call AI_TryOrder(u, AI_ORD_MOVE, ai_orderX, ai_orderY, null)
    endif
    set u = null
endfunction

// ROUND 5, finding 2 -- the invariant the round-4 state machine lacked:
// NO TRANSPORT IS EVER LEFT WITH CARGO AND NO DESTINATION.
//
// The failure was structural, not arithmetic. AI_NavStep is only reachable
// from AI_MoveOnTarget, which only runs under EXPAND or SIEGE. West Rome
// briefly picked a cross-water objective, the naval layer began boarding,
// the goal then flipped to CONSOLIDATE -- which round-5 finding 4 shows it
// could never leave -- and the naval layer was never called again. A boat
// with the hero aboard sat at its rally in open water for the rest of the
// game, exactly as reported. So this runs EVERY think tick for EVERY
// player, whatever the goal, and it is the only place that can end a
// crossing.
function AI_NavIdle takes integer pid returns nothing
    local unit ship
    if ai_navState[pid] == AI_NAV_NONE then
        return
    endif
    if ai_target[pid] >= 0 and AI_WantsCrossing(pid, ai_target[pid]) then
        return                               // a real crossing is in progress
    endif
    // No crossing objective any more. Put the cargo back on our own shore.
    set ship = AI_FindShip(pid)
    if ship != null then
        set ai_issued = 0
        set ai_budget = AI_ORDER_SLICE
        call AI_TryOrder(ship, AI_ORD_UNLOAD, ai_homeX[pid], ai_homeY[pid], null)
        call AI_Say(pid, "bringing the transport home - the crossing is off")
    endif
    set ai_navState[pid] = AI_NAV_NONE
    set ai_navShip[pid] = null
    set ship = null
endfunction

// True when the naval layer has taken this tick and the caller must NOT also
// issue a land march.
function AI_NavStep takes integer pid, integer t returns boolean
    local unit ship
    local unit yard
    local group g
    local integer loaded
    if not AI_WantsCrossing(pid, t) then
        set ai_navState[pid] = AI_NAV_NONE  // walkable from here: stand down
        set ai_navShip[pid] = null
        return false
    endif
    if ai_now < ai_navAt[pid] then
        return true                         // an order is already in flight
    endif
    set ai_navAt[pid] = ai_now + AI_NAV_CD
    set ship = AI_FindShip(pid)
    if ship == null then
        set yard = AI_FindYard(pid)
        if yard != null and wm_gold[pid] >= AI_NAV_SHIP_G and wm_lumber[pid] >= AI_NAV_SHIP_L then
            call IssueImmediateOrderById(yard, AI_NAV_SHIP)
            call AI_Say(pid, "building a transport - the objective is across water")
        endif
        set ai_navState[pid] = AI_NAV_NONE
        set yard = null
        return false                        // nothing to ferry with yet
    endif
    set ai_navShip[pid] = ship
    set loaded = AI_CountLoaded(pid)
    if ai_navState[pid] != AI_NAV_SAIL then
        if ai_navState[pid] != AI_NAV_LOAD then
            set ai_navState[pid] = AI_NAV_LOAD
            set ai_navSince[pid] = ai_now
            call AI_Say(pid, "boarding a transport")
        endif
        // sail on a full enough boat, or when boarding has stopped making
        // progress -- a stuck loader must not strand the whole army
        if loaded >= AI_NAV_MIN_LOAD or (ai_now - ai_navSince[pid]) >= AI_NAV_LOAD_T then
            set ai_navState[pid] = AI_NAV_SAIL
        else
            set ai_curP = ai_p[pid]
            set ai_curPid = pid
            set ai_orderTarget = ship
            set ai_orderX = GetUnitX(ship)
            set ai_orderY = GetUnitY(ship)
            set ai_issued = 0
            set ai_budget = AI_ORDER_SLICE
            set g = CreateGroup()
            call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
            call ForGroup(g, function AI_BoardEnum)
            call DestroyGroup(g)
            set g = null
            set ai_orderTarget = null
            set ship = null
            return true
        endif
    endif
    // Sailing. ONE order: the point form of unloadall makes the engine sail
    // there and beach the cargo, so we model neither the route nor the shore.
    set ai_issued = 0
    set ai_budget = AI_ORDER_SLICE
    call AI_TryOrder(ship, AI_ORD_UNLOAD, ai_ptX[t], ai_ptY[t], null)
    if loaded <= 0 and (ai_now - ai_navSince[pid]) > AI_NAV_LOAD_T then
        set ai_navState[pid] = AI_NAV_NONE  // cargo ashore: back to the land layer
        call AI_Say(pid, "landed across the water")
    endif
    set ship = null
    return true
endfunction

// ---- heroes (round 3, queue item 5) -------------------------------------

// How badly hurt our hero may get before we pull it, and how healed it must
// be to go back in. A replaceable hero is a 250-gold setback and worth
// risking; an irreplaceable one is worth protecting.
function AI_HeroBreak takes integer pid returns real
    if wm_canReplaceHero[pid] then
        return AI_HERO_BREAK_R
    endif
    return AI_HERO_BREAK
endfunction

function AI_HeroEngage takes integer pid returns real
    if wm_canReplaceHero[pid] then
        return AI_HERO_ENGAGE_R
    endif
    return AI_HERO_ENGAGE
endfunction

function AI_EnemyHeroEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real d
    if IsUnitEnemy(u, ai_curP) and IsUnitVisible(u, ai_curP) and IsUnitType(u, UNIT_TYPE_HERO) and GetUnitState(u, UNIT_STATE_LIFE) > 0.405 then
        // ROUND 4, finding 6: the LEASH. A candidate must be near the army
        // (reachable) AND near the anchor (not a chase away from what we are
        // actually here to do). Round 3 only had the first test, and because
        // the army centroid follows the chase, that bound moved with the
        // target and therefore bounded nothing.
        if AI_Dist(GetUnitX(u), GetUnitY(u), ai_anchorX, ai_anchorY) <= ai_heroLeash then
            set d = AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY)
            if d < ai_heroDist then
                set ai_heroDist = d
                set ai_heroTarget = u
            endif
        endif
    endif
    set u = null
endfunction

// Nearest VISIBLE enemy hero within AI_HERO_HUNT_R of the field army, or null.
// Bounded by that radius on purpose: this is a local focus-fire override, not
// a map-wide chase, so it can never pull an army off across the board.
function AI_FindEnemyHero takes integer pid, real ax, real ay, real leash returns unit
    local group g = CreateGroup()
    set ai_anchorX = ax
    set ai_anchorY = ay
    set ai_heroLeash = leash
    set ai_curP = ai_p[pid]
    set ai_orderX = wm_fieldX[pid]
    set ai_orderY = wm_fieldY[pid]
    set ai_heroTarget = null
    set ai_heroDist = AI_HERO_HUNT_R
    call GroupEnumUnitsInRange(g, wm_fieldX[pid], wm_fieldY[pid], AI_HERO_HUNT_R, null)
    call ForGroup(g, function AI_EnemyHeroEnum)
    call DestroyGroup(g)
    set g = null
    return ai_heroTarget
endfunction

function AI_OwnHeroEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if ai_heroUnit == null and IsUnitType(u, UNIT_TYPE_HERO) and GetUnitState(u, UNIT_STATE_LIFE) > 0.405 then
        set ai_heroUnit = u
    endif
    set u = null
endfunction

// Our own hero, played as a skirmisher with hysteresis. The break point is
// AI_HERO_BREAK (half health) rather than the 0.22 the rest of the army uses,
// because a hero lost here is lost for the game -- see the globals block.
function AI_HeroMicro takes integer pid returns nothing
    local group g = CreateGroup()
    local real frac
    local unit eh
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_heroUnit = null
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
    call ForGroup(g, function AI_OwnHeroEnum)
    call DestroyGroup(g)
    set g = null
    if ai_heroUnit == null then
        return
    endif
    set ai_issued = 0
    set ai_budget = AI_HERO_SLICE
    set frac = GetUnitState(ai_heroUnit, UNIT_STATE_LIFE) / AI_Max(1.0, GetUnitState(ai_heroUnit, UNIT_STATE_MAX_LIFE))
    if ai_heroOut[pid] then
        if frac >= AI_HeroEngage(pid) then
            set ai_heroOut[pid] = false          // healed: back to the line
        else
            call AI_TryOrder(ai_heroUnit, AI_ORD_MOVE, ai_homeX[pid], ai_homeY[pid], null)
            set ai_heroUnit = null
            return
        endif
    elseif frac <= AI_HeroBreak(pid) then
        set ai_heroOut[pid] = true
        call AI_Say(pid, "pulling the hero out - it cannot be replaced")
        call AI_TryOrder(ai_heroUnit, AI_ORD_MOVE, ai_homeX[pid], ai_homeY[pid], null)
        set ai_heroUnit = null
        return
    endif
    // Healthy: hit and run. If an enemy hero is in reach, that is the fight
    // worth taking; otherwise the hero rides with the normal field orders.
    // ROUND 4, finding 6: our hero skirmishes, it does not go hunting. The
    // anchor is the army itself on a short leash, so a hero cannot leave the
    // formation to chase -- "they overpush for hero aim".
    set eh = AI_FindEnemyHero(pid, wm_fieldX[pid], wm_fieldY[pid], AI_HERO_SOLO_R)
    if eh != null then
        set ai_issued = 0
        set ai_budget = AI_HERO_SLICE
        call AI_TryOrder(ai_heroUnit, AI_ORD_ATTACKU, GetUnitX(eh), GetUnitY(eh), eh)
    endif
    set eh = null
    set ai_heroUnit = null
endfunction

// Move on a registered point, crossing the wall deliberately.
function AI_MoveOnTarget takes integer pid, integer t returns nothing
    local integer gi
    local boolean stalled
    local unit eh
    // ROUND 3: water first. If the objective is on another landmass this
    // takes the tick entirely -- gates and walls are a land problem.
    if AI_NavStep(pid, t) then
        return
    endif
    // ROUND 3, queue item 5. A visible enemy hero near our army outranks the
    // objective: no revive trigger exists in this map and each player has
    // exactly one hero, so the kill is PERMANENT and worth more than any
    // building on the board. Bounded by AI_HERO_HUNT_R, so it is a focus and
    // never a chase across the map.
    // ROUND 4, finding 6: anchored to the OBJECTIVE, which does not move, so
    // the army cannot be walked off the map one tick at a time.
    set eh = AI_FindEnemyHero(pid, ai_ptX[t], ai_ptY[t], AI_HERO_LEASH)
    if eh != null then
        call AI_Say(pid, "focusing an enemy hero")
        call AI_SendArmy(pid, GetUnitX(eh), GetUnitY(eh), AI_ORD_ATTACKU, eh)
        set eh = null
        return
    endif
    set stalled = AI_TrackProgress(pid, ai_ptX[t], ai_ptY[t])
    call AI_ChooseApproach(pid, ai_ptX[t], ai_ptY[t])
    call AI_ManageGates(pid)
    if stalled then
        // Backstop: something we do not model is in the way. Force the
        // nearest own shut gate and give the reroute time to take effect.
        if AI_ForceOpenNear(pid, wm_fieldX[pid], wm_fieldY[pid]) then
            call AI_Say(pid, "forcing a gate open - the army is not making ground")
        endif
        set ai_progAt[pid] = ai_now
    endif
    set gi = ai_apGate[pid]
    // ROUND 3, item 8: is there a wall to break on this march? That single
    // question is what tells the rams whether they have a job this tick.
    set ai_ramWork = (gi >= 0) and ai_apBreak[pid]
    if gi >= 0 and ai_apBreak[pid] then
        // the crossing is shut and not ours: break THIS gate on purpose,
        // instead of attack-moving at the objective and letting the engine
        // reroute the army onto a worse approach
        call AI_SendArmy(pid, ai_gateX[gi], ai_gateY[gi], AI_ORD_ATTACKU, ai_gate[gi])
    elseif gi >= 0 then
        call AI_SendArmy(pid, ai_apX[pid], ai_apY[pid], AI_ORD_ATTACKP, null)
    else
        call AI_SendArmy(pid, ai_ptX[t], ai_ptY[t], AI_ORD_ATTACKP, null)
    endif
endfunction

// ---- production ---------------------------------------------------------

function AI_TrainerFilter takes nothing returns boolean
    local integer t = GetUnitTypeId(GetFilterUnit())
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and (t == 'h000' or t == 'h001' or t == 'h002' or t == 'h009' or t == 'h01Z')
endfunction

function AI_PickTrainer takes nothing returns nothing
    if ai_trainer == null then
        set ai_trainer = GetEnumUnit()
    endif
endfunction

function AI_FindTrainer takes integer pid returns unit
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_trainer = null
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_TrainerFilter))
    call ForGroup(g, function AI_PickTrainer)
    call DestroyGroup(g)
    set g = null
    return ai_trainer
endfunction

function AI_RoleCost takes integer pid, integer role returns real
    return AI_BaseCost(AI_UnitFor(pid, role))
endfunction

// ---- coordination and raiding (round 3, queue item 7) -------------------

// Record our intent in the shared ledger, releasing whatever we held before
// so a claim can never outlive the interest that created it.
function AI_Claim takes integer pid, integer t returns nothing
    local integer old = ai_target[pid]
    if old >= 0 and old < ai_pointCount and ai_claim[old] == pid then
        set ai_claim[old] = -1
    endif
    if t < 0 or t >= ai_pointCount then
        return
    endif
    set ai_claim[t] = pid
    set ai_claimAt[t] = ai_now
endfunction

// The flank objective: something outlying and genuinely undefended, and
// never the objective the main army is already committed to.
function AI_RaidTarget takes integer pid returns integer
    local integer i = 0
    local integer best = -1
    local real bs = 0.0
    local real s
    loop
        exitwhen i >= ai_pointCount
        if i != ai_target[pid] and ai_pt[i] != null and not AI_NeedsBoat(pid, i) then
            if not (GetOwningPlayer(ai_pt[i]) == ai_p[pid] or IsPlayerAlly(GetOwningPlayer(ai_pt[i]), ai_p[pid])) then
                if ai_ptDef[pid*AI_MAX_POINTS + i] <= AI_RAID_DEF then
                    set s = AI_PointValue(ai_ptKind[i]) / (1.0 + AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid]) / 9000.0)
                    if s > bs then
                        set bs = s
                        set best = i
                    endif
                endif
            endif
        endif
        set i = i + 1
    endloop
    return best
endfunction

function AI_RaidEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if GetUnitTypeId(u) == ai_raidType and GetUnitState(u, UNIT_STATE_LIFE) > 0.405 and not IsUnitLoaded(u) then
        call AI_TryOrder(u, AI_ORD_ATTACKP, ai_orderX, ai_orderY, null)
    endif
    set u = null
endfunction

// Horses raid the flanks CONCURRENTLY with the push. The owner asked for
// harassment "with horses and cavalry ... concurrently with pushing, not
// instead of it", so this is an EXTRA dispatch layered on the normal march
// with its own small budget, not a replacement for it -- and it deliberately
// ignores the garrison hold-back in AI_SendEnum, which is the stacking
// heuristic the harasser role is meant to override.
function AI_Raid takes integer pid returns nothing
    local group g
    local integer t
    if not ai_harasser[pid] then
        return
    endif
    set t = AI_RaidTarget(pid)
    if t < 0 then
        return
    endif
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_raidType = AI_UnitFor(pid, 3)     // the faction cavalry
    set ai_orderX = ai_ptX[t]
    set ai_orderY = ai_ptY[t]
    set ai_issued = 0
    set ai_budget = AI_RAID_SLICE
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_OwnUnitFilter))
    call ForGroup(g, function AI_RaidEnum)
    call DestroyGroup(g)
    set g = null
    call AI_Say(pid, "raiding " + AI_KindName(ai_ptKind[t]) + " on the flank")
endfunction

// Buy the role that is furthest below its target share of army CV.
function AI_Spend takes integer pid returns nothing
    local unit b = AI_FindTrainer(pid)
    local integer role = 0
    local real g = wm_gold[pid]
    local integer tid
    if b == null then
        return
    endif
    // food headroom: a squad is 12 units
    if wm_food[pid] + 12.0 > wm_foodCap[pid] then
        set b = null
        return
    endif
    // composition: bias by goal, break ties with the seeded stream
    // ROUND 3, item 8: buy rams because there is a WALL in the way, not as a
    // random flavour of the composition roll. ai_apBreak is set by the
    // approach layer when the crossing we picked has to be broken.
    // ROUND 4, finding 7. Round 3 also bought rams whenever the goal was
    // SIEGE, which is a standing incentive to own rams regardless of whether
    // a wall is in the way -- and a ram fleet looking for work manufactures
    // wall objectives. Rams are now bought ONLY because the crossing decision
    // says a wall stands between this army and what it wants, with no cheaper
    // way through. ai_apBreak is exactly that, and nothing else sets it.
    // ROUND 5: buy on the REMEMBERED wall, not the per-tick flag, and price
    // it at what a ram actually costs (50 g + 100 l) rather than a guess.
    if (ai_now - ai_wallSince[pid]) < AI_WALL_MEM and wm_lumber[pid] >= AI_RAM_LUMBER and AI_RandReal() < 0.55 then
        set role = 4
    else
        // ROUND 3, queue item 9: composition follows the faction passive.
        set role = AI_PickRole(pid)
    endif
    set tid = AI_UnitFor(pid, role)
    if g >= AI_BaseCost(tid) then
        call IssueImmediateOrderById(b, tid)
    endif
    set b = null
endfunction

// ---- razing -------------------------------------------------------------
//
// Playtest fault (5): the AI never burns anything. R008 ("Raze City", cost 0)
// is researchable at an owned City or Town and Trig_Raze_City_tech kills the
// building; Trig_Cities_Destroyed then pays the OWNER AT DEATH 250 g / 250 l
// for a city or 100/100 for a town and leaves a rebuildable plot. Romans and
// Persia are barred from R008 by Trig_Limit_Units, which wm_canRaze reads
// directly off GetPlayerTechMaxAllowed rather than assuming.
//
// Policy: burn what we cannot hold -- a settlement far from home -- and never
// burn ourselves down to fewer than AI_RAZE_KEEP production sites.

function AI_RazeFilter takes nothing returns boolean
    local integer t = GetUnitTypeId(GetFilterUnit())
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and (t == 'h001' or t == 'h009')
endfunction

function AI_RazeEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real d = AI_Dist(GetUnitX(u), GetUnitY(u), ai_homeX[ai_curPid], ai_homeY[ai_curPid])
    set ai_razeCount = ai_razeCount + 1
    // ROUND 3, queue item 6: burn only what we cannot HOLD. Round 2 used a
    // bare distance test, which still burned a defensible forward city; the
    // holdability measure also asks whether we want the supply and whether we
    // have an army to garrison with.
    if not AI_Holdable(ai_curPid, GetUnitX(u), GetUnitY(u)) and d > ai_razeDist then
        set ai_razeDist = d
        set ai_razeUnit = u
    endif
    set u = null
endfunction

function AI_TryRaze takes integer pid returns nothing
    local group g
    if not wm_canRaze[pid] then
        return
    endif
    set g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_razeUnit = null
    set ai_razeDist = 0.0
    set ai_razeCount = 0
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_RazeFilter))
    call ForGroup(g, function AI_RazeEnum)
    call DestroyGroup(g)
    set g = null
    if ai_razeUnit != null and ai_razeCount >= AI_RAZE_KEEP then
        call IssueImmediateOrderById(ai_razeUnit, 'R008')
    endif
    set ai_razeUnit = null
endfunction

// ---- plot upgrades ------------------------------------------------------

function AI_PlotFilter takes nothing returns boolean
    local integer t = GetUnitTypeId(GetFilterUnit())
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and (t == 'n00E' or t == 'n00F' or t == 'n008' or t == 'n009')
endfunction

function AI_UpgradePlotEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local integer t = GetUnitTypeId(u)
    if t == 'n00F' and wm_gold[ai_curPid] >= 300.0 and wm_lumber[ai_curPid] >= 300.0 then
        call IssueImmediateOrderById(u, 'h001')
    elseif t == 'n00E' and wm_gold[ai_curPid] >= 150.0 and wm_lumber[ai_curPid] >= 150.0 then
        call IssueImmediateOrderById(u, 'h009')
    elseif t == 'n008' and wm_gold[ai_curPid] >= 50.0 and wm_lumber[ai_curPid] >= 100.0 then
        call IssueImmediateOrderById(u, 'o001')
    elseif t == 'n009' and wm_gold[ai_curPid] >= 50.0 and wm_lumber[ai_curPid] >= 100.0 then
        call IssueImmediateOrderById(u, 'o004')
    endif
    set u = null
endfunction

function AI_UpgradePlots takes integer pid returns nothing
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_PlotFilter))
    call ForGroup(g, function AI_UpgradePlotEnum)
    call DestroyGroup(g)
    set g = null
endfunction

// ---- research -----------------------------------------------------------

function AI_ForgeFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and GetUnitTypeId(GetFilterUnit()) == 'h00W'
endfunction

function AI_ResearchEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local player p = GetOwningPlayer(u)
    if GetPlayerTechCount(p, 'Rhme', true) < 3 then
        call IssueImmediateOrderById(u, 'Rhme')
    elseif GetPlayerTechCount(p, 'Rhar', true) < 3 then
        call IssueImmediateOrderById(u, 'Rhar')
    elseif GetPlayerTechCount(p, 'Rhra', true) < 3 then
        call IssueImmediateOrderById(u, 'Rhra')
    endif
    set u = null
    set p = null
endfunction

function AI_DoResearch takes integer pid returns nothing
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_ForgeFilter))
    call ForGroup(g, function AI_ResearchEnum)
    call DestroyGroup(g)
    set g = null
endfunction

// ---- hero: Local Support (Roman General only) ---------------------------

function AI_HeroFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and GetUnitTypeId(GetFilterUnit()) == 'H00F' and GetUnitState(GetFilterUnit(), UNIT_STATE_LIFE) > 0.405
endfunction

function AI_CastSupportEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if ai_orderTarget != null and GetUnitAbilityLevel(u, 'A021') > 0 then
        call IssueTargetOrderById(u, 'A021', ai_orderTarget)
    endif
    set u = null
endfunction

// Find an owned City/Town/Capital nearest the threat, then cast on it.
function AI_TryLocalSupport takes integer pid returns nothing
    local integer i = 0
    local integer best = -1
    local real bd = AI_HOME_R
    local real d
    local group g
    if ai_role[pid] != AI_ROLE_ROME then
        return
    endif
    loop
        exitwhen i >= ai_pointCount
        if ai_pt[i] != null and ai_ptKind[i] != AI_PK_CP and GetOwningPlayer(ai_pt[i]) == ai_p[pid] then
            set d = AI_Dist(ai_ptX[i], ai_ptY[i], wm_threatX[pid], wm_threatY[pid])
            if d < bd then
                set bd = d
                set best = i
            endif
        endif
        set i = i + 1
    endloop
    if best < 0 then
        return
    endif
    set ai_orderTarget = ai_pt[best]
    set ai_curP = ai_p[pid]
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_HeroFilter))
    call ForGroup(g, function AI_CastSupportEnum)
    call DestroyGroup(g)
    set g = null
    set ai_orderTarget = null
endfunction

// ROUND 5: the nearest thing we could contest, ignoring every score. This is
// the floor under the whole decision layer, not part of it.
function AI_NearestContestable takes integer pid returns integer
    local integer i = 0
    local integer best = -1
    local real bd = 999999.0
    local real d
    loop
        exitwhen i >= ai_pointCount
        if ai_pt[i] != null and not AI_WantsCrossing(pid, i) then
            if not (GetOwningPlayer(ai_pt[i]) == ai_p[pid] or IsPlayerAlly(GetOwningPlayer(ai_pt[i]), ai_p[pid])) then
                set d = AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid])
                if d < bd then
                    set bd = d
                    set best = i
                endif
            endif
        endif
        set i = i + 1
    endloop
    return best
endfunction

// True when this player has gone AI_IDLE_T without committing to anything.
function AI_IsIdle takes integer pid returns boolean
    return (ai_now - ai_commitAt[pid]) >= AI_IDLE_T
endfunction

// ---- goal dispatch ------------------------------------------------------

function AI_Execute takes integer pid returns nothing
    local integer goal = ai_goal[pid]
    local integer t

    if goal == GOAL_CONSOLIDATE then
        call AI_Spend(pid)
        call AI_UpgradePlots(pid)
        call AI_TryRaze(pid)
        // no march in progress: gate control is purely defensive here
        set ai_apGate[pid] = -1
        set ai_ramWork = false
        call AI_ManageGates(pid)
        call AI_SendArmy(pid, ai_homeX[pid], ai_homeY[pid], AI_ORD_MOVE, null)

    elseif goal == GOAL_TECH then
        call AI_DoResearch(pid)
        call AI_Spend(pid)

    elseif goal == GOAL_DEFEND then
        call AI_Spend(pid)
        call AI_TryLocalSupport(pid)
        set ai_apGate[pid] = -1
        call AI_ManageGates(pid)
        // Answer with a capped slice of the army, and only pull the field army
        // off its objective when the thing at risk is worth more than the thing
        // being taken.
        set ai_ramWork = false
        if AI_ShouldRecall(pid) then
            call AI_SendArmy(pid, wm_threatX[pid], wm_threatY[pid], AI_ORD_ATTACKP, null)
        else
            call AI_Respond(pid, wm_threatX[pid], wm_threatY[pid], AI_RespondBudget(pid))
        endif

    elseif goal == GOAL_RETREAT then
        set ai_ramWork = false
        call AI_SendArmy(pid, ai_homeX[pid], ai_homeY[pid], AI_ORD_MOVE, null)

    elseif goal == GOAL_SIEGE then
        call AI_Spend(pid)
        set t = AI_CapitalTarget(pid)
        if t >= 0 then
            // ROUND 6: the idle clock is stamped only when the objective
            // CHANGES. Round 5 stamped it every tick a target was selected,
            // so a faction holding a stale objective it was making no
            // progress towards counted as "committed" and the aggression
            // floor could never fire -- which is exactly how a full army sat
            // in a captured city with the floor supposedly in place.
            if ai_target[pid] != t then
                call AI_Say(pid, "marching on " + AI_OwnerName(t) + " capital")
                set ai_commitAt[pid] = ai_now
            endif
            call AI_Claim(pid, t)
            set ai_target[pid] = t
            call AI_MoveOnTarget(pid, t)
            call AI_Raid(pid)              // horses keep working during a push
        endif

    elseif goal == GOAL_EXPAND then
        call AI_Spend(pid)
        call AI_TryRaze(pid)
        set t = ai_bestT[pid]
        if t >= 0 then
            if ai_target[pid] != t then
                call AI_Say(pid, "moving on " + AI_KindName(ai_ptKind[t]) + " held by " + AI_OwnerName(t))
                set ai_commitAt[pid] = ai_now      // ROUND 6: on CHANGE only
            endif
            call AI_Claim(pid, t)
            set ai_target[pid] = t
            call AI_MoveOnTarget(pid, t)
            call AI_Raid(pid)
        endif
    endif

    // ROUND 5 -- THE FLOOR. An idle army is always a bug, and "nothing scored
    // above threshold" is never a terminal state. Whatever the scorer decided,
    // a faction that has not committed to anything for AI_IDLE_T marches on
    // the nearest contestable objective. This sits UNDER the decision layer
    // rather than inside it, so it cannot be tuned away by a threshold, and
    // it is the standing aggression bias the owner asked for: when in doubt,
    // attack something.
    if AI_IsIdle(pid) and goal != GOAL_RETREAT and goal != GOAL_DEFEND then
        set t = AI_NearestContestable(pid)
        if t >= 0 then
            call AI_Claim(pid, t)
            set ai_target[pid] = t
            set ai_commitAt[pid] = ai_now
            call AI_Say(pid, "nothing worth doing scored - taking the nearest thing instead")
            call AI_MoveOnTarget(pid, t)
        endif
    endif
endfunction

//===========================================================================
//  Micro
//===========================================================================

function AI_MicroFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and not IsUnitType(GetFilterUnit(), UNIT_TYPE_STRUCTURE) and GetUnitState(GetFilterUnit(), UNIT_STATE_LIFE) > 0.405
endfunction

function AI_MicroEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real mx = GetUnitState(u, UNIT_STATE_MAX_LIFE)
    // ROUND 3: heroes are NOT subject to the 22 percent trip-wire. They have
    // their own, far more conservative policy in AI_HeroMicro, because a hero
    // lost in this map is lost for the game.
    if IsUnitType(u, UNIT_TYPE_HERO) then
        set u = null
        return
    endif
    // retreat trip-wire: pull badly wounded units, veterancy is worth keeping
    if mx > 0.0 and (GetUnitState(u, UNIT_STATE_LIFE)/mx) < 0.22 then
        call AI_TryOrder(u, AI_ORD_MOVE, ai_homeX[ai_curPid], ai_homeY[ai_curPid], null)
    elseif ai_orderTarget != null then
        // capture focus: hit the settlement itself, it flips below 500 HP
        if AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) < AI_TOUCH_R then
            call AI_TryOrder(u, AI_ORD_ATTACKU, ai_orderX, ai_orderY, ai_orderTarget)
        endif
    endif
    set u = null
endfunction

function AI_MicroPlayer takes integer pid returns nothing
    local group g
    local integer t = ai_target[pid]
    // ROUND 3: hero policy runs at EVERY difficulty. Difficulty is meant to
    // make an AI play worse, not to make it throw away a unit that the map
    // gives it exactly one of and never replaces.
    call AI_HeroMicro(pid)
    if ai_diff[pid] == AI_EASY then
        return
    endif
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_orderTarget = null
    set ai_issued = 0
    set ai_budget = AI_MICRO_SLICE
    if t >= 0 and t < ai_pointCount and ai_pt[t] != null then
        // stop hitting it the moment it is ours
        if not (GetOwningPlayer(ai_pt[t]) == ai_p[pid]) then
            set ai_orderTarget = ai_pt[t]
            set ai_orderX = ai_ptX[t]
            set ai_orderY = ai_ptY[t]
        else
            // objective ACHIEVED. ROUND 6: success must EXPIRE the plan, at
            // once. "Persia just sits around after winning a city" is the
            // report; the cause is that taking a point left the goal's dwell
            // running, the claim standing and the idle clock fresh, so the
            // faction paused for exactly as long as its objective had been
            // sticky. A completed objective also has to be released or an
            // ally cannot pick up the next one.
            call AI_Say(pid, "took " + AI_KindName(ai_ptKind[t]))
            if t >= 0 and t < ai_pointCount and ai_claim[t] == pid then
                set ai_claim[t] = -1                // release it for allies
            endif
            set ai_target[pid] = -1
            set ai_goalSince[pid] = -9999.0         // dwell expires NOW
            set ai_commitAt[pid] = -9999.0          // and the floor is armed
            set ai_progD[pid] = 999999.0            // progress restarts clean
        endif
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_MicroFilter))
    call ForGroup(g, function AI_MicroEnum)
    call DestroyGroup(g)
    set g = null
    set ai_orderTarget = null
endfunction

//===========================================================================
//  Timers
//===========================================================================

function AI_Think takes nothing returns nothing
    local integer pid = 0
    local integer newGoal
    set ai_now = ai_now + 1.0
    set ai_ordersTick = 0
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        if ai_on[pid] then
            if ai_now >= ai_nextThink[pid] then
                set ai_nextThink[pid] = ai_now + AI_ThinkPeriod(pid)
                call AI_ScanWorld(pid)
                call AI_UpdatePosture(pid)
                set newGoal = AI_SelectGoal(pid)
                if newGoal != ai_goal[pid] then
                    set ai_goal[pid] = newGoal
                    set ai_goalSince[pid] = ai_now
                    // posture change: a STATE CHANGE, so it is narrated
                    call AI_Say(pid, AI_GoalName(newGoal))
                endif
                call AI_Execute(pid)
                // ROUND 5: runs whatever the goal is, so a crossing can
                // always be ended by something other than the goal that
                // started it.
                call AI_NavIdle(pid)
            endif
        endif
        set pid = pid + 1
    endloop
endfunction

function AI_MicroTick takes nothing returns nothing
    local integer pid = 0
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        if ai_on[pid] then
            call AI_MicroPlayer(pid)
        endif
        set pid = pid + 1
    endloop
endfunction

//===========================================================================
//  Setup
//===========================================================================

function AI_HomeFilter takes nothing returns boolean
    local integer t = GetUnitTypeId(GetFilterUnit())
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and (t == 'h000' or t == 'h002' or t == 'h001' or t == 'h009')
endfunction

function AI_HomeEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local integer t = GetUnitTypeId(u)
    // prefer a capital, then a camp, then anything
    if t == 'h000' or t == 'h002' or ai_accN == 0 then
        set ai_homeX[ai_curPid] = GetUnitX(u)
        set ai_homeY[ai_curPid] = GetUnitY(u)
        set ai_accN = ai_accN + 1
    endif
    set u = null
endfunction

function AI_ResolveHome takes integer pid returns nothing
    local group g = CreateGroup()
    set ai_curP = ai_p[pid]
    set ai_curPid = pid
    set ai_accN = 0
    set ai_homeX[pid] = GetStartLocationX(GetPlayerStartLocation(ai_p[pid]))
    set ai_homeY[pid] = GetStartLocationY(GetPlayerStartLocation(ai_p[pid]))
    call GroupEnumUnitsOfPlayer(g, ai_p[pid], Filter(function AI_HomeFilter))
    call ForGroup(g, function AI_HomeEnum)
    call DestroyGroup(g)
    set g = null
endfunction

function AI_EnablePlayer takes integer pid, integer difficulty returns nothing
    if pid < 0 or pid >= AI_MAX_PLAYERS then
        return
    endif
    set ai_on[pid]       = true
    set ai_diff[pid]     = difficulty
    set ai_goal[pid]     = GOAL_CONSOLIDATE
    set ai_goalSince[pid]= 0.0
    set ai_target[pid]   = -1
    set ai_bestT[pid]    = -1
    set ai_bestS[pid]    = 0.0
    set ai_apGate[pid]   = -1
    set ai_apBreak[pid]  = false
    set ai_scanCursor[pid] = 0
    set ai_wallSince[pid]= -9999.0
    set ai_commitAt[pid] = 0.0
    set ai_progD[pid]    = 999999.0
    set ai_progAt[pid]   = 0.0
    set ai_navState[pid] = AI_NAV_NONE
    set ai_navShip[pid]  = null
    set ai_navAt[pid]    = 0.0
    set ai_navSince[pid] = 0.0
    set wm_fieldComp[pid] = -1
    set wm_wantBoat[pid] = false
    set wm_landLeft[pid] = true
    set wm_hasSiege[pid] = false
    set wm_capReady[pid] = AI_CAP_FLOOR
    set wm_capIdx[pid]   = -1
    set wm_proxScale[pid]= AI_PROX_MIN
    set ai_posture[pid]  = POSTURE_CONSOLIDATE
    set ai_postureAt[pid]= 0.0
    set ai_heroOut[pid]  = false
    // PHASE OFFSET. Round 1 gave every player nextThink = 0, so all twelve
    // scanned, scored and issued orders on the same 1 s tick, forever: one
    // synchronised spike of work instead of a spread load. This is the
    // cheapest half of the lag fix (playtest fault 1).
    set ai_nextThink[pid]= I2R(ModuloInteger(pid, R2I(AI_ThinkPeriod(pid))))
    if pid == 3 or pid == 9 or pid == 10 then
        set ai_role[pid] = AI_ROLE_ROME
    else
        set ai_role[pid] = AI_ROLE_BARB
    endif
    call AI_ResolveHome(pid)
endfunction

// A slot is AI-eligible when no human is playing it. The map declares all
// twelve slots MAP_CONTROL_USER in InitCustomPlayerSlots, so the runtime
// controller is what distinguishes a computer slot, and an EMPTY slot is the
// common case: nobody joined, but that player still owns its capital, its
// control points and its hero, all of which currently sit and do nothing.
function AI_SlotIsVacant takes integer pid returns boolean
    if GetPlayerSlotState(ai_p[pid]) != PLAYER_SLOT_STATE_PLAYING then
        return true
    endif
    return GetPlayerController(ai_p[pid]) == MAP_CONTROL_COMPUTER
endfunction

function AI_CmdActions takes nothing returns nothing
    local string s = GetEventPlayerChatString()
    local integer pid = 0
    local integer d = -1
    // ROUND 3: the AI can be told to stop talking, or to talk again.
    // ROUND 5: observer mode, for the issuing player only.
    if s == "-aispy" or s == "-aispyoff" then
        set ai_spy[GetPlayerId(GetTriggerPlayer())] = (s == "-aispy")
        if s == "-aispy" then
            call DisplayTextToPlayer(GetTriggerPlayer(), 0, 0, "FoR-AI: you now see EVERY faction reports. This is a diagnostic view.")
        else
            call DisplayTextToPlayer(GetTriggerPlayer(), 0, 0, "FoR-AI: back to allied reports only.")
        endif
        return
    endif
    if s == "-aiquiet" or s == "-aitalk" then
        loop
            exitwhen pid >= AI_MAX_PLAYERS
            set ai_talk[pid] = (s == "-aitalk")
            set pid = pid + 1
        endloop
        call DisplayTextToPlayer(GetTriggerPlayer(), 0, 0, "FoR-AI reporting toggled.")
        return
    endif
    if s == "-aieasy" then
        set d = AI_EASY
    elseif s == "-ainormal" then
        set d = AI_NORMAL
    elseif s == "-aihard" then
        set d = AI_HARD
    endif
    if d < 0 then
        return
    endif
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        if ai_on[pid] then
            set ai_diff[pid] = d
        endif
        set pid = pid + 1
    endloop
    call DisplayTextToPlayer(GetTriggerPlayer(), 0, 0, "FoR-AI difficulty set.")
endfunction

// One AI per front takes the harassing role, drawn from the map own seeded
// Park-Miller stream (gotcha 29) so the choice is reproducible. The front,
// the three candidates and the weighting are the owner: the Byzantium fight,
// between Red, Gray and Pink, strongly weighted towards Red. Only slots the
// AI actually plays are entered in the draw, so a human in the Hun seat
// hands the role on rather than voiding it.
function AI_PickHarasser takes nothing returns nothing
    local integer total = 0
    local integer r
    local integer pick = -1
    if ai_on[AI_HARASS_A] then
        set total = total + AI_HARASS_WA
    endif
    if ai_on[AI_HARASS_B] then
        set total = total + AI_HARASS_WB
    endif
    if ai_on[AI_HARASS_C] then
        set total = total + AI_HARASS_WC
    endif
    if total <= 0 then
        return
    endif
    set r = ModuloInteger(AI_Rand(), total)
    if ai_on[AI_HARASS_A] then
        if r < AI_HARASS_WA then
            set pick = AI_HARASS_A
        endif
        set r = r - AI_HARASS_WA
    endif
    if pick < 0 and ai_on[AI_HARASS_B] then
        if r < AI_HARASS_WB then
            set pick = AI_HARASS_B
        endif
        set r = r - AI_HARASS_WB
    endif
    if pick < 0 and ai_on[AI_HARASS_C] then
        set pick = AI_HARASS_C
    endif
    if pick >= 0 then
        set ai_harasser[pick] = true
    endif
endfunction

// Fill every slot that has no human in it.
function AI_Init takes nothing returns nothing
    local integer pid = 0
    local integer n = 0
    set ai_ht = InitHashtable()
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        set ai_p[pid] = Player(pid)
        set ai_on[pid] = false
        set ai_handicap[pid] = 1.0
        set ai_scanCursor[pid] = 0
        set ai_talk[pid] = true
        set ai_harasser[pid] = false
        set ai_sayAt[pid] = 0.0
        set ai_sayLast[pid] = ""
        set pid = pid + 1
    endloop

    call AI_BuildRegistry()
    set pid = 0
    loop
        exitwhen pid >= ai_pointCount
        set ai_claim[pid] = -1
        set ai_claimAt[pid] = -9999.0
        set pid = pid + 1
    endloop
    // ROUND 3: one-time land connectivity over the point registry. Bounded
    // by ai_pointCount (<= AI_MAX_POINTS), and only pairs closer than
    // AI_LINK_R that are not already unioned ever pay for a walkability walk.
    call AI_BuildLandGraph()

    set pid = 0
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        if AI_SlotIsVacant(pid) then
            call AI_EnablePlayer(pid, AI_NORMAL)
            if n == 0 then
                set ai_roster = AI_Name(pid)
            else
                set ai_roster = ai_roster + ", " + AI_Name(pid)
            endif
            set n = n + 1
        endif
        set pid = pid + 1
    endloop

    call AI_PickHarasser()

    set ai_cmdTrig = CreateTrigger()
    set pid = 0
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        call TriggerRegisterPlayerChatEvent(ai_cmdTrig, Player(pid), "-ai", false)
        set ai_spy[pid] = false
        set pid = pid + 1
    endloop
    call TriggerAddAction(ai_cmdTrig, function AI_CmdActions)

    if n > 0 then
        set ai_thinkTimer = CreateTimer()
        set ai_microTimer = CreateTimer()
        call TimerStart(ai_thinkTimer, AI_MICRO_PERIOD, true, function AI_Think)
        call TimerStart(ai_microTimer, AI_MICRO_PERIOD, true, function AI_MicroTick)
        // ROUND 4, finding 2: "West Rome fell asleep at the wheel." A player
        // that does NOTHING is a different failure class from one doing the
        // wrong thing, and the cheapest way to tell them apart from the
        // outside is to say out loud which slots the AI actually took. If a
        // faction is missing from this line it was never enabled; if it is
        // present and still idle, the fault is in its scoring.
        call AI_Broadcast("FoR-AI is playing: " + ai_roster)
        call AI_Broadcast("FoR-AI: -aieasy / -ainormal / -aihard, -aiquiet / -aitalk, -aispy to watch every faction.")
        call AI_Broadcast("FoR-AI handicap: NONE - no resource or vision cheating, fog is respected.")
    endif
endfunction
