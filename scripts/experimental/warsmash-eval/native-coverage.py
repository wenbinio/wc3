#!/usr/bin/env python3
"""native-coverage.py — which JASS natives does a map need, and does Warsmash
implement them?

    python3 native-coverage.py <common.j> <Blizzard.j> <war3map.j> \
        <WarsmashModEngine/core/src/com/etheller/warsmash/parsers/jass/Jass2.java>

Warsmash registers every native it implements with a `createNative("Name", ...)`
call in Jass2.java (1092 of them as of engine f9e0aee, 2025-12-08). A map needs
the natives it calls DIRECTLY plus the natives reached through the Blizzard.j
BJ wrappers it calls (Warsmash interprets Blizzard.j as ordinary JASS, so BJs
themselves are free — their natives are not).

A missing native is NOT a load failure: NativeJassFunction.checkNativeExists
prints to stderr and returns the null value. So the output of this script is a
list of SILENT behaviour divergences, which is exactly the dangerous kind.

common.j / Blizzard.j are Blizzard-authored, user-supplied, never committed.
"""
import re
import sys

KEYWORDS = set(
    "if then else elseif endif loop endloop exitwhen return call set local "
    "constant function endfunction takes returns globals endglobals native "
    "type extends array and or not true false null integer real string "
    "boolean handle code nothing".split()
)

# Buckets used in docs/reference/warsmash-eval-2026-08.md. Anything not matched
# is reported as gameplay-relevant, i.e. it can change what the AI observes or
# does.
COSMETIC = re.compile(
    r"^(Multiboard|CreateMultiboard|Quest|CreateQuest|FlashQuest|SetCineFilter|"
    r"DisplayCineFilter|TimerDialog|DestroyTimerDialog|PingMinimap|VolumeGroup|"
    r"StopSound|SetSoundChannel|EnableUserUI|DisplayTimedTextFromPlayer|"
    r"SetCameraField|UnitAddIndicator|Blz(Set|Get)Unit(Name|Skin)|"
    r"BlzUnitHideAbility|BlzSetUnitIntegerField)"
)
LIFECYCLE = re.compile(
    r"^(EndGame|ChangeLevel|PauseGame|GetDefaultDifficulty|TriggerSync|"
    r"FlushGameCache|InitGameCache|StoreInteger|GetStoredInteger|"
    r"SyncStoredInteger|FlushParentHashtable)"
)


def read(path):
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


def called_names(src):
    src = re.sub(r"//[^\n]*", "", src)
    src = re.sub(r'"(\\.|[^"\\])*"', '""', src)
    return {n for n in re.findall(r"\b([A-Za-z][A-Za-z0-9_]*)\s*\(", src) if n not in KEYWORDS}


def main(argv):
    if len(argv) != 5:
        print(__doc__)
        return 2
    common_j, blizzard_j, map_j, jass2_java = argv[1:]
    common, bliz, mapsrc = read(common_j), read(blizzard_j), read(map_j)

    natives = set(re.findall(r"^\s*(?:constant\s+)?native\s+([A-Za-z0-9_]+)\s", common, re.M))
    natives |= set(re.findall(r"^\s*(?:constant\s+)?native\s+([A-Za-z0-9_]+)\s", bliz, re.M))
    bj_names = set(re.findall(r"^\s*function\s+([A-Za-z0-9_]+)\s+takes", bliz, re.M))
    map_funcs = set(re.findall(r"^\s*function\s+([A-Za-z0-9_]+)\s+takes", mapsrc, re.M))
    implemented = set(re.findall(r'createNative\("([A-Za-z0-9_]+)"', read(jass2_java)))

    bj_bodies = {
        m.group(1): m.group(0)
        for m in re.finditer(
            r"^\s*function\s+([A-Za-z0-9_]+)\s+takes.*?^\s*endfunction", bliz, re.M | re.S
        )
    }

    map_calls = called_names(mapsrc)
    reachable_bjs = {n for n in map_calls if n in bj_names}
    frontier = list(reachable_bjs)
    while frontier:
        for callee in called_names(bj_bodies.get(frontier.pop(), "")):
            if callee in bj_names and callee not in reachable_bjs:
                reachable_bjs.add(callee)
                frontier.append(callee)

    direct = {n for n in map_calls if n in natives}
    via_bj = set()
    for bj in reachable_bjs:
        via_bj |= {n for n in called_names(bj_bodies.get(bj, "")) if n in natives}
    needed = direct | via_bj
    missing = sorted(n for n in needed if n not in implemented)

    print(f"Warsmash implements               : {len(implemented)} natives")
    print(f"map-defined functions             : {len(map_funcs)}")
    print(f"distinct call names in map script : {len(map_calls)}")
    print(f"  map-defined                     : {len(map_calls & map_funcs)}")
    print(f"  natives called directly         : {len(direct)}")
    print(f"  Blizzard.j BJs called directly  : {len(map_calls & bj_names)}")
    unresolved = sorted(map_calls - map_funcs - natives - bj_names)
    print(f"  UNRESOLVED (would hard-fail)    : {len(unresolved)} {unresolved if unresolved else ''}")
    print(f"BJ functions reachable            : {len(reachable_bjs)}")
    print(f"natives needed (direct + via BJ)  : {len(needed)}")
    print(f"  implemented                     : {len(needed) - len(missing)}")
    print(f"  MISSING (silent null returns)   : {len(missing)}")

    body = re.sub(r"//[^\n]*", "", mapsrc)
    sites = {n: len(re.findall(r"\b" + n + r"\s*\(", body)) for n in missing}
    groups = {"UI / cosmetic": [], "game-state / lifecycle": [], "GAMEPLAY-RELEVANT": []}
    for name in missing:
        key = (
            "UI / cosmetic"
            if COSMETIC.match(name)
            else "game-state / lifecycle"
            if LIFECYCLE.match(name)
            else "GAMEPLAY-RELEVANT"
        )
        groups[key].append(name)
    for key, names in groups.items():
        print(f"\n{key} ({len(names)}):")
        for name in sorted(names, key=lambda n: (-sites[n], n)):
            direct_mark = f"  [{sites[name]} direct call sites]" if sites[name] else ""
            print(f"  {name}{direct_mark}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
