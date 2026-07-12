#!/usr/bin/env bash
# Idempotent environment setup for wc3-map-toolkit (Debian/Ubuntu Linux).
# Installs node dependencies (incl. the primary MPQ backend, stormlib-node)
# and, when apt is available, the optional smpq CLI fallback backend.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. smpq — OPTIONAL fallback MPQ backend (the primary backend is the
#    stormlib-node native module installed via npm). Install it when apt is
#    available, but don't fail setup without it.
if command -v smpq >/dev/null 2>&1; then
    echo "smpq already installed: $(command -v smpq)"
elif command -v apt-get >/dev/null 2>&1; then
    echo "installing smpq via apt-get (optional fallback MPQ backend)..."
    SUDO=""
    if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
    if ! ($SUDO apt-get update -qq && $SUDO apt-get install -y smpq); then
        echo "WARN: smpq install failed — continuing (stormlib-node is the primary backend)"
    fi
else
    echo "WARN: no apt-get; skipping smpq (stormlib-node is the primary backend)"
fi

# 1b. pjass — OPTIONAL JASS syntax checker (lib/jasscheck.js; build-map and
#     validate-map degrade to a warning without it — same pattern as smpq).
#     Built from source (github.com/lep/pjass) into vendor/pjass (gitignored);
#     needs git + make + cc + flex + bison. NEVER fails setup: any missing
#     piece just skips the step with a WARN.
if [ -x vendor/pjass/pjass ]; then
    echo "pjass already built: vendor/pjass/pjass"
elif command -v pjass >/dev/null 2>&1; then
    echo "pjass already installed: $(command -v pjass)"
else
    PJASS_MISSING=""
    for t in git make cc flex bison; do
        command -v "$t" >/dev/null 2>&1 || PJASS_MISSING="$PJASS_MISSING $t"
    done
    if [ -n "$PJASS_MISSING" ] && command -v apt-get >/dev/null 2>&1; then
        echo "installing pjass build toolchain via apt-get (optional):$PJASS_MISSING"
        SUDO=""
        if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
        # shellcheck disable=SC2086  # word-splitting the package list is intended
        $SUDO apt-get install -y $(echo "$PJASS_MISSING" | sed 's/\bcc\b/gcc/') \
            || echo "WARN: toolchain install failed — pjass step will be skipped"
        PJASS_MISSING=""
        for t in git make cc flex bison; do
            command -v "$t" >/dev/null 2>&1 || PJASS_MISSING="$PJASS_MISSING $t"
        done
    fi
    if [ -n "$PJASS_MISSING" ]; then
        echo "WARN: missing$PJASS_MISSING — skipping pjass build (JASS maps pack unchecked; validate-map will WARN)"
    elif ! (git clone --depth 1 https://github.com/lep/pjass vendor/pjass \
            && make -C vendor/pjass >/dev/null); then
        rm -rf vendor/pjass
        echo "WARN: pjass clone/build failed — JASS maps pack unchecked (validate-map will WARN)"
    else
        echo "pjass built: vendor/pjass/pjass"
    fi
fi

# 1c. lua5.3 — OPTIONAL native 64-bit Lua 5.3 for tools/preflight.js's
#     cross-execution checks (luac-compile + PRNG portability vs the 32-bit
#     fengari sim). Same pattern as smpq/pjass: never fails setup; when
#     absent, preflight degrades those checks to WARN "unchecked".
if command -v lua5.3 >/dev/null 2>&1; then
    echo "lua5.3 already installed: $(command -v lua5.3)"
elif command -v apt-get >/dev/null 2>&1; then
    echo "installing lua5.3 via apt-get (optional 64-bit cross-execution checker)..."
    SUDO=""
    if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
    if ! $SUDO apt-get install -y lua5.3; then
        echo "WARN: lua5.3 install failed — preflight cross-execution checks will WARN 'unchecked'"
    fi
else
    echo "WARN: no apt-get; skipping lua5.3 (preflight cross-execution checks will WARN 'unchecked')"
fi

# 2. node dependencies (wc3maptranslator pinned to 5.0.0 — see CLAUDE.md).
#    stormlib-node is an optionalDependency (needs node-gyp); npm install
#    won't fail if its native build is impossible in this environment —
#    lib/mpq.js then falls back to the smpq CLI.
if [ ! -d node_modules/wc3maptranslator ]; then
    echo "installing npm dependencies..."
    npm install --no-audit --no-fund
else
    echo "npm dependencies already installed"
fi

# 3. Sanity checks
node -e "
const T = require('wc3maptranslator');
if (typeof T.InfoTranslator.warToJson !== 'function') throw new Error('wrong wc3maptranslator version (need 5.x static API)');
console.log('wc3maptranslator OK (static-method API present)');
require('mdx-m3-viewer-th/dist/cjs/parsers/w3x/map.js');
console.log('mdx-m3-viewer-th OK (second-opinion validator present)');
"
# At least one MPQ backend must work; report which one is active.
node -e "
const { backendName } = require('./lib/mpq');
const b = backendName();
if (b === 'smpq') {
  require('child_process').execFileSync('smpq', ['--version'], { stdio: 'ignore' });
  console.log('MPQ backend: smpq CLI (stormlib-node native module not loadable)');
} else {
  console.log('MPQ backend: stormlib-node (primary); force the CLI fallback with WC3_MPQ_BACKEND=smpq');
}
"
echo "setup complete — try: npm test  (and: npm run test:smpq  to test the fallback backend)"
