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
//   CannonKeep.mdx      — the ingot-burning tower: squat stone drum, cap,
//                         iron barrel, muzzle ember

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

// ------------------------------------------------------------ Cannon keep
buildModel({
  name: 'CannonKeep',
  extents: { min: [-80, -125, 0], max: [80, 80, 205], radius: 260 },
  geosets: [
    { name: 'drum', tint: STONE, mesh: merge(
      box(-66, 66, -66, 66, 0, 128),
      box(-50, 50, -50, 50, 128, 158),
    ) },
    { name: 'cap', tint: STONE_DARK, mesh: box(-74, 74, -74, 74, 158, 178) },
    { name: 'barrel', tint: IRON, mesh: merge(
      box(-16, 16, -120, -40, 138, 170),   // the gun, run out to the south
      box(-22, 22, -52, -36, 130, 178),    // its trunnion block
    ) },
    { name: 'muzzle', tint: COIN_GOLD, additive: true,
      mesh: box(-12, 12, -132, -118, 142, 166) },
  ],
  outFile: path.join(OUT, 'CannonKeep.mdx'),
});

console.log('coinstead models regenerated: Depot, MarketStall, Watchtower, CannonKeep');
