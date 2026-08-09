#!/usr/bin/env python3
"""Gotcha 34 detector (a): no ASCII apostrophe inside a JASS string literal.

An ASCII ' inside "..." is rawcode syntax to the JASS lexer and makes the map
UNLOADABLE while still passing text-shape checks. This is the cheap always-works
detector: scan the file with a real JASS-aware tokenizer and report every
double-quoted literal containing an apostrophe, then compare against the
baseline (the unmodified script) so we only fail on *introduced* ones.

Usage:  lint_apostrophe.py <baseline.j> <candidate.j>
        lint_apostrophe.py --selftest <baseline.j>   (negative control)
"""
import sys, re


def string_literals(src):
    """Yield (lineno, literal_body) for every double-quoted JASS string.

    Handles // and /* */ comments and backslash escapes so that apostrophes in
    comments or rawcodes are not misreported.
    """
    out = []
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1; i += 1; continue
        if c == '/' and i + 1 < n and src[i+1] == '/':
            while i < n and src[i] != '\n':
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i+1] == '*':
            i += 2
            while i + 1 < n and not (src[i] == '*' and src[i+1] == '/'):
                if src[i] == '\n':
                    line += 1
                i += 1
            i += 2; continue
        if c == '"':
            start, buf = line, []
            i += 1
            while i < n and src[i] != '"':
                if src[i] == '\\' and i + 1 < n:
                    buf.append(src[i:i+2]); i += 2; continue
                if src[i] == '\n':
                    line += 1
                buf.append(src[i]); i += 1
            i += 1
            out.append((start, ''.join(buf)))
            continue
        if c == "'":
            # rawcode literal: skip it wholesale
            i += 1
            while i < n and src[i] != "'":
                if src[i] == '\\' and i + 1 < n:
                    i += 2; continue
                i += 1
            i += 1
            continue
        i += 1
    return out


def offenders(path):
    src = open(path, encoding='utf-8', errors='surrogateescape').read()
    return [(ln, s) for ln, s in string_literals(src) if "'" in s]


def main():
    if sys.argv[1] == '--selftest':
        base = sys.argv[2]
        src = open(base, encoding='utf-8', errors='surrogateescape').read()
        bad = src.replace('function main takes nothing returns nothing\n',
                          'function main takes nothing returns nothing\n'
                          '    call BJDebugMsg("planted don\'t literal")\n', 1)
        tmp = '/tmp/_apostrophe_selftest.j'
        open(tmp, 'w', encoding='utf-8', errors='surrogateescape').write(bad)
        found = offenders(tmp)
        if found:
            print('NEGATIVE CONTROL PASSED: probe fired on the planted literal')
            for ln, s in found:
                print('   line %d: %r' % (ln, s))
            return 0
        print('NEGATIVE CONTROL FAILED: probe did not fire — detector is broken')
        return 2

    base, cand = sys.argv[1], sys.argv[2]
    b, c = offenders(base), offenders(cand)
    print('baseline  offending literals: %d' % len(b))
    print('candidate offending literals: %d' % len(c))
    bset = set(s for _, s in b)
    new = [(ln, s) for ln, s in c if s not in bset]
    if new:
        print('FAIL: %d apostrophe literal(s) INTRODUCED:' % len(new))
        for ln, s in new:
            print('   line %d: %r' % (ln, s))
        return 1
    print('PASS: no apostrophe introduced inside any string literal')
    return 0


if __name__ == '__main__':
    sys.exit(main())
