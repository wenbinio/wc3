// Original, deterministic map source and asset generator. No game files are embedded.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildModel, box, merge } from '../../maps/northreach/assets/mdl-lib.mjs';
const require = createRequire(import.meta.url);
const {parseMDX,generateMDX}=require('war3-model');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function makeLayout() {
  let state=9152026;const random=n=>{state=state*48271%2147483647;return state%n;};
  const grid=Array.from({length:15},()=>Array(15).fill('#')),stack=[[1,1]];grid[1][1]='.';
  while(stack.length){const [x,y]=stack.at(-1);const next=[[2,0],[-2,0],[0,2],[0,-2]].map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>0&&a<14&&b>0&&b<14&&grid[b][a]==='#');
    if(!next.length){stack.pop();continue;}const [a,b]=next[random(next.length)];grid[(y+b)/2][(x+a)/2]='.';grid[b][a]='.';stack.push([a,b]);}
  let loops=0;for(let tries=0;tries<600&&loops<10;tries++){const x=1+random(13),y=1+random(13);if(grid[y][x]!== '#')continue;const horizontal=grid[y][x-1]==='.'&&grid[y][x+1]==='.'&&grid[y-1][x]==='#'&&grid[y+1][x]==='#';const vertical=grid[y-1][x]==='.'&&grid[y+1][x]==='.'&&grid[y][x-1]==='#'&&grid[y][x+1]==='#';if(horizontal||vertical){grid[y][x]='.';loops++;}}
  const key=([x,y])=>y*15+x;
  const distances=point=>{const seen=new Map([[key(point),0]]),q=[point];for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]])if(grid[b]?.[a]==='.'&&!seen.has(key([a,b]))){seen.set(key([a,b]),seen.get(key([x,y]))+1);q.push([a,b]);}}return seen;};
  const start=[1,1],generator=[7,7],exit=[13,13],reserved=[start,generator,exit],fuses=[];
  for(let i=0;i<3;i++){const ds=reserved.map(distances);const cells=[];for(let y=1;y<14;y++)for(let x=1;x<14;x++)if(grid[y][x]==='.')cells.push({p:[x,y],score:Math.min(...ds.map(d=>d.get(key([x,y]))??-1))});cells.sort((a,b)=>b.score-a.score||key(a.p)-key(b.p));fuses.push(cells[0].p);reserved.push(cells[0].p);}
  const monster=[13,1],patrol=[monster,...fuses,generator,exit];
  return {version:1,seed:9152026,size:15,cell:256,rows:grid.map(r=>r.join('')),start,generator,exit,fuses,monster,patrol,loops};
}
export function world([x,y]){return [-1792+x*256,1792-y*256];}
function tga(width,height,pixels){const h=Buffer.alloc(18);h[2]=2;h.writeUInt16LE(width,12);h.writeUInt16LE(height,14);h[16]=24;h[17]=32;const p=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++){p[i*3]=pixels[i*3+2];p[i*3+1]=pixels[i*3+1];p[i*3+2]=pixels[i*3];}return Buffer.concat([h,p]);}
function writeJson(p,value){fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');}
function field(id,value,level=0,column=0){return {id,type:typeof value==='string'?'string':(['ucol','usca','uhpr','acdn'].includes(id)||!Number.isInteger(value))?'unreal':'int',level,column,value};}
function unit(name,model,extra=[]){return [field('unam',name),field('umdl',model),field('uico','war3mapImported\\portrait.tga'),field('utip',name),field('utub',name),field('uaen',0),field('ufoo',0),field('ubui',''),...extra];}
function channel(name,hotkey,order,icon,text,cooldown){const f=[field('anam',name),field('aher',0),field('alev',1),field('ahky',hotkey),field('aart',icon),field('atp1',`${name} (${hotkey})`,1),field('aub1',text,1),field('amcs',0,1),field('acdn',cooldown,1)];f.find(x=>x.id==='acdn').type='unreal';for(const [n,v] of [[1,0],[2,0],[3,1],[4,0],[5,0],[6,order]]){const e=field('Ncl'+n,v,1,n);if(n===1||n===4)e.type='unreal';f.push(e);}return f;}
export async function generate(out){
  if(fs.existsSync(out))throw new Error('Source output must be NEW');fs.cpSync(path.join(ROOT,'maps/demo'),out,{recursive:true});
  // Do not inherit a template's gameplay, cached preview, object placements or pathing.
  for(const name of fs.readdirSync(out))if(name!=='info.json'&&name!=='terrain.json')fs.rmSync(path.join(out,name),{recursive:true,force:true});
  fs.mkdirSync(path.join(out,'files'));const assets=path.join(out,'imports','war3mapImported');fs.mkdirSync(assets,{recursive:true});
  const layout=makeLayout();writeJson(path.join(out,'layout.json'),layout);
  const terrain=JSON.parse(fs.readFileSync(path.join(out,'terrain.json')));terrain.groundTexture.fill(0);terrain.groundVariation.fill(0);writeJson(path.join(out,'terrain.json'),terrain);
  const start=world(layout.start),starts=Array.from({length:4},(_,i)=>[start[0]+(i%2?32:-32),start[1]+(i<2?32:-32)]);
  const info=JSON.parse(fs.readFileSync(path.join(out,'info.json')));Object.assign(info.map,{name:'After Hours: Emergency Lighting',author:'Serendipity',description:'A small 1-4 player Backrooms-style escape. Find three fuses, restore the generator, leave together.',recommendedPlayers:'1-4',playableArea:{width:28,height:28}});
  Object.assign(info.map.flags,{isMeleeMap:false,useCustomForces:true,fixedPlayerSetting:true,useTerrainFog:true,forceDefaultCameraZoom:false});
  info.players=starts.map(([x,y],i)=>({name:`Night shift ${i+1}`,playerNum:i,type:1,race:1,startingPos:{x,y,fixed:true},allyLowPriorityFlags:[],allyHighPriorityFlags:[],enemyLowPriorityFlags:[],enemyHighPriorityFlags:[]}));
  info.forces=[{name:'Night shift',flags:{allied:true,alliedVictory:true,shareVision:true,shareUnitControl:false,shareAdvUnitControl:false},players:['red','blue','teal','purple']}];
  info.camera={bounds:[-1792,-1792,1792,1792,-1792,1792,1792,-1792],complements:[2,2,2,2]};
  info.loadingScreen={background:-1,path:'',title:'AFTER HOURS',subtitle:'Emergency Lighting',text:'Right-click to move. E: interact. Q: quiet walk. R: sprint. Find 3 fuses, use the generator, then reach EXIT. Gold = team fuses; lumber = stamina. Three captures exhaust a worker. -help repeats controls.'};
  info.prologue={path:'',text:'',title:'',subtitle:''};info.fog={type:0,startHeight:900,endHeight:2200,density:0.55,color:[35,32,24]};info.scriptLanguage=1;info.upgrades=[];info.techtree=[];info.randomGroupTable=[];info.randomItemTable=[];
  writeJson(path.join(out,'info.json'),info);writeJson(path.join(out,'_header.json'),{name:info.map.name,flags:0,maxPlayers:4});
  const sloc=JSON.parse(fs.readFileSync(path.join(ROOT,'maps/demo/units.json')))[0];writeJson(path.join(out,'units.json'),starts.map(([x,y],i)=>({...sloc,position:[x,y,0],player:i,id:i,rotation:270})));
  fs.writeFileSync(path.join(assets,'flat.tga'),tga(4,4,Buffer.alloc(4*4*3,255)));
  const make=(name,geosets,min,max)=>{const dest=path.join(assets,name+'.mdx');buildModel({name,extents:{min,max,radius:Math.hypot(...max.map((v,i)=>Math.max(Math.abs(v),Math.abs(min[i]))))},geosets,outFile:dest});const b=fs.readFileSync(dest),m=parseMDX(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));m.Textures[0].Image='war3mapImported\\flat.tga';m.Textures[0].ReplaceableId=0;fs.writeFileSync(dest,Buffer.from(generateMDX(m)));};
  make('Wall',[{name:'paper',mesh:box(-128,128,-128,128,0,172),tint:[0.64,0.58,0.34]},{name:'skirting',mesh:merge(box(-129,129,-129,-125,0,16),box(-129,129,125,129,0,16),box(-129,-125,-129,129,0,16),box(125,129,-129,129,0,16)),tint:[0.18,0.16,0.09]}],[-130,-130,0],[130,130,172]);
  make('Carpet',[{name:'carpet',mesh:box(-128,128,-128,128,0,1),tint:[0.28,0.25,0.12]},{name:'seam',mesh:merge(box(-128,-125,-128,128,1,2),box(-128,128,-128,-125,1,2)),tint:[0.17,0.15,0.07]}],[-128,-128,0],[128,128,2]);
  make('Fixture',[{name:'frame',mesh:box(-56,56,-18,18,160,166),tint:[0.19,0.19,0.16]},{name:'tubes',mesh:merge(box(-49,49,-11,-5,166,170),box(-49,49,5,11,166,170)),tint:[0.73,0.85,0.63],additive:true}],[-56,-18,160],[56,18,170]);
  make('Fuse',[{name:'box',mesh:box(-28,28,-20,20,0,48),tint:[0.21,0.23,0.21]},{name:'glass',mesh:box(-17,17,-22,22,14,38),tint:[0.95,0.57,0.12],additive:true}],[-28,-22,0],[28,22,48]);
  make('Generator',[{name:'cabinet',mesh:box(-55,55,-35,35,0,112),tint:[0.26,0.29,0.25]},{name:'panel',mesh:box(-42,42,-37,-35,40,98),tint:[0.07,0.08,0.07]},{name:'warning',mesh:box(-30,30,-40,-35,77,84),tint:[0.85,0.45,0.07],additive:true}],[-55,-40,0],[55,35,112]);
  make('Exit',[{name:'door',mesh:box(-80,80,-16,16,0,166),tint:[0.12,0.19,0.15]},{name:'litSign',mesh:box(-61,61,-18,18,173,203),tint:[0.20,0.9,0.45],additive:true},{name:'bar',mesh:box(-61,61,-20,-16,62,69),tint:[0.64,0.68,0.63]}],[-80,-20,0],[80,20,203]);
  make('Custodian',[{name:'body',mesh:merge(box(-14,14,-9,9,42,125),box(-13,13,-11,11,130,169),box(-25,-16,-7,7,19,124),box(16,25,-7,7,19,124),box(-13,-4,-7,7,0,50),box(4,13,-7,7,0,50)),tint:[0.035,0.037,0.026]},{name:'eyes',mesh:merge(box(-9,-5,-12,-10,151,154),box(5,9,-12,-10,151,154)),tint:[0.95,0.95,0.78],additive:true}],[-25,-12,0],[25,11,169]);
  // Original UI graphics: tiny, crisp symbols with disabled twins, not extracted game art.
  for(const [name,colour] of [['portrait',[150,164,128]],['interact',[222,184,97]],['sprint',[232,213,117]],['quiet',[144,184,166]]]){
    for(const disabled of [false,true]){const pix=Buffer.alloc(64*64*3);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const border=x<3||y<3||x>60||y>60;let on=false;if(name==='sprint')on=(y>9&&y<53&&Math.abs(x-(40-y*.3))<6);else if(name==='quiet')on=Math.abs(Math.hypot(x-33,(y-30)*.9)-15)<4||(x>29&&x<36&&y>32&&y<53);else on=(x>20&&x<44&&y>16&&y<49)||(x>15&&x<49&&y>26&&y<37);const rgb=border?[89,83,57]:on?colour:[28,30,23];for(let c=0;c<3;c++)pix[(y*64+x)*3+c]=Math.round(rgb[c]*(disabled?.4:1));}fs.writeFileSync(path.join(assets,(disabled?'DIS':'')+name+'.tga'),tga(64,64,pix));}
  }
  const objects={original:{},custom:{}};
  objects.custom['uW00:hpea']=unit('Night Shift Worker','units\\human\\Peasant\\Peasant.mdl',[field('uabi','aI00,aS00,aQ00'),field('umvs',260),field('uhpm',100),field('uhpr',0),field('ucol',16),field('usca',1),field('usin',700),field('usid',700)]);
  objects.custom['uM00:hfoo']=unit('Custodian','war3mapImported\\Custodian.mdl',[field('uabi','Avul'),field('umvs',215),field('ucol',16),field('uhpm',9999),field('usin',100),field('usid',100)]);
  for(const [id,name] of [['uA00','Wall'],['uB00','Carpet'],['uC00','Fixture'],['uD00','Fuse'],['uE00','Generator'],['uF00','Exit']])objects.custom[id+':hfoo']=unit(name,'war3mapImported\\'+name+'.mdl',[field('uabi','Aloc,Avul'),field('umvs',0),field('ucol',0),field('usin',0),field('usid',0)]);
  writeJson(path.join(out,'objects-units.json'),objects);
  writeJson(path.join(out,'objects-abilities.json'),{original:{},custom:{
    'aI00:ANcl':channel('Interact','E','channel','war3mapImported\\interact.tga','Pick up a nearby fuse, restore the generator with all three fuses, or use the exit.',0.2),
    'aS00:ANcl':channel('Sprint','R','berserk','war3mapImported\\sprint.tga','Run for 4 seconds. Costs 50 stamina; 10-second cooldown. Loud enough to attract the Custodian.',10),
    'aQ00:ANcl':channel('Quiet Walk','Q','roar','war3mapImported\\quiet.tga','Toggle slower, quieter movement. The Custodian hears you from a much shorter distance.',0.2)}});
  const wpm=Buffer.alloc(16+128*128,14);wpm.write('MP3W');wpm.writeInt32LE(0,4);wpm.writeInt32LE(128,8);wpm.writeInt32LE(128,12);
  for(let py=0;py<128;py++)for(let px=0;px<128;px++){const x=-2048+px*32+16,y=-2048+py*32+16,c=Math.floor((x+1920)/256),r=Math.floor((1920-y)/256);if(layout.rows[r]?.[c]==='.')wpm[16+py*128+px]=8;}
  fs.writeFileSync(path.join(out,'files','war3map.wpm'),wpm);fs.writeFileSync(path.join(out,'files','war3map.shd'),Buffer.alloc(128*128));
  const preview=Buffer.alloc(256*256*3);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const c=Math.floor(x*15/256),r=Math.floor(y*15/256),open=layout.rows[r][c]==='.';let rgb=open?[106,102,62]:[47,45,32];if(c===layout.start[0]&&r===layout.start[1])rgb=[84,161,182];if(c===layout.exit[0]&&r===layout.exit[1])rgb=[56,191,112];for(let k=0;k<3;k++)preview[(y*256+x)*3+k]=rgb[k];}fs.writeFileSync(path.join(out,'files','war3mapMap.tga'),tga(256,256,preview));
  // A low electrical hum composed from sine waves, authored here rather than sampled.
  const rate=22050,samples=rate*2,data=Buffer.alloc(samples*2);for(let i=0;i<samples;i++){const t=i/rate,v=.055*Math.sin(2*Math.PI*60*t)+.02*Math.sin(2*Math.PI*120*t)+.008*Math.sin(2*Math.PI*311*t);data.writeInt16LE(Math.round(v*32767),i*2);}const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36+data.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(data.length,40);fs.writeFileSync(path.join(assets,'hum.wav'),Buffer.concat([wav,data]));
  writeJson(path.join(out,'imports-credits.json'),{entries:{'war3mapImported/':{author:'Serendipity / wc3-map-toolkit',resource:'Original generated geometry, UI graphics and electrical hum',source:'examples/after-hours/generate.mjs',license:'Original generated assets; MIT',fetched:'2026-09-15'}}});
  writeJson(path.join(out,'asset-permissions.json'),{entries:fs.readdirSync(assets).sort().map(name=>({path:'war3mapImported/'+name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,name))).digest('hex'),redistributionPermitted:true,authority:'Original procedural art and composed audio generated by examples/after-hours/generate.mjs; Serendipity; MIT distribution.'}))});
  const luaData=`AH_LAYOUT = {${layout.rows.map(r=>JSON.stringify(r)).join(',')}}\nAH_FUSES = {${layout.fuses.map(p=>`{${world(p).join(',')}}`).join(',')}}\nAH_START = {${start.join(',')}}\nAH_GENERATOR = {${world(layout.generator).join(',')}}\nAH_EXIT = {${world(layout.exit).join(',')}}\nAH_MONSTER_START = {${world(layout.monster).join(',')}}\nAH_PATROL = {${layout.patrol.map(p=>`{${world(p).join(',')}}`).join(',')}}\nAH_STARTS = {${starts.map(p=>`{${p.join(',')}}`).join(',')}}\n`;
  fs.writeFileSync(path.join(out,'war3map.lua'),luaData+fs.readFileSync(path.join(ROOT,'examples/after-hours/game.lua'),'utf8'));
  fs.mkdirSync(path.join(out,'tests'));fs.copyFileSync(path.join(ROOT,'examples/after-hours/checks.cjs'),path.join(out,'tests/after-hours.test.js'));
  return {source:out,layout,starts};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw new Error('usage: generate.mjs <NEW-source-dir>');await generate(path.resolve(process.argv[2]));}
