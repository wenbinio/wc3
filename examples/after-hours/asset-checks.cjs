'use strict';
// Checks the PACKED assets, not a source filename count or mocked game world.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const Model=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
const {parseMDX,decodeBLP,getBLPImageData,ModelRenderer}=require('war3-model');
const NAMES=['Wall','Carpet','Fixture','Fuse','Generator','Exit','Custodian'];
function ab(b){return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
function pose(model,sequence,t){
 const r=new ModelRenderer(model);r.setSequence(sequence);const [a,b]=model.Sequences[sequence].Interval;r.setFrame(a+(b-a)*t);r.update(0);
 const xyz=[];
 for(const g of model.Geosets)for(let i=0;i<g.Vertices.length;i+=3){
  const group=g.Groups[g.VertexGroup[i/3]];assert.ok(group?.length,'bound vertex');
  const p=[0,0,0];for(const id of group){const m=r.rendererData.nodes[id].matrix;const x=g.Vertices[i],y=g.Vertices[i+1],z=g.Vertices[i+2];for(let k=0;k<3;k++)p[k]+=(m[k]*x+m[4+k]*y+m[8+k]*z+m[12+k])/group.length;}xyz.push(p);
 }
 return {xyz,alpha:[...r.rendererData.geosetAlpha],matrices:r.rendererData.nodes.map(n=>n?[...n.matrix]:null)};
}
function inspectModel(file,root){
 const b=fs.readFileSync(file),m=new Model();m.load(new Uint8Array(b));const name=path.basename(file,'.mdx');
 assert.equal(m.version,800,name+': classic MDX');assert.ok(m.geosets.length>0,name+': mesh missing');
 for(const g of m.geosetAnimations){assert.ok(g.flags&2,name+': static colour lacks enable flag');assert.ok(g.color.every(v=>v===1),name+': material colour belongs in texture pixels');}
 assert.equal(m.materials.length,m.geosets.length,name+': per-part materials missing');
 m.geosets.forEach((g,i)=>{assert.equal(g.materialId,i,name+': shared material binding');for(const layer of m.materials[i].layers)assert.equal(layer.textureId,i,name+': wrong per-part texture binding');});
 for(const t of m.textures){assert.equal(t.replaceableId,0);const rel=t.path.replace(/\\/g,'/');assert.ok(!rel.includes('..')&&!path.isAbsolute(rel));const tex=fs.readFileSync(path.join(root,rel));assert.equal(tex.toString('ascii',0,4),'BLP1');const image=decodeBLP(ab(tex));assert.equal(image.width,64);assert.equal(image.height,64);for(let level=0;level<7;level++){const mip=getBLPImageData(image,level);assert.equal(mip.width,64>>level);assert.equal(mip.height,64>>level);const hex=/colour-([0-9a-f]{6})\.blp$/.exec(rel);assert.ok(hex,'explicit colour texture name');const rgb=[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16));for(let px=0;px<mip.data.length;px+=4){assert.deepEqual([...mip.data.slice(px,px+4)],[...rgb,255],name+': texture pixel/alpha mismatch');}}}
 const parsed=parseMDX(ab(b));let samples=0;
 for(let i=0;i<parsed.Sequences.length;i++)for(const t of [0,.25,.5,.75,.999]){
  const p=pose(parsed,i,t);samples++;
  if(parsed.Sequences[i].Name!=='Death')assert.ok(p.alpha.every(a=>a>=.99),name+': live sequence becomes invisible');
  for(const point of p.xyz)for(let axis=0;axis<3;axis++){assert.ok(Number.isFinite(point[axis]),name+': nonfinite pose');assert.ok(point[axis]>=parsed.Info.MinimumExtent[axis]-.01&&point[axis]<=parsed.Info.MaximumExtent[axis]+.01,name+': animated model exceeds culling bounds');}
 }
 if(name==='Custodian'){
  for(const seq of ['Stand','Walk','Walk Fast','Attack','Death','Portrait'])assert.ok(parsed.Sequences.some(s=>s.Name===seq),'missing '+seq);
  for(const seq of ['Walk','Walk Fast']){const idx=parsed.Sequences.findIndex(s=>s.Name===seq);const a=pose(parsed,idx,.25),b=pose(parsed,idx,.75);for(const name of ['arm_L','arm_R','leg_L','leg_R']){const bone=parsed.Bones.find(x=>x.Name===name);assert.ok(bone,'missing joint '+name);assert.notDeepEqual(a.matrices[bone.ObjectId],b.matrices[bone.ObjectId],'frozen joint '+name);}}
 }
 return {model:name,geosets:m.geosets.length,bones:m.bones.length,sequences:m.sequences.map(s=>s.name),sampledPoses:samples,textureClosure:true,colourFlags:true};
}
function inspectDirectory(root){return {scope:'packed-asset structure, texture decoding and evaluated skeletal poses; not retail-client rendering',models:NAMES.map(name=>inspectModel(path.join(root,'war3mapImported',name+'.mdx'),root)),clientValidated:false};}
function inspectArchive(file){const root=fs.mkdtempSync(path.join(os.tmpdir(),'after-hours-assets-'));try{const r=require('../../lib/mpq').extractAll(file,root);assert.equal(r.unresolved,0,'unresolved archive members');return inspectDirectory(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
module.exports={inspectModel,inspectDirectory,inspectArchive,pose};
if(require.main===module)try{console.log(JSON.stringify(inspectArchive(process.argv[2]),null,2));}catch(e){console.error(e.stack);process.exitCode=1;}
