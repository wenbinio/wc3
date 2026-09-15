# Automated build and evidence workflow

The default branch and existing game sources are not changed by these tools.
Work on the tooling PR until it is reviewed. Do not feed public-PR code into
a personal Windows machine or persistent privileged runner.

## Commands

Use Node 24 and `bash scripts/setup.sh` on Debian/Ubuntu. Setup uses the lock
file and pins pjass. `npm test` now explicitly selects test files rather than
letting Node discover the CLI test runner recursively. Archive tests still
need BOTH interfaces. Run `npm run preflight` too.

Build a complete example:

```sh
npm run build:after-hours -- _build/after-hours-new
```

Record a profile from the actual installed files, kept OUTSIDE Git:

```sh
node tools/automation.cjs profile /private/common.j /private/Blizzard.j /private/game.exe /private/profile.json 'locally observed version'
```

The profile binds hashes and records the current mock-native coverage. The
version label is not automatically authenticated and the record does not
assert runtime behavior. No game files ship with this repository.

Run a stricter headless qualification:

```sh
WC3_JASS_API_DIR=/private/game-api node tools/automation.cjs qualify /private/map-source _build/qualification-new --profile /private/profile.json
```

It builds a source snapshot, validates the actual map, runs preflight, checks
extraction receipts, requires actual API files and native tools, and rejects
unapproved warnings and missing byte-bound asset permissions. Outputs say
`HEADLESS_QUALIFIED` or `BLOCKED`, never `releaseReady: true`.
`--waivers` accepts `{entries:[{id,fingerprint,sourceSha256,reason,expires}]}`:
exact diagnostic and input hash, meaningful reason, future expiry. Unused
exceptions block. Do not waive missing APIs or failed checks. Asset permission
records are `{entries:[{path,sha256,redistributionPermitted:true,authority}]}`
under `asset-permissions.json` or `--permissions`; paths are relative to
`imports/`. These are recorded permissions, not automatically verified law.

For new strict unit tests, `require('./tools/strict-sim.cjs').strictLoad`
rejects auto-stub and specified no-op behavior unless `allowStubs` names an
exact exception. Existing maps are not silently migrated to a new VM.

## Actual editor corpus

`editor-corpus.json` is deliberately empty and FAILS with `NO_FIXTURES`.
Make a PRIVATE copy with entries containing `id`, `path`, `sha256`, and
`provenance:{kind:'self-authored-editor-output',author,editorBuild}`.
Paths are relative to that private manifest. Use actual editor-created maps,
not hand-authored binary unit fixtures. Begin with plain JASS/Lua baselines,
then one feature per map. Run:

```sh
node tools/automation.cjs corpus /private/corpus.json _build/corpus-new
```

Both archive interfaces run, but both use StormLib: this is interface
coverage, not independent archive-engine validation. Unknown members and
unexplained byte changes block. Editor reopening and client loading remain
separate `NOT_RUN` checks. The optional War3Net parser supplies another
implementation; its dependency is pinned to 6.0.3, not floating `6.*`.

## Actual-client path probe

This probe uses the real After Hours level and real movement orders to reach
one fuse. In the DIAGNOSTIC COPY ONLY, the monster is paused and the worker
is protected from captures. It tests pathing under those conditions, not
ordinary gameplay difficulty, combat, spell buttons, visuals or multiplayer.

```sh
node tools/client/prepare-probe.cjs _build/after-hours-new/source _build/probe-new
```

On an authorized interactive Windows desktop, with Warcraft initially closed:

```powershell
pwsh -File tools/client/Run-Probe.ps1 -RequestFile C:\private\probe-new\request.json -GameExe C:\actual-install\game.exe -Profile C:\private\profile.json -CommonJ C:\private\common.j -BlizzardJ C:\private\Blizzard.j -TelemetryRoot C:\actual-warcraft-user-data\CustomMapData -OutputDirectory C:\private\probe-result-new -StopOwnedProcess
```

The paths above are parameter illustrations, not discovered installation
paths. Select the actual engine executable, not Battle.net. The runner
checks executable/API/map hashes, refuses existing game sessions, acquires
a desktop lock, rejects stale nonce files, limits waiting, and reads bounded
checkpoint text without executing it. It stops only the process it launched
when `-StopOwnedProcess` is present. A launcher handoff is reported as failure,
not assumed to be a successful load. Output includes actual events, hashes,
exit/timeout state and errors. No such game run occurred during this change:
the connected device was offline. The capture helper requests only the owned game window, in a separate process
with a ten-second deadline. A PNG is CAPTURED_UNVALIDATED (GPU capture may be
black), not a visual pass. Optional `-ReplayDirectory` collects at most two
new, bounded replay candidates after closing the owned client; their map
attribution is NOT established. Save/load, appearance and cross-network
acceptance remain separate work, not implied by a probe pass.

Do not install a persistent public-PR self-hosted runner on a personal gaming
PC. A dedicated disposable/isolated Windows worker executing manually
approved revisions is the appropriate later deployment boundary.
