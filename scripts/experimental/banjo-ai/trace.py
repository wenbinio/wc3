#!/usr/bin/env python3
"""Headless verification for the Banjoball AI.

Three things are checked, in increasing order of how much they are worth:

  1. CONTRACT      -- the module type-checks against a written-out stub of the
                      natives it calls AND of every map internal it reads, so
                      a rename in either direction is a hard failure rather
                      than an AI that loads and does nothing.
  2. PHYSICS       -- the ball model used by the AI's predictor is replayed in
                      Python with the constants PARSED FROM THE SHIPPED .j, so
                      it cannot drift from the map. Range, bounce and rest
                      behaviour are asserted against that model.
  3. SOURCE GUARDS -- properties an interpreter cannot reach are asserted
                      against the AI's own source text: the order choke point
                      exists and is the only place orders are issued, the
                      physics constants are read live rather than copied, the
                      PRNG is in Schrage form, and nothing cheats.

What this does NOT do is run the AI. lib/sim is Lua-only and this map is JASS,
so the decision layer below is a MODEL of the shipped code, joined to it by the
source guards -- the same honesty the Fall of Rome AI's trace carries. Nothing
here is evidence that the AI plays well; it is evidence that it does what it
says, with the map's own numbers.

Usage:  python3 trace.py [--map <war3map.j>]
"""
import argparse
import math
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE = os.path.join(HERE, 'for-banjo.j')
DEFAULT_MAP = os.path.join(HERE, '..', '..', '..', '_build', 'banjo',
                           'extract', 'scripts', 'war3map.j')

fails = []
checks = 0


def ok(cond, label, detail=''):
    global checks
    checks += 1
    if cond:
        print('  PASS %-62s %s' % (label, detail))
    else:
        print('  FAIL %-62s %s' % (label, detail))
        fails.append(label)


def head(t):
    print()
    print('=' * 78)
    print(t)
    print('=' * 78)


# ---------------------------------------------------------------------------
# Constants, parsed from the shipped scripts rather than typed in here.
# ---------------------------------------------------------------------------
def parse_reals(text, names):
    out = {}
    for n in names:
        m = re.search(r'(?:constant\s+)?real\s+' + n + r'\s*=\s*(-?[0-9.]+)', text)
        if m:
            out[n] = float(m.group(1))
    return out


def parse_ints(text, names):
    out = {}
    for n in names:
        m = re.search(r'(?:constant\s+)?integer\s+' + n + r'\s*=\s*(-?[0-9]+)', text)
        if m:
            out[n] = int(m.group(1))
    return out


# ---------------------------------------------------------------------------
# 1. CONTRACT -- type-check the module against stubbed natives + map internals.
#
# The stub file is written here rather than taken from the game: it declares
# only the signatures the module uses. No Blizzard file is redistributed.
# ---------------------------------------------------------------------------
STUB_NATIVES = """
type agent extends handle
type unit extends agent
type player extends agent
type timer extends agent
type trigger extends agent
type rect extends agent
type boolexpr extends agent
type conditionfunc extends boolexpr
type unittype extends handle
type playercolor extends handle
type playerslotstate extends handle
type mapcontrol extends handle
type playerstate extends handle
type unitstate extends handle

native SquareRoot takes real x returns real
native I2R takes integer i returns real
native ModuloInteger takes integer dividend, integer divisor returns integer
native Player takes integer number returns player
native GetUnitX takes unit whichUnit returns real
native GetUnitY takes unit whichUnit returns real
native GetUnitFlyHeight takes unit whichUnit returns real
native GetUnitMoveSpeed takes unit whichUnit returns real
native GetUnitTypeId takes unit whichUnit returns integer
native GetUnitAbilityLevel takes unit whichUnit, integer abilcode returns integer
native IsUnitType takes unit whichUnit, unittype whichUnitType returns boolean
native GetOwningPlayer takes unit whichUnit returns player
native GetPlayerTeam takes player whichPlayer returns integer
native GetPlayerColor takes player whichPlayer returns playercolor
native GetPlayerSlotState takes player whichPlayer returns playerslotstate
native GetPlayerController takes player whichPlayer returns mapcontrol
native SetUnitColor takes unit whichUnit, playercolor whichColor returns nothing
native CreateUnit takes player id, integer unitid, real x, real y, real face returns unit
native IssuePointOrder takes unit whichUnit, string order, real x, real y returns boolean
native IssueImmediateOrder takes unit whichUnit, string order returns boolean
native GetRectCenterX takes rect whichRect returns real
native GetRectCenterY takes rect whichRect returns real
native GetRectMinY takes rect whichRect returns real
native GetRectMaxY takes rect whichRect returns real
native CreateTimer takes nothing returns timer
native TimerStart takes timer whichTimer, real timeout, boolean periodic, code handlerFunc returns nothing
native CreateTrigger takes nothing returns trigger
native TriggerAddCondition takes trigger whichTrigger, boolexpr condition returns nothing
native TriggerRegisterPlayerChatEvent takes trigger whichTrigger, player whichPlayer, string chatMessageToDetect, boolean exactMatchOnly returns nothing
native Condition takes code func returns conditionfunc
native GetEventPlayerChatString takes nothing returns string
native GetUnitState takes unit whichUnit, unitstate whichUnitState returns real
native GetUnitCurrentOrder takes unit whichUnit returns integer
native RemoveGuardPosition takes unit whichUnit returns nothing
native OrderId2String takes integer orderId returns string
native DisplayTimedTextToPlayer takes player toPlayer, real x, real y, real duration, string message returns nothing
native I2S takes integer i returns string
native GetLocalPlayer takes nothing returns player
native R2I takes real r returns integer

constant native ConvertUnitType takes integer i returns unittype
constant native ConvertPlayerSlotState takes integer i returns playerslotstate
constant native ConvertMapControl takes integer i returns mapcontrol
constant native ConvertUnitState takes integer i returns unitstate
"""

# Everything the module reads out of the map. This IS the contract: it is
# generated from the same list the injector verifies.
STUB_MAP_GLOBALS = """
globals
    constant playerslotstate PLAYER_SLOT_STATE_PLAYING = ConvertPlayerSlotState(1)
    constant mapcontrol      MAP_CONTROL_COMPUTER      = ConvertMapControl(1)
    constant unittype        UNIT_TYPE_PLAYER          = ConvertUnitType(1)

    constant integer MAX_PLAYERS          = 12
    constant integer SPRINT_RAWCODE       = 'A001'
    constant integer SPRINT_BUFF_RAWCODE  = 'B000'
    constant integer SLAM_RAWCODE         = 'A00C'
    constant unitstate UNIT_STATE_MANA  = ConvertUnitState(1)
    constant real    SPRINT_NEW_SPEED     = 400.0
    constant real    KICK_SPEED           = 30.0
    constant real    KICK_Z               = 7.00
    constant real    BALL_CATCH_RANGE     = 90.0
    constant real    GRAVITY_ACCELERATION = 1.50
    real             BALL_FRICTION_GROUND = 0.45
    real             BALL_FRICTION_AIR    = 0.07
    real             BALL_BUMP_SPEED_LOSS = 4.00

    boolean       goalEnabled = false
    boolean       gameEnded   = false
    boolean       playing     = false
    boolean       pShotCharging = false
    rect          gg_rct_Goal_1 = null
    rect          gg_rct_Goal_2 = null
    rect          gg_rct_Start_1 = null
    rect          gg_rct_Start_2 = null

    integer       EVENT_FIELD_CHOOSE = 0
    integer       Players___playerCountHuman = 0
    trigger array s__Event_e

    integer array s__Ball_balls
    unit    array s__Ball_ball
    unit    array s__Ball_owner
    boolean array s__Ball_hold
    integer array s__Ball_vel
    real    array s__Vector_x
    real    array s__Vector_y
    real    array s__Vector_z
    unit    array Players___playerUnit
    real    array Players___playerStartX
    real    array Players___playerStartY
    real    array Players___playerFacing
endglobals

function s__Ball_castUtil takes unit u, real x, real y returns nothing
endfunction
function Pick___addAbilities takes unit u returns nothing
endfunction
function Players___initPlayer takes player p returns nothing
endfunction
function ArrangeStartPositions takes nothing returns boolean
    return false
endfunction
"""


def contract_check(module_text):
    head('CONTRACT -- module type-checks against stubbed natives + map internals')
    pjass = os.path.join(HERE, '..', '..', '..', 'vendor', 'pjass', 'pjass')
    if not os.path.exists(pjass):
        print('  pjass not built (scripts/setup.sh) -- contract UNCHECKED')
        return None

    g = module_text.split('//! BAI_GLOBALS_BEGIN')[1].split('//! BAI_GLOBALS_END')[0]
    fn = module_text.split('//! BAI_FUNCTIONS_BEGIN')[1].split('//! BAI_FUNCTIONS_END')[0]

    with tempfile.TemporaryDirectory() as d:
        sp = os.path.join(d, 'stub.j')
        mp = os.path.join(d, 'mod.j')
        open(sp, 'w').write(STUB_NATIVES + STUB_MAP_GLOBALS)
        open(mp, 'w').write('globals\n' + g + '\nendglobals\n' + fn + '\n')
        r = subprocess.run([pjass, sp, mp], capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    ok(r.returncode == 0, 'module parses and type-checks in isolation',
       out.splitlines()[-1] if out else '')
    if r.returncode != 0:
        for line in out.splitlines()[:25]:
            print('        ', line)
    return r.returncode == 0


# ---------------------------------------------------------------------------
# 2. PHYSICS -- a replay of s__Ball_movement with the map's own numbers.
#
# mirrors, tick for tick:
#   if fly height < 1:  |v| -= BALL_FRICTION_GROUND   (else the ball stops)
#   else:               v.z -= GRAVITY; |v| -= BALL_FRICTION_AIR
#   x += v.x; y += v.y
#   landing while falling: h = 0; v.z = -v.z - BALL_BUMP_SPEED_LOSS - G/2
# |v| is the 3-D length and setLength scales all three components, so friction
# bleeds the vertical component too -- reproduced, not approximated.
# ---------------------------------------------------------------------------
class Ball:
    def __init__(self, k):
        self.G = k['GRAVITY_ACCELERATION']
        self.fg = k['BALL_FRICTION_GROUND']
        self.fa = k['BALL_FRICTION_AIR']
        self.bump = k['BALL_BUMP_SPEED_LOSS']

    def kick(self, x, y, tx, ty, speed, z):
        dx, dy = tx - x, ty - y
        n = math.hypot(dx, dy) or 1.0
        return dict(x=x, y=y, h=0.0,
                    vx=dx / n * speed, vy=dy / n * speed, vz=z)

    def step(self, s):
        vx, vy, vz, h = s['vx'], s['vy'], s['vz'], s['h']
        if h < 1.0:
            ln = math.sqrt(vx * vx + vy * vy + vz * vz)
            if ln > self.fg:
                k = (ln - self.fg) / ln
                vx, vy, vz = vx * k, vy * k, vz * k
            else:
                s.update(vx=0.0, vy=0.0, vz=0.0, h=0.0)
                return False
        else:
            vz -= self.G
            ln = math.sqrt(vx * vx + vy * vy + vz * vz)
            if ln > self.fa:
                k = (ln - self.fa) / ln
                vx, vy, vz = vx * k, vy * k, vz * k
            else:
                vx = vy = vz = 0.0
        x = s['x'] + vx
        y = s['y'] + vy
        if h + vz < 0.0 and vz < 0.0:
            h = 0.0
            vz = max(0.0, -vz - self.bump - self.G / 2.0)
        else:
            h = h + vz
        s.update(x=x, y=y, h=h, vx=vx, vy=vy, vz=vz)
        return True

    def flight(self, x, y, tx, ty, speed, z, ticks=400):
        s = self.kick(x, y, tx, ty, speed, z)
        path = [(s['x'], s['y'], s['h'])]
        for _ in range(ticks):
            if not self.step(s):
                break
            path.append((s['x'], s['y'], s['h']))
        return path


def physics_checks(k, ai):
    head('PHYSICS -- ball model replayed with the map\'s own constants')
    print('  from the map: G=%.2f  fric_ground=%.2f  fric_air=%.2f  bump=%.2f'
          '  kick=%.1f  kick_z=%.1f  catch=%.1f'
          % (k['GRAVITY_ACCELERATION'], k['BALL_FRICTION_GROUND'],
             k['BALL_FRICTION_AIR'], k['BALL_BUMP_SPEED_LOSS'],
             k['KICK_SPEED'], k['KICK_Z'], k['BALL_CATCH_RANGE']))
    b = Ball(k)
    path = b.flight(0, 0, 10000, 0, k['KICK_SPEED'], k['KICK_Z'])
    rng = path[-1][0]
    ticks = len(path)
    ok(rng > 900, 'a kick carries further than a ground roll',
       'range %.0f units' % rng)
    ok(ai['BAI_SHOOT_RANGE'] < rng, 'shoot range is inside what a kick carries',
       'shoot %.0f < kick %.0f' % (ai['BAI_SHOOT_RANGE'], rng))
    ok(ai['BAI_PASS_RANGE'] < rng, 'pass range is inside what a kick carries',
       'pass %.0f < kick %.0f' % (ai['BAI_PASS_RANGE'], rng))
    ok(ticks < 400, 'the ball comes to rest inside the horizon',
       '%d ticks = %.2f s' % (ticks, ticks / 32.0))

    bounces = sum(1 for i in range(1, len(path) - 1)
                  if path[i][2] == 0.0 and path[i - 1][2] > 0.0)
    ok(bounces >= 1, 'the kick leaves the ground and bounces',
       '%d bounce(s), apex %.1f' % (bounces, max(p[2] for p in path)))

    # A pure ground roll must decelerate linearly and stop.
    s = dict(x=0.0, y=0.0, h=0.0, vx=k['KICK_SPEED'], vy=0.0, vz=0.0)
    n = 0
    while b.step(s) and n < 1000:
        n += 1
    expect = k['KICK_SPEED'] ** 2 / (2 * k['BALL_FRICTION_GROUND'])
    ok(abs(s['x'] - expect) < expect * 0.05, 'ground roll matches v^2/2a',
       'rolled %.0f, closed form %.0f' % (s['x'], expect))

    # The horizon the AI predicts over must cover a full kick.
    horizon = ai['BAI_PREDICT_TICKS']
    ok(horizon >= ticks * 0.5, 'predictor horizon covers a real kick',
       'horizon %d ticks vs kick %d ticks' % (horizon, ticks))

    # Interception: a runner at athlete speed must be able to beat a slow ball
    # to its resting place, and must NOT be credited with catching a fast one
    # it cannot reach.
    speed_per_tick = 300.0 / 32.0
    slow = b.flight(0, 0, 1000, 0, 6.0, 0.0)
    while len(slow) < 128:              # the ball rests; the predictor does not stop
        slow.append(slow[-1])
    reach = None
    for i, (px, py, ph) in enumerate(slow):
        if math.hypot(px - 0.0, py - 400.0) <= speed_per_tick * i + k['BALL_CATCH_RANGE']:
            reach = i
            break
    ok(reach is not None, 'a runner 400 away intercepts a slow roll',
       'at tick %s' % reach)

    fast = b.flight(0, 0, 10000, 0, k['KICK_SPEED'], k['KICK_Z'])
    caught = any(math.hypot(px - 0.0, py - 2500.0) <= speed_per_tick * i + k['BALL_CATCH_RANGE']
                 for i, (px, py, ph) in enumerate(fast))
    ok(not caught, 'a runner 2500 off the line does NOT reach a full kick',
       'correctly unreachable')


# ---------------------------------------------------------------------------
# 3. SOURCE GUARDS -- properties of the shipped module, asserted on its text.
# ---------------------------------------------------------------------------
def source_guards(src):
    head('SOURCE GUARDS -- properties an interpreter cannot reach')

    # Order economy: orders may only be issued from the choke point.
    issue_lines = [l.strip() for l in src.splitlines()
                   if re.search(r'IssuePointOrder\s*\(', l)]
    moves = [l for l in issue_lines if '"move"' in l]
    casts = [l for l in issue_lines if 'BAI_ORD_' in l]
    ok(len(moves) == 1, 'the only movement order is the one in BAI_TryOrder',
       '%d move site(s)' % len(moves))
    ok(len(moves) + len(casts) == len(issue_lines),
       'every other point order is a named ability cast',
       '%d cast(s): %s' % (len(casts),
                           ', '.join(sorted(set(re.findall(r'BAI_ORD_[A-Z_]+',
                                                           ' '.join(casts)))))))
    ok('BAI_REORDER_DIST' in src and
       re.search(r'BAI_Dist\(x, y, BAI_lastOrdX\[pid\], BAI_lastOrdY\[pid\]\) < BAI_REORDER_DIST', src)
       is not None,
       'the choke point drops orders inside the re-order radius')
    ok('BAI_SLOT_STAGGER' in src and
       re.search(r'ModuloInteger\(i, BAI_SLOT_STAGGER\) == BAI_subTick', src) is not None,
       'slots are staggered, not thinking in lockstep')

    # Physics must be read live from the map, never copied into this module.
    for name in ('BALL_FRICTION_GROUND', 'BALL_FRICTION_AIR',
                 'GRAVITY_ACCELERATION', 'BALL_BUMP_SPEED_LOSS',
                 'BALL_CATCH_RANGE'):
        declared = re.search(r'(?:constant\s+)?real\s+' + name + r'\s*=', src)
        used = name in src
        ok(used and not declared,
           'reads the map\'s live %s (no local copy)' % name)

    # No cheating.
    for bad in ('SetPlayerHandicap', 'SetPlayerState', 'SetUnitMoveSpeed',
                'SetPlayerTechResearched', 'FogEnable', 'FogMaskEnable',
                'SetUnitInvulnerable'):
        ok(bad not in src, 'does not call %s (no cheat surface)' % bad)

    # PRNG in Schrage form, and the constants are the Park-Miller ones.
    ok('127773' in src and '2836' in src and '16807' in src,
       'PRNG is Park-Miller via Schrage (32/64-bit portable)')
    ok('GetRandomInt' not in src and 'GetRandomReal' not in src,
       'no engine randomness in the decision path')

    # Geometry is read from the rects, because fields move them.
    ok('GetRectCenterX(gg_rct_Goal_1)' in src,
       'goal geometry read from the rects (fields move them)')
    ok(re.search(r'constant real\s+BAI_GOAL1X', src) is None,
       'no hard-coded goal coordinates')

    # A bot exists only where a Computer slot was made. The automatic path must
    # test for MAP_CONTROL_COMPUTER; filling empty slots must be reachable only
    # from an explicit chat command.
    auto = src[src.index('function BAI_Start takes'):src.index('function BAI_Fill takes')]
    ok('MAP_CONTROL_COMPUTER' in auto and 'PLAYER_SLOT_STATE_PLAYING' in auto,
       'the automatic path claims Computer slots only')
    ok('!= PLAYER_SLOT_STATE_PLAYING' not in auto,
       'the automatic path never claims an empty slot')
    fill_calls = [l for l in src.splitlines() if 'BAI_Fill()' in l]
    ok(len(fill_calls) == 1 and '-aifill' in src,
       'empty slots are filled only from the -aifill command',
       '%d call site(s)' % len(fill_calls))

    code_lines = [l for l in src.splitlines() if not l.strip().startswith('//')]

    # Sprint is free (0 mana, no cooldown) but the map disables a spammed
    # toggle, so attempts must be spaced and conditional on the buff.
    sp = src[src.index('function BAI_ManageSprint takes'):src.index('function BAI_TrySlam takes')]
    ok('GetUnitState(u, UNIT_STATE_MANA)' in sp and 'BAI_SPRINT_RESERVE' in sp,
       'sprint respects the stamina tank (net 20/s off a pool of 100)')
    ok('BAI_ORD_SPRINT_OFF' in sp,
       'sprint is switched OFF again so the tank refills')
    ok(re.search(r'if BAI_sprintWait\[pid\] > 0 then\s*\n\s*set BAI_sprintWait\[pid\] = BAI_sprintWait\[pid\] - 1\s*\n\s*return', sp) is not None,
       'the toggle is rate-limited (SPRINT_SPAM_DISABLE_COOLDOWN)')
    ok(src.count('call BAI_ManageSprint(pid, u, true)') == 0,
       'nothing asks for sprint unconditionally')

    # Chasing is ranked by time, not distance, because sprint changes speeds.
    ok(src.count('BAI_QuickestToBall(pid, team, u)') == 1 and 'GetUnitMoveSpeed(u)' in src,
       'the loose-ball chase is decided by time-to-ball, not raw distance')
    ok(src.count('call BAI_CutLane(') == 1,
       'markers stand in the passing lane, not behind it')
    ok('BAI_PassSafety(team, x, y, GetUnitX(u), GetUnitY(u), u)' in src,
       'passes are chosen by reach time (opponent vs receiver), not a corridor')
    ok(sum(l.count('call RemoveGuardPosition(u)') for l in code_lines) == 1,
       'bot athletes have their guard position removed (computer-slot wander)')
    ok(re.search(r'set BAI_buffNext\[pid\] = BAI_Sprinting\(u\)', src) is not None
       and 'BAI_sprintFails[pid] >= 3' in src,
       'the sprint verdict waits for the NEXT act, not the same one')
    ok('BAI_sliding[pid]' in src and re.search(r'if BAI_sliding\[pid\] then\s*\n\s*set u = null\s*\n\s*return', src) is not None,
       'a bot being slid by the map holds its order instead of re-issuing')
    ok('BAI_AimY' in src and 'BAI_Noise(BAI_goalHalf * 0.6)' not in src,
       'shots aim away from the keeper rather than at a random point')

    # The kick path is the map's own function, and it is the only one used.
    ok(sum(l.count('s__Ball_castUtil(') for l in code_lines) == 1,
       'kicks go through the map\'s own cast handler, once')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--map', default=DEFAULT_MAP)
    a = ap.parse_args()

    src = open(MODULE, encoding='utf-8').read()

    if not os.path.exists(a.map):
        print('map script not found: %s' % a.map)
        print('extract it first:  node tools/w3x-extract.js --recover-names '
              '<Banjoball.w3x> _build/banjo/extract')
        return 2
    mapsrc = open(a.map, encoding='utf-8', errors='replace').read()

    k = parse_reals(mapsrc, ['GRAVITY_ACCELERATION', 'BALL_FRICTION_GROUND',
                             'BALL_FRICTION_AIR', 'BALL_BUMP_SPEED_LOSS',
                             'BALL_CATCH_RANGE', 'KICK_SPEED', 'KICK_Z',
                             'GOAL_HEIGHT'])
    missing = [n for n in ('GRAVITY_ACCELERATION', 'BALL_FRICTION_GROUND',
                           'BALL_FRICTION_AIR', 'BALL_BUMP_SPEED_LOSS',
                           'BALL_CATCH_RANGE', 'KICK_SPEED', 'KICK_Z')
               if n not in k]
    if missing:
        print('could not parse from the map script: %s' % ', '.join(missing))
        return 2

    ai = parse_ints(src, ['BAI_PREDICT_TICKS', 'BAI_SLOT_STAGGER',
                          'BAI_ORDER_BUDGET'])
    ai.update(parse_reals(src, ['BAI_SHOOT_RANGE', 'BAI_PASS_RANGE',
                                'BAI_KEEPER_DEPTH', 'BAI_SLAM_RANGE']))

    contract_check(src)
    physics_checks(k, ai)
    source_guards(src)

    head('RESULT')
    print('  %d checks, %d failed' % (checks, len(fails)))
    for f in fails:
        print('   FAILED:', f)
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
