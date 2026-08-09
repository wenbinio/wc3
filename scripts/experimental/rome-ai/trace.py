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
        'wm_threatX': d(0.0), 'wm_threatY': d(0.0),
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
        'ai_comp': {}, 'ai_claim': {}, 'ai_claimAt': {},
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
        'ai_progD': d(sc.get('progD', 999999.0)), 'ai_progAt': d(sc.get('progAt', 0.0)),
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
        # gate state is read off the live unit type in the real module; here it
        # comes from the scenario, so the ROUTING logic under test stays the
        # code read from for-ai.j
        'AI_GateState': lambda i: env['_gateState'].get(i, CONSTS['AI_GS_GONE']),
        'AI_GateLifeFrac': lambda i: env['_gateLife'].get(i, 1.0),
        # land component of a point: the union-find is built at init from the
        # engine's own pathing, which no interpreter can reach, so the graph
        # comes from the scenario and the CONSUMERS stay under test
        'AI_Find': lambda i: env['_ptComp'].get(i, 0),
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
    case('objective closer than AI_APPROACH_MIN: no routing at all',
         [dict(x=900.0, y=0.0, state=CLOSED, life=1.0, owner=1)], -1, False,
         tx=1500.0, ty=0.0)

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
    ('AI_SendArmy arms the budget before enumerating',
     r'function AI_SendArmy\b.*?set ai_budget = AI_ORDER_SLICE.*?call ForGroup\('),
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
        consts = dict(CONSTS)
        if n_lanes is not None:
            consts['AI_LANES'] = n_lanes
            consts['AI_LANE_MID'] = (n_lanes - 1) // 2
        nat = make_natives(env, 0.0)
        nat['GetHandleId'] = lambda u: u
        nat['ModuloInteger'] = lambda a, b: a % b
        it = Interp(FUNCS, consts, env, nat)
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
    # otherwise the spread above is coming from somewhere other than AI_LANES.
    one = sorted(set(lanes_for(range(400), n_lanes=1)))
    ok = (len(one) == 1 and (one[-1] - one[0]) * W == 0.0)
    fails += 0 if ok else 1
    print('  %s   negative control: with AI_LANES=1 the army collapses back to one column (%s)'
          % ('PASS' if ok else 'FAIL', one))

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
    fails = 0

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

    print('\n%s: %d naval assertions failed' % ('PASS' if not fails else 'FAIL', fails))
    return 1 if fails else 0


# Round-3 source guards. These run against a COMMENT-STRIPPED copy of the
# module, because several of them assert the ABSENCE of something and the
# round-3 comments quote the very identifiers being banned.
CODE = re.sub(r'//.*$', '', TEXT, flags=re.M)

ROUND3_GUARDS = [
    ('the food cap reads PLAYER_STATE_RESOURCE_FOOD_CAP',
     r'set wm_foodCap\[pid\]\s*=\s*I2R\(GetPlayerState\(p, PLAYER_STATE_RESOURCE_FOOD_CAP\)\)', True),
    ('the wrong player state (FOOD_CAP_CEILING) is gone from the code',
     r'PLAYER_STATE_FOOD_CAP_CEILING', False),
    ('AI_ChooseApproach projects gates onto the field->objective segment',
     r'function AI_ChooseApproach\b.*?AI_GATE_CORRIDOR', True),
    ('AI_ChooseApproach crosses walls in t order (AI_GATE_SAMEWALL)',
     r'function AI_ChooseApproach\b.*?AI_GATE_SAMEWALL', True),
    ('the round-2 objective-anchored radius no longer selects gates',
     r'function AI_ChooseApproach\b.*?AI_GATE_NEAR', False),
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
    ('rams are bought because a wall is in the way, not at random',
     r'if \(ai_apBreak\[pid\] or ai_goal\[pid\] == GOAL_SIEGE\) and wm_lumber\[pid\] >= 200\.0', True),
    ('a defensive or retreating dispatch gives rams no job',
     r'set ai_ramWork = false', True),
    ('the march-line normal is computed ONCE per dispatch, from the army line',
     r'function AI_SendArmy\b.*?set ai_laneNX = -dy/d\s*\n\s*set ai_laneNY = dx/d', True),
    ('lanes are applied to the march, not to focus fire',
     r'call AI_TryOrder\(u, ai_ordKind, ai_orderX \+ ai_laneNX\*AI_LANE_W\*AI_LaneOf\(u\)', True),
    ('a lane is keyed off the unit handle so it is stable across ticks',
     r'function AI_LaneOf\b.*?ModuloInteger\(GetHandleId\(u\), AI_LANES\) - AI_LANE_MID', True),
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
    ('the hero hysteresis re-engages only above AI_HERO_ENGAGE',
     r'function AI_HeroMicro\b.*?if ai_heroOut\[pid\] then\s*\n\s*if frac >= AI_HERO_ENGAGE then', True),
    ('the hero withdraws at AI_HERO_BREAK',
     r'function AI_HeroMicro\b.*?elseif frac <= AI_HERO_BREAK then\s*\n\s*set ai_heroOut\[pid\] = true', True),
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
                engaged=0.5, wounded=0.05, round3=False):
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
    print('  %-34s %10s %12s' % ('', 'peak/tick', 'mean/second'))
    print('  %-34s %10d %12.1f' % ('round 1 (no dedup, in step)', b_peak, b_mean))
    print('  %-34s %10d %12.1f' % ('round 2 (dedup + slice + phase)', a_peak, a_mean))
    print('  %-34s %10d %12.1f' % ('round 3 (+ raid, hero, lanes, naval)', c_peak, c_mean))
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
    rc |= gates_round3()
    rc |= strategy()
    rc |= tribes()
    rc |= formation()
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
