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


CHURN_WINDOW = 5        # seconds; the logged defect restarted within 0


def detect_churn(events, window=CHURN_WINDOW):
    """Missions that ended and restarted on the SAME target inside `window`.

    Returns {(player, target): [(end_time, delay), ...]}. A mission ending and
    immediately restarting on the target it just failed on means the abort did
    not tear down the state the decision was re-derived from -- audit defect 4,
    which the owner's first telemetry run recorded within two minutes.
    """
    pending, hits = {}, defaultdict(list)
    for e in events:
        if e['ev'] != 'mis' or len(e['f']) < 5:
            continue
        try:
            p, phase, tgt = int(e['f'][0]), e['f'][2], e['f'][4]
        except (ValueError, IndexError):
            continue
        if phase == 'end':
            pending[(p, tgt)] = e['t']
        elif phase == 'start':
            # a start event carries the target in the same field position
            t0 = pending.pop((p, tgt), None)
            if t0 is not None and e['t'] - t0 <= window:
                hits[(p, tgt)].append((t0, e['t'] - t0))
    return dict(hits)


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
    # PLAYTEST 9: commitment fraction, from the dispatch census on the exit
    # event. The owner's "not with their entire army" is this number.
    commit = {}
    for e in events:
        if e['ev'] == 'exit' and len(e['f']) >= 10:
            try:
                p = int(e['f'][0])
                sent_n, sent_v = int(e['f'][4]), int(e['f'][5])
                held_n, held_v = int(e['f'][6]), int(e['f'][7])
                win_n, win_v = int(e['f'][8]), int(e['f'][9])
            except (ValueError, IndexError):
                continue
            commit.setdefault(p, (sent_n, sent_v, held_n, held_v, win_n, win_v))
    never = []
    for p in sorted(FACTION):
        if ai_mask is not None and not is_ai.get(p):
            continue
        if p in first_exit:
            t, cv = first_exit[p]
            extra = ''
            if p in commit:
                sn, sv, hn, hv, wn, wv = commit[p]
                tot = sv + hv + wv
                if tot > 0:
                    extra = ('  -- committed %d%% (%d units); garrisoned %d, '
                             'unreached %d' % (round(100.0 * sv / tot), sn, hn, wn))
                    if wn:
                        extra += '  ** UNREACHED > 0: the order slice did not reach them'
            print('   %-13s left home at %4ds with army value %d%s'
                  % (FACTION[p], t, cv, extra))
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

    # ---- muster: arrival vs timeout, the direct measure of concentration ---
    # PLAYTEST 10: three factions emitted the release-anyway line in the same
    # second. If timeout dominates, "concentrate before committing" is not
    # happening and everything downstream is judged on a false premise.
    mus = defaultdict(lambda: [0, 0])
    fracs = []
    for e in events:
        if e['ev'] == 'mus' and len(e['f']) >= 4:
            try:
                p_, reason, frac = int(e['f'][0]), int(e['f'][2]), int(e['f'][3])
            except (ValueError, IndexError):
                continue
            mus[p_][1 if reason else 0] += 1
            fracs.append(frac / 1000.0)
    if mus:
        print('\n-- MUSTER: released on arrival vs on timeout ' + '-' * 27)
        tot_a = sum(v[0] for v in mus.values())
        tot_t = sum(v[1] for v in mus.values())
        for p_ in sorted(mus):
            if ai_mask is not None and not is_ai.get(p_):
                continue
            a, t = mus[p_]
            n = a + t
            print('   %-13s %d muster(s): %d on arrival, %d on timeout (%d%% arrival)'
                  % (FACTION.get(p_, p_), n, a, t, round(100.0 * a / n) if n else 0))
        n = tot_a + tot_t
        share = round(100.0 * tot_a / n) if n else 0
        print('   %-13s %d%% released on ARRIVAL, mean fraction gathered %.0f%%'
              % ('OVERALL', share, 100.0 * (sum(fracs) / len(fracs) if fracs else 0.0)))
        if n and share < 50:
            print('   ** TIMEOUT DOMINATES: the muster is not concentrating anything.')
            print('      "Concentrate before committing" is not happening -- treat every')
            print('      downstream commitment number as measured on a false premise.')

    # ---- churn: the defect signature the FIRST live log carried ------------
    # A mission that ends and restarts on the SAME target within a few seconds
    # is not a decision, it is an oscillation. The owner's very first run
    # showed faction 9 doing it on target 108 and faction 2 on target 195,
    # once per second. The parser flags it by itself now, so no one has to
    # notice it by eye in a screenshot again.
    churn = detect_churn(events)
    print('\n-- MISSION CHURN: end and restart on the same target ' + '-' * 19)
    if not churn:
        print('   none detected (window %ds)' % CHURN_WINDOW)
    else:
        for (p, tgt), hits in sorted(churn.items(), key=lambda kv: -len(kv[1])):
            worst = min(dt for _, dt in hits)
            print('   ** %-13s target %-4s restarted %d time(s), fastest %ds after the end'
                  % (FACTION.get(p, p), tgt, len(hits), worst))
        print('   ** THIS IS A DEFECT SIGNATURE, not a statistic: aborting is supposed')
        print('      to tear down the mission context so the same answer cannot be')
        print('      re-derived. See audit defect 4 and trace.py mission_churn().')

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
    # The churn detector, driven by the OWNER'S OWN LOGGED LINES, transcribed
    # verbatim from the first live run. These are the lines that confirmed
    # audit defect 4 -- so the detector is proven against the real artifact it
    # was written for, not against a fixture invented to make it pass.
    # PLAYTEST 9: the commitment fraction, the direct measurement of "not with
    # their entire army". Negative-controlled: an exit event WITHOUT the census
    # fields must not fabricate a percentage.
    print('\n-- commitment fraction (playtest 9) ' + '-' * 37)
    RICH = 'FORAI|1|1|60|exit|1|1|4200|3000|24|2400|6|600|40|4000|0'
    POOR = 'FORAI|1|1|60|exit|1|1|4200|3000|0'
    rich_ev, _, _ = parse(extract('FORAI|1|0|0|run|12345|4095|0\n' + RICH))
    import io, contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        report(rich_ev)
    txt = buf.getvalue()
    ok_rich = 'committed 34%' in txt and 'UNREACHED > 0' in txt
    print('   %s a census-bearing exit reports the commitment fraction and flags '
          'unreached units' % ('PASS' if ok_rich else 'FAIL'))
    poor_ev, _, _ = parse(extract('FORAI|1|0|0|run|12345|4095|0\n' + POOR))
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        report(poor_ev)
    ok_poor = 'committed' not in buf.getvalue()
    print('   %s NEGATIVE CONTROL: an exit without the census fields reports NO '
          'percentage rather than inventing one' % ('PASS' if ok_poor else 'FAIL'))

    print('\n-- muster ratio (playtest 10) ' + '-' * 43)
    MUS = '\n'.join(['FORAI|1|0|0|run|12345|4095|0'] +
                    ['FORAI|1|%d|%d|mus|4|1|1|200|400|2000|0' % (i + 1, 60 + i) for i in range(4)] +
                    ['FORAI|1|9|90|mus|4|1|0|800|3200|4000|0'])
    mus_ev, _, _ = parse(extract(MUS))
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        report(mus_ev)
    mtxt = buf.getvalue()
    ok_mus = '20% released on ARRIVAL' in mtxt and 'TIMEOUT DOMINATES' in mtxt
    print('   %s a timeout-dominated run is reported as such and called out'
          % ('PASS' if ok_mus else 'FAIL'))
    GOOD = '\n'.join(['FORAI|1|0|0|run|12345|4095|0'] +
                     ['FORAI|1|%d|%d|mus|4|1|0|900|3600|4000|0' % (i + 1, 60 + i) for i in range(4)])
    good_ev, _, _ = parse(extract(GOOD))
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        report(good_ev)
    ok_good = 'TIMEOUT DOMINATES' not in buf.getvalue()
    print('   %s NEGATIVE CONTROL: an arrival-dominated run is NOT flagged'
          % ('PASS' if ok_good else 'FAIL'))

    print('\n-- churn detector, against the real logged defect ' + '-' * 23)
    LIVE = '\n'.join([
        'FORAI|1|161|121|mis|9|1|end|1|108|-1080707829',
        'FORAI|1|162|121|mis|9|1|start|0|108|759280485',
        'FORAI|1|163|122|mis|2|1|end|1|195|-312827997',
        'FORAI|1|164|122|mis|2|1|start|0|195|724147556',
        'FORAI|1|167|125|mis|8|1|start|0|81|1215934151',
        'FORAI|1|168|125|mis|9|1|end|1|108|-1696562741',
        'FORAI|1|169|125|obj|9|1|1|10|2|8|404|1250|12139|180|2|1|-1503135437',
        'FORAI|1|170|125|mis|9|1|start|0|110|494665975',
        'FORAI|1|171|126|mis|2|1|end|1|195|291678002',
        'FORAI|1|172|126|mis|2|1|start|0|195|-1725742768',
    ])
    live_ev, _, _ = parse(extract(LIVE))
    churn = detect_churn(live_ev)
    got9 = (9, '108') in churn
    got2 = (2, '195') in churn
    print('   %s faction 9 restarting on target 108 is flagged' % ('PASS' if got9 else 'FAIL'))
    print('   %s faction 2 restarting on target 195 is flagged (%d time(s))'
          % ('PASS' if got2 else 'FAIL', len(churn.get((2, '195'), []))))
    # negative control: faction 9's OTHER end at t=125 is followed by a start
    # on a DIFFERENT target (110). That is correct behaviour and must NOT flag.
    clean = (9, '110') not in churn
    print('   %s NEGATIVE CONTROL: ending on 108 and starting on 110 is correct '
          'behaviour and is NOT flagged' % ('PASS' if clean else 'FAIL'))
    # and a well-separated restart is not churn either
    FAR = '\n'.join(['FORAI|1|1|10|mis|3|1|end|4|7|0',
                     'FORAI|1|2|300|mis|3|1|start|0|7|0'])
    far_ev, _, _ = parse(extract(FAR))
    far_ok = not detect_churn(far_ev)
    print('   %s NEGATIVE CONTROL: a restart 290s later is not churn'
          % ('PASS' if far_ok else 'FAIL'))

    ok = (bool(p2) and any('duplicate' in x for x in p3)
          and got9 and got2 and clean and far_ok and ok_rich and ok_poor
          and ok_mus and ok_good)
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
