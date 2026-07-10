#!/usr/bin/env bash
# Idempotent environment setup for wc3-map-toolkit (Debian/Ubuntu Linux).
# Installs the smpq MPQ CLI (StormLib) and node dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. smpq — MPQ archiver used for all .w3x archive I/O
if command -v smpq >/dev/null 2>&1; then
    echo "smpq already installed: $(command -v smpq)"
else
    echo "installing smpq via apt-get..."
    SUDO=""
    if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
    $SUDO apt-get update -qq
    $SUDO apt-get install -y smpq
fi

# 2. node dependencies (wc3maptranslator pinned to 5.0.0 — see CLAUDE.md).
#    stormlib-node is optional (needs node-gyp); npm install won't fail if
#    its native build is impossible in this environment.
if [ ! -d node_modules/wc3maptranslator ]; then
    echo "installing npm dependencies..."
    npm install --no-audit --no-fund
else
    echo "npm dependencies already installed"
fi

# 3. Sanity check
node -e "
const T = require('wc3maptranslator');
if (typeof T.InfoTranslator.warToJson !== 'function') throw new Error('wrong wc3maptranslator version (need 5.x static API)');
console.log('wc3maptranslator OK (static-method API present)');
"
smpq --version >/dev/null && echo "smpq OK"
echo "setup complete — try: npm test"
