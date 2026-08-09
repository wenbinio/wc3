#!/usr/bin/env python3
"""Package the S9 PROBE as a SEPARATE build.

docs/reference/wc3-map-ai-decompositions.md §S9 lists one thing as unproven
and cheap to test in-game: whether the engine's AI subsystem -- CreateCaptains
+ SetCaptainHome + AttackMoveXY -- actually gathers and moves Fall of Rome's
squads on a map with no halls, no gold mines and no workers.

This produces `rome-ai-S9PROBE.w3x`, which is NOT the playable build. Two
factions are handed to the engine's captains and every other slot keeps the
normal hand-rolled AI, so a failure here cannot damage the working build and a
success is attributable.

Design points that matter for the result to mean anything:

  * The hand-rolled AI is switched OFF for the probed slots (`ai_on[N] =
    false`, set immediately after AI_Init). If both for-ai.j and a captain
    issued orders to the same units the answer would be noise -- that
    contention is the RemoveGuardPosition tax AMAI pays 61 times.
  * SetCaptainHome is mandatory rather than optional: Fall of Rome stacks all
    twelve DefineStartLocation calls in a 1,280-unit row, so an inferred home
    would be nowhere near the faction. Homes below are each faction's own
    Barbarian Camp, measured from units.json.
  * Both probed factions are ones the owner reported as INERT under the
    hand-rolled AI (Franks, Britons). If captains move them, that is
    simultaneously an answer about the engine and about our own bug.
  * Targets are each faction's genuinely nearest enemy holding, measured the
    same way -- Franks 3,252 units to a West Roman city, Britons 2,107 to a
    North Roman control point on its own island (a dry land route, verified
    against war3map.wpm).

Usage:  FORAI_WORK=<dir> python3 probe.py [out.w3x]
"""
import os
import re
import shutil
import subprocess
import sys

H = os.path.dirname(os.path.abspath(__file__))
W = os.environ.get('FORAI_WORK') or H

# player id -> (faction, home x, home y, target x, target y)
# All measured from the map's own units.json; see the module docstring.
PROBES = {
    1: ('Franks',  -5888.0,  8512.0,  -5440,  4672),
    6: ('Britons', -24576.0, 28672.0, -26176, 26048),
}

CFG_B = '//>>> PROBE-CONFIG-BEGIN'
CFG_E = '//>>> PROBE-CONFIG-END'


def make_ai(pid):
    """One .ai per probed player: the config block is rewritten per copy."""
    src = open(os.path.join(H, 'probe.ai'), encoding='utf-8').read()
    name, hx, hy, tx, ty = PROBES[pid]
    cfg = (CFG_B + '\n'
           '    set probe_pid   = %d\n'
           '    set probe_name  = "%s"\n'
           '    set probe_homeX = %.1f\n'
           '    set probe_homeY = %.1f\n'
           '    set probe_tgtX  = %d\n'
           '    set probe_tgtY  = %d\n'
           '    ' + CFG_E) % (pid, name, hx, hy, tx, ty)
    i, j = src.index(CFG_B), src.index(CFG_E) + len(CFG_E)
    return src[:i] + cfg + src[j:]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(W, 'out', 'rome-ai-S9PROBE.w3x')
    build = os.path.join(W, 'probe-build')
    script = os.path.join(W, 'ai', 'war3map.j')      # already injected by inject.py
    if not os.path.exists(script):
        sys.exit('run inject.py first: %s not found' % script)

    shutil.rmtree(build, ignore_errors=True)
    shutil.copytree(os.path.join(W, 'extract'), build)
    for junk in ('_viewer', '_unknown', 'manifest.json', '_header.json'):
        p = os.path.join(build, junk)
        shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else (os.path.exists(p) and os.remove(p))

    src = open(script, encoding='utf-8', errors='surrogateescape').read()
    if 'call AI_Init(  )' not in src:
        sys.exit('AI_Init hook not found in the injected script')

    # ------------------------------------------------------------------
    # MAP-SCRIPT SIDE REPORTING.
    #
    # Playtest 6 produced the ambiguity this exists to kill. The probe build
    # ran, its roster line printed "FoR-AI is playing: Franks, ... Britons",
    # and that was read as the probe's gating having failed. It had not: the
    # roster is broadcast INSIDE AI_Init, and the probe's disable runs after
    # AI_Init returns, so the roster line cannot show the gating either way.
    # (The gating did work -- Franks and Britons were the only two of eight
    # barbarian AI factions that emitted no posture line.)
    #
    # So the probe now reports from the MAP SCRIPT, which is guaranteed to
    # run, before and after every step, and it reprints a corrected roster.
    # It also names the build unmistakably. A probe whose failure mode is
    # silence cannot distinguish "did not run" from "ran and found nothing".
    # ------------------------------------------------------------------
    helper = """
//>>> S9 PROBE HELPERS BEGIN
function S9Say takes string s returns nothing
    call AI_Broadcast("|cffffcc00[S9 PROBE BUILD]|r " + s)
endfunction

function S9SlotReport takes integer pid, string nm returns nothing
    local player p = Player(pid)
    local string st = "EMPTY"
    local string ct = "?"
    if GetPlayerSlotState(p) == PLAYER_SLOT_STATE_PLAYING then
        set st = "PLAYING"
    endif
    if GetPlayerController(p) == MAP_CONTROL_USER then
        set ct = "USER"
    elseif GetPlayerController(p) == MAP_CONTROL_COMPUTER then
        set ct = "COMPUTER"
    elseif GetPlayerController(p) == MAP_CONTROL_NEUTRAL then
        set ct = "NEUTRAL"
    else
        set ct = "RESCUABLE"
    endif
    call S9Say(nm + " P" + I2S(pid) + ": slot=" + st + " controller=" + ct + " forAI=" + S9Bool(ai_on[pid]))
    set p = null
endfunction

// If the .ai VM never speaks, SAY SO. This is the whole point: reading (1)
// -- "the probe never initialised" -- must not look like silence.
function S9Silence takes nothing returns nothing
    call S9Say("--- 25s mark ---")
    call S9Say("If you have seen NO green 'S9 <faction>:' lines above, the .ai script never")
    call S9Say("loaded or never ran. That is the answer, and it is about the ENGINE path,")
    call S9Say("not about captains: RESULT 1 and RESULT 2 were never reached.")
endfunction
//>>> S9 PROBE HELPERS END

"""
    # S9Bool needs declaring before use; put it at the very top of the block
    helper = helper.replace('//>>> S9 PROBE HELPERS BEGIN\n',
                            '//>>> S9 PROBE HELPERS BEGIN\n'
                            'function S9Bool takes boolean b returns string\n'
                            '    if b then\n'
                            '        return "ON"\n'
                            '    endif\n'
                            '    return "off"\n'
                            'endfunction\n\n')
    anchor = re.search(r'^function InitCustomTriggers takes nothing returns nothing', src, re.M)
    if not anchor:
        sys.exit('InitCustomTriggers not found')
    src = src[:anchor.start()] + helper + src[anchor.start():]

    hook = ['\n    // ---- S9 PROBE (separate build; not the playable one) ----']
    hook.append('    call S9Say("this is the PROBE build, NOT the playable one.")')
    hook.append('    call S9Say("the roster line above is printed inside AI_Init, BEFORE the lines below take effect.")')
    for pid in sorted(PROBES):
        hook.append('    call S9SlotReport(%d, "%s")   // before' % (pid, PROBES[pid][0]))
    for pid in sorted(PROBES):
        name = PROBES[pid][0]
        hook.append('    set ai_on[%d] = false          // %s: engine captains, not for-ai.j' % (pid, name))
    hook.append('    call S9Say("CORRECTED roster: FoR-AI is NOT playing ' +
                ' or '.join(PROBES[p][0] for p in sorted(PROBES)) +
                ' -- the engine captains own those slots.")')
    # The leading hypothesis for reading (1): StartMeleeAI needs a COMPUTER
    # player, and this map sets every slot MAP_CONTROL_USER. Labelled, so the
    # next run tells us whether this was the missing prerequisite.
    for pid in sorted(PROBES):
        hook.append('    call SetPlayerController(Player(%d), MAP_CONTROL_COMPUTER)  // labelled experiment' % pid)
    hook.append('    call S9Say("set both probed slots to MAP_CONTROL_COMPUTER (the leading hypothesis for a silent .ai).")')
    for pid in sorted(PROBES):
        hook.append('    call S9SlotReport(%d, "%s")   // after' % (pid, PROBES[pid][0]))
    for pid in sorted(PROBES):
        hook.append('    call StartMeleeAI(Player(%d), "probe%d.ai")' % (pid, pid))
        hook.append('    call S9Say("StartMeleeAI(Player(%d), probe%d.ai) called -- now watch for green S9 lines.")' % (pid, pid))
        ai_path = os.path.join(build, 'probe%d.ai' % pid)
        open(ai_path, 'w', encoding='utf-8').write(make_ai(pid))
    hook.append('    call TimerStart(CreateTimer(), 25.0, false, function S9Silence)')
    src = src.replace('    call AI_Init(  )\n',
                      '    call AI_Init(  )\n' + '\n'.join(hook) + '\n', 1)

    open(os.path.join(build, 'war3map.j'), 'w', encoding='utf-8',
         errors='surrogateescape').write(src)

    # a distinct internal name, so the two builds cannot be confused in the
    # map list (gotcha 17)
    wts_in = os.path.join(W, 'extract', 'war3map.wts')
    wts_out = os.path.join(build, 'war3map.wts')
    subprocess.run(['node', os.path.join(H, 'describe.js'), wts_in, wts_out], check=True)
    raw = open(wts_out, 'rb').read()
    raw = raw.replace('The Fall of Rome 1.06 + AI'.encode('utf-8'),
                      'The Fall of Rome 1.06 + S9 PROBE'.encode('utf-8'))
    open(wts_out, 'wb').write(raw)

    repo = os.path.abspath(os.path.join(H, '..', '..', '..'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['node', os.path.join(repo, 'tools', 'w3x-pack.js'),
                    '--bare', build, out], check=True)
    print('\nS9 PROBE build: %s' % out)
    print('probed slots: %s' % ', '.join('%s (P%d)' % (PROBES[p][0], p) for p in sorted(PROBES)))
    print('every other slot runs the normal hand-rolled AI')


if __name__ == '__main__':
    main()
