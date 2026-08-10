# warsmash-eval (experimental)

Probes that answer one question with evidence instead of inference:

> Can [WarsmashModEngine](https://github.com/Retera/WarsmashModEngine) be
> driven headlessly as an **outcome** harness for a Warcraft III custom map —
> tick the simulation N times and read out who owns what — so an AI can be
> measured without a human playing?

Findings, effort estimate and the blocker:
**`docs/reference/warsmash-eval-2026-08.md`**. Read that first; this directory
is only the reproduction kit.

Nothing here is a harness. These are three measuring instruments, all of which
run without any Warcraft III data, plus the exact commands that produced the
numbers in the dossier.

## Use

```bash
WORK=/tmp/warsmash-eval bash scripts/experimental/warsmash-eval/setup.sh
CP="$WORK/probe:$(cat $WORK/classpath.txt)"

# 1. how far does a headless map load get?
java -cp "$CP" MapLoadProbe /path/to/map.w3x [gameDataDir ...]

# 2. does the engine's JASS front end accept the map's script?
java -cp "$CP" JassParseProbe common.j Blizzard.j war3map.j

# 3. which natives does the map need that the engine does not implement?
python3 scripts/experimental/warsmash-eval/native-coverage.py \
    common.j Blizzard.j war3map.j \
    "$WORK/WarsmashModEngine/core/src/com/etheller/warsmash/parsers/jass/Jass2.java"
```

## Rules

- **Nothing third-party is committed.** The engine clone, the map and any
  Warcraft III data live under `$WORK`, outside the repo (gotcha 9 / Legal).
- **`common.j` / `Blizzard.j` and the game's SLK tables are user-supplied**
  from a legitimately owned install — exactly the `WC3_COMMONJ` /
  `WC3_BLIZZARDJ` convention the pjass gate already uses. Never commit them.
- The engine's own `./gradlew` (7.3.3) **cannot run on JDK 17+**. Use a system
  Gradle 8.x; `setup.sh` does. Only `:core`, `:shared`, `:jassparser` and
  `:fdfparser` are built — `:desktop` is LWJGL/OpenGL and a headless harness
  never touches it.
