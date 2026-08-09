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
    constant real    AI_APPROACH_MIN  = 2200.0 // below this, just go
    constant real    AI_SIEGE_R       = 2000.0 // hit the gate itself inside this
    constant real    AI_GATE_GUARD    = 1200.0 // enemy proximity for gate control
    constant real    AI_GATE_CD       = 20.0   // the map cooldown on A00Z etc.

    // ---- ROUND 3: the corridor test and the stall backstop -------------
    // Round 2 only ever asked "is a gate near the OBJECTIVE?", so the gate an
    // army must cross leaving its OWN city was never a candidate and the
    // army jammed behind it. These drive the segment-based replacement.
    constant real    AI_GATE_CORRIDOR = 1600.0 // perp distance from the march line
    constant real    AI_GATE_SAMEWALL = 0.15   // same wall when t is this close
    constant real    AI_GATE_ENTRY    = 300.0  // waypoint set just PAST the gate
    constant real    AI_STALL_EPS     = 400.0  // movement that counts as progress
    constant real    AI_STALL_T       = 12.0   // seconds of no progress = stalled
    constant real    AI_STALL_R       = 4000.0 // force-open radius around the army

    // ---- razing, playtest fault (5) -----------------------------------
    constant real    AI_RAZE_DIST     = 4200.0 // only raze what we cannot hold
    constant integer AI_RAZE_KEEP     = 3      // never drop below this many trainers

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
    integer          ai_accN         = 0
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
    call AI_Broadcast(AI_Name(pid) + ": " + msg)
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
function AI_PointValueFor takes integer pid, integer kind returns real
    local real v = AI_PointValue(kind)
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
function AI_GateCost takes integer pid, integer i returns real
    if AI_GateState(i) != AI_GS_CLOSED then
        return 0.0                        // an existing breach: free
    endif
    if AI_GateIsOurs(pid, i) then
        return AI_GATE_OWN
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
//  World scan
//===========================================================================

function AI_OwnUnitFilter takes nothing returns boolean
    return GetOwningPlayer(GetFilterUnit()) == ai_curP and GetUnitState(GetFilterUnit(), UNIT_STATE_LIFE) > 0.405
endfunction

function AI_SumOwnArmy takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real cv = AI_CV(u)
    if cv > 0.0 then
        set ai_accCV = ai_accCV + cv
        set ai_accX  = ai_accX + GetUnitX(u)*cv
        set ai_accY  = ai_accY + GetUnitY(u)*cv
        set ai_accW  = ai_accW + cv
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

function AI_ResetAcc takes nothing returns nothing
    set ai_accCV = 0.0
    set ai_accX = 0.0
    set ai_accY = 0.0
    set ai_accW = 0.0
    set ai_accHP = 0.0
    set ai_accHPMax = 0.0
    set ai_accN = 0
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

    // owned point counts, capital status, and the value of what is under
    // threat -- the last one is what stops a raid on a bare control point
    // from pulling the whole army home (playtest fault 2).
    loop
        exitwhen i >= ai_pointCount
        set k = pid*AI_MAX_POINTS + i
        if ai_pt[i] != null and GetOwningPlayer(ai_pt[i]) == p then
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

    set v = AI_PointValueFor(pid, ai_ptKind[i])
    set prox = 1.0 / (1.0 + AI_Dist(ai_ptX[i], ai_ptY[i], wm_fieldX[pid], wm_fieldY[pid]) / 4200.0)
    set weak = AI_C01(1.0 - ai_ptDef[k] / (wm_army[pid] + 60.0))
    set stale = 1.0 - 0.35*AI_C01((ai_now - ai_ptSeen[k]) / 240.0)
    if ai_target[pid] == i then
        set sw = 1.0
    else
        set sw = 0.86
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
                if perp <= AI_GATE_CORRIDOR then
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
                if perp <= AI_GATE_CORRIDOR then
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
endfunction

//===========================================================================
//  Goal scoring
//===========================================================================

function AI_ScoreConsolidate takes integer pid returns real
    local real clock = AI_Clock()
    local real wantArmy = 350.0 + 750.0*clock
    local real a = wm_army[pid]
    local real s
    set s = 0.78 * AI_C01((wantArmy - a) / wantArmy)
    set s = s + 0.22 * AI_C01(wm_gold[pid] / 900.0)
    set s = s + 0.15 * AI_C01((wm_foodCap[pid] - wm_food[pid]) / wm_foodCap[pid]) * AI_C01(wm_gold[pid] / 400.0)
    return s
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

function AI_ScoreSiege takes integer pid returns real
    local real clock = AI_Clock()
    local integer ci
    local real capDef
    if ai_role[pid] == AI_ROLE_ROME then
        if wm_capLost[pid] then
            return 1.45
        endif
        return 0.0
    endif
    set ci = AI_CapitalTarget(pid)
    if ci < 0 then
        return 0.0
    endif
    set capDef = ai_ptDef[pid*AI_MAX_POINTS + ci]
    return AI_C01(wm_army[pid] / 900.0) * (0.30 + 0.95*clock) * (1.0 - 0.40*AI_C01(capDef/(wm_army[pid]+100.0)))
endfunction

function AI_ScoreTech takes integer pid returns real
    local real clock = AI_Clock()
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

function AI_SelectGoal takes integer pid returns integer
    local real sCon = AI_ScoreConsolidate(pid)
    local real sDef = AI_ScoreDefend(pid)
    local real sExp = AI_ScoreExpand(pid)
    local real sSie = AI_ScoreSiege(pid)
    local real sTec = AI_ScoreTech(pid)
    local real sRet = AI_ScoreRetreat(pid)
    local real amp  = AI_NoiseAmp(pid)
    local integer bestGoal = GOAL_CONSOLIDATE
    local real bestScore
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

    set bestScore = sCon
    if sExp > bestScore then
        set bestScore = sExp
        set bestGoal = GOAL_EXPAND
    endif
    if sDef > bestScore then
        set bestScore = sDef
        set bestGoal = GOAL_DEFEND
    endif
    if sSie > bestScore then
        set bestScore = sSie
        set bestGoal = GOAL_SIEGE
    endif
    if sTec > bestScore then
        set bestScore = sTec
        set bestGoal = GOAL_TECH
    endif
    if sRet > bestScore then
        set bestScore = sRet
        set bestGoal = GOAL_RETREAT
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
        set vObj = AI_PointValueFor(pid, ai_ptKind[ai_target[pid]])
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

function AI_SendEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if AI_IsStructure(u) or GetUnitState(u, UNIT_STATE_LIFE) <= 0.405 then
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
    if ai_ordKind == AI_ORD_ATTACKU then
        if AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) < AI_SIEGE_R then
            call AI_TryOrder(u, AI_ORD_ATTACKU, ai_orderX, ai_orderY, ai_orderTarget)
        else
            call AI_TryOrder(u, AI_ORD_ATTACKP, ai_orderX, ai_orderY, null)
        endif
    else
        call AI_TryOrder(u, ai_ordKind, ai_orderX, ai_orderY, null)
    endif
    set u = null
endfunction

function AI_SendArmy takes integer pid, real x, real y, integer kind, unit tgt returns nothing
    local group g = CreateGroup()
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

// Move on a registered point, crossing the wall deliberately.
function AI_MoveOnTarget takes integer pid, integer t returns nothing
    local integer gi
    local boolean stalled = AI_TrackProgress(pid, ai_ptX[t], ai_ptY[t])
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

// Faction unit ids. Each player trains its own visual variant of the same role.
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

function AI_RoleCost takes integer pid, integer role returns real
    return AI_BaseCost(AI_UnitFor(pid, role))
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
    if ai_goal[pid] == GOAL_SIEGE and wm_lumber[pid] >= 200.0 and AI_RandReal() < 0.35 then
        set role = 4
    elseif AI_RandReal() < 0.45 then
        set role = 0
    elseif AI_RandReal() < 0.40 then
        set role = 1
    elseif AI_RandReal() < 0.55 then
        set role = 2
    else
        set role = 3
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
    if d > AI_RAZE_DIST and d > ai_razeDist then
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
        if AI_ShouldRecall(pid) then
            call AI_SendArmy(pid, wm_threatX[pid], wm_threatY[pid], AI_ORD_ATTACKP, null)
        else
            call AI_Respond(pid, wm_threatX[pid], wm_threatY[pid], AI_RespondBudget(pid))
        endif

    elseif goal == GOAL_RETREAT then
        call AI_SendArmy(pid, ai_homeX[pid], ai_homeY[pid], AI_ORD_MOVE, null)

    elseif goal == GOAL_SIEGE then
        call AI_Spend(pid)
        set t = AI_CapitalTarget(pid)
        if t >= 0 then
            if ai_target[pid] != t then
                call AI_Say(pid, "marching on " + AI_OwnerName(t) + " capital")
            endif
            set ai_target[pid] = t
            call AI_MoveOnTarget(pid, t)
        endif

    elseif goal == GOAL_EXPAND then
        call AI_Spend(pid)
        call AI_TryRaze(pid)
        set t = ai_bestT[pid]
        if t >= 0 then
            if ai_target[pid] != t then
                call AI_Say(pid, "moving on " + AI_KindName(ai_ptKind[t]) + " held by " + AI_OwnerName(t))
            endif
            set ai_target[pid] = t
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
            // objective ACHIEVED: it is ours now, stop hitting it and say so
            call AI_Say(pid, "took " + AI_KindName(ai_ptKind[t]))
            set ai_target[pid] = -1
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
                set newGoal = AI_SelectGoal(pid)
                if newGoal != ai_goal[pid] then
                    set ai_goal[pid] = newGoal
                    set ai_goalSince[pid] = ai_now
                    // posture change: a STATE CHANGE, so it is narrated
                    call AI_Say(pid, AI_GoalName(newGoal))
                endif
                call AI_Execute(pid)
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
    set ai_progD[pid]    = 999999.0
    set ai_progAt[pid]   = 0.0
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
        set ai_sayAt[pid] = 0.0
        set ai_sayLast[pid] = ""
        set pid = pid + 1
    endloop

    call AI_BuildRegistry()

    set pid = 0
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        if AI_SlotIsVacant(pid) then
            call AI_EnablePlayer(pid, AI_NORMAL)
            set n = n + 1
        endif
        set pid = pid + 1
    endloop

    set ai_cmdTrig = CreateTrigger()
    set pid = 0
    loop
        exitwhen pid >= AI_MAX_PLAYERS
        call TriggerRegisterPlayerChatEvent(ai_cmdTrig, Player(pid), "-ai", false)
        set pid = pid + 1
    endloop
    call TriggerAddAction(ai_cmdTrig, function AI_CmdActions)

    if n > 0 then
        set ai_thinkTimer = CreateTimer()
        set ai_microTimer = CreateTimer()
        call TimerStart(ai_thinkTimer, AI_MICRO_PERIOD, true, function AI_Think)
        call TimerStart(ai_microTimer, AI_MICRO_PERIOD, true, function AI_MicroTick)
        call DisplayTextToPlayer(Player(0), 0, 0, "FoR-AI active on vacant slots. Use -aieasy, -ainormal or -aihard.")
    endif
endfunction
