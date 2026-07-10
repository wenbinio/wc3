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
