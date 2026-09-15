#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),dirs=[path.join(root,'test')];
for(const item of fs.readdirSync(path.join(root,'maps'),{withFileTypes:true})){const dir=path.join(root,'maps',item.name,'tests');if(item.isDirectory()&&fs.existsSync(dir))dirs.push(dir);}
const files=dirs.flatMap(dir=>fs.readdirSync(dir,{withFileTypes:true}).filter(f=>f.isFile()&&f.name.endsWith('.test.js')).map(f=>path.join(dir,f.name))).sort();
if(!files.length)throw new Error('No tests discovered');
if(process.argv.slice(2).some(a=>a!=='--smpq'))throw new Error('usage: test-suite.cjs [--smpq]');
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:{...process.env,...(process.argv.includes('--smpq')?{WC3_MPQ_BACKEND:'smpq'}:{})}});
if(r.error)throw r.error;process.exitCode=r.status===null?1:r.status;
