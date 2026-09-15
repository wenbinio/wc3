# Automation stack decisions — 15 September 2026

## Decision

Keep the proven source builder for current maps. Move verification from
best-effort warnings to explicit evidence gates; add a real-client boundary.
For NEW large authored projects, Wurst/Grill is the strongest typed-language
candidate. For agent-controlled visual editing, wc3-forge is the strongest
new candidate inspected, ahead of adding more GUI mouse automation. Neither
has been installed or validated on the offline user machine in this change.
These are adoption recommendations, not invented comparative benchmarks.

## Components

| Layer | Decision | Reason and adoption gate |
|---|---|---|
| Node runtime/bootstrap | Node 24, lockfile install, pinned pjass | Match converter v5's declared runtime; do not accept stale node_modules as installation evidence. Preserve locally edited tool checkouts. |
| MPQ I/O | Keep native StormLib; bounded smpq fallback | Current toolkit regressions and real build artifacts give an existing baseline. Two interfaces share StormLib, so they are not independent engines. |
| Map codecs | Keep exact wc3maptranslator 5.0.0 plus existing legacy codecs | No actual new-editor corpus exists yet. A package update is not evidence of lossless format support. |
| Independent parser | Pin War3Net.Build.Core 6.0.3 and run the existing checker on the example | An independent implementation can expose correlated writer/reader errors. It is a file-format opinion, not an emulator. |
| Lua test harness | Keep existing fixtures/golden runs; add opt-in strict native adapter | Replacing the VM wholesale risks changing prior outcomes. Explicit no-op/auto-stub exceptions expose test limitations; native Lua checks numeric/compile differences. |
| New typed map code | Pilot Wurst/Grill, not a forced rewrite of Lua | Maintainer documents targeted typechecks/tests, generated CI and patch/output-language selection. Require feature parity, unchanged data, and actual-client probes before moving production maps. |
| Agent visual editor | Trial wc3-forge on copies behind extraction/member comparison | Embedded MCP covers map data, terrain, objects, imports, models and script generation, with shared GUI undo. Alpha status and unmeasured round-trip compatibility preclude replacing the release packer now. |
| Manual visual inspection | Keep HiveWE optional | Useful alternative editor; it does not remove actual-engine acceptance. Do not make GUI clicks the authoritative build interface. |
| Asset pipeline | Keep procedural MDL/MDX + original images/audio for this prototype | After Hours demonstrates reproducible assets without paid generators or bundled game files. Forge's documented model importer is worth a separately gated asset trial. |
| Acceptance | Isolated, manually approved Windows client probe | Real movement orders and nonce-bound events, hashes, timeouts, client-window capture and replay candidates. Never execute an untrusted public PR on a personal gaming PC. |

## Alternatives not promoted to the default stack

Ceres is archived and its maintainer explicitly discontinued work. It is not
a sound new foundation for an unattended pipeline.

War3Net advertises broad goals, but its unified CLI, runtime and rendering
remain marked forthcoming in its current README. Do not base release
acceptance on roadmap code. Warsmash is useful research, not a substitute for
the current retail client: its own README identifies format and engine gaps.

TypeScriptToLua/w3ts remain plausible for a team already using TypeScript.
They add another transformation layer and still need correct object-data
serialization. A March 2026 upstream template issue reports missing level/
data-pointer handling for Channel fields. The new example writes those
columns explicitly and tests spell dispatch; actual engine button behavior
is still NOT_RUN. One reported issue is not evidence that all TS toolchains
are broken, nor a reason to port the whole existing Lua corpus blindly.

w3x2lni is a useful interchange/optimization tool, not an automatically safe
replacement codec for an unverified new editor version. Require the same
real corpus and full member-preservation checks as any other converter.

## Concrete adoption trials

Wurst: create one isolated project with the same fuse/interact/route logic;
use `grill typecheck`, a named `grill test`, and its generated CI. Compare
actual source/build complexity and runtime results, not guessed productivity
scores. Do not declare it better from feature lists alone.

Forge: query its actual MCP tool schemas at installation, open a COPY of the
example, move one prop, save-as, and compare all extracted members. Then
try one model import and minimap bake. No write-back to the only original.
Only qualify the surfaces demonstrated by those trials.

The current Windows device was offline. Those trials, actual editor fixture
creation/reopening, and the real-client probe remain blocked on an accessible
authorized installation. Preparing a probe does not manufacture its results.

## Primary sources inspected

- Wurst maintainer, Better AI & CI Support, 14 May 2026:
  https://wurstlang.org/news/better-ai-support.html
- Forge alpha MCP reference (152 tools; map/object/terrain/import/model/trigger surfaces):
  https://stephenshorton.github.io/wc3-forge/docs/tool-reference/
- Forge introduction/status: https://stephenshorton.github.io/wc3-forge/docs/
- War3Net shipped libraries vs roadmap: https://github.com/Drake53/War3Net
- Exact package: https://www.nuget.org/packages/War3Net.Build.Core/6.0.3
- Ceres maintainer/archive: https://github.com/ceres-wc3/ceres
- Warsmash limitations: https://github.com/Retera/WarsmashModEngine
- TS template issue: https://github.com/cipherxof/wc3-ts-template/issues/27
- w3x2lni scope: https://github.com/sumneko/w3x2lni
- HiveWE: https://github.com/stijnherfst/HiveWE
