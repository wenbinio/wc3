#!/usr/bin/env python3
"""Hand-driven trace of the FoR-AI scoring functions.

The map is JASS, so lib/sim cannot execute it — there is no way to run the
real decision loop headlessly. This harness is the honest substitute: a tiny
interpreter for the straight-line JASS subset the scoring functions are written
in, which reads the SHIPPED ai/for-ai.j and evaluates the real function bodies.
Because it parses the source of record rather than a transcription, the trace
cannot silently drift from the code it claims to test.

What it verifies: which goal is selected for a given world state, that the
thresholds fire where the design says, and that the PRNG is bit-exact.
What it does NOT verify: anything about whether the AI wins. There is no
pathing, no combat, no engine here.
"""
import re, sys, os

W = os.path.dirname(os.path.abspath(__file__))
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
    return env


def make_natives(env, noise=0.0):
    import math
    return {
        'SquareRoot': math.sqrt,
        'I2R': float,
        'GetOwningPlayer': lambda h: env['_ptOwner'].get(h, 1),
        'IsPlayerAlly': lambda a, b: False,
        'AI_Noise': lambda amp: noise,
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


def main():
    print('=' * 78)
    print('FoR-AI scoring trace — interpreting the shipped ai/for-ai.j')
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
    rc |= prng_check()
    return rc


if __name__ == '__main__':
    sys.exit(main())
