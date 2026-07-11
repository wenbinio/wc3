# Four modern production maps — decomposition dossier

> **What this is**: the consolidated factual reference from decomposing four
> currently-hosted production maps (2026-07-11) with this toolkit — per-map
> provenance, container/protection profile, format versions, script and asset
> profiles, plus the ranked toolkit-gap list with the fix status of each item
> (wave 1 = commit `fbfdf46`, wave 2 = commit `26a2b87`). Numbers below were
> re-verified against the current tree (124-test suite) before writing.
> Working artifacts (maps, extractions, logs) lived in the session scratchpad
> only — nothing third-party was committed (CLAUDE.md gotcha 9).

The sample was chosen to cover today's production spectrum: a heavy
BlzFrame-UI strategy map (Europe at War), a huge open-source RPG (Northrend
Bound), a protected 2.0-editor zombie map (Great War Zombies), and a
classic-lineage siege map (X Hero Siege). **Good vs Evil was the intended
fourth sample but does not exist as a current map** — searches across Hive
Workshop, Epic War and wc3maps.com found no maintained 2020s release — so
X Hero Siege F-Day was substituted as the classic-genre representative.

## 1. The four maps

### 1a. Europe at War VIC4.07e_a (wc3maps.com id 269108, 11.25 MB)

- Internal name `|cff004080Europe at War VIC4.07e_a|r`; w3i: 7,033 editor
  saves, editorVersion 6115, gameVersion **1.36.0.20218**, 14 player slots.
- **Container**: bare MPQ (no HM3W pre-header, archive at offset 0).
- **Protection**: heaviest of the four. FAKE 2-entry `(listfile)`
  (`scripts\war3map.j`, `war3map.wts` only); 716 archive entries.
  Listfile∪KNOWN_FILES probing recovers 29 by name; `--recover-names`
  recovers **448 more** (mostly BLP icons/textures and MDX models, plus
  `war3mapImported\EaW.fdf`, `UIUtils.fdf`, both `.toc`s and
  `ui_peaceoffer.dds`); 237 stay anonymous.
  `war3map.w3r` is an 8-byte **protection trap**: `05 00 00 00` + four ASCII
  letters where the region count belongs (reads as 1,262,703,942 regions —
  crashes naive parsers). `war3mapUnits.doo` is protector-mangled
  (translator + viewer both reject it; editor-only file, harmless in game).
- **Formats**: w3e **v11**, w3i **v31**, object data v3 (+ full
  `war3mapSkin.w3*` set), doo v8.11, wts 421 KB / 3,852 strings.
- **Script**: JASS at `scripts\war3map.j`, 1.68 MB. The notable API surface
  is its custom frame UI: **54 `BlzCreateFrame` + 542 `BlzFrameSet*` +
  32 `BlzGetFrame` + 3 `BlzLoadTOCFile`** (~630 frame-API calls) driving
  FDF-defined frames (`war3mapimported\UIUtils.toc` etc.), plus ~2,085
  `BlzCreateUnitWithSkin` occurrences. This is the reference sample for
  what "modern strategy map UI" means.
- **Assets**: 119 MDX (all **v800**), 554 BLP (all **BLP1**), 1 DDS
  (`ui_peaceoffer.dds`), `war3mapMisc.txt` + `war3mapSkin.txt` +
  `war3mapExtra.txt`.
- Current validate-map: 43/45 (only the mangled editor-only Units.doo
  fails; bare container, trap and viewer-listfile disagreement are WARNs).

### 1b. Northrend Bound 2.48.5 (wc3maps.com, 91.15 MB)

- Internal name `|CFF18BE00Northrend Bound 2.48.5|r`; w3i: 4,858 saves,
  editorVersion 6115, gameVersion **1.36.0.20218**.
- **Container**: bare MPQ. **Unprotected / effectively open-source**: full
  1,685-name listfile, `war3map.wtg` (3.26 MB of WE GUI triggers),
  `war3map.wct`, `war3mapUnits.doo` all intact — the whole map opens in the
  World Editor. 0 anonymous entries.
- **Formats**: w3e **v11**, w3i **v31**, object data v3 (60 custom + 531
  modified-standard units), wts 1.76 MB / **11,345 strings** (the file that
  motivated the linear wts parser together with XHS).
- **Script**: WE-generated JASS, 3.19 MB `war3map.j` compiled from the GUI
  triggers; 535 `BlzCreateUnitWithSkin` calls (WE 1.36 emits it in
  `CreateAllUnits`); no frame API.
- **Assets**: the scale sample — 1,688 files: **648 MDX v800 + 2 MDX
  v1000** (Reforged-version models creeping in), 958 BLP1, 27 TGA, 1 DDS
  (`FullScreen.dds`), Misc/Skin/Extra txt, `war3mapPreview.tga`.

### 1c. Great War Zombies 0.8.6 (Epic War, 57.09 MB)

- Internal name `Great War Zombies 0.8.6`; w3i: 4,157 saves, editorVersion
  6116, gameVersion **2.0.3.22988** — saved by the current WC3 2.0 editor,
  and still ships **w3e v11** terrain (the datum that killed the "v11 is
  legacy" theory).
- **Container**: bare MPQ. **Protected**: stripped/fake listfile — 482
  entries, 24 recoverable by KNOWN_FILES probing; `--recover-names`
  recovers **401 more** (52 stay anonymous); editor-only files
  (wtg/wct/Units.doo/imp) deleted; wts stripped to 605 bytes / 1 string.
- **Formats**: w3e **v11**, w3i **v33** (current), object data v3 + full
  `war3mapSkin.w3*` set, doo v8.11 — with **184 doodads at life 0**, the
  file that exposed the upstream `life || 100` write-through bug.
- **Script**: obfuscated JASS (605 KB, 1–2-char identifiers, string
  literals/rawcodes survive); 1,927 lines call **`BlzCreateUnitWithSkin`**
  (unit placement compiled to script, skin-aware); no frame API.
- **Assets**: 179 MDX v800, 265 BLP1, 1 DDS (`FullScreen.dds`, recovered by
  name), MP3s, `war3mapMisc.txt` + `war3mapSkin.txt`, `conversation.json`.
- Current validate-map: **38/38 PASS** (16 WARNs: bare container,
  viewer-listfile skip, object-data lint).

### 1d. X Hero Siege F-Day 17.8c (Hive Workshop, 2.01 MB) — the GvE substitute

- HM3W name `|cFFF00000X Hero Siege F-Day 17.8c` ("Legendary Edition" on
  Hive); w3i: 1,046 saves, editorVersion **6059** (classic TFT era), 10
  player slots.
- **Container**: classic **HM3W + MPQ at 512** (the only one of the four).
  Unprotected: full listfile (116 entries, 0 anonymous), wtg/wct intact.
- **Formats**: the pure-classic profile — w3e **v11**, w3i **v25**, object
  data **v2** (w3u/w3t/w3a/w3h/w3q), classic doo (v8 with the layout
  upstream rejects via `RangeError`), wts 1.39 MB / **9,487 strings** (the
  file whose upstream regex parse OOM'd an 8 GB node heap).
- **Script**: plain classic JASS, 1.38 MB `war3map.j`, **zero `Blz*`
  natives** — runs on any client back to TFT.
- **Assets**: 37 MDX v800, 56 BLP1, no DDS/TGA; `war3mapMisc.txt` +
  `war3mapSkin.txt` present even here.

## 2. Cross-map findings (what "modern production" means)

- **Bare MPQ is the modern container norm**: 3 of 4 ship no HM3W pre-header
  (only classic-lineage XHS keeps it). Any tool that requires HM3W fails
  most current maps.
- **w3e v11 terrain is universal** — all four maps, including the one saved
  by the 2.0.3 editor. Nobody ships v12. w3i splits by ambition: v31
  (1.36-editor strategy/RPG maps), v33 (2.0 editor), v25 (classic).
- **MDX v800 + BLP1 are still the asset baseline** in 2026; Reforged-era
  formats appear only homeopathically (2 MDX v1000 in NB, one DDS per map
  in three of four).
- **The Skin/Misc/Extra txt layer is ubiquitous**: every map ships
  `war3mapMisc.txt` + `war3mapSkin.txt` (EaW/NB add `war3mapExtra.txt`),
  and modern maps ship `war3mapSkin.w3*` object-data overrides.
- **Protection is mainstream, and nastier than "no listfile"**: fake
  minimal listfiles (EaW), booby-trapped stub files with garbage count
  fields (EaW w3r), protector-truncated editor files. But names are
  recoverable — the map must reference its own files, so harvesting paths
  from scripts/object-data/toc/MDX-TEXS and hash-probing them recovers
  most anonymous members (EaW: 448 named, 237 left anonymous; GWZ: 401
  named, 52 left — both re-verified against the current tree).
- **Strings scale**: production wts files are 0.4–1.8 MB with ~4k–11k
  entries; anything super-linear in the parser dies on them.
- **`BlzCreateUnitWithSkin` is the standard unit-creation call** in
  1.36+/2.0-editor script output (NB, GWZ, EaW); our generated
  `CreateAllUnits()` still emits plain `CreateUnit`.

## 3. Ranked gaps list (status as of 2026-07-11)

Ranked by how hard each blocked the decomposition. "wave 1" = `fbfdf46`
(translator/container hardening), "wave 2" = `26a2b87` (version codecs).

| # | Gap | Status |
| --- | --- | --- |
| 1 | wts parse OOM'd 8 GB heap on ~10k-string files (XHS, NB) — upstream regex re-stringifies the buffer per match | **FIXED wave 1** — lib/wts.js linear parser (~20 ms), UTF-8 both ways |
| 2 | w3e v11 terrain unreadable (ALL four maps) → read-only viewer fallback only | **FIXED wave 2** — lib/codecs/w3e11.js read+write, byte-faithful, `"version": 11` marker |
| 3 | w3i v31/v25 unreadable (EaW, NB, XHS) | **FIXED wave 2** — lib/codecs/w3i31.js (v25/v31), same marker scheme |
| 4 | Bare-MPQ .w3x failed validation outright; no way to pack one | **FIXED wave 1** — validate-map WARNs, `--bare` on w3x-pack + build-map |
| 5 | Fake listfile (EaW: 2 entries) defeated the "probe KNOWN_FILES only when there is no listfile" fallback | **FIXED wave 1** — extraction always probes listfile ∪ KNOWN_FILES (2 → 29 named) |
| 6 | Anonymous imports unnameable (EaW 687, GWZ 458) | **FIXED wave 1** — `w3x-extract --recover-names` (script/object-data/toc/MDX-TEXS harvest + hash probe): EaW 448, GWZ 401 recovered; re-verified against current tree |
| 7 | Protection-trap stubs (EaW w3r: 8 bytes declaring 1.26 G regions) hung/killed parsers | **FIXED wave 1** — lib/traps.js pre-parse heuristic + bounded readString; degrades to WARN + raw copy, viewer parse skipped too |
| 8 | Doodad `life: 0` (GWZ ×184) silently became 100 on write → false round-trip FAIL on an intact file | **FIXED wave 1** — translator-fixes FIX C (256 write-through) |
| 9 | Non-ASCII strings mangled (upstream reads latin1 / writes truncated bytes) | **FIXED wave 1** — FIX A UTF-8 readString + lib/wts.js; gotcha 16 rewritten |
| 10 | Viewer MPQ reader failed on protector-mangled headers; unknown content sniffed poorly | **FIXED wave 1** — viewer MPQ shim; sniffer learned TGA/SLK/MDL/FDF/TOC |
| 11 | FDF/frame-UI authoring: we cannot author or lint BlzCreateFrame/FDF UIs (EaW's ~630-call surface); no `BlzLoadTOCFile`-target-exists lint | **OPEN** |
| 12 | Our builds never generate `war3mapSkin.w3*`, and lib/unitscript.js emits `CreateUnit`, not `BlzCreateUnitWithSkin` (modern editors emit skin-aware placements) | **OPEN** |
| 13 | No schema lint for the `war3mapMisc.txt` / `war3mapSkin.txt` / `war3mapExtra.txt` layer (present on all four maps; copied verbatim, typos undetected) | **OPEN** |
| 14 | Name recovery ceiling: 237 (EaW) / 52 (GWZ) members stay anonymous — a community-listfile dictionary probe (HiveWE/w3x listfiles) would name more | **OPEN** |
| 15 | No JASS syntax gate: the Lua path has luaparse, `war3map.j` is packed unchecked (pjass is the known tool) | **OPEN** |
| 16 | Scale/streaming: NB (91 MB, 1,685 members) works but whole-file buffering is the pattern everywhere; no streaming extraction/pack | **OPEN** |
| 17 | MDX v1000+ (NB ships 2): sanityTest bar is only proven for v800 — needs a >800 spot-check before trusting PASS/FAIL on Reforged models | **OPEN** |
| 18 | Object data v2 (XHS) and classic `.doo` remain read-only via `_viewer/`; wtg/wct remain opaque (no TriggerData.txt) | **PARTLY FIXED** (v25/v11 by wave 2; object data v1/v2 by `f4a9a40` — lib/codecs/objects2.js read+write, see docs/reference/ambitious-maps-analysis.md; classic `.doo` and wtg/wct stay read-only/opaque) |

## 4. Reproduction

```bash
node tools/w3x-extract.js --recover-names <map.w3x> /tmp/work/x   # counts as above
node tools/map-to-json.js /tmp/work/x /tmp/work/src               # v11/v25/v31 land in terrain/info.json
node tools/validate-map.js <map.w3x>                              # GWZ: 38/38, EaW: 43/45
```

The per-map numbers in §1 (entry counts, recovery counts, string counts,
MDX/BLP version histograms, w3i fields) were all re-derived from the
archives with the current tree on 2026-07-11.
