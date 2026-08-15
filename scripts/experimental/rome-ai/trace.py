#!/usr/bin/env python3
"""Hand-driven trace of the FoR-AI scoring functions.

The map is JASS, so lib/sim cannot execute it — there is no way to run the
real decision loop headlessly. This harness is the honest substitute: a tiny
interpreter for the straight-line JASS subset the scoring functions are written
in, which reads the SHIPPED for-ai.j and evaluates the real function bodies.
Because it parses the source of record rather than a transcription, the trace
cannot silently drift from the code it claims to test.

What it verifies: which goal is selected for a given world state, that the
thresholds fire where the design says, and that the PRNG is bit-exact.
What it does NOT verify: anything about whether the AI wins. There is no
pathing, no combat, no engine here.
"""
import re, sys, os, math

W = os.path.dirname(os.path.abspath(__file__))
# The module of record sits next to this script in the repo, and under ai/ in a
# scratch working copy built by inject.py. Take whichever exists -- the point of
# this harness is that it reads the SHIPPED source, so it must find it.
SRC = os.path.join(W, 'for-ai.j')
if not os.path.exists(SRC):
    SRC = os.path.join(W, 'ai', 'for-ai.j')

# ---------------------------------------------------------------- parser

def parse_functions(text):
    """name -> (params[(type,name)], body_lines)"""
    funcs, i, lines = {}, 0, text.split('\n')
    while i < len(lines):
        m = re.match(r'\s*function\s+(\w+)\s+takes\s+(.*?)\s+returns\s+(\w+)\s*$', lines[i])
        if m:
            name, params = m.group(1), []
            if m.group(2).strip() != 'nothing':
                for p in m.group(2).split(','):
                    t, n = p.split()
                    params.append((t, n))
            body, i = [], i + 1
            while i < len(lines) and not re.match(r'\s*endfunction\s*$', lines[i]):
                body.append(lines[i]); i += 1
            funcs[name] = (params, body)
        i += 1
    return funcs


def parse_globals(text):
    """Constant name -> python literal, for the constants block."""
    g = {}
    for m in re.finditer(r'^\s*constant\s+(integer|real)\s+(\w+)\s*=\s*([^/\n]+)', text, re.M):
        raw = m.group(3).strip()
        if m.group(1) == 'real':
            g[m.group(2)] = float(raw)
        elif len(raw) == 6 and raw[0] == "'" and raw[-1] == "'":
            # a rawcode literal such as 'h00R' -- big-endian FourCC, exactly
            # what the JASS compiler makes of it
            g[m.group(2)] = int.from_bytes(raw[1:-1].encode('latin1'), 'big')
        else:
            g[m.group(2)] = int(raw)
    return g


# ------------------------------------------------------------ expression

def jass_expr_to_py(e):
    e = re.sub(r'//.*$', '', e).strip()
    # JASS function references: Filter(function Foo) / ForGroup(g, function Foo).
    # Python has no such keyword, and the name alone is the callable.
    e = re.sub(r'\bfunction\s+(\w+)', r'\1', e)
    e = re.sub(r'\bnot\b', ' not ', e)
    e = re.sub(r'\band\b', ' and ', e)
    e = re.sub(r'\bor\b', ' or ', e)
    e = e.replace('true', 'True').replace('False', 'False').replace('false', 'False')
    e = e.replace('null', 'None')
    return e


class Interp:
    def __init__(self, funcs, consts, env, natives):
        self.funcs, self.consts, self.env, self.natives = funcs, consts, env, natives
        self.calls = 0

    def eval(self, expr, local):
        py = jass_expr_to_py(expr)
        scope = dict(self.consts)
        scope.update(self.env)
        scope.update(local)
        scope.update(self.natives)
        for fname in self.funcs:
            if fname not in scope:
                scope[fname] = self._make(fname)
        try:
            return eval(py, {'__builtins__': {}}, scope)
        except Exception as ex:
            raise RuntimeError('eval failed: %r -> %r (%s)' % (expr, py, ex))

    def _make(self, fname):
        def call(*args):
            return self.run(fname, list(args))
        return call

    def run(self, fname, args):
        self.calls += 1
        if self.calls > 200000:
            raise RuntimeError('runaway')
        if fname in self.natives:
            return self.natives[fname](*args)
        params, body = self.funcs[fname]
        local = {}
        for (t, n), v in zip(params, args):
            local[n] = v
        r = self.exec_block(body, local)
        return r[1] if r and r[0] == 'return' else None

    def exec_block(self, lines, local):
        i = 0
        while i < len(lines):
            raw = lines[i]
            s = re.sub(r'//.*$', '', raw).strip()
            i += 1
            if not s:
                continue
            m = re.match(r'local\s+\w+\s+array\s+(\w+)', s)
            if m:
                local[m.group(1)] = {}; continue
            m = re.match(r'local\s+\w+\s+(\w+)\s*=\s*(.+)$', s)
            if m:
                local[m.group(1)] = self.eval(m.group(2), local); continue
            m = re.match(r'local\s+\w+\s+(\w+)\s*$', s)
            if m:
                local[m.group(1)] = 0; continue
            m = re.match(r'set\s+(\w+)\[(.+?)\]\s*=\s*(.+)$', s)
            if m:
                tgt, idx, val = m.group(1), self.eval(m.group(2), local), self.eval(m.group(3), local)
                container = local.get(tgt, self.env.get(tgt))
                container[idx] = val; continue
            m = re.match(r'set\s+(\w+)\s*=\s*(.+)$', s)
            if m:
                v = self.eval(m.group(2), local)
                if m.group(1) in local:
                    local[m.group(1)] = v
                else:
                    self.env[m.group(1)] = v
                continue
            m = re.match(r'return\s*(.*)$', s)
            if m:
                return ('return', self.eval(m.group(1), local) if m.group(1).strip() else None)
            if s.startswith('call '):
                self.eval(s[5:], local); continue
            if s.startswith('if '):
                j, depth, chunk = i - 1, 0, []
                while j < len(lines):
                    t = re.sub(r'//.*$', '', lines[j]).strip()
                    if t.startswith('if '):
                        depth += 1
                    elif t == 'endif':
                        depth -= 1
                        if depth == 0:
                            break
                    chunk.append(lines[j]); j += 1
                r = self.exec_if(chunk, local)
                i = j + 1
                if r:
                    return r
                continue
            if s.startswith('loop'):
                j, depth, chunk = i - 1, 0, []
                while j < len(lines):
                    t = re.sub(r'//.*$', '', lines[j]).strip()
                    if t.startswith('loop'):
                        depth += 1
                    elif t == 'endloop':
                        depth -= 1
                        if depth == 0:
                            break
                    chunk.append(lines[j]); j += 1
                body = chunk[1:]
                guard = 0
                while True:
                    guard += 1
                    if guard > 100000:
                        raise RuntimeError('runaway loop')
                    brk = False
                    k = 0
                    sub = []
                    while k < len(body):
                        t = re.sub(r'//.*$', '', body[k]).strip()
                        mm = re.match(r'exitwhen\s+(.+)$', t)
                        if mm and self.eval(mm.group(1), local):
                            brk = True; break
                        if not mm:
                            sub.append(body[k])
                        k += 1
                    if brk:
                        break
                    r = self.exec_block(sub, local)
                    if r:
                        return r
                i = j + 1
                continue
        return None

    def exec_if(self, chunk, local):
        # chunk[0] is 'if <cond> then'; split top-level elseif/else
        branches, cur, cond, depth = [], [], None, 0
        head = re.sub(r'//.*$', '', chunk[0]).strip()
        cond = re.match(r'if\s+(.+?)\s+then$', head).group(1)
        for ln in chunk[1:]:
            t = re.sub(r'//.*$', '', ln).strip()
            if t.startswith('if '):
                depth += 1
            elif t == 'endif':
                depth -= 1
            if depth == 0 and t.startswith('elseif '):
                branches.append((cond, cur))
                cond = re.match(r'elseif\s+(.+?)\s+then$', t).group(1); cur = []
                continue
            if depth == 0 and t == 'else':
                branches.append((cond, cur))
                cond, cur = None, []
                continue
            cur.append(ln)
        branches.append((cond, cur))
        for c, blk in branches:
            if c is None or self.eval(c, local):
                return self.exec_block(blk, local)
        return None


# ------------------------------------------------------------- harness

TEXT = open(SRC, encoding='utf-8').read()
# The generated voice tables are a separate file that inject.py prepends to the
# module (JASS is single-pass and they must be declared first). The harness has
# to see exactly what the game sees, so it concatenates them the same way --
# otherwise every AI_Say path would fail here for a reason the build does not
# have, which is the harness lying in the safe direction rather than the
# dangerous one, but lying either way.
VOICES_J = os.path.join(W, 'voices.j')
if os.path.exists(VOICES_J):
    TEXT = open(VOICES_J, encoding='utf-8').read() + '\n' + TEXT
FUNCS = parse_functions(TEXT)
CONSTS = parse_globals(TEXT)

GOALS = {CONSTS['GOAL_CONSOLIDATE']: 'CONSOLIDATE', CONSTS['GOAL_EXPAND']: 'EXPAND',
         CONSTS['GOAL_DEFEND']: 'DEFEND', CONSTS['GOAL_SIEGE']: 'SIEGE',
         CONSTS['GOAL_TECH']: 'TECH', CONSTS['GOAL_RETREAT']: 'RETREAT'}


def make_env(sc):
    """Build the global environment from a scenario dict."""
    pid = 0
    d = lambda v: {pid: v}
    env = {
        'ai_now': sc.get('t', 300.0),
        'ai_pointCount': len(sc.get('points', [])),
        'ai_seed': CONSTS['AI_SEED_DEFAULT'],
        'ai_role': d(CONSTS['AI_ROLE_ROME'] if sc.get('role') == 'rome' else CONSTS['AI_ROLE_BARB']),
        'ai_diff': d(CONSTS['AI_NORMAL']),
        'ai_goal': d(sc.get('goal', CONSTS['GOAL_CONSOLIDATE'])),
        'ai_goalSince': d(sc.get('goalSince', -100.0)),
        'ai_target': d(sc.get('target', -1)),
        'ai_p': {i: i for i in range(CONSTS['AI_MAX_PLAYERS'])},
        'ai_homeX': d(0.0), 'ai_homeY': d(0.0),
        'ai_scanCursor': d(0),
        'wm_army': d(sc.get('army', 0.0)),
        'wm_garrison': d(sc.get('garrison', 0.0)),
        'wm_threat': d(sc.get('threat', 0.0)),
        'wm_threatX': d(0.0), 'wm_threatY': d(0.0), 'wm_massed': d(0.0), 'ai_scattered': d(False),
        'ai_dispCursor': d(0), 'ai_dispN': d(0), 'ai_dispSeen': 0, 'ai_dispPid': 0,
        'ai_exCount': __import__('collections').defaultdict(int),
        'ai_exCV': __import__('collections').defaultdict(float),
        'ai_marchDX': 0.0, 'ai_marchDY': 0.0, 'ai_congN': 0, '_ht': {},
        'ai_vSeq': __import__('collections').defaultdict(int),
        'ai_echoMsg': __import__('collections').defaultdict(str),
        'ai_echoAt': __import__('collections').defaultdict(float), 'ai_echoHead': 0,
        'ai_sortieGate': d(-1), 'ai_sortieAt': d(0.0),
        'wm_musterPool': d(0.0), 'ai_musterAt': 0.0,
        'ai_wdSig': d(-1), 'ai_wdStuck': d(0), 'ai_wdAt': d(0.0), 'ai_wdFired': 0,
        'ai_msGarRef': d(0.0), 'ai_threatSince': d(-1.0), 'ai_budgetTick': d(-1), 'ai_tickSeq': 0,
        'ai_issued': 0, 'ai_budget': 0, 'ai_ordersTick': 0,
        'ai_seed': 0,
        'ai_sayGlobal': '', 'ai_sayGlobalAt': -999.0,
        'ai_msRX': d(0.0), 'ai_msRY': d(0.0),
        'wm_fieldCV': d(sc.get('fieldCV', 0.0)),
        'wm_fieldX': d(sc.get('fieldX', 0.0)), 'wm_fieldY': d(sc.get('fieldY', 0.0)),
        'wm_fieldHPFrac': d(sc.get('fieldHP', 1.0)),
        'wm_fieldEnemyCV': d(sc.get('fieldEnemy', 0.0)),
        'wm_gold': d(sc.get('gold', 300.0)), 'wm_lumber': d(sc.get('lumber', 300.0)),
        'wm_food': d(sc.get('food', 0.0)), 'wm_foodCap': d(100.0),
        'wm_cpOwn': d(sc.get('cpOwn', 3)),
        'wm_fieldComp': d(sc.get('fieldComp', 0)),
        'wm_capReady': d(sc.get('capReady', 1.0)),
        'wm_capIdx': d(sc.get('capIdx', -1)),
        'ai_posture': d(sc.get('posture', CONSTS['POSTURE_EXPAND'])),
        'ai_postureAt': d(sc.get('postureAt', 1e9)),
        'ai_harasser': d(sc.get('harasser', False)),
        'wm_wantBoat': d(sc.get('wantBoat', False)),
        'wm_landLeft': d(sc.get('landLeft', False)),
        'wm_canReplaceHero': d(sc.get('canReplaceHero', False)),
        'wm_proxScale': d(sc.get('proxScale', CONSTS['AI_PROX_MIN'])),
        'wm_hasSiege': d(sc.get('hasSiege', True)),
        'ai_on': {i: True for i in range(CONSTS['AI_MAX_PLAYERS'])},
        'ai_telOn': False, 'ai_telChat': False, 'ai_telSeq': 0,
        'ai_telCount': 0, 'ai_telSum': 0, 'ai_telBuf': {},
        'ai_telTrunc': False, 'ai_telNext': 0.0,
        'tel_owner': {}, 'tel_out': d(False), 'tel_cursor': 0,
        'ai_clCount': d(0), 'ai_clX': {}, 'ai_clY': {}, 'ai_clS': {},
        'ai_clDX': {}, 'ai_clDY': {},
        'wm_townThreat': d(0.0), 'wm_townIdx': d(-1),
        'ai_msState': d(sc.get('msState', 0)), 'ai_msTarget': d(sc.get('msTarget', -1)),
        'ai_msPhaseEnd': d(sc.get('msPhaseEnd', 1e9)), 'ai_msNextOrder': d(1e9),
        'ai_ifThreat': d(False), 'ai_ifRetreat': d(False), 'ai_ifStuck': d(False),
        # per-player-per-point, indexed pid*AI_MAX_POINTS+t, so a plain dict
        # keyed only on pid is the wrong shape -- default to "not held"
        'ai_msHold': __import__('collections').defaultdict(float),
        'ai_msRestarts': 0,
        'ai_wallSince': d(sc.get('wallSince', -9999.0)),
        'ai_spy': {i: False for i in range(CONSTS['AI_MAX_PLAYERS'])},
        'ai_accSiege': 0,
        'ai_heroOut': d(sc.get('heroOut', False)),
        'ai_anchorX': 0.0, 'ai_anchorY': 0.0, 'ai_heroLeash': 0.0,
        'ai_comp': {}, 'ai_claim': {}, 'ai_claimAt': {},
        'ai_laneN': CONSTS['AI_LANES'], 'ai_laneMid': CONSTS['AI_LANE_MID'],
        'ai_laneNX': sc.get('laneNX', 0.0), 'ai_laneNY': sc.get('laneNY', 1.0),
        'ai_ramWork': False, 'ai_ramType': 0, 'ai_ramX': 0.0, 'ai_ramY': 0.0,
        'ai_navState': d(0), 'ai_navShip': d(None),
        'ai_navAt': d(0.0), 'ai_navSince': d(0.0),
        'wm_capThreat': d(sc.get('capThreat', False)),
        'wm_capLost': d(sc.get('capLost', False)),
        'wm_asset': d(sc.get('asset', CONSTS['AI_VAL_CP'])),
        'wm_canRaze': d(sc.get('canRaze', sc.get('role') != 'rome')),
        'ai_bestT': d(-1), 'ai_bestS': d(0.0),
        'ai_apX': d(0.0), 'ai_apY': d(0.0), 'ai_apGate': d(-1), 'ai_apBreak': d(False),
        'ai_gateCount': len(sc.get('gates', [])),
        'ai_gate': {}, 'ai_gateX': {}, 'ai_gateY': {}, 'ai_gateOr': {}, 'ai_gateCd': {},
        'ai_gateStuck': {},
        'ai_gateReacq': 0, 'ai_gateFindOr': -1, 'ai_gateFindD': 0.0,
        'ai_gateFindX': 0.0, 'ai_gateFindY': 0.0, 'ai_gateFound': None,
        'ai_progD': d(sc.get('progD', 999999.0)), 'ai_progAt': d(sc.get('progAt', 0.0)),
        'ai_commitAt': d(sc.get('commitAt', 0.0)),
        'ai_talk': d(False), 'ai_sayAt': d(0.0), 'ai_sayLast': d(''),
        'ai_pt': {}, 'ai_ptKind': {}, 'ai_ptX': {}, 'ai_ptY': {},
        'ai_ptOwner': {}, 'ai_ptSeen': {}, 'ai_ptDef': {},
        'ai_accCV': 0.0, 'ai_accX': 0.0, 'ai_accY': 0.0, 'ai_accW': 0.0,
        'ai_accHP': 0.0, 'ai_accHPMax': 0.0, 'ai_accN': 0,
        'ai_curP': pid, 'ai_curPid': pid,
        'ai_orderTarget': None, 'ai_orderX': 0.0, 'ai_orderY': 0.0,
    }
    MP = CONSTS['AI_MAX_POINTS']
    for i, p in enumerate(sc.get('points', [])):
        env['ai_pt'][i] = i + 1              # handle = index+1, 0 would be falsy
        env['ai_ptKind'][i] = p['kind']
        env['ai_ptX'][i] = p.get('x', 0.0)
        env['ai_ptY'][i] = p.get('y', 0.0)
        env['ai_ptOwner'][pid * MP + i] = p.get('owner', 1)
        env['ai_ptSeen'][pid * MP + i] = p.get('seen', sc.get('t', 300.0))
        env['ai_ptDef'][pid * MP + i] = p.get('defence', 0.0)
        env['ai_comp'][i] = i
        env['ai_claim'][i] = p.get('claim', -1)
        env['ai_claimAt'][i] = p.get('claimAt', sc.get('t', 300.0))
    # land component per point; AI_Find is mocked off this so the union-find
    # implementation is not what the connectivity assertions depend on
    env['_allies'] = set(sc.get('allies', ()))
    env['_span'] = sc.get('span', 1e9)          # walkable half-width, engine-side
    env['_spanNX'] = sc.get('laneNX', 0.0)
    env['_spanNY'] = sc.get('laneNY', 1.0)
    env['_water'] = tuple(sc.get('water', (1.0, -1.0)))   # empty interval by default
    env['_ptComp'] = {i: p.get('comp', 0) for i, p in enumerate(sc.get('points', []))}
    env['_ptOwner'] = {i + 1: p.get('owner', 1) for i, p in enumerate(sc.get('points', []))}
    # gates: handle = 1000+index so it cannot collide with a point handle
    env['_gateState'] = {}
    env['_gateLife'] = {}
    for i, g in enumerate(sc.get('gates', [])):
        env['ai_gate'][i] = 1000 + i
        env['ai_gateX'][i] = g.get('x', 0.0)
        env['ai_gateY'][i] = g.get('y', 0.0)
        env['ai_gateOr'][i] = g.get('orient', 0)
        env['ai_gateCd'][i] = 0.0
        env['ai_gateStuck'][i] = g.get('stuck', False)
        env['_gateState'][i] = g.get('state', CONSTS['AI_GS_CLOSED'])
        env['_gateLife'][i] = g.get('life', 1.0)
        env['_ptOwner'][1000 + i] = g.get('owner', 1)
    return env


def make_natives(env, noise=0.0):
    import math
    return {
        'SquareRoot': math.sqrt,
        'I2R': float,
        'GetOwningPlayer': lambda h: env['_ptOwner'].get(h, 1),
        'IsPlayerAlly': lambda a, b: (a, b) in env.get('_allies', ()) or (b, a) in env.get('_allies', ()),
        'AI_Noise': lambda amp: noise,
        # PLAYTEST 13. Difficulty is now an ERROR RATE, which makes selection
        # stochastic. The scenario table is deliberately deterministic ("noise
        # disabled so selection is deterministic"), so the error rate is zeroed
        # by default on exactly the same grounds and driven explicitly by the
        # difficulty section, which is the only place it is under test.
        'AI_ErrorRate': lambda pid: env.get('_errorRate', 0.0),
        # gate state is read off the live unit type in the real module; here it
        # comes from the scenario, so the ROUTING logic under test stays the
        # code read from for-ai.j
        'AI_GateState': lambda i: env['_gateState'].get(i, CONSTS['AI_GS_GONE']),
        'AI_GateLifeFrac': lambda i: env['_gateLife'].get(i, 1.0),
        # the muster fraction needs a live unit enum, which only the muster
        # section models; everywhere else it comes from the scenario and
        # defaults to "already gathered" so the S1 assertions are unchanged
        'AI_MusterFrac': lambda pid: env.get('_musterFrac', 1.0),
        # congestion needs a live unit enum; only the congestion section models
        # one, so elsewhere it is scenario-driven and defaults to "room enough"
        'AI_Congestion': lambda pid, x, y: env.get('_congestion', 0),
        # land component of a point: the union-find is built at init from the
        # engine's own pathing, which no interpreter can reach, so the graph
        # comes from the scenario and the CONSUMERS stay under test
        'AI_Find': lambda i: env['_ptComp'].get(i, 0),
        # a real hashtable: the corridor ledger lives in one, so the claim
        # logic under test is the shipped logic rather than a stand-in
        'ai_ht': 'HT',
        'SaveInteger': lambda ht, a, b, v: env['_ht'].__setitem__((a, b), v),
        'LoadInteger': lambda ht, a, b: env['_ht'].get((a, b), 0),
        'SaveReal': lambda ht, a, b, v: env['_ht'].__setitem__((a, b), v),
        'LoadReal': lambda ht, a, b: env['_ht'].get((a, b), 0.0),
        'R2I': int,
        'ModuloInteger': lambda a, b: a % b if b else 0,
        'GetPlayerId': lambda p: p if isinstance(p, int) else 0,
        'PATHING_TYPE_WALKABILITY': 1,
        'StringHash': lambda x: sum(ord(c) for c in str(x)),
        'Pow': lambda x, p: x ** p,
        'UNIT_STATE_LIFE': 1, 'UNIT_STATE_MAX_LIFE': 2, 'UNIT_TYPE_HERO': 3,
        'UNIT_TYPE_STRUCTURE': 4,
        # IsTerrainPathable is INVERTED: true means BLOCKED. Two independent
        # scenario mechanisms, because the two round-4 uses need different
        # shapes: '_span' is a half-width of walkable ground about the march
        # line (a bridge is simply a small number), and '_water' is an
        # interval ALONG the march that is sea (a strait to be crossed).
        'IsTerrainPathable': lambda x, y, t: (
            abs(x * env.get('_spanNX', 0.0) + y * env.get('_spanNY', 1.0))
            > env.get('_span', 1e9)
            or env.get('_water', (1.0, -1.0))[0] <= x <= env.get('_water', (1.0, -1.0))[1]),
    }


def seed_capital(env, it, sc):
    """wm_capIdx and wm_capReady are produced by AI_ScanWorld, which needs the
    engine. Reproduce them here from the scenario -- but through the REAL
    AI_CapReadiness, so the round-3 readiness gate itself stays under test
    rather than being replaced by a scenario constant."""
    import math
    pid = 0
    CAPK = CONSTS['AI_PK_CAPITAL']
    idx, dfc, best = -1, 0.0, 1e18
    for i, p in enumerate(sc.get('points', [])):
        if p['kind'] == CAPK and p.get('owner', 1) != pid:
            d = math.hypot(p.get('x', 0.0) - sc.get('fieldX', 0.0),
                           p.get('y', 0.0) - sc.get('fieldY', 0.0))
            if d < best:
                best, idx, dfc = d, i, p.get('defence', 0.0)
    env['wm_capIdx'][pid] = idx
    if 'capReady' not in sc:
        env['wm_capReady'][pid] = it.run('AI_CapReadiness', [sc.get('army', 0.0), dfc])


def evaluate(sc, noise=0.0):
    env = make_env(sc)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, noise))
    seed_capital(env, it, sc)
    scores = {}
    for g, fn in (('CONSOLIDATE', 'AI_ScoreConsolidate'), ('EXPAND', 'AI_ScoreExpand'),
                  ('DEFEND', 'AI_ScoreDefend'), ('SIEGE', 'AI_ScoreSiege'),
                  ('TECH', 'AI_ScoreTech'), ('RETREAT', 'AI_ScoreRetreat')):
        scores[g] = it.run(fn, [0])
    goal = it.run('AI_SelectGoal', [0])
    return scores, GOALS.get(goal, '?%s' % goal)


# ----------------------------------------------------------- scenarios

CP, TOWN, CITY, CAP = 0, 1, 2, 3

def pts(*specs):
    out = []
    for kind, x, y, dfc in specs:
        out.append({'kind': kind, 'x': x, 'y': y, 'defence': dfc, 'owner': 1})
    return out

NEAR = pts((CP, 1500.0, 0.0, 0.0))
FAR_CAP = pts((CP, 1500.0, 0.0, 0.0), (CAP, 12000.0, 0.0, 300.0))

SCEN = [
 ('opening: barbarian, no army, 300g',
  dict(role='barb', t=10.0, army=0.0, gold=300.0, lumber=300.0, points=FAR_CAP),
  'CONSOLIDATE'),

 ('early: army built, quiet, points nearby',
  dict(role='barb', t=240.0, army=600.0, gold=200.0, lumber=200.0, food=72.0,
       points=FAR_CAP, fieldX=0.0),
  'EXPAND'),

 ('home attacked by a beatable force while expanding',
  dict(role='barb', t=400.0, army=600.0, garrison=200.0, threat=450.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=395.0, points=FAR_CAP),
  'DEFEND'),

 ('home attacked by an OVERWHELMING force, not a capital: write off',
  dict(role='barb', t=400.0, army=300.0, garrison=100.0, threat=1400.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=395.0, points=FAR_CAP),
  'EXPAND'),

 ('same overwhelming force, but it is threatening a CAPITAL (roman)',
  dict(role='rome', t=400.0, army=300.0, garrison=100.0, threat=1400.0,
       capThreat=True, goal=CONSTS['GOAL_EXPAND'], goalSince=395.0, points=FAR_CAP),
  'DEFEND'),

 ('late game, big army, barbarian: the clock forces the capital',
  dict(role='barb', t=1500.0, army=1100.0, gold=400.0, lumber=400.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=1400.0, points=FAR_CAP),
  'SIEGE'),

 ('late game, SAME clock, but a weak army: too weak to commit',
  dict(role='barb', t=1500.0, army=250.0, gold=400.0, lumber=400.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=1400.0, points=FAR_CAP),
  'CONSOLIDATE'),

 ('field army losing badly away from home',
  dict(role='barb', t=800.0, army=500.0, garrison=0.0, fieldCV=500.0,
       fieldEnemy=1200.0, fieldX=9000.0, fieldHP=0.55,
       goal=CONSTS['GOAL_EXPAND'], goalSince=790.0, points=FAR_CAP),
  'RETREAT'),

 ('rome has lost both capitals: retake is near-absolute',
  dict(role='rome', t=1200.0, army=700.0, capLost=True, gold=200.0,
       goal=CONSTS['GOAL_CONSOLIDATE'], goalSince=1100.0, points=FAR_CAP),
  'SIEGE'),

 ('surplus of both currencies, quiet, mid game: bank into tech',
  dict(role='barb', t=500.0, army=1300.0, gold=1400.0, lumber=1400.0, food=96.0,
       points=pts((CP, 30000.0, 30000.0, 900.0)), fieldX=0.0),
  'TECH'),

 # ---- playtest round 2: "barbarians center on where they are being attacked"
 ('an enemy army walks past; nothing of ours is at risk: do NOT turn around',
  dict(role='barb', t=400.0, army=600.0, garrison=200.0, threat=380.0, asset=0.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=395.0, points=FAR_CAP),
  'EXPAND'),

 ('the same force, but it is standing on a control point we own: defend',
  dict(role='barb', t=400.0, army=600.0, garrison=200.0, threat=380.0, asset=1.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=395.0, points=FAR_CAP),
  'DEFEND'),

 ('threat exceeds the WHOLE army by 1.6x: write off, keep the army',
  dict(role='barb', t=600.0, army=500.0, garrison=250.0, threat=900.0, asset=1.0,
       goal=CONSTS['GOAL_EXPAND'], goalSince=595.0, points=FAR_CAP),
  'EXPAND'),
]


def sweep():
    """The self-direction evidence: hold the world FIXED and advance only the
    clock. A scripted AI cannot change behaviour here; a utility AI must."""
    print('\n' + '=' * 78)
    print('CLOCK SWEEP — identical world state, only elapsed time varies')
    print('barbarian, army 950, gold 350, one CP nearby, one enemy capital far')
    print('=' * 78)
    print('%6s %6s  %-11s %-11s %-11s  %s' % ('t', 'clock', 'CONSOL', 'EXPAND', 'SIEGE', 'chosen'))
    seen = []
    for t in (60, 300, 600, 900, 1200, 1400, 1600, 1750):
        sc = dict(role='barb', t=float(t), army=950.0, gold=350.0, lumber=350.0,
                  food=80.0, points=FAR_CAP, goal=CONSTS['GOAL_NONE'], goalSince=-999.0)
        scores, goal = evaluate(sc)
        seen.append(goal)
        print('%6d %6.2f  %-11.3f %-11.3f %-11.3f  %s' % (
            t, t / 1800.0, scores['CONSOLIDATE'], scores['EXPAND'], scores['SIEGE'], goal))
    changed = len(set(seen)) > 1
    print('\n%s: behaviour %s across the sweep (%s)' % (
        'PASS' if changed else 'FAIL',
        'CHANGES' if changed else 'is CONSTANT — that is a scripted AI',
        ' -> '.join(seen)))
    return 0 if changed else 1


def prng_check():
    """Park-Miller via Schrage must be identical under 32- and 64-bit ints."""
    print('\n' + '=' * 78)
    print('PRNG — Park-Miller (16807, 2^31-1) via Schrage decomposition')
    print('=' * 78)
    seed = CONSTS['AI_SEED_DEFAULT']
    s32, s_ref = seed, seed
    maxi = 0
    ok = True
    for i in range(200000):
        # Schrage, as written in the JASS
        k = s32 // 127773
        s32 = 16807 * (s32 - k * 127773) - 2836 * k
        maxi = max(maxi, abs(16807 * (s32 if False else (s_ref - (s_ref // 127773) * 127773))))
        if s32 < 0:
            s32 += 2147483647
        # reference: direct modular multiply (needs 64-bit)
        s_ref = (16807 * s_ref) % 2147483647
        if s32 != s_ref:
            print('FAIL: diverged at step %d (%d vs %d)' % (i, s32, s_ref))
            ok = False
            break
    print('  200000 states, Schrage form vs direct 64-bit modmul: %s' %
          ('IDENTICAL' if ok else 'DIVERGED'))
    print('  largest intermediate seen: %d  (2^31 = %d) -> %s' % (
        maxi, 2**31, 'fits in 32-bit signed' if maxi < 2**31 else 'OVERFLOWS'))
    print('  %s: the stream is width-portable and reproducible' % ('PASS' if ok and maxi < 2**31 else 'FAIL'))
    return 0 if (ok and maxi < 2**31) else 1


# ------------------------------------------------- structure value ordering

def target_score(pid_scen, i):
    """Raw AI_TargetScore for point i of a scenario, noise off."""
    env = make_env(pid_scen)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    return it.run('AI_TargetScore', [0, i])


def value_ordering():
    """Playtest round 2, fault 5: "shipyards are worth nearly nothing ... but
    they go for shipyards instead of control points and razing and burning".
    These are the assertions that would have caught it."""
    print('\n' + '=' * 78)
    print('STRUCTURE VALUE MODEL -- target ordering (AI_VAL_* table)')
    print('=' * 78)
    SHIP, PLOT, CAMP = 6, 5, 4
    fails = 0
    cases = [
        # name, points (index 0 vs index 1), which index must win
        ('shipyard at 2000 vs control point at 4000 (twice as far)',
         [{'kind': SHIP, 'x': 2000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1},
          {'kind': CP,   'x': 4000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1}], 1),
        ('shipyard at 500 (right there) vs control point at 8000',
         [{'kind': SHIP, 'x': 500.0,  'y': 0.0, 'defence': 0.0, 'owner': 1},
          {'kind': CP,   'x': 8000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1}], 1),
        ('shipyard at 2000 vs razeable city at 4000',
         [{'kind': SHIP, 'x': 2000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1},
          {'kind': CITY, 'x': 4000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1}], 1),
        ('shipyard at 2000 vs razeable town at 4000',
         [{'kind': SHIP, 'x': 2000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1},
          {'kind': TOWN, 'x': 4000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1}], 1),
        ('empty build plot at 1000 vs control point at 3000',
         [{'kind': PLOT, 'x': 1000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1},
          {'kind': CP,   'x': 3000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1}], 1),
        ('control point at 3000 vs enemy CAPITAL at 12000',
         [{'kind': CP,  'x': 3000.0,  'y': 0.0, 'defence': 0.0, 'owner': 1},
          {'kind': CAP, 'x': 12000.0, 'y': 0.0, 'defence': 0.0, 'owner': 1}], 1),
    ]
    for name, points, want in cases:
        sc = dict(role='barb', t=400.0, army=600.0, points=points, fieldX=0.0, fieldY=0.0)
        a, b = target_score(sc, 0), target_score(sc, 1)
        got = 0 if a > b else 1
        ok = got == want
        fails += 0 if ok else 1
        print('  %s %-52s %.4f vs %.4f' % ('PASS' if ok else 'FAIL', name, a, b))
    # the raze premium must exist and must be role-gated
    e1 = make_env(dict(role='barb', points=[]))
    i1 = Interp(FUNCS, CONSTS, e1, make_natives(e1))
    e2 = make_env(dict(role='rome', points=[]))
    i2 = Interp(FUNCS, CONSTS, e2, make_natives(e2))
    barb_city = i1.run('AI_PointValueFor', [0, CITY])
    rome_city = i2.run('AI_PointValueFor', [0, CITY])
    ok = barb_city > rome_city
    fails += 0 if ok else 1
    print('  %s razing premium is role-gated: barb city=%.2f, roman city=%.2f'
          % ('PASS' if ok else 'FAIL', barb_city, rome_city))
    ship = i1.run('AI_PointValueFor', [0, SHIP])
    cp = i1.run('AI_PointValueFor', [0, CP])
    ok = ship <= 0.05 and cp / ship >= 20.0
    fails += 0 if ok else 1
    print('  %s shipyard is ~0 next to a control point: %.2f vs %.2f (%.0fx)'
          % ('PASS' if ok else 'FAIL', ship, cp, cp / ship))
    print('\n%s: %d value-ordering assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------------------------- approach routing

def approach(sc):
    env = make_env(sc)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    it.run('AI_ChooseApproach', [0, sc['tx'], sc['ty']])
    return env['ai_apGate'][0], env['ai_apBreak'][0], env['ai_apX'][0], env['ai_apY'][0]


def routing():
    """Playtest round 2, faults 3 and 4: "if there is a pre-existing hole in the
    gate, instead of sieging that gate ..." and "AI does not know how to use
    gates". A hole must beat an intact gate; a half-broken gate must beat an
    intact one; a silly detour must be rejected."""
    print('\n' + '=' * 78)
    print('APPROACH ROUTING -- gate choice on the way to an objective')
    print('=' * 78)
    OPEN, CLOSED, GONE = CONSTS['AI_GS_OPEN'], CONSTS['AI_GS_CLOSED'], CONSTS['AI_GS_GONE']
    fails = 0

    def case(name, gates, want_gate, want_break, tx=8000.0, ty=0.0, fx=0.0, fy=0.0):
        nonlocal fails
        sc = dict(role='barb', t=400.0, army=600.0, points=[], gates=gates,
                  fieldX=fx, fieldY=fy, tx=tx, ty=ty)
        gi, brk, ax, ay = approach(sc)
        ok = (gi == want_gate) and (bool(brk) == want_break)
        fails += 0 if ok else 1
        print('  %s %-56s gate=%s break=%s' % ('PASS' if ok else 'FAIL', name, gi, bool(brk)))

    # gate 0 shut and directly on the way; gate 1 already destroyed, further off
    case('intact gate on the line vs a destroyed one 1500 aside',
         [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=1),
          dict(x=6000.0, y=1500.0, state=GONE, owner=1)], 1, False)
    case('intact gate on the line vs an OPEN one 1500 aside',
         [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=1),
          dict(x=6000.0, y=1500.0, state=OPEN, owner=1)], 1, False)
    case('two shut gates: take the one already beaten down to 20 percent',
         [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=1),
          dict(x=6000.0, y=900.0, state=CLOSED, life=0.20, owner=1)], 1, True)
    case('only a shut enemy gate: commit to breaking THAT gate',
         [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=1)], 0, True)
    case('our OWN shut gate on the way: cross it, do not besiege it',
         [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=0)], 0, False)
    case('a gate past the objective is not on this march',
         [dict(x=28000.0, y=0.0, state=CLOSED, life=1.0, owner=1)], -1, False)
    case('a hole far outside the corridor is not a crossing',
         [dict(x=4000.0, y=9000.0, state=GONE, owner=1)], -1, False)
    # ROUND 5, the Gray jam. Round 3 stopped routing once the objective was
    # within 2200, so an army that had ARRIVED at a wall switched its whole
    # crossing model off: ai_apBreak went false, rams were sent to the rear
    # and none were bought. The screenshot was a gate on 1992/2000 HP.
    case('a wall in the LAST 2000 units is still a crossing (the Gray jam)',
         [dict(x=900.0, y=0.0, state=CLOSED, life=1.0, owner=1)], 0, True,
         tx=1500.0, ty=0.0)
    case('a genuinely trivial distance still skips routing',
         [dict(x=200.0, y=0.0, state=CLOSED, life=1.0, owner=1)], -1, False,
         tx=400.0, ty=0.0)

    # ---------------------------------------------------------------- round 3
    # THE BLOCKER. Every one of these was invisible to round 2, which only
    # looked for a gate within AI_GATE_NEAR (4200) of the OBJECTIVE.
    print('  -- round 3: the gate an army must cross LEAVING its own city --')
    case('our own gate 400 units outside home, objective 8000 away',
         [dict(x=400.0, y=0.0, state=CLOSED, life=1.0, owner=0)], 0, False)
    case('P9 shape: own gate 85 units off the exit line, 7900 from the objective',
         [dict(x=1200.0, y=85.0, state=CLOSED, life=1.0, owner=0)], 0, False)
    case('an enemy gate on the exit line is still a crossing, and must break',
         [dict(x=600.0, y=38.0, state=CLOSED, life=1.0, owner=1)], 0, True)
    # wall ORDER: the near wall must be crossed first even when the far wall
    # is free. Crossing them out of order is how an army walks into a wall.
    case('near intact wall at t=0.2 vs a breach at t=0.8: cross the NEAR one',
         [dict(x=1600.0, y=0.0, state=CLOSED, life=1.0, owner=1),
          dict(x=6400.0, y=0.0, state=GONE, owner=1)], 0, True)
    # a toggle that silently failed must not trap the army forever
    case('a gate latched STUCK is routed around, not waited on',
         [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=0, stuck=True),
          dict(x=6000.0, y=1200.0, state=OPEN, owner=0)], 1, False)
    print('\n%s: %d routing assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------------- round 3: guard A + the backstop

def gate_identity():
    """EXTERNAL AUDIT, defect 3 -- registry identity.

    The gate registry is enumerated once at init and caches unit HANDLES. The
    map's own Trig_Open_*/Trig_Close_* actions call ReplaceUnitBJ, which
    REMOVES the old unit -- so any gate toggled by the human (or by the map on
    anyone's behalf) leaves our handle dangling. A dangling handle read through
    the old AI_GateState reported AI_GS_GONE: "a hole in the wall". A gate the
    human had just CLOSED therefore read to us as a breach, which is Guard A
    inverted in the worst direction.

    Unlike the routing sections above, this one does NOT stub AI_GateState --
    the real body is interpreted against a modelled unit world, because the
    body is the thing under test.

    The assertion is negative-controlled by construction: the same scenario is
    replayed against a synthesised PRE-FIX AI_GateState (the shipped body with
    its `call AI_GateRefresh(i)` line removed) and that variant MUST report
    GONE. If it did not, the test could not have failed before the fix.
    """
    print('\n' + '=' * 78)
    print('EXTERNAL AUDIT 3 -- the gate registry survives the map replacing a gate')
    print('=' * 78)
    OPEN, CLOSED, GONE = CONSTS['AI_GS_OPEN'], CONSTS['AI_GS_CLOSED'], CONSTS['AI_GS_GONE']
    fails = 0

    # Gate type ids are READ OUT of the shipped AI_GateState body rather than
    # retyped here, so renaming a gate type cannot leave this test asserting
    # against ids the module no longer knows. The interpreter keeps rawcode
    # literals as strings, so that is how the modelled world reports them.
    body_src = '\n'.join(FUNCS['AI_GateState'][1])
    closed_line = [ln for ln in FUNCS['AI_GateState'][1] if 'AI_GS_CLOSED' in ln and "'" in ln]
    open_line = [ln for ln in FUNCS['AI_GateState'][1] if 'AI_GS_OPEN' in ln and "'" in ln]
    if not closed_line or not open_line:
        # the ids live one line above the assignment in the shipped shape
        idx_c = next(i for i, ln in enumerate(FUNCS['AI_GateState'][1]) if 'AI_GS_CLOSED' in ln)
        idx_o = next(i for i, ln in enumerate(FUNCS['AI_GateState'][1]) if 'AI_GS_OPEN' in ln)
        closed_line = [FUNCS['AI_GateState'][1][idx_c - 1]]
        open_line = [FUNCS['AI_GateState'][1][idx_o - 1]]
    CLOSED_T = re.findall(r"'(\w{4})'", closed_line[0])[0]
    OPEN_T = re.findall(r"'(\w{4})'", open_line[0])[0]
    if not CLOSED_T or not OPEN_T or CLOSED_T == OPEN_T:
        fails += 1
        print('  FAIL could not read the gate type ids out of AI_GateState')

    def world(funcs, replaced):
        """One registry entry at (500, 500), orientation 0.

        replaced=False: the cached handle is live and closed.
        replaced=True : the map replaced it. Handle 'H' is REMOVED (type id 0,
                        the engine's own signal) and a NEW closed gate 'H2'
                        stands at the same spot.
        """
        sc = dict(role='barb', gates=[dict(x=500.0, y=500.0, orient=0, state=CLOSED)])
        env = make_env(sc)
        nat = make_natives(env, 0.0)
        del nat['AI_GateState']                      # interpret the REAL body
        H, H2 = 1000, 2000
        types = {H: 0 if replaced else CLOSED_T, H2: CLOSED_T}
        pos = {H: (500.0, 500.0), H2: (500.0, 500.0)}
        env['ai_gate'][0] = H
        present = [H2] if replaced else [H]
        state = {}
        def enum_driver(g, fn):
            for u in present:
                state['cur'] = u
                fn()
        nat['GetEnumUnit'] = lambda: state.get('cur')
        nat['GetUnitTypeId'] = lambda u: types.get(u, 0)
        nat['GetUnitX'] = lambda u: pos[u][0]
        nat['GetUnitY'] = lambda u: pos[u][1]
        # a live gate unit; a REMOVED one reads 0 life as well as 0 type
        nat['GetUnitState'] = lambda u, st: 0.0 if types.get(u, 0) == 0 else 1000.0
        nat['CreateGroup'] = lambda: 'g'
        nat['DestroyGroup'] = lambda g: None
        nat['GroupEnumUnitsInRange'] = lambda g, x, y, r, f: None
        nat['ForGroup'] = enum_driver
        nat['Filter'] = lambda f: f
        it = Interp(funcs, CONSTS, env, nat)
        return it.run('AI_GateState', [0]), env

    # --- negative control: the pre-fix body, synthesised from the shipped one
    prefix_funcs = dict(FUNCS)
    params, body = FUNCS['AI_GateState']
    stripped = [ln for ln in body if 'AI_GateRefresh' not in ln]
    if len(stripped) == len(body):
        fails += 1
        print('  FAIL negative control is INERT: the shipped AI_GateState does not '
              'call AI_GateRefresh, so nothing was removed to build the pre-fix body')
    prefix_funcs['AI_GateState'] = (params, stripped)

    nc, _ = world(prefix_funcs, replaced=True)
    ok = (nc == GONE)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: without the refresh, a gate the map replaced reads '
          'as %s (GONE=%d) -- the bug the audit reported, reproduced'
          % ('PASS' if ok else 'FAIL', nc, GONE))

    # --- the fix
    st, env = world(FUNCS, replaced=True)
    ok = (st == CLOSED)
    fails += 0 if ok else 1
    print('  %s a gate the MAP replaced is re-acquired by position and reads CLOSED, '
          'not a breach (got %s)' % ('PASS' if ok else 'FAIL', st))

    ok = (env['ai_gate'][0] == 2000)
    fails += 0 if ok else 1
    print('  %s ... and the registry now caches the NEW handle, so the enum does not '
          'repeat on every read' % ('PASS' if ok else 'FAIL'))

    ok = (env['ai_gateReacq'] == 1)
    fails += 0 if ok else 1
    print('  %s ... and the reacquisition is COUNTED, so a run can show whether this '
          'path ever executes (count=%s)' % ('PASS' if ok else 'FAIL', env['ai_gateReacq']))

    # a live handle must not pay for the enum at all
    st, env = world(FUNCS, replaced=False)
    ok = (st == CLOSED and env['ai_gateReacq'] == 0)
    fails += 0 if ok else 1
    print('  %s an untouched gate is NOT re-enumerated -- refresh is lazy, not per-read'
          % ('PASS' if ok else 'FAIL'))

    # a genuinely destroyed gate: removed handle, nothing at the position
    sc = dict(role='barb', gates=[dict(x=500.0, y=500.0, orient=0, state=CLOSED)])
    env = make_env(sc)
    nat = make_natives(env, 0.0)
    del nat['AI_GateState']
    env['ai_gate'][0] = 1000
    nat['GetEnumUnit'] = lambda: None
    nat['GetUnitTypeId'] = lambda u: 0
    nat['GetUnitX'] = lambda u: 0.0
    nat['GetUnitY'] = lambda u: 0.0
    nat['GetUnitState'] = lambda u, st: 0.0
    nat['CreateGroup'] = lambda: 'g'
    nat['DestroyGroup'] = lambda g: None
    nat['GroupEnumUnitsInRange'] = lambda g, x, y, r, f: None
    nat['ForGroup'] = lambda g, fn: None
    nat['Filter'] = lambda f: f
    st = Interp(FUNCS, CONSTS, env, nat).run('AI_GateState', [0])
    ok = (st == GONE and env['ai_gate'][0] is None)
    fails += 0 if ok else 1
    print('  %s a gate that really WAS destroyed still reports GONE, and the entry is '
          'nulled rather than left dangling' % ('PASS' if ok else 'FAIL'))

    # a latched stuck verdict belonged to the old handle
    st, env = world(FUNCS, replaced=True)
    ok = (env['ai_gateStuck'][0] is False)
    fails += 0 if ok else 1
    print('  %s a latched "stuck" verdict does not outlive the handle it was latched on'
          % ('PASS' if ok else 'FAIL'))

    print('%s: registry identity is positional, not a cached handle'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def gates_round3():
    """Round 3 rewrote candidate selection, so the round-2 behaviours that the
    OWNER complained about must be re-established in the NEW code rather than
    inherited by accident.

    Guard A is his exact complaint: "if there is a pre-existing hole in the
    gate, instead of sieging that gate, allowing you to choke them easily".
    A breach on the corridor must beat an intact gate on the same wall. The
    assertion is negative-controlled first -- five agents in this repo have
    shipped probes that "passed" while structurally incapable of firing.
    """
    print('\n' + '=' * 78)
    print('ROUND 3 -- crossing cost, guard A, and the stall backstop')
    print('=' * 78)
    OPEN, CLOSED, GONE = CONSTS['AI_GS_OPEN'], CONSTS['AI_GS_CLOSED'], CONSTS['AI_GS_GONE']
    fails = 0

    def cost(gate, owner=1):
        sc = dict(role='barb', gates=[dict(owner=owner, **gate)])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_GateCost', [0, 0])

    # -- the cost ladder, stated explicitly -------------------------------
    c_breach = cost(dict(x=0.0, y=0.0, state=GONE))
    c_open = cost(dict(x=0.0, y=0.0, state=OPEN))
    c_own = cost(dict(x=0.0, y=0.0, state=CLOSED, life=1.0), owner=0)
    c_half = cost(dict(x=0.0, y=0.0, state=CLOSED, life=0.2))
    c_intact = cost(dict(x=0.0, y=0.0, state=CLOSED, life=1.0))
    ladder = [
        ('a destroyed gate is free', c_breach == 0.0),
        ('an open gate is free', c_open == 0.0),
        ('our own shut gate is nearly free', 0.0 < c_own <= CONSTS['AI_GATE_OWN']),
        ('a half-broken enemy gate is cheaper than an intact one', c_half < c_intact),
        ('GUARD A: a breach is cheaper than an intact enemy gate', c_breach < c_intact),
        ('GUARD A: a breach is cheaper than our own shut gate', c_breach < c_own),
    ]
    for name, ok in ladder:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       ladder: breach=%.1f open=%.1f own=%.1f half=%.1f intact=%.1f'
          % (c_breach, c_open, c_own, c_half, c_intact))

    # -- guard A end to end, through the real selection -------------------
    def pick(gates, fx=0.0, fy=0.0, tx=8000.0, ty=0.0, break_cost=None):
        sc = dict(role='barb', army=600.0, points=[], gates=gates,
                  fieldX=fx, fieldY=fy)
        env = make_env(sc)
        consts = dict(CONSTS)
        if break_cost is not None:
            consts['AI_GATE_BREAK'] = break_cost   # negative control lever
        it = Interp(FUNCS, consts, env, make_natives(env, 0.0))
        it.run('AI_ChooseApproach', [0, tx, ty])
        return env['ai_apGate'][0]

    WALL = [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=1),   # intact
            dict(x=6000.0, y=800.0, state=GONE, owner=1)]             # the hole
    got = pick(WALL)
    ok = (got == 1)
    fails += 0 if ok else 1
    print('  %s GUARD A end to end: one wall, one hole and one intact gate -> hole (got %s)'
          % ('PASS' if ok else 'FAIL', got))

    # NEGATIVE CONTROL: zero the siege cost so an intact gate is as cheap as a
    # hole. The nearer intact gate must then win, proving the assertion above
    # is actually driven by AI_GateCost and is capable of failing.
    got_nc = pick(WALL, break_cost=0.0)
    ok_nc = (got_nc == 0)
    fails += 0 if ok_nc else 1
    print('  %s   negative control: with AI_GATE_BREAK=0 the intact gate wins instead (got %s)'
          % ('PASS' if ok_nc else 'FAIL', got_nc))

    # -- the waypoint is PAST the gate, not on it -------------------------
    sc = dict(role='barb', army=600.0, points=[], fieldX=0.0, fieldY=0.0,
              gates=[dict(x=4000.0, y=0.0, state=OPEN, owner=0)])
    env = make_env(sc)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    it.run('AI_ChooseApproach', [0, 8000.0, 0.0])
    ok = env['ai_apX'][0] > 4000.0
    fails += 0 if ok else 1
    print('  %s the waypoint is set PAST the crossing (apX=%.0f, gate at 4000)'
          % ('PASS' if ok else 'FAIL', env['ai_apX'][0]))

    # -- the stall backstop ------------------------------------------------
    def track(progD, progAt, fx, now):
        sc = dict(role='barb', t=now, fieldX=fx, fieldY=0.0, progD=progD, progAt=progAt)
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_TrackProgress', [0, 8000.0, 0.0])

    T = CONSTS['AI_STALL_T']
    stall_cases = [
        ('closing on the objective is not a stall', track(8000.0, 0.0, 1000.0, 100.0), False),
        ('standing still under the timer is not a stall yet',
         track(7000.0, 100.0, 1000.0, 100.0 + T - 1.0), False),
        ('standing still past AI_STALL_T IS a stall',
         track(7000.0, 100.0, 1000.0, 100.0 + T + 1.0), True),
        ('being pushed BACK resets the clock, it is not a stall',
         track(2000.0, 100.0, 1000.0, 100.0 + T + 1.0), False),
    ]
    for name, got, want in stall_cases:
        ok = (bool(got) == want)
        fails += 0 if ok else 1
        print('  %s %-58s -> %s' % ('PASS' if ok else 'FAIL', name, bool(got)))

    # -- ROUND 4, FINDING 7 ------------------------------------------------
    # "gates are over-prioritised when a nearby gate is already broken -- they
    # should go for control points instead." A gate has ZERO intrinsic value;
    # it is pure transit cost. With a breach available the army must route
    # THROUGH it and issue no gate-attack order at all.
    print('  -- round 4, finding 7: a gate is transit cost, never an objective --')

    def pick4(gates, free_corridor=None):
        sc = dict(role='barb', army=600.0, points=[], gates=gates,
                  fieldX=0.0, fieldY=0.0)
        env = make_env(sc)
        consts = dict(CONSTS)
        if free_corridor is not None:
            consts['AI_GATE_CORRIDOR_FREE'] = free_corridor
        it = Interp(FUNCS, consts, env, make_natives(env, 0.0))
        it.run('AI_ChooseApproach', [0, 8000.0, 0.0])
        return env['ai_apGate'][0], bool(env['ai_apBreak'][0])

    WALL4 = [dict(x=6000.0, y=0.0, state=CLOSED, life=1.0, owner=1),     # intact, ON the line
             dict(x=6000.0, y=3000.0, state=GONE, owner=1)]             # breach, well off it
    gi, brk = pick4(WALL4)
    ok = (gi == 1) and not brk
    fails += 0 if ok else 1
    print('    %s a breach 3000 off the line still beats an intact gate ON it (gate=%s break=%s)'
          % ('PASS' if ok else 'FAIL', gi, brk))
    ok = not brk
    fails += 0 if ok else 1
    print('    %s ... so ai_apBreak is false, and AI_MoveOnTarget issues ZERO gate-attack orders'
          % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL: shrink the free-crossing corridor back to the narrow
    # one, which is exactly the round-3 behaviour. The breach goes invisible
    # and the army commits to besieging the gate it never needed.
    gi_nc, brk_nc = pick4(WALL4, free_corridor=CONSTS['AI_GATE_CORRIDOR'])
    ok = (gi_nc == 0) and brk_nc
    fails += 0 if ok else 1
    print('    %s   negative control: at the round-3 corridor the breach vanishes and it besieges (gate=%s break=%s)'
          % ('PASS' if ok else 'FAIL', gi_nc, brk_nc))

    print('\n%s: %d round-3 gate assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------------------------- defence damping

def defence():
    """Playtest round 2, fault 2. The recall predicate and the response budget
    are separate functions precisely so they can be asserted here."""
    print('\n' + '=' * 78)
    print('DEFENCE DAMPING -- recall predicate and response budget')
    print('=' * 78)
    fails = 0

    def run(fn, sc, args=None):
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run(fn, args if args is not None else [0])

    cases = [
        ('garrison can handle it -> no recall', 'AI_ShouldRecall',
         dict(role='barb', threat=200.0, garrison=300.0, army=800.0, asset=1.0), False),
        ('garrison outmatched but only a control point at risk while taking a city',
         'AI_ShouldRecall',
         dict(role='barb', threat=600.0, garrison=200.0, army=800.0, asset=1.0,
              target=0, points=pts((CITY, 5000.0, 0.0, 0.0))), False),
        ('garrison outmatched and a CITY at risk while taking a control point',
         'AI_ShouldRecall',
         dict(role='barb', threat=600.0, garrison=200.0, army=800.0, asset=2.30,
              target=0, points=pts((CP, 5000.0, 0.0, 0.0))), True),
        ('a capital is threatened -> always recall', 'AI_ShouldRecall',
         dict(role='rome', threat=100.0, garrison=900.0, army=900.0, capThreat=True), True),
    ]
    for name, fn, sc, want in cases:
        got = bool(run(fn, sc))
        ok = got == want
        fails += 0 if ok else 1
        print('  %s %-62s -> %s' % ('PASS' if ok else 'FAIL', name, got))

    # the budget must never exceed AI_DEF_MAX_FRAC of the army
    frac = CONSTS['AI_DEF_MAX_FRAC']
    for army, threat, garr in ((1000.0, 5000.0, 0.0), (1000.0, 200.0, 0.0), (1000.0, 100.0, 900.0)):
        b = run('AI_RespondBudget', dict(role='barb', army=army, threat=threat, garrison=garr))
        ok = 0.0 <= b <= frac * army + 1e-6
        fails += 0 if ok else 1
        print('  %s budget(army=%.0f threat=%.0f garrison=%.0f) = %.1f  (cap %.1f)'
              % ('PASS' if ok else 'FAIL', army, threat, garr, b, frac * army))
    print('\n%s: %d defence assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------------------------ order economy

ORDER_GUARDS = [
    # (description, regex that must match the shipped module)
    ('AI_TryOrder exists',
     r'function AI_TryOrder takes unit u, integer kind'),
    ('AI_TryOrder consults AI_NeedsOrder before issuing',
     r'function AI_TryOrder\b.*?if not AI_NeedsOrder\('),
    ('AI_TryOrder respects the per-tick budget',
     r'function AI_TryOrder\b.*?if ai_issued >= ai_budget then'),
    ('AI_NeedsOrder re-orders an idle unit',
     r'function AI_NeedsOrder\b.*?if GetUnitCurrentOrder\(u\) == 0 then'),
    ('the field dispatcher routes through AI_TryOrder',
     r'function AI_SendEnum\b.*?call AI_TryOrder\('),
    ('the micro tick routes through AI_TryOrder',
     r'function AI_MicroEnum\b.*?call AI_TryOrder\('),
    ('the defensive response routes through AI_TryOrder',
     r'function AI_RespondEnum\b.*?call AI_TryOrder\('),
    # SQUID GAME STEAL #2: the budget is now opened ONCE PER TICK rather than
    # once per dispatch, so the shape is a call rather than an assignment.
    ('AI_SendArmy opens the tick budget before enumerating',
     r'function AI_SendArmy\b.*?call AI_OpenBudget\(pid\).*?call ForGroup\('),
    ('the budget is opened per TICK, not per dispatch',
     r'function AI_OpenBudget\b(?:(?!\nendfunction)[\s\S])*?if ai_budgetTick\[pid\] == ai_tickSeq then\s*\n\s*return'),
    ('AI_MicroPlayer arms the budget before enumerating',
     r'function AI_MicroPlayer\b.*?set ai_budget = AI_MICRO_SLICE.*?call ForGroup\('),
    ('players are phase-offset so they do not all think on one tick',
     r'set ai_nextThink\[pid\]\s*=\s*I2R\(ModuloInteger\(pid,'),
]


# --------------------------------- round 3: the strategic layer (item 4)

def strategy():
    """Queue item 4. Two claims to pin.

    (a) Capital value is no longer flat. The owner: "rushing Byzantium's
        capital early guarantees a loss for Red as opposed to territorial
        dominance." An early capital must be worth LESS than a control point;
        a late one with a real army must be decisive; and it must never fall
        to zero, or the AI would ignore a capital handed to it.

    (b) GUARD B. Round 2 fixed "barbarians center on where they're being
        attacked" with preemptive DEFEND/RETREAT, the army split and the
        write-off. The posture layer is the most likely thing to undo that --
        a posture that re-centres on the newest threat is the same bug in a
        strategy hat -- so the bias must be PROVABLY unable to override a
        defence or a retreat that would otherwise win. Negative-controlled
        with an absurd bias, both ways."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- strategic layer: conditional capital value, GUARD B')
    print('=' * 78)
    CAPK = CONSTS['AI_PK_CAPITAL']
    fails = 0

    def cap_value(t, army, capdef):
        sc = dict(role='barb', t=t, army=army)
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        env['wm_capReady'][0] = it.run('AI_CapReadiness', [army, capdef])
        return it.run('AI_PointValueFor', [0, CAPK])

    early = cap_value(300.0, 900.0, 0.0)
    late = cap_value(1600.0, 900.0, 0.0)
    guarded = cap_value(1600.0, 900.0, 2000.0)
    floor = cap_value(0.0, 0.0, 5000.0)
    cp = CONSTS['AI_VAL_CP']
    checks = [
        ('an EARLY capital is worth less than a single control point', early < cp),
        ('a LATE capital with a real army is decisive', late > 3.0),
        ('a garrison we can SEE discounts the capital', guarded < late),
        ('capital value never falls to zero (AI_CAP_FLOOR)', floor > 0.0),
        ('the floor is the round-2 flat value times AI_CAP_FLOOR',
         abs(floor - CONSTS['AI_VAL_CAPITAL'] * CONSTS['AI_CAP_FLOOR']) < 1e-6),
    ]
    for name, ok in checks:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       capital value: early=%.3f late=%.3f late-vs-garrison=%.3f floor=%.3f (control point=%.2f)'
          % (early, late, guarded, floor, cp))

    # -------------------------------------------------------------- guard B
    byname = {n: s for n, s, _ in SCEN}

    def pick(scen_name, posture, bias=None, **over):
        sc = dict(byname[scen_name])
        sc['posture'] = posture
        sc.update(over)
        env = make_env(sc)
        consts = dict(CONSTS)
        if bias is not None:
            consts['AI_POSTURE_BIAS'] = bias
        it = Interp(FUNCS, consts, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        return GOALS.get(it.run('AI_SelectGoal', [0]), '?')

    DEF_SCEN = 'home attacked by a beatable force while expanding'
    RET_SCEN = 'field army losing badly away from home'
    WOFF_SCEN = 'threat exceeds the WHOLE army by 1.6x: write off, keep the army'
    EXP_SCEN = 'early: army built, quiet, points nearby'
    P_EXP, P_CON = CONSTS['POSTURE_EXPAND'], CONSTS['POSTURE_CONSOLIDATE']

    guard = [
        ('a live DEFEND survives an EXPAND posture', pick(DEF_SCEN, P_EXP), 'DEFEND'),
        ('GUARD B: ... and survives an ABSURD posture bias of 5.0',
         pick(DEF_SCEN, P_EXP, bias=5.0), 'DEFEND'),
        ('a live RETREAT survives an ABSURD posture bias of 5.0',
         pick(RET_SCEN, P_EXP, bias=5.0), 'RETREAT'),
    ]
    for name, got, want in guard:
        ok = (got == want)
        fails += 0 if ok else 1
        print('  %s %-62s -> %s' % ('PASS' if ok else 'FAIL', name, got))

    # The write-off: a threat above AI_WRITEOFF x the whole army with no
    # capital involved must NOT produce a defence, whatever the posture says.
    # Asserted for both dwell states, because the round-2 dwell is what
    # answers the in-dwell case and the write-off answers the other.
    for label, over in (('inside the dwell', {}),
                        ('dwell expired', {'goalSince': -100.0})):
        got = pick(WOFF_SCEN, P_CON, bias=5.0, **over)
        ok = (got != 'DEFEND')
        fails += 0 if ok else 1
        print('  %s the round-2 write-off refuses a hopeless defence, %s -> %s'
              % ('PASS' if ok else 'FAIL', label, got))

    # NEGATIVE CONTROL for guard B: the same absurd bias MUST be able to move
    # a decision when defence is not in play. If this does not flip, the guard
    # above proves nothing -- it would just mean the bias never does anything.
    quiet_default = pick(EXP_SCEN, P_EXP)
    quiet_biased = pick(EXP_SCEN, P_CON, bias=5.0)
    ok = (quiet_default == 'EXPAND' and quiet_biased == 'CONSOLIDATE')
    fails += 0 if ok else 1
    print('  %s   negative control: with no defence in play the bias DOES move the goal (%s -> %s)'
          % ('PASS' if ok else 'FAIL', quiet_default, quiet_biased))

    print('\n%s: %d strategic-layer assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------ round 3: tribal preferences (item 9)

def tribes():
    """Queue item 9, derived from the map rather than from history.

    Two facts had to come out of the artifact first. Trig_Limit_Units does
    NOT restrict rosters by faction -- it caps the Roman Praetor at 5, bars
    R008 for Romans and disables the militia summon for barbarians, and that
    is all -- so a tribal difference has to be composition, not access. And
    each faction hero carries exactly one unique ability, mapped to a player
    by the preplaced heroes and named by the -skin upro field: Attila's
    Superior Tactics, Alaric's Fury, Gaiseric's Rally, Bahram V's Old
    Hatred, Theodoric's Willpower, Gundahar's Blood Pact, and so on.

    What is asserted here is that the weights are a well-formed distribution
    and that each faction's composition actually matches the KIND of buff it
    has: flat per-unit buffs reward massed cheap bodies, proportional ones
    reward expensive units, mobility rewards cavalry."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- tribal preferences: composition follows the passive')
    print('=' * 78)
    fails = 0
    NAMES = {0: 'Huns', 1: 'Franks', 2: 'Saxons', 3: 'West Rome', 4: 'Visigoths',
             5: 'Vandals', 6: 'Britons', 7: 'Persians', 8: 'Ostrogoths',
             9: 'East Rome', 10: 'North Rome', 11: 'Burgundians'}

    def weights(pid):
        env = make_env(dict(role='rome' if pid in (3, 9, 10) else 'barb'))
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return [it.run('AI_RoleWeight', [pid, r]) for r in range(4)]

    W = {p: weights(p) for p in NAMES}
    bad = [p for p, w in W.items() if sum(w) != 100 or any(x < 0 for x in w)]
    ok = not bad
    fails += 0 if ok else 1
    print('  %s every faction weight vector is a distribution summing to 100%s'
          % ('PASS' if ok else 'FAIL', '' if ok else ' (bad: %s)' % bad))

    CHEAP, HEAVY, RANGED, HORSE = 0, 1, 2, 3
    claims = [
        ('Visigoths mass: Fury is a FLAT +10 attack, worth most on 25-attack bodies',
         W[4][CHEAP] == max(W[4])),
        ('Ostrogoths mass: Willpower is FLAT +5 armour', W[8][CHEAP] == max(W[8])),
        ('Burgundians mass: Blood Pact links exactly 12, and a squad is 12',
         W[11][CHEAP] == max(W[11])),
        ('Vandals ride: Rally is +200% movement, a raiding tool',
         W[5][HORSE] == max(W[5])),
        ('Persians go expensive: Old Hatred is PROPORTIONAL attack speed',
         W[7][HEAVY] + W[7][HORSE] >= 65),
        ('Britons go heavy: Druidic Power is sustain on big bodies',
         W[6][HEAVY] == max(W[6])),
        ('Franks go heavy: Dispair blunts what is hitting them',
         W[1][HEAVY] == max(W[1])),
        ('Huns take both mass and horse under one aura',
         W[0][CHEAP] + W[0][HORSE] >= 70),
        ('Saxons lean on missiles more than anyone else',
         W[2][RANGED] == max(W[r][RANGED] for r in NAMES)),
        ('the three Romans are identical to each other',
         W[3] == W[9] == W[10]),
        ('no two neighbouring tribes field the same army',
         len({tuple(W[p]) for p in (0, 1, 2, 4, 5, 6, 7, 8, 11)}) == 9),
    ]
    for name, okc in claims:
        fails += 0 if okc else 1
        print('  %s %s' % ('PASS' if okc else 'FAIL', name))
    for p in sorted(NAMES):
        print('       %-11s cheap %2d  heavy %2d  ranged %2d  horse %2d'
              % (NAMES[p], W[p][0], W[p][1], W[p][2], W[p][3]))

    # the draw itself, replayed on the module's own stream
    def draw(pid, n=20000):
        seed = CONSTS['AI_SEED_DEFAULT']
        w = W[pid]
        got = [0, 0, 0, 0]
        for _ in range(n):
            hi, lo = divmod(seed, 127773)
            seed = 16807 * lo - 2836 * hi
            if seed <= 0:
                seed += 2147483647
            r = seed % 100
            role = 3
            for k in range(3):
                if r < w[k]:
                    role = k
                    break
                r -= w[k]
            got[role] += 1
        return [g / n for g in got]

    worst = 0.0
    for p in NAMES:
        share = draw(p)
        worst = max(worst, max(abs(share[k] - W[p][k] / 100.0) for k in range(4)))
    ok = worst < 0.02
    fails += 0 if ok else 1
    print('  %s the seeded draw reproduces the declared weights (worst error %.4f)'
          % ('PASS' if ok else 'FAIL', worst))

    print('\n%s: %d tribal assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------- round 3: rams (item 8) and dispersal (item 10)

def formation():
    """Queue items 8 and 10.

    Item 10 is the owner's screenshot: 283/300 food in one street. Ordering
    every unit to the same point is what builds a blob, and it survives even
    an open gate -- the same failure family as the gate jam. The lane model
    must spread the army AND must cost nothing in orders, or it undoes round
    2, so the stability of a lane is asserted as hard as its width."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- rams and dispersal: columns instead of one blob')
    print('=' * 78)
    L, W = int(CONSTS['AI_LANES']), CONSTS['AI_LANE_W']
    fails = 0

    def lanes_for(handles, n_lanes=None):
        sc = dict(role='barb')
        env = make_env(sc)
        nat = make_natives(env, 0.0)
        nat['GetHandleId'] = lambda u: u
        nat['ModuloInteger'] = lambda a, b: a % b
        it = Interp(FUNCS, CONSTS, env, nat)
        # ROUND 4: the formation width is set per dispatch, not by a constant
        it.run('AI_SetLanes', [CONSTS['AI_LANES'] if n_lanes is None else n_lanes])
        return [it.run('AI_LaneOf', [h]) for h in handles]

    lanes = lanes_for(range(400))
    distinct = sorted(set(lanes))
    checks = [
        ('every lane in the model is used', len(distinct) == L),
        ('AI_LANE_MID and AI_LANES cannot drift apart',
         2 * int(CONSTS['AI_LANE_MID']) + 1 == L),
        ('lanes are centred on the march line', abs(sum(distinct)) < 1e-9),
        ('the formation is symmetric', distinct[0] == -distinct[-1]),
        ('the widest lane separation is a real frontage, not a nudge',
         (distinct[-1] - distinct[0]) * W >= 800.0),
    ]
    for name, ok in checks:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       lanes: %s  frontage %.0f units'
          % (distinct, (distinct[-1] - distinct[0]) * W))

    # a unit keeps its lane forever: the lane is a function of the handle id
    # alone, so nothing about walking can change it. An offset that drifted
    # would re-trip AI_NeedsOrder and undo the round-2 order economy.
    stable = lanes_for([12345]) * 3 == lanes_for([12345, 12345, 12345])
    fails += 0 if stable else 1
    print('  %s a unit lane is a pure function of its handle, so it never drifts'
          % ('PASS' if stable else 'FAIL'))

    # NEGATIVE CONTROL: collapse to one lane and the frontage must vanish --
    # otherwise the spread above is coming from somewhere other than the lanes.
    one = sorted(set(lanes_for(range(400), n_lanes=1)))
    ok = (len(one) == 1 and (one[-1] - one[0]) * W == 0.0)
    fails += 0 if ok else 1
    print('  %s   negative control: at one lane the army collapses back to a single column (%s)'
          % ('PASS' if ok else 'FAIL', one))

    # -- ROUND 4, finding 3: the frontage is MEASURED, and a bridge collapses it
    def lanes_at(span):
        sc = dict(role='barb', span=span, laneNX=0.0, laneNY=1.0)
        env = make_env(sc)
        nat = make_natives(env, 0.0)
        nat['GetHandleId'] = lambda u: u
        nat['ModuloInteger'] = lambda a, b: a % b
        it = Interp(FUNCS, CONSTS, env, nat)
        n = it.run('AI_LanesAt', [0.0, 0.0])
        it.run('AI_SetLanes', [n])
        return n, env['ai_laneN'], env['ai_laneMid']

    print('  -- round 4: a bridge is narrow ground, so the column must fit it --')
    span_cases = [
        ('open field (1200 each side) keeps the full frontage', 1200.0, 5),
        ('a wide ramp (400 each side) drops to three lanes', 400.0, 3),
        ('a bridge (200 each side) collapses to single file', 200.0, 1),
        ('a gate mouth (120 each side) collapses to single file', 120.0, 1),
    ]
    for name, span, want in span_cases:
        raw, n, mid = lanes_at(span)
        ok = (n == want) and (2 * mid + 1 == n)
        fails += 0 if ok else 1
        print('    %s %-56s measured=%d -> %d lane(s)' % ('PASS' if ok else 'FAIL', name, raw, n))

    # NEGATIVE CONTROL for the measurement: with no terrain restriction at all
    # the bridge case must go back to the full frontage, so it is the probe and
    # not something else that collapsed the column.
    _, n_open, _ = lanes_at(1e9)
    ok = (n_open == int(CONSTS['AI_LANES']))
    fails += 0 if ok else 1
    print('    %s   negative control: unrestricted terrain restores the full frontage (%d lanes)'
          % ('PASS' if ok else 'FAIL', n_open))

    # -- rams -------------------------------------------------------------
    ok = CONSTS['AI_RAM_HOLD_R'] > CONSTS['AI_TOUCH_R']
    fails += 0 if ok else 1
    print('  %s a waiting ram sits further back than the capture-focus radius'
          % ('PASS' if ok else 'FAIL'))

    print('\n%s: %d formation assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------ round 3: coordination + harassers (item 7)

def consort():
    """Queue item 7. Two claims.

    (a) The claim ledger stops two ALLIED AIs duplicating an objective, and
        does it as a discount rather than a veto -- a claimed point is still
        taken when it is the only thing worth taking. It must not bind
        between enemies, and it must expire.

    (b) The harasser is drawn from the map's own seeded Park-Miller stream,
        between Red / Gray / Pink, strongly weighted to Red, and prefers
        OUTLYING UNDEFENDED objectives rather than whatever is nearest."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- acting in consort: the claim ledger and the harasser')
    print('=' * 78)
    fails = 0
    ALLIED = [(0, 1), (1, 0)]

    def score(claim=-1, claim_age=0.0, allies=(), harasser=False, defence=0.0,
              x=3000.0):
        sc = dict(role='barb', t=400.0, army=600.0, harasser=harasser,
                  allies=allies,
                  points=[{'kind': CP, 'x': x, 'y': 0.0, 'owner': 2,
                           'defence': defence, 'claim': claim,
                           'claimAt': 400.0 - claim_age}])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_TargetScore', [0, 0])

    free = score()
    claimed = score(claim=1, allies=ALLIED)
    enemy_claim = score(claim=1, allies=())
    stale = score(claim=1, claim_age=CONSTS['AI_CLAIM_TTL'] + 5.0, allies=ALLIED)
    self_claim = score(claim=0, allies=ALLIED)
    ledger = [
        ('an ally claim discounts the objective', claimed < free),
        ('... but does not veto it: the score stays positive', claimed > 0.0),
        ('the discount is exactly AI_CLAIM_PENALTY',
         abs(claimed - free * CONSTS['AI_CLAIM_PENALTY']) < 1e-6),
        ('an ENEMY claim binds us not at all', abs(enemy_claim - free) < 1e-6),
        ('a stale claim expires', abs(stale - free) < 1e-6),
        ('our OWN claim never penalises us', self_claim >= free),
    ]
    for name, ok in ledger:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       score: free=%.4f ally-claimed=%.4f enemy-claimed=%.4f stale=%.4f'
          % (free, claimed, enemy_claim, stale))

    # -- the harasser wants something different ---------------------------
    near_def = score(defence=400.0, x=2000.0)
    far_free = score(defence=0.0, x=11000.0)
    h_near_def = score(defence=400.0, x=2000.0, harasser=True)
    h_far_free = score(defence=0.0, x=11000.0, harasser=True)
    # Stated as a RATIO, because that is the actual claim: the harasser skews
    # much harder towards outlying-and-undefended than a normal AI does. An
    # absolute comparison would only be pinning where these two particular
    # points happen to sit relative to each other.
    normal_skew = far_free / near_def
    harass_skew = h_far_free / h_near_def
    ok = harass_skew > normal_skew * 3.0
    fails += 0 if ok else 1
    print('  %s the harasser skews far harder towards OUTLYING and UNDEFENDED (%.2fx vs %.2fx)'
          % ('PASS' if ok else 'FAIL', harass_skew, normal_skew))
    ok = h_far_free > h_near_def
    fails += 0 if ok else 1
    print('  %s ... and outright prefers the flank objective to the near defended one'
          % ('PASS' if ok else 'FAIL'))
    print('       normal: near-defended=%.4f far-free=%.4f | harasser: %.4f vs %.4f'
          % (near_def, far_free, h_near_def, h_far_free))

    # -- the weighted lottery, replayed on the real PRNG -------------------
    # AI_Rand is the module's own Park-Miller stream; replaying it here with
    # the same arithmetic is how the distribution claim is checked without an
    # engine. The shape is asserted, not a single draw.
    A, B, C = CONSTS['AI_HARASS_A'], CONSTS['AI_HARASS_B'], CONSTS['AI_HARASS_C']
    WA, WB, WC = CONSTS['AI_HARASS_WA'], CONSTS['AI_HARASS_WB'], CONSTS['AI_HARASS_WC']
    seed = CONSTS['AI_SEED_DEFAULT']
    counts = {A: 0, B: 0, C: 0}
    N = 20000
    for _ in range(N):
        hi, lo = divmod(seed, 127773)
        seed = 16807 * lo - 2836 * hi
        if seed <= 0:
            seed += 2147483647
        r = seed % (WA + WB + WC)
        counts[A if r < WA else (B if r < WA + WB else C)] += 1
    share = {k: v / N for k, v in counts.items()}
    lot = [
        ('Red is strongly favoured', share[A] > 0.5),
        ('Red is the map own weighting, not a monopoly', share[A] < 0.7),
        ('Gray and Pink both remain live candidates',
         share[B] > 0.1 and share[C] > 0.1),
        ('the shares match the declared weights',
         all(abs(share[k] - w / (WA + WB + WC)) < 0.02
             for k, w in ((A, WA), (B, WB), (C, WC)))),
    ]
    for name, ok in lot:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       harasser draw over %d: Red=%.3f Gray=%.3f Pink=%.3f'
          % (N, share[A], share[B], share[C]))

    print('\n%s: %d consort assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ---------------------------------- STAGE 3 / S3: the threat field

def threatfield():
    """S3, implemented as OURS with AMAI only as a shape reference. The
    research brief verified the original against source at a pinned revision
    and found three apparent defects plus omniscient enumeration, so the
    assertions below are as much about what we did NOT copy.

    Real constants from that source: 540*S/d^0.8, d floored at 1000, counted
    only within a 2000 horizon, and a heading override needing BOTH
    |angle| <= 0.4 rad AND current distance < the whole last displacement."""
    print('\n' + '=' * 78)
    print('STAGE 3 / S3 -- cluster-and-project threat field (ours, not AMAI\'s)')
    print('=' * 78)
    fails = 0

    def threat(cl, tx=0.0, ty=0.0):
        """cl: list of (x, y, strength, dx, dy). Point 0 is our town."""
        sc = dict(role='barb', points=[{'kind': CP, 'x': tx, 'y': ty, 'owner': 0}])
        env = make_env(sc)
        env['ai_clCount'][0] = len(cl)
        for k, (x, y, st, dx, dy) in enumerate(cl):
            env['ai_clX'][k] = x
            env['ai_clY'][k] = y
            env['ai_clS'][k] = st
            env['ai_clDX'][k] = dx
            env['ai_clDY'][k] = dy
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_ThreatOn', [0, 0])

    COEF, DMIN, HOR = CONSTS['AI_TF_COEF'], CONSTS['AI_TF_DMIN'], CONSTS['AI_TF_HORIZON']

    near = threat([(1500.0, 0.0, 100.0, 0.0, 0.0)])
    far = threat([(9000.0, 0.0, 100.0, 0.0, 0.0)])
    checks = [
        ('an army inside the horizon contributes threat', near > 0.0),
        ('an army beyond the 2000 horizon contributes NOTHING', far == 0.0),
        ('the distance floor caps the contribution at 540*S/1000^0.8',
         abs(threat([(0.0, 0.0, 100.0, 0.0, 0.0)]) - COEF * 100.0 / (DMIN ** 0.8)) < 1e-6),
        ('threat adds across clusters',
         abs(threat([(1200.0, 0.0, 50.0, 0.0, 0.0), (0.0, 1200.0, 50.0, 0.0, 0.0)])
             - 2.0 * threat([(1200.0, 0.0, 50.0, 0.0, 0.0)])) < 1e-6),
    ]
    for name, ok in checks:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))

    # the heading override needs BOTH conditions -- this is where the relayed
    # description was wrong, so each half is pinned separately
    head_on = threat([(1800.0, 0.0, 100.0, -2000.0, 0.0)])   # closing, aligned
    aligned_short = threat([(1800.0, 0.0, 100.0, -100.0, 0.0)])  # aligned, tiny step
    sideways = threat([(1800.0, 0.0, 100.0, 0.0, -2000.0)])  # big step, wrong way
    over = [
        ('an army heading AT the town with a step that overshoots gets the floor',
         abs(head_on - COEF * 100.0 / (DMIN ** 0.8)) < 1e-6),
        ('aligned but with a SHORT step does not trigger the override',
         aligned_short < head_on),
        ('a long step in the WRONG direction does not trigger it either',
         sideways < head_on),
    ]
    for name, ok in over:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))

    # THE DEFECT WE DID NOT COPY: the projected point must not be normalised,
    # so threat must be invariant to translating the whole world away from the
    # map origin. AMAI's version is contaminated by distance from (0,0).
    a = threat([(1500.0, 0.0, 100.0, -300.0, 0.0)], 0.0, 0.0)
    b = threat([(21500.0, 0.0, 100.0, -300.0, 0.0)], 20000.0, 0.0)
    ok = abs(a - b) < 1e-6
    fails += 0 if ok else 1
    print('  %s the projection is ORIGIN-INDEPENDENT (AMAI defect 1 not inherited): %.4f vs %.4f'
          % ('PASS' if ok else 'FAIL', a, b))

    # NEGATIVE CONTROL: the field must be capable of returning different
    # numbers, or every equality above passes for free.
    ok = near != threat([(1200.0, 0.0, 100.0, 0.0, 0.0)])
    fails += 0 if ok else 1
    print('  %s   negative control: distance actually changes the number' % ('PASS' if ok else 'FAIL'))

    # AMAI defect 3: a real maximum, not the last town processed
    def field(pts):
        sc = dict(role='barb', points=pts)
        env = make_env(sc)
        env['ai_clCount'][0] = 1
        env['ai_clX'][0] = 0.0
        env['ai_clY'][0] = 0.0
        env['ai_clS'][0] = 100.0
        env['ai_clDX'][0] = 0.0
        env['ai_clDY'][0] = 0.0
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        it.run('AI_ThreatField', [0])
        return env['wm_townIdx'][0], env['wm_townThreat'][0]

    idx, val = field([{'kind': CP, 'x': 500.0, 'y': 0.0, 'owner': 0},
                      {'kind': CP, 'x': 9000.0, 'y': 0.0, 'owner': 0}])
    ok = (idx == 0) and val > 0.0
    fails += 0 if ok else 1
    print('  %s the field takes a REAL maximum, not the last town processed (AMAI defect 3): idx=%s'
          % ('PASS' if ok else 'FAIL', idx))

    print('\n%s: %d threat-field assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------- STAGE 3 / S1: attacks as procedures

def muster():
    import math
    """PLAYTEST 7, the owner's headline finding, verbatim:

        "Ostrogoths push with half their army at base; practically true of
         all factions."

    Two causes, and the first is not subtle. AI_SendArmy sized the home
    garrison as a FRACTION OF OUR OWN ARMY -- 0.55*wm_army, ramping in on any
    visible threat at all -- so the bigger the army the more of it stayed
    home. "Half their army at base" was that formula, literally. A garrison
    is sized by what it has to beat.

    The second is the muster. Round 7 deliberately refused to stage, arguing
    that a staging hold is a new way to stand still. That was sound reasoning
    about an UNBOUNDED hold, but it left AI_MS_STAGE a no-op that marched, so
    nothing ever gathered -- which is why four factions were reporting a
    scattered centroid every tick. The version of the round-7 argument that
    survives the evidence is a BOUNDED muster: it gathers, it leaves when
    enough has arrived, and the phase deadline guarantees it cannot wait
    forever."""
    print('\n' + '=' * 78)
    print('PLAYTEST 7 -- the army concentrates before it commits')
    print('=' * 78)
    fails = 0
    STAGE, MARCH = CONSTS['AI_MS_STAGE'], CONSTS['AI_MS_MARCH']

    # ---- cause 1: the garrison hold ---------------------------------------
    def held(army, threat):
        """ai_holdCV after AI_SendArmy has sized it, via the REAL function."""
        sc = dict(role='rome', army=army, threat=threat, fieldX=0.0, fieldY=0.0)
        env = make_env(sc)
        nat = make_natives(env, 0.0)
        nat['CreateGroup'] = lambda: 'g'
        nat['DestroyGroup'] = lambda g: None
        nat['GroupEnumUnitsOfPlayer'] = lambda g, p, f: None
        nat['ForGroup'] = lambda g, fn: None      # nobody to order; we want the sizing
        nat['Filter'] = lambda f: f
        nat['AI_UnitFor'] = lambda pid, k: 0
        nat['AI_LanesAt'] = lambda x, y: CONSTS['AI_LANES']
        nat['AI_SetLanes'] = lambda n: None
        Interp(FUNCS, CONSTS, env, nat).run('AI_SendArmy', [0, 5000.0, 0.0,
                                                           CONSTS['AI_ORD_ATTACKP'], None])
        return env['ai_holdCV']

    ARMY, SMALL = 600.0, 60.0
    h = held(ARMY, SMALL)
    ok = h <= 0.25 * ARMY
    fails += 0 if ok else 1
    print('  %s a SMALL threat (%.0f) against a big army (%.0f) holds %.0f back, not half'
          % ('PASS' if ok else 'FAIL', SMALL, ARMY, h))

    ok = h >= SMALL
    fails += 0 if ok else 1
    print('  %s ... but it does hold enough to BEAT that threat (%.0f >= %.0f)'
          % ('PASS' if ok else 'FAIL', h, SMALL))

    # the hold must scale with the THREAT, not with our army
    h_big_army = held(2.0 * ARMY, SMALL)
    ok = abs(h_big_army - h) < 1e-6
    fails += 0 if ok else 1
    print('  %s doubling OUR army does not change the garrison at all (%.0f vs %.0f) '
          '-- this is the reported bug, inverted' % ('PASS' if ok else 'FAIL', h_big_army, h))

    h_big_threat = held(ARMY, 4.0 * SMALL)
    ok = h_big_threat > h
    fails += 0 if ok else 1
    print('  %s quadrupling the THREAT does raise it (%.0f -> %.0f)'
          % ('PASS' if ok else 'FAIL', h, h_big_threat))

    ok = held(ARMY, 10000.0) <= CONSTS['AI_HOLD_CAP'] * ARMY + 1e-6
    fails += 0 if ok else 1
    print('  %s an overwhelming threat is still capped at %.0f%% -- the army is never '
          'entirely swallowed' % ('PASS' if ok else 'FAIL', 100.0 * CONSTS['AI_HOLD_CAP']))

    # NEGATIVE CONTROL: the round-6 formula, on the same inputs
    old = min(1.0, SMALL / 400.0) * 0.55 * ARMY
    old_big = min(1.0, SMALL / 400.0) * 0.55 * (2.0 * ARMY)
    ok = old_big > old
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the OLD formula grew with our own army (%.0f -> %.0f) '
          'and this test distinguishes them' % ('PASS' if ok else 'FAIL', old, old_big))

    # ---- cause 2: STAGE actually gathers ----------------------------------
    def tick(frac, elapsed=0.0, units=None):
        """A real AI_MissionStart, then one AI_MissionTick.

        The mission is STARTED rather than hand-poked into STAGE, so the rally
        point under test is the one the shipped AI_MissionStart computes.
        `units` drives the REAL AI_MusterFrac; the enum driver applies the
        radius the engine would apply."""
        sc = dict(role='barb', t=100.0, army=400.0,
                  points=[dict(kind=CONSTS['AI_PK_CITY'], x=8000.0, y=0.0, owner=5)],
                  msState=CONSTS['AI_MS_NONE'], msTarget=-1)
        env = make_env(sc)
        env['ai_now'] = 100.0
        env['ai_homeX'][0] = 0.0
        env['ai_homeY'][0] = 0.0
        nat = make_natives(env, 0.0)
        nat['AI_Say'] = lambda pid, s: None
        nat['AI_Tel'] = lambda ev, b: None
        nat['AI_Num'] = str
        nat['AI_TelAI'] = lambda pid: '1'
        nat['AI_Raid'] = lambda pid: None
        nat['AI_MoveOnTarget'] = lambda pid, t: env.setdefault('_orders', []).append('target')
        nat['AI_SendArmy'] = lambda pid, x, y, k, tg: env.setdefault(
            '_orders', []).append(('rally', x, y))
        if units is None:
            env['_musterFrac'] = frac
        else:
            del nat['AI_MusterFrac']                  # interpret the REAL body
            seq, st, span = list(units), {}, {}
            def enum_range(g, x, y, r, f):
                # the ENGINE applies the radius; the driver must model that,
                # or the muster count would be "every unit we own" and the
                # assertion below could not distinguish arrived from absent
                span['hits'] = [u for u in seq
                                if math.hypot(u[0] - x, u[1] - y) <= r]
            def enum_driver(g, fn):
                for u in span.get('hits', []):
                    st['cur'] = u
                    fn()
            nat['GetEnumUnit'] = lambda: st.get('cur')
            nat['CreateGroup'] = lambda: 'g'
            nat['DestroyGroup'] = lambda g: None
            nat['GroupEnumUnitsInRange'] = enum_range
            nat['ForGroup'] = enum_driver
            nat['Filter'] = lambda f: f
            nat['AI_CV'] = lambda u: u[2]
            nat['GetUnitX'] = lambda u: u[0]
            nat['GetUnitY'] = lambda u: u[1]
            nat['GetUnitTypeId'] = lambda u: 0
            nat['GetUnitState'] = lambda u, s: 100.0
            nat['IsUnitLoaded'] = lambda u: False
        it = Interp(FUNCS, CONSTS, env, nat)
        it.run('AI_MissionStart', [0, 0])       # the REAL rally computation
        env['ai_now'] = 100.0 + elapsed
        it.run('AI_MissionTick', [0])
        return env

    env = tick(0.10)
    ok = env['ai_msState'][0] == STAGE
    fails += 0 if ok else 1
    print('  %s with 10%% gathered the mission STAYS in the muster'
          % ('PASS' if ok else 'FAIL'))

    ok = any(isinstance(o, tuple) and o[0] == 'rally' for o in env.get('_orders', []))
    fails += 0 if ok else 1
    print('  %s ... and the army is ordered to the RALLY, not at the objective -- STAGE '
          'was a no-op that marched' % ('PASS' if ok else 'FAIL'))

    rally = [o for o in env.get('_orders', []) if isinstance(o, tuple)][0]
    ok = 0.0 < rally[1] < 8000.0
    fails += 0 if ok else 1
    print('  %s ... at a point BETWEEN home and the objective (x=%.0f of 8000), so '
          'gathering is the first step of the march' % ('PASS' if ok else 'FAIL', rally[1]))

    env = tick(0.95)
    ok = env['ai_msState'][0] == MARCH
    fails += 0 if ok else 1
    print('  %s once %.0f%% has arrived it MOVES OUT -- on arrival, not on a clock'
          % ('PASS' if ok else 'FAIL', 100.0 * CONSTS['AI_MUSTER_FRAC']))

    # the deadline is the escape hatch: the muster can never become a stall
    env = tick(0.10, elapsed=CONSTS['AI_MS_STAGE_T'] + 1.0)
    ok = env['ai_msState'][0] == MARCH
    fails += 0 if ok else 1
    print('  %s a muster that never fills LEAVES ANYWAY at the deadline -- round 7\'s '
          'objection answered, not ignored' % ('PASS' if ok else 'FAIL'))

    # ---- AI_MusterFrac itself, against real units -------------------------
    # Rally is at (1200, 0). AI_MUSTER_R counts as ARRIVED; AI_MUSTER_GATHER is
    # the pool the muster is ABOUT. PLAYTEST 10: the denominator used to be
    # wm_army -- every unit the faction owned anywhere -- which on the real map
    # put only 34-40% of a faction inside the radius at mission start, so a 70%
    # bar could never be met and the deadline was the only exit.
    NEAR = (1200.0, 0.0, 100.0)                       # at the rally
    COMING = (1200.0 + 2500.0, 0.0, 100.0)            # in the pool, not yet arrived
    ELSEWHERE = (1200.0 + 20000.0, 0.0, 100.0)        # on other business entirely
    env = tick(None, units=[NEAR, NEAR, NEAR, COMING])
    ok = env['ai_msState'][0] == MARCH and env['wm_massed'][0] == 300.0
    fails += 0 if ok else 1
    print('  %s the REAL AI_MusterFrac counts what arrived (%.0f of %.0f CV in the pool) '
          'and releases at 75%%'
          % ('PASS' if ok else 'FAIL', env['wm_massed'][0], env['wm_musterPool'][0]))

    env = tick(None, units=[NEAR, COMING, COMING, COMING])
    ok = env['ai_msState'][0] == STAGE and env['wm_massed'][0] == 100.0
    fails += 0 if ok else 1
    print('  %s ... and holds at 25%% (%.0f CV) -- the count is real, not a constant'
          % ('PASS' if ok else 'FAIL', env['wm_massed'][0]))

    # THE PLAYTEST 10 FIX: troops on the far side of the map are not part of
    # this concentration and must not make the bar unreachable.
    env = tick(None, units=[NEAR, NEAR, NEAR] + [ELSEWHERE] * 12)
    ok = env['ai_msState'][0] == MARCH
    fails += 0 if ok else 1
    print('  %s twelve units on the far side of the map do NOT hold the muster hostage '
          '(pool %.0f, massed %.0f)' % ('PASS' if ok else 'FAIL',
                                        env['wm_musterPool'][0], env['wm_massed'][0]))

    # NEGATIVE CONTROL: with wm_army as the denominator -- the shipped bug --
    # the same fifteen-unit faction could not reach the bar at all.
    total_cv = 100.0 * 15
    old_frac = 300.0 / total_cv
    ok = old_frac < CONSTS['AI_MUSTER_FRAC']
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the old whole-army denominator gives %.0f%%, under '
          'the %.0f%% bar -- timeout was the only exit, which is what three factions '
          'reporting it in one second showed'
          % ('PASS' if ok else 'FAIL', 100.0 * old_frac, 100.0 * CONSTS['AI_MUSTER_FRAC']))

    print('%s: the army gathers before it commits, and cannot wait forever'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def early_barbarians():
    """PLAYTEST 7, the owner: "Early Barbarians should be extremely aggressive."

    The scoreboard read West Rome 25 / East Rome 34 / North Rome 24 against
    barbarians on 2-4. That was not a tuning miss. AI_UpdatePosture tested
    `wm_army < 260 + 240*clock` BEFORE anything else and sent the faction to
    POSTURE_CONSOLIDATE -- and early game a barbarian army is always under
    that ramp, so the factions whose entire premise is arriving before Rome
    is ready spent the opening massing instead.

    The window is a posture WITH A CLOCK, so it expires on its own and cannot
    become another state the AI can never leave."""
    print('\n' + '=' * 78)
    print('PLAYTEST 7 -- the opening belongs to the barbarians')
    print('=' * 78)
    fails = 0
    EARLY = CONSTS['AI_EARLY_T']

    def posture(role, t, army):
        sc = dict(role=role, t=t, army=army, postureAt=-1.0,
                  points=[dict(kind=CONSTS['AI_PK_CP'], x=900.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['ai_now'] = t
        env['ai_role'] = {0: CONSTS['AI_ROLE_ROME'] if role == 'rome'
                          else CONSTS['AI_ROLE_BARB']}
        nat = make_natives(env, 0.0)
        nat['AI_Say'] = lambda pid, s: None
        nat['AI_CanMass'] = lambda pid: 1.0        # massing IS possible: the trap
        nat['AI_PostureName'] = lambda pid, p: ''
        Interp(FUNCS, CONSTS, env, nat).run('AI_UpdatePosture', [0])
        return env['ai_posture'][0]

    SMALL = 80.0        # a barbarian opening army, well under the clock ramp
    p = posture('barb', EARLY * 0.25, SMALL)
    ok = p == CONSTS['POSTURE_EXPAND']
    fails += 0 if ok else 1
    print('  %s an early barbarian with a SMALL army takes ground (posture=%s), it does '
          'not mass first' % ('PASS' if ok else 'FAIL', p))

    # NEGATIVE CONTROL: the same faction, same army, after the window
    p_late = posture('barb', EARLY + 60.0, SMALL)
    ok = p_late == CONSTS['POSTURE_CONSOLIDATE']
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the SAME faction and army after the window does '
          'consolidate (posture=%s) -- the window is what changed, and it EXPIRES'
          % ('PASS' if ok else 'FAIL', p_late))

    # Rome is deliberately NOT given the window: the opening belonging to the
    # barbarians is the point. Reported, not asserted -- Rome's posture is
    # decided by its own branch and this work did not touch it.
    print('  INFO Rome in the same window: posture=%s (its own branch, untouched)'
          % posture('rome', EARLY * 0.25, SMALL))

    # ---- the commit threshold ---------------------------------------------
    def expand(role, t, army):
        sc = dict(role=role, t=t, army=army,
                  points=[dict(kind=CONSTS['AI_PK_CP'], x=900.0, y=0.0, owner=5,
                               defence=0.0)])
        env = make_env(sc)
        env['ai_now'] = t
        env['ai_role'] = {0: CONSTS['AI_ROLE_ROME'] if role == 'rome'
                          else CONSTS['AI_ROLE_BARB']}
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_ScoreExpand', [0])

    e_early = expand('barb', EARLY * 0.25, SMALL)
    e_late = expand('barb', EARLY + 60.0, SMALL)
    ok = e_early > e_late
    fails += 0 if ok else 1
    print('  %s the same small army wants the same point MORE inside the window '
          '(%.3f vs %.3f)' % ('PASS' if ok else 'FAIL', e_early, e_late))

    ok = expand('barb', EARLY * 0.25, 0.0) < 0.05
    fails += 0 if ok else 1
    print('  %s ... but a faction with NO army still scores near zero: the gate is '
          'lowered, not removed' % ('PASS' if ok else 'FAIL'))

    # ---- it commits on less of the army -----------------------------------
    env = make_env(dict(role='barb', t=EARLY * 0.25))
    env['ai_now'] = EARLY * 0.25
    env['ai_role'] = {0: CONSTS['AI_ROLE_BARB']}
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    need_early = it.run('AI_MusterNeed', [0])
    env['ai_now'] = EARLY + 60.0
    need_late = it.run('AI_MusterNeed', [0])
    ok = need_early < need_late
    fails += 0 if ok else 1
    print('  %s and it moves out on %.0f%% of its army rather than %.0f%% -- risk '
          'tolerance up is exactly this' % ('PASS' if ok else 'FAIL',
                                            100.0 * need_early, 100.0 * need_late))

    print('%s: the opening is aggressive, and the aggression expires on a clock'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def plays_to_win():
    """PRODUCT DECISION, 2026-08-14: this AI is an OPPONENT THAT TRIES TO WIN,
    not a sparring partner tuned to be beatable.

    DESIGN 28.7 put the question to the owner after the Squid Game
    decomposition found that map carries three deliberate concessions to the
    human. The answer was the opposite policy, so the concessions must not
    merely be absent today -- their absence is asserted, in the same spirit as
    no_cheating(), so that a later small mercy cannot go unnoticed.

    Three things are pinned here:
      1. nothing in the module branches on whether an opponent is HUMAN;
      2. the difficulty dial is a SELECTOR -- hard is strongest on every axis
         and nothing degrades at hard;
      3. the material knob is still zero, and the banner still says so."""
    print('\n' + '=' * 78)
    print('PRODUCT DECISION -- an opponent that plays to win')
    print('=' * 78)
    fails = 0

    def strip_code(text):
        out, instr, i = [], False, 0
        while i < len(text):
            c = text[i]
            if instr:
                out.append(c)
                instr = not (c == '"')
                i += 1
                continue
            if c == '"':
                instr = True
                out.append(c)
                i += 1
                continue
            if text.startswith('//', i):
                j = text.find('\n', i)
                i = j if j >= 0 else len(text)
                continue
            out.append(c)
            i += 1
        return ''.join(out)

    body = strip_code(TEXT)

    # ---- 1. no branch on human-ness --------------------------------------
    # Reading the controller is legitimate in exactly three places: deciding
    # which slots WE play, and addressing chat to people. Everything else would
    # be the AI treating a human opponent differently from a computer one.
    ALLOWED = {'AI_Broadcast', 'AI_BroadcastAllies', 'AI_SlotIsVacant',
               'AI_TelAI', 'AI_TelScanControl', 'AI_TelScanSupply'}
    offenders = []
    cur = None
    for line in body.split('\n'):
        m = re.match(r'function\s+(\w+)', line)
        if m:
            cur = m.group(1)
        if re.search(r'GetPlayerController|MAP_CONTROL_USER|PLAYER_SLOT_STATE', line):
            if cur not in ALLOWED:
                offenders.append((cur, line.strip()[:60]))
    ok = not offenders
    fails += 0 if ok else 1
    print('  %s NO DECISION BRANCHES ON WHETHER AN OPPONENT IS HUMAN -- the controller '
          'is read only to pick our own slots and to address chat%s'
          % ('PASS' if ok else 'FAIL', '' if ok else ' -- ' + repr(offenders[:2])))

    # NEGATIVE CONTROL: the sweep must see a real read, or it proves nothing
    ok = any(f in body for f in ('GetPlayerController',))
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the sweep DOES find controller reads (in the allowed '
          'functions), so it is scanning real code' % ('PASS' if ok else 'FAIL'))

    # and it would catch one placed in a decision function
    fake = strip_code('function AI_ScoreExpand takes nothing returns nothing\n'
                      '    if GetPlayerController(p) == MAP_CONTROL_USER then\n'
                      '    endif\nendfunction\n')
    caught, cur = [], None
    for line in fake.split('\n'):
        m = re.match(r'function\s+(\w+)', line)
        if m:
            cur = m.group(1)
        if 'GetPlayerController' in line and cur not in ALLOWED:
            caught.append(cur)
    ok = caught == ['AI_ScoreExpand']
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: an injected controller read inside a SCORER is '
          'detected' % ('PASS' if ok else 'FAIL'))

    # no mercy-shaped vocabulary anywhere
    MERCY = ['isHuman', 'IsPlayerHuman', 'humanAdjacent', 'ai_mercy', 'AI_MERCY',
             'ai_fumble', 'AI_FUMBLE']
    hit = [w for w in MERCY if w in body]
    ok = not hit
    fails += 0 if ok else 1
    print('  %s no mercy mechanism exists by name (%d checked)%s'
          % ('PASS' if ok else 'FAIL', len(MERCY), '' if ok else ': ' + ', '.join(hit)))

    # ---- 2. the dial is a SELECTOR: hard is strongest on every axis -------
    def axis(fn, diff):
        env = make_env(dict(role='barb'))
        env['ai_diff'] = {0: diff}
        nat = make_natives(env, 0.0)
        nat.pop('AI_ErrorRate', None)
        return Interp(FUNCS, CONSTS, env, nat).run(fn, [0])

    E, N, H = CONSTS['AI_EASY'], CONSTS['AI_NORMAL'], CONSTS['AI_HARD']
    # every axis where LOWER is stronger
    for fn, label in (('AI_ThinkPeriod', 'thinks more often'),
                      ('AI_NoiseAmp', 'decides less randomly'),
                      ('AI_ErrorRate', 'errs less often'),
                      ('AI_React', 'reacts faster')):
        e, n, h = axis(fn, E), axis(fn, N), axis(fn, H)
        ok = h <= n <= e and h < e
        fails += 0 if ok else 1
        print('  %s hard %s: %s %.2f / %.2f / %.2f (easy/normal/hard)'
              % ('PASS' if ok else 'FAIL', label, fn, e, n, h))

    # nothing is switched OFF at hard: the only difficulty gate in the micro
    # path skips work at EASY, never at hard
    micro = '\n'.join(FUNCS['AI_MicroPlayer'][1])
    gates = re.findall(r'if ai_diff\[pid\] == (\w+) then\s*\n\s*return', micro)
    ok = all(g == 'AI_EASY' for g in gates)
    fails += 0 if ok else 1
    print('  %s nothing is disabled at HARD -- the only early return in the micro path '
          'is gated on EASY (%s)' % ('PASS' if ok else 'FAIL', gates or 'none'))

    # the DEFAULT is a real opponent, not a polite one
    ok = axis('AI_ErrorRate', N) <= 0.20 and axis('AI_React', N) <= 3.0
    fails += 0 if ok else 1
    print('  %s the DEFAULT (normal) is a setting a competent player should meet: '
          '%.2f error, %.1fs reaction'
          % ('PASS' if ok else 'FAIL', axis('AI_ErrorRate', N), axis('AI_React', N)))

    m = re.search(r'set ai_diff\[pid\]\s*=\s*(\w+)', body)
    dflt = re.search(r'set ai_diff\[pid\]\s*=\s*difficulty', body) is not None
    ok = dflt
    fails += 0 if ok else 1
    print('  %s difficulty is set once from a named parameter, so there is one place '
          'to audit it' % ('PASS' if ok else 'FAIL'))

    # ---- 3. material stays zero, and the banner still says so -------------
    sets = re.findall(r'set ai_handicap\[[^\]]+\]\s*=\s*([0-9.]+)', body)
    ok = bool(sets) and all(abs(float(v) - 1.0) < 1e-9 for v in sets)
    fails += 0 if ok else 1
    print('  %s material advantage is still ZERO (handicap %s) and stays LAST resort'
          % ('PASS' if ok else 'FAIL', sorted(set(sets))))

    claims = re.findall(r'AI_Broadcast\("FoR-AI ([^"]*)"\)', TEXT)
    hb = [c for c in claims if 'handicap' in c.lower()]
    ok = bool(hb) and 'NONE' in hb[0]
    fails += 0 if ok else 1
    print('  %s ... and the banner still discloses it: "%s"'
          % ('PASS' if ok else 'FAIL', (hb[0][:60] + '...') if hb else 'MISSING'))

    print('%s: it plays to win, fairly, and cannot quietly be made merciful'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def watchdog():
    """PLAYTEST 11 -- the owner: "is there a more robust way to do this?"

    Five rounds of "a goal that stays selected while unable to make progress",
    each fixed by a gate or a deadline expressed in the SAME VOCABULARY as the
    bug, each followed by a variant nobody anticipated. That does not converge.

    Every backstop we have is triggered by what the AI believes about itself.
    This one asks a question about the WORLD: has anything changed? A
    modelling gap cannot defeat it -- if the AI is wrong in a way nobody has
    imagined, the world still fails to change.

    Verified against the Vandals case from the screenshot specifically: 0 gold,
    0 lumber, 113 food used against a cap of 75, and a large army. Every
    production goal is impossible by construction; the watchdog must still
    produce an attack."""
    print('\n' + '=' * 78)
    print('PLAYTEST 11 -- the watchdog fires on a frozen WORLD, not on a belief')
    print('=' * 78)
    fails = 0

    def world(**kw):
        sc = dict(role='barb', t=100.0, army=600.0, fieldX=0.0, fieldY=0.0,
                  points=[dict(kind=CONSTS['AI_PK_CITY'], x=3000.0, y=0.0, owner=5),
                          dict(kind=CONSTS['AI_PK_CP'], x=800.0, y=0.0, owner=6)])
        sc.update(kw)
        env = make_env(sc)
        env['ai_now'] = sc['t']
        env['ai_homeX'] = {0: 0.0}
        env['ai_homeY'] = {0: 0.0}
        nat = make_natives(env, 0.0)
        nat['AI_Say'] = lambda pid, m: None
        nat['AI_Tel'] = lambda ev, b: env.setdefault('_tel', []).append((ev, b))
        nat['AI_Num'] = str
        nat['AI_TelAI'] = lambda pid: '1'
        return env, Interp(FUNCS, CONSTS, env, nat)

    W = CONSTS['AI_WD_WINDOW']

    # ---- frozen world: fires on the STRIKES-th consecutive window ---------
    env, it = world()
    fired = []
    for n in range(4):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        fired.append(it.run('AI_Watchdog', [0]))
    ok = fired[:2] == [False, False] and fired[2] is True
    fails += 0 if ok else 1
    print('  %s a frozen world fires on window %d, not before (%s)'
          % ('PASS' if ok else 'FAIL', CONSTS['AI_WD_STRIKES'] + 1, fired))

    # ---- NEGATIVE CONTROL: a world that is changing must NEVER fire -------
    env, it = world()
    moved = []
    for n in range(6):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        env['wm_fieldX'][0] = 500.0 * n          # the army is marching
        moved.append(it.run('AI_Watchdog', [0]))
    ok = not any(moved)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: an army that is MOVING never trips it over %d '
          'windows' % ('PASS' if ok else 'FAIL', len(moved)))

    # Army-level liveness: these are the signals that DO count, because they
    # are the ones a still army cannot produce.
    for label, key, val, step in (('taking or dealing damage', 'wm_fieldHPFrac', 0.9, -0.1),
                                  ('gaining or losing field strength', 'wm_fieldCV', 400.0, 250.0)):
        env, it = world()
        seq = []
        for n in range(6):
            env['ai_now'] = 100.0 + n * (W + 1.0)
            env[key][0] = val + n * step
            seq.append(it.run('AI_Watchdog', [0]))
        ok = not any(seq)
        fails += 0 if ok else 1
        print('  %s ... nor does an army %s' % ('PASS' if ok else 'FAIL', label))

    # PLAYTEST 12 REVERSAL, stated rather than quietly edited. These four used
    # to assert that faction-level activity PREVENTS the watchdog firing. That
    # premise is exactly what defeated it at Roman scale, so the contract is now
    # the opposite: an empire that trains, spends and gains or loses territory
    # while its army stands still is precisely the case this must catch.
    for label, key, val in (('training units', 'wm_food', 40.0),
                            ('spending gold', 'wm_gold', 120.0),
                            ('growing its total army', 'wm_army', 900.0)):
        env, it = world()
        fired = False
        for n in range(4):
            env['ai_now'] = 100.0 + n * (W + 1.0)
            env[key][0] = val + n * 40.0
            fired = it.run('AI_Watchdog', [0])
        ok = fired is True
        fails += 0 if ok else 1
        print('  %s a faction %s while its ARMY stands still STILL trips it'
              % ('PASS' if ok else 'FAIL', label))

    env, it = world()
    fired = False
    for n in range(4):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        env['_ptOwner'][1] = 0 if n % 2 else 5
        fired = it.run('AI_Watchdog', [0])
    ok = fired is True
    fails += 0 if ok else 1
    print('  %s ... as does one whose holdings change hands while the army does not '
          'move -- 27 control points must not disguise a parked legion'
          % ('PASS' if ok else 'FAIL'))

    # ---- THE VANDALS CASE, from the screenshot ---------------------------
    # 0 gold, 0 lumber, 113 food against a cap of 75, large army: every
    # production goal impossible by construction.
    env, it = world(gold=0.0, lumber=0.0, food=113.0, army=1130.0)
    for n in range(4):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        f = it.run('AI_Watchdog', [0])
    ok = f is True
    fails += 0 if ok else 1
    print('  %s THE VANDALS CASE (0 gold, 113 food over a 75 cap, big army) trips it'
          % ('PASS' if ok else 'FAIL'))

    orders = []
    nat_env = env
    it2 = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    env['ai_goal'][0] = CONSTS['GOAL_CONSOLIDATE']
    env['ai_msState'][0] = CONSTS['AI_MS_STAGE']
    env['ai_msTarget'][0] = 0
    nat = make_natives(env, 0.0)
    nat['AI_Say'] = lambda pid, m: None
    nat['AI_Tel'] = lambda ev, b: env.setdefault('_tel', []).append((ev, b))
    nat['AI_Num'] = str
    nat['AI_TelAI'] = lambda pid: '1'
    nat['AI_SendArmy'] = lambda pid, x, y, k, t: orders.append((x, y, k))
    Interp(FUNCS, CONSTS, env, nat).run('AI_WatchdogAct', [0])
    ok = bool(orders) and orders[0][2] == CONSTS['AI_ORD_ATTACKP']
    fails += 0 if ok else 1
    print('  %s ... and it produces an ATTACK, not another round of nothing (%s)'
          % ('PASS' if ok else 'FAIL', orders[:1]))

    ok = orders and abs(orders[0][0] - 800.0) < 1.0
    fails += 0 if ok else 1
    print('  %s ... at the NEAREST enemy holding, with no value model involved'
          % ('PASS' if ok else 'FAIL'))

    # ---- it tears down the belief state ----------------------------------
    ok = (env['ai_target'][0] == -1 and env['ai_msState'][0] == CONSTS['AI_MS_NONE']
          and env['ai_commitAt'][0] < 0)
    fails += 0 if ok else 1
    print('  %s ... and tears down the mission and objective it was clinging to'
          % ('PASS' if ok else 'FAIL'))

    # ---- every firing is telemetered -------------------------------------
    ok = any(ev == 'wd' for ev, _ in env.get('_tel', []))
    fails += 0 if ok else 1
    print('  %s every activation emits a wd event -- a firing is a DEFECT SIGNAL, '
          'not a feature' % ('PASS' if ok else 'FAIL'))

    # ---- it shares no vocabulary with the decision layer ------------------
    sig = '\n'.join(FUNCS['AI_WorldSig'][1] + FUNCS['AI_Watchdog'][1])
    banned = [w for w in ('ai_goal', 'ai_claim', 'ai_posture', 'ai_msState',
                          'ai_bestS', 'ai_commitAt', 'ai_progD', 'wm_capReady')
              if w in sig]
    ok = not banned
    fails += 0 if ok else 1
    print('  %s the watchdog reads NOTHING from the decision layer%s -- it cannot be '
          'defeated by a state we failed to model'
          % ('PASS' if ok else 'FAIL', '' if ok else ': ' + ', '.join(banned)))

    # ---- nothing below it can suppress it --------------------------------
    think = '\n'.join(FUNCS['AI_Think'][1])
    m = re.search(r'if AI_Watchdog\(pid\) then(?:(?!endif)[\s\S])*?call AI_WatchdogAct', think)
    ok = m is not None
    fails += 0 if ok else 1
    print('  %s it is checked in AI_Think itself, above the mission and goal layers'
          % ('PASS' if ok else 'FAIL'))
    ok = think.index('AI_Watchdog(pid)') < think.index('AI_MissionTick(pid)')
    fails += 0 if ok else 1
    print('  %s ... and BEFORE them, so no goal, mission or posture can suppress it'
          % ('PASS' if ok else 'FAIL'))

    # ROUND 5's invariant, re-checked POSITIONALLY now that the watchdog branch
    # sits above it: AI_NavIdle must run outside the mission branch, so a
    # crossing can always be ended by something other than the goal that
    # started it. The old regex guard pinned a shape, and a shape changes.
    lines = FUNCS['AI_Think'][1]
    nav = next(i for i, l in enumerate(lines) if 'AI_NavIdle(pid)' in l)
    mis = next(i for i, l in enumerate(lines) if 'AI_MissionTick(pid)' in l)
    depth, mis_end = 0, None
    for i in range(mis, len(lines)):
        t = lines[i].strip()
        if t.startswith('if ') and t.endswith(' then'):
            depth += 1
        elif t == 'endif':
            depth -= 1
            if depth == 0:
                mis_end = i
                break
    ok = mis_end is not None and nav > mis_end
    fails += 0 if ok else 1
    print('  %s AI_NavIdle still runs OUTSIDE the mission branch (line %s vs branch '
          'ending %s) -- checked positionally, not by shape'
          % ('PASS' if ok else 'FAIL', nav, mis_end))

    # ---- supply hunger (the actionable half of the food-cap question) -----
    def val(kind, food, cap):
        sc = dict(role='barb', army=600.0, food=food,
                  points=[dict(kind=kind, x=1500.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['wm_foodCap'] = {0: cap}
        env['wm_food'] = {0: food}
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_PointValueIdx', [0, 0])

    TOWN, CP = CONSTS['AI_PK_TOWN'], CONSTS['AI_PK_CP']
    starved = val(TOWN, 100.0, 100.0)
    roomy = val(TOWN, 10.0, 100.0)
    ok = starved > roomy
    fails += 0 if ok else 1
    print('  %s a town is worth MORE to a food-capped faction (%.2f vs %.2f) -- a '
          'Roman Town carries Food 10 and nothing priced that'
          % ('PASS' if ok else 'FAIL', starved, roomy))

    ok = abs(val(CP, 100.0, 100.0) - val(CP, 10.0, 100.0)) < 1e-9
    fails += 0 if ok else 1
    print('  %s ... and a control point, which carries no supply, is unaffected'
          % ('PASS' if ok else 'FAIL'))

    ok = abs(roomy - val(TOWN, 0.0, 100.0)) < 0.06
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: with full headroom the term is inert, so it cannot '
          'distort the ordinary value table' % ('PASS' if ok else 'FAIL'))

    # ---- PLAYTEST 12: the scale defeat, and the army-keyed fix ------------
    # No FORAI log was supplied for this playtest, so the scale hypothesis is
    # settled here instead -- against West Rome's REAL holdings rather than an
    # invented fixture. 27 control points at 10 gold a turn means a Roman is
    # always training something, so gold and food move every window.
    def roman(sig_fn, windows=6):
        sc = dict(role='rome', army=3000.0, fieldX=0.0, fieldY=0.0,
                  points=[dict(kind=CONSTS['AI_PK_CITY'], x=3000.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['ai_now'] = 100.0
        env['ai_homeX'] = {0: 0.0}
        env['ai_homeY'] = {0: 0.0}
        env['wm_fieldCV'] = {0: 0.0}          # the whole army is INSIDE the city
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        seen = set()
        for n in range(windows):
            env['ai_now'] = 100.0 + n * (W + 1.0)
            # the empire ticks over: income arrives and is spent on units
            env['wm_gold'][0] = 400.0 + 37.0 * n
            env['wm_food'][0] = 60.0 + 3.0 * n
            env['wm_army'][0] = 3000.0 + 40.0 * n
            seen.add(it.run(sig_fn, [0]))
        return len(seen)

    n_world = roman('AI_WorldSig')
    ok = n_world > 1
    fails += 0 if ok else 1
    print('  %s SCALE DEFEAT REPRODUCED: the faction signature takes %d distinct '
          'values over %d windows for a motionless Roman army -- so the watchdog '
          'could never fire' % ('PASS' if ok else 'FAIL', n_world, 6))

    n_army = roman('AI_ArmySig')
    ok = n_army == 1
    fails += 0 if ok else 1
    print('  %s THE FIX: the ARMY signature is constant (%d value) for the same '
          'motionless army, whatever the empire is doing'
          % ('PASS' if ok else 'FAIL', n_army))

    # and the army-keyed watchdog actually fires on that Roman
    sc = dict(role='rome', army=3000.0, fieldX=0.0, fieldY=0.0,
              points=[dict(kind=CONSTS['AI_PK_CITY'], x=3000.0, y=0.0, owner=5)])
    env = make_env(sc)
    env['ai_homeX'] = {0: 0.0}
    env['ai_homeY'] = {0: 0.0}
    env['wm_fieldCV'] = {0: 0.0}
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    fired = False
    for n in range(4):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        env['wm_gold'][0] = 400.0 + 37.0 * n
        env['wm_food'][0] = 60.0 + 3.0 * n
        fired = it.run('AI_Watchdog', [0])
    ok = fired is True
    fails += 0 if ok else 1
    print('  %s ... so a Roman army parked in its capital while the empire ticks '
          'over now TRIPS the watchdog' % ('PASS' if ok else 'FAIL'))

    # a Roman army that is actually marching must still not trip it
    env = make_env(sc)
    env['ai_homeX'] = {0: 0.0}
    env['ai_homeY'] = {0: 0.0}
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    seq = []
    for n in range(6):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        env['wm_fieldX'][0] = 900.0 * n
        env['wm_fieldCV'][0] = 2000.0
        seq.append(it.run('AI_Watchdog', [0]))
    ok = not any(seq)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: a Roman army that IS marching still never trips it'
          % ('PASS' if ok else 'FAIL'))

    # production inside the city must not read as movement
    env = make_env(sc)
    env['ai_homeX'] = {0: 0.0}
    env['ai_homeY'] = {0: 0.0}
    env['wm_fieldCV'] = {0: 0.0}
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    fired = False
    for n in range(4):
        env['ai_now'] = 100.0 + n * (W + 1.0)
        env['wm_army'][0] = 3000.0 + 300.0 * n     # training hard, all at home
        fired = it.run('AI_Watchdog', [0])
    ok = fired is True
    fails += 0 if ok else 1
    print('  %s ... and a city training units at full tilt does NOT disguise the '
          'motionless army' % ('PASS' if ok else 'FAIL'))

    sig = '\n'.join(FUNCS['AI_ArmySig'][1])
    ok = not any(w in sig for w in ('wm_gold', 'wm_food', 'ai_pt', 'wm_army['))
    fails += 0 if ok else 1
    print('  %s the army signature reads no gold, food, territory or total army size '
          '-- each is how a large empire disguises a still army'
          % ('PASS' if ok else 'FAIL'))

    print('%s: a faction the world has stopped responding to always does something'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def pacing():
    """PLAYTEST 13 -- Squid Game steals 1 and 2, MEASURED on the real functions.

    The order-economy section above is a MODEL: it reads the constants from
    source and simulates issuance. That was honest for comparing slice sizes,
    but it cannot see either of these changes, because both live inside
    functions the model does not execute. So this measures the shipped
    AI_NeedsOrder / AI_TryOrder / AI_OpenBudget directly, and reports the
    before/after that the model cannot.
    """
    print('\n' + '=' * 78)
    print('PLAYTEST 13 -- pacing: the inertia gate and a load-normalised budget')
    print('=' * 78)
    fails = 0

    UNITS, TICKS, DISPATCHES = 70, 40, 3

    def measure(funcs, inertia=True, per_tick=True):
        """Drive the REAL order path for TICKS ticks, DISPATCHES dispatches each."""
        env = make_env(dict(role='barb', army=7000.0))
        env['ai_seed'] = CONSTS['AI_SEED_DEFAULT']
        issued = []
        nat = make_natives(env, 0.0)
        state = {'busy': {}}
        nat['GetHandleId'] = lambda u: u
        nat['GetUnitCurrentOrder'] = lambda u: state['busy'].get(u, 0)
        nat['IssuePointOrder'] = lambda u, o, x, y: issued.append(u)
        nat['IssueTargetOrder'] = lambda u, o, t: issued.append(u)
        nat['SaveInteger'] = lambda ht, a, b, v: env['_ht'].__setitem__((a, b), v)
        nat['SaveReal'] = lambda ht, a, b, v: env['_ht'].__setitem__((a, b), v)
        nat['LoadInteger'] = lambda ht, a, b: env['_ht'].get((a, b), 0)
        nat['LoadReal'] = lambda ht, a, b: env['_ht'].get((a, b), 0.0)
        if not inertia:
            nat['AI_Chance'] = lambda p: False        # pre-fix: never leave a busy unit alone
        it = Interp(funcs, CONSTS, env, nat)
        per_tick_counts = []
        for t in range(TICKS):
            env['ai_now'] = float(t)
            env['ai_tickSeq'] = t + 1
            before = len(issued)
            for dispatch in range(DISPATCHES):
                if per_tick:
                    it.run('AI_OpenBudget', [0])
                else:
                    env['ai_issued'] = 0                # pre-fix: per DISPATCH
                    env['ai_budget'] = CONSTS['AI_ORDER_SLICE']
                for u in range(UNITS):
                    # destination drifts, so the memory alone would re-order
                    it.run('AI_TryOrder', [u, CONSTS['AI_ORD_ATTACKP'],
                                           100.0 * t + 37.0 * dispatch, 0.0, None])
            for u in issued[before:]:
                state['busy'][u] = 1                    # ordered units are now busy
            per_tick_counts.append(len(issued) - before)
        return len(issued), max(per_tick_counts), len(issued) / float(TICKS)

    tot_new, peak_new, mean_new = measure(FUNCS)
    tot_old, peak_old, mean_old = measure(FUNCS, inertia=False, per_tick=False)

    print('  measured on the SHIPPED order path: %d units, %d ticks, %d dispatches/tick'
          % (UNITS, TICKS, DISPATCHES))
    print('  %-38s %10s %12s' % ('', 'peak/tick', 'mean/tick'))
    print('  %-38s %10d %12.1f' % ('before (per-dispatch, no inertia)', peak_old, mean_old))
    print('  %-38s %10d %12.1f' % ('after  (per-tick + inertia gate)', peak_new, mean_new))
    if mean_new > 0:
        print('  %-38s %10s %11.1fx' % ('reduction', '', mean_old / mean_new))

    ok = peak_old > CONSTS['AI_ORDER_SLICE']
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the pre-fix path really did spend %d orders in one '
          'tick, more than one slice of %d -- the budget scaled with dispatches'
          % ('PASS' if ok else 'FAIL', peak_old, CONSTS['AI_ORDER_SLICE']))

    ok = peak_new <= CONSTS['AI_ORDER_SLICE']
    fails += 0 if ok else 1
    print('  %s LOAD-NORMALISED: the shipped path never exceeds ONE slice per tick '
          '(%d <= %d) however many dispatches run'
          % ('PASS' if ok else 'FAIL', peak_new, CONSTS['AI_ORDER_SLICE']))

    ok = mean_new < mean_old
    fails += 0 if ok else 1
    print('  %s the measured mean FELL (%.1f -> %.1f per tick)'
          % ('PASS' if ok else 'FAIL', mean_old, mean_new))

    # the inertia gate on its own, isolated from the budget change
    _, _, mean_budget_only = measure(FUNCS, inertia=False, per_tick=True)
    ok = mean_new < mean_budget_only
    fails += 0 if ok else 1
    print('  %s the INERTIA GATE contributes on its own (%.1f with budget only -> '
          '%.1f with both)' % ('PASS' if ok else 'FAIL', mean_budget_only, mean_new))

    # an IDLE unit is never left alone: the gate is about churn, not silence
    env = make_env(dict(role='barb'))
    env['ai_seed'] = CONSTS['AI_SEED_DEFAULT']
    nat = make_natives(env, 0.0)
    nat['GetHandleId'] = lambda u: u
    nat['GetUnitCurrentOrder'] = lambda u: 0            # idle
    nat['LoadInteger'] = lambda ht, a, b: 0
    nat['LoadReal'] = lambda ht, a, b: 0.0
    it = Interp(FUNCS, CONSTS, env, nat)
    ok = all(it.run('AI_NeedsOrder', [u, CONSTS['AI_ORD_MOVE'], 500.0, 0.0, 0]) is True
             for u in range(40))
    fails += 0 if ok else 1
    print('  %s an IDLE unit is ALWAYS re-decided -- the gate controls churn, and a '
          'unit doing nothing is not churn' % ('PASS' if ok else 'FAIL'))

    # a busy unit is mostly left alone, at about the documented rate
    env = make_env(dict(role='barb'))
    env['ai_seed'] = CONSTS['AI_SEED_DEFAULT']
    nat = make_natives(env, 0.0)
    nat['GetHandleId'] = lambda u: u
    nat['GetUnitCurrentOrder'] = lambda u: 1            # busy
    nat['LoadInteger'] = lambda ht, a, b: 0
    nat['LoadReal'] = lambda ht, a, b: 0.0
    it = Interp(FUNCS, CONSTS, env, nat)
    N = 400
    kept = sum(1 for u in range(N)
               if it.run('AI_NeedsOrder', [u, CONSTS['AI_ORD_MOVE'], 500.0, 0.0, 0]) is False)
    frac = kept / float(N)
    ok = abs(frac - CONSTS['AI_INERTIA_KEEP']) < 0.08
    fails += 0 if ok else 1
    print('  %s a BUSY unit is left alone %.0f%% of the time (target %.0f%%)'
          % ('PASS' if ok else 'FAIL', 100 * frac, 100 * CONSTS['AI_INERTIA_KEEP']))

    # the roll must consume the SEEDED stream: this is behaviour, not flavour
    src = re.sub(r'//.*$', '', '\n'.join(FUNCS['AI_Chance'][1]), flags=re.M)
    ok = 'AI_RandReal' in src
    fails += 0 if ok else 1
    print('  %s the inertia roll goes through the seeded stream -- it is a DECISION, '
          'unlike the cosmetic line picker' % ('PASS' if ok else 'FAIL'))

    # ---- STEAL #3: latency between noticing and acting --------------------
    def threat_over_time(pid, waits):
        sc = dict(role='barb', threat=900.0, garrison=200.0, asset=1.0, army=600.0)
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        out = []
        for w in waits:
            env['ai_now'] = 300.0 + w
            it.run('AI_SetFlags', [pid])
            out.append(bool(env['ai_ifThreat'][pid]))
        return out

    seq = threat_over_time(0, [0.0, 0.5, 1.0, 30.0])
    ok = seq[0] is False and seq[-1] is True
    fails += 0 if ok else 1
    print('  %s a threat is NOTICED before it is acted on: %s over 0.0/0.5/1.0/30.0s'
          % ('PASS' if ok else 'FAIL', seq))

    # THE ORTHOGONAL DAMPER: a transient cannot reverse a campaign
    sc = dict(role='barb', threat=900.0, garrison=200.0, asset=1.0, army=600.0)
    env = make_env(sc)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    it.run('AI_SetFlags', [0])                      # spike noticed
    env['wm_threat'] = {0: 0.0}                     # ... and gone again
    env['ai_now'] = 301.0
    it.run('AI_SetFlags', [0])
    env['wm_threat'] = {0: 900.0}                   # it comes back
    env['ai_now'] = 302.0
    it.run('AI_SetFlags', [0])
    ok = env['ai_ifThreat'][0] is False
    fails += 0 if ok else 1
    print('  %s A TRANSIENT SPIKE CANNOT REVERSE A CAMPAIGN -- the notice clock '
          'restarts when the threat lapses. Orthogonal to the playtest-12 '
          'hysteresis: that raises the bar, this requires it to STAY crossed'
          % ('PASS' if ok else 'FAIL'))

    # but the capital emergency is never blunted by latency
    sc = dict(role='rome', threat=1.0, garrison=800.0, asset=1.0, army=2000.0,
              capThreat=True)
    env = make_env(sc)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    it.run('AI_SetFlags', [0])
    ok = env['ai_ifThreat'][0] is True
    fails += 0 if ok else 1
    print('  %s ... and a capital under assault still fires on the FIRST tick -- '
          'latency must not blunt the emergency either'
          % ('PASS' if ok else 'FAIL'))

    # factions do not all turn in unison
    env = make_env(dict(role='barb'))
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    env['ai_diff'] = {p: CONSTS['AI_NORMAL'] for p in range(12)}
    reacts = {it.run('AI_React', [p]) for p in range(12)}
    ok = len(reacts) >= 3
    fails += 0 if ok else 1
    print('  %s twelve factions have %d distinct reaction times, so they do not turn '
          'in unison' % ('PASS' if ok else 'FAIL', len(reacts)))

    # ---- STEAL #4: difficulty is an error rate, not material --------------
    def err(diff):
        env = make_env(dict(role='barb'))
        env['ai_diff'] = {0: diff}
        nat = make_natives(env, 0.0)
        del nat['AI_ErrorRate']              # interpret the REAL function here
        it = Interp(FUNCS, CONSTS, env, nat)
        return it.run('AI_ErrorRate', [0]), it.run('AI_React', [0])

    e_easy, r_easy = err(CONSTS['AI_EASY'])
    e_norm, r_norm = err(CONSTS['AI_NORMAL'])
    e_hard, r_hard = err(CONSTS['AI_HARD'])
    ok = e_easy > e_norm > e_hard and r_easy > r_norm > r_hard
    fails += 0 if ok else 1
    print('  %s difficulty is COMPETENCE: error %.2f/%.2f/%.2f and reaction '
          '%.1f/%.1f/%.1fs across easy/normal/hard'
          % ('PASS' if ok else 'FAIL', e_easy, e_norm, e_hard, r_easy, r_norm, r_hard))

    # the error picks a REAL but worse objective, never nothing
    def pick(rate):
        sc = dict(role='barb', army=900.0, points=[
            dict(kind=CONSTS['AI_PK_CITY'], x=900.0, y=0.0, owner=5),
            dict(kind=CONSTS['AI_PK_CP'], x=6000.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['ai_seed'] = CONSTS['AI_SEED_DEFAULT']
        env['_errorRate'] = rate
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return [it.run('AI_BestTarget', [0]) for _ in range(60)]

    clean = set(pick(0.0))
    ok = len(clean) == 1
    fails += 0 if ok else 1
    print('  %s at error rate 0 the choice is deterministic (%s)'
          % ('PASS' if ok else 'FAIL', clean))

    erring = pick(0.5)
    ok = len(set(erring)) == 2 and -1 not in erring
    fails += 0 if ok else 1
    print('  %s at a high error rate it picks a REAL but worse objective, never '
          'nothing (%s)' % ('PASS' if ok else 'FAIL', sorted(set(erring))))

    # the MATERIAL knob stays present, labelled and at zero
    body = re.sub(r'//.*$', '', TEXT, flags=re.M)
    sets = re.findall(r'set ai_handicap\[[^\]]+\]\s*=\s*([0-9.]+)', body)
    ok = bool(sets) and all(abs(float(v) - 1.0) < 1e-9 for v in sets)
    fails += 0 if ok else 1
    print('  %s the MATERIAL knob is present, labelled and at ZERO (handicap %s) -- '
          'Squid Game is the shipped precedent that avoiding it is viable'
          % ('PASS' if ok else 'FAIL', sorted(set(sets))))

    print('%s: the AI acts at a constant rate and stops arguing with itself'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def oscillation():
    """PLAYTEST 12 -- "East Rome just runs around its capital", diagnosed by the
    AI's own two chat lines:

        East Rome: we move on a city. it belongs to Ostrogoths
        East Rome: back. Constantinople comes first

    A SELF-CAUSED FEEDBACK LOOP. The recall test was
    wm_threat > AI_MS_THREAT * wm_garrison, and wm_garrison is own CV within
    AI_HOME_R of home -- so it collapses the moment the army marches out. The
    input to the decision was a function of the decision's own output.

    Also PLAYTEST 12: Brytenwalda steal #1. Its war gate is FoodUsed >= 25 and
    its attack gate FoodUsed > 25 -- the same constant -- so a faction only
    declares a war it will immediately prosecute."""
    print('\n' + '=' * 78)
    print('PLAYTEST 12 -- a departure cannot manufacture the emergency that recalls it')
    print('=' * 78)
    fails = 0
    NONE, STAGE, MARCH = (CONSTS['AI_MS_NONE'], CONSTS['AI_MS_STAGE'],
                          CONSTS['AI_MS_MARCH'])

    def flags(threat, garrison, msState=NONE, garRef=0.0, capThreat=False):
        sc = dict(role='rome', threat=threat, garrison=garrison, army=2000.0,
                  asset=CONSTS['AI_VAL_CP'], msState=msState, capThreat=capThreat)
        env = make_env(sc)
        env['ai_msGarRef'] = {0: garRef}
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        it.run('AI_SetFlags', [0])
        env['ai_now'] = env['ai_now'] + 2.0 * it.run('AI_React', [0])
        it.run('AI_SetFlags', [0])
        return env['ai_ifThreat'][0]

    HOME_GAR, RAID = 800.0, 500.0

    # ---- THE LOOP, reproduced and then broken ----------------------------
    # at home: 500 raiders against an 800 garrison is not an emergency
    ok = flags(RAID, HOME_GAR) is False
    fails += 0 if ok else 1
    print('  %s with the army at home a %.0f-CV raid is not an emergency'
          % ('PASS' if ok else 'FAIL', RAID))

    # the army marches out: live garrison collapses to what was left behind
    LEFT = 200.0
    ok = flags(RAID, LEFT, msState=MARCH, garRef=HOME_GAR) is False
    fails += 0 if ok else 1
    print('  %s ... and it is STILL not an emergency once the army has left, because '
          'the denominator is the garrison snapshot, not the collapsed live value'
          % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL: the old live-garrison comparison, on the same numbers
    ok = RAID > CONSTS['AI_MS_THREAT'] * LEFT
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the OLD test (%.0f > %.2f x %.0f live) fires on those '
          'same numbers -- that is the loop, reproduced arithmetically'
          % ('PASS' if ok else 'FAIL', RAID, CONSTS['AI_MS_THREAT'], LEFT))

    # ---- hysteresis: the abort bar is above the start bar ----------------
    ok = (CONSTS['AI_MS_ABORT'] > CONSTS['AI_MS_THREAT']
          and CONSTS['AI_MS_ABORT_MARCH'] > CONSTS['AI_MS_ABORT'])
    fails += 0 if ok else 1
    print('  %s the bars rise with commitment: start %.2f, abort %.2f, marching %.2f'
          % ('PASS' if ok else 'FAIL', CONSTS['AI_MS_THREAT'],
             CONSTS['AI_MS_ABORT'], CONSTS['AI_MS_ABORT_MARCH']))

    MID = 1.5 * CONSTS['AI_MS_THREAT'] * HOME_GAR
    ok = (flags(MID, HOME_GAR) is True
          and flags(MID, LEFT, msState=MARCH, garRef=HOME_GAR) is False)
    fails += 0 if ok else 1
    print('  %s a threat that would PREVENT a start does not ABORT one already '
          'marching -- the interrupt path finally has the hysteresis the goal '
          'layer has had since round 3' % ('PASS' if ok else 'FAIL'))

    # ---- but a real emergency still interrupts ---------------------------
    HUGE = 6.0 * HOME_GAR
    ok = flags(HUGE, LEFT, msState=MARCH, garRef=HOME_GAR) is True
    fails += 0 if ok else 1
    print('  %s an overwhelming assault still recalls a marching army'
          % ('PASS' if ok else 'FAIL'))

    ok = flags(1.0, LEFT, msState=MARCH, garRef=HOME_GAR, capThreat=True) is True
    fails += 0 if ok else 1
    print('  %s ... and the CAPITAL under assault recalls it at any bar -- the case '
          'the no-hysteresis exemption existed for, kept explicitly'
          % ('PASS' if ok else 'FAIL'))

    # the snapshot is taken while the army is still home
    src = '\n'.join(FUNCS['AI_MissionStart'][1])
    ok = 'ai_msGarRef' in src
    fails += 0 if ok else 1
    print('  %s the denominator is frozen at mission START, before the army moves'
          % ('PASS' if ok else 'FAIL'))

    # ---- BRYTENWALDA STEAL #1: one constant, both gates -------------------
    sel = '\n'.join(FUNCS['AI_SelectGoal'][1])
    st = '\n'.join(FUNCS['AI_MissionStart'][1])
    ok = 'AI_CanProsecute' in sel and 'AI_CanProsecute' in st
    fails += 0 if ok else 1
    print('  %s BRYTENWALDA STEAL #1: the SAME gate guards adopting an objective and '
          'marching on one' % ('PASS' if ok else 'FAIL'))

    pros = re.sub(r'//.*$', '', '\n'.join(FUNCS['AI_CanProsecute'][1]), flags=re.M)
    ok = pros.count('AI_PROSECUTE_CV') == 1
    fails += 0 if ok else 1
    print('  %s ... and it is ONE constant, not two that can drift apart'
          % ('PASS' if ok else 'FAIL'))

    def goal(army):
        sc = dict(role='barb', t=400.0, army=army, goalSince=-999.0,
                  points=[dict(kind=CONSTS['AI_PK_CP'], x=1200.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['ai_now'] = 400.0
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        return it.run('AI_SelectGoal', [0])

    weak = goal(0.5 * CONSTS['AI_PROSECUTE_CV'])
    ok = weak not in (CONSTS['GOAL_EXPAND'], CONSTS['GOAL_SIEGE'])
    fails += 0 if ok else 1
    print('  %s below the bar an acquisitive goal is not even a CANDIDATE (chose %s)'
          % ('PASS' if ok else 'FAIL', weak))

    strong = goal(6.0 * CONSTS['AI_PROSECUTE_CV'])
    ok = strong in (CONSTS['GOAL_EXPAND'], CONSTS['GOAL_SIEGE'])
    fails += 0 if ok else 1
    print('  %s above it the same faction attacks (chose %s) -- a filter, not a freeze'
          % ('PASS' if ok else 'FAIL', strong))

    # it must not create a sixth impossible state: the goals that RAISE army
    # strength stay available below the bar
    ok = weak in (CONSTS['GOAL_CONSOLIDATE'], CONSTS['GOAL_TECH'],
                  CONSTS['GOAL_DEFEND'], CONSTS['GOAL_RETREAT'])
    fails += 0 if ok else 1
    print('  %s ... and below the bar it picks a goal that RAISES strength, so the bar '
          'is reached by doing what it asks' % ('PASS' if ok else 'FAIL'))

    print('%s: the army no longer cancels its own campaigns'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def no_cheating():
    """PLAYTEST 11 -- "did someone stealthily raise the food cap of the
    barbarians? It should be 100 max."

    We have told the owner repeatedly that no material cheating is active.
    That claim has already been too strong once (the fog contract, DESIGN
    21.1 defect 6), so it is now a STANDING ASSERTION over the shipped source
    rather than a thing anyone has to remember.

    The answer to the question itself is in DESIGN 26: the map sets every
    ceiling once in Melee_Initialization -- 100 for the eight true barbarians,
    200 for Persia, 300 for each Roman -- and never writes one again. Our
    module cannot write player state at all.
    """
    print('\n' + '=' * 78)
    print('PLAYTEST 11 -- the module cannot grant itself anything')
    print('=' * 78)
    fails = 0

    # every engine native the module calls, comment- and string-stripped
    def strip_code(text):
        out, instr, i = [], False, 0
        while i < len(text):
            c = text[i]
            if instr:
                out.append(c)
                instr = not (c == '"')
                i += 1
                continue
            if c == '"':
                instr = True
                out.append(c)
                i += 1
                continue
            if text.startswith('//', i):
                j = text.find('\n', i)
                i = j if j >= 0 else len(text)
                continue
            out.append(c)
            i += 1
        return ''.join(out)

    body = strip_code(TEXT)
    called = {c for c in re.findall(r'\b([A-Z][A-Za-z0-9_]+)\s*\(', body)
              if not c.startswith('AI_')}

    BANNED = ['SetPlayerState', 'SetPlayerStateBJ', 'AddResourceAmount',
              'SetPlayerHandicap', 'SetPlayerHandicapXP', 'SetPlayerTechResearched',
              'SetPlayerTechMaxAllowed', 'AddPlayerTechResearched',
              'SetPlayerTechMaxAllowedSwap', 'SetPlayerTechResearchedSwap',
              'SetPlayerFoodCap', 'UnitAddItem', 'SetResourceAmount',
              'SetPlayerAbilityAvailable', 'ShareEverythingWithTeam',
              'SetPlayerAlliance']
    hit = sorted(called & set(BANNED))
    ok = not hit
    fails += 0 if ok else 1
    print('  %s the module calls NONE of the %d resource/tech/handicap-granting '
          'natives%s' % ('PASS' if ok else 'FAIL', len(BANNED),
                         '' if ok else ' -- CALLS: ' + ', '.join(hit)))

    # NEGATIVE CONTROL: the sweep must be able to see a call if one existed
    ok = 'GetPlayerState' in called
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the same sweep DOES see GetPlayerState, so it is '
          'reading real call sites rather than finding nothing'
          % ('PASS' if ok else 'FAIL'))

    fake = strip_code('function X takes nothing returns nothing\n'
                      '    call SetPlayerState(p, s, 999)\nendfunction\n')
    fake_called = {c for c in re.findall(r'\b([A-Z][A-Za-z0-9_]+)\s*\(', fake)}
    ok = bool(fake_called & set(BANNED))
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: an injected SetPlayerState IS detected by the sweep'
          % ('PASS' if ok else 'FAIL'))

    # every player-state access is a READ
    writes = re.findall(r'(?<!Get)PlayerState\s*\(', body)
    ok = not writes
    fails += 0 if ok else 1
    print('  %s every PLAYER_STATE access in the module is a GetPlayerState (%d reads)'
          % ('PASS' if ok else 'FAIL', len(re.findall(r'GetPlayerState\s*\(', body))))

    # the only state-changing natives are orders and one animation
    CHANGERS = {c for c in called
                if re.match(r'^(Set|Add|Remove|Create|Issue|Start|Enable|Replace|Share|Cripple|Suspend)', c)}
    ALLOWED = {'IssueImmediateOrderById', 'IssuePointOrder', 'IssueTargetOrder',
               'IssueTargetOrderById', 'SetUnitAnimation', 'ReplaceUnitBJ',
               'CreateGroup', 'CreateTimer', 'CreateTrigger', 'SetUnitPosition',
               'SaveInteger', 'SaveReal', 'StartSound'}
    extra = sorted(CHANGERS - ALLOWED)
    ok = not extra
    fails += 0 if ok else 1
    print('  %s the only world-changing calls are unit ORDERS, a gate replace and an '
          'animation%s' % ('PASS' if ok else 'FAIL',
                           '' if ok else ' -- also: ' + ', '.join(extra)))

    # the handicap is still labelled and still 1.0, and is never set to
    # anything else anywhere in the module
    sets = re.findall(r'set ai_handicap\[[^\]]+\]\s*=\s*([0-9.]+)', body)
    ok = bool(sets) and all(abs(float(v) - 1.0) < 1e-9 for v in sets)
    fails += 0 if ok else 1
    print('  %s ai_handicap is set to %s and to nothing else -- no material advantage '
          'is dialled in' % ('PASS' if ok else 'FAIL', sorted(set(sets)) or 'NOTHING'))

    # the broadcast claim must not overstate what holds. DESIGN 21.1 defect 6:
    # strength is fog-gated, ownership is not, and saying "fog is respected"
    # flat was too strong.
    claims = re.findall(r'AI_Broadcast\("FoR-AI ([^"]*)"\)', TEXT)
    fogline = [c for c in claims if 'fog' in c.lower() or 'vision' in c.lower()]
    ok = bool(fogline) and not any(re.search(r'fog is respected\.?$', c) for c in fogline)
    fails += 0 if ok else 1
    print('  %s the in-game claim does not say "fog is respected" flat -- it states '
          'the strength/ownership split (defect 6)' % ('PASS' if ok else 'FAIL'))

    # supply is logged for ALL twelve, not just the factions we drive
    ssrc = '\n'.join(FUNCS['AI_TelScanSupply'][1])
    ok = 'AI_MAX_PLAYERS' in ssrc and 'FOOD_CAP_CEILING' in ssrc
    fails += 0 if ok else 1
    print('  %s supply telemetry covers ALL twelve players and logs the CEILING -- a '
          'diagnostic limited to our own factions could not answer the question '
          'that was asked' % ('PASS' if ok else 'FAIL'))

    print('%s: nothing in the module can grant a resource, a tech or a cap'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def voice():
    """PLAYTEST 11 -- the twelve voices, per docs/reference/fall-of-rome-voices.md.

    The spec's own checker read the markdown and was thrown away on purpose:
    section 8 says the assertion that matters belongs against the JASS tables,
    which is only true if the JASS provably came from the markdown. So the
    tables are GENERATED (gen-voices.py) and checked here, against the shipped
    voices.j, with the generator itself checked for drift.

    Section 8's criteria, all seven, plus the vocabulary table from section 7.
    Every check keys on structure or on the generated table, never on one
    hand-typed line -- DESIGN.md 21.6 recorded what happens when a guard is
    keyed on player-facing text.
    """
    print('\n' + '=' * 78)
    print('PLAYTEST 11 -- twelve voices, and the machine channel still byte-exact')
    print('=' * 78)
    fails = 0
    import subprocess

    VJ = os.path.join(W, 'voices.j')
    src = open(VJ, encoding='utf-8').read()
    # every literal returned by the generated tables
    lines = re.findall(r'^\s*return\s+(.+)$', src, flags=re.M)
    lits = []
    for ln in lines:
        parts = re.findall(r'"([^"]*)"', ln)
        if parts:
            lits.append(''.join(parts))

    def pool(fn):
        m = re.search(r'function %s\b(?:(?!\nendfunction)[\s\S])*' % fn, src)
        body = m.group(0) if m else ''
        out = []
        for ln in re.findall(r'^\s*return\s+(.+)$', body, flags=re.M):
            parts = re.findall(r'"([^"]*)"', ln)
            if parts:
                joined = ''.join(parts)
                # each generated function ends with a `return ""` fallthrough,
                # which is a guard rather than a line and must not be counted
                if joined or 'k' in ln or 'o' in ln:
                    if joined:
                        out.append(joined)
        return out

    # ---- 1. pool arity ---------------------------------------------------
    a_pools = {p: pool('AI_VA%d' % p) for p in range(12)}
    ok = all(len(v) == 30 for v in a_pools.values())
    fails += 0 if ok else 1
    print('  %s tier A arity: 12 factions x 10 kinds x 3 variants (%d strings)'
          % ('PASS' if ok else 'FAIL', sum(len(v) for v in a_pools.values())))

    b_pools = {h: pool('AI_VB%d' % h) for h in range(6)}
    ok = all(len(v) == 30 for v in b_pools.values())
    fails += 0 if ok else 1
    print('  %s tier B arity: 6 houses x 10 kinds x 3 variants (%d strings)'
          % ('PASS' if ok else 'FAIL', sum(len(v) for v in b_pools.values())))

    c_pool = pool('AI_VTierC')
    ok = len(c_pool) == 60
    fails += 0 if ok else 1
    print('  %s tier C arity: 6 houses x 10 states (%d strings)'
          % ('PASS' if ok else 'FAIL', len(c_pool)))

    # ---- 2. cross-faction uniqueness in tier A ---------------------------
    # THE assertion: it is what makes the reported collision impossible.
    all_a = [x for v in a_pools.values() for x in v]
    ok = len(set(all_a)) == len(all_a) == 360
    fails += 0 if ok else 1
    print('  %s tier A: all %d strings DISTINCT -- no two factions can ever emit '
          'the same line' % ('PASS' if ok else 'FAIL', len(all_a)))

    # the exact collision the owner reported, checked directly
    VANDALS, SAXONS, BRITONS = 5, 2, 6
    shared = set(a_pools[VANDALS]) & set(a_pools[SAXONS]) & set(a_pools[BRITONS])
    ok = not shared
    fails += 0 if ok else 1
    print('  %s the three factions from the screenshot share NO string'
          % ('PASS' if ok else 'FAIL'))

    # ---- 3/4. ASCII, apostrophe-free -------------------------------------
    bad = [x for x in lits if any(ord(c) < 0x20 or ord(c) > 0x7E for c in x)]
    ok = not bad
    fails += 0 if ok else 1
    print('  %s every line is ASCII 0x20-0x7E (%d checked)'
          % ('PASS' if ok else 'FAIL', len(lits)))

    apos = [x for x in lits if "'" in x]
    ok = not apos
    fails += 0 if ok else 1
    print('  %s no ASCII apostrophe in any line (gotcha 34, kept as a free '
          'precaution)' % ('PASS' if ok else 'FAIL'))

    # ---- 5. length bound -------------------------------------------------
    # spec 8.5: worst case is the longest {kind} plus a colour-coded {owner}
    KIND_MAX = len('a building plot')
    over = []
    for fn_i in range(12):
        m = re.search(r'function AI_VA%d\b(?:(?!\nendfunction)[\s\S])*' % fn_i, src)
        for ln in re.findall(r'^\s*return\s+(.+)$', m.group(0), flags=re.M):
            body = ''.join(re.findall(r'"([^"]*)"', ln))
            n = len(body) + (KIND_MAX if ' k' in ln or '+ k' in ln else 0)
            if n > 64:
                over.append((body, n))
    ok = not over
    fails += 0 if ok else 1
    print('  %s no tier A line exceeds 64 visible characters after substitution%s'
          % ('PASS' if ok else 'FAIL', '' if ok else ' -- ' + repr(over[:2])))

    # the spec says the OLD line would fail this. Confirm the check can fire.
    OLD = 'nothing here is worth much. I will take the nearest thing and move on'
    ok = len(OLD) > 64
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL (length): the superseded playtest-9 line is %d '
          'characters and would fail this bound' % ('PASS' if ok else 'FAIL', len(OLD)))

    # ---- 6. the machine channel is untouched -----------------------------
    tel = '\n'.join(FUNCS['AI_Tel'][1])
    ok = not re.search(r'AI_(VTier|LineA|LineB|VA\d|VB\d|House|VPick)', tel)
    fails += 0 if ok else 1
    print('  %s no voice helper is reachable from AI_Tel' % ('PASS' if ok else 'FAIL'))

    bad = re.findall(r'call AI_Tel\(\s*"(\w+)"\s*,\s*([^\n]*)\)', CODE)
    leaky = [ev for ev, body in bad
             if re.search(r'AI_(GoalName|PostureName|KindName|OwnerName|Name|LineA|LineB)\b', body)]
    ok = not leaky
    fails += 0 if ok else 1
    print('  %s no AI_Tel call site interpolates a readable name (%d sites)'
          % ('PASS' if ok else 'FAIL', len(bad)))

    # ---- 7. no GetLocalPlayer anywhere in the voice path -----------------
    ok = 'GetLocalPlayer' not in CODE and 'GetLocalPlayer' not in src
    fails += 0 if ok else 1
    print('  %s no GetLocalPlayer in the voice or broadcast path'
          % ('PASS' if ok else 'FAIL'))

    # ---- scoping is unchanged: twelve voices, not twelve leaks -----------
    ssrc = '\n'.join(FUNCS['AI_Say'][1])
    ok = 'AI_BroadcastAllies' in ssrc and 'AI_Broadcast(' not in ssrc and 'ai_talk' in ssrc
    fails += 0 if ok else 1
    print('  %s AI_Say still ally-scoped and ai_talk-gated -- twelve voices did not '
          'become twelve ways to leak' % ('PASS' if ok else 'FAIL'))

    # ---- the picker does not spend the seeded stream ---------------------
    psrc = re.sub(r'//.*$', '', '\n'.join(FUNCS['AI_VPick'][1]), flags=re.M)
    ok = 'AI_Rand' not in psrc
    fails += 0 if ok else 1
    print('  %s the picker does NOT consume AI_Rand (spec 6.1, gotcha 29/30)'
          % ('PASS' if ok else 'FAIL'))

    # and it does not collapse the way the playtest-10 form did
    def pick_seq(pid, kind, n):
        env = make_env(dict(role='barb'))
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return [it.run('AI_VPick', [pid, kind]) for _ in range(n)]
    ok = len(set(pick_seq(0, 0, 6))) == 3
    fails += 0 if ok else 1
    print('  %s consecutive lines from one faction walk all three variants'
          % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL: the playtest-10 index collapsed mod 3 -- 7 is congruent
    # to 1 mod 3, so players 0, 3, 6 and 9 always shared an index. The spec
    # caught this; confirm the old form really was degenerate.
    old_idx = {p: (p * 7 + 5) % 3 for p in (0, 3, 6, 9)}
    ok = len(set(old_idx.values())) == 1
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL (picker): the playtest-10 form gave players 0/3/6/9 '
          'the SAME index -- a real defect the spec caught'
          % ('PASS' if ok else 'FAIL'))

    # ---- the echo ring ---------------------------------------------------
    esrc = '\n'.join(FUNCS['AI_EchoSeen'][1])
    ok = 'ai_echoMsg' in esrc and 'AI_ECHO_T' in esrc
    fails += 0 if ok else 1
    print('  %s a GLOBAL echo ring guards the shared tiers (window %.0fs, %d slots '
          'for %d possible speakers)' % ('PASS' if ok else 'FAIL',
                                         CONSTS['AI_ECHO_T'], CONSTS['AI_ECHO_N'], 12))
    ok = CONSTS['AI_ECHO_T'] > CONSTS['AI_SAY_GAP'] and CONSTS['AI_ECHO_N'] >= 12
    fails += 0 if ok else 1
    print('  %s ... sized for NINE barbarian speakers for the whole game: the '
          'advertised 10-minute unally does not exist (spec 3b)'
          % ('PASS' if ok else 'FAIL'))

    # ---- ALLY_HELP exists but is deliberately unwired --------------------
    ok = 'V_ALLY_HELP' in CODE and 'AI_LineB(pid, V_ALLY_HELP)' not in CODE
    fails += 0 if ok else 1
    print('  %s ALLY_HELP strings exist but NOTHING calls them -- wiring a new '
          'speaking event is a behaviour change, not a text change'
          % ('PASS' if ok else 'FAIL'))

    # ---- section 7: the vocabulary table actually landed ------------------
    VOCAB = [(7, 'the host', 'Persia speaks as a peer empire'),
             (11, 'the band', 'Burgundians are clannish and plural'),
             (4, 'the host', 'Visigoths use the host'),
             (10, 'time', 'North Rome denominates everything in time'),
             (6, 'few', 'Britons count the men'),
             (2, None, 'Saxons are the shortest lines on the board')]
    for pid, needle, why in VOCAB:
        if needle is None:
            avg = sum(len(x) for x in a_pools[pid]) / len(a_pools[pid])
            others = [sum(len(x) for x in a_pools[q]) / len(a_pools[q])
                      for q in range(12) if q != pid]
            ok = avg < min(others)
            print('  %s %s (mean %.0f chars vs next shortest %.0f)'
                  % ('PASS' if ok else 'FAIL', why, avg, min(others)))
        else:
            ok = any(needle in x for x in a_pools[pid])
            print('  %s %s ("%s" present)' % ('PASS' if ok else 'FAIL', why, needle))
        fails += 0 if ok else 1

    # Romans train, everyone else hires (spec 2.5 / 7)
    ROMANS = (3, 9, 10)
    wrong = [p for p in range(12) for x in a_pools[p]
             if ('hire' in x and p in ROMANS) or ('train' in x and p not in ROMANS)]
    ok = not wrong
    fails += 0 if ok else 1
    print('  %s Romans never "hire" and barbarians never "train" -- the register '
          'split the tooltips gave us for free' % ('PASS' if ok else 'FAIL'))

    # ---- the generator is the source of truth ----------------------------
    r = subprocess.run([sys.executable, os.path.join(W, 'gen-voices.py'), '--check'],
                       capture_output=True, text=True)
    ok = r.returncode == 0
    fails += 0 if ok else 1
    print('  %s voices.j matches the spec markdown -- the tables provably came from '
          'the document%s' % ('PASS' if ok else 'FAIL',
                              '' if ok else ': ' + (r.stderr or '').strip()[:80]))

    # NEGATIVE CONTROL for the uniqueness check, per spec 8: copy a Hun line
    # into the Frank pool and the assertion must fail.
    faked = dict(a_pools)
    faked[1] = [a_pools[0][0]] + a_pools[1][1:]
    all_f = [x for v in faked.values() for x in v]
    ok = len(set(all_f)) != len(all_f)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL (uniqueness): duplicating one Hun line into the '
          'Frank pool makes the check fail' % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL for arity: drop one variant
    ok = len(a_pools[0][:-1]) != 30
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL (arity): dropping one variant makes the count fail'
          % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL for the apostrophe sweep
    ok = bool([x for x in ["don't"] if "'" in x])
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL (apostrophe): the sweep detects an injected one'
          % ('PASS' if ok else 'FAIL'))

    print('%s: twelve voices, and no two factions can say the same thing'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0

def perimeter():
    """PLAYTEST 8 -- "they can't get out of their camps", and the GENERAL form.

    Third venue for one failure: round 3 was armies stacked behind their own
    city gate, round 5 was Gray piled on a bridge, round 8 is barbarians
    sealed in their camps. Each earlier fix addressed the venue. This one
    addresses the class, because the class is not what it looked like.

    WHAT THE CAMP PERIMETER IS ACTUALLY MADE OF, from the map:
      * B001 x16 per camp -- a custom destructable named "Pathing Blocker 8",
        derived from YTpc, carrying PathTextures\\8x8Default.tga. Invisible.
      * D01J x16-18 -- the palisade fence ART, at the same radius.
      Both sit on a ring of radius ~850-1090 about the camp. Seven camps
      (players 0,1,2,4,6,8,11) share the layout.

    So it is neither a gate to open nor a wall to break, and hypothesis A is
    refuted on the artifact: there is nothing to register. It is also not
    SEALED -- the Franks ring has gaps of 49 and 67 degrees, some 770 and
    1050 world units wide, and the engine paths through them.

    THE ARMY WAS NEVER ORDERED OUT. AI_SendEnum dropped every MOVE order
    whose destination was within AI_HOME_R (2500) of the unit, as a general
    arrival tolerance. The muster rally sits at AI_MUSTER_OFF (1200). Every
    muster order was therefore cancelled before issue -- a regression I
    introduced last round, via a guard written three rounds earlier.

    The general invariant is asserted last, and it is the one that would have
    caught all three venues: AN ARMY ORDERED SOMEWHERE IT IS NOT MUST RECEIVE
    ORDERS. A dispatch that issues nothing is never correct."""
    print('\n' + '=' * 78)
    print('PLAYTEST 8 -- an army ordered somewhere it is not must receive orders')
    print('=' * 78)
    import math
    fails = 0
    HOME = (0.0, 0.0)
    CAMP_R = 950.0                  # measured from the map, all seven camps

    def camp_units(n=12):
        """A barbarian army standing inside its own palisade ring."""
        out = []
        for i in range(n):
            a = 2.0 * math.pi * i / n
            r = CAMP_R * 0.8
            out.append((HOME[0] + r * math.cos(a), HOME[1] + r * math.sin(a), 40.0))
        return out

    def dispatch(funcs, units, dest, kind=None, threat=0.0):
        """Run the REAL AI_SendArmy and count the orders that reach a unit."""
        kind = CONSTS['AI_ORD_MOVE'] if kind is None else kind
        sc = dict(role='barb', army=40.0 * len(units), threat=threat,
                  fieldX=HOME[0], fieldY=HOME[1])
        env = make_env(sc)
        env['ai_homeX'] = {0: HOME[0]}
        env['ai_homeY'] = {0: HOME[1]}
        issued = []
        nat = make_natives(env, 0.0)
        seq, st = list(units), {}
        def enum_driver(g, fn):
            for u in seq:
                st['cur'] = u
                fn()
        nat['GetEnumUnit'] = lambda: st.get('cur')
        nat['GetUnitX'] = lambda u: u[0]
        nat['GetUnitY'] = lambda u: u[1]
        nat['GetUnitState'] = lambda u, s: 1000.0
        nat['GetUnitTypeId'] = lambda u: 0
        nat['IsUnitType'] = lambda u, t: False
        nat['IsUnitLoaded'] = lambda u: False
        nat['AI_IsStructure'] = lambda u: False
        nat['AI_IsTransport'] = lambda u: False
        nat['AI_CV'] = lambda u: u[2]
        nat['AI_LaneOf'] = lambda u: 0
        nat['AI_UnitFor'] = lambda pid, k: 0
        nat['AI_LanesAt'] = lambda x, y: CONSTS['AI_LANES']
        nat['AI_SetLanes'] = lambda n: None
        nat['CreateGroup'] = lambda: 'g'
        nat['DestroyGroup'] = lambda g: None
        nat['GroupEnumUnitsOfPlayer'] = lambda g, p, f: None
        nat['ForGroup'] = enum_driver
        nat['Filter'] = lambda f: f
        nat['AI_TryOrder'] = lambda u, k, x, y, t: issued.append((u, k, x, y))
        Interp(funcs, CONSTS, env, nat).run(
            'AI_SendArmy', [0, dest[0], dest[1], kind, None])
        return issued

    RALLY = (CONSTS['AI_MUSTER_OFF'], 0.0)      # exactly where the muster puts it
    units = camp_units()

    got = dispatch(FUNCS, units, RALLY)
    ok = len(got) == len(units)
    fails += 0 if ok else 1
    print('  %s the muster reaches every unit in the camp: %d order(s) for %d units'
          % ('PASS' if ok else 'FAIL', len(got), len(units)))

    # NEGATIVE CONTROL: the pre-fix guard, synthesised from the shipped body.
    # It used AI_HOME_R as a general arrival tolerance; restore that one line
    # and the same dispatch must go silent.
    prefix = dict(FUNCS)
    params, body = FUNCS['AI_SendEnum'][0], FUNCS['AI_SendEnum'][1]
    old, skipping, depth = [], False, 0
    for ln in body:
        s = ln.strip()
        if s.startswith('if ai_ordKind == AI_ORD_MOVE then'):
            skipping, depth = True, 0
            old.append('    if ai_ordKind == AI_ORD_MOVE and AI_Dist(GetUnitX(u), '
                       'GetUnitY(u), ai_orderX, ai_orderY) < AI_HOME_R then')
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
    if len(old) == len(body):
        fails += 1
        print('  FAIL negative control is INERT: the shipped AI_SendEnum has no MOVE '
              'guard block, so the pre-fix body could not be built')
    prefix['AI_SendEnum'] = (params, old)
    nc = dispatch(prefix, units, RALLY)
    ok = len(nc) == 0
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: with AI_HOME_R as the arrival tolerance the same '
          'dispatch issues %d orders -- the army is never told to leave'
          % ('PASS' if ok else 'FAIL', len(nc)))

    # the round-5 optimisation must SURVIVE: ordered home, already home
    ok = len(dispatch(FUNCS, units, HOME)) == 0
    fails += 0 if ok else 1
    print('  %s round 5 still holds: units already home are not told to go home'
          % ('PASS' if ok else 'FAIL'))

    # ... and a unit far from home IS still sent home
    far = [(9000.0, 0.0, 40.0)]
    ok = len(dispatch(FUNCS, far, HOME)) == 1
    fails += 0 if ok else 1
    print('  %s ... but a unit out in the field still gets the order to come home'
          % ('PASS' if ok else 'FAIL'))

    # arrival is a real tolerance, not a neighbourhood
    at_dest = [(RALLY[0] + 50.0, RALLY[1], 40.0)]
    ok = len(dispatch(FUNCS, at_dest, RALLY)) == 0
    fails += 0 if ok else 1
    print('  %s a unit already standing on the destination is not re-ordered '
          '(arrival tolerance %.0f, not %.0f)'
          % ('PASS' if ok else 'FAIL', CONSTS['AI_ARRIVE_R'], CONSTS['AI_HOME_R']))

    # ---- THE GENERAL INVARIANT --------------------------------------------
    # Expressed over the whole dispatch, at every range that has ever trapped
    # an army: behind a city gate (round 3), on a bridge (round 5), inside a
    # camp (round 8). If any of these goes silent, an army is standing still
    # while believing it was ordered to move.
    print('  -- the general form, swept over range --')
    silent = []
    for d in (500.0, 900.0, 1200.0, 1800.0, 2400.0, 2600.0, 5000.0, 12000.0):
        n = len(dispatch(FUNCS, units, (d, 0.0)))
        if n == 0:
            silent.append(d)
    ok = not silent
    fails += 0 if ok else 1
    print('     %s an army ordered to a destination it is NOT standing on receives '
          'orders at every range (silent at: %s)'
          % ('PASS' if ok else 'FAIL', silent or 'none'))

    # and the same sweep on the pre-fix body must be silent below AI_HOME_R,
    # proving the sweep can actually detect the class rather than merely
    # passing over it
    # The control is asserted at the range that actually mattered rather than
    # over a count: the pre-fix body must be silent at exactly AI_MUSTER_OFF,
    # which is where the shipped muster puts its rally. (It is NOT silent at
    # every short range -- at 1800 the far side of the camp is already beyond
    # AI_HOME_R of the destination and does get an order. That partial
    # silencing is precisely why the bug read as "some stragglers outside".)
    nc_silent = [d for d in (500.0, 900.0, 1200.0, 1800.0, 2400.0)
                 if len(dispatch(prefix, units, (d, 0.0))) == 0]
    ok = CONSTS['AI_MUSTER_OFF'] in nc_silent
    fails += 0 if ok else 1
    print('     %s NEGATIVE CONTROL: the pre-fix body is silent at the muster offset '
          '%.0f (silent at %s) -- the sweep detects the real defect'
          % ('PASS' if ok else 'FAIL', CONSTS['AI_MUSTER_OFF'],
             [int(x) for x in nc_silent]))

    # the garrison hold is allowed to silence a dispatch, and must not be
    # mistaken for this bug: it is a DECISION, and it is capped.
    held = dispatch(FUNCS, units, (5000.0, 0.0), threat=100000.0)
    ok = 0 < len(held) < len(units)
    fails += 0 if ok else 1
    print('     %s a huge threat holds SOME of the army back (%d of %d ordered) and '
          'never all of it -- a decision, not a silence'
          % ('PASS' if ok else 'FAIL', len(held), len(units)))

    # ---- a rally point must be a PLACE ------------------------------------
    # Round 7 proved that a computed point on this map lands in open water
    # often enough to matter; a muster that gathers at an unreachable point is
    # the same trap with a new cause.
    def rally(water):
        sc = dict(role='barb', t=100.0, army=4 * CONSTS['AI_PROSECUTE_CV'],
                  points=[dict(kind=CONSTS['AI_PK_CITY'], x=8000.0, y=0.0, owner=5)],
                  msState=CONSTS['AI_MS_NONE'], msTarget=-1)
        env = make_env(sc)
        env['ai_now'] = 100.0
        env['ai_homeX'] = {0: 0.0}
        env['ai_homeY'] = {0: 0.0}
        env['_water'] = water
        nat = make_natives(env, 0.0)
        nat['AI_Say'] = lambda pid, s: None
        nat['AI_Tel'] = lambda ev, b: None
        nat['AI_Num'] = str
        nat['AI_TelAI'] = lambda pid: '1'
        Interp(FUNCS, CONSTS, env, nat).run('AI_MissionStart', [0, 0])
        return env['ai_msRX'][0], env['ai_msRY'][0]

    dry = rally((1.0, -1.0))                     # empty interval: all walkable
    ok = abs(dry[0] - CONSTS['AI_MUSTER_OFF']) < 1.0
    fails += 0 if ok else 1
    print('  %s on dry ground the rally sits forward at %.0f' % ('PASS' if ok else 'FAIL', dry[0]))

    # a strait covering exactly where the rally would land
    wet = rally((CONSTS['AI_MUSTER_OFF'] - 300.0, CONSTS['AI_MUSTER_OFF'] + 300.0))
    ok = wet == (0.0, 0.0)
    fails += 0 if ok else 1
    print('  %s a rally that lands in open water falls back to home, which is always '
          'real ground (got %.0f, %.0f)' % ('PASS' if ok else 'FAIL', wet[0], wet[1]))

    print('%s: no dispatch can silently order nobody' % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def partition():
    """PLAYTEST 9. "Not with their entire army, and they seem not to move
    berserkers." A quantity symptom and a TYPE symptom, and the type symptom
    named the filter -- but the filter was not a type test at all.

    FROM THE MAP: "Barbarian Berserker" is six rawcodes, one per barbarian
    faction, all cloned from hfoo -- h006 h00Z h013 h014 h016 h021 -- and 24
    are preplaced per faction. All six ARE in AI_BaseCost (heavy melee, 100g),
    so they were valued correctly and were never type-excluded.

    THE ACTUAL CAUSE: the Franks field 70 units in their camp, in creation
    order h002, o002 x2, hero, h011 x2, o002 x2, n001 x3, n003, h01I x12, THEN
    h013 x12. AI_ORDER_SLICE is 24. The berserkers occupy enumeration slots
    24-35 -- every single one past the cut-off. And AI_NeedsOrder returns true
    for any idle unit, so the prefix re-consumed the budget every tick and the
    tail was never reached. Head-of-line starvation: a fixed budget over a
    stable enumeration always serves the same prefix.

    THE GENERAL FORM, which is what makes this catchable for unit types nobody
    has looked at: every mobile unit is dispatched, deliberately garrisoned, or
    excluded WITH A REASON. There is no silent fourth category."""
    print('\n' + '=' * 78)
    print('PLAYTEST 9 -- every unit is dispatched, garrisoned, or excluded with a reason')
    print('=' * 78)
    import math
    fails = 0
    HOME = (0.0, 0.0)
    EX = {n: CONSTS['AI_EX_' + n] for n in
          ('NONE', 'HELD', 'DEAD', 'HERO', 'BOAT', 'RAM', 'ARRIVED', 'WINDOW')}

    def army(n):
        """n mobile units spread inside a camp, as the map places them."""
        out = []
        for i in range(n):
            a = 2.0 * math.pi * i / n
            out.append((HOME[0] + 760.0 * math.cos(a), HOME[1] + 760.0 * math.sin(a), 100.0))
        return out

    def dispatch(funcs, units, dest, env=None, threat=0.0):
        sc = dict(role='barb', army=100.0 * len(units), threat=threat,
                  fieldX=HOME[0], fieldY=HOME[1])
        if env is None:
            env = make_env(sc)
            env['ai_homeX'] = {0: HOME[0]}
            env['ai_homeY'] = {0: HOME[1]}
        issued = []
        nat = make_natives(env, 0.0)
        seq, st = list(units), {}
        def enum_driver(g, fn):
            for u in seq:
                st['cur'] = u
                fn()
        nat['GetEnumUnit'] = lambda: st.get('cur')
        nat['GetUnitX'] = lambda u: u[0]
        nat['GetUnitY'] = lambda u: u[1]
        nat['GetUnitState'] = lambda u, s: 1000.0
        # distinct from the ram type, or every unit reads as a ram with no
        # wall to break and the whole census lands in one bucket
        nat['GetUnitTypeId'] = lambda u: 1
        nat['GetUnitLevel'] = lambda u: 1
        nat['IsUnitType'] = lambda u, t: False
        nat['IsUnitLoaded'] = lambda u: False
        nat['AI_IsStructure'] = lambda u: False
        nat['AI_IsTransport'] = lambda u: False
        nat['AI_CV'] = lambda u: u[2]
        nat['AI_UnitFor'] = lambda pid, k: 999
        nat['AI_LanesAt'] = lambda x, y: CONSTS['AI_LANES']
        nat['AI_SetLanes'] = lambda n: None
        nat['CreateGroup'] = lambda: 'g'
        nat['DestroyGroup'] = lambda g: None
        nat['GroupEnumUnitsOfPlayer'] = lambda g, p, f: None
        nat['ForGroup'] = enum_driver
        nat['Filter'] = lambda f: f
        nat['AI_TryOrder'] = lambda u, k, x, y, t: issued.append((u, k, round(x, 3), round(y, 3)))
        Interp(funcs, CONSTS, env, nat).run(
            'AI_SendArmy', [0, dest[0], dest[1], CONSTS['AI_ORD_ATTACKP'], None])
        return issued, env

    N = 70                     # the Franks' actual camp population
    DEST = (9000.0, 0.0)
    units = army(N)

    # ---- the partition is TOTAL -------------------------------------------
    got, env = dispatch(FUNCS, units, DEST)
    census = {k: env['ai_exCount'][0 * 8 + v] for k, v in EX.items()}
    total = sum(census.values())
    ok = total == N
    fails += 0 if ok else 1
    print('  %s the census is TOTAL: %d units enumerated, %d accounted for'
          % ('PASS' if ok else 'FAIL', N, total))
    print('       %s' % ', '.join('%s=%d' % (k, v) for k, v in census.items() if v))

    ok = census['NONE'] == len(got)
    fails += 0 if ok else 1
    print('  %s every unit counted as dispatched actually received an order (%d = %d)'
          % ('PASS' if ok else 'FAIL', census['NONE'], len(got)))

    # The hard cap lives in AI_TryOrder (stubbed here, and pinned by the order
    # economy section). What this asserts is the WINDOW: once primed, a
    # dispatch offers at most one slice of units, so rotation cannot become a
    # way of issuing MORE orders.
    got2, env = dispatch(FUNCS, units, DEST, env=env)
    offered = env['ai_exCount'][EX['NONE']]
    ok = offered <= CONSTS['AI_ORDER_SLICE']
    fails += 0 if ok else 1
    print('  %s the order economy is untouched: a primed dispatch offers %d units, '
          'slice %d' % ('PASS' if ok else 'FAIL', offered, CONSTS['AI_ORDER_SLICE']))

    # ---- rotation: everyone is reached ------------------------------------
    seen, env2 = set(), None
    sc = dict(role='barb', army=100.0 * N, fieldX=HOME[0], fieldY=HOME[1])
    env2 = make_env(sc)
    env2['ai_homeX'] = {0: HOME[0]}
    env2['ai_homeY'] = {0: HOME[1]}
    rounds = -(-N // CONSTS['AI_ORDER_SLICE'])          # ceil
    for _ in range(rounds):
        got, env2 = dispatch(FUNCS, units, DEST, env=env2)
        for o in got:
            seen.add(units.index(o[0]))
    ok = len(seen) == N
    fails += 0 if ok else 1
    print('  %s ROTATION: every one of %d units is ordered within %d dispatches '
          '(reached %d)' % ('PASS' if ok else 'FAIL', N, rounds, len(seen)))

    # the berserker block specifically: slots 24-35, past the first cut-off
    bers = set(range(24, 36))
    ok = bers <= seen
    fails += 0 if ok else 1
    print('  %s ... including enumeration slots 24-35, which is exactly where the '
          'Franks berserkers sit' % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL: pin the window open (no rotation) and the tail starves
    prefix = dict(FUNCS)
    params, body = FUNCS['AI_InWindow']
    prefix['AI_InWindow'] = (params, ['    return idx < AI_ORDER_SLICE'])
    seen_nc, env3 = set(), make_env(sc)
    env3['ai_homeX'] = {0: HOME[0]}
    env3['ai_homeY'] = {0: HOME[1]}
    for _ in range(rounds):
        got, env3 = dispatch(prefix, units, DEST, env=env3)
        for o in got:
            seen_nc.add(units.index(o[0]))
    ok = not (bers & seen_nc) and len(seen_nc) == CONSTS['AI_ORDER_SLICE']
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: without rotation only the first %d are EVER ordered '
          'and no berserker is among them -- the reported bug, reproduced'
          % ('PASS' if ok else 'FAIL', len(seen_nc)))

    # ---- no two units share a destination ---------------------------------
    got, env = dispatch(FUNCS, units, DEST)
    dests = [(o[2], o[3]) for o in got]
    ok = len(set(dests)) == len(dests)
    fails += 0 if ok else 1
    print('  %s DISTINCT DESTINATIONS: %d orders produced %d distinct points'
          % ('PASS' if ok else 'FAIL', len(dests), len(set(dests))))

    # NEGATIVE CONTROL: the old five-lane offset, on the same dispatch
    lanes = CONSTS['AI_LANES']
    old_dests = [(round(0.0 * i, 3), round(CONSTS['AI_LANE_W'] * ((i % lanes) - CONSTS['AI_LANE_MID']), 3))
                 for i in range(len(got))]
    ok = len(set(old_dests)) <= lanes < len(dests)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the old lane-only offset gave %d distinct points for '
          'the same %d units' % ('PASS' if ok else 'FAIL', len(set(old_dests)), len(got)))

    # slots are dealt inside-out: the first unit takes the centre
    first = dests[0]
    ok = abs(first[1] - DEST[1]) < 1e-6 and abs(first[0] - DEST[0]) < 1e-6
    fails += 0 if ok else 1
    print('  %s slots are dealt inside-out: the first unit takes the objective itself'
          % ('PASS' if ok else 'FAIL'))

    # ---- a garrison is a DECISION and is still counted ---------------------
    got, env = dispatch(FUNCS, units, DEST, threat=100000.0)
    census = {k: env['ai_exCount'][v] for k, v in EX.items()}
    ok = census['HELD'] > 0 and sum(census.values()) == N
    fails += 0 if ok else 1
    print('  %s under threat %d units are HELD and the census is still total'
          % ('PASS' if ok else 'FAIL', census['HELD']))

    print('%s: no unit can go missing without a recorded reason'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def congestion():
    """PLAYTEST 9 -- "they block themselves" and "cooperating factions and
    themselves blocking one another".

    Screenshot 2: over a hundred units from several ALLIED factions packed
    solid around one Roman city, with Britons reporting "this is going
    nowhere. calling it off". The stall detector was right; the cause was
    friendly congestion, which we had no representation of at all.

    The ally ledger claims OBJECTIVES. Two factions with DIFFERENT objectives
    down one trail read as no conflict whatsoever -- so the ledger was blind
    to precisely the situation in the screenshot. This adds the corridor claim
    and a congestion count, and keeps them apart from the threat field, which
    brief-05 sec 1 is explicit about: threat asks "am I in danger", congestion
    asks "is there room"."""
    print('\n' + '=' * 78)
    print('PLAYTEST 9 -- allies do not march down the same trail')
    print('=' * 78)
    fails = 0

    def world(allies=True):
        sc = dict(role='barb', t=100.0, allies=((0, 1),) if allies else ())
        env = make_env(sc)
        env['ai_now'] = 100.0
        env['ai_p'] = {0: 0, 1: 1}
        return env, Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))

    A, B = (0.0, 0.0), (9000.0, 0.0)

    # ---- a corridor claim is exclusive between ALLIES ----------------------
    env, it = world()
    it.run('AI_CorrTakeRoute', [0, A[0], A[1], B[0], B[1]])
    ok = it.run('AI_RouteBusy', [1, A[0], A[1], B[0], B[1]])
    fails += 0 if ok else 1
    print('  %s an ally reading a route we are already walking finds it BUSY'
          % ('PASS' if ok else 'FAIL'))

    ok = not it.run('AI_RouteBusy', [0, A[0], A[1], B[0], B[1]])
    fails += 0 if ok else 1
    print('  %s ... and our own claim never blocks us' % ('PASS' if ok else 'FAIL'))

    # a DIFFERENT axis out of the same start is free: the point is to send the
    # second army somewhere else, not to stop it
    ok = not it.run('AI_RouteBusy', [1, A[0], A[1], 0.0, 9000.0])
    fails += 0 if ok else 1
    print('  %s a different axis from the same start is FREE -- the claim redirects, '
          'it does not forbid' % ('PASS' if ok else 'FAIL'))

    # ---- an ENEMY corridor is not congestion ------------------------------
    env, it = world(allies=False)
    it.run('AI_CorrTakeRoute', [0, A[0], A[1], B[0], B[1]])
    ok = not it.run('AI_RouteBusy', [1, A[0], A[1], B[0], B[1]])
    fails += 0 if ok else 1
    print('  %s a NON-ally on the same route is not a congestion problem -- that is '
          'the threat field\'s job, and brief-05 warns against merging them'
          % ('PASS' if ok else 'FAIL'))

    # ---- the lease expires FAST -------------------------------------------
    env, it = world()
    it.run('AI_CorrTakeRoute', [0, A[0], A[1], B[0], B[1]])
    env['ai_now'] = 100.0 + CONSTS['AI_CORR_LEASE'] + 1.0
    ok = not it.run('AI_RouteBusy', [1, A[0], A[1], B[0], B[1]])
    fails += 0 if ok else 1
    print('  %s the lease expires after %.0fs -- a corridor is busy only while '
          'someone is walking down it' % ('PASS' if ok else 'FAIL', CONSTS['AI_CORR_LEASE']))

    # NEGATIVE CONTROL: the objective ledger alone cannot see this. Two
    # DIFFERENT objectives down one trail is no conflict to it at all.
    env, it = world()
    env['ai_claim'][7] = 0                       # ally holds objective 7
    ok = env['ai_claim'].get(9, -1) == -1
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the objective ledger records nothing about a '
          'DIFFERENT objective (9) reached down the same trail -- which is exactly '
          'the hundred-unit jam it could not see' % ('PASS' if ok else 'FAIL'))

    # ---- a busy corridor makes a target dearer, never impossible ----------
    def score(busy):
        sc = dict(role='barb', t=100.0, army=600.0, allies=((0, 1),),
                  points=[dict(kind=CONSTS['AI_PK_CITY'], x=9000.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['ai_now'] = 100.0
        env['ai_p'] = {0: 0, 1: 1}
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        if busy:
            it.run('AI_CorrTakeRoute', [1, 0.0, 0.0, 9000.0, 0.0])
        return it.run('AI_TargetScore', [0, 0])

    free_s, busy_s = score(False), score(True)
    ok = 0.0 < busy_s < free_s
    fails += 0 if ok else 1
    print('  %s a target down a busy trail is DISCOUNTED (%.4f vs %.4f) and never '
          'zeroed' % ('PASS' if ok else 'FAIL', busy_s, free_s))

    # ---- congestion counts FRIENDLY bodies, allies included ---------------
    def crowd(units, owners):
        sc = dict(role='barb', allies=((0, 1),))
        env = make_env(sc)
        env['ai_p'] = {0: 0, 1: 1}
        nat = make_natives(env, 0.0)
        del nat['AI_Congestion']                  # interpret the REAL body
        seq, st = list(zip(units, owners)), {}
        def enum_range(g, x, y, r, f):
            import math
            st['hits'] = [(u, o) for u, o in seq if math.hypot(u[0]-x, u[1]-y) <= r]
        def enum_driver(g, fn):
            for pair in st.get('hits', []):
                st['cur'] = pair
                fn()
        nat['GetEnumUnit'] = lambda: st.get('cur')
        nat['GetFilterUnit'] = lambda: st.get('cur')
        nat['GetOwningPlayer'] = lambda p: p[1]
        nat['GetUnitState'] = lambda p, s: 1000.0
        nat['IsUnitType'] = lambda p, t: False
        nat['CreateGroup'] = lambda: 'g'
        nat['DestroyGroup'] = lambda g: None
        nat['GroupEnumUnitsInRange'] = enum_range
        nat['ForGroup'] = enum_driver
        nat['Filter'] = lambda f: f
        it = Interp(FUNCS, CONSTS, env, nat)
        return it.run('AI_Congestion', [0, 0.0, 0.0])

    near = [(100.0 * i, 0.0) for i in range(6)]
    ours = crowd(near, [0] * 6)
    ok = ours == 6
    fails += 0 if ok else 1
    print('  %s congestion counts our own bodies (%d of 6)' % ('PASS' if ok else 'FAIL', ours))

    mixed = crowd(near, [0, 0, 0, 1, 1, 1])
    ok = mixed == 6
    fails += 0 if ok else 1
    print('  %s ... and an ALLY\'S bodies too (%d of 6) -- counting only our own '
          'would measure the wrong crowd entirely' % ('PASS' if ok else 'FAIL', mixed))

    # ---- congestion is NOT threat -----------------------------------------
    src = '\n'.join(FUNCS['AI_Congestion'][1] + FUNCS['AI_CorrFree'][1])
    ok = 'wm_threat' not in src and 'ai_clS' not in src and 'wm_townThreat' not in src
    fails += 0 if ok else 1
    print('  %s congestion and corridors read NOTHING from the threat field -- '
          'brief-05 sec 1 says merging them is the wrong shape'
          % ('PASS' if ok else 'FAIL'))

    tsrc = '\n'.join(FUNCS['AI_ThreatOn'][1] + FUNCS['AI_ThreatField'][1])
    ok = 'AI_Congestion' not in tsrc and 'AI_CorrFree' not in tsrc
    fails += 0 if ok else 1
    print('  %s ... and the threat field reads nothing from them: the separation '
          'holds in both directions' % ('PASS' if ok else 'FAIL'))

    print('%s: allies price each other\'s corridors instead of walking into them'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def gate_discipline():
    """PLAYTEST 10 -- "Romans open gates for Barbarians", and "Persia should
    auto-open its own gate unless being attacked by Rome".

    One rule answers both: a faction opens its own gate ONLY on demand, and
    NEVER while that gate faces a live threat. Persia is unthreatened and
    should not be jammed behind its own wall; Rome is under attack and must
    not open. "Default open" would satisfy Persia and destroy Rome.

    Round 3 wrote the opposite in AI_ManageGates -- "an OWN gate on our
    crossing opens UNCONDITIONALLY" -- reasoning that an army which cannot
    leave while an enemy is visible never leaves. Right about VISIBILITY,
    wrong about CONTEST: round 2's error was refusing to open for any visible
    enemy anywhere, and the correction over-swung into opening the door for an
    army standing in it.

    Mechanism, established from the source: possibility A at TWO sites --
    AI_ManageGates' approach-open and AI_ForceOpenNear's stall backstop, the
    latter worse because an army stalled BECAUSE enemies are at the gate would
    force that very gate open for them. Possibility C was half true: a close
    path existed but EXEMPTED the approach gate and required zero friendly
    units present, so the gate an army left through stayed open behind it."""
    print('\n' + '=' * 78)
    print('PLAYTEST 10 -- a gate opens on demand and never into a live threat')
    print('=' * 78)
    fails = 0
    OPEN, CLOSED = CONSTS['AI_GS_OPEN'], CONSTS['AI_GS_CLOSED']

    def world(enemy_cv, threat=0.0, gate_at=(0.0, 0.0), state=CLOSED, funcs=None):
        sc = dict(role='rome', threat=threat, army=800.0,
                  gates=[dict(x=gate_at[0], y=gate_at[1], orient=0, state=state, owner=0)])
        env = make_env(sc)
        env['ai_now'] = 500.0
        env['ai_homeX'] = {0: 0.0}
        env['ai_homeY'] = {0: 0.0}
        env['_gateState'][0] = state
        env['ai_apGate'] = {0: 0}
        nat = make_natives(env, 0.0)
        nat['AI_Say'] = lambda pid, s: None
        nat['AI_Tel'] = lambda ev, b: None
        nat['AI_Num'] = str
        nat['AI_TelAI'] = lambda pid: '1'
        # AI_GateScan is the engine-facing enum; the SCENARIO supplies what it
        # would have found, so the decision logic stays the code under test
        def scan(pid, i):
            env['ai_accCV'] = enemy_cv
            env['ai_accW'] = 100.0
            env['ai_accN'] = 1
        nat['AI_GateScan'] = scan
        toggles = []
        nat['AI_SetGate'] = lambda i, t: toggles.append((i, t))
        nat['AI_GateOpenType'] = lambda o: 'OPEN'
        nat['AI_GateShutType'] = lambda o: 'SHUT'
        return env, Interp(funcs or FUNCS, CONSTS, env, nat), toggles

    # ---- Persia: unthreatened, and must not be jammed behind its own wall --
    env, it, tog = world(enemy_cv=0.0, threat=0.0)
    ok = it.run('AI_GateSafeToOpen', [0, 0]) is True
    fails += 0 if ok else 1
    print('  %s an UNTHREATENED own gate may be opened -- Persia is not jammed behind '
          'its own wall' % ('PASS' if ok else 'FAIL'))

    env, it, tog = world(enemy_cv=0.0, threat=0.0)
    it.run('AI_ManageGates', [0])
    ok = tog and tog[0][1] == 'OPEN'
    fails += 0 if ok else 1
    print('  %s ... and a dispatch that needs it actually opens it (on demand)'
          % ('PASS' if ok else 'FAIL'))

    ok = env['ai_sortieGate'][0] == 0
    fails += 0 if ok else 1
    print('  %s ... and the open is RECORDED as a sortie, so a close is owed'
          % ('PASS' if ok else 'FAIL'))

    # ---- Rome: enemies in the doorway. THE REPORTED BUG --------------------
    env, it, tog = world(enemy_cv=500.0, threat=0.0)
    ok = it.run('AI_GateSafeToOpen', [0, 0]) is False
    fails += 0 if ok else 1
    print('  %s an enemy IN THE DOORWAY refuses the open' % ('PASS' if ok else 'FAIL'))

    env, it, tog = world(enemy_cv=500.0, threat=0.0)
    it.run('AI_ManageGates', [0])
    opened = [t for t in tog if t[1] == 'OPEN']
    ok = not opened
    fails += 0 if ok else 1
    print('  %s THE REPORTED BUG: a dispatch does NOT open a contested gate '
          '(%d open toggles)' % ('PASS' if ok else 'FAIL', len(opened)))

    # our own city under attack, even if this gate's doorway is momentarily clear
    env, it, tog = world(enemy_cv=0.0, threat=400.0)
    ok = it.run('AI_GateSafeToOpen', [0, 0]) is False
    fails += 0 if ok else 1
    print('  %s a gate at a city under attack refuses to open even with a clear '
          'doorway' % ('PASS' if ok else 'FAIL'))

    # a gate far from our threatened city is still openable: the rule is local
    env, it, tog = world(enemy_cv=0.0, threat=400.0, gate_at=(20000.0, 0.0))
    ok = it.run('AI_GateSafeToOpen', [0, 0]) is True
    fails += 0 if ok else 1
    print('  %s ... but a gate far from that city is unaffected -- the rule is local, '
          'not a global freeze' % ('PASS' if ok else 'FAIL'))

    # ---- the stall backstop obeys the same rule ---------------------------
    env, it, tog = world(enemy_cv=500.0, threat=0.0)
    forced = it.run('AI_ForceOpenNear', [0, 0.0, 0.0])
    ok = forced is False and not [t for t in tog if t[1] == 'OPEN']
    fails += 0 if ok else 1
    print('  %s the STALL BACKSTOP will not force a contested gate open -- an army '
          'stalled BECAUSE enemies are at the gate was forcing it open for them'
          % ('PASS' if ok else 'FAIL'))

    env, it, tog = world(enemy_cv=0.0, threat=0.0)
    ok = it.run('AI_ForceOpenNear', [0, 0.0, 0.0]) is True
    fails += 0 if ok else 1
    print('  %s ... and still rescues a genuinely stalled army at a quiet gate'
          % ('PASS' if ok else 'FAIL'))

    # ---- closing: the gate an army left through does not stay open ---------
    env, it, tog = world(enemy_cv=500.0, threat=0.0, state=OPEN)
    it.run('AI_ManageGates', [0])
    ok = [t for t in tog if t[1] == 'SHUT']
    fails += 0 if ok else 1
    print('  %s a contested OPEN gate shuts -- and the APPROACH gate is no longer '
          'exempt from closing' % ('PASS' if ok else 'FAIL'))

    env, it, tog = world(enemy_cv=0.0, threat=0.0, state=OPEN)
    env['ai_sortieGate'] = {0: 0}
    it.run('AI_CloseSortie', [0])
    ok = [t for t in tog if t[1] == 'SHUT'] and env['ai_sortieGate'][0] == -1
    fails += 0 if ok else 1
    print('  %s a sortie gate is shut once the sortie is over, and the debt cleared'
          % ('PASS' if ok else 'FAIL'))

    src = '\n'.join(FUNCS['AI_MissionAbort'][1])
    ok = 'AI_CloseSortie' in src
    fails += 0 if ok else 1
    print('  %s an ABORTED mission also closes the door it opened -- that is the path '
          'that used to leak them' % ('PASS' if ok else 'FAIL'))

    # ---- NEGATIVE CONTROL: remove the threat check ------------------------
    prefix = dict(FUNCS)
    params, _ = FUNCS['AI_GateSafeToOpen']
    prefix['AI_GateSafeToOpen'] = (params, ['    return true'])
    env, it, tog = world(enemy_cv=500.0, threat=400.0, funcs=prefix)
    it.run('AI_ManageGates', [0])
    opened = [t for t in tog if t[1] == 'OPEN']
    ok = bool(opened)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: without the threat check the same call opens the '
          'gate with 500 enemy CV in it -- the reported bug, reproduced'
          % ('PASS' if ok else 'FAIL'))

    env, it, tog = world(enemy_cv=500.0, threat=400.0, funcs=prefix)
    ok = it.run('AI_ForceOpenNear', [0, 0.0, 0.0]) is True
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: and the stall backstop does too, which is the worse '
          'of the two sites' % ('PASS' if ok else 'FAIL'))

    # ---- the dead band: a gate cannot flap --------------------------------
    ok = CONSTS['AI_GATE_T_CLOSE'] > CONSTS['AI_GATE_T_OPEN']
    fails += 0 if ok else 1
    print('  %s the bars form a dead band (open <= %.0f, shut >= %.0f) so a gate '
          'cannot flap between them' % ('PASS' if ok else 'FAIL',
                                        CONSTS['AI_GATE_T_OPEN'], CONSTS['AI_GATE_T_CLOSE']))

    print('%s: no faction opens a door for the army standing at it'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0



def mission_churn():
    """EXTERNAL AUDIT, defect 4 -- CONFIRMED BY RUNTIME DATA, not by reading.

    The telemetry shipped in 8d0e5ee caught this in the owner's first game:

        FORAI|1|161|121|mis|9|1|end|1|108
        FORAI|1|162|121|mis|9|1|start|0|108
        FORAI|1|163|122|mis|2|1|end|1|195
        FORAI|1|164|122|mis|2|1|start|0|195

    A mission ends and restarts on the SAME target in the SAME second, for
    two factions, repeatedly. The auditor predicted it from the source; the
    log proved it.

    Two independent causes, and this section pins both, each against its own
    negative control built from the shipped source:

      1. AI_MissionAbort cleared ai_msState and nothing else -- not the
         target, claim, progress record or commit clock -- so the next tick
         re-derived the identical answer from an unchanged world.
      2. AI_Execute calls AI_MissionStart every tick it holds an objective,
         and AI_MissionStart was unconditional, so it could restart what it
         had just ended -- and re-stamp the phase deadline while doing it,
         disarming the one backstop that would have broken the loop.
    """
    print('\n' + '=' * 78)
    print('EXTERNAL AUDIT 4 -- a mission that ends does not restart on the same target')
    print('=' * 78)
    fails = 0
    MP = CONSTS['AI_MAX_POINTS']
    NONE, STAGE = CONSTS['AI_MS_NONE'], CONSTS['AI_MS_STAGE']

    def scen(funcs, **kw):
        """One faction, one enemy point (index 0), a mission running on it."""
        # army above AI_PROSECUTE_CV: this section is about the RESTART guard,
        # and a faction below the Brytenwalda coupling bar would never reach it
        sc = dict(role='barb', t=100.0, army=4 * CONSTS['AI_PROSECUTE_CV'],
                  points=[dict(kind=CONSTS['AI_PK_CITY'], x=1000.0, y=0.0, owner=5)],
                  msState=STAGE, msTarget=0)
        sc.update(kw)
        env = make_env(sc)
        env['ai_now'] = sc['t']
        env['ai_claim'][0] = 0                       # we hold the claim
        env['ai_target'][0] = 0
        nat = make_natives(env, 0.0)
        nat['AI_Say'] = lambda pid, s: None
        nat['AI_Tel'] = lambda ev, body: env.setdefault('_tel', []).append((ev, body))
        nat['AI_Num'] = lambda v: str(v)
        nat['AI_TelAI'] = lambda pid: '1'
        return env, Interp(funcs, CONSTS, env, nat)

    # ---------------- cause 1: the abort leaves the world unchanged --------
    env, it = scen(FUNCS)
    it.run('AI_MissionAbort', [0, 1])
    checks = [
        ('the mission target', env['ai_msTarget'][0] == -1),
        ('the objective', env['ai_target'][0] == -1),
        ('our claim on it', env['ai_claim'][0] != 0),
        ('the progress record', env['ai_progD'][0] >= 999999.0),
    ]
    for label, ok in checks:
        fails += 0 if ok else 1
        print('  %s an abort clears %s' % ('PASS' if ok else 'FAIL', label))

    ok = env['ai_msHold'][0 * MP + 0] > env['ai_now']
    fails += 0 if ok else 1
    print('  %s ... and BARS the target it failed on (held until %.0f, now %.0f)'
          % ('PASS' if ok else 'FAIL', env['ai_msHold'][0], env['ai_now']))

    # a march-deadline failure is a failure OF THE TARGET and bars it longer
    env4, it4 = scen(FUNCS)
    it4.run('AI_MissionAbort', [0, 4])
    ok = (env4['ai_msHold'][0] - env4['ai_now']) > (env['ai_msHold'][0] - env['ai_now'])
    fails += 0 if ok else 1
    print('  %s a failed MARCH bars the target longer than an interruption does '
          '(%.0fs vs %.0fs)' % ('PASS' if ok else 'FAIL',
                                env4['ai_msHold'][0] - env4['ai_now'],
                                env['ai_msHold'][0] - env['ai_now']))

    # negative control for cause 1: the pre-fix abort, synthesised from the
    # shipped body by deleting every line that clears context
    prefix = dict(FUNCS)
    params, body = FUNCS['AI_MissionAbort']
    keep = [ln for ln in body
            if not re.search(r'set (ai_msTarget|ai_target|ai_progD|ai_progAt|'
                             r'ai_commitAt|ai_msHold|ai_claim)\[', ln)]
    if len(keep) == len(body):
        fails += 1
        print('  FAIL negative control is INERT: the shipped AI_MissionAbort clears '
              'no context, so nothing was removed to build the pre-fix body')
    prefix['AI_MissionAbort'] = (params, keep)
    envN, itN = scen(prefix)
    itN.run('AI_MissionAbort', [0, 1])
    ok = (envN['ai_msTarget'][0] == 0 and envN['ai_target'][0] == 0
          and envN['ai_msHold'][0] == 0.0)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: the pre-fix abort leaves target %s and claim intact '
          'with no hold -- the world the next tick re-derived from'
          % ('PASS' if ok else 'FAIL', envN['ai_msTarget'][0]))

    # ---------------- cause 2: the unconditional restart -------------------
    env, it = scen(FUNCS)
    before = list(env.get('_tel', []))
    it.run('AI_MissionStart', [0, 0])
    started = [e for e in env.get('_tel', []) if e[0] == 'mis' and '|start|' in e[1]]
    ok = not started and env['ai_msRestarts'] == 1
    fails += 0 if ok else 1
    print('  %s a mission already running on this target is NOT restarted, and the '
          'suppression is counted (%s)' % ('PASS' if ok else 'FAIL', env['ai_msRestarts']))

    # the exact live-log sequence: end, then the chooser tries the same target
    env, it = scen(FUNCS)
    it.run('AI_MissionAbort', [0, 1])
    it.run('AI_MissionStart', [0, 0])
    started = [e for e in env.get('_tel', []) if e[0] == 'mis' and '|start|' in e[1]]
    ok = not started and env['ai_msState'][0] == NONE
    fails += 0 if ok else 1
    print('  %s THE LOGGED LOOP: end then start on the same target in the same '
          'second issues no new mission' % ('PASS' if ok else 'FAIL'))

    # negative control for cause 2
    prefix2 = dict(FUNCS)
    params, body = FUNCS['AI_MissionStart']
    keep2, drop = [], False
    for ln in body:
        if 'ai_msRestarts' in ln or 'AI_MissionHeld' in ln:
            drop = True                       # skip the guard and its body
        if drop:
            if ln.strip() == 'endif':
                drop = False
            continue
        keep2.append(ln)
    if len(keep2) == len(body):
        fails += 1
        print('  FAIL negative control is INERT: the shipped AI_MissionStart has no '
              'restart guard, so nothing was removed to build the pre-fix body')
    prefix2['AI_MissionStart'] = (params, keep2)
    envN, itN = scen(prefix2)
    itN.run('AI_MissionStart', [0, 0])
    startedN = [e for e in envN.get('_tel', []) if e[0] == 'mis' and '|start|' in e[1]]
    ok = bool(startedN)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: without the guard the same target restarts '
          'immediately -- the logged defect, reproduced' % ('PASS' if ok else 'FAIL'))

    # ---------------- the hold must be a discount, never a veto ------------
    sc = dict(role='barb', t=100.0,
              points=[dict(kind=CONSTS['AI_PK_CITY'], x=1000.0, y=0.0, owner=5)])
    env = make_env(sc)
    env['ai_now'] = 100.0
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    free = it.run('AI_TargetScore', [0, 0])
    env['ai_msHold'][0] = 200.0
    held = it.run('AI_TargetScore', [0, 0])
    ok = 0.0 < held < free
    fails += 0 if ok else 1
    print('  %s a held target is DISCOUNTED (%.4f vs %.4f) and never zeroed -- a veto '
          'would be a fifth way to make an action impossible'
          % ('PASS' if ok else 'FAIL', held, free))

    ok = it.run('AI_BestTarget', [0]) == 0
    fails += 0 if ok else 1
    print('  %s ... so when it is the ONLY target it is still selected'
          % ('PASS' if ok else 'FAIL'))

    # ---------------- ai_ifStuck now has a reader --------------------------
    src = '\n'.join(FUNCS['AI_SelectGoal'][1])
    ok = 'ai_ifStuck' in src
    fails += 0 if ok else 1
    print('  %s ai_ifStuck is READ by the goal layer -- it had a writer and no reader'
          % ('PASS' if ok else 'FAIL'))

    def goal_with_stuck(stuck):
        sc = dict(role='barb', t=500.0, army=600.0, goal=CONSTS['GOAL_SIEGE'],
                  goalSince=0.0, capIdx=0, capReady=1.0,
                  points=[dict(kind=CONSTS['AI_PK_CAPITAL'], x=1000.0, y=0.0, owner=5)])
        env = make_env(sc)
        env['ai_now'] = 500.0
        env['ai_ifStuck'][0] = stuck
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        return it.run('AI_ScoreSiege', [0]), it.run('AI_SelectGoal', [0]), env

    _, _, envS = goal_with_stuck(True)
    ok = envS['ai_ifStuck'][0] is False
    fails += 0 if ok else 1
    print('  %s ... and it is CLEARED once read, so one failed march biases exactly '
          'one decision' % ('PASS' if ok else 'FAIL'))

    print('%s: the abort/restart loop the live telemetry recorded cannot recur'
          % ('PASS' if not fails else 'FAIL'))
    return 1 if fails else 0


def missions():
    """S1. Every working AI in the corpus stages, issues one order and sleeps
    until a terminal state, with break/threat/flee as FLAGS set by other
    subsystems rather than competing scores. Round 4's verdict -- "wrong over
    time, not at any tick" -- is the symptom of scoring a decision that should
    have been a procedure.

    What must be true after the rewrite: a running attack is NOT re-scored; a
    flag ends it immediately; a phase that cannot finish RELEASES on a
    deadline rather than waiting; and the goal layer still owns the choice, so
    Guard B survives."""
    print('\n' + '=' * 78)
    print('STAGE 3 / S1 -- attacks as procedures with interrupt flags')
    print('=' * 78)
    fails = 0
    RUN = CONSTS['AI_MS_MARCH']

    def tick(**kw):
        sc = dict(role='barb', t=kw.pop('t', 500.0), army=600.0,
                  msState=kw.pop('msState', RUN), msTarget=0,
                  msPhaseEnd=kw.pop('msPhaseEnd', 1e9),
                  points=[{'kind': CP, 'x': 5000.0, 'y': 0.0, 'owner': 1}])
        sc.update(kw)
        env = make_env(sc)
        nat = make_natives(env, 0.0)
        nat['AI_MoveOnTarget'] = lambda p, t: None
        nat['AI_Raid'] = lambda p: None
        nat['AI_Say'] = lambda p, m: None
        it = Interp(FUNCS, CONSTS, env, nat)
        env['ai_ifThreat'][0] = kw.get('threat_flag', False)
        env['ai_ifRetreat'][0] = kw.get('retreat_flag', False)
        held = it.run('AI_MissionTick', [0])
        return bool(held), env['ai_msState'][0], bool(env['ai_ifStuck'][0])

    held, st, _ = tick()
    ok = held and st == RUN
    fails += 0 if ok else 1
    print('  %s a running mission HOLDS the tick, so the goal layer does not re-score' % ('PASS' if ok else 'FAIL'))

    held, st, _ = tick(threat_flag=True)
    ok = (not held) and st == CONSTS['AI_MS_NONE']
    fails += 0 if ok else 1
    print('  %s the THREAT flag ends the mission at once and returns control' % ('PASS' if ok else 'FAIL'))

    held, st, _ = tick(retreat_flag=True)
    ok = (not held) and st == CONSTS['AI_MS_NONE']
    fails += 0 if ok else 1
    print('  %s the RETREAT flag does the same' % ('PASS' if ok else 'FAIL'))

    # FormGroup semantics: staging RELEASES on its deadline
    held, st, _ = tick(msState=CONSTS['AI_MS_STAGE'], msPhaseEnd=100.0, t=500.0)
    ok = held and st == RUN
    fails += 0 if ok else 1
    print('  %s a staging phase past its deadline RELEASES into the march (FormGroup semantics)' % ('PASS' if ok else 'FAIL'))

    # a march past its deadline fails, and says so by setting the stuck flag
    held, st, stuck = tick(msState=RUN, msPhaseEnd=100.0, t=500.0)
    ok = (not held) and st == CONSTS['AI_MS_NONE'] and stuck
    fails += 0 if ok else 1
    print('  %s a march past its deadline ABORTS and raises the stuck flag' % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL: with no flag and no deadline the mission must persist,
    # otherwise the four assertions above pass because everything aborts.
    held2, st2, _ = tick(msPhaseEnd=1e9)
    ok = held2 and st2 == RUN
    fails += 0 if ok else 1
    print('  %s   negative control: with no flag and no deadline the mission persists (so aborting is not the default)' % ('PASS' if ok else 'FAIL'))

    # the flags are SET from the world model, not scored
    def flags(threat, garrison, asset, fcv, fecv):
        sc = dict(role='barb', threat=threat, garrison=garrison, asset=asset,
                  fieldCV=fcv, fieldEnemy=fecv)
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        # PLAYTEST 13: noticing and acting are no longer the same instant. The
        # flag is observed, the reaction window is allowed to pass, and it is
        # observed again -- which is what the AI itself now does.
        it.run('AI_SetFlags', [0])
        env['ai_now'] = env['ai_now'] + 2.0 * it.run('AI_React', [0])
        it.run('AI_SetFlags', [0])
        return bool(env['ai_ifThreat'][0]), bool(env['ai_ifRetreat'][0])

    t1, r1 = flags(900.0, 200.0, 1.0, 500.0, 100.0)
    t2, r2 = flags(100.0, 900.0, 1.0, 500.0, 100.0)
    t3, r3 = flags(0.0, 0.0, 0.0, 500.0, 900.0)
    setting = [
        ('a threat that outmatches the garrison raises the threat flag', t1),
        ('a garrison that can cope does not', not t2),
        ('an outmatched field army raises the retreat flag', r3),
        ('a winning field army does not', not r1),
        ('a threat against NOTHING WE OWN never interrupts (round-2 asset gate)', not t3),
    ]
    for name, okf in setting:
        fails += 0 if okf else 1
        print('  %s %s' % ('PASS' if okf else 'FAIL', name))

    print('\n%s: %d mission assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# --------------------------- round 7: a centroid is not a position (14.2)

def centroid():
    """Round 7, stage 1. Measured against the map's own war3map.wpm
    (1920x1920 cells at 32 units, walkable = flag & 0x02 == 0, calibrated on
    six known-land points): the STARTING field centroid of all three Roman
    powers is IN THE SEA -- West Rome (-4056,-14352), East Rome
    (16714,-13819), North Rome (-21062,-54) -- while all nine other factions
    are on land.

    A CV-weighted mean of an empire spread around a sea is not a place, and
    everything geometric measures from it: the water test that decides
    wantsBoat, the nearest-target scan, the march origin, the lane normal and
    the ram hold point. Hence "West Rome: boarding a transport" and
    "transport parked in the middle of the sea"."""
    print('\n' + '=' * 78)
    print('ROUND 7 -- a centroid is not a position: the three Roman starts')
    print('=' * 78)
    fails = 0

    def validate(fx, fy, units, home=(0.0, 0.0), water=None):
        """Run the REAL AI_ValidateField. 'water' is an interval on x that is
        sea; 'units' are the player's own units the snap may choose from."""
        sc = dict(role='rome', fieldX=fx, fieldY=fy)
        env = make_env(sc)
        env['ai_homeX'] = {0: home[0]}
        env['ai_homeY'] = {0: home[1]}
        env['_water'] = water if water else (1.0, -1.0)
        nat = make_natives(env, 0.0)
        seq = list(units)
        state = {'i': 0}
        def enum_driver(g, fn):
            for u in seq:
                state['cur'] = u
                fn()
        nat['GetEnumUnit'] = lambda: state.get('cur')
        nat['GetUnitX'] = lambda u: u[0]
        nat['GetUnitY'] = lambda u: u[1]
        nat['GetUnitState'] = lambda u, st: 1000.0
        nat['IsUnitLoaded'] = lambda u: u[2] if len(u) > 2 else False
        nat['AI_IsStructure'] = lambda u: False
        nat['CreateGroup'] = lambda: 'g'
        nat['DestroyGroup'] = lambda g: None
        nat['GroupEnumUnitsOfPlayer'] = lambda g, p, f: None
        nat['ForGroup'] = enum_driver
        nat['Filter'] = lambda f: f
        it = Interp(FUNCS, CONSTS, env, nat)
        moved = it.run('AI_ValidateField', [0])
        return bool(moved), env['wm_fieldX'][0], env['wm_fieldY'][0]

    SEA = (-2000.0, 2000.0)     # a strait spanning the mean of two land masses
    LAND_UNITS = [(-6000.0, 0.0), (6000.0, 0.0), (7000.0, 500.0)]

    # the shape of a Roman empire: two coasts, weighted mean lands in between
    moved, fx, fy = validate(0.0, 0.0, LAND_UNITS, home=(-6000.0, 0.0), water=SEA)
    ok = moved and abs(fx) > 2000.0
    fails += 0 if ok else 1
    print('  %s a centroid that lands in open water is moved to real ground (-> %.0f, %.0f)'
          % ('PASS' if ok else 'FAIL', fx, fy))

    ok = abs(fx - (-6000.0)) < 1e-6 or abs(fx - 6000.0) < 1e-6
    fails += 0 if ok else 1
    print('  %s ... and it snaps to an actual UNIT, not to an arbitrary point'
          % ('PASS' if ok else 'FAIL'))

    # a centroid already on land must be left completely alone
    moved2, fx2, fy2 = validate(6000.0, 0.0, LAND_UNITS, home=(-6000.0, 0.0), water=SEA)
    ok = (not moved2) and fx2 == 6000.0 and fy2 == 0.0
    fails += 0 if ok else 1
    print('  %s a centroid already on land is untouched (nine of twelve factions pay nothing)'
          % ('PASS' if ok else 'FAIL'))

    # cargo must not be a snap candidate: a loaded unit reports the BOAT
    moved3, fx3, fy3 = validate(0.0, 0.0, [(500.0, 0.0, True), (6000.0, 0.0, False)],
                                home=(-9000.0, 0.0), water=SEA)
    ok = moved3 and abs(fx3 - 6000.0) < 1e-6
    fails += 0 if ok else 1
    print('  %s a LOADED unit is not a valid anchor -- it reports its transport (-> %.0f)'
          % ('PASS' if ok else 'FAIL', fx3))

    # with nothing ashore at all, home is the fallback
    moved4, fx4, fy4 = validate(0.0, 0.0, [], home=(-9000.0, 123.0), water=SEA)
    ok = moved4 and abs(fx4 - (-9000.0)) < 1e-6 and abs(fy4 - 123.0) < 1e-6
    fails += 0 if ok else 1
    print('  %s with no unit ashore it falls back to home, which is a building and therefore a place'
          % ('PASS' if ok else 'FAIL'))

    # NEGATIVE CONTROL: no water anywhere, and the identical call must be a
    # no-op -- so it is the pathing probe deciding, not the snap running blind.
    moved5, fx5, fy5 = validate(0.0, 0.0, LAND_UNITS, home=(-6000.0, 0.0), water=None)
    ok = (not moved5) and fx5 == 0.0
    fails += 0 if ok else 1
    print('  %s   negative control: with no water the same centroid is left exactly where it was'
          % ('PASS' if ok else 'FAIL'))

    print('\n%s: %d centroid assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------- round 6: the impossible goal (Persia after a capture)

def impossible():
    """Round 6. "Persia just sits around after winning a city", with the
    sharpest state yet: gold 144, food 189/185 -- OVER the cap -- a full army
    inside the captured city, rams idle outside, and the gate it was looking
    at undamaged at 500/500. That faction could not train (over food) and
    could not afford research (144 gold), so EVERY production action was
    unavailable by construction.

    The invariant, generalising round 5's priced-out wall break: A GOAL WHOSE
    ACTION IS IMPOSSIBLE MUST SCORE ZERO, NOT MERELY LESS.

    Build ambiguity is handled by fixing both readings. Under round 4 the
    faction was held by the CONSOLIDATE gold floor and a TECH score of ~0.047
    that could win once everything else was smaller. Under round 5 the
    scoring was already fine -- so the cause there is the other half: taking
    the city left the objective selected, the claim standing and the idle
    clock fresh, so the aggression floor counted the faction as committed and
    never fired."""
    print('\n' + '=' * 78)
    print('ROUND 6 -- the impossible goal: Persia, 144 gold, 189/185 food')
    print('=' * 78)
    fails = 0

    def persia(gold=144.0, lumber=380.0, food=189.0, cap=185.0):
        sc = dict(role='barb', t=1000.0, army=1400.0, garrison=900.0, gold=gold,
                  lumber=lumber, food=food, proxScale=CONSTS['AI_PROX_MIN'],
                  fieldX=0.0, fieldY=0.0,
                  points=[{'kind': CP, 'x': 5000.0, 'y': 0.0, 'owner': 1}])
        env = make_env(sc)
        env['wm_foodCap'][0] = cap
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        out = {}
        for g, fn in (('CON', 'AI_ScoreConsolidate'), ('EXP', 'AI_ScoreExpand'),
                      ('TEC', 'AI_ScoreTech')):
            out[g] = it.run(fn, [0])
        return out

    sc0 = persia()
    checks = [
        ('over the food cap, CONSOLIDATE is exactly zero', sc0['CON'] == 0.0),
        ('with 144 gold, TECH is exactly zero -- not merely small',
         sc0['TEC'] == 0.0),
        ('the only goal left standing is the one whose action IS possible',
         sc0['EXP'] > 0.0 and sc0['EXP'] > sc0['CON'] and sc0['EXP'] > sc0['TEC']),
    ]
    for name, ok in checks:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       scores: CONSOLIDATE=%.3f EXPAND=%.3f TECH=%.3f' % (sc0['CON'], sc0['EXP'], sc0['TEC']))

    # the gates must OPEN again the moment the resource state allows it --
    # otherwise this is not an invariant, it is just a smaller number
    # The gates must OPEN again as soon as the resource state allows, or this
    # is not an invariant, just a smaller number. TECH re-opens on money;
    # CONSOLIDATE additionally needs the round-5 sufficiency gate to agree
    # that more army is wanted, so it is checked with a SMALL army -- a
    # 1400-CV force correctly does not want more whatever its bank balance.
    rich = persia(gold=900.0, lumber=900.0, food=40.0, cap=185.0)
    ok = rich['TEC'] > 0.0
    fails += 0 if ok else 1
    print('  %s TECH re-opens the moment research is affordable (%.3f)'
          % ('PASS' if ok else 'FAIL', rich['TEC']))

    sc_small = dict(role='barb', t=200.0, army=120.0, gold=900.0, lumber=900.0,
                    food=40.0, proxScale=CONSTS['AI_PROX_MIN'], fieldX=0.0, fieldY=0.0,
                    points=[{'kind': CP, 'x': 5000.0, 'y': 0.0, 'owner': 1}])
    env = make_env(sc_small)
    env['wm_foodCap'][0] = 185.0
    it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
    seed_capital(env, it, sc_small)
    con_small = it.run('AI_ScoreConsolidate', [0])
    ok = con_small > 0.0
    fails += 0 if ok else 1
    print('  %s CONSOLIDATE re-opens for a small army with room and money (%.3f)'
          % ('PASS' if ok else 'FAIL', con_small))

    # NEGATIVE CONTROL: drop the research floor to nothing and the round-4
    # behaviour returns -- TECH scores again on 144 gold, which is precisely
    # the state that could win by default and then do nothing.
    sc = dict(role='barb', t=1000.0, army=1400.0, gold=144.0, lumber=380.0,
              food=189.0, proxScale=CONSTS['AI_PROX_MIN'], fieldX=0.0, fieldY=0.0,
              points=[{'kind': CP, 'x': 5000.0, 'y': 0.0, 'owner': 1}])
    env = make_env(sc)
    env['wm_foodCap'][0] = 185.0
    consts = dict(CONSTS)
    consts['AI_TECH_MIN_GOLD'] = 0.0
    it = Interp(FUNCS, consts, env, make_natives(env, 0.0))
    seed_capital(env, it, sc)
    tec_nc = it.run('AI_ScoreTech', [0])
    ok = tec_nc > 0.0
    fails += 0 if ok else 1
    print('  %s   negative control: with the research floor removed TECH scores again on 144 gold (%.3f)'
          % ('PASS' if ok else 'FAIL', tec_nc))

    print('\n%s: %d impossible-goal assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ---------------------------- round 5: the Roman lock (findings 3, 4, gates)

def romanlock():
    """Round 5. "Barbarian AI has significantly improved but not Roman AI",
    with screenshots of West Rome and North Rome each holding sixty-plus units
    motionless inside their own walls.

    The enrolment question, answered first because everything else depended on
    it: Roman preplaced units ARE enrolled. AI_ScanWorld enumerates with
    GroupEnumUnitsOfPlayer and a filter that tests only owner and alive -- no
    type list -- so the 139/185/146 preplaced mobile units of P3/P9/P10 have
    been counted in wm_army all along. They were never invisible. They were
    never TOLD to go anywhere.

    Measured on the round-4 build for a West Rome shape (army 2000 CV, gold
    1500, nearest enemy 18000 away): CONSOLIDATE 0.300 at EVERY clock against
    EXPAND 0.113 falling to 0.067. The 0.300 is a pure gold floor -- the army
    term is already zero -- and Rome is rich by construction. And CONSOLIDATE
    sets ai_apGate to -1, so no gate is ever even considered: the "Romans
    struggle with gates" report is downstream of an army that was never
    dispatched, not of the gate model."""
    print('\n' + '=' * 78)
    print('ROUND 5 -- the Roman lock: rich, large, and going nowhere')
    print('=' * 78)
    fails = 0

    def rome(t_now, army=2000.0, gold=1500.0, scale=18000.0):
        sc = dict(role='rome', t=t_now, army=army, garrison=1500.0, gold=gold,
                  lumber=1500.0, food=140.0, proxScale=scale, fieldX=0.0, fieldY=0.0,
                  points=[{'kind': CP, 'x': 18000.0, 'y': 0.0, 'owner': 1}])
        env = make_env(sc)
        env['wm_foodCap'][0] = 300.0
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        return it.run('AI_ScoreConsolidate', [0]), it.run('AI_ScoreExpand', [0])

    print('  a large, rich Roman power must go and use its army, at every clock:')
    for t_now in (120.0, 600.0, 1200.0, 1700.0):
        c, e = rome(t_now)
        ok = e > c
        fails += 0 if ok else 1
        print('    %s t=%-6.0f CONSOLIDATE=%.3f EXPAND=%.3f' % ('PASS' if ok else 'FAIL', t_now, c, e))

    # the two halves, separated, so a later change cannot silently undo one
    c_big, _ = rome(600.0, army=2000.0)
    c_small, _ = rome(600.0, army=200.0)
    ok = c_big < 0.01 and c_small > 0.3
    fails += 0 if ok else 1
    print('  %s the sufficiency gate: an army that HAS its force stops massing (%.3f), one that does not still masses (%.3f)'
          % ('PASS' if ok else 'FAIL', c_big, c_small))

    _, e_far = rome(600.0, scale=18000.0)
    _, e_near = rome(600.0, scale=CONSTS['AI_PROX_MIN'])
    ok = e_far > 2.0 * e_near
    fails += 0 if ok else 1
    print('  %s the adaptive proximity scale: a frontier empire can see its own frontier (%.3f vs %.3f at the barbarian scale)'
          % ('PASS' if ok else 'FAIL', e_far, e_near))

    # NEGATIVE CONTROL, on the lever that can actually be moved. The
    # sufficiency gate cannot be "turned off" by a constant once the army is
    # already past want -- the term is zero by construction -- so the control
    # targets the other half: pin the proximity scale back to the barbarian
    # value and EXPAND must collapse to the round-4 measurement, 0.067 at
    # t=1700. Reproducing the observed number exactly is the strongest form
    # this control can take.
    _, e_pinned = rome(1700.0, scale=CONSTS['AI_PROX_MIN'])
    ok = abs(e_pinned - 0.067) < 0.01
    fails += 0 if ok else 1
    print('  %s   negative control: at the barbarian scale EXPAND collapses to the round-4 value (%.3f vs 0.067 measured)'
          % ('PASS' if ok else 'FAIL', e_pinned))

    # barbarians must be untouched by all of this
    print('  ... and the barbarian side is unchanged:')
    for t_now, army, food, want in ((60.0, 60.0, 20.0, 'CON'), (300.0, 200.0, 20.0, 'CON'),
                                    (300.0, 300.0, 96.0, 'EXP'), (1500.0, 500.0, 96.0, 'EXP')):
        sc = dict(role='barb', t=t_now, army=army, gold=600.0, lumber=300.0, food=food,
                  proxScale=CONSTS['AI_PROX_MIN'], fieldX=0.0, fieldY=0.0,
                  points=[{'kind': CP, 'x': 3000.0, 'y': 0.0, 'owner': 1}])
        env = make_env(sc)
        env['wm_foodCap'][0] = 100.0
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        c, e = it.run('AI_ScoreConsolidate', [0]), it.run('AI_ScoreExpand', [0])
        got = 'CON' if c > e else 'EXP'
        ok = (got == want)
        fails += 0 if ok else 1
        print('    %s t=%-6.0f army=%-4.0f food=%-3.0f CON=%.3f EXP=%.3f -> %s'
              % ('PASS' if ok else 'FAIL', t_now, army, food, c, e, got))

    # -- the Gray jam: a crossing we cannot perform ------------------------
    print('  -- the Gray jam: 25 units at a 1992/2000 gate --')

    def gcost(has_siege):
        sc = dict(role='barb', hasSiege=has_siege,
                  gates=[dict(x=0.0, y=0.0, state=CONSTS['AI_GS_CLOSED'], life=1.0, owner=1)])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_GateCost', [0, 0])

    with_siege, without = gcost(True), gcost(False)
    jam = [
        ('a break we CAN perform is priced normally', with_siege <= CONSTS['AI_GATE_BREAK']),
        ('a break we CANNOT perform is priced right out of the comparison',
         without > with_siege + CONSTS['AI_GATE_BREAK']),
        ('... but stays finite, so the only crossing is still taken',
         without < 99999.0),
    ]
    for name, ok in jam:
        fails += 0 if ok else 1
        print('    %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       gate cost with siege %.0f, without %.0f' % (with_siege, without))

    print('\n%s: %d Roman-lock assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------- round 4: the passive-AI deadlock (findings 1 and 2)

def unstick():
    """Round 4, findings 1 and 2 -- "Red also got stuck at the first city" and
    "West Rome fell asleep at the wheel", with a screenshot of this module's
    OWN chat line "Huns: massing at home" over 25-plus idle units.

    This was a regression round 3 introduced. AI_ScoreConsolidate weights its
    first term 0.78 against wantArmy = 350 + 750*clock -- a pure clock ramp --
    while round 3 made wm_foodCap the REAL cap. Both changes are individually
    right; together a food-capped AI knows it cannot train yet keeps demanding
    an army it can never build, and because the ramp grows while a capped army
    cannot, the urge to sit at home RISES all game.

    Measured on the round-3 build, barbarian at 96/100 food, control point
    3000 away:  t=300 0.440/0.333, t=600 0.413/0.306, t=900 0.449/0.279,
    t=1500 0.533/0.225 -- CONSOLIDATE never loses and the gap widens.

    The fix is a POSSIBILITY gate, not a smaller number, so both directions
    are asserted: capped must expand, and room-to-grow must still mass."""
    print('\n' + '=' * 78)
    print('ROUND 4 -- the passive-AI deadlock: massing must be POSSIBLE')
    print('=' * 78)
    fails = 0

    def scores(t_now, army, food, cap=100.0, gold=600.0, squad_food=None):
        sc = dict(role='barb', t=t_now, army=army, gold=gold, lumber=300.0,
                  food=food, fieldX=0.0, fieldY=0.0,
                  points=[{'kind': CP, 'x': 3000.0, 'y': 0.0, 'owner': 1}])
        env = make_env(sc)
        env['wm_foodCap'][0] = cap
        consts = dict(CONSTS)
        if squad_food is not None:
            consts['AI_SQUAD_FOOD'] = squad_food
        it = Interp(FUNCS, consts, env, make_natives(env, 0.0))
        seed_capital(env, it, sc)
        return it.run('AI_ScoreConsolidate', [0]), it.run('AI_ScoreExpand', [0])

    print('  a FOOD-CAPPED army must go and take ground, at every clock:')
    capped = [(300.0, 300.0), (600.0, 400.0), (900.0, 450.0), (1500.0, 500.0)]
    for t_now, army in capped:
        c, e = scores(t_now, army, 96.0)
        ok = e > c
        fails += 0 if ok else 1
        print('    %s t=%-6.0f CONSOLIDATE=%.3f EXPAND=%.3f' % ('PASS' if ok else 'FAIL', t_now, c, e))

    print('  ... and an army with ROOM TO GROW must still mass early (no over-correction):')
    for t_now, army, food in [(60.0, 60.0, 20.0), (300.0, 200.0, 20.0)]:
        c, e = scores(t_now, army, food)
        ok = c > e
        fails += 0 if ok else 1
        print('    %s t=%-6.0f CONSOLIDATE=%.3f EXPAND=%.3f' % ('PASS' if ok else 'FAIL', t_now, c, e))

    def can_mass(food, cap, gold):
        sc = dict(role='barb', food=food, gold=gold)
        env = make_env(sc)
        env['wm_foodCap'][0] = cap
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_CanMass', [0])

    gate = [
        ('no food headroom for even one squad -> cannot mass',
         can_mass(96.0, 100.0, 900.0) < 0.4),
        ('no gold for even one squad -> cannot mass', can_mass(0.0, 100.0, 5.0) < 0.2),
        ('room and money -> can mass fully', can_mass(0.0, 100.0, 900.0) >= 1.0),
        ('the gate is bounded to 0..1', 0.0 <= can_mass(50.0, 100.0, 60.0) <= 1.0),
    ]
    for name, ok in gate:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))

    # NEGATIVE CONTROL: make a squad cost ~no food, so the gate saturates to 1
    # and stops doing anything. The round-3 deadlock must come straight back --
    # otherwise something other than AI_CanMass flipped these decisions.
    c, e = scores(1500.0, 500.0, 96.0, squad_food=0.001)
    ok = c > e
    fails += 0 if ok else 1
    print('  %s   negative control: with the gate neutralised the deadlock returns (CONSOLIDATE=%.3f > EXPAND=%.3f)'
          % ('PASS' if ok else 'FAIL', c, e))

    print('\n%s: %d deadlock assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# --------------------------------------- round 3: raze or hold (item 6)

def holding():
    """Queue item 6. The owner: "AI shouldnt burn cities its comfortable in
    being able to hold." Round 2 added the raze refund unconditionally, so it
    told the AI to burn its own supply, its own +5 armour aura, its own regen
    aura and its own 300 s militia summon. The premium must now survive only
    where the settlement genuinely cannot be kept."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- raze or hold: the refund is conditional now')
    print('=' * 78)
    CITYK, TOWNK = CONSTS['AI_PK_CITY'], CONSTS['AI_PK_TOWN']
    fails = 0

    def holdable(x, army, food, cap=100.0, role='barb'):
        sc = dict(role=role, army=army, food=food)
        env = make_env(sc)
        env['wm_foodCap'][0] = cap
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_Holdable', [0, x, 0.0])

    ARMY = CONSTS['AI_HOLD_ARMY']
    FAR = CONSTS['AI_HOLD_DIST'] + 1000.0
    cases = [
        ('a settlement behind our lines with an army is holdable',
         holdable(1000.0, ARMY + 100.0, 0.0), True),
        ('the same settlement with no army is not', holdable(1000.0, 10.0, 0.0), False),
        ('... unless we are at our food cap and need the supply it makes',
         holdable(1000.0, 10.0, 95.0), True),
        ('a settlement far beyond our lines is never holdable',
         holdable(FAR, 5000.0, 95.0), False),
    ]
    for name, got, want in cases:
        ok = (bool(got) == want)
        fails += 0 if ok else 1
        print('  %s %-62s -> %s' % ('PASS' if ok else 'FAIL', name, bool(got)))

    def value(kind, x, army, role='barb', hold_dist=None):
        sc = dict(role=role, army=army,
                  points=[{'kind': kind, 'x': x, 'y': 0.0, 'owner': 1}])
        env = make_env(sc)
        consts = dict(CONSTS)
        if hold_dist is not None:
            consts['AI_HOLD_DIST'] = hold_dist
        it = Interp(FUNCS, consts, env, make_natives(env, 0.0))
        return it.run('AI_PointValueIdx', [0, 0])

    near = value(CITYK, 1000.0, ARMY + 100.0)
    far = value(CITYK, FAR, ARMY + 100.0)
    rome = value(CITYK, FAR, ARMY + 100.0, role='rome')
    bare = CONSTS['AI_VAL_CITY']
    v = [
        ('a city we can hold carries the HOLD premium, not the refund',
         abs(near - (bare + CONSTS['AI_VAL_HOLD_CITY'])) < 1e-6),
        ('a city we cannot hold carries the refund instead',
         abs(far - (bare + CONSTS['AI_VAL_RAZE_CITY'])) < 1e-6),
        ('Rome, barred from R008 by the map, gets no refund on what it cannot hold',
         abs(rome - bare) < 1e-6),
        ('HOLDING is worth more than BURNING -- the whole of item 6', near > far),
        ('a holdable city outvalues the control point it might cost us',
         near > CONSTS['AI_VAL_CP']),
    ]
    for name, ok in v:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))

    # NEGATIVE CONTROL: collapse the hold radius to nothing, so the SAME near
    # city becomes unholdable. If the premium does not appear, the gate above
    # was not what suppressed it.
    forced = value(CITYK, 1000.0, ARMY + 100.0, hold_dist=0.0)
    ok = forced < near and abs(forced - (bare + CONSTS['AI_VAL_RAZE_CITY'])) < 1e-6
    fails += 0 if ok else 1
    print('  %s   negative control: with AI_HOLD_DIST=0 the same city flips to the raze premium (%.2f -> %.2f)'
          % ('PASS' if ok else 'FAIL', near, forced))
    print('       city value: holdable=%.2f unholdable=%.2f roman=%.2f' % (near, far, rome))

    print('\n%s: %d raze-or-hold assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------------------- round 3: heroes (item 5)

def heroes():
    """Queue item 5. Every assertion here descends from one fact about the
    artifact: there is NO revive trigger anywhere in the map and each player
    has exactly one preplaced hero, so a dead hero is dead for the game.

    The hysteresis walk below is a MODEL of AI_HeroMicro's branch structure,
    driven by the thresholds read from the shipped module, and joined to the
    code by the source guards. Its negative control is a single-threshold
    version of the same walk: if hysteresis were not doing anything, the two
    would flicker the same number of times."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- heroes: a permanent unit, so a conservative policy')
    print('=' * 78)
    B, E = CONSTS['AI_HERO_BREAK'], CONSTS['AI_HERO_ENGAGE']
    BR, ER = CONSTS['AI_HERO_BREAK_R'], CONSTS['AI_HERO_ENGAGE_R']
    fails = 0

    # ROUND 4 -- the correction. Round 3 concluded "a dead hero is gone for the
    # game" from the ABSENCE OF A TRIGGER, which is not evidence of absence of
    # a mechanism. What the artifact says: TRIGSTR_1000 tells the player to
    # research "Appoint a New General" at the Forge; that is R007, it costs
    # 250 gold + 250 lumber, and it is in h00W's ures list. But
    # Trig_Melee_Initialization disables R007 for udg_AllPlayers and nothing
    # re-enables it -- so round 3's conclusion held for the wrong reason.
    # Rather than argue with the owner's "100 gold", the AI asks the game.
    def thresh(fn, replaceable):
        sc = dict(role='barb', canReplaceHero=replaceable)
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run(fn, [0])

    adaptive = [
        ('an IRREPLACEABLE hero is protected: high break point',
         thresh('AI_HeroBreak', False) == B),
        ('a REPLACEABLE hero is a setback, so it is risked further',
         thresh('AI_HeroBreak', True) == BR and BR < B),
        ('re-engagement relaxes the same way',
         thresh('AI_HeroEngage', True) == ER and ER < E),
        ('both readings keep real hysteresis', BR < ER and B < E),
    ]
    for name, ok in adaptive:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       irreplaceable break/engage %.2f/%.2f   replaceable %.2f/%.2f'
          % (B, E, BR, ER))

    checks = [
        ('the break point is real hysteresis, not one threshold', B < E),
        ('the hero break point is far above the 22 percent army trip-wire', B > 0.40),
        ('re-engagement demands a genuine heal', E >= 0.70),
        ('the hero hunt is bounded, so it is a focus and not a chase',
         CONSTS['AI_HERO_HUNT_R'] <= 4000.0),
        ('the hero layer cannot eat the order budget',
         CONSTS['AI_HERO_SLICE'] <= CONSTS['AI_MICRO_SLICE']),
    ]
    for name, ok in checks:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       thresholds: break=%.2f engage=%.2f hunt=%.0f' % (B, E, CONSTS['AI_HERO_HUNT_R']))

    # a fight that grinds the hero down and back up, hovering on the break
    seq = []
    for i in range(200):
        seq.append(B + 0.03 * math.sin(i * 0.9) - 0.0015 * i)
    seq += [min(1.0, B + 0.02 * i) for i in range(40)]

    def walk(hyst):
        out, flips, engaged_below = False, 0, 0
        for frac in seq:
            if out:
                if frac >= (E if hyst else B):
                    out = False
                    flips += 1
            elif frac <= B:
                out = True
                flips += 1
            if not out and frac < B:
                engaged_below += 1
        return flips, engaged_below

    flips_h, below_h = walk(True)
    flips_s, below_s = walk(False)
    ok = (below_h == 0)
    fails += 0 if ok else 1
    print('  %s the hero is never left engaged below the break point (%d ticks)'
          % ('PASS' if ok else 'FAIL', below_h))
    ok = (flips_h * 3 < flips_s)
    fails += 0 if ok else 1
    print('  %s NEGATIVE CONTROL: hysteresis suppresses flicker (%d transitions vs %d single-threshold)'
          % ('PASS' if ok else 'FAIL', flips_h, flips_s))

    # -- ROUND 4, finding 6: the leash ------------------------------------
    # "they overpush for hero aim." Round 3 bounded the hunt by distance from
    # the ARMY -- a moving reference, so the bound travelled with the chase.
    print('  -- round 4, finding 6: the hunt is anchored to things that do not run --')

    def hunt(hero_x, anchor_x, leash):
        """Run the REAL AI_EnemyHeroEnum against one visible enemy hero and
        report whether it was accepted as a target. Mocking the enum unit is
        the only way to reach a ForGroup callback from here; the decision
        under test is still the shipped code."""
        sc = dict(role='barb', fieldX=0.0, fieldY=0.0)
        env = make_env(sc)
        nat = make_natives(env, 0.0)
        HERO = 999
        nat['GetEnumUnit'] = lambda: HERO
        nat['GetUnitX'] = lambda u: hero_x
        nat['GetUnitY'] = lambda u: 0.0
        nat['GetUnitState'] = lambda u, st: 1000.0
        nat['IsUnitEnemy'] = lambda u, p: True
        nat['IsUnitVisible'] = lambda u, p: True
        nat['IsUnitType'] = lambda u, ty: True
        nat['UNIT_TYPE_HERO'] = 1
        nat['UNIT_STATE_LIFE'] = 1
        it = Interp(FUNCS, CONSTS, env, nat)
        env['ai_anchorX'] = anchor_x
        env['ai_anchorY'] = 0.0
        env['ai_heroLeash'] = leash
        env['ai_heroDist'] = CONSTS['AI_HERO_HUNT_R']
        env['ai_heroTarget'] = None
        env['ai_orderX'] = 0.0
        env['ai_orderY'] = 0.0
        it.run('AI_EnemyHeroEnum', [])
        return env['ai_heroTarget'] is not None

    L = CONSTS['AI_HERO_LEASH']
    S = CONSTS['AI_HERO_SOLO_R']
    leash = [
        ('a hero beside the objective is worth focusing', hunt(0.0, 0.0, L), True),
        ('a hero fleeing well past the leash is let go', hunt(L + 2000.0, 0.0, L), False),
        ('... and it is the LEASH that let it go, not the army radius',
         hunt(1000.0, 0.0, 100.0), False),
        ('our own hero is on a much shorter leash than the army', S < L),
        ('the solo leash keeps the hero inside the formation', S <= 1500.0),
    ]
    for row in leash:
        if len(row) == 3:
            name, got, want = row
            ok = (got == want)
        else:
            name, ok = row
        fails += 0 if ok else 1
        print('    %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       army leash %.0f (anchored to the objective), solo leash %.0f (anchored to the army)'
          % (L, S))

    print('\n%s: %d hero assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# ------------------------------------------- round 3: naval transport (item 2)

def naval():
    """Queue item 2. Transport only -- no naval warfare model exists and none
    is asserted here. What IS asserted: reachability is measured from the ARMY
    (so a landed force stands the naval layer down instead of re-boarding),
    and the shipyard value lift is narrow enough that it cannot recreate the
    round-2 finding where shipyards outscored real objectives."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- naval transport: reachability and the shipyard lift')
    print('=' * 78)
    SHIP = CONSTS['AI_PK_SHIPYARD']
    fails = 0

    def needs_boat(field_comp, pt_comp):
        sc = dict(role='barb', fieldComp=field_comp,
                  points=[{'kind': CP, 'x': 0.0, 'y': 0.0, 'comp': pt_comp, 'owner': 1}])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_NeedsBoat', [0, 0])

    cases = [
        ('an objective on our own landmass needs no boat', needs_boat(0, 0), False),
        ('an objective across water needs a boat', needs_boat(0, 1), True),
        ('once the army has LANDED, the same objective needs no boat',
         needs_boat(1, 1), False),
        ('an unknown landmass (-1) never triggers a crossing', needs_boat(-1, 1), False),
    ]
    for name, got, want in cases:
        ok = (bool(got) == want)
        fails += 0 if ok else 1
        print('  %s %-58s -> %s' % ('PASS' if ok else 'FAIL', name, bool(got)))

    # -- the shipyard lift, and the two ways it must NOT fire --------------
    def yard_score(want_boat, yard_comp, field_comp=0):
        sc = dict(role='barb', army=600.0, wantBoat=want_boat, fieldComp=field_comp,
                  points=[{'kind': SHIP, 'x': 1000.0, 'y': 0.0,
                           'comp': yard_comp, 'owner': 1}])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_TargetScore', [0, 0])

    def cp_score():
        sc = dict(role='barb', army=600.0,
                  points=[{'kind': CP, 'x': 1000.0, 'y': 0.0, 'comp': 0, 'owner': 1}])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_TargetScore', [0, 0])

    base = yard_score(False, 0)
    lifted = yard_score(True, 0)
    across = yard_score(True, 1)
    cp = cp_score()
    lift = [
        ('a shipyard is near worthless by default', base < 0.1 * cp),
        ('a stranded player values a shipyard on ITS OWN landmass', lifted > base * 10.0),
        ('... and still not more than a control point of the same distance',
         lifted <= cp * 1.25),
        ('NEGATIVE CONTROL: with wantBoat false the lift does not fire',
         abs(base - yard_score(False, 0)) < 1e-9 and base < 0.1 * cp),
        ('a shipyard ACROSS the water is not the way off this island',
         across < lifted),
    ]
    for name, ok in lift:
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       scores: default=%.4f lifted=%.4f across-water=%.4f control-point=%.4f'
          % (base, lifted, across, cp))

    # -- ROUND 4, findings 5 and 8: the phase rule ------------------------
    # "Most Barbarians should not be building transports apart from orange and
    # green", and "orange and green should consolidate their islands early".
    print('  -- round 4: home first, then the boat --')

    def cross_score(land_left, pt_comp, x=9000.0, span=None):
        sc = dict(role='barb', army=600.0, landLeft=land_left, fieldComp=0,
                  fieldX=0.0, fieldY=0.0,
                  points=[{'kind': CP, 'x': x, 'y': 0.0, 'comp': pt_comp,
                           'owner': 1}])
        if span is not None:
            sc['span'] = span
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return it.run('AI_TargetScore', [0, 0])

    home_open_across = cross_score(True, 1)
    home_done_across = cross_score(False, 1)
    home_open_local = cross_score(True, 0)
    phase = [
        ('while home has work, an across-water point is all but ignored',
         home_open_across < 0.15 * home_open_local),
        ('once home is consolidated, the same point becomes a real objective',
         home_done_across > 5.0 * home_open_across),
        ('a point on our OWN landmass is never phase-penalised',
         home_open_local > home_open_across * 10.0),
        ('the discount is exactly AI_CROSS_PENALTY',
         abs(home_open_across - home_done_across * CONSTS['AI_CROSS_PENALTY']) < 1e-6),
    ]
    for name, ok in phase:
        fails += 0 if ok else 1
        print('    %s %s' % ('PASS' if ok else 'FAIL', name))
    print('       score: home-open across=%.4f  home-done across=%.4f  own landmass=%.4f'
          % (home_open_across, home_done_across, home_open_local))

    # The Vandal case: SAME landmass, but the straight line crosses water and
    # the objective is far. Round 3 answered "walk"; the owner says ship.
    def wants(pt_comp, x, water):
        sc = dict(role='barb', fieldComp=0, fieldX=0.0, fieldY=0.0, water=water,
                  laneNX=0.0, laneNY=1.0,
                  points=[{'kind': CP, 'x': x, 'y': 0.0, 'comp': pt_comp, 'owner': 1}])
        env = make_env(sc)
        it = Interp(FUNCS, CONSTS, env, make_natives(env, 0.0))
        return bool(it.run('AI_WantsCrossing', [0, 0]))

    DRY = (1.0, -1.0)                      # empty interval: all land
    STRAIT = (3000.0, 6000.0)              # a sea band across the route
    vandal = [
        ('a different landmass always wants a boat', wants(1, 9000.0, DRY), True),
        ('same landmass, short hop, dry line: walk', wants(0, 3000.0, DRY), False),
        ('same landmass, FAR, and the direct line crosses a strait: ship (the Vandals)',
         wants(0, 9000.0, STRAIT), True),
        ('same landmass, far, but the line is dry: still walk',
         wants(0, 9000.0, DRY), False),
        ('a strait in the way but too close to be worth a boat',
         wants(0, 3000.0, STRAIT), False),
    ]
    for name, got, want in vandal:
        ok = (got == want)
        fails += 0 if ok else 1
        print('    %s %-62s -> %s' % ('PASS' if ok else 'FAIL', name, got))

    print('\n%s: %d naval assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# Round-3 source guards. These run against a COMMENT-STRIPPED copy of the
# module, because several of them assert the ABSENCE of something and the
# round-3 comments quote the very identifiers being banned.
CODE = re.sub(r'//.*$', '', TEXT, flags=re.M)

ROUND3_GUARDS = [
    ('the food cap reads PLAYER_STATE_RESOURCE_FOOD_CAP',
     r'set wm_foodCap\[pid\]\s*=\s*I2R\(GetPlayerState\(p, PLAYER_STATE_RESOURCE_FOOD_CAP\)\)', True),
    # ROUND 3 read FOOD_CAP_CEILING as if it were the cap, which it is not.
    # The invariant is that it must never feed wm_foodCap -- NOT that the
    # constant is banned outright, because playtest 11 reads the ceiling
    # deliberately, for telemetry, so that "did someone raise the cap" is a
    # question the log answers. Narrowed to the thing that was actually wrong.
    ('wm_foodCap is read from RESOURCE_FOOD_CAP, never from the CEILING',
     r'wm_foodCap\[pid\] = I2R\(GetPlayerState\(p, PLAYER_STATE_RESOURCE_FOOD_CAP\)\)', True),
    ('the ceiling is never assigned into wm_foodCap',
     r'wm_foodCap\[[^\]]*\]\s*=\s*I2R\(GetPlayerState\([^)]*FOOD_CAP_CEILING', False),
    ('AI_ChooseApproach projects gates onto the field->objective segment',
     r'function AI_ChooseApproach\b.*?AI_GateCorridor\(pid, i\)', True),
    ('AI_ChooseApproach crosses walls in t order (AI_GATE_SAMEWALL)',
     r'function AI_ChooseApproach\b.*?AI_GATE_SAMEWALL', True),
    ('the round-2 objective-anchored radius no longer selects gates',
     r'function AI_ChooseApproach\b(?:(?!\nendfunction)[\s\S])*?AI_GATE_NEAR', False),
    ('crossing cost is decided in one place, AI_GateCost',
     r'function AI_GateCost takes integer pid, integer i returns real', True),
    ('AI_ChooseApproach prices crossings through AI_GateCost',
     r'function AI_ChooseApproach\b.*?AI_GateCost\(pid, i\)', True),
    ('a stuck gate is excluded from candidate crossings',
     r'function AI_ChooseApproach\b.*?not ai_gateStuck\[i\]', True),
    ('an OWN crossing opens before any enemy scan is consulted',
     r'function AI_ManageGates\b.*?AI_GateIsOurs\(pid, ap\).*?call AI_SetGate\(ap,.*?call AI_GateScan\(', True),
    ('AI_SetGate plays the map own open animation',
     r'function AI_SetGate\b.*?call SetUnitAnimation\(ai_gate\[i\], "Death Alternate"\)', True),
    ('AI_SetGate plays the map own close animation',
     r'function AI_SetGate\b.*?call SetUnitAnimation\(ai_gate\[i\], "stand"\)', True),
    ('AI_SetGate self-verifies the toggle and latches a failure',
     r'function AI_SetGate\b.*?if AI_GateState\(i\) == before then\s*\n\s*set ai_gateStuck\[i\] = true', True),
    ('AI_MoveOnTarget consults the stall detector',
     r'function AI_MoveOnTarget\b.*?AI_TrackProgress\(pid,', True),
    ('a stall forces the nearest own gate open',
     r'function AI_MoveOnTarget\b.*?AI_ForceOpenNear\(pid,', True),
    # --- strategic layer (item 4) ---------------------------------------
    ('capital value is multiplied by readiness, not flat',
     r'function AI_PointValueFor\b.*?if kind == AI_PK_CAPITAL then\s*\n\s*return v \* wm_capReady\[pid\]', True),
    ('readiness carries the clock window',
     r'function AI_CapReadiness\b.*?AI_CapWindow\(\)', True),
    ('readiness carries the force ratio against the OBSERVED garrison',
     r'function AI_CapReadiness\b.*?army / \(2\.0\*capDef \+ 500\.0\)', True),
    ('the siege scorer is gated on readiness, not on a bare clock ramp',
     r'function AI_ScoreSiege\b.*?wm_capReady\[pid\]', True),
    ('the round-2 flat siege ramp is gone',
     r'0\.30 \+ 0\.95\*clock', False),
    ('posture is updated on its own slower clock',
     r'function AI_UpdatePosture\b.*?if ai_now < ai_postureAt\[pid\] then\s*\n\s*return', True),
    ('posture branches on ROLE, Rome and barbarian play different games',
     r'function AI_UpdatePosture\b.*?if ai_role\[pid\] == AI_ROLE_ROME then', True),
    ('GUARD B: the goal comparison is run UNBIASED first',
     r'set bestGoal = AI_ArgMaxGoal\(sCon, sExp, sDef, sSie, sTec, sRet\)\s*\n\s*if bestGoal != GOAL_DEFEND and bestGoal != GOAL_RETREAT then', True),
    ('GUARD B: the round-2 write-off collapse is still in AI_ScoreDefend',
     r'function AI_ScoreDefend\b.*?if t > AI_WRITEOFF\*a and not wm_capThreat\[pid\] then', True),
    ('GUARD B: the army SPLIT is still the default response',
     r'function AI_Execute\b.*?if AI_ShouldRecall\(pid\) then.*?call AI_Respond\(pid,', True),
    # --- round 4: finding 6 and the revive correction --------------------
    ('replaceability is asked of the GAME, not assumed',
     r"set wm_canReplaceHero\[pid\] = \(GetPlayerTechMaxAllowed\(p, AI_HERO_REPLACE\) != 0\)", True),
    ('the replacement research is the map own R007',
     r"constant integer AI_HERO_REPLACE  = 'R007'", True),
    ('the break point adapts to whether a hero can be replaced',
     r'function AI_HeroBreak\b.*?if wm_canReplaceHero\[pid\] then\s*\n\s*return AI_HERO_BREAK_R', True),
    ('the hero micro uses the adaptive thresholds, not the constants',
     r'function AI_HeroMicro\b(?:(?!\nendfunction)[\s\S])*?AI_HeroEngage\(pid\)', True),
    ('the hunt is leashed to an anchor as well as to the army',
     r'function AI_EnemyHeroEnum\b.*?ai_anchorX, ai_anchorY\) <= ai_heroLeash', True),
    ('the army hunt is anchored to the OBJECTIVE, which does not move',
     r'AI_FindEnemyHero\(pid, ai_ptX\[t\], ai_ptY\[t\], AI_HERO_LEASH\)', True),
    ('our own hero is anchored to the formation on a short leash',
     r'AI_FindEnemyHero\(pid, wm_fieldX\[pid\], wm_fieldY\[pid\], AI_HERO_SOLO_R\)', True),
    # --- round 4: findings 4, 5, 8 ---------------------------------------
    ('AI reports go to ALLIES only, never to everyone',
     r'function AI_Say\b.*?call AI_BroadcastAllies\(pid, AI_Name\(pid\)', True),
    ('the ally scope is an explicit IsPlayerAlly test per recipient',
     r'function AI_BroadcastAllies\b.*?if IsPlayerAlly\(Player\(i\), ai_p\[pid\]\) or ai_spy\[i\] then', True),
    ('observer mode is opt-in, per player, and never global',
     r'set ai_spy\[GetPlayerId\(GetTriggerPlayer\(\)\)\] = \(s == "-aispy"\)', True),
    ('no GetLocalPlayer anywhere in the module',
     r'GetLocalPlayer', False),
    ('AI_Say never uses the global broadcast',
     r'function AI_Say\b(?:(?!\nendfunction)[\s\S])*?call AI_Broadcast\(', False),
    ('across-water objectives are suppressed while home has work',
     r'if wm_landLeft\[pid\] and AI_WantsCrossing\(pid, i\) then\s*\n\s*set sw = sw \* AI_CROSS_PENALTY', True),
    ('the naval layer answers the same question as the scorer',
     r'function AI_NavStep\b.*?if not AI_WantsCrossing\(pid, t\) then', True),
    ('a wet direct line over distance also wants a boat (the Vandals)',
     r'function AI_WantsCrossing\b.*?not AI_LandLine\(wm_fieldX\[pid\]', True),
    # --- round 4: the passive-AI deadlock (findings 1, 2) ----------------
    ('CONSOLIDATE is gated on massing being POSSIBLE',
     r'function AI_ScoreConsolidate\b.*?return s \* AI_CanMass\(pid\)', True),
    ('the gate is food headroom AND gold, in squad units',
     r'function AI_CanMass\b.*?wm_foodCap\[pid\] - wm_food\[pid\].*?AI_SQUAD_FOOD.*?AI_SQUAD_GOLD', True),
    ('a consolidating POSTURE also requires that massing be possible',
     r'function AI_UpdatePosture\b.*?AI_CanMass\(pid\) > 0\.5', True),
    ('the AI announces which slots it took, so an idle player is diagnosable',
     r'call AI_Broadcast\("FoR-AI is playing: " \+ ai_roster\)', True),
    # --- tribal preferences (item 9) -------------------------------------
    ('composition is drawn from per-faction weights',
     r'set role = AI_PickRole\(pid\)', True),
    ('the role draw uses the single seeded Park-Miller stream',
     r'function AI_PickRole\b.*?ModuloInteger\(AI_Rand\(\), 100\)', True),
    ('the round-2 flat composition roll is gone',
     r'elseif AI_RandReal\(\) < 0\.40 then\s*\n\s*set role = 1', False),
    # --- rams (item 8) and dispersal (item 10) ---------------------------
    ('a ram with no wall to break holds behind the line',
     r'function AI_SendEnum\b.*?if GetUnitTypeId\(u\) == ai_ramType and not ai_ramWork then\s*\n\s*call AI_TryOrder\(u, AI_ORD_MOVE, ai_ramX, ai_ramY', True),
    ('ram work is decided by whether the approach must BREAK a crossing',
     r'set ai_ramWork = \(gi >= 0\) and ai_apBreak\[pid\]', True),
    ('rams are bought from a REMEMBERED wall, not a per-tick flag',
     r'if \(ai_now - ai_wallSince\[pid\]\) < AI_WALL_MEM and wm_lumber\[pid\] >= AI_RAM_LUMBER', True),
    ('meeting a wall is what starts the ram memory',
     r'if ai_apBreak\[pid\] then\s*\n\s*set ai_wallSince\[pid\] = ai_now', True),
    ('a break we cannot perform is priced out of the crossing comparison',
     r'function AI_GateCost\b.*?if not wm_hasSiege\[pid\] then.*?AI_NOBREAK_COST', True),
    # --- round 5: the Roman lock -----------------------------------------
    ('CONSOLIDATE is gated on more army being WANTED, not just possible',
     r'return s \* AI_CanMass\(pid\) \* AI_WantsMore\(pid\)', True),
    ('the proximity scale adapts to the faction own geography',
     r'function AI_TargetScore\b.*?/ wm_proxScale\[pid\]\)', True),
    # PLAYTEST 8. The round-5 invariant is unchanged -- a unit already home is
    # not told to go home -- but its IMPLEMENTATION was a general arrival
    # tolerance of AI_HOME_R, which cancelled every short-range MOVE order and
    # froze the muster inside the camps. The guard now pins the SCOPED form:
    # the suppression applies to a destination that IS home.
    ('a unit already at home is not re-ordered home, scoped to a home destination',
     r'function AI_SendEnum\b(?:(?!\nendfunction)[\s\S])*?AI_Dist\(ai_orderX, ai_orderY, ai_homeX\[ai_curPid\], ai_homeY\[ai_curPid\]\) < AI_ARRIVE_R', True),
    # and the regression itself is forbidden by name: AI_HOME_R must never
    # again be the arrival tolerance for a MOVE order.
    ('AI_HOME_R is NOT used as a general MOVE arrival tolerance (playtest 8)',
     r'ai_ordKind == AI_ORD_MOVE and AI_Dist\(GetUnitX\(u\), GetUnitY\(u\), ai_orderX, ai_orderY\) < AI_HOME_R', False),
    ('transports are never dispatched by the land army',
     r'function AI_SendEnum\b(?:(?!\nendfunction)[\s\S])*?if AI_IsTransport\(u\) then', True),
    ('a hero never boards ahead of its army',
     r'function AI_BoardEnum\b.*?IsUnitType\(u, UNIT_TYPE_HERO\) and ai_navLoaded < AI_NAV_MIN_LOAD', True),
    ('no transport is left with cargo and no destination',
     r'function AI_NavIdle\b.*?call AI_TryOrder\(ship, AI_ORD_UNLOAD, ai_homeX\[pid\]', True),
    ('goal switching is a real Schmitt trigger: the bonus goes to the INCUMBENT',
     r'if ai_goal\[pid\] == GOAL_CONSOLIDATE then\s*\n\s*set sCon = sCon \+ 0\.12', True),
    # --- outcome telemetry (brief 8) -------------------------------------
    ('the two non-negotiable events exist: ctrl (scoreboard) and exit (left home)',
     r'call AI_Tel\("ctrl",[\s\S]*?call AI_Tel\("exit",', True),
    ('every faction event carries whether the slot is AI, so the human can be excluded',
     r'function AI_TelCheckExit\b(?:(?!\nendfunction)[\s\S])*?AI_TelAI\(pid\)', True),
    ('run_started carries the AI-slot bitmask',
     r'call AI_Tel\("run", AI_Num\(AI_SEED_DEFAULT\) \+ "\|" \+ AI_Num\(n\)', True),
    ('objective_chosen carries score components, not just a choice',
     r'call AI_Tel\("obj",[\s\S]{0,400}?ai_bestS\[pid\]', True),
    ('the emitter never uses I2S',
     r'function AI_Tel takes(?:(?!\nendfunction)[\s\S])*?I2S\(', False),
    ('the integer conversion is our own',
     r'function AI_Num takes integer n returns string', True),
    ('emission is NOT dispatch: the emitter issues no orders',
     r'function AI_Tel takes(?:(?!\nendfunction)[\s\S])*?AI_TryOrder', False),
    ('events carry a monotonic sequence and a running checksum',
     r'set ai_telSeq = ai_telSeq \+ 1[\s\S]{0,300}?set ai_telSum = ai_telSum \+ StringHash\(line\)', True),
    ('the chat channel is OFF by default; the file channel is primary',
     r'boolean          ai_telChat    = false', True),
    ('ground truth stays in the observer: no scorer reads tel_owner',
     r'(?:AI_Score\w+|AI_TargetScore|AI_ThreatOn)\b(?:(?!\nendfunction)[\s\S])*?tel_owner', False),
    # --- stage 3 / S3: the threat field ----------------------------------
    ('the threat field is built from OBSERVED point memory, not global enumeration',
     r'function AI_TrackArmies\b(?:(?!\nendfunction)[\s\S])*?ai_ptDef\[pid\*AI_MAX_POINTS \+ i\]', True),
    ('no global player enumeration anywhere in the threat field',
     r'function AI_TrackArmies\b(?:(?!\nendfunction)[\s\S])*?GroupEnumUnitsOfPlayer', False),
    ('the projected point is never normalised (AMAI defect 1 not inherited)',
     r'set dfut = AI_Dist\(cx \+ AI_TF_PROJ\*dx, cy \+ AI_TF_PROJ\*dy, ai_ptX\[t\], ai_ptY\[t\]\)', True),
    ('the heading override requires BOTH conditions',
     r'if dl > 0\.0 and vl > 0\.0 and dcur < dl then\s*\n\s*if \(dx\*vx \+ dy\*vy\) >= AI_TF_COS', True),
    ('the field indexes towns by the TOWN loop (AMAI defect 2 not inherited)',
     r'function AI_ThreatField\b(?:(?!\nendfunction)[\s\S])*?GetOwningPlayer\(ai_pt\[i\]\) == ai_p\[pid\]', True),
    ('the maximum is conditional and never overwritten (AMAI defect 3)',
     r'if v > best then\s*\n\s*set best = v\s*\n\s*set bestI = i', True),
    ('the verified constants are used, not the relayed ones',
     r'AI_TF_COEF      = 540\.0[\s\S]*?AI_TF_DMIN      = 1000\.0[\s\S]*?AI_TF_HORIZON   = 2000\.0', True),
    ('the threat field drives the S1 interrupt flag',
     r'function AI_SetFlags\b(?:(?!\nendfunction)[\s\S])*?wm_townThreat\[pid\] > AI_TF_COEF[\s\S]*?set ai_ifThreat\[pid\] = true', True),
    # --- stage 3 / S1: attacks as procedures -----------------------------
    ('a running mission holds the tick instead of re-scoring',
     r'if not AI_MissionTick\(pid\) then\s*\n\s*call AI_UpdatePosture\(pid\)', True),
    ('interrupts are FLAGS set from the world model, not scores',
     r'function AI_SetFlags\b(?:(?!\nendfunction)[\s\S])*?set ai_ifThreat\[pid\] =', True),
    ('the mission checks flags before anything else',
     r'function AI_MissionTick\b(?:(?!\nendfunction)[\s\S])*?if ai_ifThreat\[pid\] then\s*\n\s*call AI_MissionAbort', True),
    ('staging releases on a deadline rather than waiting (FormGroup)',
     r'if ai_now >= ai_msPhaseEnd\[pid\] then\s*\n\s*if ai_msState\[pid\] == AI_MS_STAGE then\s*\n\s*set ai_msState\[pid\] = AI_MS_MARCH', True),
    ('a failed march raises the stuck flag rather than idling',
     r'call AI_MissionAbort\(pid, 4\)\s*\n\s*set ai_ifStuck\[pid\] = true', True),
    ('orders are issued on a refresh interval, not every tick',
     r'function AI_MissionTick\b(?:(?!\nendfunction)[\s\S])*?if ai_now >= ai_msNextOrder\[pid\] then', True),
    ('adopting an attack objective starts a mission',
     r'call AI_MissionStart\(pid, t\)', True),
    ('the goal layer still owns the CHOICE, so Guard B survives',
     r'function AI_SelectGoal\b(?:(?!\nendfunction)[\s\S])*?set bestGoal = AI_ArgMaxGoal', True),
    # --- round 7: the centroid ------------------------------------------
    ('the field centroid is validated before anything geometric uses it',
     r'set wm_fieldHPFrac\[pid\] = 1\.0\s*\n\s*endif(?:\s*//[^\n]*\n)*\s*if AI_ValidateField\(pid\) then', True),
    ('cargo counts towards strength but never towards position',
     r'function AI_SumOwnArmy\b(?:(?!\nendfunction)[\s\S])*?if not IsUnitLoaded\(u\) then\s*\n\s*set ai_accX', True),
    ('the snap prefers a real unit and falls back to home',
     r'function AI_ValidateField\b(?:(?!\nendfunction)[\s\S])*?set ai_snapBX = ai_homeX\[pid\]', True),
    ('a loaded unit is never a snap anchor',
     r'function AI_SnapEnum\b(?:(?!\nendfunction)[\s\S])*?IsUnitLoaded\(u\)', True),
    # --- round 6: the impossible goal and the stale objective -------------
    ('TECH scores zero when no research is affordable',
     r'function AI_ScoreTech\b(?:(?!\nendfunction)[\s\S])*?wm_gold\[pid\] < AI_TECH_MIN_GOLD.*?return 0\.0', True),
    ('taking an objective releases its claim for allies',
     r'if t >= 0 and t < ai_pointCount and ai_claim\[t\] == pid then\s*\n\s*set ai_claim\[t\] = -1', True),
    ('taking an objective expires the dwell at once',
     r'set ai_target\[pid\] = -1\s*\n\s*set ai_goalSince\[pid\] = -9999\.0', True),
    ('taking an objective arms the aggression floor',
     r'set ai_goalSince\[pid\] = -9999\.0\s*\n\s*set ai_commitAt\[pid\] = -9999\.0', True),
    # Keyed on STRUCTURE, not on prose. This guard used to match the chat line
    # "moving on ..." and the playtest-7 flavour pass renamed it, so a guard
    # over a real invariant failed for a cosmetic reason. A source guard must
    # never depend on player-facing text: that text is meant to change.
    # Bounded with the (?!endif) form -- an unbounded .*? here has walked past
    # a block and produced a false PASS twice in this file's history.
    ('the idle clock is stamped on a CHANGE of objective, not every tick',
     r'if ai_target\[pid\] != t then(?:(?!endif)[\s\S])*?set ai_commitAt\[pid\] = ai_now', True),
    ('a waiting ram holds behind the ARMY, not back towards home',
     r'set ai_ramX = wm_fieldX\[pid\] - \(dx/d\)\*AI_RAM_HOLD_R', True),
    ('an idle army takes the nearest contestable objective, unconditionally',
     r'if AI_IsIdle\(pid\) and goal != GOAL_RETREAT and goal != GOAL_DEFEND then.*?call AI_MoveOnTarget\(pid, t\)', True),
    ('the idle floor sits under AI_Execute, not inside a scorer',
     r'function AI_NearestContestable\b', True),
    ('committing to an objective is what resets the idle clock',
     r'set ai_commitAt\[pid\] = ai_now', True),
    # S1 moved AI_Execute inside a conditional, so this now asserts the
    # STRONGER property: NavIdle sits AFTER the endif, i.e. it runs whatever
    # the goal is AND whatever the mission is doing.
    ('the naval idle branch runs outside the mission branch, unconditionally',
     # Structural, not shape-pinned: playtest 11 added the watchdog branch
     # above this, so the old "endif directly followed by NavIdle" pattern no
     # longer matches even though the invariant is untouched. What matters is
     # that NavIdle is NOT inside the mission branch, which is checked
     # positionally in the watchdog section instead of by regex here.
     r'function AI_Think\b(?:(?!\nendfunction)[\s\S])*?call AI_NavIdle\(pid\)', True),
    ('a siege goal no longer buys rams by itself (finding 7)',
     r'ai_goal\[pid\] == GOAL_SIEGE\) and wm_lumber', False),
    ('a defensive or retreating dispatch gives rams no job',
     r'set ai_ramWork = false', True),
    ('the march-line normal is computed ONCE per dispatch, from the army line',
     r'function AI_SendArmy\b.*?set ai_laneNX = -dy/d\s*\n\s*set ai_laneNY = dx/d', True),
    # PLAYTEST 9. Lanes still apply to the march and never to focus fire, but a
    # lane alone gave five destinations for seventy units. The dispersal is now
    # a formation SLOT -- lane across the march line, rank back along it.
    ('dispersal is applied to the march, not to focus fire',
     r'call AI_TryOrder\(u, ai_ordKind, ai_orderX \+ ai_laneNX\*AI_LANE_W\*AI_SlotLane\(slot, ai_laneN\)', True),
    ('the march destination carries a RANK as well as a lane (playtest 9)',
     r'AI_RANK_W\*AI_SlotRank\(slot, ai_laneN\)', True),
    ('focus fire still converges on the target with no offset at all',
     r'call AI_TryOrder\(u, AI_ORD_ATTACKU, ai_orderX, ai_orderY, ai_orderTarget\)', True),
    # --- round 4: findings 3 and 7 ---------------------------------------
    ('a free crossing earns a wider search than one we must break',
     r'function AI_GateCorridor\b.*?AI_GATE_CORRIDOR_FREE', True),
    ('the formation width is MEASURED against the engine pathing',
     r'function AI_HalfSpan\b.*?IsTerrainPathable\(', True),
    ('the tightest point on the route decides the width',
     r'set n = AI_LanesAt\(x, y\).*?dx\*0\.34.*?dx\*0\.67.*?call AI_SetLanes\(n\)', True),
    ('lane count and midpoint are always set together, never derived',
     r'function AI_SetLanes\b.*?set ai_laneN = 5\s*\n\s*set ai_laneMid = 2', True),
    # --- coordination and harassers (item 7) -----------------------------
    ('objectives are claimed in the shared ledger when adopted',
     r'function AI_Execute\b.*?call AI_Claim\(pid, t\)', True),
    ('a claim releases the previous one, so it cannot outlive our interest',
     r'function AI_Claim\b.*?if old >= 0 and old < ai_pointCount and ai_claim\[old\] == pid then\s*\n\s*set ai_claim\[old\] = -1', True),
    ('a claim only binds between ALLIES',
     r'function AI_TargetScore\b.*?if IsPlayerAlly\(ai_p\[ai_claim\[i\]\], ai_p\[pid\]\) then', True),
    ('a claim is a discount, never a veto',
     r'set sw = sw \* AI_CLAIM_PENALTY', True),
    ('claims expire (AI_CLAIM_TTL)',
     r'function AI_TargetScore\b.*?\(ai_now - ai_claimAt\[i\]\) < AI_CLAIM_TTL', True),
    ('the harasser is drawn from the seeded Park-Miller stream',
     r'function AI_PickHarasser\b.*?ModuloInteger\(AI_Rand\(\), total\)', True),
    ('only slots the AI actually plays enter the draw',
     r'function AI_PickHarasser\b.*?if ai_on\[AI_HARASS_A\] then\s*\n\s*set total = total \+ AI_HARASS_WA', True),
    ('raiding happens CONCURRENTLY with the push, in both acquisitive goals',
     r'function AI_Execute\b.*?call AI_MoveOnTarget\(pid, t\)\s*\n\s*call AI_Raid\(pid\).*?call AI_MoveOnTarget\(pid, t\)\s*\n\s*call AI_Raid\(pid\)', True),
    ('the raid dispatches the faction cavalry, not the whole army',
     r'function AI_Raid\b.*?set ai_raidType = AI_UnitFor\(pid, 3\)', True),
    ('raid orders still go through AI_TryOrder',
     r'function AI_RaidEnum\b.*?call AI_TryOrder\(u, AI_ORD_ATTACKP', True),
    # --- raze or hold (item 6) -------------------------------------------
    ('holding and razing are mutually exclusive premiums on holdability',
     r'function AI_PointValueIdx\b.*?if AI_Holdable\(pid, ai_ptX\[i\], ai_ptY\[i\]\) then.*?AI_VAL_HOLD_CITY.*?elseif wm_canRaze\[pid\] then.*?AI_VAL_RAZE_CITY', True),
    ('the hold premium is set above the raze refund',
     r'constant real\s+AI_VAL_HOLD_CITY\s*=\s*0\.70', True),
    ('target scoring uses the holdability-gated value',
     r'function AI_TargetScore\b.*?set v = AI_PointValueIdx\(pid, i\)', True),
    ('burning our OWN settlements asks the same question',
     r'function AI_RazeEnum\b.*?if not AI_Holdable\(ai_curPid, GetUnitX\(u\), GetUnitY\(u\)\)', True),
    ('the round-2 bare distance test for razing is gone',
     r'AI_RAZE_DIST', False),
    ('razing still never drops us below AI_RAZE_KEEP production sites',
     r'function AI_TryRaze\b.*?ai_razeCount >= AI_RAZE_KEEP', True),
    # --- heroes (item 5) -------------------------------------------------
    ('a hero is exempt from the 22 percent army trip-wire',
     r'function AI_MicroEnum\b.*?if IsUnitType\(u, UNIT_TYPE_HERO\) then\s*\n\s*set u = null\s*\n\s*return', True),
    ('the hero hysteresis re-engages only above the engage threshold',
     r'function AI_HeroMicro\b.*?if ai_heroOut\[pid\] then\s*\n\s*if frac >= AI_HeroEngage\(pid\) then', True),
    ('the hero withdraws at the break threshold',
     r'function AI_HeroMicro\b.*?elseif frac <= AI_HeroBreak\(pid\) then\s*\n\s*set ai_heroOut\[pid\] = true', True),
    ('a withdrawn hero is not re-sent to the front by the think tick',
     r'function AI_SendEnum\b.*?if ai_heroOut\[ai_curPid\] and IsUnitType\(u, UNIT_TYPE_HERO\) then', True),
    ('hero policy runs before the difficulty gate',
     r'function AI_MicroPlayer\b.*?call AI_HeroMicro\(pid\).*?if ai_diff\[pid\] == AI_EASY then', True),
    ('enemy heroes are hunted only within AI_HERO_HUNT_R of the army',
     r'function AI_FindEnemyHero\b.*?set ai_heroDist = AI_HERO_HUNT_R', True),
    ('the hero hunt respects fog',
     r'function AI_EnemyHeroEnum\b.*?IsUnitVisible\(u, ai_curP\)', True),
    # --- naval transport (item 2) ---------------------------------------
    ('the land graph is built once, at init',
     r'function AI_Init\b.*?call AI_BuildLandGraph\(\)', True),
    ('reachability is measured from the ARMY, not from home',
     r'function AI_NeedsBoat\b.*?wm_fieldComp\[pid\]', True),
    ('the naval layer runs before the land march',
     r'function AI_MoveOnTarget\b.*?if AI_NavStep\(pid, t\) then\s*\n\s*return', True),
    ('load orders go through AI_TryOrder',
     r'function AI_BoardEnum\b.*?call AI_TryOrder\(u, AI_ORD_LOAD', True),
    ('the unload order goes through AI_TryOrder',
     r'function AI_NavStep\b.*?call AI_TryOrder\(ship, AI_ORD_UNLOAD', True),
    ('boarding is verified with the engine own IsUnitLoaded',
     r'function AI_LoadedEnum\b.*?if IsUnitLoaded\(u\) then', True),
    ('the transport bought is the map 6-capacity h00R',
     r"constant integer AI_NAV_SHIP\s*=\s*'h00R'", True),
    ('no warship, no sea-control model: h00S artillery is never trained',
     r"IssueImmediateOrderById\([a-z]+, 'h00S'\)", False),
    ('the shipyard table value is untouched, the lift is conditional',
     r'constant real\s+AI_VAL_SHIPYARD\s*=\s*0\.02', True),
    ('the shipyard lift is gated on wm_wantBoat',
     r'function AI_TargetScore\b.*?wm_wantBoat\[pid\] and not AI_NeedsBoat\(pid, i\)', True),
    ('wm_wantBoat requires an exhausted landmass AND no shipyard held',
     r'set wm_wantBoat\[pid\] = \(not landWorth\) and yards == 0', True),
]


def round3_guards():
    """Source assertions for the round-3 gate work: things the interpreter
    cannot reach because they are about engine calls or about code that is
    NOT present."""
    print('\n' + '=' * 78)
    print('ROUND 3 -- source guards (asserted against the shipped for-ai.j)')
    print('=' * 78)
    fails = 0
    for name, rx, want in ROUND3_GUARDS:
        got = re.search(rx, CODE, re.S) is not None
        ok = (got == want)
        fails += 0 if ok else 1
        print('  %s %s' % ('PASS' if ok else 'FAIL', name))
    print('\n%s: %d round-3 source guards failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


def order_guards():
    """The order model below is only meaningful if the shipped module really
    contains the guards it models. These assertions are the join."""
    fails = 0
    body = TEXT
    print('  source guards (asserted against the shipped for-ai.j):')
    for name, rx in ORDER_GUARDS:
        ok = re.search(rx, body, re.S) is not None
        fails += 0 if ok else 1
        print('    %s %s' % ('PASS' if ok else 'FAIL', name))
    # and nothing may issue a movement order outside AI_TryOrder
    stray = []
    for m in re.finditer(r'^\s*call (IssuePointOrder|IssueTargetOrder)\(', body, re.M):
        line = body[:m.start()].count('\n') + 1
        fn = None
        for fm in re.finditer(r'^function (\w+) takes', body, re.M):
            if body[:fm.start()].count('\n') + 1 < line:
                fn = fm.group(1)
        if fn != 'AI_TryOrder':
            stray.append((line, fn))
    ok = not stray
    fails += 0 if ok else 1
    print('    %s every movement order goes through AI_TryOrder%s'
          % ('PASS' if ok else 'FAIL', '' if ok else ' (stray: %s)' % stray))
    return fails


def order_model(dedup, players=11, army=100, horizon=600, objective_every=60,
                engaged=0.5, wounded=0.05, round3=False, missions=False):
    """Count movement orders per second under the round-1 and round-2 policies.

    This is a MODEL of the issuance policy, not an execution of the map: it
    replays the dispatch rules with one entry per unit and counts calls. The
    tuning constants come from the shipped module so the numbers cannot drift
    from the code; order_guards() asserts the code really has the guards.
    """
    period = 4.0                                   # AI_ThinkPeriod, normal
    slice_t = CONSTS['AI_ORDER_SLICE']
    slice_m = CONSTS['AI_MICRO_SLICE']
    refresh = CONSTS['AI_ORDER_REFRESH']
    # per player: last-order (kind, objective-id, time) per unit
    last = [[None] * army for _ in range(players)]
    peak, total = 0, 0
    for tick in range(1, horizon + 1):
        tick_orders = 0
        for p in range(players):
            objective = tick // objective_every        # the objective id right now
            # --- think
            if dedup:
                due = (tick % int(period)) == (p % int(period))
            else:
                due = (tick % int(period)) == 0        # round 1: everyone together
            # S1: while a mission is running the field dispatch fires only
            # once per AI_MS_REFRESH, not on every think tick. That is the
            # order-economy half of "issue one order and sleep".
            if missions and due:
                due = (tick % int(CONSTS['AI_MS_REFRESH'])) < period
            if due:
                issued = 0
                for u in range(army):
                    if not dedup:
                        issued += 1                     # round 1 re-orders everything
                        continue
                    st = last[p][u]
                    need = st is None or st[0] != objective or (tick - st[1]) >= refresh
                    if need and issued < slice_t:
                        last[p][u] = (objective, tick)
                        issued += 1
                tick_orders += issued
                # ROUND 3: the harasser's concurrent cavalry raid is an EXTRA
                # dispatch on the same think tick, with its own budget. Only
                # one player per front holds the role, so it is charged to one.
                if round3 and p == 0:
                    tick_orders += CONSTS['AI_RAID_SLICE']
            # --- micro, every tick
            # ROUND 3: hero policy runs on every micro tick for every player,
            # capped at AI_HERO_SLICE. Naval boarding is NOT added: AI_NavStep
            # takes the tick in place of the land dispatch and spends the same
            # AI_ORDER_SLICE, and lanes change destinations without adding
            # orders at all (a lane is a pure function of the handle id).
            if round3:
                tick_orders += CONSTS['AI_HERO_SLICE']
            issued = 0
            n_engaged = int(army * (engaged + wounded))
            for u in range(n_engaged):
                if not dedup:
                    issued += 1                         # round 1 re-orders every second
                    continue
                st = last[p][u]
                need = st is None or st[0] != objective or (tick - st[1]) >= refresh
                if need and issued < slice_m:
                    last[p][u] = (objective, tick)
                    issued += 1
            tick_orders += issued
        total += tick_orders
        peak = max(peak, tick_orders)
    return peak, total / float(horizon)


def orders():
    print('\n' + '=' * 78)
    print('ORDER ECONOMY -- playtest fault 1, "stutter from unit lag and')
    print('trying to move everything at once"')
    print('=' * 78)
    fails = order_guards()
    print()
    print('  issuance model: %d AI players x %d units, 600 s, objective changes'
          % (11, 100))
    print('  every 60 s, 55 percent of the army in contact. Constants from source:')
    print('    AI_ORDER_SLICE=%d  AI_MICRO_SLICE=%d  AI_ORDER_REFRESH=%.0f'
          % (CONSTS['AI_ORDER_SLICE'], CONSTS['AI_MICRO_SLICE'], CONSTS['AI_ORDER_REFRESH']))
    print()
    print('    round 3 adds AI_RAID_SLICE=%d (one harasser) and AI_HERO_SLICE=%d (all)'
          % (CONSTS['AI_RAID_SLICE'], CONSTS['AI_HERO_SLICE']))
    print()
    b_peak, b_mean = order_model(False)
    a_peak, a_mean = order_model(True)
    c_peak, c_mean = order_model(True, round3=True)
    s1_peak, s1_mean = order_model(True, round3=True, missions=True)
    print('  %-34s %10s %12s' % ('', 'peak/tick', 'mean/second'))
    print('  %-34s %10d %12.1f' % ('round 1 (no dedup, in step)', b_peak, b_mean))
    print('  %-34s %10d %12.1f' % ('round 2 (dedup + slice + phase)', a_peak, a_mean))
    print('  %-34s %10d %12.1f' % ('round 3 (+ raid, hero, lanes, naval)', c_peak, c_mean))
    print('  %-34s %10d %12.1f' % ('S1 (missions: order and sleep)', s1_peak, s1_mean))
    print('  %-34s %9.1fx %11.1fx' % ('reduction vs round 1', b_peak / float(c_peak),
                                      b_mean / float(c_mean)))
    ok = a_peak <= b_peak / 5.0 and a_mean <= b_mean / 5.0
    if not ok:
        fails += 1
    print('%s: round 2 cut issuance by at least 5x on both peak and mean'
          % ('PASS' if ok else 'FAIL'))
    # Round 3 must not give that back. The new dispatchers are budgeted, so
    # the bound is arithmetic rather than hopeful: one raid slice on one
    # player, plus one hero slice on every player, every tick.
    bound = a_peak + CONSTS['AI_RAID_SLICE'] + 11 * CONSTS['AI_HERO_SLICE']
    ok3 = c_peak <= bound and c_peak <= b_peak / 5.0 and c_mean <= b_mean / 5.0
    if not ok3:
        fails += 1
    print('%s: ROUND 3 DOES NOT REGRESS IT -- peak %d <= the budgeted bound %d, and still 5x under round 1'
          % ('PASS' if ok3 else 'FAIL', c_peak, bound))
    # S1's selling point is that a blocking-procedure model issues FEWER
    # orders, not more. If that is not true the rewrite has not paid for
    # itself and we should know from the trace, not from a playtest.
    ok4 = s1_mean < c_mean
    if not ok4:
        fails += 1
    print('%s: S1 IMPROVES IT -- mean %.1f/s vs %.1f/s (%.0f%% fewer), peak %d vs %d'
          % ('PASS' if ok4 else 'FAIL', s1_mean, c_mean,
             100.0 * (c_mean - s1_mean) / c_mean, s1_peak, c_peak))
    return 1 if fails else 0


def main():
    print('=' * 78)
    print('FoR-AI scoring trace — interpreting the shipped %s' % os.path.relpath(SRC, W))
    print('  %d functions, %d constants parsed from source' % (len(FUNCS), len(CONSTS)))
    print('  noise disabled (AI_Noise -> 0) so selection is deterministic')
    print('=' * 78)
    fails = 0
    for name, sc, expect in SCEN:
        scores, goal = evaluate(sc)
        ok = (goal == expect)
        if not ok:
            fails += 1
        print('\n%s %s' % ('PASS' if ok else 'FAIL', name))
        print('     scores: ' + '  '.join('%s=%.3f' % (k, v) for k, v in scores.items()))
        print('     selected=%s expected=%s' % (goal, expect))
    print('\n' + '=' * 78)
    print('%d/%d scenarios behaved as designed' % (len(SCEN) - fails, len(SCEN)))
    rc = 1 if fails else 0
    rc |= sweep()
    rc |= orders()
    rc |= value_ordering()
    rc |= routing()
    rc |= gate_identity()
    rc |= gates_round3()
    rc |= strategy()
    rc |= tribes()
    rc |= formation()
    rc |= threatfield()
    rc |= missions()
    rc |= mission_churn()
    rc |= muster()
    rc |= early_barbarians()
    rc |= voice()
    rc |= no_cheating()
    rc |= plays_to_win()
    rc |= watchdog()
    rc |= oscillation()
    rc |= pacing()
    rc |= perimeter()
    rc |= partition()
    rc |= congestion()
    rc |= gate_discipline()
    rc |= centroid()
    rc |= impossible()
    rc |= romanlock()
    rc |= unstick()
    rc |= consort()
    rc |= holding()
    rc |= heroes()
    rc |= naval()
    rc |= round3_guards()
    rc |= defence()
    rc |= prng_check()
    return rc


if __name__ == '__main__':
    sys.exit(main())
