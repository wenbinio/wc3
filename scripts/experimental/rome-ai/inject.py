#!/usr/bin/env python3
"""Inject the FoR-AI module into the Fall of Rome map script.

JASS is single-pass and allows exactly one globals block, so the module is
split at injection time:

  * its globals go inside the map's existing globals block, before endglobals;
  * its functions go immediately before InitCustomTriggers, so every AI_
    function is declared before the AI_Init() call that is appended to the end
    of InitCustomTriggers.

Idempotent: re-running strips the previous injection first.
"""
import re, sys, os

# FORAI_WORK is the working copy that holds extract/ (the decomposed map) and
# ai/ (the build output). It defaults to this script's directory so a scratch
# checkout keeps working; the module itself is taken from next to the script
# first, which is where the repo keeps the source of record.
W = os.environ.get('FORAI_WORK') or os.path.dirname(os.path.abspath(__file__))
H = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(W, 'extract', 'war3map.j')
AI = os.path.join(H, 'for-ai.j')
if not os.path.exists(AI):
    AI = os.path.join(W, 'ai', 'for-ai.j')
# The generated voice tables (gen-voices.py, from docs/reference/fall-of-rome-
# voices.md). Pure functions, no globals, and they must be DECLARED FIRST
# because JASS is single-pass and for-ai.j's AI_VLine calls into them.
VOICES = os.path.join(H, 'voices.j')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(W, 'ai', 'war3map.ai.j')

GB, GE = '//>>> FORAI-GLOBALS-BEGIN', '//>>> FORAI-GLOBALS-END'
MB = '//>>> FoR-AI FUNCTIONS BEGIN (generated, do not hand-edit) <<<'
ME = '//>>> FoR-AI FUNCTIONS END <<<'
VB = '//>>> FoR-AI GLOBALS BEGIN <<<'
VE = '//>>> FoR-AI GLOBALS END <<<'

script = open(SRC, encoding='utf-8', errors='surrogateescape').read()
module = open(AI, encoding='utf-8').read()

# split the module
gi, gj = module.index(GB), module.index(GE)
mod_globals = module[gi + len(GB):gj].strip('\n')
mod_funcs = module[:gi].rstrip('\n') + '\n\n' + module[gj + len(GE):]
if os.path.exists(VOICES):
    mod_funcs = open(VOICES, encoding='utf-8').read() + '\n' + mod_funcs

# strip any previous injection (idempotent)
for a, b in ((VB, VE), (MB, ME)):
    script = re.sub(re.escape(a) + '.*?' + re.escape(b) + '\n?', '', script, flags=re.S)
script = script.replace('    call AI_Init(  )\n', '')

# 1. globals -> before the map's endglobals
m = re.search(r'^endglobals$', script, re.M)
if not m:
    sys.exit('endglobals not found')
gblock = '\n' + VB + '\n' + mod_globals + '\n' + VE + '\n'
script = script[:m.start()] + gblock + script[m.start():]

# 2. functions -> immediately before InitCustomTriggers
m = re.search(r'^//=+\n// *Triggers\n//=+\n|^function InitCustomTriggers takes nothing returns nothing',
              script, re.M)
if not m:
    sys.exit('InitCustomTriggers anchor not found')
fblock = MB + '\n' + mod_funcs.rstrip('\n') + '\n' + ME + '\n\n'
script = script[:m.start()] + fblock + script[m.start():]

# 3. hook AI_Init at the end of InitCustomTriggers
m = re.search(r'(function InitCustomTriggers takes nothing returns nothing\n)(.*?)(\nendfunction\n)',
              script, re.S)
if not m:
    sys.exit('InitCustomTriggers not found')
script = (script[:m.start()] + m.group(1) + m.group(2) +
          '\n    call AI_Init(  )\n' + m.group(3) + script[m.end():])

open(OUT, 'w', encoding='utf-8', errors='surrogateescape').write(script)
print('wrote %s: %d lines (module globals %d, funcs %d)' % (
    OUT, script.count('\n'), mod_globals.count('\n'), mod_funcs.count('\n')))
