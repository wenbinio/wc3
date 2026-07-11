// mdl-lib.mjs — shared MDL-authoring helper for the Northreach model
// generators (generate-longship.mjs / generate-banner.mjs / generate-cairn.mjs).
//
// Authors a classic (FormatVersion 800) model as MDL text, converts it to
// binary MDX with war3-model (parseMDL + generateMDX), and verifies it with
// mdx-m3-viewer's sanityTest — the exact bar validate-map enforces on every
// packed .mdx (0 errors AND 0 severe issues; a malformed custom MDX
// hard-crashes the game at map load, CLAUDE.md gotcha 14). Covered here:
//   - every geoset gets its own GeosetAnim (alpha death-fade + optional
//     static Color tint) and its own Bone with an explicit GeosetAnimId
//     (war3-model defaults an UNSPECIFIED GeosetAnimId to 0 — invalid when
//     no GeosetAnim chunk exists);
//   - a NonLooping "Death" sequence in addition to "Stand";
//   - an "Origin Ref" attachment point;
//   - model/sequence/geoset extents everywhere (per-sequence Anim blocks).
//
// Color note: war3-model's MDL dialect takes `static Color { R, G, B }` and
// generateMDX emits the floats reversed, which lands them in the MDX file in
// the B,G,R order the game expects — so tints below are plain RGB.
//
// All layers are Unshaded + TwoSided so normals/winding never matter; the
// single texture is ReplaceableId 1 (player team color) — nothing
// Blizzard-authored is embedded (docs/ASSETS.md legal rules).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { parseMDL, generateMDX, parseMDX } = require('war3-model');

const STAND = [0, 1000];
const DEATH = [1100, 2000];

// --- geometry helpers -------------------------------------------------------

// Axis-aligned box: returns { verts, faces } (12 triangles).
export function box(x0, x1, y0, y1, z0, z1) {
  const verts = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // -y
    [3, 2, 6], [3, 6, 7], // +y
    [0, 3, 7], [0, 7, 4], // -x
    [1, 2, 6], [1, 6, 5], // +x
  ];
  return { verts, faces };
}

// Free-standing quad (two triangles) from 4 corner points.
export function quad(a, b, c, d) {
  return { verts: [a, b, c, d], faces: [[0, 1, 2], [0, 2, 3]] };
}

// Merge several { verts, faces } pieces into one mesh.
export function merge(...pieces) {
  const verts = [];
  const faces = [];
  for (const p of pieces) {
    const base = verts.length;
    verts.push(...p.verts);
    faces.push(...p.faces.map((f) => f.map((i) => i + base)));
  }
  return { verts, faces };
}

// --- MDL emission ------------------------------------------------------------

const fmtRows = (rows) => rows.map((r) => `\t\t{ ${r.join(', ')} },`).join('\n');

function extentBlock(ext, indent) {
  const t = '\t'.repeat(indent);
  return `${t}MinimumExtent { ${ext.min.join(', ')} },\n` +
    `${t}MaximumExtent { ${ext.max.join(', ')} },\n` +
    `${t}BoundsRadius ${ext.radius},`;
}

function geosetMDL(g, geosetIndex, boneObjectId, materialId, ext) {
  const { verts, faces } = g.mesh;
  // outward-ish normals from the mesh centroid (irrelevant under Unshaded,
  // but the chunk must be present and well-formed)
  const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
  const cz = verts.reduce((s, v) => s + v[2], 0) / verts.length;
  const normals = verts.map(([x, y, z]) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    return [dx / len, dy / len, dz / len].map((v) => +v.toFixed(4));
  });
  const tverts = verts.map(([x, y]) => [
    +(0.05 + 0.9 * (Math.abs(x % 64) / 64)).toFixed(3),
    +(0.05 + 0.9 * (Math.abs(y % 64) / 64)).toFixed(3),
  ]);
  return `Geoset {
\tVertices ${verts.length} {
${fmtRows(verts)}
\t}
\tNormals ${normals.length} {
${fmtRows(normals)}
\t}
\tTVertices ${tverts.length} {
${fmtRows(tverts)}
\t}
\tVertexGroup {
${verts.map(() => '\t\t0,').join('\n')}
\t}
\tFaces 1 ${faces.length * 3} {
\t\tTriangles {
\t\t\t{ ${faces.flat().join(', ')} },
\t\t}
\t}
\tGroups 1 1 {
\t\tMatrices { ${boneObjectId} },
\t}
${extentBlock(ext, 1)}
\tAnim {
${extentBlock(ext, 2)}
\t}
\tAnim {
${extentBlock(ext, 2)}
\t}
\tMaterialID ${materialId},
\tSelectionGroup 0,
}`;
}

// Build the whole model.
//   name:    model name (also the .mdx basename written)
//   extents: { min:[x,y,z], max:[x,y,z], radius }
//   geosets: [{ name, mesh:{verts,faces}, tint:[r,g,b]|null, additive:bool }]
//   outFile: absolute path of the .mdx to write
export function buildModel({ name, extents, geosets, outFile }) {
  const ext = extents;

  const needSolid = geosets.some((g) => !g.additive);
  const needAdd = geosets.some((g) => g.additive);
  const materials = [];
  const materialIndex = {};
  if (needSolid) {
    materialIndex.solid = materials.length;
    materials.push(`\tMaterial {
\t\tLayer {
\t\t\tFilterMode None,
\t\t\tUnshaded,
\t\t\tTwoSided,
\t\t\tstatic TextureID 0,
\t\t}
\t}`);
  }
  if (needAdd) {
    materialIndex.additive = materials.length;
    materials.push(`\tMaterial {
\t\tLayer {
\t\t\tFilterMode Additive,
\t\t\tUnshaded,
\t\t\tUnfogged,
\t\t\tTwoSided,
\t\t\tstatic TextureID 0,
\t\t\tstatic Alpha 0.85,
\t\t}
\t}`);
  }

  const geosetBlocks = geosets.map((g, i) =>
    geosetMDL(g, i, i, g.additive ? materialIndex.additive : materialIndex.solid, ext));

  const geosetAnims = geosets.map((g, i) => `GeosetAnim {
\tAlpha 3 {
\t\tLinear,
\t\t0: 1,
\t\t${DEATH[0]}: 1,
\t\t${DEATH[1]}: 0,
\t}
${g.tint ? `\tstatic Color { ${g.tint.join(', ')} },\n` : ''}\tGeosetId ${i},
}`);

  const bones = geosets.map((g, i) => `Bone "${g.name}" {
\tObjectId ${i},
\tGeosetId ${i},
\tGeosetAnimId ${i},
}`);

  const nBones = geosets.length;
  const pivots = Array.from({ length: nBones + 1 }, () => '\t{ 0, 0, 0 },').join('\n');

  const mdl = `// ${name} — generated by maps/northreach/assets (wc3-map-toolkit)
Version {
\tFormatVersion 800,
}
Model "${name}" {
\tBlendTime 150,
${extentBlock(ext, 1)}
}
Sequences 2 {
\tAnim "Stand" {
\t\tInterval { ${STAND[0]}, ${STAND[1]} },
${extentBlock(ext, 2)}
\t}
\tAnim "Death" {
\t\tInterval { ${DEATH[0]}, ${DEATH[1]} },
\t\tNonLooping,
${extentBlock(ext, 2)}
\t}
}
Textures 1 {
\tBitmap {
\t\tImage "",
\t\tReplaceableId 1,
\t}
}
Materials ${materials.length} {
${materials.join('\n')}
}
${geosetBlocks.join('\n')}
${geosetAnims.join('\n')}
${bones.join('\n')}
Attachment "Origin Ref" {
\tObjectId ${nBones},
\tAttachmentID 0,
}
PivotPoints ${nBones + 1} {
${pivots}
}
`;

  const model = parseMDL(mdl);
  const mdx = Buffer.from(generateMDX(model));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, mdx);

  // self-check 1: the emitted MDX parses back with the same shape
  const re = parseMDX(mdx.buffer.slice(mdx.byteOffset, mdx.byteOffset + mdx.byteLength));
  if (re.Geosets.length !== geosets.length) {
    throw new Error(`${name}: MDX self-check failed (geoset count)`);
  }

  // self-check 2: mdx-m3-viewer sanityTest — the validate-map bar
  const sanityTest = require('mdx-m3-viewer-th/dist/cjs/utils/mdlx/sanitytest/sanitytest.js').default;
  const Model = require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
  const viewerModel = new Model();
  viewerModel.load(new Uint8Array(fs.readFileSync(outFile))); // NEVER a Node Buffer
  const result = sanityTest(viewerModel);
  if (result.errors !== 0 || result.severe !== 0) {
    console.error(JSON.stringify(result.nodes, null, 2));
    throw new Error(`${name}: sanityTest reported errors=${result.errors} severe=${result.severe}`);
  }

  const tris = geosets.reduce((s, g) => s + g.mesh.faces.length, 0);
  console.log(`wrote ${outFile} (${mdx.length} bytes, ${geosets.length} geosets, ` +
    `${tris} tris, sanity errors=${result.errors} severe=${result.severe} warnings=${result.warnings})`);
  return { bytes: mdx.length, sanity: result };
}
