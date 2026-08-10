#!/usr/bin/env python3
"""Read a FoR-AI event log and print the verdict.

This exists because for eight rounds every verdict came from a human reading
chat and typing it back. That bottleneck is why "barbarians seem less active"
cost a round to resolve, and why a before/after comparison of two DIFFERENT
games -- crediting the human player's own conquests to the AI -- was reported
as the first objective evidence that the AI worked.

It answers, from one run and without a person watching a multiboard:

  * territory over time per faction, EXCLUDING the human's factions;
  * whether each AI faction ever left its own city, and when;
  * time to first objective, and whether the objective was ever reached;
  * stalls: missions that ended without taking anything, and why.

Input is either channel -- both carry the identical schema:
  * the file channel, `forai-events.txt`, written by PreloadGenEnd. Payload
    lines appear inside `call Preload( "..." )`.
  * the chat channel (`-ailog`), pasted or OCR'd, one line per event.

Usage:  parse-events.py <logfile> [--csv territory.csv]
        parse-events.py --selftest
"""
import re
import sys
from collections import defaultdict

SCHEMA = 1
FACTION = {0: 'Huns', 1: 'Franks', 2: 'Saxons', 3: 'West Rome', 4: 'Visigoths',
           5: 'Vandals', 6: 'Britons', 7: 'Persians', 8: 'Ostrogoths',
           9: 'East Rome', 10: 'North Rome', 11: 'Burgundians'}
KIND = {0: 'control point', 1: 'town', 2: 'city', 3: 'capital', 4: 'camp',
        5: 'plot', 6: 'shipyard'}
ABORT = {0: 'unknown', 1: 'home threatened', 2: 'fight lost',
         3: 'objective gone', 4: 'going nowhere'}

LINE = re.compile(r'FORAI\|(\d+)\|(\d+)\|(\d+)\|(\w+)\|(.*)')


def extract(text):
    """Pull payload lines out of either channel."""
    out = []
    for m in re.finditer(r'FORAI\|[^"\n]*', text):
        out.append(m.group(0).rstrip())
    return out


def parse(lines):
    events, seqs, bad = [], [], []
    for raw in lines:
        m = LINE.match(raw)
        if not m:
            bad.append(raw)
            continue
        ver, seq, t, ev, rest = m.groups()
        if int(ver) != SCHEMA:
            bad.append('schema %s: %s' % (ver, raw))
            continue
        parts = rest.split('|')
        checksum = parts[-1] if parts else ''
        events.append({'seq': int(seq), 't': int(t), 'ev': ev,
                       'f': parts[:-1], 'sum': checksum})
        seqs.append(int(seq))
    return events, seqs, bad


def integrity(seqs):
    """Monotonic sequence + gap detection. The schema carries these so that a
    truncated or double-extracted log is DETECTABLE rather than silently
    producing a plausible wrong answer -- the failure mode this whole file
    exists to prevent."""
    problems = []
    if not seqs:
        return ['no events at all']
    if seqs != sorted(seqs):
        problems.append('sequence numbers are out of order')
    expect = set(range(min(seqs), max(seqs) + 1))
    missing = sorted(expect - set(seqs))
    if missing:
        problems.append('%d missing sequence number(s), first %d -- log is TRUNCATED or partial'
                        % (len(missing), missing[0]))
    dupes = len(seqs) - len(set(seqs))
    if dupes:
        problems.append('%d duplicate sequence number(s) -- double extraction' % dupes)
    return problems


def report(events, csv_path=None):
    ai_mask = None
    seed = None
    for e in events:
        if e['ev'] == 'run':
            seed, ai_mask = int(e['f'][0]), int(e['f'][1])
            break
    is_ai = {p: bool(ai_mask >> p & 1) for p in FACTION} if ai_mask is not None else {}

    print('=' * 74)
    print('FoR-AI run report')
    print('=' * 74)
    if ai_mask is None:
        print('  ** no run_started event: AI slot mask unknown, so the human\'s')
        print('     faction CANNOT be excluded. Treat territory numbers as suspect.')
    else:
        ais = [FACTION[p] for p in sorted(FACTION) if is_ai.get(p)]
        humans = [FACTION[p] for p in sorted(FACTION) if not is_ai.get(p)]
        print('  seed %d   AI factions (%d): %s' % (seed, len(ais), ', '.join(ais)))
        print('  NOT AI (excluded from the scoreboard): %s' % (', '.join(humans) or 'none'))
    last_t = max([e['t'] for e in events], default=0)
    print('  events %d, last timestamp %ds' % (len(events), last_t))

    # ---- territory over time, the agreed success criterion -----------------
    owned = defaultdict(int)
    for e in events:
        if e['ev'] == 'ctrl':
            old, new = int(e['f'][2]), int(e['f'][3])
            if old in FACTION:
                owned[old] -= 1
            if new in FACTION:
                owned[new] += 1
    print('\n-- TERRITORY: net change over the run (AI factions only) ' + '-' * 16)
    print('   %-13s %8s   %s' % ('faction', 'net', 'note'))
    moved = 0
    rows = []
    for p in sorted(FACTION):
        if ai_mask is not None and not is_ai.get(p):
            continue
        net = owned.get(p, 0)
        rows.append((FACTION[p], net))
        if net:
            moved += 1
        print('   %-13s %+8d' % (FACTION[p], net))
    total = sum(n for _, n in rows)
    print('   %-13s %+8d   across %d AI faction(s) that changed at all'
          % ('TOTAL', total, moved))
    if moved == 0:
        print('   VERDICT: no AI faction gained or lost a single point. The map did not move.')

    # ---- did the army leave home ------------------------------------------
    print('\n-- ARMY EXIT: did each AI faction leave its own city? ' + '-' * 18)
    first_exit = {}
    for e in events:
        if e['ev'] == 'exit':
            p = int(e['f'][0])
            first_exit.setdefault(p, (e['t'], int(e['f'][2])))
    never = []
    for p in sorted(FACTION):
        if ai_mask is not None and not is_ai.get(p):
            continue
        if p in first_exit:
            t, cv = first_exit[p]
            print('   %-13s left home at %4ds with army value %d' % (FACTION[p], t, cv))
        else:
            never.append(FACTION[p])
    if never:
        print('   NEVER LEFT HOME: %s' % ', '.join(never))
        print('   (five of eight rounds of bugs were exactly this)')

    # ---- objectives and stalls --------------------------------------------
    chosen = defaultdict(list)
    for e in events:
        if e['ev'] == 'obj':
            chosen[int(e['f'][0])].append(e)
    print('\n-- OBJECTIVES: first choice and decision quality ' + '-' * 23)
    for p in sorted(chosen):
        if ai_mask is not None and not is_ai.get(p):
            continue
        e = chosen[p][0]
        try:
            score = int(e['f'][5]) / 1000.0
            val = int(e['f'][6]) / 1000.0
            army = int(e['f'][7])
        except (IndexError, ValueError):
            score = val = army = -1
        print('   %-13s first objective at %4ds: %s (score %.3f, value %.3f, army %d), %d chosen in total'
              % (FACTION[p], e['t'], KIND.get(int(e['f'][3]), '?'), score, val, army,
                 len(chosen[p])))

    ends = defaultdict(lambda: defaultdict(int))
    for e in events:
        if e['ev'] == 'mis' and len(e['f']) > 3 and e['f'][2] == 'end':
            ends[int(e['f'][0])][int(e['f'][3])] += 1
    if ends:
        print('\n-- MISSION OUTCOMES (S1 terminal states) ' + '-' * 31)
        for p in sorted(ends):
            if ai_mask is not None and not is_ai.get(p):
                continue
            parts = ['%s x%d' % (ABORT.get(r, r), n) for r, n in sorted(ends[p].items())]
            print('   %-13s %s' % (FACTION[p], ', '.join(parts)))
            if ends[p].get(4):
                print('      ** %d attack(s) ended "going nowhere" -- stall detector fired'
                      % ends[p][4])

    for label, ev in (('GATES toggled', 'gate'), ('EMBARK', 'emb'),
                      ('DISEMBARK', 'dis'), ('HERO withdrawn', 'hero')):
        n = sum(1 for e in events if e['ev'] == ev)
        if n:
            print('\n-- %s: %d' % (label, n))

    if csv_path:
        with open(csv_path, 'w') as fh:
            fh.write('t,faction,is_ai,delta\n')
            run = defaultdict(int)
            for e in events:
                if e['ev'] == 'ctrl':
                    old, new = int(e['f'][2]), int(e['f'][3])
                    for p, d in ((old, -1), (new, 1)):
                        if p in FACTION:
                            run[p] += d
                            fh.write('%d,%s,%d,%d\n' % (e['t'], FACTION[p],
                                                        1 if is_ai.get(p) else 0, run[p]))
        print('\n   territory timeline written to %s' % csv_path)


SELFTEST = """
call Preload( "FORAI|1|1|0|run|20260809|4082|0|1800|111" )
call Preload( "FORAI|1|2|12|exit|1|1|540|2600|222" )
call Preload( "FORAI|1|3|14|obj|1|1|7|0|3|331|1000|540|180|2|1|333" )
call Preload( "FORAI|1|4|40|ctrl|7|0|3|1|1|1|444" )
call Preload( "FORAI|1|5|61|mis|1|1|end|4|7|555" )
call Preload( "FORAI|1|6|90|ctrl|9|0|0|1|0|1|666" )
"""


def selftest():
    print('SELF-TEST: a synthetic log in the exact schema, end to end.\n')
    ev, seqs, bad = parse(extract(SELFTEST))
    assert not bad, bad
    assert integrity(seqs) == [], integrity(seqs)
    report(ev)
    print('\n-- integrity, negative controls ' + '-' * 40)
    _, s2, _ = parse(extract(SELFTEST.replace(
        'call Preload( "FORAI|1|4|40|ctrl|7|0|3|1|1|1|444" )\n', '')))
    p2 = integrity(s2)
    print('   %s truncated log is detected: %s'
          % ('PASS' if p2 else 'FAIL', p2[0] if p2 else 'NOT DETECTED'))
    _, s3, _ = parse(extract(SELFTEST + SELFTEST))
    p3 = integrity(s3)
    print('   %s duplicate extraction is detected: %s'
          % ('PASS' if any('duplicate' in x for x in p3) else 'FAIL',
             '; '.join(p3) if p3 else 'NOT DETECTED'))
    ok = bool(p2) and any('duplicate' in x for x in p3)
    print('\n%s: self-test' % ('PASS' if ok else 'FAIL'))
    return 0 if ok else 1


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--selftest':
        return selftest()
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    text = open(sys.argv[1], encoding='utf-8', errors='replace').read()
    events, seqs, bad = parse(extract(text))
    problems = integrity(seqs)
    if problems:
        print('!! LOG INTEGRITY')
        for p in problems:
            print('   - %s' % p)
        print()
    if bad:
        print('!! %d unparsed line(s), first: %s\n' % (len(bad), bad[0][:80]))
    csv_path = None
    if '--csv' in sys.argv:
        csv_path = sys.argv[sys.argv.index('--csv') + 1]
    report(events, csv_path)
    return 0


if __name__ == '__main__':
    sys.exit(main())
