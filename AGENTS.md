# Warcraft III toolkit: agent entrypoint

Read `CLAUDE.md` first. Its baseline, preflight, format, asset and map-specific
rules apply to every agent, not just one provider. Then read the relevant
`docs/PIPELINE.md` section and the target map's README before editing.

- Work on a separate branch. Run `npm test` AND `npm run preflight` before
  and after changes. Archive changes additionally require explicit
  `WC3_MPQ_BACKEND=stormlib` and `WC3_MPQ_BACKEND=smpq` runs; an implicit
  fallback does not prove both backends. Explain new WARNs against baseline.
- Build a new output, never overwrite the only original map. For preservation,
  compare decompressed members with `tools/compare-map-members.js`; extraction
  counts must independently establish completeness. A whole-archive hash is
  not a useful payload-preservation check after recompression.
- New patch features require actual editor-produced fixtures and local game
  API files. `tools/inspect-game-api.js` inspects declarations; it does not
  prove engine behaviour or authorize new format writers. Do not guess native
  names from patch-note prose, silently upgrade codecs, or invent telemetry.
- Mocked natives, headless logic tests and CI are not Warcraft client,
  pathfinding, visual, multiplayer or release acceptance. Keep those statuses
  separate. Follow `docs/reference/tooling-upgrade-2026-09.md` for the next gates.
- Keep user-supplied game files and third-party maps outside version control.
  Credit is not redistribution permission: respect each asset's actual terms,
  including no-rehosting restrictions, and preserve existing provenance.
- Do not edit the Rome experiment's endpoints or tune its AI as part of a
  toolkit patch. Require reproducible real telemetry before gameplay claims;
  do not round-trip its compiled scripts through World Editor.
