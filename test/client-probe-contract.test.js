'use strict';
// Deliberate parser fixtures, not fabricated game-run results.
const test=require('node:test'),assert=require('node:assert/strict');const {parse}=require('../tools/client/check-probe.cjs');
const nonce='a'.repeat(32),request={schemaVersion:1,kind:'wc3-pathing-probe',nonce,mapSha256:'b'.repeat(64),files:['BOOT','FUSE'].map(s=>`wc3tk-${nonce}-${s}.pld`)};
const text=['BOOT','FUSE'].map(s=>`function PreloadFiles takes nothing returns nothing\n call Preload("WC3TK1|${nonce}|${s}|PASS")\nendfunction`);
test('probe parser checks nonce, stage, presence and uniqueness',()=>{assert.equal(parse(request,text).length,2);for(const bad of [text.slice(1),[text[1],text[0]],[text[0]+text[0],text[1]],[text[0].replace(nonce,'c'.repeat(32)),text[1]]])assert.throws(()=>parse(request,bad));});
test('probe failures remain failures and paths cannot escape telemetry root',()=>{assert.equal(parse(request,[text[0],text[1].replace('|PASS','|FAIL')])[1].status,'FAIL');assert.throws(()=>parse({...request,files:['../outside','bad']},text));});
