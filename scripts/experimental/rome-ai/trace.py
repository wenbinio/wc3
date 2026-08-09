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
import re, sys, os

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
        g[m.group(2)] = float(m.group(3).strip()) if m.group(1) == 'real' else int(m.group(3).strip())
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
        'ai_p': d(pid),
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
        'IsPlayerAlly': lambda a, b: False,
        'AI_Noise': lambda amp: noise,
        # gate state is read off the live unit type in the real module; here it
        # comes from the scenario, so the ROUTING logic under test stays the
        # code read from for-ai.j
        'AI_GateState': lambda i: env['_gateState'].get(i, CONSTS['AI_GS_GONE']),
        'AI_GateLifeFrac': lambda i: env['_gateLife'].get(i, 1.0),
    }


def evaluate(sc, noise=0.0):
    env = make_env(sc)
    it = Interp(FUNCS, CONSTS, env, make_natives(env, noise))
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
                engaged=0.5, wounded=0.05):
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
            # --- micro, every tick
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
    b_peak, b_mean = order_model(False)
    a_peak, a_mean = order_model(True)
    print('  %-28s %10s %12s' % ('', 'peak/tick', 'mean/second'))
    print('  %-28s %10d %12.1f' % ('round 1 (no dedup, in step)', b_peak, b_mean))
    print('  %-28s %10d %12.1f' % ('round 2 (dedup + slice + phase)', a_peak, a_mean))
    print('  %-28s %9.1fx %11.1fx' % ('reduction', b_peak / float(a_peak),
                                      b_mean / float(a_mean)))
    ok = a_peak <= b_peak / 5.0 and a_mean <= b_mean / 5.0
    if not ok:
        fails += 1
    print('\n%s: order issuance cut by at least 5x on both peak and mean'
          % ('PASS' if ok else 'FAIL'))
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
    rc |= round3_guards()
    rc |= defence()
    rc |= prng_check()
    return rc


if __name__ == '__main__':
    sys.exit(main())
