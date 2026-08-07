#!/usr/bin/env node
// generate-models.mjs — Last Train from Yio Chu Kang's generated identity
// models, authored with assets/mdl-lib.mjs (the northreach/coinstead
// known-good MDL library; CLAUDE.md gotchas 14/19). Every model passes
// mdx-m3-viewer's sanityTest at generation time (mdl-lib self-checks;
// build-map re-enforces the same bar on imports/) and embeds nothing
// Blizzard-authored (docs/ASSETS.md). The estate's HUMAN-scale pieces
// (citizens, zombies, cars, furniture) are community models — see
// ../imports-credits.json; these generated pieces are the map's signature
// infrastructure no community pack depicts:
//
//   node maps/last-train/assets/generate-models.mjs
//
//   MRTTrain.mdx        — the map's signature: three box-body train cars in
//                         the North-South line livery (red cab band, white
//                         body, window strip), coupled, on wheel skirts
//   StationPlatform.mdx — platform slab + twin shelter canopy on columns +
//                         yellow warning line ("mind the platform gap")
//   TrackSegment.mdx    — one span of elevated viaduct: two grey piers, a
//                         deck slab, twin rails (repeated along the line)
//   HDBBlockA.mdx       — a 10-storey HDB slab block: banded window
//                         floors, void deck columns at street level, and a
//                         TEAM-COLOR roof water tank (untinted = raw
//                         ReplaceableId 1, the northreach/coinstead trick)
//   HDBBlockB.mdx       — the point-block variant: squarer plan, corridor
//                         band, different roofline (visual variety so the
//                         estate never reads as a clone crowd, gotcha 31)
//   Substation.mdx      — the generator objective: fenced yard, transformer
//                         box, insulator posts, an additive amber live-lamp
//   Barricade.mdx       — the craftable barricade: crossed planks over a
//                         frame with sandbag feet
//
// 2026-08-07 VISUAL-IDENTITY pass (see README "Visual identity & the
// camera-safety doctrine"): the CBD skyline backdrop, MRT identity pieces
// and estate-character props below —
//   SkyTowerSlab/Step/Crown/Twin/Spire.mdx — five distinct night-silhouette
//                         towers (500-800 tall) for the NORTH-EDGE skyline
//                         row: dark massing, per-floor window-band rhythm
//                         (the Sol z-level banding technique) and dim
//                         additive window glints. The Crown is a generic
//                         three-column-with-deck silhouette — suggestive of
//                         a bayfront hotel, deliberately no real building's
//                         trade dress.
//   MRTEntrance.mdx     — station-approach portal: curved glass canopy
//                         (vault sheet) over a dark stair void, <=170 tall
//   MRTSign.mdx         — line-signage totem: white pylon + abstract red
//                         disc with a white cross-band (roundel-SUGGESTIVE
//                         mass only, no text, no real logo geometry)
//   LaundryRack.mdx     — the single most Singaporean cue: bamboo-pole
//                         laundry lines with hanging cloth, flush-mounted
//                         against HDB block south faces at mid-level
//   LinkwayCanopy.mdx   — one covered-walkway segment (the estate linkway),
//                         terracotta roof on thin posts, < 100 tall

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { box, quad, merge, buildModel } from './mdl-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'imports', 'war3mapImported');

// palette (plain RGB — mdl-lib handles the MDX B,G,R order, gotcha 19)
const CONCRETE = [0.62, 0.60, 0.56];
const CONCRETE_DARK = [0.42, 0.41, 0.39];
const WHITE_BODY = [0.88, 0.88, 0.90];
const MRT_RED = [0.78, 0.12, 0.12];
const WINDOW_DARK = [0.10, 0.12, 0.16];
const ROOF_GREY = [0.30, 0.30, 0.33];
const RAIL_IRON = [0.16, 0.16, 0.18];
const WARN_YELLOW = [0.95, 0.80, 0.10];
const HDB_CREAM = [0.82, 0.78, 0.70];
const HDB_BAND = [0.55, 0.65, 0.60];
const TIMBER = [0.50, 0.36, 0.22];
const TIMBER_DARK = [0.34, 0.25, 0.15];
const SANDBAG = [0.58, 0.52, 0.40];
const FENCE_GREY = [0.35, 0.35, 0.37];
const AMBER = [1.0, 0.72, 0.20];
// visual-identity pass palette
const HDB_TRIM = [0.72, 0.70, 0.66];       // muted per-floor band (was sage)
const PASTEL_CORAL = [0.87, 0.50, 0.42];   // HDBBlockA accent
const PASTEL_MINT = [0.55, 0.78, 0.66];    // HDBBlockB accent
const SKY_BODY = [0.20, 0.21, 0.26];       // night skyline massing
const SKY_BODY_LT = [0.24, 0.25, 0.31];
const SKY_BAND = [0.30, 0.32, 0.38];       // window-band rhythm line
const GLINT_WARM = [0.55, 0.42, 0.18];     // dim additive window glints
const GLINT_COOL = [0.24, 0.38, 0.48];
const GLASS_TEAL = [0.16, 0.30, 0.32];     // entrance canopy glass
const LINK_ROOF = [0.72, 0.30, 0.22];      // linkway terracotta
const CLOTH_WHITE = [0.90, 0.90, 0.92];
const CLOTH_BLUE = [0.55, 0.66, 0.88];
const CLOTH_CORAL = [0.90, 0.58, 0.50];
const POLE_BAMBOO = [0.72, 0.62, 0.38];

// --- extra geometry helpers (visual-identity pass) -----------------------
// n-gon disc, axis along Y (thin slab facing north/south): circle in x-z.
function discY(cx, cz, r, y0, y1, n = 12) {
  const ring0 = [], ring1 = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    ring0.push([+(cx + r * Math.cos(a)).toFixed(2), y0, +(cz + r * Math.sin(a)).toFixed(2)]);
    ring1.push([+(cx + r * Math.cos(a)).toFixed(2), y1, +(cz + r * Math.sin(a)).toFixed(2)]);
  }
  const verts = [...ring0, ...ring1, [cx, y0, cz], [cx, y1, cz]];
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j], [i, n + j, n + i]);           // rim
    faces.push([2 * n, j, i], [2 * n + 1, n + i, n + j]);   // caps
  }
  return { verts, faces };
}
// arched vault sheet: sine-arc profile across x, extruded along y
// (TwoSided material renders it from below too).
function vault(x0, x1, y0, y1, zBase, rise, segs = 6) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([x0 + (x1 - x0) * t, zBase + Math.sin(Math.PI * t) * rise]);
  }
  const parts = [];
  for (let i = 0; i < segs; i++) {
    const [xa, za] = pts[i], [xb, zb] = pts[i + 1];
    parts.push(quad([xa, y0, +za.toFixed(2)], [xb, y0, +zb.toFixed(2)],
      [xb, y1, +zb.toFixed(2)], [xa, y1, +za.toFixed(2)]));
  }
  return merge(...parts);
}
// deterministic hash for lit-window scatter (no Math.random — reproducible)
function hash01(a, b, c) {
  let h = (a * 374761393) ^ (b * 668265263) ^ (c * 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// scattered lit-window boxes proud of the ±y faces of a tower body
function glintsY(hx, hy, z0, floors, dz, cols, salt, keep = 0.26) {
  const parts = [];
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x0 = -hx + 8 + (c * (2 * hx - 16)) / cols;
      const z = z0 + f * dz + dz * 0.35;
      for (const s of [-1, 1]) {
        if (hash01(f, c * 2 + (s > 0 ? 1 : 0), salt) < keep) {
          parts.push(box(x0, x0 + Math.min(14, (2 * hx - 16) / cols - 4),
            s * hy - 1.5, s * hy + 1.5, z, z + Math.min(10, dz * 0.4)));
        }
      }
    }
  }
  return merge(...parts);
}
// shift a mesh in x (for per-column glints on gapped towers)
function shiftX(mesh, dx) {
  return { verts: mesh.verts.map(([x, y, z]) => [x + dx, y, z]), faces: mesh.faces };
}
// per-floor window-band rhythm lines (the Sol z-level technique)
function bandsY(hx, hy, z0, floors, dz, proud = 1.5) {
  const parts = [];
  for (let f = 1; f <= floors; f++) {
    const z = z0 + f * dz;
    parts.push(box(-hx - proud, hx + proud, -hy - proud, hy + proud, z - 3, z));
  }
  return merge(...parts);
}

// ------------------------------------------------------------- MRT train
// Three cars along the Y axis (the track runs north-south on the map).
function trainCar(y0, y1, cab) {
  const parts = [
    box(-52, 52, y0 + 6, y1 - 6, 26, 118),            // body shell
    box(-56, 56, y0 + 10, y1 - 10, 96, 104),          // roofline rib
  ];
  const m = merge(...parts);
  return m;
}
buildModel({
  name: 'MRTTrain',
  extents: { min: [-70, -430, 0], max: [70, 430, 150], radius: 470 },
  geosets: [
    { name: 'bodies', tint: WHITE_BODY, mesh: merge(
      trainCar(-420, -150), trainCar(-140, 140), trainCar(150, 420),
    ) },
    { name: 'windows', tint: WINDOW_DARK, mesh: merge(
      box(-54, 54, -400, -170, 62, 88),
      box(-54, 54, -120, 120, 62, 88),
      box(-54, 54, 170, 400, 62, 88),
      // cab windscreens on the end faces
      box(-40, 40, -426, -420, 66, 92),
      box(-40, 40, 420, 426, 66, 92),
      // door rhythm: four door pairs per car, proud of the window strip
      ...[-390, -318, -246, -180, -110, -38, 38, 110, 180, 246, 318, 390]
        .map((y) => box(-55, 55, y - 10, y + 10, 38, 88)),
    ) },
    { name: 'redband', tint: MRT_RED, mesh: merge(
      box(-56, 56, -424, -406, 30, 116),   // south cab face band
      box(-56, 56, 406, 424, 30, 116),     // north cab face band
      box(-54.5, 54.5, -400, 400, 52, 62), // waist stripe under the windows
    ) },
    { name: 'roof', tint: ROOF_GREY, mesh: merge(
      box(-46, 46, -414, -156, 104, 122),
      box(-46, 46, -134, 134, 104, 122),
      box(-46, 46, 156, 414, 104, 122),
    ) },
    { name: 'skirts', tint: RAIL_IRON, mesh: merge(
      box(-44, 44, -404, -166, 0, 30),
      box(-44, 44, -124, 124, 0, 30),
      box(-44, 44, 166, 404, 0, 30),
      box(-20, 20, -150, -140, 60, 80),    // couplers
      box(-20, 20, 140, 150, 60, 80),
    ) },
    { name: 'headlight', tint: AMBER, additive: true, mesh: merge(
      box(-30, 30, -428, -422, 44, 60),
      box(-30, 30, 422, 428, 44, 60),
    ) },
  ],
  outFile: path.join(OUT, 'MRTTrain.mdx'),
});

// ------------------------------------------------------ station platform
buildModel({
  name: 'StationPlatform',
  extents: { min: [-190, -330, 0], max: [190, 330, 210], radius: 420 },
  geosets: [
    { name: 'slab', tint: CONCRETE, mesh: box(-180, 180, -320, 320, 0, 34) },
    { name: 'warnline', tint: WARN_YELLOW, mesh: box(140, 164, -320, 320, 34, 38) },
    { name: 'columns', tint: CONCRETE_DARK, mesh: merge(
      box(-90, -70, -300, -280, 34, 170), box(-90, -70, 280, 300, 34, 170),
      box(-90, -70, -90, -70, 34, 170), box(-90, -70, 70, 90, 34, 170),
    ) },
    { name: 'canopy', tint: ROOF_GREY, mesh: merge(
      box(-150, 60, -330, -30, 170, 190),
      box(-150, 60, 30, 330, 170, 190),
    ) },
    { name: 'signband', tint: MRT_RED, mesh: box(-150, -130, -330, 330, 150, 170) },
  ],
  outFile: path.join(OUT, 'StationPlatform.mdx'),
});

// -------------------------------------------------------- track segment
buildModel({
  name: 'TrackSegment',
  extents: { min: [-90, -260, 0], max: [90, 260, 240], radius: 380 },
  geosets: [
    { name: 'piers', tint: CONCRETE_DARK, mesh: merge(
      // thickened piers + T-crossheads so the viaduct reads from the game
      // camera (the 2026-08-07 render pass: 40-wide piers read as sticks)
      box(-52, 52, -238, -182, 0, 148),
      box(-52, 52, 182, 238, 0, 148),
      box(-86, 86, -248, -172, 148, 170),   // crosshead caps
      box(-86, 86, 172, 248, 148, 170),
    ) },
    { name: 'deck', tint: CONCRETE, mesh: merge(
      box(-80, 80, -256, 256, 170, 206),
      box(-88, -76, -256, 256, 206, 226),   // parapets
      box(76, 88, -256, 256, 206, 226),
    ) },
    { name: 'rails', tint: RAIL_IRON, mesh: merge(
      box(-34, -22, -256, 256, 206, 216),
      box(22, 34, -256, 256, 206, 216),
    ) },
  ],
  outFile: path.join(OUT, 'TrackSegment.mdx'),
});

// ------------------------------------------------------------ HDB blocks
// Slab block: long plan, window bands per floor, void deck at street level.
function windowBands(hx, hy, floors, z0, dz) {
  const parts = [];
  for (let i = 0; i < floors; i++) {
    const z = z0 + i * dz;
    parts.push(box(-hx - 2, hx + 2, -hy - 2, hy + 2, z + dz - 14, z + dz - 4));
  }
  return merge(...parts);
}
buildModel({
  name: 'HDBBlockA',
  extents: { min: [-230, -120, 0], max: [230, 120, 560], radius: 600 },
  geosets: [
    { name: 'voiddeck', tint: CONCRETE_DARK, mesh: merge(
      box(-215, -195, -95, -75, 0, 64), box(195, 215, -95, -75, 0, 64),
      box(-215, -195, 75, 95, 0, 64), box(195, 215, 75, 95, 0, 64),
      box(-75, -55, -95, -75, 0, 64), box(55, 75, -95, -75, 0, 64),
      box(-75, -55, 75, 95, 0, 64), box(55, 75, 75, 95, 0, 64),
      box(-225, 225, -105, 105, 64, 92),   // first slab over the void deck
    ) },
    { name: 'body', tint: HDB_CREAM, mesh: box(-220, 220, -100, 100, 92, 520) },
    { name: 'bands', tint: HDB_TRIM, mesh: windowBands(220, 100, 9, 92, 46) },
    // Singapore-estate pastel accent (coral scheme): gable end columns +
    // the parapet band under the roof — the 2026-08-07 recolor pass
    { name: 'accent', tint: PASTEL_CORAL, mesh: merge(
      box(-230, -212, -104, 104, 92, 520),   // painted gable ends (the
      box(212, 230, -104, 104, 92, 520),     // classic HDB end-wall scheme)
      box(-224, 224, -104, 104, 500, 520),   // parapet band
    ) },
    { name: 'gablestripe', tint: WHITE_BODY, mesh: merge(
      box(-231, -211, -105, 105, 296, 344),  // white stripe across the gable
      box(211, 231, -105, 105, 296, 344),
    ) },
    { name: 'roof', tint: CONCRETE, mesh: box(-228, 228, -108, 108, 520, 544) },
    // the roof water tank renders raw team color (untinted geoset)
    { name: 'tank', mesh: box(-60, 20, -50, 40, 544, 600) },
  ],
  outFile: path.join(OUT, 'HDBBlockA.mdx'),
});
buildModel({
  name: 'HDBBlockB',
  extents: { min: [-150, -150, 0], max: [150, 150, 640], radius: 640 },
  geosets: [
    { name: 'voiddeck', tint: CONCRETE_DARK, mesh: merge(
      box(-135, -115, -135, -115, 0, 64), box(115, 135, -135, -115, 0, 64),
      box(-135, -115, 115, 135, 0, 64), box(115, 135, 115, 135, 0, 64),
      box(-145, 145, -145, 145, 64, 92),
    ) },
    { name: 'body', tint: HDB_CREAM, mesh: box(-140, 140, -140, 140, 92, 580) },
    { name: 'corridor', tint: HDB_TRIM, mesh: windowBands(140, 140, 10, 92, 48) },
    // pastel accent (mint scheme): four corner columns + the parapet band
    { name: 'accent', tint: PASTEL_MINT, mesh: merge(
      box(-148, -130, -148, -130, 92, 580), box(130, 148, -148, -130, 92, 580),
      box(-148, -130, 130, 148, 92, 580), box(130, 148, 130, 148, 92, 580),
      box(-144, 144, -144, 144, 560, 580),
    ) },
    { name: 'stair', tint: CONCRETE, mesh: box(-60, 60, 120, 156, 92, 620) },
    { name: 'roof', tint: CONCRETE, mesh: box(-148, 148, -148, 148, 580, 604) },
    { name: 'tank', mesh: box(-40, 40, -60, 20, 604, 640) },
  ],
  outFile: path.join(OUT, 'HDBBlockB.mdx'),
});

// ------------------------------------------------------------ substation
buildModel({
  name: 'Substation',
  extents: { min: [-130, -130, 0], max: [130, 130, 190], radius: 280 },
  geosets: [
    { name: 'yard', tint: CONCRETE, mesh: box(-120, 120, -120, 120, 0, 12) },
    { name: 'fence', tint: FENCE_GREY, mesh: merge(
      box(-120, 120, -120, -112, 12, 70), box(-120, 120, 112, 120, 12, 70),
      box(-120, -112, -112, 112, 12, 70), box(112, 120, -40, 112, 12, 70),
      box(112, 120, -112, -60, 12, 70),   // gate gap on the east face
    ) },
    { name: 'transformer', tint: ROOF_GREY, mesh: merge(
      box(-70, 20, -60, 60, 12, 120),
      box(-90, -70, -30, 30, 12, 96),      // radiator fins block
    ) },
    { name: 'insulators', tint: WHITE_BODY, mesh: merge(
      box(-52, -40, -12, 0, 120, 168), box(-10, 2, -12, 0, 120, 168),
    ) },
    { name: 'livelamp', tint: AMBER, additive: true,
      mesh: box(40, 70, -16, 16, 90, 130) },
  ],
  outFile: path.join(OUT, 'Substation.mdx'),
});

// NOTE: the street-lamp model used to be generated here (Lamppost.mdx).
// The 2026-08-07 Sol ambience batch replaced it — n028 Street Lamp now uses
// war3mapImported\SolLampPost.mdx (richer additive lamp glow; provenance in
// ../imports-credits.json). The generator entry was removed WITH the file
// so this script keeps regenerating exactly what ships (assets doctrine).

// --------------------------------------------------------------- bus stop
buildModel({
  name: 'BusStop',
  extents: { min: [-150, -70, 0], max: [150, 70, 190], radius: 260 },
  geosets: [
    { name: 'kerb', tint: CONCRETE, mesh: box(-140, 140, -60, 60, 0, 10) },
    { name: 'posts', tint: FENCE_GREY, mesh: merge(
      box(-130, -118, -50, -38, 10, 160), box(118, 130, -50, -38, 10, 160),
      box(-130, -118, 38, 50, 10, 160), box(118, 130, 38, 50, 10, 160),
    ) },
    { name: 'bench', tint: TIMBER, mesh: box(-110, 110, 10, 44, 46, 58) },
    { name: 'roof', tint: MRT_RED, mesh: box(-146, 146, -66, 66, 160, 176) },
    { name: 'sign', tint: WHITE_BODY, mesh: box(126, 138, -58, -46, 160, 208) },
  ],
  outFile: path.join(OUT, 'BusStop.mdx'),
});

// ------------------------------------------------------------- barricade
buildModel({
  name: 'Barricade',
  extents: { min: [-110, -60, 0], max: [110, 60, 130], radius: 190 },
  geosets: [
    { name: 'frame', tint: TIMBER_DARK, mesh: merge(
      box(-100, -84, -20, 20, 0, 110), box(84, 100, -20, 20, 0, 110),
    ) },
    { name: 'planks', tint: TIMBER, mesh: merge(
      box(-104, 104, -14, -2, 30, 52),
      box(-104, 104, 2, 14, 62, 84),
      box(-104, 104, -8, 8, 94, 112),
    ) },
    { name: 'sandbags', tint: SANDBAG, mesh: merge(
      box(-108, -40, -52, -16, 0, 26), box(30, 106, 18, 54, 0, 26),
      box(-70, -10, 20, 52, 0, 24),
    ) },
  ],
  outFile: path.join(OUT, 'Barricade.mdx'),
});

// ================== 2026-08-07 visual-identity pass ======================
// CAMERA-SAFETY (README doctrine): the five Sky* towers are 500-800 tall
// and may ONLY stand along the NORTH map edge / far NE-NW corners as
// non-solid background silhouette (WC3's camera looks from the south — a
// tall model south of walkable space occludes play). MRTEntrance/MRTSign
// stay <= 175; LinkwayCanopy stays < 100.

// ------------------------------------------------- skyline: slab tower
buildModel({
  name: 'SkyTowerSlab',
  extents: { min: [-170, -75, 0], max: [170, 75, 620], radius: 660 },
  geosets: [
    { name: 'podium', tint: SKY_BODY_LT, mesh: box(-168, 168, -72, 72, 0, 48) },
    { name: 'body', tint: SKY_BODY, mesh: box(-150, 150, -60, 60, 48, 596) },
    { name: 'bands', tint: SKY_BAND, mesh: bandsY(150, 60, 48, 21, 26) },
    { name: 'crown', tint: SKY_BODY_LT, mesh: box(-154, 154, -64, 64, 596, 620) },
    { name: 'glints', tint: GLINT_WARM, additive: true,
      mesh: glintsY(150, 60, 48, 21, 26, 9, 41) },
  ],
  outFile: path.join(OUT, 'SkyTowerSlab.mdx'),
});

// ---------------------------------------------- skyline: stepped tower
buildModel({
  name: 'SkyTowerStep',
  extents: { min: [-160, -85, 0], max: [160, 85, 700], radius: 740 },
  geosets: [
    { name: 'tier1', tint: SKY_BODY, mesh: box(-155, 155, -80, 80, 0, 280) },
    { name: 'tier2', tint: SKY_BODY_LT, mesh: box(-115, 115, -66, 66, 280, 500) },
    { name: 'tier3', tint: SKY_BODY, mesh: box(-75, 75, -52, 52, 500, 676) },
    { name: 'bands', tint: SKY_BAND, mesh: merge(
      bandsY(155, 80, 0, 10, 28), bandsY(115, 66, 280, 7, 28), bandsY(75, 52, 500, 5, 32),
    ) },
    { name: 'crown', tint: SKY_BODY_LT, mesh: box(-79, 79, -56, 56, 676, 700) },
    { name: 'glints', tint: GLINT_COOL, additive: true, mesh: merge(
      glintsY(155, 80, 0, 10, 28, 8, 42),
      glintsY(115, 66, 280, 7, 28, 6, 43),
      glintsY(75, 52, 500, 5, 32, 4, 44),
    ) },
  ],
  outFile: path.join(OUT, 'SkyTowerStep.mdx'),
});

// -------------------- skyline: three-column tower with a rooftop deck
// (generic bayfront-hotel SUGGESTION — three slim columns carrying one
// overhanging deck slab; no real building's proportions or trade dress)
buildModel({
  name: 'SkyTowerCrown',
  extents: { min: [-210, -70, 0], max: [210, 70, 780], radius: 810 },
  geosets: [
    { name: 'columns', tint: SKY_BODY, mesh: merge(
      box(-190, -110, -55, 55, 0, 720),
      box(-40, 40, -55, 55, 0, 720),
      box(110, 190, -55, 55, 0, 720),
    ) },
    { name: 'bands', tint: SKY_BAND, mesh: merge(
      // per-column floor lines (24 floors x 3 columns)
      ...[[-190, -110], [-40, 40], [110, 190]].flatMap(([x0, x1]) =>
        [...Array(24)].map((_, f) =>
          box(x0 - 1.5, x1 + 1.5, -56.5, 56.5, (f + 1) * 30 - 3, (f + 1) * 30))),
    ) },
    { name: 'deck', tint: SKY_BODY_LT, mesh: merge(
      box(-208, 208, -62, 62, 720, 756),   // the deck overhangs both ends
      box(-208, -180, -62, 62, 756, 768),  // prow lip
      box(180, 208, -62, 62, 756, 768),
    ) },
    { name: 'glints', tint: GLINT_WARM, additive: true, mesh: merge(
      shiftX(glintsY(40, 55, 0, 24, 30, 2, 45, 0.18), -150),
      shiftX(glintsY(40, 55, 0, 24, 30, 2, 51, 0.18), 0),
      shiftX(glintsY(40, 55, 0, 24, 30, 2, 52, 0.18), 150),
      box(-204, 204, -58, 58, 752, 755),   // deck edge light line
    ) },
  ],
  outFile: path.join(OUT, 'SkyTowerCrown.mdx'),
});

// ------------------------------------------------- skyline: twin towers
buildModel({
  name: 'SkyTowerTwin',
  extents: { min: [-190, -70, 0], max: [190, 70, 560], radius: 600 },
  geosets: [
    { name: 'podium', tint: SKY_BODY_LT, mesh: box(-185, 185, -66, 66, 0, 64) },
    { name: 'towers', tint: SKY_BODY, mesh: merge(
      box(-170, -50, -55, 55, 64, 536),
      box(50, 170, -55, 55, 64, 536),
    ) },
    { name: 'bands', tint: SKY_BAND, mesh: merge(
      ...[...Array(16)].map((_, f) => merge(
        box(-172, -48, -56.5, 56.5, 64 + (f + 1) * 28 - 3, 64 + (f + 1) * 28),
        box(48, 172, -56.5, 56.5, 64 + (f + 1) * 28 - 3, 64 + (f + 1) * 28),
      )),
    ) },
    { name: 'bridge', tint: SKY_BODY_LT, mesh: box(-54, 54, -40, 40, 380, 410) },
    { name: 'glints', tint: GLINT_COOL, additive: true, mesh: merge(
      shiftX(glintsY(60, 55, 64, 16, 28, 3, 46, 0.2), -110),
      shiftX(glintsY(60, 55, 64, 16, 28, 3, 49, 0.2), 110),
    ) },
  ],
  outFile: path.join(OUT, 'SkyTowerTwin.mdx'),
});

// ------------------------------------------------- skyline: spire tower
buildModel({
  name: 'SkyTowerSpire',
  extents: { min: [-110, -110, 0], max: [110, 110, 790], radius: 810 },
  geosets: [
    { name: 'base', tint: SKY_BODY, mesh: box(-105, 105, -105, 105, 0, 340) },
    { name: 'mid', tint: SKY_BODY_LT, mesh: box(-78, 78, -78, 78, 340, 560) },
    { name: 'top', tint: SKY_BODY, mesh: box(-50, 50, -50, 50, 560, 700) },
    { name: 'bands', tint: SKY_BAND, mesh: merge(
      bandsY(105, 105, 0, 12, 28), bandsY(78, 78, 340, 7, 30), bandsY(50, 50, 560, 4, 32),
    ) },
    { name: 'spire', tint: SKY_BODY_LT, mesh: merge(
      box(-12, 12, -12, 12, 700, 774),
      box(-4, 4, -4, 4, 774, 790),
    ) },
    { name: 'glints', tint: GLINT_WARM, additive: true, mesh: merge(
      glintsY(105, 105, 0, 12, 28, 6, 47, 0.22),
      glintsY(78, 78, 340, 7, 30, 4, 48, 0.22),
      box(-6, 6, -6, 6, 782, 790),         // beacon
    ) },
  ],
  outFile: path.join(OUT, 'SkyTowerSpire.mdx'),
});

// ------------------------------------------- MRT identity: entrance portal
buildModel({
  name: 'MRTEntrance',
  extents: { min: [-120, -115, 0], max: [120, 115, 172], radius: 240 },
  geosets: [
    // open pavilion: you must be able to SEE THROUGH under the glass —
    // low balustrades + slim corner posts, never solid walls (render-pass
    // fix: the first draft read as a closed box)
    { name: 'balustrade', tint: CONCRETE, mesh: merge(
      box(-104, -88, -92, 92, 0, 38),
      box(88, 104, -92, 92, 0, 38),
    ) },
    { name: 'posts', tint: WHITE_BODY, mesh: merge(
      box(-102, -90, -104, -92, 0, 104), box(90, 102, -104, -92, 0, 104),
      box(-102, -90, 92, 104, 0, 104), box(90, 102, 92, 104, 0, 104),
    ) },
    { name: 'void', tint: WINDOW_DARK, mesh: merge(
      box(-88, 88, -92, 92, 0, 5),          // the stair void, read flat-dark
      box(-88, 88, 60, 92, 5, 26),          // descending-step suggestion
      box(-88, 88, 78, 92, 26, 46),
    ) },
    { name: 'glass', tint: GLASS_TEAL, mesh:
      vault(-108, 108, -112, 112, 104, 58, 7) },
    { name: 'ribs', tint: WHITE_BODY, mesh: merge(
      box(-112, -104, -112, 112, 98, 106),
      box(104, 112, -112, 112, 98, 106),
    ) },
    { name: 'glow', tint: AMBER, additive: true, mesh: merge(
      box(-70, 70, -111, -107, 104, 118),   // canopy lip light, road side
      box(-70, 70, 107, 111, 104, 118),
    ) },
  ],
  outFile: path.join(OUT, 'MRTEntrance.mdx'),
});

// --------------------------------------------- MRT identity: sign totem
buildModel({
  name: 'MRTSign',
  extents: { min: [-46, -20, 0], max: [46, 20, 172], radius: 185 },
  geosets: [
    { name: 'pylon', tint: WHITE_BODY, mesh: merge(
      box(-9, 9, -9, 9, 0, 118),
      box(-13, 13, -13, 13, 0, 14),        // foot
    ) },
    { name: 'disc', tint: MRT_RED, mesh: discY(0, 134, 36, -7, 7, 14) },
    { name: 'bar', tint: WHITE_BODY, mesh: box(-44, 44, -8.5, 8.5, 127, 141) },
    { name: 'glow', tint: AMBER, additive: true,
      mesh: discY(0, 134, 30, -8.2, 8.2, 14) },
  ],
  outFile: path.join(OUT, 'MRTSign.mdx'),
});

// ------------------------------------- estate character: laundry rack
// Flush-mounts against an HDB block's SOUTH face (angle 270 at placement:
// local +x points south, local y spans east-west). Poles run parallel to
// the facade with cloth hanging — the mid-level laundry line.
buildModel({
  name: 'LaundryRack',
  extents: { min: [-4, -74, 0], max: [48, 74, 232], radius: 250 },
  geosets: [
    { name: 'mount', tint: CONCRETE_DARK, mesh: merge(
      box(-2, 4, -70, 70, 148, 228),        // backboard sliver on the facade
      box(0, 40, -64, -58, 206, 212),       // bracket arms
      box(0, 40, 58, 64, 206, 212),
    ) },
    { name: 'poles', tint: POLE_BAMBOO, mesh: merge(
      box(14, 19, -68, 68, 210, 215),
      box(26, 31, -68, 68, 204, 209),
      box(38, 43, -68, 68, 198, 203),
    ) },
    { name: 'clothA', tint: CLOTH_WHITE, mesh: merge(
      box(13, 20, -62, -40, 176, 210), box(25, 32, -18, 6, 170, 204),
      box(37, 44, 30, 52, 166, 198),
    ) },
    { name: 'clothB', tint: CLOTH_BLUE, mesh: merge(
      box(13, 20, -30, -10, 180, 210), box(37, 44, -54, -34, 168, 198),
    ) },
    { name: 'clothC', tint: CLOTH_CORAL, mesh: merge(
      box(25, 32, 22, 44, 174, 204), box(13, 20, 44, 64, 182, 210),
    ) },
  ],
  outFile: path.join(OUT, 'LaundryRack.mdx'),
});

// ---------------------------------- estate character: linkway canopy
// One covered-walkway segment; runs are chained along the roads. < 100
// tall by doctrine so it never occludes a unit from the game camera.
buildModel({
  name: 'LinkwayCanopy',
  extents: { min: [-135, -40, 0], max: [135, 40, 96], radius: 160 },
  geosets: [
    { name: 'posts', tint: FENCE_GREY, mesh: merge(
      box(-124, -116, -30, -22, 0, 84), box(116, 124, -30, -22, 0, 84),
      box(-124, -116, 22, 30, 0, 84), box(116, 124, 22, 30, 0, 84),
    ) },
    { name: 'roof', tint: LINK_ROOF, mesh: merge(
      box(-132, 132, -36, 36, 84, 94),
      box(-132, 132, -38, -34, 80, 86),     // drip edges
      box(-132, 132, 34, 38, 80, 86),
    ) },
  ],
  outFile: path.join(OUT, 'LinkwayCanopy.mdx'),
});

console.log('last-train models regenerated: MRTTrain, StationPlatform, TrackSegment, HDBBlockA, HDBBlockB, Substation, BusStop, Barricade, SkyTowerSlab, SkyTowerStep, SkyTowerCrown, SkyTowerTwin, SkyTowerSpire, MRTEntrance, MRTSign, LaundryRack, LinkwayCanopy');
