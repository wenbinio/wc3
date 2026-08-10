#!/usr/bin/env python3
"""Generate the JASS voice tables from docs/reference/fall-of-rome-voices.md.

WHY A GENERATOR. The spec is 600 strings across three tiers. Hand-transcribing
them into JASS would be six hundred chances to drop a variant, and section 8 of
the spec says the assertion that matters belongs against the JASS tables rather
than against the markdown -- which is only true if the JASS provably came from
the markdown. So the tables are generated, the generator is committed, and
regenerating after a spec edit is one command.

Usage:
    gen-voices.py                 # write the block to voices.j
    gen-voices.py --check         # regenerate and diff against voices.j, exit 1 on drift

The emitted block is included by inject.py the same way for-ai.j is.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SPEC = os.path.join(REPO, 'docs', 'reference', 'fall-of-rome-voices.md')
OUT = os.path.join(HERE, 'voices.j')

# Tier A kinds, in the order the spec's tables list them. The generated JASS
# indexes on these, so the order is load-bearing and is asserted below.
A_KINDS = ['OBJ_POINT', 'OBJ_CAPITAL', 'TAKEN', 'ABORT_HOME', 'ABORT_LOST',
           'ABORT_TAKEN', 'ABORT_STALL', 'FORMED', 'TIMEOUT', 'RAID']
B_KINDS = ['FALLBACK', 'REGROUP', 'GATE', 'HERO_OUT', 'HERO_FOCUS',
           'NAVAL_NEED', 'NAVAL_BOARD', 'NAVAL_ASHORE', 'NAVAL_CANCEL',
           'ALLY_HELP']
C_STATES = ['GOAL_CONSOLIDATE', 'GOAL_EXPAND', 'GOAL_DEFEND', 'GOAL_SIEGE',
            'GOAL_TECH', 'GOAL_RETREAT', 'POSTURE_PUSH', 'POSTURE_HARASS',
            'POSTURE_CONSOLIDATE', 'POSTURE_EXPAND']
HOUSES = ['H_HORDE', 'H_TRIBES', 'H_PERSIA', 'H_WEST', 'H_EAST', 'H_NORTH']
# player id -> house index, from spec section 5.2
HOUSE_OF = {0: 0, 4: 0, 5: 0, 8: 0,      # horde
            1: 1, 2: 1, 6: 1, 11: 1,     # tribes
            7: 2,                        # Persia
            3: 3, 9: 4, 10: 5}           # West / East / North Rome


def cells(line):
    """Split a markdown table row into its cells."""
    parts = [c.strip() for c in line.strip().strip('|').split('|')]
    return parts


def backticked(cell):
    m = re.match(r'^`(.*)`$', cell.strip())
    return m.group(1) if m else None


def parse_spec(text):
    """Pull the three tiers out of the markdown."""
    tier_a, tier_b, tier_c = {}, {}, {}
    cur, mode = None, None
    for raw in text.split('\n'):
        line = raw.rstrip()
        mh = re.match(r'^####\s+P(\d+)\s', line)
        if mh:
            cur, mode = int(mh.group(1)), 'A'
            tier_a[cur] = {}
            continue
        mh = re.match(r'^####\s+(H_[A-Z]+)\s', line)
        if mh:
            cur, mode = mh.group(1), 'B'
            tier_b[cur] = {}
            continue
        if line.startswith('### 5.5'):
            mode = 'C'
            continue
        if line.startswith('---') or line.startswith('## '):
            if mode == 'C':
                mode = None
            continue
        if not line.startswith('|'):
            continue
        cs = cells(line)
        if mode in ('A', 'B') and len(cs) == 4:
            kind = cs[0]
            vals = [backticked(c) for c in cs[1:]]
            if kind in (A_KINDS if mode == 'A' else B_KINDS) and all(v is not None for v in vals):
                (tier_a if mode == 'A' else tier_b)[cur][kind] = vals
        elif mode == 'C' and len(cs) == 7:
            state = cs[0]
            vals = [backticked(c) for c in cs[1:]]
            if state in C_STATES and all(v is not None for v in vals):
                tier_c[state] = vals
    return tier_a, tier_b, tier_c


def jass_expr(s):
    """A spec line -> a JASS string expression, substituting the placeholders.

    {kind} and {owner} are the only two, and both arrive already computed at
    every call site (spec 5.1), so this is concatenation and nothing more.
    """
    parts, buf = [], ''
    i = 0
    while i < len(s):
        if s.startswith('{kind}', i):
            if buf:
                parts.append('"%s"' % buf)
                buf = ''
            parts.append('k')
            i += 6
        elif s.startswith('{owner}', i):
            if buf:
                parts.append('"%s"' % buf)
                buf = ''
            parts.append('o')
            i += 7
        else:
            buf += s[i]
            i += 1
    if buf:
        parts.append('"%s"' % buf)
    return ' + '.join(parts) if parts else '""'


def emit(tier_a, tier_b, tier_c):
    L = []
    add = L.append
    add('//' + '=' * 73)
    add('//  VOICES -- GENERATED, DO NOT EDIT BY HAND')
    add('//')
    add('//  Source: docs/reference/fall-of-rome-voices.md')
    add('//  Generator: scripts/experimental/rome-ai/gen-voices.py')
    add('//')
    add('//  Twelve factions, three tiers. Tier A is per FACTION so that no two')
    add('//  factions can ever emit the same string -- the collision the owner saw')
    add('//  becomes impossible by construction rather than improbable. Tier B is')
    add('//  per house for lines that fire once or twice a game, and tier C is one')
    add('//  line per house per state because those fire on visible transitions.')
    add('//')
    add('//  Presentation only. No line adds information, every line still exits')
    add('//  through AI_Say -> AI_BroadcastAllies, and no voice helper is reachable')
    add('//  from AI_Tel, so the FORAI| machine channel stays byte-exact.')
    add('//' + '=' * 73)
    add('')
    for i, k in enumerate(A_KINDS):
        add('// V_%s = %d' % (k, i))
    add('')

    # ---- tier A, one function per faction so no single function is enormous
    for pid in range(12):
        add('function AI_VA%d takes integer kind, integer v, string k, string o returns string' % pid)
        rows = tier_a[pid]
        first = True
        for ki, kind in enumerate(A_KINDS):
            add('    %s kind == %d then' % ('if' if first else 'elseif', ki))
            first = False
            for vi in range(3):
                add('        %s v == %d then' % ('if' if vi == 0 else 'elseif', vi))
                add('            return %s' % jass_expr(rows[kind][vi]))
            add('        endif')
        add('    endif')
        add('    return ""')
        add('endfunction')
        add('')

    add('function AI_VTierA takes integer pid, integer kind, integer v, string k, string o returns string')
    for pid in range(12):
        add('    %s pid == %d then' % ('if' if pid == 0 else 'elseif', pid))
        add('        return AI_VA%d(kind, v, k, o)' % pid)
    add('    endif')
    add('    return ""')
    add('endfunction')
    add('')

    # ---- tier B, per house
    for hi, house in enumerate(HOUSES):
        add('function AI_VB%d takes integer kind, integer v returns string' % hi)
        rows = tier_b[house]
        first = True
        for ki, kind in enumerate(B_KINDS):
            add('    %s kind == %d then' % ('if' if first else 'elseif', ki))
            first = False
            for vi in range(3):
                add('        %s v == %d then' % ('if' if vi == 0 else 'elseif', vi))
                add('            return "%s"' % rows[kind][vi])
            add('        endif')
        add('    endif')
        add('    return ""')
        add('endfunction')
        add('')

    add('function AI_VTierB takes integer house, integer kind, integer v returns string')
    for hi in range(len(HOUSES)):
        add('    %s house == %d then' % ('if' if hi == 0 else 'elseif', hi))
        add('        return AI_VB%d(kind, v)' % hi)
    add('    endif')
    add('    return ""')
    add('endfunction')
    add('')

    # ---- tier C, one per house per state
    add('function AI_VTierC takes integer house, integer state returns string')
    first = True
    for si, state in enumerate(C_STATES):
        add('    %s state == %d then' % ('if' if first else 'elseif', si))
        first = False
        for hi in range(len(HOUSES)):
            add('        %s house == %d then' % ('if' if hi == 0 else 'elseif', hi))
            add('            return "%s"' % tier_c[state][hi])
        add('        endif')
    add('    endif')
    add('    return ""')
    add('endfunction')
    add('')

    # ---- house of a player, from the spec's own grouping
    add('function AI_House takes integer pid returns integer')
    for pid in range(12):
        add('    %s pid == %d then' % ('if' if pid == 0 else 'elseif', pid))
        add('        return %d' % HOUSE_OF[pid])
    add('    endif')
    add('    return 1')
    add('endfunction')
    return '\n'.join(L) + '\n'


def main():
    text = open(SPEC, encoding='utf-8').read()
    a, b, c = parse_spec(text)

    # arity, checked here as well as in trace.py: a generator that silently
    # drops a variant would otherwise produce a table that looks complete
    problems = []
    if sorted(a) != list(range(12)):
        problems.append('tier A factions: %s' % sorted(a))
    for pid, rows in a.items():
        for kind in A_KINDS:
            if len(rows.get(kind, [])) != 3:
                problems.append('tier A P%d %s' % (pid, kind))
    for house in HOUSES:
        for kind in B_KINDS:
            if len(b.get(house, {}).get(kind, [])) != 3:
                problems.append('tier B %s %s' % (house, kind))
    for state in C_STATES:
        if len(c.get(state, [])) != 6:
            problems.append('tier C %s' % state)
    if problems:
        print('SPEC PARSE INCOMPLETE:', '; '.join(problems[:8]), file=sys.stderr)
        return 2

    out = emit(a, b, c)
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if cur != out:
            print('DRIFT: voices.j does not match the spec. Run gen-voices.py.',
                  file=sys.stderr)
            return 1
        print('voices.j matches the spec (%d tier A, %d tier B, %d tier C strings)'
              % (12 * 10 * 3, 6 * 10 * 3, 10 * 6))
        return 0
    open(OUT, 'w', encoding='utf-8').write(out)
    print('wrote %s: %d lines (%d tier A, %d tier B, %d tier C strings)'
          % (OUT, out.count('\n'), 12 * 10 * 3, 6 * 10 * 3, 10 * 6))
    return 0


if __name__ == '__main__':
    sys.exit(main())
