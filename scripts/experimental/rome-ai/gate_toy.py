#!/usr/bin/env python3
"""The gate toy -- a CLOSED-LOOP world for the crossing module (DESIGN 33).

trace.py asserts decisions at one tick. Every gate defect in fourteen rounds
was a property of the loop -- state -> decision -> orders -> world -> state --
over tens of seconds, and the advisor's verdict was blunt: build a world that
moves, drive the shipped code through it for simulated minutes, and assert
OUTCOMES; then negative-control the world by reverting the shipped fixes and
require each historical defect to come back as a failed outcome.

This is that world, on the same interpreter trace.py already has, so the
code under test is read from for-ai.j and cannot drift from it. The world:

  * units are points with an owner, hit points, a speed and ONE order (move /
    attack-move / attack-unit), executed kinematically each 1 s tick;
  * walls are segments the map builds from B001 pathing blockers, invisible
    to IsTerrainPathable exactly as in the game (DESIGN 22.1); a wall is
    crossed only through a gate whose live unit is the OPEN or DESTROYED
    variant. A unit whose straight path meets a wall reroutes through the
    wall's nearest open doorway if it has one and otherwise stops at the
    wall with its order complete -- which is what the engine does, and what
    "stacked behind their own gate" looks like;
  * gates are units with the real rawcodes, toggled by ReplaceUnitBJ (new
    handle, old removed, type id 0) exactly as Trig_Open_*/Trig_Close_* do,
    and on death replaced by the destroyed variant OWNED BY THE KILLER
    exactly as the map's death triggers do -- so the registry is exercised
    against the two replacement paths that made it stale in the game;
  * water is a rectangle with a bridge gap; IsTerrainPathable sees it;
  * combat is attrition at a fixed rate; a gate has 2000 HP and divine
    armour, and the map's own war3mapMisc.txt sets normal damage to 0.35 and
    siege to 1.50 against it: an infantryman ORDERED to attack does ~3.7/s
    (25 base x 0.35, armour 5 -- the "8 damage" of one hit in the round-5
    screenshot), a ram ~25/s. An attack-moving unit whose destination is
    unreachable drops its order and idles, and idle units do not acquire
    buildings -- which is why that screenshot read 1992/2000 in front of
    twenty-five men;
  * the AI thinks every 4 s (scan + AI_Spend for rams + AI_GateTick) and
    marches every 8 s (AI_March), the mission layer's cadence; the seed is
    fixed and the PRNG is the module's own.

Fidelity limits, stated so nobody over-reads a PASS: no collision, no
pathfinding beyond one reroute per wall, no fog, no ranged combat, no
garrison on the walls, and attack-move never acquires a building.
What it CAN see is exactly the class that shipped: doors that do not open,
doors that open for the enemy, armies that stand at walls they cannot
break, holes ignored beside intact gates, columns that never form, stale
registries, camps nobody was ordered out of.

Run: python3 gate_toy.py   (exit 0 = every outcome held AND every reverted
fix reproduced its defect). ~30 s.
"""
import sys, os, math, collections, re

W = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, W)
import trace as T                       # FUNCS, CONSTS, Interp -- the shipped source, parsed

FUNCS, CONSTS = T.FUNCS, T.CONSTS

CLOSED_T = {'h01N': 0, 'h01Q': 1, 'h01T': 2, 'h01W': 3}
OPEN_T = {'h01P': 0, 'h01S': 1, 'h01V': 2, 'h01X': 3}
DEAD_T = {'h01O': 0, 'h01R': 1, 'h01U': 2, 'h01Y': 3}
GATE_HALF = 160.0          # a doorway is this wide either side of the gate unit
SPEED = 250.0              # world units per second, an infantry walk
ARRIVE = 70.0
ACQ = 500.0                # attack-move acquisition range for units
ADJ = 260.0                # an attack-moving unit attacks an ADJACENT enemy gate
RANGE = 150.0
TRAIN_T = 30               # seconds to train a ram
UNIT_HP, UNIT_DPS = 100.0, 10.0
GATE_HP, INF_VS_GATE, RAM_VS_GATE = 2000.0, 3.7, 25.0
THINK, REFRESH = 4, int(CONSTS['AI_MS_REFRESH'])


# ------------------------------------------------------------------ interpreter

class FastInterp(T.Interp):
    """trace.Interp with a compiled-expression cache and a ChainMap scope.
    Same evaluation order as the original (natives > locals > env > consts >
    functions); ~10x faster, which a 400-tick closed loop needs."""
    _code = {}

    def __init__(self, funcs, consts, env, natives):
        super().__init__(funcs, consts, env, natives)
        self._fn = {name: self._make(name) for name in funcs}

    def eval(self, expr, local):
        code = FastInterp._code.get(expr)
        if code is None:
            code = compile(T.jass_expr_to_py(expr).strip(), '<jass>', 'eval')
            FastInterp._code[expr] = code
        scope = collections.ChainMap(self.natives, local, self.env, self.consts, self._fn)
        try:
            return eval(code, {'__builtins__': {}}, scope)
        except Exception as ex:
            raise RuntimeError('eval failed: %r (%s)' % (expr, ex))


# ------------------------------------------------------------------ the world

class Unit:
    __slots__ = ('h', 'tid', 'owner', 'x', 'y', 'hp', 'maxhp', 'structure', 'order',
                 'cur', 'removed', 'jam', 'stand', 'ram', 'killer')

    def __init__(self, h, tid, owner, x, y, hp, structure=False, ram=False):
        self.h, self.tid, self.owner, self.x, self.y = h, tid, owner, x, y
        self.hp = self.maxhp = hp
        self.structure, self.ram = structure, ram
        self.order, self.cur, self.removed = None, 0, False
        self.jam = 0        # consecutive seconds stopped against a wall
        self.stand = 0      # seconds standing at a closed enemy gate with no order to attack it
        self.killer = -1

    @property
    def alive(self):
        return not self.removed and self.hp > 0.405


class Wall:
    """A blocker segment with the gate units that pierce it."""
    def __init__(self, x1, y1, x2, y2):
        self.a, self.b = (x1, y1), (x2, y2)
        self.gates = []          # unit handles (the CURRENT unit at each doorway)
        self.holes = []          # (x, y, half-width): permanent gaps, e.g. a palisade ring's


def seg_cross(p, q, a, b):
    """Intersection point of segments pq and ab, or None."""
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = p, q, a, b
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
    if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return None


class World:
    def __init__(self, allies=()):
        self.units, self.next_h = {}, 1000
        self.walls, self.water = [], []          # water: (x0, x1, y0, y1, gap_half) with the bridge at y=0
        self.allies = set(allies) | set((b, a) for a, b in allies)
        self.t = 0
        self.gate_log = []       # (t, handle, from_tid, to_tid, owner, doorway enemy CV)
        self.tel = []            # (t, ev, body)
        self.orders = []         # (t, handle, kind, x, y)
        self.train = []          # (ready_t, owner, tid)
        self.res = collections.defaultdict(lambda: dict(gold=500.0, lumber=300.0))
        self.groups_live = 0
        self.groups_peak = 0
        self.replaced = 0

    # ---- construction --------------------------------------------------
    def add(self, tid, owner, x, y, hp=UNIT_HP, structure=False, ram=False):
        u = Unit(self.next_h, tid, owner, x, y, hp, structure, ram)
        self.units[u.h] = u
        self.next_h += 1
        return u

    def add_gate(self, wall, tid, owner, x, y, hp=GATE_HP):
        g = self.add(tid, owner, x, y, hp, structure=True)
        wall.gates.append(g.h)
        return g

    def army(self, owner, cx, cy, n=24, r=600.0, tid='h00B'):
        out = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r * (0.4 + 0.6 * ((i * 7) % n) / n)
            out.append(self.add(tid, owner, cx + rr * math.cos(a), cy + rr * math.sin(a)))
        return out

    # ---- gate identity --------------------------------------------------
    def gate_state(self, h):
        u = self.units.get(h)
        if u is None or not u.alive:
            return 'gone'
        if u.tid in CLOSED_T:
            return 'closed'
        if u.tid in OPEN_T:
            return 'open'
        return 'gone'

    def doorways(self, w):
        """Passable points through wall w: open/destroyed gates and permanent gaps."""
        out = [(self.units[gh].x, self.units[gh].y, GATE_HALF) for gh in w.gates
               if self.gate_state(gh) != 'closed']
        return out + list(w.holes)

    def wall_of(self, h):
        for w in self.walls:
            if h in w.gates:
                return w
        return None

    def replace(self, h, tid, owner=None, hp_frac=None):
        """ReplaceUnitBJ semantics: a NEW unit at the same spot, the old one
        removed (type id 0). The map's toggle triggers and death triggers both
        do this, which is why a cached handle goes stale."""
        old = self.units[h]
        frac = old.hp / old.maxhp if hp_frac is None else hp_frac
        new = self.add(tid, old.owner if owner is None else owner, old.x, old.y,
                       GATE_HP if tid in CLOSED_T or tid in OPEN_T or tid in DEAD_T else old.maxhp,
                       structure=old.structure)
        new.hp = new.maxhp * max(frac, 0.01)
        old.removed = True
        w = self.wall_of(h)
        if w is not None:
            w.gates[w.gates.index(h)] = new.h
        self.replaced += 1
        return new

    def doorway_enemy_cv(self, h, pid):
        g = self.units[h]
        return sum(self.cv(u) for u in self.units.values()
                   if u.alive and not u.structure and self.is_enemy(u, pid)
                   and math.hypot(u.x - g.x, u.y - g.y) <= CONSTS['AI_GATE_GUARD'])

    def toggle_by_map(self, h, to_open):
        """The map's own Trig_Open_*/Trig_Close_* (a human clicked the ability)."""
        u = self.units[h]
        orient = CLOSED_T.get(u.tid, OPEN_T.get(u.tid, 0))
        tid = [k for k, v in (OPEN_T if to_open else CLOSED_T).items() if v == orient][0]
        self.gate_log.append((self.t, h, u.tid, tid, u.owner, -1.0))
        return self.replace(h, tid)

    # ---- queries ------------------------------------------------------------
    def is_ally(self, a, b):
        return a == b or (a, b) in self.allies

    def is_enemy(self, u, pid):
        return not self.is_ally(u.owner, pid)

    def cv(self, u):
        if not u.alive or u.structure:
            return 0.0
        return 50.0 * u.hp / u.maxhp

    def own_units(self, pid):
        return [u for u in self.units.values() if u.alive and u.owner == pid and not u.structure]

    def centroid(self, pid):
        us = self.own_units(pid)
        if not us:
            return (0.0, 0.0)
        return (sum(u.x for u in us) / len(us), sum(u.y for u in us) / len(us))

    def in_water(self, x, y):
        for (x0, x1, y0, y1, gap) in self.water:
            if x0 <= x <= x1 and y0 <= y <= y1 and abs(y) > gap:
                return True
        return False

    # ---- kinematics ---------------------------------------------------------
    def unreachable(self, tx, ty):
        """A destination inside a shut doorway or on a blocker: the engine
        walks as close as it can on the unit's own side and drops the order."""
        for w in self.walls:
            for gh in w.gates:
                g = self.units[gh]
                if self.gate_state(gh) == 'closed' and math.hypot(g.x - tx, g.y - ty) <= GATE_HALF:
                    return True
        return False

    def blocked_step(self, u, tx, ty):
        """Where a straight step from u toward (tx, ty) is stopped by a wall or
        water. Returns (kind, wall, point) or None."""
        p, q = (u.x, u.y), (tx, ty)
        best = None
        dead_end = self.unreachable(tx, ty)
        for w in self.walls:
            c = seg_cross(p, q, w.a, w.b)
            if c is None:
                continue
            passable = any(math.hypot(hx - c[0], hy - c[1]) <= half
                           for hx, hy, half in self.doorways(w))
            if passable and not dead_end:
                continue
            if dead_end:
                # walk up to it on this side: no doorway helps
                d = math.hypot(c[0] - p[0], c[1] - p[1])
                return ('deadend', w, c)
            d = math.hypot(c[0] - p[0], c[1] - p[1])
            if best is None or d < best[0]:
                best = (d, 'wall', w, c)
        if self.in_water(tx, ty):
            if best is None:
                return ('water', None, (tx, ty))
        return best[1:] if best else None

    def move_toward(self, u, tx, ty, budget):
        """Move up to `budget` toward (tx, ty), rerouting once through the
        nearest open doorway of a wall in the way. Returns True on arrival."""
        d = math.hypot(tx - u.x, ty - u.y)
        if d <= ARRIVE:
            return True
        b = self.blocked_step(u, tx, ty)
        if b is not None and b[0] == 'water':
            u.jam += 1                       # ordered INTO water: stands at the shore
            return True
        if b is not None:
            w, c = b[1], b[2]
            doors = self.doorways(w) if b[0] != 'deadend' else []
            if doors:
                gx, gy, _ = min(doors, key=lambda dw: math.hypot(dw[0] - u.x, dw[1] - u.y))
                # aim just beyond the doorway on the far side of the wall
                nx, ny = -(w.b[1] - w.a[1]), (w.b[0] - w.a[0])
                nn = math.hypot(nx, ny) or 1.0
                nx, ny = nx / nn, ny / nn
                side = (tx - gx) * nx + (ty - gy) * ny
                s = 1.0 if side >= 0 else -1.0
                wx, wy = gx + nx * s * 200.0, gy + ny * s * 200.0
                if math.hypot(wx - u.x, wy - u.y) > 40.0:
                    tx, ty = wx, wy
                    d = math.hypot(tx - u.x, ty - u.y)
            else:
                # walk up to the wall and stop just short of it, order
                # complete: the engine's "as close as I can get"
                dd = math.hypot(c[0] - u.x, c[1] - u.y)
                if dd > 60.0 + budget:
                    u.x += (c[0] - u.x) / dd * budget
                    u.y += (c[1] - u.y) / dd * budget
                    return False
                if dd > 60.0:
                    u.x += (c[0] - u.x) / dd * (dd - 50.0)
                    u.y += (c[1] - u.y) / dd * (dd - 50.0)
                u.jam += 1
                return True
        step = min(budget, d)
        # do not step INTO water on the way (the bridge reroute)
        nx, ny = u.x + (tx - u.x) / d * step, u.y + (ty - u.y) / d * step
        if self.in_water(nx, ny):
            for (x0, x1, y0, y1, gap) in self.water:
                bx = x0 - 60.0 if u.x < x0 else x1 + 60.0
                if abs(u.y) > 30.0:
                    dd = math.hypot(bx - u.x, 0.0 - u.y)
                    u.x += (bx - u.x) / dd * min(step, dd)
                    u.y += (0.0 - u.y) / dd * min(step, dd)
                    return False
            return False
        u.x, u.y = nx, ny
        return math.hypot(tx - u.x, ty - u.y) <= ARRIVE

    def nearest_enemy(self, u, r, structures=False):
        best, bd = None, r
        for v in self.units.values():
            if not v.alive or v is u or not self.is_enemy(v, u.owner):
                continue
            if v.structure != structures:
                continue
            d = math.hypot(v.x - u.x, v.y - u.y)
            if d < bd:
                best, bd = v, d
        return best

    def hit(self, u, v, dps):
        v.hp -= dps
        if v.hp <= 0.405:
            v.hp = 0.0
            v.killer = u.owner

    def step(self):
        self.t += 1
        # training completes
        for job in list(self.train):
            if job[0] <= self.t:
                self.train.remove(job)
                home = self.homes[job[1]]
                self.add(job[2], job[1], home[0] + 200.0, home[1], hp=300.0, ram=(job[2] == 'h025'))
        for u in list(self.units.values()):
            if not u.alive or u.structure:
                continue
            o = u.order
            jam_before = u.jam
            if o is None:
                u.cur = 0
                continue
            kind = o['kind']
            if kind == 'attackunit':
                tgt = self.units.get(o['target'])
                if tgt is None or not tgt.alive:
                    u.order, u.cur = None, 0
                    continue
                dd = math.hypot(tgt.x - u.x, tgt.y - u.y)
                if dd <= RANGE + (60.0 if tgt.structure else 0.0):
                    if tgt.structure:
                        self.hit(u, tgt, RAM_VS_GATE if u.ram else INF_VS_GATE)
                    else:
                        self.hit(u, tgt, UNIT_DPS)
                else:
                    # close to weapon range on OUR side of the target
                    ax = tgt.x - (tgt.x - u.x) / dd * (RANGE - 20.0)
                    ay = tgt.y - (tgt.y - u.y) / dd * (RANGE - 20.0)
                    self.move_toward(u, ax, ay, SPEED)
                continue
            if kind == 'attack':
                e = self.nearest_enemy(u, ACQ)
                if e is not None:
                    if math.hypot(e.x - u.x, e.y - u.y) <= RANGE:
                        self.hit(u, e, UNIT_DPS)
                    else:
                        self.move_toward(u, e.x, e.y, SPEED)
                    continue
            if self.move_toward(u, o['x'], o['y'], SPEED):
                u.order, u.cur = None, 0
            if u.jam == jam_before:
                u.jam = 0
        # the round-5 signature: standing at a shut enemy gate, not attacking it
        for u in self.units.values():
            if not u.alive or u.structure:
                continue
            for w in self.walls:
                for gh in w.gates:
                    g = self.units[gh]
                    if (self.gate_state(gh) == 'closed' and self.is_enemy(g, u.owner)
                            and math.hypot(g.x - u.x, g.y - u.y) <= 600.0
                            and not (u.order and u.order['kind'] == 'attackunit' and u.order['target'] == gh)):
                        u.stand += 1
        # defenders standing still fight what reaches them
        for u in list(self.units.values()):
            if u.alive and not u.structure and u.order is None:
                e = self.nearest_enemy(u, RANGE)
                if e is not None:
                    self.hit(u, e, UNIT_DPS)
        # gate deaths: the map creates the DESTROYED variant for the killer
        for u in list(self.units.values()):
            if u.structure and not u.removed and u.hp <= 0.405 and u.tid in CLOSED_T | OPEN_T:
                orient = CLOSED_T.get(u.tid, OPEN_T.get(u.tid))
                dead = [k for k, v in DEAD_T.items() if v == orient][0]
                self.gate_log.append((self.t, u.h, u.tid, dead, u.killer, -1.0))
                self.replace(u.h, dead, owner=u.killer if u.killer >= 0 else u.owner, hp_frac=1.0)

    # ---- natives -----------------------------------------------------------
    def natives(self, env):
        w = self
        cur = {'enum': None}
        base = T.make_natives(env, 0.0)
        for k in ('AI_GateState', 'AI_GateLifeFrac', 'AI_GateRefresh', 'GetOwningPlayer',
                  'IsPlayerAlly', 'IsTerrainPathable', 'AI_Find'):
            base.pop(k, None)

        def group_enum(g, filt, pred):
            del g[:]
            for u in w.units.values():
                if u.removed:
                    continue
                if not pred(u):
                    continue
                if filt == 'ai_bxOwnUnit' and not (u.owner == env['ai_curP'] and u.alive):
                    continue
                if filt == 'ai_bxTrainer' and not (u.owner == env['ai_curP'] and u.tid == 'h000'):
                    continue
                g.append(u.h)

        def for_group(g, fn):
            for h in list(g):
                cur['enum'] = h
                fn()

        def create_group():
            w.groups_live += 1
            w.groups_peak = max(w.groups_peak, w.groups_live)
            return []

        def destroy_group(g):
            w.groups_live -= 1

        def replace_unit(h, tid, method):
            g = w.units[h]
            w.gate_log.append((w.t, h, g.tid, tid, g.owner,
                               w.doorway_enemy_cv(h, g.owner)))
            cur['replaced'] = w.replace(h, tid).h

        def issue_point(h, s, x, y):
            u = w.units[h]
            u.order = dict(kind='move' if s == 'move' else 'attack', x=x, y=y)
            u.cur = 851986 if s == 'move' else 851983
            w.orders.append((w.t, h, s, x, y))
            return True

        def issue_target(h, s, tgt):
            u = w.units[h]
            u.order = dict(kind='attackunit', target=tgt, x=w.units[tgt].x, y=w.units[tgt].y)
            u.cur = 851983
            w.orders.append((w.t, h, 'attackunit', w.units[tgt].x, w.units[tgt].y))
            return True

        def issue_train(b, tid):
            u = w.units[b]
            r = w.res[u.owner]
            if tid != 'h025':
                return False        # the toy is about gates: the trainer is busy for anything but a ram
            cost = FUNCS and it_run_cost(tid)
            need_l = CONSTS['AI_RAM_LUMBER'] if tid == 'h025' else 0.0
            if r['gold'] < cost or r['lumber'] < need_l:
                return False
            r['gold'] -= cost
            r['lumber'] -= need_l
            w.train.append((w.t + TRAIN_T, u.owner, tid))
            return True

        def it_run_cost(tid):
            return w.it.run('AI_BaseCost', [tid])

        base.update({
            'GetEnumUnit': lambda: cur['enum'],
            'GetFilterUnit': lambda: cur['enum'],
            'GetUnitTypeId': lambda h: 0 if h is None or w.units[h].removed else w.units[h].tid,
            'GetUnitX': lambda h: w.units[h].x,
            'GetUnitY': lambda h: w.units[h].y,
            'GetUnitState': lambda h, s: (0.0 if h is None or w.units[h].removed else
                                          (w.units[h].hp if s == 1 else w.units[h].maxhp)),
            'GetOwningPlayer': lambda h: -1 if h is None else w.units[h].owner,
            'GetHandleId': lambda h: h,
            'GetUnitLevel': lambda h: 1,
            'GetUnitCurrentOrder': lambda h: w.units[h].cur,
            'IsPlayerAlly': lambda a, b: w.is_ally(a, b),
            'IsUnitEnemy': lambda h, p: w.is_enemy(w.units[h], p),
            'IsUnitVisible': lambda h, p: True,
            'IsUnitType': lambda h, t: (w.units[h].structure if t == 4 else False),
            'IsUnitLoaded': lambda h: False,
            'IsTerrainPathable': lambda x, y, t: w.in_water(x, y),
            'CreateGroup': create_group,
            'DestroyGroup': destroy_group,
            'GroupEnumUnitsInRange': lambda g, x, y, r, f: group_enum(
                g, f, lambda u: math.hypot(u.x - x, u.y - y) <= r),
            'GroupEnumUnitsOfPlayer': lambda g, p, f: group_enum(g, f, lambda u: u.owner == p),
            'ForGroup': for_group,
            'Filter': lambda f: f,
            'ReplaceUnitBJ': replace_unit,
            'GetLastReplacedUnitBJ': lambda: cur.get('replaced'),
            'SetUnitAnimation': lambda h, a: None,
            'bj_UNIT_STATE_METHOD_RELATIVE': 1,
            'IssuePointOrder': issue_point,
            'IssueTargetOrder': issue_target,
            'IssueImmediateOrderById': issue_train,
            'AI_Tel': lambda ev, body: w.tel.append((w.t, ev, body)),
            'AI_Num': lambda n: str(n),
            'AI_TelAI': lambda pid: '1',
            'AI_SayK': lambda *a: None,
            'AI_LineA': lambda *a: '',
            'AI_LineB': lambda *a: '',
            'AI_CorrTakeRoute': lambda *a: None,
            'AI_PickRole': lambda pid: 0,
            'AI_RandReal': None,      # placeholder: the real one runs (deleted below)
        })
        del base['AI_RandReal']
        return base


# ------------------------------------------------------------------ the faction loop

class Sim:
    """One AI faction driven through the world at the game's cadence."""

    def __init__(self, world, pid, home, role='rome', funcs=None, consts=None, natives_patch=None,
                 allies=(), lumber=300.0, gold=500.0):
        self.w, self.pid, self.home = world, pid, home
        world.homes = getattr(world, 'homes', {})
        world.homes[pid] = home
        world.res[pid]['lumber'] = lumber
        world.res[pid]['gold'] = gold
        sc = dict(role=role, army=0.0)
        env = T.make_env(sc)
        # the per-player arrays are dicts keyed on pid 0 in trace.py; make
        # every one of them tolerate any pid with pid 0's value as default
        for k, v in list(env.items()):
            if isinstance(v, dict) and 0 in v and not isinstance(v, collections.defaultdict):
                dd = collections.defaultdict(lambda d=v[0]: d)
                dd.update(v)
                env[k] = dd
        env['ai_now'] = 0.0
        env['ai_homeX'][pid] = home[0]
        env['ai_homeY'][pid] = home[1]
        env['ai_role'][pid] = CONSTS['AI_ROLE_ROME'] if role == 'rome' else CONSTS['AI_ROLE_BARB']
        env['ai_seed'] = CONSTS['AI_SEED_DEFAULT']
        env['ai_ramAt'][pid] = -9999.0
        env['ai_crossLast'][pid] = -1
        env['ai_breakGate'][pid] = -1
        env['ai_sortieGate'][pid] = -1
        env['wm_foodCap'][pid] = 100.0
        env['wm_food'][pid] = 0.0
        env['ai_gateCount'] = 0
        self.env = env
        nat = world.natives(env)
        if natives_patch:
            nat.update(natives_patch)
        self.it = FastInterp(funcs or FUNCS, consts or CONSTS, env, nat)
        world.it = self.it
        self.statuses = []       # (t, status)
        self.marches = 0

    def register_gates(self):
        """AI_BuildRegistry's gate half, through the real enum callback."""
        env = self.env
        env['ai_gateCount'] = 0
        for k in ('ai_gate', 'ai_gateX', 'ai_gateY', 'ai_gateOr', 'ai_gateCd', 'ai_gateStuck'):
            env[k] = {}
        g = self.it.natives['CreateGroup']()
        self.it.natives['GroupEnumUnitsInRange'](g, 0.0, 0.0, 1e9, None)
        gates = [h for h in g if self.w.units[h].tid in CLOSED_T or self.w.units[h].tid in OPEN_T
                 or self.w.units[h].tid in DEAD_T]
        del g[:]
        g.extend(gates)
        self.it.natives['ForGroup'](g, self.it._fn['AI_GateEnum'])
        self.it.natives['DestroyGroup'](g)

    def scan(self):
        """AI_ScanWorld's gate-relevant half, from the world."""
        w, pid, env = self.w, self.pid, self.env
        us = w.own_units(pid)
        env['wm_army'][pid] = sum(w.cv(u) for u in us)
        cx, cy = w.centroid(pid) if us else self.home
        env['wm_fieldX'][pid], env['wm_fieldY'][pid] = cx, cy
        env['wm_hasSiege'][pid] = any(u.ram for u in us)
        env['wm_lumber'][pid] = w.res[pid]['lumber']
        env['wm_gold'][pid] = w.res[pid]['gold']
        hx, hy = self.home
        env['wm_threat'][pid] = sum(w.cv(u) for u in w.units.values()
                                    if u.alive and not u.structure and w.is_enemy(u, pid)
                                    and math.hypot(u.x - hx, u.y - hy) <= CONSTS['AI_HOME_R'])

    def tick(self, objective=None, muster=None):
        w, pid, env, it = self.w, self.pid, self.env, self.it
        env['ai_now'] = float(w.t)
        env['ai_tickSeq'] = w.t
        env['ai_ordersTick'] = 0
        it.calls = 0
        if w.t % THINK == 0:
            self.scan()
            it.run('AI_Spend', [pid])
            it.run('AI_GateTick', [pid])
        if w.t % REFRESH == 0:
            self.scan()
            if muster is not None:
                it.run('AI_SendArmy', [pid, muster[0], muster[1], CONSTS['AI_ORD_MOVE'], None])
                self.marches += 1
            elif objective is not None:
                st = it.run('AI_March', [pid, objective[0], objective[1]])
                self.statuses.append((w.t, st))
                self.marches += 1


# ------------------------------------------------------------------ scenario helpers

def wall_x(world, x, y0=-3000.0, y1=3000.0):
    wl = Wall(x, y0, x, y1)
    world.walls.append(wl)
    return wl


def run(world, sims, seconds, objective=None, muster=None, hooks=()):
    for _ in range(seconds):
        world.step()
        for s in sims:
            s.tick(objective=objective, muster=muster)
        for h in hooks:
            h(world.t)


def frac_past(world, pid, x):
    """Share of the faction's INFANTRY beyond x (rams stay where they broke in)."""
    us = [u for u in world.own_units(pid) if not u.ram]
    return sum(1 for u in us if u.x > x) / float(len(us) or 1)


def max_jam(world, pid):
    return max([u.jam for u in world.own_units(pid)] + [0])


def opens(world):
    return [e for e in world.gate_log if e[2] in CLOSED_T and e[3] in OPEN_T]


def closes(world):
    return [e for e in world.gate_log if e[2] in OPEN_T and e[3] in CLOSED_T]


def status_names(sim):
    names = {CONSTS['AI_CROSS_NONE']: 'NONE', CONSTS['AI_CROSS_THROUGH']: 'THROUGH',
             CONSTS['AI_CROSS_BREAK']: 'BREAK',
             CONSTS['AI_CROSS_IMPOSSIBLE']: 'IMPOSSIBLE', CONSTS['AI_CROSS_SHUT']: 'SHUT'}
    out = []
    for t, s in sim.statuses:
        n = names.get(s, str(s))
        if not out or out[-1][1] != n:
            out.append((t, n))
    return out


class Report:
    def __init__(self):
        self.fails = 0
        self.lines = []

    def check(self, ok, msg, detail=''):
        self.fails += 0 if ok else 1
        print('  %s %s%s' % ('PASS' if ok else 'FAIL', msg, (' [%s]' % detail) if detail else ''))
        return ok

    def control(self, defect_reproduced, msg, detail=''):
        """A negative control: the reverted fix MUST bring the defect back."""
        self.fails += 0 if defect_reproduced else 1
        print('  %s NEGATIVE CONTROL: %s%s' % ('PASS' if defect_reproduced else 'FAIL', msg,
                                               (' [%s]' % detail) if detail else ''))
        return defect_reproduced


def section(title):
    print('\n' + '=' * 78)
    print(title)
    print('=' * 78)


# ---- reversions of shipped fixes ------------------------------------------

def funcs_without_refresh():
    """The pre-audit registry: every reader trusts the cached handle."""
    f = dict(FUNCS)
    for name in ('AI_GateState', 'AI_GateLifeFrac', 'AI_GateIsOurs', 'AI_GateOwnedBy', 'AI_SetGate'):
        params, body = FUNCS[name]
        stripped = [ln for ln in body if 'AI_GateRefresh' not in ln]
        assert len(stripped) < len(body), name
        f[name] = (params, stripped)
    return f


def funcs_unconditional_open():
    """Round 3's rule: an own gate on our crossing opens UNCONDITIONALLY."""
    f = dict(FUNCS)
    params, _ = FUNCS['AI_GateSafeToOpen']
    f['AI_GateSafeToOpen'] = (params, ['    return true'])
    return f


def funcs_old_close_rule():
    """Pre-playtest-10 close bar: only when NO friendly unit is present."""
    f = dict(FUNCS)
    params, body = FUNCS['AI_GateTick']
    new = []
    hit = 0
    for ln in body:
        if 'ai_accCV >= AI_GATE_T_CLOSE or' in ln:
            ln = ln.replace(
                'if ai_accCV >= AI_GATE_T_CLOSE or (ai_accCV > 0.0 and ai_accN == 0) or (ai_accCV > 0.0 and ai_accW < ai_accCV) then',
                'if ai_accCV > 0.0 and ai_accN == 0 then')
            hit += 1
        new.append(ln)
    assert hit == 1
    f['AI_GateTick'] = (params, new)
    return f


def funcs_old_arrival_guard():
    """Pre-playtest-8 AI_SendEnum: AI_HOME_R as a general MOVE arrival tolerance."""
    f = dict(FUNCS)
    params, body = FUNCS['AI_SendEnum']
    old, skipping, depth = [], False, 0
    for ln in body:
        s = ln.strip()
        if s.startswith('if ai_ordKind == AI_ORD_MOVE then'):
            skipping, depth = True, 0
            old.append('    if ai_ordKind == AI_ORD_MOVE and AI_Dist(GetUnitX(u), GetUnitY(u), ai_orderX, ai_orderY) < AI_HOME_R then')
            old.append('        set u = null')
            old.append('        return')
            old.append('    endif')
            continue
        if skipping:
            if s.startswith('if '):
                depth += 1
            elif s == 'endif':
                if depth == 0:
                    skipping = False
                    continue
                depth -= 1
            continue
        old.append(ln)
    assert len(old) < len(body)
    f['AI_SendEnum'] = (params, old)
    return f


def consts_with(**kw):
    c = dict(CONSTS)
    c.update(kw)
    return c


# ------------------------------------------------------------------ scenarios

def scenario_egress(rep, gate_y=0.0, label='', funcs=None, consts=None, natives_patch=None,
                    expect_ok=True, seconds=150):
    """A Roman army inside its own wall; the objective beyond it."""
    w = World()
    wl = wall_x(w, 1500.0)
    g = w.add_gate(wl, 'h01W', 0, 1500.0, gate_y)
    w.army(0, 0.0, 0.0)
    s = Sim(w, 0, (0.0, 0.0), funcs=funcs, consts=consts, natives_patch=natives_patch)
    s.register_gates()
    run(w, [s], seconds, objective=(9000.0, 0.0))
    past = frac_past(w, 0, 1600.0)
    return w, s, past


def check_egress(rep, w, s, past, label):
    ok1 = rep.check(past >= 0.9, '%s: the army is beyond its own wall by T=%d' % (label, w.t),
                    '%.0f%% past' % (100 * past))
    op = opens(w)
    ok2 = rep.check(len(op) >= 1, '%s: the gate was opened ON DEMAND by the march' % label,
                    'first open at t=%s' % (op[0][0] if op else '-'))
    ok3 = rep.check(all(e[5] <= CONSTS['AI_GATE_T_OPEN'] for e in op),
                    '%s: it never opened with enemy CV in the doorway' % label)
    cl = closes(w)
    ok4 = rep.check(len(cl) >= 1 and w.gate_state(wl_gate(w)) == 'closed',
                    '%s: it is closed again behind the sortie' % label,
                    'closed at t=%s' % (cl[0][0] if cl else '-'))
    if op and cl:
        rep.check(cl[0][0] - op[0][0] <= CONSTS['AI_SORTIE_T'] + CONSTS['AI_GATE_CD'],
                  '%s: ... within the sortie lease' % label, '%ds' % (cl[0][0] - op[0][0]))
    st = status_names(s)
    ok5 = rep.check(st and st[0][1] in ('THROUGH', 'SHUT') and all(n != 'NONE' for t, n in st if t <= op[0][0]) if op else False,
                    '%s: X1 -- every march from inside the wall selected a crossing, never a bare move' % label,
                    ' -> '.join(n for _, n in st))
    return ok1 and ok2 and ok3 and ok4 and ok5


def wl_gate(w):
    return w.walls[0].gates[0]


def toy_egress(rep):
    section('EGRESS -- an army inside its own wall must come out through its own gate')
    w, s, past = scenario_egress(rep)
    check_egress(rep, w, s, past, 'gate on the exit line')
    rep.check(max_jam(w, 0) <= 30, 'no unit stood jammed against the wall for more than 30 s',
              'max %ds' % max_jam(w, 0))

    # the measured Roman geometry: the nearest own gate 2000 off the exit line
    w, s, past = scenario_egress(rep, gate_y=2000.0)
    check_egress(rep, w, s, past, 'gate 2000 off the exit line (P3 geometry, worse)')

    # ---- ROUND 3 DEFECT, reproduced: round 2's objective-anchored candidate rule
    def r2_corridor(env):
        def corr(pid, i):
            gx, gy = env['ai_gateX'][i], env['ai_gateY'][i]
            return CONSTS['AI_GATE_CORRIDOR'] if math.hypot(gx - 9000.0, gy) <= 4200.0 else -1.0
        return corr
    w2 = World()
    wl = wall_x(w2, 1500.0)
    w2.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
    w2.army(0, 0.0, 0.0)
    s2 = Sim(w2, 0, (0.0, 0.0))
    s2.it.natives['AI_GateCorridor'] = r2_corridor(s2.env)
    s2.register_gates()
    run(w2, [s2], 150, objective=(9000.0, 0.0))
    rep.control(frac_past(w2, 0, 1600.0) < 0.1 and not opens(w2),
                'round 2 (gate candidates only within 4200 of the OBJECTIVE): the army stacks '
                'behind its own shut gate -- playtest 3, reproduced',
                '%.0f%% past, %d opens' % (100 * frac_past(w2, 0, 1600.0), len(opens(w2))))

    # ---- the egress corridor is load-bearing: without it P3's gate is invisible
    w3, s3, past3 = scenario_egress(rep, gate_y=2000.0, consts=consts_with(AI_GATE_EGRESS_R=0.0))
    rep.control(past3 < 0.1 and not opens(w3),
                'with the own-gate egress radius removed (the 1600 corridor alone) the gate 2000 '
                'off the line is never a candidate and the army never leaves -- what the deleted '
                'stall backstop used to paper over',
                '%.0f%% past, %d opens' % (100 * past3, len(opens(w3))))
    return rep


def toy_contested(rep):
    section('OWN GATE, CONTESTED -- never open into a live threat (playtest 10)')
    # enemies standing in the doorway, outside
    w = World()
    wl = wall_x(w, 1500.0)
    w.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
    w.army(0, 0.0, 0.0)
    for i in range(6):
        w.add('h00B', 5, 1950.0 + 40.0 * i, -100.0 + 40.0 * i)
    s = Sim(w, 0, (0.0, 0.0))
    s.register_gates()
    run(w, [s], 120, objective=(9000.0, 0.0))
    rep.check(not opens(w), 'the gate never opened while the enemy stood in the doorway',
              'statuses ' + ' -> '.join(n for _, n in status_names(s)))
    rep.check(frac_past(w, 0, 1500.0) == 0.0, 'the army stayed inside the wall')
    rep.check(any(n == 'SHUT' for _, n in status_names(s)),
              'the march reported the typed outcome SHUT (own gate refused), not a bare move')

    # ---- ROUND 3 DEFECT, reproduced: the unconditional open
    w2 = World()
    wl = wall_x(w2, 1500.0)
    w2.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
    w2.army(0, 0.0, 0.0)
    for i in range(6):
        w2.add('h00B', 5, 1950.0 + 40.0 * i, -100.0 + 40.0 * i)
    s2 = Sim(w2, 0, (0.0, 0.0), funcs=funcs_unconditional_open())
    s2.register_gates()
    run(w2, [s2], 60, objective=(9000.0, 0.0))
    op = opens(w2)
    rep.control(bool(op) and op[0][5] > CONSTS['AI_GATE_T_OPEN'],
                'round 3 ("an own gate on our crossing opens UNCONDITIONALLY"): the gate opens '
                'with %s enemy CV in the doorway -- "Romans open gates for barbarians", reproduced'
                % ('%.0f' % op[0][5] if op else '-'))

    # city under threat elsewhere, doorway clear
    w3 = World()
    wl = wall_x(w3, 1500.0)
    w3.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
    w3.army(0, 0.0, 0.0)
    for i in range(4):
        w3.add('h00B', 5, -300.0 - 40.0 * i, 2200.0)      # inside AI_HOME_R, far from the doorway
    s3 = Sim(w3, 0, (0.0, 0.0))
    s3.register_gates()
    run(w3, [s3], 60, objective=(9000.0, 0.0))
    rep.check(not opens(w3), 'a city under live threat keeps its gate shut even with a clear doorway')
    return rep


def scenario_siege(rep, funcs=None, consts=None, lumber=300.0, seconds=360, hole_y=None,
                   ram_in_hand=False, objective=(7500.0, 0.0), start=(0.0, 0.0), radius=600.0,
                   inner_wall=None):
    """An enemy wall between the army and its objective, the objective just
    behind the gate -- the round-5 (Gray) geometry. inner_wall: an unmodelled
    blocker line (no gate) between the army and the gate."""
    w = World()
    if inner_wall is not None:
        wall_x(w, inner_wall)
    wl = wall_x(w, 6000.0)
    g = w.add_gate(wl, 'h01W', 5, 6000.0, 0.0)
    if hole_y is not None:
        w.add_gate(wl, 'h01Y', 5, 6000.0, hole_y)      # an existing breach
    w.army(0, start[0], start[1], r=radius)
    w.add('h000', 0, -300.0, 0.0, hp=1000.0, structure=True)   # a trainer at home
    if ram_in_hand:
        w.add('h025', 0, -400.0, 300.0, hp=300.0, ram=True)
    s = Sim(w, 0, (0.0, 0.0), funcs=funcs, consts=consts, lumber=lumber)
    s.register_gates()
    run(w, [s], seconds, objective=objective)
    return w, s, g


def gate_hp(w, wl_index=0, gate_index=0):
    return w.units[w.walls[wl_index].gates[gate_index]].hp


def standing(w, pid):
    """Unit-seconds spent standing at a shut enemy gate with no order to attack it."""
    return sum(u.stand for u in w.units.values() if u.owner == pid)


def toy_siege(rep):
    section('ENEMY GATE -- a break is assaulted under a progress budget; rams come from the crossing')
    w, s, g = scenario_siege(rep, seconds=200)
    st = status_names(s)
    rep.check(st and st[0][1] == 'BREAK', 'first contact with the wall: BREAK (attack THIS gate)',
              ' -> '.join(n for _, n in st))
    rep.check(any(u.ram for u in w.units.values() if u.owner == 0),
              'a ram was bought FROM the crossing decision (AI_Spend via AI_WantsRam, no roll for the first)')
    rep.check(standing(w, 0) <= 24 * REFRESH + 24,
              'no unit stood at the shut gate longer than one refresh without an order to attack it',
              '%d unit-seconds standing, %d allowed' % (standing(w, 0), 24 * REFRESH + 24))
    rep.check(w.gate_state(g.h) == 'gone', 'the gate is down by T=%d' % w.t)
    rep.check(frac_past(w, 0, 6100.0) >= 0.9, 'the army is through by T=%d' % w.t,
              '%.0f%% past' % (100 * frac_past(w, 0, 6100.0)))
    rep.check(st[-1][1] == 'NONE', 'the crossing phase ended NONE once the wall fell behind the march',
              ' -> '.join(n for _, n in st))
    # R1 against the map's death trigger: the destroyed variant is a NEW unit for the KILLER
    st_read = s.it.run('AI_GateState', [0])
    rep.check(st_read == CONSTS['AI_GS_GONE'] and s.env['ai_gate'][0] is not None
              and w.units[s.env['ai_gate'][0]].tid in DEAD_T,
              'R1: the registry re-resolved the destroyed variant the map created for the killer '
              'and reads GONE (a hole), not a dangling handle')

    # ---- Gray's own start state: ~25 units on the causeway in front of the gate,
    #      the objective 1500 behind it. The shipped module must recover from it.
    GRAY = dict(start=(5700.0, 0.0), radius=250.0)
    w5, s5, g5 = scenario_siege(rep, seconds=150, **GRAY)
    st5 = status_names(s5)
    rep.check(st5 and st5[0][1] == 'BREAK' and frac_past(w5, 0, 6100.0) >= 0.9 and standing(w5, 0) <= 24 * REFRESH + 24,
              'from Gray\'s photographed state the module orders the assault at once and is through',
              '%s; %.0f%% past, %d unit-s standing'
              % (' -> '.join(n for _, n in st5), 100 * frac_past(w5, 0, 6100.0), standing(w5, 0)))

    # ---- ROUND 5 DEFECT (Gray), reproduced: routing switched off on arrival
    w2, s2, g2 = scenario_siege(rep, consts=consts_with(AI_APPROACH_MIN=2200.0), seconds=150, **GRAY)
    st2 = status_names(s2)
    atk2 = [o for o in w2.orders if o[2] == 'attackunit']
    rep.control(frac_past(w2, 0, 6100.0) < 0.1 and standing(w2, 0) > 60 * 12 and w2.units[g2.h].hp >= GATE_HP - 1.0
                and not atk2 and not any(u.ram for u in w2.units.values() if u.owner == 0),
                'round 4 (AI_APPROACH_MIN 2200): within 2200 of the objective the crossing model is '
                'off, the army attack-moves at a point behind the wall, is never ordered to attack '
                'the gate, remembers no wall and buys no ram -- Gray at the 1992/2000 gate, reproduced',
                '%.0f%% past, %d unit-s standing, %d attack orders, gate %.0f hp, statuses %s'
                % (100 * frac_past(w2, 0, 6100.0), standing(w2, 0), len(atk2), w2.units[g2.h].hp,
                   ' -> '.join(n for _, n in st2) or 'none'))

    # ---- the typed failure is REACHABLE: a gate we cannot get at (an unmodelled
    #      blocker between us and it) makes no progress and fails IMPOSSIBLE
    w4, s4, g4 = scenario_siege(rep, seconds=150, inner_wall=5000.0)
    st4 = status_names(s4)
    imp = [t for t, n in st4 if n == 'IMPOSSIBLE']
    rep.check(bool(imp) and imp[0] <= REFRESH + CONSTS['AI_BREAK_BUDGET'] + 2 * REFRESH,
              'a gate the army cannot reach fails typed IMPOSSIBLE inside one budget window '
              '(the mission layer bars the target on it)',
              'at t=%s; %s' % (imp[0] if imp else '-', ' -> '.join(n for _, n in st4)))
    rep.check(w4.units[g4.h].hp >= GATE_HP - 1.0, '... and the gate was indeed never touched')

    # ---- without the budget the same army stands at the blocker for the whole run
    w6, s6, g6 = scenario_siege(rep, seconds=150, inner_wall=5000.0, consts=consts_with(AI_BREAK_BUDGET=1e9))
    st6 = status_names(s6)
    rep.control(all(n == 'BREAK' for _, n in st6) and max_jam(w6, 0) >= 100,
                'rounds 3-8 (no progress budget on a break): the army stands at an unmodelled '
                'blocker in BREAK for the whole run with nothing to say about it -- the untyped '
                'stall, reproduced',
                'statuses %s, max jam %ds' % (' -> '.join(n for _, n in st6), max_jam(w6, 0)))
    return rep

def toy_breach(rep):
    section('A HOLE BESIDE AN INTACT GATE -- a crossing is priced, never chosen for being a gate')
    w, s, g = scenario_siege(rep, hole_y=2500.0, ram_in_hand=True, seconds=200)
    atk = [o for o in w.orders if o[2] == 'attackunit']
    rep.check(not atk and w.units[g.h].hp >= GATE_HP - 1.0,
              'the intact enemy gate was never attacked (0 attack-unit orders, hp %.0f)' % w.units[g.h].hp)
    rep.check(frac_past(w, 0, 6100.0) >= 0.9, 'the army went THROUGH the breach 2500 off its line',
              '%.0f%% past, statuses %s' % (100 * frac_past(w, 0, 6100.0), ' -> '.join(n for _, n in status_names(s))))

    # ---- ROUND 4 DEFECT (finding 7), reproduced: one corridor width for everything
    w2, s2, g2 = scenario_siege(rep, hole_y=2500.0, ram_in_hand=True, seconds=200,
                                consts=consts_with(AI_GATE_CORRIDOR_FREE=CONSTS['AI_GATE_CORRIDOR']))
    atk2 = [o for o in w2.orders if o[2] == 'attackunit']
    rep.control(bool(atk2) and w2.units[g2.h].hp < GATE_HP - 100.0,
                'round 3 (one 1600 corridor for holes and walls alike): the breach 2500 aside is '
                'invisible and the army besieges the intact gate it never needed -- reproduced',
                '%d attack orders, gate %.0f hp' % (len(atk2), w2.units[g2.h].hp))

    # pricing with no siege at all: the hole wins over an infantry siege
    w3, s3, g3 = scenario_siege(rep, hole_y=4500.0, lumber=0.0, seconds=200)
    rep.check(frac_past(w3, 0, 6100.0) >= 0.9 and not [o for o in w3.orders if o[2] == 'attackunit'],
              'E1: with no siege and a hole 4500 aside, the hole wins and the intact gate is never '
              'assaulted', '%.0f%% past' % (100 * frac_past(w3, 0, 6100.0)))
    return rep


def toy_bridge(rep, seconds=140):
    section('A BRIDGE -- the crossing completes in column (playtest 4, finding 3)')
    def build(objective, consts=None, natives_patch=None):
        w = World()
        w.water.append((3000.0, 3600.0, -3000.0, 3000.0, 150.0))
        w.army(0, 0.0, 0.0)
        s = Sim(w, 0, (0.0, 0.0), consts=consts, natives_patch=natives_patch)
        s.register_gates()
        run(w, [s], seconds, objective=objective)
        return w, s
    w, s = build((9000.0, 0.0))
    shore = [u for u in w.own_units(0) if u.jam > 0 and u.x < 3600.0]
    rep.check(frac_past(w, 0, 3600.0) >= 0.95, 'the whole army is across the bridge by T=%d' % w.t,
              '%.0f%% past' % (100 * frac_past(w, 0, 3600.0)))
    rep.check(not shore, 'no unit was left standing at the shore with a destination in the water',
              '%d at the shore' % len(shore))
    rep.check(all(n == 'NONE' for _, n in status_names(s)), 'X1 (bridge): no gate, so no crossing '
              'was selected -- the measured frontage handles it')
    # the objective just past the bridge: a wide formation's rank/lane
    # destinations would land on the water either side of the deck
    w, s = build((4300.0, 0.0))
    shore = [u for u in w.own_units(0) if u.jam > 0 and u.x < 3600.0]
    on_deck = sum(1 for u in w.own_units(0) if u.x >= 3000.0)
    rep.check(not shore and on_deck >= 5,
              'with the objective just past the bridge the column still forms on the deck: '
              'nobody at the shore (the rear ranks stop short by design -- playtest 9\'s '
              'rank-back formation; noted in DESIGN 33)', '%d at the shore, %d on or past the deck'
              % (len(shore), on_deck))

    # ---- ROUND 4 DEFECT, reproduced: the unmeasured five-lane frontage
    w2, s2 = build((4300.0, 0.0), natives_patch={'AI_LanesAt': lambda x, y: 5})
    shore2 = [u for u in w2.own_units(0) if u.jam > 0 and u.x < 3600.0]
    rep.control(len(shore2) >= 2,
                'round 3 (five lanes, 1040 wide, regardless of the ground): outer-lane destinations '
                'land in the water and the formation piles at the bridge -- reproduced',
                '%d at the shore' % len(shore2))
    return rep

def toy_camp(rep):
    section('A CAMP RING -- gaps, no gate: a bare move IS the right answer (playtest 8)')
    def build(funcs=None):
        w = World()
        # the palisade: a ring of blocker segments with two gaps (49 and 67 degrees)
        R, n = 950.0, 24
        gaps = set(range(0, 4)) | set(range(12, 16))       # ~49 and ~67 degrees at 60 and 180
        holes = [(R * math.cos(math.radians(30.0)), R * math.sin(math.radians(30.0)), 450.0),
                 (R * math.cos(math.radians(210.0)), R * math.sin(math.radians(210.0)), 500.0)]
        for k in range(n):
            if k in gaps:
                continue
            a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
            seg = Wall(R * math.cos(a0), R * math.sin(a0), R * math.cos(a1), R * math.sin(a1))
            seg.holes = holes           # the engine paths through the gaps
            w.walls.append(seg)
        army = w.army(0, 0.0, 0.0, r=600.0)
        start = {u.h: (u.x, u.y) for u in army}
        s = Sim(w, 0, (0.0, 0.0), role='barb', funcs=funcs)
        s.register_gates()
        rally = (CONSTS['AI_MUSTER_OFF'], 0.0)
        run(w, [s], 60, muster=rally)
        w.start = start
        return w, s, rally
    GATHER = CONSTS['AI_MUSTER_GATHER']
    w, s, rally = build()
    moved = sum(1 for u in w.own_units(0) if u.x - w.start[u.h][0] > 200.0)
    near = sum(1 for u in w.own_units(0) if math.hypot(u.x - rally[0], u.y - rally[1]) < GATHER)
    first = [o for o in w.orders if o[0] <= REFRESH]
    rep.check(len(first) >= 20, 'the first muster dispatch ordered the army (%d orders)' % len(first))
    rep.check(moved >= 0.6 * len(w.own_units(0)) and near == len(w.own_units(0)),
              'the army moved out toward the rally and every unit is inside the muster radius by T=60',
              '%d of %d moved, %d gathered' % (moved, len(w.own_units(0)), near))
    rep.check(s.env['ai_apGate'][0] == -1, 'X1 (camp): no crossing selected -- there is nothing to open')

    # ---- PLAYTEST 8 DEFECT, reproduced: the arrival tolerance
    w2, s2, rally = build(funcs=funcs_old_arrival_guard())
    near2 = sum(1 for u in w2.own_units(0) if u.x - w2.start[u.h][0] > 200.0)
    rep.control(len(w2.orders) == 0 and near2 < 3,
                'round 5 (AI_HOME_R as a general MOVE arrival tolerance): every muster order is '
                'cancelled before issue and nobody leaves the camp -- reproduced',
                '%d orders, %d at the rally' % (len(w2.orders), near2))
    return rep


def toy_registry(rep):
    section('THE REGISTRY CANNOT GO STALE -- a gate the MAP toggles is seen within one tick')
    def build(funcs=None):
        w = World()
        wl = wall_x(w, 1500.0)
        g = w.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
        w.army(0, 0.0, 0.0)
        s = Sim(w, 0, (0.0, 0.0), funcs=funcs)
        s.register_gates()
        seen = {}
        def human(t):
            # the human clicks "close" on the gate the AI just opened, mid-sortie
            if t == 12 and w.gate_state(wl.gates[0]) == 'open':
                w.toggle_by_map(wl.gates[0], to_open=False)
                seen['closed_at'] = t
                seen['read'] = s.it.run('AI_GateState', [0])
                seen['handle_ok'] = (s.env['ai_gate'][0] == wl.gates[0])
        run(w, [s], 150, objective=(9000.0, 0.0), hooks=[human])
        return w, s, seen
    w, s, seen = build()
    rep.check('closed_at' in seen, 'setup: the map closed the gate mid-sortie at t=%s' % seen.get('closed_at'))
    rep.check(seen.get('read') == CONSTS['AI_GS_CLOSED'],
              'R1: the very next read after the map replaced the unit says CLOSED, not GONE')
    rep.check(seen.get('handle_ok') is True, 'R1: ... and the registry now holds the NEW handle')
    rep.check(len(opens(w)) >= 2, 'the AI re-opened its gate on demand for the rest of the sortie',
              '%d opens' % len(opens(w)))
    rep.check(frac_past(w, 0, 1600.0) >= 0.9, 'and the army still made it out by T=%d' % w.t,
              '%.0f%% past' % (100 * frac_past(w, 0, 1600.0)))

    # ---- AUDIT DEFECT 3, reproduced: readers trust the cached handle
    w2, s2, seen2 = build(funcs=funcs_without_refresh())
    rep.control(seen2.get('read') == CONSTS['AI_GS_GONE'] and frac_past(w2, 0, 1600.0) < 0.9,
                'pre-audit registry (no re-resolution): after the map closes the gate the AI reads '
                'it as a HOLE, marches the rest of the army into a shut door and it stays inside '
                '-- reproduced',
                'read=%s, %.0f%% past' % (seen2.get('read'), 100 * frac_past(w2, 0, 1600.0)))
    return rep


def toy_losing(rep):
    section('A GATE WE ARE LOSING SHUTS -- even with our own troops in it (playtest 10)')
    def build(funcs=None):
        w = World()
        wl = wall_x(w, 1500.0)
        w.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
        w.army(0, 0.0, 0.0, n=12)
        s = Sim(w, 0, (0.0, 0.0), funcs=funcs)
        s.register_gates()
        seen = {}
        def assault(t):
            if t == 20:
                for i in range(8):
                    w.add('h00B', 5, 1750.0 + 30.0 * i, -120.0 + 30.0 * i)
                seen['assault_at'] = t
                seen['own_in_doorway'] = sum(1 for u in w.own_units(0) if math.hypot(u.x - 1500.0, u.y) <= CONSTS['AI_GATE_GUARD'])
        run(w, [s], 60, objective=(9000.0, 0.0), hooks=[assault])
        return w, s, seen
    w, s, seen = build()
    cl = [e for e in closes(w) if e[0] >= seen['assault_at']]
    rep.check(seen['own_in_doorway'] > 0, 'setup: our own units were in the doorway when 400 enemy CV arrived',
              '%d own units within the guard radius' % seen['own_in_doorway'])
    rep.check(bool(cl) and cl[0][0] - seen['assault_at'] <= 2 * THINK,
              'O4: the gate shut within two think ticks of the assault, own troops or not',
              'shut at t=%s' % (cl[0][0] if cl else '-'))

    # ---- PRE-PLAYTEST-10 DEFECT, reproduced: the "no friendly units present" bar
    w2, s2, seen2 = build(funcs=funcs_old_close_rule())
    cl2 = [e for e in closes(w2) if e[0] >= seen2['assault_at']]
    rep.control(not cl2 or cl2[0][0] - seen2['assault_at'] > 2 * THINK,
                'the old close bar (only when NO friendly unit is present): the gate our army left '
                'through stays open under assault while the fight goes on in the doorway -- reproduced',
                'first close %s' % (cl2[0][0] if cl2 else 'never'))
    return rep


def toy_idle(rep):
    section('O1 -- no march, no open: an idle faction never touches its gate')
    w = World()
    wl = wall_x(w, 1500.0)
    w.add_gate(wl, 'h01W', 0, 1500.0, 0.0)
    w.army(0, 0.0, 0.0, n=12)
    s = Sim(w, 0, (0.0, 0.0))
    s.register_gates()
    run(w, [s], 120)
    rep.check(not opens(w) and w.gate_state(wl.gates[0]) == 'closed',
              'an idle faction with no objective never opened its gate in 120 s')
    rep.check(w.groups_live == 0, 'no group handle leaked across the run (peak live %d)' % w.groups_peak)
    return rep


def main():
    print('=' * 78)
    print('THE GATE TOY -- closed-loop outcomes for the crossing module, on the shipped for-ai.j')
    print('  %d functions parsed; the world moves at 1 s ticks, the AI thinks every %ds, marches every %ds'
          % (len(FUNCS), THINK, REFRESH))
    print('=' * 78)
    rep = Report()
    for sec in (toy_egress, toy_contested, toy_siege, toy_breach, toy_bridge, toy_camp,
                toy_registry, toy_losing, toy_idle):
        sec(rep)
    print('\n' + '=' * 78)
    print('%s: %d outcome failures' % ('PASS' if not rep.fails else 'FAIL', rep.fails))
    return 1 if rep.fails else 0


if __name__ == '__main__':
    sys.exit(main())
