'use strict';
// Regression fixtures are authored art/parser inputs, NOT game telemetry.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {pathToFileURL}=require('url');
const Model=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
const {inspectModel,inspectDirectory}=require('../examples/after-hours/asset-checks.cjs');
let root,imports;
test.before(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'after-hours-art-'));const source=path.join(root,'source');await(await import(pathToFileURL(path.resolve(__dirname,'../examples/after-hours/generate.mjs')))).generate(source);imports=path.join(source,'imports');});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
function read(name){const m=new Model();m.load(new Uint8Array(fs.readFileSync(path.join(imports,'war3mapImported',name+'.mdx'))));return m;}
function mutate(name,fn){const dir=fs.mkdtempSync(path.join(root,'variant-'));fs.cpSync(imports,dir,{recursive:true});const file=path.join(dir,'war3mapImported',name+'.mdx'),m=read(name);fn(m);fs.writeFileSync(file,m.saveMdx());return()=>inspectModel(file,dir);}
test('all seven generated assets have decoded textures, colour flags and bounded visible live poses',()=>{const r=inspectDirectory(imports);assert.equal(r.models.length,7);assert.equal(r.clientValidated,false);});
test('missing colour-enable flag from the shipped model is rejected',()=>assert.throws(mutate('Wall',m=>{m.geosetAnimations[0].flags&=~2;}),/colour lacks enable/));
test('adding a Walk label without limb motion is rejected',()=>assert.throws(mutate('Custodian',m=>{for(const b of m.bones)b.animations=[];}),/frozen joint/));
test('missing locomotion sequence is rejected',()=>assert.throws(mutate('Custodian',m=>{m.sequences=m.sequences.filter(s=>s.name!=='Walk');}),/missing Walk/));
test('invisible live sequence is rejected',()=>assert.throws(mutate('Custodian',m=>{for(const g of m.geosetAnimations){g.alpha=0;g.animations=[];}}),/live sequence becomes invisible/));
test('undersized animated culling bounds are rejected',()=>assert.throws(mutate('Custodian',m=>{m.extent.min.set([0,0,0]);m.extent.max.set([1,1,1]);}),/culling bounds/));
test('every custom command icon has a real engine-path disabled BLP twin',()=>{const dir=path.join(imports,'ReplaceableTextures','CommandButtons');for(const f of fs.readdirSync(dir)){assert.ok(f.startsWith('BTN'));const twin=path.join(imports,'ReplaceableTextures','CommandButtonsDisabled','DIS'+f);assert.equal(fs.readFileSync(twin).subarray(0,4).toString(),'BLP1');}});
test('scenery is stationary and all prop creation uses exact-placement helper',()=>{const source=path.join(root,'source');const units=JSON.parse(fs.readFileSync(path.join(source,'objects-units.json')));for(const id of ['uA00','uB00','uC00','uD00','uE00','uF00']){const fields=units.custom[id+':hfoo'];assert.ok(fields.some(f=>f.id==='umvt'&&f.value==='none'));}const lua=fs.readFileSync(path.join(source,'war3map.lua'),'utf8');assert.match(lua,/SetUnitPathing\(u,false\)/);assert.match(lua,/SetUnitX\(u,x\);SetUnitY\(u,y\)/);});

test('wall material uses explicit yellow texture pixels, not channel-swapped geoset tint',()=>{const m=read('Wall');assert.equal(m.textures[0].path,'war3mapImported\\colour-a39457.blp');assert.deepEqual([...m.geosetAnimations[0].color],[1,1,1]);});
