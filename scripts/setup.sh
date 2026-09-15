#!/usr/bin/env bash
# Development bootstrap, Debian/Ubuntu. Game files are never downloaded here.
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (+process.versions.node.split(".")[0] !== 24) throw Error("Install Node 24 before setup; converter v5 requires it")'
PJASS_SHA=378a1ca9af3848fbc3be3d17069bcdb6a940ee32
if command -v apt-get >/dev/null 2>&1; then
    SUDO=""; if [ "$(id -u)" -ne 0 ]; then SUDO=sudo; fi
    $SUDO apt-get update -qq
    $SUDO apt-get install -y smpq lua5.3 build-essential flex bison python3 python3-pil libstorm-dev git
fi
# Always honor package-lock.json. A stale node_modules directory is not evidence
# that the selected versions were installed successfully.
npm ci --no-audit --no-fund
if [ ! -e vendor/pjass ]; then
    mkdir -p vendor/pjass
    git -C vendor/pjass init -q
    git -C vendor/pjass remote add origin https://github.com/lep/pjass.git
fi
# Do not erase or overwrite another checkout to force a green setup result.
if [ -d vendor/pjass/.git ]; then
    if [ -n "$(git -C vendor/pjass status --porcelain --untracked-files=no)" ]; then
        echo 'ERROR: vendor/pjass has local changes; preserve/reconcile them before setup' >&2
        exit 1
    fi
    git -C vendor/pjass fetch --depth 1 origin "$PJASS_SHA"
    git -C vendor/pjass checkout --detach "$PJASS_SHA"
    make -C vendor/pjass
else
    echo 'ERROR: vendor/pjass is not the managed Git checkout; leave it untouched and reconcile' >&2
    exit 1
fi
node -e 'const m=require("./lib/mpq"); const b=m.backendName(); if(b==="smpq")m.assertSmpq(); console.log("MPQ interface:",b)'
node -e 'const p=require("./tools/preflight"); if(!p.findLua53())throw Error("native Lua 5.3 is required by this bootstrap")'
node -e 'if(!require("./lib/jasscheck").findPjass())throw Error("pjass unavailable after setup")'
echo 'Development dependencies ready. Run npm test AND npm run preflight. Actual-client acceptance has not been performed.'
