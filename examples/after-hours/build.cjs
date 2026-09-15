#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'../..');
async function main(out){
 if(!out||fs.existsSync(out))throw new Error('usage: build.cjs <NEW-output-directory>');out=path.resolve(out);fs.mkdirSync(out,{recursive:true});
 process.env.WC3_TOOLKIT_ROOT=ROOT;
 const source=path.join(out,'source');await (await import('./generate.mjs')).generate(source);
 const artifact=path.join(out,'After_Hours_Emergency_Lighting.w3x');require('../../tools/build-map').buildMap(source,artifact,{});
 const assetChecks=require('./asset-checks.cjs').inspectArchive(artifact);
 fs.writeFileSync(path.join(out,'asset-checks.json'),JSON.stringify(assetChecks,null,2)+'\n');
 const validation=require('../../tools/validate-map').validate(artifact);
 fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(validation,null,2)+'\n');
 const tests=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(source,'tests/after-hours.test.js')],{cwd:ROOT,env:{...process.env,WC3_TOOLKIT_ROOT:ROOT},encoding:'utf8',timeout:120000,maxBuffer:8*1024**2});
 fs.writeFileSync(path.join(out,'game-tests.log'),String(tests.stdout||'')+String(tests.stderr||''));
 const preflight=require('../../tools/preflight').preflight([source]);fs.writeFileSync(path.join(out,'preflight.json'),JSON.stringify(preflight,null,2)+'\n');
 const bytes=fs.readFileSync(artifact),report={schemaVersion:1,artifact:path.basename(artifact),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  node:process.version,backend:require('../../lib/mpq').backendName(),validation:{passed:validation.filter(c=>c.pass&&!c.warn).length,failed:validation.filter(c=>!c.pass&&!c.warn).length,warnings:validation.filter(c=>c.warn).length},
  mechanicsTests:{exitCode:tests.status,error:tests.error?tests.error.message:null,scope:'authored rule tests against mocked natives; includes static WPM connectivity, not observed engine traversal'},
  preflight:{failures:preflight.failures,warnings:preflight.warnings},clientPlaytest:'NOT_RUN',rendering:'NOT_RUN',multiplayer:'NOT_RUN',balance:'NOT_MEASURED'};
 fs.writeFileSync(path.join(out,'BUILD-REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(report.validation.failed||tests.status!==0||tests.error||preflight.failures)throw new Error('build qualification failed; inspect the retained reports');
 return report;
}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={main};
