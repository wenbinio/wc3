#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {fileHash}=require('../automation.cjs');
function parse(request,texts){
 if(request?.schemaVersion!==1||request.kind!=='wc3-pathing-probe'||!/^[a-f0-9]{32}$/.test(request.nonce)||! /^[a-f0-9]{64}$/.test(request.mapSha256||''))throw new Error('invalid request');
 const expected=['BOOT','FUSE'].map(stage=>`wc3tk-${request.nonce}-${stage}.pld`);if(JSON.stringify(request.files)!==JSON.stringify(expected)||texts.length!==2)throw new Error('invalid checkpoint set');
 return texts.map((text,i)=>{if(Buffer.byteLength(text)>16384)throw new Error('oversized checkpoint');const found=[...text.matchAll(/(?:call\s+)?Preload\(\s*"(WC3TK1\|[a-f0-9]{32}\|(?:BOOT|FUSE)\|(?:PASS|FAIL))"\s*\)/g)];if(found.length!==1)throw new Error('missing or duplicate checkpoint');const [,nonce,stage,status]=found[0][1].split('|');if(nonce!==request.nonce||stage!==['BOOT','FUSE'][i])throw new Error('stale or wrong checkpoint');return {stage,status};});
}
function collect(requestFile,root,startedAt){fileHash(requestFile,16384);const request=JSON.parse(fs.readFileSync(requestFile,'utf8')),start=Date.parse(startedAt);if(!Number.isFinite(start))throw new Error('launch timestamp required');if(!Array.isArray(request.files))throw new Error('invalid request');for(const name of request.files)if(!/^wc3tk-[a-f0-9]{32}-(BOOT|FUSE)\.pld$/.test(name))throw new Error('unsafe checkpoint path');const files=request.files.map(name=>{const p=path.join(root,name),metadata=fileHash(p,16384);if(fs.statSync(p).mtimeMs<start-1000)throw new Error('checkpoint predates launch');return {name,...metadata,text:fs.readFileSync(p,'utf8')};});const checkpoints=parse(request,files.map(f=>f.text));return {schemaVersion:1,kind:'wc3-client-probe-events',nonce:request.nonce,mapSha256:request.mapSha256,status:checkpoints.every(c=>c.status==='PASS')?'PROBE_PASSED':'PROBE_FAILED',checkpoints,files:files.map(({text,...f})=>f),scope:request.scope,releaseReady:false};}
if(require.main===module){try{if(process.argv.length!==5)throw new Error('usage: check-probe.cjs <request> <telemetry-dir> <launch-ISO-time>');const r=collect(...process.argv.slice(2));console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='PROBE_PASSED'?0:1;}catch(e){console.error(e.message);process.exitCode=2;}}
module.exports={parse,collect};
