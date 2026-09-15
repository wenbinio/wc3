#!/usr/bin/env node
'use strict';
// Build evidence orchestration. Files from a game install are never supplied,
// invented or downloaded by this tool. Unsigned local receipts are evidence,
// not a security boundary against a malicious author.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function fileHash(file,max=512*1024**2){
 const initial=fs.lstatSync(file);if(!initial.isFile()||initial.isSymbolicLink()||initial.size>max)throw new Error('not a bounded regular file: '+file);
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{const before=fs.fstatSync(fd),digest=crypto.createHash('sha256'),chunk=Buffer.alloc(65536);let size=0,n;
  while((n=fs.readSync(fd,chunk,0,chunk.length,null))){size+=n;if(size>max)throw new Error('file grew beyond byte limit');digest.update(chunk.subarray(0,n));}
  const after=fs.fstatSync(fd);if(size!==before.size||after.size!==size||after.mtimeMs!==before.mtimeMs)throw new Error('file changed while hashing');return {size,sha256:digest.digest('hex')};
 }finally{fs.closeSync(fd);}
}
function json(file){fileHash(file,16*1024**2);return JSON.parse(fs.readFileSync(file,'utf8'));}
function fresh(dir){if(fs.existsSync(dir))throw new Error('output must be NEW: '+dir);let p=path.dirname(path.resolve(dir));while(p!==path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw new Error('symlink parent refused');p=path.dirname(p);}fs.mkdirSync(dir,{recursive:true});}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function sourceHash(dir){const inv=require('./compare-map-members').inventory(dir);if(inv.unresolved.length)throw new Error('unresolved source members');return hash(JSON.stringify([...inv.members].map(([name,f])=>[name,f.size,f.sha256]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)));}
function profile(common,blizzard,exe,out,label=null){
 const api=require('./inspect-game-api').readApi(common);const sim=require('../lib/sim').loadMap(null,{script:'',config:false,main:false});
 const report={schemaVersion:1,kind:'wc3-game-profile',label,labelVerified:false,files:{common:fileHash(common,16*1024**2),blizzard:fileHash(blizzard,16*1024**2),executable:fileHash(exe)},natives:api.natives.map(n=>({name:n.name,signature:n.signature,simulation:require('./strict-sim.cjs').DELIBERATE_STUBS.has(n.name)?'deliberate-stub':Object.hasOwn(sim.natives,n.name)?'implemented-approximation':'unsupported-or-stub'})),runtimeValidated:false};
 write(out,report);return report;
}
function verifyProfile(pin,common,blizzard,exe=null){
 if(pin?.schemaVersion!==1||pin.kind!=='wc3-game-profile')throw new Error('invalid profile');
 for(const [name,file] of [['common',common],['blizzard',blizzard],...(exe?[['executable',exe]]:[])]){const observed=fileHash(file);if(observed.sha256!==pin.files?.[name]?.sha256||observed.size!==pin.files?.[name]?.size)throw new Error(name+' differs from pinned profile');}
}
function extract(artifact,dir){const run=spawnSync(process.execPath,[path.join(__dirname,'w3x-extract.js'),'--require-complete',artifact,dir],{encoding:'utf8',timeout:120000,maxBuffer:16*1024**2});if(run.error||run.status!==0)throw new Error('extraction failed: '+(run.stderr||run.error));const receipt=json(path.join(dir,'_extraction.json'));if(receipt.complete!==true||receipt.archive?.sha256!==fileHash(artifact).sha256)throw new Error('extraction inventory incomplete or unbound');return receipt;}
function classifyWarnings(checks,source,waivers=[],now=Date.now()){
 const used=new Set(),approved=[],blocked=[];
 for(const c of checks.filter(c=>c.status==='WARN')){const fingerprint=hash(JSON.stringify({id:c.id,detail:c.detail}));const i=waivers.findIndex(w=>w.id===c.id&&w.fingerprint===fingerprint&&w.sourceSha256===source&&typeof w.reason==='string'&&w.reason.trim().length>=10&&Date.parse(w.expires)>now);const item={...c,fingerprint};if(i<0)blocked.push(item);else{used.add(i);approved.push({...item,reason:waivers[i].reason,expires:waivers[i].expires});}}
 return {approved,blocked,unused:waivers.filter((_,i)=>!used.has(i))};
}
function qualify(input,out,options={}){
 const original=sourceHash(input);fresh(out);const source=path.join(out,'source');fs.cpSync(input,source,{recursive:true});
 process.env.WC3_TOOLKIT_ROOT=ROOT;
 const artifact=path.join(out,'map.w3x');require('./build-map').buildMap(source,artifact,{});const stable=sourceHash(source);
 const validation=require('./validate-map').validate(artifact),preflight=require('./preflight').preflight([source]);
 const blockers=validation.filter(c=>!c.pass&&!c.warn).map(c=>({code:'validation',detail:c.name+': '+c.detail}));
 for(const m of preflight.maps)for(const c of m.checks.filter(c=>c.status==='FAIL'))blockers.push({code:c.id,detail:c.detail});
 const checks=preflight.maps.flatMap(m=>m.checks);for(const v of validation.filter(c=>c.warn))checks.push({id:'validate:'+v.name,status:'WARN',detail:String(v.detail)});
 const warnings=classifyWarnings(checks,stable,options.waivers?json(options.waivers).entries:[]);
 blockers.push(...warnings.blocked.map(c=>({code:'warning',detail:c.id,fingerprint:c.fingerprint})));if(warnings.unused.length)blockers.push({code:'stale-waiver',detail:warnings.unused.length+' unused exception(s)'});
 let extraction=null;try{extraction=extract(artifact,path.join(out,'extracted'));}catch(e){blockers.push({code:'extraction',detail:e.message});}
 if(Number(process.versions.node.split('.')[0])!==24)blockers.push({code:'node',detail:'Supported release runtime is Node 24'});
 const api=require('../lib/jasscheck').apiFiles();if(!options.profile||api.length!==2)blockers.push({code:'game-api',detail:'Exact local common.j + Blizzard.j and a pinned game profile required'});
 else{try{verifyProfile(json(options.profile),...api);}catch(e){blockers.push({code:'game-api',detail:e.message});}}
 if(!require('../lib/jasscheck').findPjass())blockers.push({code:'pjass',detail:'required checker unavailable'});
 const lua=require('./preflight').findLua53();if(!lua)blockers.push({code:'lua53',detail:'native Lua 5.3 required; a mocked VM does not substitute'});
 else{const r=spawnSync(lua,['-v'],{encoding:'utf8',timeout:5000});if(r.error||r.status!==0||!/Lua 5\.3/.test(String(r.stdout)+String(r.stderr)))blockers.push({code:'lua53',detail:'selected executable is not verified Lua 5.3'});}
 const imports=require('./compare-map-members').inventory(source).members;
 const permissionFile=options.permissions||path.join(source,'asset-permissions.json');const permissions=fs.existsSync(permissionFile)?json(permissionFile):{entries:[]};
 for(const [name,f] of imports){if(!name.startsWith('imports/'))continue;const e=permissions.entries?.find(e=>typeof e.path==='string'&&e.path.replace(/\\/g,'/').toLowerCase()===name.slice(8)&&e.sha256===f.sha256&&e.redistributionPermitted===true&&typeof e.authority==='string'&&e.authority.length>=10);if(!e)blockers.push({code:'asset-permission',detail:name});}
 if(sourceHash(source)!==stable||sourceHash(input)!==original)blockers.push({code:'input-changed',detail:'source changed during checks'});
 const report={schemaVersion:1,kind:'wc3-headless-qualification',status:blockers.length?'BLOCKED':'HEADLESS_QUALIFIED',artifact:fileHash(artifact),sourceSha256:stable,originalSourceSha256:original,backend:require('../lib/mpq').backendName(),node:process.version,validation,preflight,warnings,extraction,blockers,clientAcceptance:'NOT_RUN',releaseReady:false};write(path.join(out,'qualification.json'),report);return report;
}
function corpus(manifest,out){
 const spec=json(manifest);if(spec.schemaVersion!==1||!Array.isArray(spec.entries)||spec.entries.length>100)throw new Error('invalid corpus');fresh(out);const results=[];
 for(const [i,entry] of spec.entries.entries()){
  if(entry.provenance?.kind!=='self-authored-editor-output'||!entry.provenance.editorBuild||!entry.provenance.author)throw new Error('actual editor-output provenance is required');
  const input=path.resolve(path.dirname(manifest),entry.path);if(fileHash(input).sha256!==entry.sha256)throw new Error('corpus input hash mismatch');
  for(const backend of ['stormlib','smpq']){const dir=path.join(out,`${i}-${backend}`);fresh(dir);const envBefore=process.env.WC3_MPQ_BACKEND;process.env.WC3_MPQ_BACKEND=backend;
   try{const before=path.join(dir,'before'),source=path.join(dir,'source'),after=path.join(dir,'after'),rebuilt=path.join(dir,'rebuilt.w3x');extract(input,before);require('../lib/source').extractedToSource(before,source);require('./build-map').buildMap(source,rebuilt,{});extract(rebuilt,after);const comparison=require('./compare-map-members').compareDirectories(before,after,{requireComplete:true});results.push({id:entry.id,backend,status:comparison.status,comparison,provenance:entry.provenance,provenanceVerified:false});}
   catch(e){results.push({id:entry.id,backend,status:'BLOCKED',error:e.message});}
   finally{if(envBefore===undefined)delete process.env.WC3_MPQ_BACKEND;else process.env.WC3_MPQ_BACKEND=envBefore;}
  }
 }
 const report={schemaVersion:1,status:results.length===0?'NO_FIXTURES':results.every(r=>r.status==='MATCH_WITHIN_SCOPE')?'PRESERVED_WITHIN_SCOPE':'BLOCKED',results,editorReopen:'NOT_RUN',clientLoad:'NOT_RUN'};write(path.join(out,'corpus.json'),report);return report;
}
function main(argv){const [command,...args]=argv;let report;
 if(command==='profile'&&(args.length===4||args.length===5))report=profile(...args);
 else if(command==='qualify'&&args.length>=2){const opts={};for(let i=2;i<args.length;i+=2){if(!['--profile','--waivers','--permissions'].includes(args[i])||!args[i+1])throw new Error('invalid qualification option');opts[args[i].slice(2)]=args[i+1];}report=qualify(args[0],args[1],opts);}
 else if(command==='corpus'&&args.length===2)report=corpus(...args);
 else throw new Error('usage: automation.cjs profile <common.j> <Blizzard.j> <game.exe> <NEW.json> [label] | qualify <source> <NEW-dir> [--profile file] [--waivers file] [--permissions file] | corpus <manifest.json> <NEW-dir>');
 console.log(JSON.stringify({status:report.status||'RECORDED_NOT_RUNTIME_VALIDATED',blockers:report.blockers?.length||0,clientAcceptance:report.clientAcceptance||'NOT_RUN'},null,2));return ['BLOCKED','NO_FIXTURES'].includes(report.status)?1:0;
}
if(require.main===module){try{process.exitCode=main(process.argv.slice(2));}catch(e){console.error(e.stack);process.exitCode=2;}}
module.exports={fileHash,sourceHash,profile,verifyProfile,classifyWarnings,qualify,corpus,main};
