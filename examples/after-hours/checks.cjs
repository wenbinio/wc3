'use strict';
// Mechanics tests execute map Lua against explicit mocked natives. Position
// fixtures test rules; the separate WPM test checks static path connectivity.
// Neither establishes real-client movement, visuals, networking or human balance.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
let root=process.env.WC3_TOOLKIT_ROOT||__dirname;
while(!fs.existsSync(path.join(root,'lib/sim/index.js'))){const parent=path.dirname(root);if(parent===root)throw new Error('Set WC3_TOOLKIT_ROOT to the toolkit checkout');root=parent;}
const {loadMap}=require(path.join(root,'lib/sim'));
const source=path.resolve(__dirname,'..'),layout=JSON.parse(fs.readFileSync(path.join(source,'layout.json'),'utf8'));
const world=([x,y])=>[-1792+x*256,1792-y*256];
function make(users=1){return loadMap(source,{users});}
function read(sim,expression){sim.run('__AH_CHECK='+expression);return sim.global('__AH_CHECK');}
function worker(sim,i=0){return sim.findUnit('uW00',i);}
function at(sim,p,i=0){const [x,y]=world(p);sim.moveUnit(worker(sim,i),x,y);}
function collect(sim){for(const p of layout.fuses){at(sim,p);assert.equal(sim.call('AH_Interact',0)[0],true);}}
// callGlobal returns all Lua values as an array.
test('one active worker and a single entity are initialized; closed slots do not spawn',()=>{const s=make();assert.equal(s.allUnits('uW00').length,1);assert.equal(s.allUnits('uM00').length,1);assert.equal(read(s,'AH.collected'),0);s.advance(1);assert.equal(read(s,'AH.ended'),false);});
test('interaction refuses distant fuses',()=>{const s=make();s.chat(0,'-use');assert.equal(read(s,'AH.collected'),0);});
test('each fuse is awarded once even after repeated interaction',()=>{const s=make();at(s,layout.fuses[0]);s.chat(0,'-use');s.chat(0,'-use');assert.equal(read(s,'AH.collected'),1);assert.equal(s.allUnits('uD00').length,2);});
test('generator rejects missing fuses and the exit remains locked',()=>{const s=make();at(s,layout.generator);s.chat(0,'-use');assert.equal(read(s,'AH.powered'),false);at(s,layout.exit);s.chat(0,'-use');assert.equal(read(s,'AH.ended'),false);});
test('solo complete objective sequence wins',()=>{const s=make();collect(s);at(s,layout.generator);s.chat(0,'-use');assert.equal(read(s,'AH.powered'),true);at(s,layout.exit);s.chat(0,'-use');assert.equal(read(s,'AH.won'),true);assert.equal(s.player(0).result,'victory');});
test('co-op exit waits for all non-exhausted connected workers',()=>{const s=make(2);collect(s);at(s,layout.generator);s.chat(0,'-use');at(s,layout.exit);s.chat(0,'-use');assert.equal(read(s,'AH.ended'),false);at(s,layout.exit,1);s.chat(1,'-use');assert.equal(read(s,'AH.won'),true);assert.equal(s.player(1).result,'victory');});
test('sprint spends stamina, respects cooldown, and quiet cancels it',()=>{const s=make();assert.equal(s.call('AH_Sprint',0)[0],true);assert.equal(read(s,'AH.stamina[0]'),50);assert.equal(s.call('AH_Sprint',0)[0],false);s.chat(0,'-quiet');s.advance(.25);assert.equal(read(s,'AH.quiet[0]'),true);assert.equal(worker(s).moveSpeed,170);s.advance(10);assert.equal(s.call('AH_Sprint',0)[0],true);});
test('ability events and chat fallback reach the same interaction',()=>{const s=make();at(s,layout.fuses[0]);s.cast(worker(s),'aI00');assert.equal(read(s,'AH.collected'),1);s.cast(worker(s),'aS00');assert.equal(read(s,'AH.stamina[0]'),50);});
test('capture returns a worker to reception without erasing team progress',()=>{const s=make();at(s,layout.fuses[0]);s.chat(0,'-use');s.call('AH_Capture',0);assert.equal(read(s,'AH.strikes[0]'),1);assert.equal(read(s,'AH.collected'),1);assert.ok(Math.hypot(worker(s).x-world(layout.start)[0],worker(s).y-world(layout.start)[1])<60);});
test('three captures defeat a solo worker; end state cannot later become victory',()=>{const s=make();for(let n=0;n<3;n++)s.call('AH_Capture',0);s.advance(.25);assert.equal(read(s,'AH.ended'),true);assert.equal(read(s,'AH.won'),false);s.call('AH_Finish',true,'must not overwrite');assert.equal(read(s,'AH.won'),false);});
test('reception protects a worker from proximity capture',()=>{const s=make();s.advance(9);const u=worker(s);s.moveUnit(s.findUnit('uM00'),u.x,u.y);s.advance(1);assert.equal(read(s,'AH.strikes[0]'),0);});
test('blackout cadence and restored-power state are distinct',()=>{const s=make();s.advance(35);assert.equal(read(s,'AH.dark'),true);s.advance(10);assert.equal(read(s,'AH.dark'),false);collect(s);at(s,layout.generator);s.chat(0,'-use');s.advance(35);assert.equal(read(s,'AH.dark'),false);});
test('the actual Lua router returns a walkable next waypoint and never teleports an entity',()=>{const s=make(),start=world(layout.monster),goal=world(layout.fuses[0]);const [x,y,steps]=s.call('AH_NextPoint',...start,...goal);assert.ok(steps>0&&steps<225);const c=Math.floor((x+1920)/256),r=Math.floor((1920-y)/256);assert.equal(layout.rows[r][c],'.');s.advance(2);assert.ok(s.orders.some(o=>o.order==='move'||o.orderId===851986));assert.equal(s.callsOf('SetUnitPosition').length,0);});
test('a departing player is no longer required at the exit',()=>{const s=make(2);s.leave(1);s.advance(.25);collect(s);at(s,layout.generator);s.chat(0,'-use');at(s,layout.exit);s.chat(0,'-use');assert.equal(read(s,'AH.won'),true);});
test('ten-minute timeout produces defeat',()=>{const s=make();s.advance(600);assert.equal(read(s,'AH.ended'),true);assert.equal(read(s,'AH.won'),false);});
test('all objectives are reachable in the emitted WPM with conservative 32-unit clearance',()=>{
 const wpm=fs.readFileSync(path.join(source,'files/war3map.wpm'));assert.equal(wpm.toString('ascii',0,4),'MP3W');assert.equal(wpm.readInt32LE(8),128);assert.equal(wpm.length,16+128*128);
 const index=p=>{const [x,y]=world(p);return [Math.floor((x+2048)/32),Math.floor((y+2048)/32)];};
 const clear=(x,y)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const a=x+dx,b=y+dy;if(a<0||a>=128||b<0||b>=128||(wpm[16+b*128+a]&2))return false;}return true;};
 const start=index(layout.start),q=[start],seen=new Set([start[1]*128+start[0]]);for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]])if(clear(a,b)&&!seen.has(b*128+a)){seen.add(b*128+a);q.push([a,b]);}}
 for(const p of [...layout.fuses,layout.generator,layout.exit,layout.monster]){const [x,y]=index(p);assert.ok(seen.has(y*128+x),`unreachable objective ${p}`);}
});
