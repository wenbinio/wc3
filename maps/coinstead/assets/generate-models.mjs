#!/usr/bin/env node
// generate-models.mjs — the four Coinstead identity models, authored with
// assets/mdl-lib.mjs (the northreach known-good MDL library; CLAUDE.md
// gotchas 14/19). Every model passes mdx-m3-viewer's sanityTest at build
// time (mdl-lib self-checks; build-map re-enforces the same bar on
// imports/) and uses ONLY ReplaceableId 1 (player team color) — nothing
// Blizzard-authored is embedded (docs/ASSETS.md).
//
//   node maps/coinstead/assets/generate-models.mjs
//
// Writes to ../imports/war3mapImported/ (the path under imports/ IS the
// archive path). Object-data model FIELDS reference these with the .mdl
// extension (gotcha 22): war3mapImported\CoinsteadDepot.mdl etc.
//
//   CoinsteadDepot.mdx  — the shared vault: stone plinth, timber vault
//                         block, slate hip roof, a floating additive coin
//   MarketStall.mdx     — the shared market's street face: counter, four
//                         posts, two-tone awning, hanging coin sign
//   CoinWatchtower.mdx  — the plank-burning tower: timber shaft, jetty
//                         platform, corner crenels, amber rack glow
//   Orepit.mdx          — the ore harvester (2026-08 art fix, report §6):
//                         dark pit ring sunk in a spoil apron, TEAM-COLOR
//                         crane (untinted geoset = raw ReplaceableId 1) with
//                         iron winch line + bucket and an ember glint

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, quad, merge, buildModel } from './mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported');

// palette (plain RGB — mdl-lib handles the MDX B,G,R order, gotcha 19)
const STONE = [0.44, 0.42, 0.38];
const STONE_DARK = [0.3, 0.29, 0.27];
const TIMBER = [0.55, 0.4, 0.24];
const TIMBER_DARK = [0.38, 0.27, 0.16];
const SLATE = [0.26, 0.24, 0.32];
const CREAM = [0.85, 0.79, 0.6];
const BANNER_RED = [0.66, 0.18, 0.14];
const IRON = [0.2, 0.2, 0.24];
const COIN_GOLD = [1.0, 0.84, 0.32];

// four slanted quads forming a hip roof from a rectangular eave to a ridge
function hipRoof(hx, hy, z0, apexHx, z1) {
  return merge(
    quad([-hx, -hy, z0], [hx, -hy, z0], [apexHx, 0, z1], [-apexHx, 0, z1]),
    quad([-hx, hy, z0], [hx, hy, z0], [apexHx, 0, z1], [-apexHx, 0, z1]),
    quad([-hx, -hy, z0], [-hx, hy, z0], [-apexHx, 0, z1], [-apexHx, 0, z1]),
    quad([hx, -hy, z0], [hx, hy, z0], [apexHx, 0, z1], [apexHx, 0, z1]),
  );
}

// ------------------------------------------------------------------ Depot
buildModel({
  name: 'CoinsteadDepot',
  extents: { min: [-170, -170, 0], max: [170, 170, 330], radius: 400 },
  geosets: [
    { name: 'plinth', tint: STONE, mesh: box(-150, 150, -150, 150, 0, 52) },
    { name: 'vault', tint: TIMBER, mesh: merge(
      box(-112, 112, -112, 112, 52, 190),
      box(-34, 34, -118, -108, 52, 130),   // door lintel on the south face
    ) },
    { name: 'banding', tint: STONE_DARK, mesh: merge(
      box(-118, 118, -118, 118, 96, 110),
      box(-118, 118, -118, 118, 150, 164),
    ) },
    { name: 'roof', tint: SLATE, mesh: hipRoof(128, 128, 190, 52, 268) },
    { name: 'coin', tint: COIN_GOLD, additive: true, mesh: merge(
      box(-34, 34, -8, 8, 276, 330),      // the floating coin disc
      box(-10, 10, -12, 12, 292, 314),    // its punched center boss
    ) },
  ],
  outFile: path.join(OUT, 'CoinsteadDepot.mdx'),
});

// ------------------------------------------------------------ Market stall
buildModel({
  name: 'MarketStall',
  extents: { min: [-115, -95, 0], max: [115, 95, 175], radius: 230 },
  geosets: [
    { name: 'counter', tint: TIMBER_DARK, mesh: box(-95, 95, -58, 42, 0, 46) },
    { name: 'posts', tint: TIMBER, mesh: merge(
      box(-92, -78, -66, -52, 0, 118), box(78, 92, -66, -52, 0, 118),
      box(-92, -78, 52, 66, 0, 146), box(78, 92, 52, 66, 0, 146),
    ) },
    { name: 'awningfront', tint: CREAM, mesh:
      quad([-108, -78, 124], [108, -78, 124], [108, 0, 146], [-108, 0, 146]) },
    { name: 'awningback', tint: BANNER_RED, mesh:
      quad([-108, 0, 146], [108, 0, 146], [108, 78, 160], [-108, 78, 160]) },
    { name: 'wares', tint: STONE, mesh: merge(
      box(-70, -30, -50, -14, 46, 74), box(10, 62, -52, -18, 46, 66),
    ) },
    { name: 'sign', tint: COIN_GOLD, additive: true,
      mesh: box(-16, 16, -76, -70, 78, 110) },
  ],
  outFile: path.join(OUT, 'MarketStall.mdx'),
});

// ------------------------------------------------------------- Watchtower
buildModel({
  name: 'CoinWatchtower',
  extents: { min: [-75, -75, 0], max: [75, 75, 265], radius: 290 },
  geosets: [
    { name: 'footing', tint: STONE, mesh: box(-58, 58, -58, 58, 0, 34) },
    { name: 'shaft', tint: TIMBER, mesh: box(-38, 38, -38, 38, 34, 186) },
    { name: 'platform', tint: TIMBER_DARK, mesh: box(-60, 60, -60, 60, 186, 212) },
    { name: 'crenels', tint: STONE_DARK, mesh: merge(
      box(-60, -40, -60, -40, 212, 246), box(40, 60, -60, -40, 212, 246),
      box(-60, -40, 40, 60, 212, 246), box(40, 60, 40, 60, 212, 246),
    ) },
    { name: 'rackglow', tint: COIN_GOLD, additive: true,
      mesh: box(-18, 18, -18, 18, 216, 262) }, // the plank rack's watch-light
  ],
  outFile: path.join(OUT, 'CoinWatchtower.mdx'),
});

// NOTE: the Cannon Tower model used to be generated here (CannonKeep.mdx —
// the render-read's weakest silhouette). The 2026-08-07 Sol round-2 batch
// replaced it — h00A Cannon Tower now uses war3mapImported\SolCannonKeep.mdx
// (same 150x200 footprint and 205 top; provenance in ../imports-credits.json).
// The generator entry was removed WITH the file so this script keeps
// regenerating exactly what ships (assets doctrine; the SolLampPost
// precedent in maps/last-train/assets/generate-models.mjs).

// ---------------------------------------------------------------- Ore pit
// The Orepit harvester (hhou base) — the one coinstead building whose job
// no stock structure depicts (an open ore digging). Dark pit ring + a
// TEAM-COLOR crane: the crane geosets carry NO tint, so they render the raw
// ReplaceableId 1 team color (mdl-lib emits static Color only when a tint
// is given).
buildModel({
  name: 'Orepit',
  extents: { min: [-140, -140, 0], max: [140, 140, 235], radius: 320 },
  geosets: [
    { name: 'apron', tint: STONE, mesh: box(-130, 130, -130, 130, 0, 16) },
    { name: 'ring', tint: STONE_DARK, mesh: merge(
      box(-96, 96, -96, -72, 16, 44), box(-96, 96, 72, 96, 16, 44),   // n/s walls
      box(-96, -72, -72, 72, 16, 44), box(72, 96, -72, 72, 16, 44),   // e/w walls
    ) },
    { name: 'pitfloor', tint: [0.08, 0.07, 0.09], mesh: box(-72, 72, -72, 72, 16, 22) },
    { name: 'spoil', tint: TIMBER_DARK, mesh: merge(
      box(-128, -92, 84, 126, 16, 58), box(88, 126, -126, -88, 16, 50),
    ) },
    // the crane: untinted geosets -> raw team color (player identity)
    { name: 'cranepost', mesh: box(-110, -86, -12, 12, 16, 210) },
    { name: 'cranejib', mesh: merge(
      box(-110, 40, -10, 10, 186, 210),     // jib arm out over the pit
      box(-118, -78, -18, 18, 200, 218),    // counterweight cap
    ) },
    { name: 'winch', tint: IRON, mesh: merge(
      box(18, 26, -4, 4, 92, 190),          // hoist line
      box(2, 42, -20, 20, 58, 92),          // ore bucket
    ) },
    { name: 'oreglint', tint: COIN_GOLD, additive: true,
      mesh: box(8, 36, -14, 14, 84, 100) }, // raw ore glowing in the bucket
  ],
  outFile: path.join(OUT, 'Orepit.mdx'),
});

console.log('coinstead models regenerated: Depot, MarketStall, Watchtower, Orepit (CannonKeep is Sol\'s — see NOTE)');
