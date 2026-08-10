#!/usr/bin/env python3
"""Splice for-banjo.j into Banjoball's compiled war3map.j.

JASS is single-pass and allows exactly one globals block, so the module is
split at its markers: the globals go into the map's own globals block, the
functions go in immediately before InitCustomTriggers (after every library the
module calls), and one BAI_Init() call is appended to main().

The injector REFUSES to run against a script that does not expose the exact
internals the AI reads. That is the point: this AI is bound to a specific build
of a specific map, and a silent mismatch would produce an AI that compiles and
does nothing.

Usage:
    BANJO_WORK=<dir> python3 inject.py        # <dir>/extract/scripts/war3map.j
    python3 inject.py <in.j> <out.j>
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE = os.path.join(HERE, 'for-banjo.j')

# Every map-internal name the module reads. If one of these is missing or
# renamed by a different build, the AI would compile and be inert.
REQUIRED = [
    r'(?<![A-Za-z0-9_])integer array s__Ball_balls\b',
    r'(?<![A-Za-z0-9_])unit array s__Ball_ball\b',
    r'(?<![A-Za-z0-9_])unit array s__Ball_owner\b',
    r'(?<![A-Za-z0-9_])boolean array s__Ball_hold\b',
    r'(?<![A-Za-z0-9_])integer array s__Ball_vel\b',
    r'(?<![A-Za-z0-9_])real array s__Vector_x\b',
    r'(?<![A-Za-z0-9_])real array s__Vector_y\b',
    r'(?<![A-Za-z0-9_])real array s__Vector_z\b',
    r'(?<![A-Za-z0-9_])unit array Players___playerUnit\b',
    r'(?<![A-Za-z0-9_])real array Players___playerStartX\b',
    r'(?<![A-Za-z0-9_])real array Players___playerStartY\b',
    r'(?<![A-Za-z0-9_])real array Players___playerFacing\b',
    r'(?<![A-Za-z0-9_])boolean goalEnabled\b',
    r'(?<![A-Za-z0-9_])boolean gameEnded\b',
    r'(?<![A-Za-z0-9_])rect gg_rct_Goal_1\b',
    r'(?<![A-Za-z0-9_])rect gg_rct_Goal_2\b',
    r'function s__Ball_castUtil takes unit',
    r'function Pick___addAbilities takes unit',
    r'constant real BALL_CATCH_RANGE',
    r'constant real GRAVITY_ACCELERATION',
    r'real BALL_FRICTION_AIR=',
    r'real BALL_FRICTION_GROUND=',
    r'real BALL_BUMP_SPEED_LOSS=',
    r'constant integer MAX_PLAYERS',
    r'constant integer SPRINT_RAWCODE',
    r'constant integer SPRINT_BUFF_RAWCODE',
    r'constant integer SLAM_RAWCODE',
]

MARK = '// BANJO-AI INJECTED'


def carve(text, begin, end):
    a = text.index(begin) + len(begin)
    b = text.index(end)
    return text[a:b].strip('\n')


def main():
    if len(sys.argv) == 3:
        src_path, dst_path = sys.argv[1], sys.argv[2]
    else:
        work = os.environ.get('BANJO_WORK')
        if not work:
            print('set BANJO_WORK=<dir> (with extract/scripts/war3map.j), '
                  'or pass <in.j> <out.j>', file=sys.stderr)
            return 2
        src_path = os.path.join(work, 'extract', 'scripts', 'war3map.j')
        dst_path = os.path.join(work, 'build-ai', 'war3map.j')
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)

    with open(src_path, 'rb') as f:
        raw = f.read()
    src = raw.decode('utf-8', errors='surrogateescape')

    if MARK in src:
        print('already injected — nothing to do (idempotent)')
        with open(dst_path, 'wb') as f:
            f.write(raw)
        return 0

    missing = [p for p in REQUIRED if not re.search(p, src)]
    if missing:
        print('REFUSING: this script does not expose what the AI reads:',
              file=sys.stderr)
        for m in missing:
            print('   missing:', m, file=sys.stderr)
        return 1

    mod = open(MODULE, encoding='utf-8').read()
    g = carve(mod, '//! BAI_GLOBALS_BEGIN', '//! BAI_GLOBALS_END')
    fn = carve(mod, '//! BAI_FUNCTIONS_BEGIN', '//! BAI_FUNCTIONS_END')

    # The shipped script is whitespace-minified, so nothing sits at the start
    # of a line and line anchors cannot be used. Each of these three anchors is
    # verified to occur EXACTLY once before it is used as a splice point.
    for anchor in ('endglobals', 'function InitCustomTriggers takes',
                   'function main takes'):
        n = src.count(anchor)
        if n != 1:
            print('REFUSING: anchor %r occurs %d times, expected 1'
                  % (anchor, n), file=sys.stderr)
            return 1

    # 1. globals -> into the map's single globals block
    i = src.index('endglobals')
    out = src[:i] + '\n' + MARK + ' GLOBALS\n' + g + '\n' + src[i:]

    # 2. functions -> before InitCustomTriggers (after every library it calls)
    i = out.index('function InitCustomTriggers takes')
    out = out[:i] + '\n' + MARK + ' FUNCTIONS\n' + fn + '\n' + out[i:]

    # 3. one call at the end of main()
    i = out.index('function main takes')
    e = out.index('endfunction', i)
    out = out[:e] + '\ncall BAI_Init()\n' + out[e:]

    with open(dst_path, 'wb') as f:
        f.write(out.encode('utf-8', errors='surrogateescape'))

    print('injected  %s -> %s' % (src_path, dst_path))
    print('  globals   %d lines' % (g.count('\n') + 1))
    print('  functions %d lines' % (fn.count('\n') + 1))
    print('  checked   %d map internals present' % len(REQUIRED))
    return 0


if __name__ == '__main__':
    sys.exit(main())
