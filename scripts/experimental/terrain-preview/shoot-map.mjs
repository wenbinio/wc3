// shoot-map.mjs — playwright driver for the tier-2 oblique map renders.
// map-server.mjs must be running. Usage: node shoot-map.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.WC3_REPO || '/home/user/wc3';
const PORT = +(process.env.MAP_RIG_PORT || 8932);
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const candidates = [
    process.env.RENDER_RIG_PLAYWRIGHT && path.join(process.env.RENDER_RIG_PLAYWRIGHT, 'package.json'),
    path.join(REPO, 'package.json'),
    '/opt/node22/lib/node_modules/playwright/package.json',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return createRequire(c)('playwright'); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found');
}
const { chromium } = loadPlaywright();
const CHROMIUM = process.env.RENDER_RIG_CHROMIUM || '/opt/pw-browsers/chromium';

// world-frame helpers from terrain.json of the SOURCE (same content as the w3x)
function frame(terrainFile) {
  const t = JSON.parse(fs.readFileSync(terrainFile, 'utf8'));
  const w = t.map.width * 128, h = t.map.height * 128;
  const x0 = t.map.offset.x, y0 = t.map.offset.y;
  return { cx: x0 + w / 2, cy: y0 + h / 2, w, h, x0, y0 };
}
const deg = (d) => (d * Math.PI) / 180;
// oblique view: azimuth = direction the camera sits at (deg, 0=east, 90=north),
// elevation above the ground plane, dist in world units
function view(f, azDeg, elDeg, dist, target) {
  const az = deg(azDeg), el = deg(elDeg);
  const tgt = target || [f.cx, f.cy, 0];
  return {
    eye: [tgt[0] + dist * Math.cos(el) * Math.cos(az),
          tgt[1] + dist * Math.cos(el) * Math.sin(az),
          tgt[2] + dist * Math.sin(el)],
    target: tgt,
    fov: Math.PI / 4,
    near: 64,
    far: dist * 6,
  };
}

const lastTrain = frame(path.join(HERE, 'snap/last-train/terrain.json'));
const coinstead = frame(path.join(REPO, 'maps/coinstead/terrain.json'));

// last-train landmarks (committed regions.json): Platform on the east edge
const ltRegions = JSON.parse(fs.readFileSync(path.join(HERE, 'snap/last-train/regions.json'), 'utf8'));
const platform = ltRegions.find((r) => /platform/i.test(r.name || ''));
const pC = platform
  ? [(platform.position.left + platform.position.right) / 2, (platform.position.bottom + platform.position.top) / 2, 0]
  : [lastTrain.cx + lastTrain.w / 2 - 800, lastTrain.cy, 0];

const jobs = [
  { map: 'last-train.w3x', name: 'oblique-last-train-south',
    cam: view(lastTrain, 270, 38, lastTrain.w * 1.15) }, // from the south, wide estate shot
  { map: 'last-train.w3x', name: 'oblique-last-train-station',
    cam: view(lastTrain, 225, 30, 4200, pC) },           // station area from the southwest
  { map: 'last-train.w3x', name: 'oblique-last-train-wide',
    cam: view(lastTrain, 300, 55, lastTrain.w * 1.5) },  // high wide shot
  { map: 'coinstead.w3x', name: 'oblique-coinstead-south',
    cam: view(coinstead, 270, 40, coinstead.w * 1.2) },
];
if (fs.existsSync(path.join(HERE, 'stage-maps/tidewatch-arena.w3x'))) {
  const tw = frame(path.join(REPO, 'maps/tidewatch-arena/terrain.json'));
  jobs.push({ map: 'tidewatch-arena.w3x', name: 'oblique-tidewatch-southwest',
    cam: view(tw, 225, 35, tw.w * 1.25) }); // cliffs + water proof case
}

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1420, height: 970 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 160)); });
await page.goto(`http://127.0.0.1:${PORT}/map-page.html`);
await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });
const fatal = await page.evaluate('window.__fatal');
if (fatal) { console.log('FATAL viewer construction:', fatal); process.exit(1); }

const report = [];
let currentMap = null;
for (const j of jobs) {
  try {
    if (currentMap !== j.map) {
      const load = await page.evaluate((url) => window.loadMapOnce(url), `/maps/${j.map}`);
      console.log('LOAD', j.map, JSON.stringify(load).slice(0, 600));
      report.push({ load: j.map, ...load, dataURL: undefined });
      if (!load.ok) { report.push({ ...j, ok: false, errors: ['map load failed'] }); continue; }
      currentMap = j.map;
    }
    const res = await page.evaluate((cam) => window.shootView(cam), j.cam);
    if (res && res.ok && res.dataURL) {
      const file = path.join(OUT, `${j.name}.png`);
      fs.writeFileSync(file, Buffer.from(res.dataURL.split(',')[1], 'base64'));
      console.log('OK ', j.name, res.errors.length ? `errs:${res.errors.length}` : '');
      report.push({ name: j.name, ok: true, errors: res.errors });
    } else {
      console.log('FAIL', j.name, JSON.stringify((res && res.errors) || []).slice(0, 300));
      report.push({ name: j.name, ok: false, errors: (res && res.errors) || ['no result'] });
    }
  } catch (e) {
    console.log('THROW', j.name, String(e).slice(0, 300));
    report.push({ name: j.name, ok: false, errors: [String(e)] });
  }
}
fs.writeFileSync(path.join(OUT, 'shoot-map-report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('done');
