#!/usr/bin/env node
// generate-icons.mjs — Last Train from Yio Chu Kang's generated command-
// button icons, authored with lib/icon.js (docs/ASSETS.md "Generated
// icons"). Deterministic output; the beveled border frame is baked as the
// LAST pass and every BTN gets its auto-derived DISBTN twin. Stock BTNs
// cover the concepts the game already depicts (BTNZombie, BTNGhoul,
// BTNVillagerMan..., all verified in lib/data/stock-art.json); these are
// the map's abstractions no stock button shows.
//
//   node maps/last-train/assets/generate-icons.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createCanvas, fill, gradient, rect, disc, stroke, noise, borderFrame, writeIconImports,
} = require('../../../lib/icon.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = path.join(HERE, '..');

let seed = 4001;
function paint(name, fn) {
  const c = createCanvas(64);
  fn(c);
  noise(c, 0.07, seed++);
  borderFrame(c); // ALWAYS last
  const r = writeIconImports(MAP, name, c.data);
  for (const w of r.warnings) console.warn('WARN:', w);
  return r.format;
}

let fmt = 'blp';

// ---- materials --------------------------------------------------------
fmt = paint('Pipe', (c) => {
  gradient(c, [46, 48, 54], [22, 24, 28]);
  stroke(c, 10, 44, 50, 16, 7, [150, 155, 165]);   // the pipe run
  stroke(c, 10, 44, 50, 16, 3, [210, 214, 222]);   // highlight
  rect(c, 44, 10, 56, 22, [120, 124, 134]);        // elbow joint
  disc(c, 13, 45, 6, [95, 99, 108]);               // threaded end
});
paint('Wire', (c) => {
  gradient(c, [40, 34, 30], [18, 16, 14]);
  stroke(c, 8, 40, 26, 18, 4, [190, 110, 40]);     // copper coil loops
  stroke(c, 20, 46, 40, 16, 4, [205, 125, 50]);
  stroke(c, 32, 50, 54, 22, 4, [175, 100, 35]);
  disc(c, 52, 46, 6, [60, 58, 54]);                // insulation spool
  disc(c, 52, 46, 3, [220, 140, 60]);
});
paint('Kerosene', (c) => {
  gradient(c, [52, 40, 26], [20, 15, 10]);
  rect(c, 18, 16, 46, 54, [140, 40, 30]);          // the red jerry can
  rect(c, 18, 16, 46, 24, [110, 30, 24]);
  rect(c, 40, 8, 50, 18, [90, 26, 20]);            // spout
  stroke(c, 24, 30, 40, 30, 2, [230, 200, 150]);   // K stencil bar
  stroke(c, 24, 30, 24, 44, 2, [230, 200, 150]);
  stroke(c, 40, 44, 24, 37, 2, [230, 200, 150]);
});

// ---- crafted gear -----------------------------------------------------
paint('WetBandage', (c) => {
  gradient(c, [30, 44, 52], [14, 20, 26]);
  rect(c, 12, 24, 52, 44, [225, 222, 210]);        // bandage roll band
  rect(c, 12, 24, 52, 30, [200, 197, 186]);
  disc(c, 46, 34, 9, [235, 232, 222]);             // the roll
  disc(c, 46, 34, 4, [150, 148, 140]);
  disc(c, 20, 18, 4, [90, 170, 220], 0.9);         // water drops
  disc(c, 28, 14, 3, [110, 185, 230], 0.9);
});
paint('MobilePhone', (c) => {
  gradient(c, [24, 28, 40], [10, 12, 18]);
  rect(c, 22, 8, 42, 56, [30, 32, 38]);            // handset shell
  rect(c, 25, 12, 39, 44, [70, 200, 160]);         // glowing screen
  rect(c, 25, 12, 39, 20, [50, 160, 130]);
  disc(c, 32, 50, 3, [90, 94, 100]);               // home key
  stroke(c, 46, 14, 54, 6, 2, [120, 220, 180]);    // signal arcs
  stroke(c, 48, 20, 58, 10, 2, [90, 190, 150]);
});
paint('BarricadeKit', (c) => {
  gradient(c, [40, 32, 22], [18, 14, 10]);
  stroke(c, 8, 18, 56, 46, 8, [150, 110, 60]);     // crossed planks
  stroke(c, 8, 46, 56, 18, 8, [130, 95, 50]);
  disc(c, 32, 32, 3, [70, 55, 35]);                // bolt
  rect(c, 10, 52, 54, 58, [90, 80, 62]);           // base rail
});
paint('Molotov', (c) => {
  gradient(c, [40, 22, 14], [16, 8, 6]);
  rect(c, 26, 26, 40, 54, [60, 110, 70], 0.95);    // green bottle
  rect(c, 29, 20, 37, 28, [50, 90, 60]);           // neck
  rect(c, 30, 12, 36, 22, [220, 214, 196]);        // rag wick
  disc(c, 33, 8, 6, [255, 170, 40]);               // flame
  disc(c, 33, 7, 3, [255, 230, 120]);
  rect(c, 27, 40, 39, 52, [90, 60, 30], 0.7);      // fuel line
});
paint('SentryKit', (c) => {
  gradient(c, [30, 34, 30], [12, 14, 12]);
  rect(c, 14, 44, 50, 52, [70, 74, 70]);           // tripod base
  stroke(c, 22, 46, 32, 30, 4, [110, 114, 110]);   // legs
  stroke(c, 42, 46, 32, 30, 4, [110, 114, 110]);
  rect(c, 22, 22, 42, 34, [90, 96, 92]);           // receiver
  stroke(c, 40, 26, 58, 26, 4, [140, 146, 140]);   // barrel
  disc(c, 26, 27, 3, [255, 90, 60]);               // sensor eye
});
paint('Kopi', (c) => {
  gradient(c, [52, 40, 28], [24, 18, 12]);
  disc(c, 30, 36, 15, [230, 226, 214]);            // kopitiam cup
  disc(c, 30, 36, 11, [96, 60, 30]);               // the kopi
  disc(c, 30, 36, 11, [120, 78, 40], 0.5);
  stroke(c, 45, 30, 52, 38, 3, [230, 226, 214]);   // handle
  stroke(c, 24, 16, 28, 24, 2, [200, 200, 200], 0.6); // steam
  stroke(c, 34, 14, 36, 22, 2, [200, 200, 200], 0.6);
  rect(c, 12, 52, 52, 56, [160, 120, 70]);         // saucer
});
paint('GenPart', (c) => {
  gradient(c, [26, 30, 38], [12, 14, 18]);
  disc(c, 32, 32, 16, [130, 136, 146]);            // rotor disc
  disc(c, 32, 32, 6, [70, 74, 82]);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    disc(c, 32 + Math.cos(a) * 11, 32 + Math.sin(a) * 11, 3, [60, 63, 70]);
  }
  stroke(c, 46, 18, 58, 6, 4, [200, 170, 60]);     // winding tail
});
paint('Blowtorch', (c) => {
  gradient(c, [30, 26, 34], [12, 10, 14]);
  rect(c, 16, 28, 34, 56, [60, 90, 150]);          // gas cylinder
  rect(c, 16, 28, 34, 34, [45, 70, 120]);
  rect(c, 30, 18, 40, 30, [110, 114, 122]);        // valve head
  stroke(c, 40, 22, 52, 22, 4, [130, 134, 142]);   // nozzle
  disc(c, 56, 22, 5, [120, 190, 255]);             // blue jet
  disc(c, 54, 22, 2, [230, 245, 255]);
});

// ---- units/classes ----------------------------------------------------
paint('APO', (c) => {
  gradient(c, [22, 28, 44], [10, 12, 20]);
  disc(c, 32, 22, 10, [222, 190, 160]);            // face
  rect(c, 20, 10, 44, 18, [30, 45, 90]);           // peaked cap
  rect(c, 18, 30, 46, 54, [35, 52, 100]);          // uniform
  rect(c, 18, 30, 46, 36, [50, 70, 130]);
  disc(c, 32, 40, 3, [230, 210, 90]);              // badge
  stroke(c, 18, 44, 46, 44, 2, [220, 220, 225]);   // reflective band
});
paint('Paramedic', (c) => {
  gradient(c, [28, 40, 36], [12, 18, 16]);
  disc(c, 32, 22, 10, [225, 195, 165]);            // face
  rect(c, 18, 30, 46, 54, [235, 235, 238]);        // whites
  rect(c, 26, 8, 38, 16, [235, 235, 238]);         // cap
  rect(c, 30, 9, 34, 15, [200, 40, 40]);           // cap cross
  rect(c, 28, 36, 36, 50, [200, 40, 40]);          // chest cross
  rect(c, 24, 40, 40, 46, [200, 40, 40]);
});
paint('Technician', (c) => {
  gradient(c, [40, 34, 20], [18, 15, 9]);
  disc(c, 32, 24, 10, [215, 185, 155]);            // face
  rect(c, 20, 10, 44, 20, [235, 200, 40]);         // hard hat
  rect(c, 24, 6, 40, 12, [235, 200, 40]);
  rect(c, 18, 32, 46, 54, [200, 120, 40]);         // TC vest
  stroke(c, 24, 32, 24, 54, 3, [230, 230, 230]);   // hi-vis stripes
  stroke(c, 40, 32, 40, 54, 3, [230, 230, 230]);
});
paint('RiotWalker', (c) => {
  gradient(c, [22, 26, 34], [8, 10, 14]);
  disc(c, 32, 20, 10, [130, 150, 120]);            // greyed face
  rect(c, 20, 8, 44, 16, [26, 38, 74]);            // police cap
  disc(c, 28, 20, 2, [220, 60, 40]);               // dead eyes
  disc(c, 37, 20, 2, [220, 60, 40]);
  rect(c, 16, 30, 48, 54, [30, 44, 84]);           // torn uniform
  stroke(c, 20, 34, 44, 50, 3, [90, 110, 80]);     // gash
  rect(c, 16, 46, 48, 50, [180, 180, 186], 0.6);   // scuffed band
});
paint('Revenant', (c) => {
  gradient(c, [26, 20, 30], [10, 8, 12]);
  disc(c, 32, 24, 11, [140, 150, 130]);            // risen face
  disc(c, 28, 22, 2, [255, 200, 60]);              // burning eyes
  disc(c, 37, 22, 2, [255, 200, 60]);
  rect(c, 18, 34, 46, 54, [60, 55, 70]);           // burial clothes
  stroke(c, 22, 34, 30, 54, 2, [40, 36, 46]);
  stroke(c, 40, 34, 34, 54, 2, [40, 36, 46]);
  stroke(c, 12, 56, 52, 48, 3, [80, 90, 70], 0.8); // clawing up
});

// ---- structures -------------------------------------------------------
paint('HDB', (c) => {
  gradient(c, [50, 60, 70], [20, 24, 30]);
  rect(c, 14, 10, 50, 54, [205, 196, 175]);        // the slab block
  for (let f = 0; f < 5; f++) {
    rect(c, 16, 14 + f * 8, 48, 17 + f * 8, [110, 130, 120]);
  }
  rect(c, 14, 50, 50, 54, [90, 92, 96]);           // void deck shadow
  rect(c, 22, 4, 34, 10, [150, 60, 50]);           // roof tank
});
paint('Station', (c) => {
  gradient(c, [30, 36, 44], [12, 15, 18]);
  rect(c, 8, 36, 56, 42, [160, 158, 150]);         // platform slab
  rect(c, 8, 33, 56, 36, [230, 195, 40]);          // yellow line
  rect(c, 12, 14, 52, 20, [90, 92, 98]);           // canopy
  stroke(c, 18, 20, 18, 36, 3, [120, 122, 128]);   // columns
  stroke(c, 46, 20, 46, 36, 3, [120, 122, 128]);
  rect(c, 24, 22, 40, 30, [190, 40, 40]);          // line sign
  rect(c, 8, 48, 56, 52, [40, 42, 48]);            // track bed
});
paint('Train', (c) => {
  gradient(c, [24, 30, 38], [10, 12, 16]);
  rect(c, 8, 24, 56, 46, [225, 225, 230]);         // car body
  rect(c, 8, 24, 56, 30, [200, 200, 206]);
  rect(c, 12, 30, 52, 38, [30, 36, 48]);           // window strip
  rect(c, 8, 42, 56, 46, [190, 40, 40]);           // red waist band
  disc(c, 18, 50, 4, [60, 62, 68]);                // wheels
  disc(c, 46, 50, 4, [60, 62, 68]);
  disc(c, 56, 34, 3, [255, 200, 90]);              // headlight
});
paint('Substation', (c) => {
  gradient(c, [30, 34, 28], [12, 14, 11]);
  rect(c, 14, 26, 44, 52, [95, 100, 105]);         // transformer box
  rect(c, 14, 26, 44, 32, [75, 80, 86]);
  stroke(c, 20, 26, 20, 14, 3, [210, 210, 214]);   // insulators
  stroke(c, 34, 26, 34, 14, 3, [210, 210, 214]);
  stroke(c, 20, 14, 50, 8, 2, [180, 180, 120]);    // feeder line
  rect(c, 48, 34, 56, 52, [70, 74, 78]);           // fence post
  disc(c, 50, 22, 5, [255, 190, 60]);              // live lamp
  stroke(c, 46, 40, 54, 40, 2, [255, 190, 60]);
});
paint('Lair', (c) => {
  gradient(c, [30, 26, 18], [12, 10, 8]);
  disc(c, 32, 40, 20, [70, 55, 35]);               // the kampong mound
  disc(c, 32, 40, 14, [50, 38, 24]);
  disc(c, 32, 42, 8, [25, 18, 14]);                // nest mouth
  disc(c, 24, 30, 3, [180, 60, 120]);              // egg glints
  disc(c, 40, 32, 3, [200, 70, 130]);
  disc(c, 33, 26, 2, [170, 55, 110]);
  stroke(c, 10, 52, 24, 44, 3, [90, 70, 45]);      // attap timbers
  stroke(c, 54, 52, 42, 44, 3, [90, 70, 45]);
});

console.log(`last-train icons regenerated (21 BTN + DISBTN twins, format ${fmt})`);
