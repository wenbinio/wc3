#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {sourceHash,fileHash}=require('../automation.cjs');
function prepare(input,out){
 const original=sourceHash(input);if(fs.existsSync(out))throw new Error('Probe output must be NEW');fs.mkdirSync(out,{recursive:true});
 const source=path.join(out,'source');fs.cpSync(input,source,{recursive:true});
 const scriptPath=path.join(source,'war3map.lua'),text=fs.readFileSync(scriptPath,'utf8');if(!text.includes('function AH_NextPoint'))throw new Error('This probe is for the After Hours example only');
 const nonce=crypto.randomBytes(16).toString('hex');
 fs.appendFileSync(scriptPath,`\n-- DIAGNOSTIC VARIANT ONLY. Threat suppressed; no movement teleport or scripted fuse award.\nlocal ProbeMain=main\nfunction main()\n ProbeMain()\n local function emit(stage,result)\n  PreloadGenClear();PreloadGenStart();Preload('WC3TK1|${nonce}|'..stage..'|'..result);PreloadGenEnd('wc3tk-${nonce}-'..stage..'.pld')\n end\n emit('BOOT','PASS')\n if not AH.workers[0] then emit('FUSE','FAIL');return end\n PauseUnit(AH.monster,true);AH.protectedUntil[0]=1000000\n local timer=CreateTimer();local elapsed=0\n TimerStart(timer,0.5,true,function()\n  elapsed=elapsed+0.5\n  local u=AH.workers[0];local p=AH_FUSES[1]\n  if AH_Distance(GetUnitX(u),GetUnitY(u),p[1],p[2])<=150 then\n   local success=AH_Interact(0) and AH.collected==1\n   emit('FUSE',success and 'PASS' or 'FAIL');DestroyTimer(timer);return\n  end\n  if elapsed>=150 then emit('FUSE','FAIL');DestroyTimer(timer);return end\n  local x,y=AH_NextPoint(GetUnitX(u),GetUnitY(u),p[1],p[2])\n  if x then IssuePointOrder(u,'move',x,y) end\n end)\nend\n`);
 const artifact=path.join(out,'probe.w3x');require('../build-map').buildMap(source,artifact,{});
 const request={schemaVersion:1,kind:'wc3-pathing-probe',nonce,map:'probe.w3x',mapSha256:fileHash(artifact).sha256,originalSourceSha256:original,files:['BOOT','FUSE'].map(stage=>`wc3tk-${nonce}-${stage}.pld`),scope:'Actual-client load and order-driven traversal to a fuse with threats suppressed. Not normal gameplay, input-button, visual, persistence, multiplayer or balance acceptance.',status:'PREPARED_NOT_RUN'};
 fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request,null,2)+'\n',{flag:'wx'});if(sourceHash(input)!==original)throw new Error('original source changed');return request;
}
if(require.main===module){try{if(process.argv.length!==4)throw new Error('usage: prepare-probe.cjs <After-Hours-source> <NEW-dir>');console.log(JSON.stringify(prepare(...process.argv.slice(2)),null,2));}catch(e){console.error(e.stack);process.exitCode=2;}}
module.exports={prepare};
