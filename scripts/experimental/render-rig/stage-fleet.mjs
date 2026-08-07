// Stage the whole bundled-map fleet for the render rig:
//   maps/<name>/imports/**/*.mdx      -> <work>/stage/<name>/<basename>.mdx
//   maps/<name>/imports/**/*.blp|tga  -> <work>/stage/tex/<basename>   (real-texture pool)
// The server resolves textures case-insensitively by basename, matching how the
// models' TEXS chunks reference them (some at archive root — see last-train README).
//
// Usage: node scripts/experimental/render-rig/stage-fleet.mjs [map-name ...]
import fs from 'fs';
import path from 'path';
import { REPO, STAGE } from './env.mjs';

const mapsDir = path.join(REPO, 'maps');
const wanted = process.argv.slice(2);
const maps = (wanted.length ? wanted : fs.readdirSync(mapsDir))
  .filter((m) => fs.existsSync(path.join(mapsDir, m, 'imports')));

const texDir = path.join(STAGE, 'tex');
fs.mkdirSync(texDir, { recursive: true });

let nModels = 0, nTex = 0;
for (const m of maps) {
  const importsDir = path.join(mapsDir, m, 'imports');
  const groupDir = path.join(STAGE, m);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (ext === '.mdx') {
        fs.mkdirSync(groupDir, { recursive: true });
        fs.copyFileSync(p, path.join(groupDir, e.name));
        nModels++;
      } else if (ext === '.blp' || ext === '.tga') {
        fs.copyFileSync(p, path.join(texDir, e.name));
        nTex++;
      }
    }
  };
  walk(importsDir);
}
console.log(`staged ${nModels} models from ${maps.length} map(s), ${nTex} textures -> ${STAGE}`);
