//============================================================================
// BANJO-AI  --  a self-directed computer player for Banjoball v1.22C1
//               (map by the Banjoball authors; see README credits)
//
// This module is INJECTED into the map's compiled war3map.j. It is written in
// plain JASS (no vJass) so it can be spliced into an already-compiled script.
//
// It reads the map's OWN state rather than keeping a shadow copy:
//
//   s__Ball_balls[0]          the live ball index
//   s__Ball_ball[b]           the ball unit
//   s__Ball_owner[b]          who last touched / holds it
//   s__Ball_hold[b]           true while a player is carrying it
//   s__Ball_vel[b]            velocity vector id -> s__Vector_x/y/z
//   Players___playerUnit[pid] the athlete for a player slot
//   gg_rct_Goal_1 / _2        goal rects (MOVED per field -- read at runtime)
//   BALL_FRICTION_GROUND      a MUTABLE global: ice fields lower it
//
// Reading the live globals is deliberate: the ball predictor below then tracks
// the real physics on every field, including ice, with no constants of its own
// to drift. Everything named BALL_*, KICK_*, GRAVITY_* below is the map's
// constant, not a copy.
//
// KICKING: the AI calls s__Ball_castUtil(u,x,y) -- the exact function the map
// runs when a human casts Kick. This is a LABELLED EQUIVALENCE, not a cheat:
// it performs the same state transition (owner+hold check, then s__Ball_kick
// at KICK_SPEED/KICK_Z) and Kick has no cooldown. It is used in preference to
// IssuePointOrder because Kick is a Channel ability whose base order string is
// not set in the object data, so the order string would be an inference; the
// function call is a fact. Abilities that DO have a declared order string
// (Powershot "parasite", Slam "sacrifice") are ordered normally and their
// cooldowns are respected by the engine.
//
// NO CHEATING: the AI reads only what the map itself makes global. It gets no
// gold, no speed and no vision it would not have. Difficulty is reaction
// latency + aim noise + whether it uses its abilities (BAI_SetDifficulty).
//
// Order economy is built in from the start (a lesson paid for by the Fall of
// Rome AI's first playtest): every order goes through BAI_TryOrder, which
// drops re-orders that would restart pathing, and the think ticks of the
// twelve slots are staggered so they never fire in lockstep.
//============================================================================

//! BAI_GLOBALS_BEGIN
// ---- tuning (all honest knobs; none of these give the AI information) ----
    constant real    BAI_THINK_PERIOD      = 0.0625   // 1/16 s per slot
    constant integer BAI_SLOT_STAGGER      = 8        // spread slots over N sub-ticks
    constant integer BAI_PREDICT_TICKS     = 128      // 4 s of ball lookahead (32/s)
    constant real    BAI_REORDER_DIST      = 96.0     // re-issue only past this
    constant integer BAI_ORDER_BUDGET      = 3        // orders per slot per think
    constant real    BAI_SHOOT_RANGE       = 1150.0   // shoot from inside this
    constant real    BAI_PASS_RANGE        = 1250.0   // max pass length
    constant real    BAI_PRESSURE_RANGE    = 260.0    // an enemy this close = pressed
    constant real    BAI_KEEPER_DEPTH      = 260.0    // keeper standoff from goal
    constant real    BAI_SUPPORT_SPREAD    = 700.0    // support offset off the ball
    constant real    BAI_SLAM_RANGE        = 300.0    // slam the carrier inside this
    constant real    BAI_LANE_HALFWIDTH    = 110.0    // shot-lane clearance
    constant real    BAI_POWERSHOT_RANGE   = 3200.0   // powershot is near-frictionless
    constant real    BAI_MARK_DEPTH        = 190.0    // how far goal-side of a marked man
    constant real    BAI_PASS_LEAD         = 170.0    // pass into space, not at the feet

// ---- ability order strings, from the object data's Ncl6 base-order field ----
    constant string  BAI_ORD_POWERSHOT     = "parasite"
    constant string  BAI_ORD_SLAM          = "sacrifice"
    constant string  BAI_ORD_CURVE_CCW     = "carrionscarabs"
    constant string  BAI_ORD_CURVE_CW      = "cannibalize"
    constant string  BAI_ORD_SPRINT        = "immolation"

// ---- ability rawcodes the map does not expose as globals --------------------
    constant integer BAI_POWERSHOT_ABIL    = 'A003'
    constant integer BAI_CURVE_CCW_ABIL    = 'A00Q'
    constant integer BAI_CURVE_CW_ABIL     = 'A00R'

// ---- the athlete roster: one class per slot instead of twelve of the same ---
    integer array    BAI_roster
    integer          BAI_rosterN            = 0

// ---- state ----
    boolean array    BAI_on                 // AI drives this slot
    real    array    BAI_nextThink
    real    array    BAI_lastOrdX
    real    array    BAI_lastOrdY
    integer array    BAI_lastOrdKind        // 0 none 1 move 2 attackmove
    integer array    BAI_role               // 0 keeper 1 defender 2 attacker
    boolean array    BAI_sprintWorks        // cleared if the sprint order does nothing
    real    array    BAI_reaction           // difficulty: added decision latency
    real    array    BAI_aimNoise           // difficulty: aim error in units
    boolean array    BAI_useAbilities
    boolean array    BAI_registered         // registered into the map's player list
    boolean array    BAI_claimed            // opponent already marked this think

    timer            BAI_timer              = null
    integer          BAI_subTick            = 0
    integer          BAI_rescan             = 0
    integer          BAI_rosterOffset       = 0
    integer          BAI_seed               = 1
    boolean          BAI_enabled            = false

// ---- predictor outputs (JASS cannot return tuples) ----
    real             BAI_pbx                = 0.0
    real             BAI_pby                = 0.0
    real             BAI_pbh                = 0.0
    integer          BAI_ipTicks            = -1
    real             BAI_ipx                = 0.0
    real             BAI_ipy                = 0.0

// ---- goal geometry, refreshed from the rects (fields move them) ----
    real             BAI_goal1x             = 0.0
    real             BAI_goal1y             = 0.0
    real             BAI_goal2x             = 0.0
    real             BAI_goal2y             = 0.0
    real             BAI_goalHalf           = 320.0
//! BAI_GLOBALS_END

//! BAI_FUNCTIONS_BEGIN

//----------------------------------------------------------------------------
// Park-Miller (16807, 2^31-1) via Schrage. All intermediates stay below 2^31
// so the stream is identical under 32-bit and 64-bit integers (the portability
// rule the toolkit calls gotcha 29). Used only for aim noise and tie-breaks --
// never for anything a replay would need to reproduce exactly.
//----------------------------------------------------------------------------
function BAI_Rand takes nothing returns integer
    local integer hi = BAI_seed / 127773
    local integer lo = BAI_seed - hi * 127773
    local integer t  = 16807 * lo - 2836 * hi
    if t <= 0 then
        set t = t + 2147483647
    endif
    set BAI_seed = t
    return t
endfunction

// uniform real in [-r, r]
function BAI_Noise takes real r returns real
    if r <= 0.0 then
        return 0.0
    endif
    return (I2R(BAI_Rand() - 1073741823) / 1073741823.0) * r
endfunction

function BAI_Dist takes real ax, real ay, real bx, real by returns real
    return SquareRoot((ax - bx) * (ax - bx) + (ay - by) * (ay - by))
endfunction

//----------------------------------------------------------------------------
// Goal geometry. The map MOVES gg_rct_Goal_1/_2 when a field is chosen (the
// fields differ in size: "Normal, recommended for 4v4" vs "Large, for 5v5"),
// so this is re-read rather than baked in.
//----------------------------------------------------------------------------
function BAI_RefreshGeometry takes nothing returns nothing
    set BAI_goal1x = GetRectCenterX(gg_rct_Goal_1)
    set BAI_goal1y = GetRectCenterY(gg_rct_Goal_1)
    set BAI_goal2x = GetRectCenterX(gg_rct_Goal_2)
    set BAI_goal2y = GetRectCenterY(gg_rct_Goal_2)
    set BAI_goalHalf = (GetRectMaxY(gg_rct_Goal_1) - GetRectMinY(gg_rct_Goal_1)) / 2.0
endfunction

// The goal a team ATTACKS. Team 0 ("Team 1") starts on the left and scores in
// Goal 2 -- established from the map's own score(): a ball entering team2Goal
// increments team1Points.
function BAI_TargetGoalX takes integer team returns real
    if team == 0 then
        return BAI_goal2x
    endif
    return BAI_goal1x
endfunction

function BAI_TargetGoalY takes integer team returns real
    if team == 0 then
        return BAI_goal2y
    endif
    return BAI_goal1y
endfunction

function BAI_OwnGoalX takes integer team returns real
    if team == 0 then
        return BAI_goal1x
    endif
    return BAI_goal2x
endfunction

function BAI_OwnGoalY takes integer team returns real
    if team == 0 then
        return BAI_goal1y
    endif
    return BAI_goal2y
endfunction

//----------------------------------------------------------------------------
// Ball state, read from the map's own structures.
//----------------------------------------------------------------------------
function BAI_Ball takes nothing returns integer
    return s__Ball_balls[0]
endfunction

function BAI_BallUnit takes nothing returns unit
    return s__Ball_ball[BAI_Ball()]
endfunction

function BAI_BallHeld takes nothing returns boolean
    return s__Ball_hold[BAI_Ball()]
endfunction

function BAI_BallCarrier takes nothing returns unit
    if BAI_BallHeld() then
        return s__Ball_owner[BAI_Ball()]
    endif
    return null
endfunction

//----------------------------------------------------------------------------
// BALL PREDICTOR -- a tick-for-tick replay of s__Ball_movement.
//
// Per 1/32 s tick the map does:
//   on ground (fly height < 1): |v| -= BALL_FRICTION_GROUND, else stop
//   airborne:                   v.z -= GRAVITY_ACCELERATION, |v| -= BALL_FRICTION_AIR
//   x += v.x ; y += v.y
//   landing (z would go below terrain while falling): bounce, v.z = -v.z
//                                    then v.z -= BALL_BUMP_SPEED_LOSS + G/2
//
// Note |v| is the 3-D length (s__Vector_getLength includes z) and setLength
// scales all three components -- friction therefore bleeds the vertical
// component too. That is reproduced here rather than approximated.
//
// The terrain is treated as flat at the ball's current height reference, which
// is true of every pitch in this map; the predictor is a model of the ball,
// not of the terrain.
//----------------------------------------------------------------------------
function BAI_PredictBall takes integer ticks returns nothing
    local integer b  = BAI_Ball()
    local integer v  = s__Ball_vel[b]
    local unit    bu = s__Ball_ball[b]
    local real    x  = GetUnitX(bu)
    local real    y  = GetUnitY(bu)
    local real    h  = GetUnitFlyHeight(bu)
    local real    vx = s__Vector_x[v]
    local real    vy = s__Vector_y[v]
    local real    vz = s__Vector_z[v]
    local integer i  = 0
    local real    len
    local real    scale

    if BAI_BallHeld() then
        // A carried ball sits 100 units in front of its carrier and does not move.
        set BAI_pbx = x
        set BAI_pby = y
        set BAI_pbh = h
        set bu = null
        return
    endif

    loop
        exitwhen i >= ticks
        if h < 1.0 then
            set len = SquareRoot(vx * vx + vy * vy + vz * vz)
            if len > BALL_FRICTION_GROUND then
                set scale = (len - BALL_FRICTION_GROUND) / len
                set vx = vx * scale
                set vy = vy * scale
                set vz = vz * scale
            else
                set vx = 0.0
                set vy = 0.0
                set vz = 0.0
                set h  = 0.0
                exitwhen true
            endif
        else
            set vz = vz - GRAVITY_ACCELERATION
            set len = SquareRoot(vx * vx + vy * vy + vz * vz)
            if len > BALL_FRICTION_AIR then
                set scale = (len - BALL_FRICTION_AIR) / len
                set vx = vx * scale
                set vy = vy * scale
                set vz = vz * scale
            else
                set vx = 0.0
                set vy = 0.0
                set vz = 0.0
            endif
        endif

        set x = x + vx
        set y = y + vy

        if h + vz < 0.0 and vz < 0.0 then
            set h  = 0.0
            set vz = -vz - BALL_BUMP_SPEED_LOSS - GRAVITY_ACCELERATION / 2.0
            if vz < 0.0 then
                set vz = 0.0
            endif
        else
            set h = h + vz
        endif

        set i = i + 1
    endloop

    set BAI_pbx = x
    set BAI_pby = y
    set BAI_pbh = h
    set bu = null
endfunction

//----------------------------------------------------------------------------
// INTERCEPT -- the earliest tick at which this athlete can be where the ball
// is. Walk the predicted flight forward and take the first sample the runner
// can reach at its own move speed; BALL_CATCH_RANGE is credited because the
// catch filter fires on proximity, not on contact.
//
// Sets BAI_ipTicks (-1 = unreachable inside the horizon) and BAI_ipx/BAI_ipy.
//----------------------------------------------------------------------------
function BAI_Intercept takes unit u returns nothing
    local integer b     = BAI_Ball()
    local integer v     = s__Ball_vel[b]
    local unit    bu    = s__Ball_ball[b]
    local real    ux    = GetUnitX(u)
    local real    uy    = GetUnitY(u)
    local real    speed = GetUnitMoveSpeed(u) / 32.0   // units per ball tick
    local real    x     = GetUnitX(bu)
    local real    y     = GetUnitY(bu)
    local real    h     = GetUnitFlyHeight(bu)
    local real    vx    = s__Vector_x[v]
    local real    vy    = s__Vector_y[v]
    local real    vz    = s__Vector_z[v]
    local integer i     = 0
    local real    len
    local real    scale

    set BAI_ipTicks = -1
    set BAI_ipx = x
    set BAI_ipy = y

    if speed <= 0.0 then
        set bu = null
        return
    endif

    // A held ball is chased at its carrier, not predicted.
    if BAI_BallHeld() then
        set BAI_ipTicks = 0
        set bu = null
        return
    endif

    loop
        exitwhen i >= BAI_PREDICT_TICKS
        if BAI_Dist(ux, uy, x, y) <= speed * I2R(i) + BALL_CATCH_RANGE then
            set BAI_ipTicks = i
            set BAI_ipx = x
            set BAI_ipy = y
            set bu = null
            return
        endif

        if h < 1.0 then
            set len = SquareRoot(vx * vx + vy * vy + vz * vz)
            if len > BALL_FRICTION_GROUND then
                set scale = (len - BALL_FRICTION_GROUND) / len
                set vx = vx * scale
                set vy = vy * scale
                set vz = vz * scale
            else
                set vx = 0.0
                set vy = 0.0
                set vz = 0.0
            endif
        else
            set vz = vz - GRAVITY_ACCELERATION
            set len = SquareRoot(vx * vx + vy * vy + vz * vz)
            if len > BALL_FRICTION_AIR then
                set scale = (len - BALL_FRICTION_AIR) / len
                set vx = vx * scale
                set vy = vy * scale
                set vz = vz * scale
            else
                set vx = 0.0
                set vy = 0.0
                set vz = 0.0
            endif
        endif

        set x = x + vx
        set y = y + vy
        if h + vz < 0.0 and vz < 0.0 then
            set h  = 0.0
            set vz = -vz - BALL_BUMP_SPEED_LOSS - GRAVITY_ACCELERATION / 2.0
            if vz < 0.0 then
                set vz = 0.0
            endif
        else
            set h = h + vz
        endif

        set i = i + 1
    endloop

    // Unreachable inside the horizon: run at where it comes to rest.
    set BAI_ipx = x
    set BAI_ipy = y
    set bu = null
endfunction

//----------------------------------------------------------------------------
// ORDER ECONOMY. Re-issuing a move order every tick restarts pathing, which is
// exactly what made the Fall of Rome AI stutter in its first playtest. An
// order is issued only when it asks for something meaningfully different from
// the one this unit is already following.
//----------------------------------------------------------------------------
function BAI_TryOrder takes integer pid, unit u, integer kind, real x, real y returns boolean
    if u == null or GetUnitTypeId(u) == 0 then
        return false
    endif
    if kind == BAI_lastOrdKind[pid] and BAI_Dist(x, y, BAI_lastOrdX[pid], BAI_lastOrdY[pid]) < BAI_REORDER_DIST then
        return false
    endif
    set BAI_lastOrdKind[pid] = kind
    set BAI_lastOrdX[pid] = x
    set BAI_lastOrdY[pid] = y
    call IssuePointOrder(u, "move", x, y)
    return true
endfunction

// Clears the memory so the next order is always issued (used when a decision
// changes category, e.g. chase -> shoot).
function BAI_ForgetOrder takes integer pid returns nothing
    set BAI_lastOrdKind[pid] = 0
    set BAI_lastOrdX[pid] = 0.0
    set BAI_lastOrdY[pid] = 0.0
endfunction

//----------------------------------------------------------------------------
// Kick. s__Ball_castUtil is the map's own Kick handler (see header note).
//----------------------------------------------------------------------------
function BAI_Kick takes integer pid, unit u, real x, real y returns nothing
    local real n = BAI_aimNoise[pid]
    call s__Ball_castUtil(u, x + BAI_Noise(n), y + BAI_Noise(n))
    call BAI_ForgetOrder(pid)
endfunction

//----------------------------------------------------------------------------
// Team helpers.
//----------------------------------------------------------------------------
function BAI_UnitOf takes integer pid returns unit
    return Players___playerUnit[pid]
endfunction

function BAI_Alive takes unit u returns boolean
    return u != null and GetUnitTypeId(u) != 0 and IsUnitType(u, UNIT_TYPE_PLAYER)
endfunction

// Nearest opponent to (x,y); returns 999999 in BAI_pbh-free form via distance.
function BAI_NearestEnemyDist takes integer team, real x, real y returns real
    local integer i = 0
    local real    best = 999999.0
    local real    d
    local unit    u
    loop
        exitwhen i >= MAX_PLAYERS
        if GetPlayerTeam(Player(i)) != team then
            set u = BAI_UnitOf(i)
            if BAI_Alive(u) then
                set d = BAI_Dist(x, y, GetUnitX(u), GetUnitY(u))
                if d < best then
                    set best = d
                endif
            endif
        endif
        set i = i + 1
    endloop
    set u = null
    return best
endfunction

//----------------------------------------------------------------------------
// The roster. The first build hard-coded one class, so every bot was a Karma
// Green Inn and the pitch was a row of identical treants. These are the
// playable classes (utyp "ancient,giant") with kits worth playing: powershot,
// curveshot, slam, and plain runners.
//----------------------------------------------------------------------------
function BAI_InitRoster takes nothing returns nothing
    set BAI_roster[0] = 'h00F'   // Akari Ska as Ion Ink -- sprint + POWERSHOT
    set BAI_roster[1] = 'h012'   // Dark Dawn Oar        -- sprint + CURVESHOT both ways
    set BAI_roster[2] = 'h00P'   // Karma Green Inn      -- sprint + SLAM
    set BAI_roster[3] = 'h003'   // Karmic Livid Lion
    set BAI_roster[4] = 'h005'   // Nisei Linesman
    set BAI_roster[5] = 'h00Y'   // Szura Coh
    set BAI_roster[6] = 'h029'   // Manful Loaf
    set BAI_roster[7] = 'h02C'   // Marzipan USA Bro
    set BAI_rosterN = 8
endfunction

// Spread the roster across slots so team-mates differ, with a per-game offset
// so it is not the same eleven every match.
function BAI_ClassFor takes integer pid returns integer
    if BAI_rosterN == 0 then
        call BAI_InitRoster()
    endif
    return BAI_roster[ModuloInteger(pid + BAI_rosterOffset, BAI_rosterN)]
endfunction

function BAI_HasAbil takes unit u, integer id returns boolean
    return GetUnitAbilityLevel(u, id) > 0
endfunction

//----------------------------------------------------------------------------
// Which side of the line to the target the nearest blocker stands on. Sign of
// the 2-D cross product: positive means the blocker is to the left, so a shot
// has to bend the other way to get round him.
//----------------------------------------------------------------------------
function BAI_BlockerSide takes integer team, real x0, real y0, real x1, real y1 returns integer
    local integer i    = 0
    local real    dx   = x1 - x0
    local real    dy   = y1 - y0
    local real    len  = SquareRoot(dx * dx + dy * dy)
    local real    best = 999999.0
    local integer side = 0
    local real    t
    local real    cross
    local unit    u
    if len < 1.0 then
        return 0
    endif
    set dx = dx / len
    set dy = dy / len
    loop
        exitwhen i >= MAX_PLAYERS
        if GetPlayerTeam(Player(i)) != team then
            set u = BAI_UnitOf(i)
            if BAI_Alive(u) then
                set t = (GetUnitX(u) - x0) * dx + (GetUnitY(u) - y0) * dy
                if t > 0.0 and t < len and t < best then
                    set cross = dx * (GetUnitY(u) - y0) - dy * (GetUnitX(u) - x0)
                    set best = t
                    if cross > 0.0 then
                        set side = 1
                    else
                        set side = -1
                    endif
                endif
            endif
        endif
        set i = i + 1
    endloop
    set u = null
    return side
endfunction

//----------------------------------------------------------------------------
// Shot lane. A shot is worth taking only if no opponent sits close to the
// straight line from the ball to the aim point. This is a corridor test, not a
// physics trace -- it does not model the ball bouncing over a defender.
//----------------------------------------------------------------------------
function BAI_LaneClear takes integer team, real x0, real y0, real x1, real y1 returns boolean
    local integer i   = 0
    local real    dx  = x1 - x0
    local real    dy  = y1 - y0
    local real    len = SquareRoot(dx * dx + dy * dy)
    local real    t
    local real    px
    local real    py
    local unit    u
    local boolean ok = true
    if len < 1.0 then
        return true
    endif
    set dx = dx / len
    set dy = dy / len
    loop
        exitwhen i >= MAX_PLAYERS
        if GetPlayerTeam(Player(i)) != team then
            set u = BAI_UnitOf(i)
            if BAI_Alive(u) then
                set t = (GetUnitX(u) - x0) * dx + (GetUnitY(u) - y0) * dy
                if t > 0.0 and t < len then
                    set px = x0 + dx * t
                    set py = y0 + dy * t
                    if BAI_Dist(GetUnitX(u), GetUnitY(u), px, py) < BAI_LANE_HALFWIDTH then
                        set ok = false
                    endif
                endif
            endif
        endif
        set i = i + 1
    endloop
    set u = null
    return ok
endfunction

//----------------------------------------------------------------------------
// Pass selection: the teammate who is both closer to the target goal than the
// carrier and has a clear lane. Returns the player id, or -1.
//----------------------------------------------------------------------------
function BAI_BestPass takes integer pid, integer team, real x, real y returns integer
    local integer i    = 0
    local integer best = -1
    local real    bestGain = 220.0    // must actually advance the ball
    local real    gx   = BAI_TargetGoalX(team)
    local real    gy   = BAI_TargetGoalY(team)
    local real    mine = BAI_Dist(x, y, gx, gy)
    local real    d
    local real    gain
    local unit    u
    loop
        exitwhen i >= MAX_PLAYERS
        if i != pid and GetPlayerTeam(Player(i)) == team then
            set u = BAI_UnitOf(i)
            if BAI_Alive(u) then
                set d = BAI_Dist(x, y, GetUnitX(u), GetUnitY(u))
                if d < BAI_PASS_RANGE and d > 200.0 then
                    set gain = mine - BAI_Dist(GetUnitX(u), GetUnitY(u), gx, gy)
                    if gain > bestGain and BAI_LaneClear(team, x, y, GetUnitX(u), GetUnitY(u)) then
                        set bestGain = gain
                        set best = i
                    endif
                endif
            endif
        endif
        set i = i + 1
    endloop
    set u = null
    return best
endfunction

//----------------------------------------------------------------------------
// ROLES. One keeper per team (the slot nearest its own goal at kickoff), the
// rest split by how far they are from the ball. Recomputed every think, which
// is cheap and self-correcting -- there is no role memory to go stale.
//----------------------------------------------------------------------------
function BAI_AssignRole takes integer pid, integer team, unit u returns integer
    local integer i     = 0
    local integer rank  = 0
    local real    myOwn = BAI_Dist(GetUnitX(u), GetUnitY(u), BAI_OwnGoalX(team), BAI_OwnGoalY(team))
    local real    myBall
    local integer ballRank = 0
    local unit    o
    local real    bx
    local real    by

    call BAI_PredictBall(0)
    set bx = BAI_pbx
    set by = BAI_pby
    set myBall = BAI_Dist(GetUnitX(u), GetUnitY(u), bx, by)

    loop
        exitwhen i >= MAX_PLAYERS
        if i != pid and GetPlayerTeam(Player(i)) == team then
            set o = BAI_UnitOf(i)
            if BAI_Alive(o) then
                if BAI_Dist(GetUnitX(o), GetUnitY(o), BAI_OwnGoalX(team), BAI_OwnGoalY(team)) < myOwn then
                    set rank = rank + 1
                endif
                if BAI_Dist(GetUnitX(o), GetUnitY(o), bx, by) < myBall then
                    set ballRank = ballRank + 1
                endif
            endif
        endif
        set i = i + 1
    endloop
    set o = null

    if rank == 0 then
        return 0        // deepest man keeps goal
    endif
    if ballRank == 0 then
        return 2        // closest to the ball goes for it
    endif
    return 1
endfunction

//----------------------------------------------------------------------------
// Ability use. Sprint is a toggle whose order string is inferred from its base
// ability, so it is SELF-VERIFYING: if the buff does not appear after an
// attempt, this slot stops trying for the rest of the game. Slam and Powershot
// use order strings that are declared in the map's own object data.
//----------------------------------------------------------------------------
function BAI_TrySprint takes integer pid, unit u returns nothing
    if not BAI_useAbilities[pid] or not BAI_sprintWorks[pid] then
        return
    endif
    if GetUnitAbilityLevel(u, SPRINT_RAWCODE) == 0 then
        return
    endif
    if GetUnitAbilityLevel(u, SPRINT_BUFF_RAWCODE) > 0 then
        return                        // already sprinting
    endif
    call IssueImmediateOrder(u, BAI_ORD_SPRINT)
    if GetUnitAbilityLevel(u, SPRINT_BUFF_RAWCODE) == 0 then
        // The order did nothing this time. One failure is not proof (the
        // ability may simply be on cooldown), so only a failure while the
        // ability is off cooldown and unbuffed disables further attempts.
        set BAI_sprintWorks[pid] = false
    endif
endfunction

function BAI_TrySlam takes integer pid, unit u, unit carrier returns boolean
    if not BAI_useAbilities[pid] or carrier == null then
        return false
    endif
    if GetUnitAbilityLevel(u, SLAM_RAWCODE) == 0 then
        return false
    endif
    if BAI_Dist(GetUnitX(u), GetUnitY(u), GetUnitX(carrier), GetUnitY(carrier)) > BAI_SLAM_RANGE then
        return false
    endif
    call IssueImmediateOrder(u, BAI_ORD_SLAM)
    return true
endfunction

//----------------------------------------------------------------------------
// TRICKSHOTS.
//
// Powershot (A003, order "parasite", 6 s cooldown, 0.5 s charge): the map
// kicks at POWERSHOT_SPEED with z 0 and then sets the ball's friction globals
// to 0.02 with no bounce loss, so the shot is flat and effectively unstoppable
// by distance -- it scores from places a normal kick cannot reach. The charge
// locks the caster's turn speed, so it is only worth starting when nobody is
// close enough to take the ball off him.
//
// Curveshot (A00Q counter-clockwise / A00R clockwise, 1 s cooldown): the ball
// bends, so it is the answer to a BLOCKED lane rather than an open one. The
// bend is chosen away from the side the blocker stands on.
//----------------------------------------------------------------------------
function BAI_TryPowershot takes integer pid, unit u, real gx, real gy returns boolean
    if not BAI_useAbilities[pid] or not BAI_HasAbil(u, BAI_POWERSHOT_ABIL) then
        return false
    endif
    if pShotCharging then
        return false
    endif
    if BAI_NearestEnemyDist(GetPlayerTeam(Player(pid)), GetUnitX(u), GetUnitY(u)) < BAI_PRESSURE_RANGE then
        return false      // no time to charge
    endif
    if BAI_Dist(GetUnitX(u), GetUnitY(u), gx, gy) > BAI_POWERSHOT_RANGE then
        return false
    endif
    if not BAI_LaneClear(GetPlayerTeam(Player(pid)), GetUnitX(u), GetUnitY(u), gx, gy) then
        return false
    endif
    call IssuePointOrder(u, BAI_ORD_POWERSHOT, gx, gy)
    call BAI_ForgetOrder(pid)
    return true
endfunction

function BAI_TryCurve takes integer pid, unit u, real gx, real gy returns boolean
    local integer team = GetPlayerTeam(Player(pid))
    local integer side
    if not BAI_useAbilities[pid] then
        return false
    endif
    set side = BAI_BlockerSide(team, GetUnitX(u), GetUnitY(u), gx, gy)
    if side == 0 then
        return false      // nothing in the way; a plain kick is better
    endif
    // Bend away from the blocker: he is on the left -> curve clockwise.
    if side > 0 and BAI_HasAbil(u, BAI_CURVE_CW_ABIL) then
        call IssuePointOrder(u, BAI_ORD_CURVE_CW, gx, gy)
        call BAI_ForgetOrder(pid)
        return true
    endif
    if side < 0 and BAI_HasAbil(u, BAI_CURVE_CCW_ABIL) then
        call IssuePointOrder(u, BAI_ORD_CURVE_CCW, gx, gy)
        call BAI_ForgetOrder(pid)
        return true
    endif
    return false
endfunction

//----------------------------------------------------------------------------
// MARKING. The first build sent every defender to the midpoint between the
// ball and its own goal, so they bunched into one clump and covered nothing.
// Each defender now takes a DIFFERENT opponent -- ranked by how close that
// opponent is to the goal being defended, most dangerous first -- and stands
// goal-side of him. Sets BAI_ipx/BAI_ipy.
//----------------------------------------------------------------------------
function BAI_MarkSpot takes integer pid, integer team, integer rank returns nothing
    local integer i     = 0
    local integer seen  = 0
    local integer bestI = -1
    local real    bestD = 999999.0
    local real    d
    local real    ownx  = BAI_OwnGoalX(team)
    local real    owny  = BAI_OwnGoalY(team)
    local unit    o
    local real    dx
    local real    dy
    local real    len

    // Walk the opponents rank+1 times, each pass taking the nearest one not
    // already claimed by a lower-ranked defender.
    loop
        exitwhen seen > rank
        set bestI = -1
        set bestD = 999999.0
        set i = 0
        loop
            exitwhen i >= MAX_PLAYERS
            if GetPlayerTeam(Player(i)) != team and not BAI_claimed[i] then
                set o = BAI_UnitOf(i)
                if BAI_Alive(o) then
                    set d = BAI_Dist(GetUnitX(o), GetUnitY(o), ownx, owny)
                    if d < bestD then
                        set bestD = d
                        set bestI = i
                    endif
                endif
            endif
            set i = i + 1
        endloop
        exitwhen bestI < 0
        set BAI_claimed[bestI] = true
        set seen = seen + 1
    endloop
    set o = null

    if bestI < 0 then
        // Nobody left to mark: hold the space in front of our goal.
        set BAI_ipx = ownx + (BAI_pbx - ownx) * 0.35
        set BAI_ipy = owny + (BAI_pby - owny) * 0.35
        return
    endif

    set o = BAI_UnitOf(bestI)
    set dx = ownx - GetUnitX(o)
    set dy = owny - GetUnitY(o)
    set len = SquareRoot(dx * dx + dy * dy)
    if len < 1.0 then
        set len = 1.0
    endif
    set BAI_ipx = GetUnitX(o) + dx / len * BAI_MARK_DEPTH
    set BAI_ipy = GetUnitY(o) + dy / len * BAI_MARK_DEPTH
    set o = null
endfunction

// How many team-mates of this slot are closer to the ball than it is -- the
// defender's rank, which is also which opponent it picks up.
function BAI_DefenceRank takes integer pid, integer team returns integer
    local integer i    = 0
    local integer rank = 0
    local unit    me   = BAI_UnitOf(pid)
    local real    myd  = BAI_Dist(GetUnitX(me), GetUnitY(me), BAI_pbx, BAI_pby)
    local unit    o
    loop
        exitwhen i >= MAX_PLAYERS
        if i != pid and GetPlayerTeam(Player(i)) == team then
            set o = BAI_UnitOf(i)
            if BAI_Alive(o) then
                if BAI_Dist(GetUnitX(o), GetUnitY(o), BAI_pbx, BAI_pby) < myd then
                    set rank = rank + 1
                endif
            endif
        endif
        set i = i + 1
    endloop
    set me = null
    set o = null
    return rank
endfunction

//----------------------------------------------------------------------------
// THE DECISION. Four cases, in priority order:
//   1. I carry the ball   -> shoot, else pass, else drive at the goal
//   2. A team-mate carries -> take a support position off the ball
//   3. An opponent carries -> keeper holds the line, others close him down
//   4. The ball is loose   -> whoever can get there first goes; others shape up
//----------------------------------------------------------------------------
function BAI_Act takes integer pid returns nothing
    local unit    u    = BAI_UnitOf(pid)
    local integer team = GetPlayerTeam(Player(pid))
    local unit    car
    local integer role
    local integer mate
    local real    gx
    local real    gy
    local real    ux
    local real    uy
    local real    bx
    local real    by
    local real    aimY
    local real    ownx
    local real    owny
    local real    d
    local real    lead

    if not BAI_Alive(u) then
        set u = null
        return
    endif
    if gameEnded then
        set u = null
        return
    endif

    set ux   = GetUnitX(u)
    set uy   = GetUnitY(u)
    set gx   = BAI_TargetGoalX(team)
    set gy   = BAI_TargetGoalY(team)
    set ownx = BAI_OwnGoalX(team)
    set owny = BAI_OwnGoalY(team)

    call BAI_PredictBall(0)
    set bx = BAI_pbx
    set by = BAI_pby

    //--- 0. the whistle has not gone -----------------------------------------
    // The map counts 3-2-1 into "Play!" and only then sets `playing`. Kicking
    // off early is what the first build did; now the bots take their shape and
    // wait, like the humans do.
    if not playing or not goalEnabled then
        set role = BAI_AssignRole(pid, team, u)
        if role == 0 then
            call BAI_TryOrder(pid, u, 1, ownx + (bx - ownx) * 0.10, owny)
        else
            call BAI_TryOrder(pid, u, 1, (ux + ownx) / 2.0, uy)
        endif
        set u = null
        return
    endif

    set car  = BAI_BallCarrier()
    set role = BAI_AssignRole(pid, team, u)
    set BAI_role[pid] = role

    //--- 1. I have the ball ---------------------------------------------------
    if car == u then
        set d = BAI_Dist(ux, uy, gx, gy)
        // Aim off-centre so the shot does not always run at the keeper.
        set aimY = gy + BAI_Noise(BAI_goalHalf * 0.6)

        if d < BAI_SHOOT_RANGE and BAI_LaneClear(team, ux, uy, gx, aimY) then
            call BAI_Kick(pid, u, gx, aimY)
            set u = null
            set car = null
            return
        endif
        // Blocked but shootable: bend it round him.
        if d < BAI_SHOOT_RANGE and BAI_TryCurve(pid, u, gx, aimY) then
            set u = null
            set car = null
            return
        endif
        // Too far to kick, but a powershot is flat and near-frictionless.
        if BAI_TryPowershot(pid, u, gx, aimY) then
            set u = null
            set car = null
            return
        endif

        // Passing is the default, not the fallback: carrying is slowed by the
        // map's own ball-slow debuff and a kick travels 3.2x a dribble.
        set mate = BAI_BestPass(pid, team, ux, uy)
        if mate >= 0 then
            // Into space ahead of him, toward the goal, not at his feet.
            set lead = BAI_Dist(GetUnitX(BAI_UnitOf(mate)), GetUnitY(BAI_UnitOf(mate)), gx, gy)
            if lead < 1.0 then
                set lead = 1.0
            endif
            call BAI_Kick(pid, u, GetUnitX(BAI_UnitOf(mate)) + (gx - GetUnitX(BAI_UnitOf(mate))) / lead * BAI_PASS_LEAD, GetUnitY(BAI_UnitOf(mate)) + (gy - GetUnitY(BAI_UnitOf(mate))) / lead * BAI_PASS_LEAD)
            set u = null
            set car = null
            return
        endif

        call BAI_TrySprint(pid, u)
        call BAI_TryOrder(pid, u, 1, gx, gy)
        set u = null
        set car = null
        return
    endif

    //--- 2. a team-mate has it -----------------------------------------------
    if car != null and GetPlayerTeam(GetOwningPlayer(car)) == team then
        if role == 0 then
            call BAI_TryOrder(pid, u, 1, ownx + (bx - ownx) * 0.12, owny)
        else
            // Offer an option ahead of the carrier, spread off his line.
            call BAI_TryOrder(pid, u, 1, (GetUnitX(car) + gx) / 2.0, GetUnitY(car) + BAI_SUPPORT_SPREAD * I2R(1 - 2 * ModuloInteger(pid, 2)))
        endif
        set u = null
        set car = null
        return
    endif

    //--- 3. an opponent has it -- DEFEND -------------------------------------
    if car != null then
        if BAI_TrySlam(pid, u, car) then
            set u = null
            set car = null
            return
        endif
        if role == 0 then
            set d = BAI_Dist(bx, by, ownx, owny)
            if d < 1.0 then
                set d = 1.0
            endif
            call BAI_TryOrder(pid, u, 1, ownx + (bx - ownx) / d * BAI_KEEPER_DEPTH, owny + (by - owny) / d * BAI_KEEPER_DEPTH)
        elseif role == 2 then
            // Nearest man closes the carrier down.
            call BAI_TrySprint(pid, u)
            call BAI_TryOrder(pid, u, 1, GetUnitX(car), GetUnitY(car))
        else
            // Everyone else picks up a DIFFERENT opponent and stands goal-side
            // of him, instead of piling onto the ball.
            call BAI_MarkSpot(pid, team, BAI_DefenceRank(pid, team) - 1)
            call BAI_TryOrder(pid, u, 1, BAI_ipx, BAI_ipy)
        endif
        set u = null
        set car = null
        return
    endif

    //--- 4. the ball is loose ------------------------------------------------
    call BAI_Intercept(u)
    if role == 0 then
        set d = BAI_Dist(bx, by, ownx, owny)
        if d < 1.0 then
            set d = 1.0
        endif
        if BAI_ipTicks >= 0 and BAI_Dist(BAI_ipx, BAI_ipy, ownx, owny) < 900.0 then
            call BAI_TryOrder(pid, u, 1, BAI_ipx, BAI_ipy)
        else
            call BAI_TryOrder(pid, u, 1, ownx + (bx - ownx) / d * BAI_KEEPER_DEPTH, owny + (by - owny) / d * BAI_KEEPER_DEPTH)
        endif
    elseif role == 2 then
        call BAI_TrySprint(pid, u)
        call BAI_TryOrder(pid, u, 1, BAI_ipx, BAI_ipy)
    else
        // Second man goes for it too; the rest hold their marks.
        if BAI_DefenceRank(pid, team) <= 1 then
            call BAI_TryOrder(pid, u, 1, BAI_ipx, BAI_ipy)
        else
            call BAI_MarkSpot(pid, team, BAI_DefenceRank(pid, team) - 2)
            call BAI_TryOrder(pid, u, 1, BAI_ipx, BAI_ipy)
        endif
    endif

    set u = null
    set car = null
endfunction

//----------------------------------------------------------------------------
// THINK LOOP. One sub-tick per BAI_THINK_PERIOD; each slot is handled on the
// sub-tick matching its id modulo BAI_SLOT_STAGGER, so the twelve slots never
// decide in the same frame.
//----------------------------------------------------------------------------


//----------------------------------------------------------------------------
// Slot takeover. A slot is a candidate when nobody is playing it (empty or
// computer) -- exactly the case where the map otherwise fields ten men against
// eleven. An athlete is created if the slot never picked one.
//----------------------------------------------------------------------------
function BAI_StartXOf takes integer pid, integer team returns real
    // A slot the map never registered has no start position at all, so the
    // raw array reads 0.0 -- which is the map ORIGIN, thousands of units off
    // the pitch. That is what shipped in the first build: the bots existed and
    // stood nowhere. Never spawn on an unset position; fall back to the team's
    // own start rect.
    if Players___playerStartX[pid] != 0.0 then
        return Players___playerStartX[pid]
    endif
    if team == 0 then
        return GetRectCenterX(gg_rct_Start_1)
    endif
    return GetRectCenterX(gg_rct_Start_2)
endfunction

function BAI_StartYOf takes integer pid, integer team returns real
    if Players___playerStartY[pid] != 0.0 then
        return Players___playerStartY[pid]
    endif
    if team == 0 then
        return GetRectCenterY(gg_rct_Start_1)
    endif
    return GetRectCenterY(gg_rct_Start_2)
endfunction

//----------------------------------------------------------------------------
// Registration. The map builds its player list in Players___init from slots in
// PLAYER_SLOT_STATE_PLAYING only, and ArrangeStartPositions -- which hands out
// the start positions -- walks that list. An empty slot is therefore invisible
// to every per-player system in the map: no start position, no kickoff reset,
// no place in the spacing of its own team.
//
// So the AI registers the slot through the map's OWN Players___initPlayer
// rather than bolting a unit on beside it.
//
// One side effect has to be undone by hand: initPlayer increments
// Players___playerCountHuman for any MAP_CONTROL_USER slot, and an empty slot
// still reads as USER. Inflating the human count could change what the map
// waits for, so it is snapshotted and restored.
//----------------------------------------------------------------------------
function BAI_Register takes integer pid returns nothing
    local integer humans
    if BAI_registered[pid] then
        return
    endif
    set BAI_registered[pid] = true
    // A slot the map already registered (a real computer slot that is PLAYING)
    // must not be registered twice.
    if GetPlayerSlotState(Player(pid)) == PLAYER_SLOT_STATE_PLAYING then
        return
    endif
    set humans = Players___playerCountHuman
    call Players___initPlayer(Player(pid))
    set Players___playerCountHuman = humans
endfunction

function BAI_EnsureAthlete takes integer pid returns nothing
    local unit u = BAI_UnitOf(pid)
    local integer team = GetPlayerTeam(Player(pid))
    if BAI_Alive(u) then
        set u = null
        return
    endif
    // h00P is classified "ancient,giant" = UNIT_TYPE_OBJECT + UNIT_TYPE_PLAYER,
    // so CreateUnit alone gets it auto-indexed into the map's Object system
    // (s__Object_AutoCreate___creator) and recognised by the ball catch filter.
    set u = CreateUnit(Player(pid), BAI_ClassFor(pid), BAI_StartXOf(pid, team), BAI_StartYOf(pid, team), Players___playerFacing[pid])
    set Players___playerUnit[pid] = u
    call SetUnitColor(u, GetPlayerColor(Player(pid)))
    call Pick___addAbilities(u)
    set u = null
endfunction

//----------------------------------------------------------------------------
// THINK LOOP. One sub-tick per BAI_THINK_PERIOD; each slot is handled on the
// sub-tick matching its id modulo BAI_SLOT_STAGGER, so the twelve slots never
// decide in the same frame.
//----------------------------------------------------------------------------
function BAI_Tick takes nothing returns nothing
    local integer i = 0
    if not BAI_enabled then
        return
    endif
    // The field is chosen after the game starts and MOVES the goal rects, and
    // a field can be re-picked between matches -- so geometry is re-read every
    // tick (five rect reads) rather than latched at boot.
    call BAI_RefreshGeometry()
    // Marking claims are per pass, so they are cleared before each one.
    loop
        exitwhen i >= MAX_PLAYERS
        set BAI_claimed[i] = false
        set i = i + 1
    endloop
    set i = 0
    set BAI_subTick = ModuloInteger(BAI_subTick + 1, BAI_SLOT_STAGGER)
    // Slots that lose their athlete mid-match are given a new one on a rescan.
    if BAI_subTick == 0 then
        set BAI_rescan = BAI_rescan + 1
        if BAI_rescan >= 16 then
            set BAI_rescan = 0
            loop
                exitwhen i >= MAX_PLAYERS
                if BAI_on[i] then
                    call BAI_EnsureAthlete(i)
                endif
                set i = i + 1
            endloop
            set i = 0
        endif
    endif
    loop
        exitwhen i >= MAX_PLAYERS
        if BAI_on[i] and ModuloInteger(i, BAI_SLOT_STAGGER) == BAI_subTick then
            call BAI_Act(i)
        endif
        set i = i + 1
    endloop
endfunction

function BAI_EnablePlayer takes integer pid returns nothing
    if pid < 0 or pid >= MAX_PLAYERS then
        return
    endif
    set BAI_on[pid] = true
    set BAI_reaction[pid] = 0.0
    set BAI_aimNoise[pid] = 60.0
    set BAI_useAbilities[pid] = true
    set BAI_sprintWorks[pid] = true
    call BAI_ForgetOrder(pid)
    call BAI_Register(pid)
endfunction

function BAI_SetDifficulty takes integer level returns nothing
    local integer i = 0
    loop
        exitwhen i >= MAX_PLAYERS
        if BAI_on[i] then
            if level == 0 then
                set BAI_aimNoise[i] = 220.0
                set BAI_reaction[i] = 0.35
                set BAI_useAbilities[i] = false
            elseif level == 2 then
                set BAI_aimNoise[i] = 20.0
                set BAI_reaction[i] = 0.0
                set BAI_useAbilities[i] = true
            else
                set BAI_aimNoise[i] = 60.0
                set BAI_reaction[i] = 0.10
                set BAI_useAbilities[i] = true
            endif
        endif
        set i = i + 1
    endloop
endfunction

//----------------------------------------------------------------------------
// Claim every slot nobody is playing, then hand the athletes out.
//
// Order matters. Registration has to happen BEFORE positions are handed out,
// because ArrangeStartPositions divides each team's start rect by how many
// players that team has. The map runs it on EVENT_FIELD_CHOOSE and this
// handler is registered later, so it runs after -- which is why it re-runs
// ArrangeStartPositions itself once the AI slots are in the list. Human
// positions shift to make room, which is correct: there are now more players.
//----------------------------------------------------------------------------
//----------------------------------------------------------------------------
// Hand the athletes out and start thinking. Registration has to happen BEFORE
// positions are handed out, because ArrangeStartPositions divides each team's
// start rect by that team's player count -- so it is re-run, but ONLY when a
// slot was actually added to the map's player list. A computer slot is already
// PLAYING and therefore already registered and already positioned by the map
// itself, and re-arranging for nothing would move the humans for nothing.
//----------------------------------------------------------------------------
function BAI_Activate takes boolean registeredSomeone returns nothing
    local integer i = 0
    if registeredSomeone then
        call ArrangeStartPositions()
    endif
    call BAI_RefreshGeometry()
    loop
        exitwhen i >= MAX_PLAYERS
        if BAI_on[i] then
            call BAI_EnsureAthlete(i)
        endif
        set i = i + 1
    endloop
    set BAI_enabled = true
    if BAI_timer == null then
        set BAI_timer = CreateTimer()
    endif
    call TimerStart(BAI_timer, BAI_THINK_PERIOD, true, function BAI_Tick)
endfunction

function BAI_Start takes nothing returns nothing
    local integer i = 0
    local boolean added = false

    call BAI_InitRoster()
    set BAI_rosterOffset = ModuloInteger(BAI_Rand(), BAI_rosterN)

    // A bot exists ONLY where the host made a Computer slot. An empty slot is
    // left empty: it is a slot nobody asked to be filled.
    //
    // Note for anyone reading this next to the map: this map's own config()
    // declares all twelve slots MAP_CONTROL_USER, so whether the lobby offers
    // a Computer option at all is a question only the game answers. If it does
    // not, -aifill is the deliberate way in.
    loop
        exitwhen i >= MAX_PLAYERS
        if GetPlayerSlotState(Player(i)) == PLAYER_SLOT_STATE_PLAYING and GetPlayerController(Player(i)) == MAP_CONTROL_COMPUTER then
            if not BAI_on[i] then
                set added = true
            endif
            call BAI_EnablePlayer(i)
        endif
        set i = i + 1
    endloop

    call BAI_Activate(added)
endfunction

// Opt-in: put a bot on every EMPTY slot as well. Nothing calls this unless a
// human types -aifill, so the default stays "computer slots only".
function BAI_Fill takes nothing returns nothing
    local integer i = 0
    local boolean added = false
    loop
        exitwhen i >= MAX_PLAYERS
        if GetPlayerSlotState(Player(i)) != PLAYER_SLOT_STATE_PLAYING and not BAI_on[i] then
            set added = true
            call BAI_EnablePlayer(i)
        endif
        set i = i + 1
    endloop
    call BAI_Activate(added)
endfunction

function BAI_OnFieldChoose takes nothing returns boolean
    call BAI_Start()
    return false
endfunction

function BAI_Chat takes nothing returns boolean
    local string s = GetEventPlayerChatString()
    if s == "-aieasy" then
        call BAI_SetDifficulty(0)
    elseif s == "-ainormal" then
        call BAI_SetDifficulty(1)
    elseif s == "-aihard" then
        call BAI_SetDifficulty(2)
    elseif s == "-aioff" then
        set BAI_enabled = false
    elseif s == "-aion" then
        call BAI_Start()
    elseif s == "-aifill" then
        call BAI_Fill()
    endif
    return false
endfunction

function BAI_Boot takes nothing returns nothing
    local trigger t = CreateTrigger()
    local integer i = 0
    loop
        exitwhen i >= MAX_PLAYERS
        call TriggerRegisterPlayerChatEvent(t, Player(i), "-ai", false)
        set i = i + 1
    endloop
    call TriggerAddCondition(t, Condition(function BAI_Chat))
    set t = null
endfunction

function BAI_Init takes nothing returns nothing
    call BAI_Boot()
    // Athletes are handed out when the field is chosen, because that is when
    // the map moves the goal rects and hands out start positions -- not on a
    // guessed delay, which is what the first build used.
    call TriggerAddCondition(s__Event_e[EVENT_FIELD_CHOOSE], Condition(function BAI_OnFieldChoose))
endfunction
//! BAI_FUNCTIONS_END
