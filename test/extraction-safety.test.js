'use strict';
// Adversarial authored archive fixtures; not editor interoperability evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { createArchive, extractAll, probeExtract, safeMemberRel } = require('../lib/mpq');
const { hashFile, context } = require('../lib/extraction-policy');
const { writeManifest } = require('../lib/extraction-manifest');
const { compareDirectories } = require('../tools/compare-map-members');
function workspace(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc3-safety-')); t.after(() => fs.rmSync(root,{recursive:true,force:true})); fs.mkdirSync(path.join(root,'source')); return root; }
function put(root, rel, value='fixture') { const p=path.join(root,rel); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,value); return p; }
function archive(t, members) { const root=workspace(t); for (const [name,value] of Object.entries(members)) put(path.join(root,'source'),name,value); const file=path.join(root,'input.w3x'); createArchive(file,path.join(root,'source'),Object.keys(members)); return {root,file,out:path.join(root,'out')}; }
test('portable names reject traversal, ADS, devices, trailing aliases and wildcard/options',()=>{
 for(const name of ['../x','/x','\\\\server\\x','C:\\x','x:stream','CON.txt','a/nul','x.','x ','a//b','a/./b','*.txt','[a]','-f','a\n']) assert.equal(safeMemberRel(name),null,name);
 assert.equal(safeMemberRel('Models\\Tree.MDX'),'Models/Tree.MDX');
});
test('normal extraction refuses traversal before publishing a member',t=>{
 const {root,file,out}=archive(t,{'../escape.txt':'malicious','war3map.lua':'safe'});
 fs.unlinkSync(path.join(root,'escape.txt')); const before=hashFile(file); assert.throws(()=>extractAll(file,out),/unsafe/);
 assert.equal(fs.existsSync(path.join(root,'escape.txt')),false); assert.deepEqual(hashFile(file),before);
});
test('existing output files cannot be overwritten',t=>{
 const {file,out}=archive(t,{'war3map.lua':'new'});put(out,'war3map.lua','original');
 assert.throws(()=>extractAll(file,out),/overwrite/);assert.equal(fs.readFileSync(path.join(out,'war3map.lua'),'utf8'),'original');
});
test('output symlinks and ancestor symlinks are refused',t=>{
 const {root,file,out}=archive(t,{'Models/a.mdx':'x'});fs.mkdirSync(out);fs.mkdirSync(path.join(root,'elsewhere'));fs.symlinkSync(path.join(root,'elsewhere'),path.join(out,'Models'),'dir');
 assert.throws(()=>extractAll(file,out),/symlink/);assert.deepEqual(fs.readdirSync(path.join(root,'elsewhere')),[]);
 const alias=path.join(root,'alias');fs.symlinkSync(path.join(root,'elsewhere'),alias,'dir');assert.throws(()=>extractAll(file,path.join(alias,'nested')),/ancestor/);
});
test('case-colliding directory spellings cannot create platform-dependent archives',t=>{
 const {file,out}=archive(t,{'Models/a.mdx':'x','models/b.mdx':'y'});assert.throws(()=>extractAll(file,out),/collision/);
});
test('archive cannot impersonate toolkit metadata',t=>{
 const {file,out}=archive(t,{'_header.json':'{}'});assert.throws(()=>extractAll(file,out),/metadata/);
});
test('member and aggregate budgets fail closed; input stays unchanged',t=>{
 const {root,file,out}=archive(t,{'war3map.lua':'12345678','war3map.wts':'12345678'});const before=hashFile(file);
 assert.throws(()=>extractAll(file,out,{limits:{maxFileBytes:4}}),/budget/);
 assert.throws(()=>extractAll(file,path.join(root,'total'),{limits:{maxTotalBytes:12}}),/budget/);
 assert.deepEqual(hashFile(file),before);
});
test('archive input and existing recovery output count toward limits',t=>{
 const {file,out}=archive(t,{'war3map.lua':'abc'});assert.throws(()=>extractAll(file,out,{limits:{maxArchiveBytes:1}}),/budget/);
 put(out,'existing','12345678');assert.throws(()=>probeExtract(file,out,['war3map.lua'],{limits:{maxTotalBytes:9}}),/budget/);
});
test('invalid harvested candidates are harmless misses, not arbitrary writes',t=>{
 const {file,out}=archive(t,{'war3map.lua':'abc'});assert.deepEqual(probeExtract(file,out,['../x','a:stream','CON']).recovered,[]);
});
test('manifest is bound to actual extracted files and incomplete enumerations fail',t=>{
 const {file,out,root}=archive(t,{'war3map.lua':'abc'});const result=extractAll(file,out);writeManifest(file,out,result,process.env.WC3_MPQ_BACKEND||'stormlib');
 assert.equal(compareDirectories(out,out,{requireComplete:true}).status,'MATCH_WITHIN_SCOPE');
 const copy=path.join(root,'copy');fs.cpSync(out,copy,{recursive:true});put(copy,'war3map.lua','tampered');
 assert.equal(compareDirectories(out,copy,{requireComplete:true,changed:['war3map.lua']}).status,'INCOMPLETE');
 fs.unlinkSync(path.join(copy,'_extraction.json'));assert.equal(compareDirectories(out,copy,{requireComplete:true}).status,'INCOMPLETE');
});
test('anonymous identities are not discharged by equal bytes or count arithmetic',t=>{
 const {file,out}=archive(t,{'war3map.lua':'abc'});const result=extractAll(file,out);
 result.enumeration.complete=false;result.enumeration.anonymous=1;writeManifest(file,out,result,'stormlib');
 assert.equal(compareDirectories(out,out,{requireComplete:true}).status,'INCOMPLETE');
});
test('CLI writes a usable receipt and rejects unknown options',t=>{
 const {root,file}=archive(t,{'war3map.lua':'abc'});const out=path.join(root,'cli');const cli=path.resolve(__dirname,'../tools/w3x-extract.js');
 const ran=spawnSync(process.execPath,[cli,'--require-complete',file,out],{encoding:'utf8'});assert.equal(ran.status,0,ran.stderr);
 assert.equal(compareDirectories(out,out,{requireComplete:true}).status,'MATCH_WITHIN_SCOPE');
 assert.equal(spawnSync(process.execPath,[cli,'--misspelled',file,path.join(root,'other')]).status,2);
});
