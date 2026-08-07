// Playwright driver: for each staged MDX, compute framing bounds in node (war3-model),
// then render via the in-page mdx-m3-viewer rig (server.mjs must be running) and save a PNG.
//
// Usage: node scripts/experimental/render-rig/shoot.mjs [group ...]
//   no args = every subdirectory of <work>/stage/ except tex/ (see stage-fleet.mjs)
// Env: RENDER_RIG_PLAYWRIGHT (playwright package dir), RENDER_RIG_CHROMIUM (browser binary)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { REPO, STAGE, OUT, PORT } from './env.mjs';

const requireRepo = createRequire(path.join(REPO, 'package.json'));
const { parseMDX } = requireRepo('war3-model');

// playwright is NOT a repo dependency — resolve from env, the repo, or the
// environment-global install, in that order.
function loadPlaywright() {
  const candidates = [
    process.env.RENDER_RIG_PLAYWRIGHT && path.join(process.env.RENDER_RIG_PLAYWRIGHT, 'package.json'),
    path.join(REPO, 'package.json'),
    '/opt/node22/lib/node_modules/playwright/package.json',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return createRequire(c)('playwright'); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found: npm i -g playwright (or set RENDER_RIG_PLAYWRIGHT)');
}
const { chromium } = loadPlaywright();
const CHROMIUM = process.env.RENDER_RIG_CHROMIUM || '/opt/pw-browsers/chromium';

const OUT_MODELS = path.join(OUT, 'models');
fs.mkdirSync(OUT_MODELS, { recursive: true });

function bounds(file) {
  const buf = fs.readFileSync(file);
  const m = parseMDX(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], n = 0;
  for (const g of m.Geosets || []) {
    const v = g.Vertices;
    for (let i = 0; i < v.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (v[i + k] < min[k]) min[k] = v[i + k];
        if (v[i + k] > max[k]) max[k] = v[i + k];
      }
      n++;
    }
  }
  if (!n) {
    // fall back to model-declared extents
    const e = m.Info || {};
    if (e.MinimumExtent) { min = e.MinimumExtent; max = e.MaximumExtent; }
    else { min = [-64, -64, 0]; max = [64, 64, 128]; }
  }
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
  const r = Math.max(
    Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, 1);
  return { cx, cy, cz, r, nVerts: n };
}

const allGroups = fs.readdirSync(STAGE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'tex').map((d) => d.name);
const groups = process.argv.slice(2).length ? process.argv.slice(2) : allGroups;
const jobs = [];
for (const g of groups) {
  for (const f of fs.readdirSync(path.join(STAGE, g)).filter((f) => f.endsWith('.mdx')).sort()) {
    jobs.push({ group: g, file: f });
  }
}
if (!jobs.length) {
  console.error(`nothing staged under ${STAGE} — run stage-fleet.mjs first`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 820, height: 820 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(`http://127.0.0.1:${PORT}/page.html`);
await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });

const report = [];
for (const j of jobs) {
  const modelPath = path.join(STAGE, j.group, j.file);
  const cam = bounds(modelPath);
  const url = `/models/${j.group}/${j.file}`;
  try {
    const res = await page.evaluate(
      ({ url, cam }) => window.renderModel(url, cam),
      { url, cam });
    if (res && res.ok && res.dataURL) {
      const b64 = res.dataURL.split(',')[1];
      const outFile = path.join(OUT_MODELS, `${j.group}__${j.file.replace(/\.mdx$/, '')}.png`);
      fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
      report.push({ ...j, ok: true, errors: res.errors, r: cam.r, nVerts: cam.nVerts });
      console.log('OK ', j.group, j.file, res.errors.length ? 'errs:' + res.errors.length : '');
    } else {
      report.push({ ...j, ok: false, errors: (res && res.errors) || ['no result'] });
      console.log('FAIL', j.group, j.file, JSON.stringify((res && res.errors) || []));
    }
  } catch (e) {
    report.push({ ...j, ok: false, errors: [String(e)] });
    console.log('THROW', j.group, j.file, String(e).slice(0, 200));
  }
}
fs.writeFileSync(path.join(OUT, 'shoot-report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('done', report.filter((r) => r.ok).length, '/', report.length);
