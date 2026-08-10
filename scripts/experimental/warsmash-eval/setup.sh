#!/usr/bin/env bash
# warsmash-eval/setup.sh — clone + build WarsmashModEngine headlessly and emit
# a runtime classpath for the probes in this directory.
#
# Nothing here is committed into the repo: the engine is cloned into $WORK
# (default: a scratch dir), which must NOT be inside the repo.
#
# Findings that made this script what it is (see
# docs/reference/warsmash-eval-2026-08.md):
#   - the bundled ./gradlew is Gradle 7.3.3 and CANNOT run on JDK 21
#     ("Unsupported class file major version 65"). Use a system Gradle 8.x.
#   - only :core (+ :shared :jassparser :fdfparser) is needed; :desktop pulls
#     LWJGL/GL natives that a headless harness never uses.
set -euo pipefail

WORK="${WORK:-${TMPDIR:-/tmp}/warsmash-eval}"
GRADLE="${GRADLE:-gradle}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$WORK"
cd "$WORK"

if [ ! -d WarsmashModEngine ]; then
  git clone --depth 1 https://github.com/Retera/WarsmashModEngine.git
fi

"$GRADLE" --no-daemon -p WarsmashModEngine :core:compileJava :jassparser:compileJava

# Runtime classpath: gradle prints :core's, then we append the sibling module
# output dirs (RawcodeUtils lives in :shared, the JASS runner in :jassparser).
# Injected as an init script so the cloned build.gradle is never modified.
cat > "$WORK/printcp.gradle" <<'EOF'
allprojects { tasks.register('printCp') { doLast { println sourceSets.main.runtimeClasspath.asPath } } }
EOF
CP=$("$GRADLE" --no-daemon -p WarsmashModEngine -I "$WORK/printcp.gradle" :core:printCp -q | tail -1)
for m in shared jassparser fdfparser; do
  CP="$CP:$WORK/WarsmashModEngine/$m/build/classes/java/main"
done
echo "$CP" > "$WORK/classpath.txt"

mkdir -p "$WORK/probe"
javac -nowarn -cp "$CP" -d "$WORK/probe" "$HERE"/*.java

echo
echo "built. classpath: $WORK/classpath.txt   probes: $WORK/probe"
echo "  java -cp \"$WORK/probe:\$(cat $WORK/classpath.txt)\" MapLoadProbe <map.w3x> [gameDataDir ...]"
echo "  java -cp \"$WORK/probe:\$(cat $WORK/classpath.txt)\" JassParseProbe common.j Blizzard.j war3map.j"
