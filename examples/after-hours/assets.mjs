// Asset repair: use the independent MDLX writer for the FINAL bytes, with
// explicit tint flags, game-native textures, and an actual locomotion rig.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildModel,box,merge} from '../../maps/northreach/assets/mdl-lib.mjs';
const require=createRequire(import.meta.url);
const Model=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model.js').default;
const Texture=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/texture.js').default;
const Sequence=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/sequence.js').default;
const Extent=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/extent.js').default;
const {FloatAnimation,Vector3Animation,Vector4Animation}=require('mdx-m3-viewer-th/dist/cjs/parsers/mdlx/animations.js');
const sanity=require('mdx-m3-viewer-th/dist/cjs/utils/mdlx/sanitytest/sanitytest.js').default;

// Exact-colour, opaque BLP1, with ALL mip levels. The art produced here uses
// <=256 colours. No Pillow version-specific header layout or TGA fallback.
export function encodeBLP(width,height,rgb){
  if(!Number.isInteger(width)||width<1||(width&(width-1))||!Number.isInteger(height)||height<1||(height&(height-1))||rgb.length!==width*height*3)throw Error('BLP input must be power-of-two RGB');
  const colours=[],lookup=new Map(),indices=Buffer.alloc(width*height);
  for(let i=0;i<indices.length;i++){
    const colour=[rgb[3*i],rgb[3*i+1],rgb[3*i+2]],key=colour.join(',');
    if(!lookup.has(key)){if(colours.length===256)throw Error('BLP exact palette exceeds 256 colours');lookup.set(key,colours.length);colours.push(colour);}
    indices[i]=lookup.get(key);
  }
  const header=Buffer.alloc(156),palette=Buffer.alloc(1024),levels=[];
  header.write('BLP1');header.writeUInt32LE(1,4);header.writeUInt32LE(0,8);
  header.writeUInt32LE(width,12);header.writeUInt32LE(height,16);header.writeUInt32LE(5,20);header.writeUInt32LE(1,24);
  colours.forEach(([r,g,b],i)=>{palette[i*4]=b;palette[i*4+1]=g;palette[i*4+2]=r;});
  let offset=1180,w=width,h=height,data=indices;
  for(let level=0;level<16;level++){
    header.writeUInt32LE(offset,28+level*4);header.writeUInt32LE(data.length,92+level*4);levels.push(data);offset+=data.length;
    if(w===1&&h===1)break;
    const nw=Math.max(1,w>>1),nh=Math.max(1,h>>1),next=Buffer.alloc(nw*nh);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)next[y*nw+x]=data[Math.min(h-1,y*2)*w+Math.min(w-1,x*2)];
    data=next;w=nw;h=nh;
  }
  return Buffer.concat([header,palette,...levels]);
}
export function writeFlatTexture(dir){fs.writeFileSync(path.join(dir,'flat.blp'),encodeBLP(64,64,Buffer.alloc(64*64*3,255)));}
function extent(min,max){const e=new Extent();e.min.set(min);e.max.set(max);e.boundsRadius=Math.hypot(...max.map((v,i)=>Math.max(Math.abs(v),Math.abs(min[i]))));return e;}
function track(kind,frames,values){const C=kind==='KGRT'?Vector4Animation:kind==='KGAO'?FloatAnimation:Vector3Animation;const a=new C();a.name=kind;a.interpolationType=1;a.globalSequenceId=-1;a.frames=frames;a.values=values.map(v=>new Float32Array(v));return a;}
function quaternionY(degrees){const a=degrees*Math.PI/360;return [0,Math.sin(a),0,Math.cos(a)];}
function setSequences(model,defs,min,max){
  model.sequences=defs.map(([name,start,end,speed=0,nonLooping=0])=>{const s=new Sequence();s.name=name;s.interval.set([start,end]);s.moveSpeed=speed;s.nonLooping=nonLooping;s.extent=extent(min,max);return s;});
  for(const g of model.geosets)g.sequenceExtents=defs.map(()=>extent(min,max));
  // Explicit endpoint keys in EVERY sequence: a last Death alpha=0 must not
  // bleed into newly added Walk/Portrait intervals.
  for(const g of model.geosetAnimations){g.alpha=1;const frames=[],values=[];for(const [name,a,b] of defs){frames.push(a,b);values.push([1],[name==='Death'?0:1]);}g.animations=[track('KGAO',frames,values)];}
}
function rigCustodian(model){
  const min=[-105,-70,-55],max=[155,70,195];model.extent=extent(min,max);
  const defs=[['Stand',0,1000],['Death',1100,2000,0,1],['Walk',2100,2900,215],['Walk Fast',3000,3540,295],['Attack',3600,4250,0,1],['Portrait',4400,5400]];
  setSequences(model,defs,min,max);
  const pivots=[[0,0,82],[0,0,135],[0,-21,125],[0,21,125],[0,-9,60],[0,9,60],[0,0,135]];
  model.bones.forEach((bone,i)=>{bone.parentId=i===0?-1:i===6?1:0;model.pivotPoints[bone.objectId].set(pivots[i]);});
  for(let i=0;i<model.bones.length;i++){
    const frames=[],rotations=[],translations=[];
    for(const [name,a,b] of defs){
      const samples=name==='Walk'||name==='Walk Fast'?8:4;
      for(let k=0;k<=samples;k++){
        const t=k/samples,phase=Math.sin(t*Math.PI*2);let angle=0,z=0;
        if(name==='Walk'||name==='Walk Fast'){
          const fast=name==='Walk Fast';
          if(i===0){z=(fast?2.2:1.3)*(1-Math.cos(t*Math.PI*4));angle=fast?6:2;}
          if(i===1)angle=-3+phase*2;
          if(i===2||i===3)angle=phase*(i===2?1:-1)*(fast?42:28);
          if(i===4||i===5)angle=phase*(i===4?-1:1)*(fast?34:23);
        }else if(name==='Death'){
          if(i===0){angle=90*t;z=-65*t*t;}
          if(i===2||i===3)angle=-30*t;
        }else if(name==='Attack'){
          const reach=Math.sin(t*Math.PI);
          if(i===0)angle=12*reach;
          if(i===2||i===3)angle=-80*reach;
        }else{
          if(i===0)z=.6*phase;
          if(i===1)angle=1.5*phase;
        }
        frames.push(Math.round(a+(b-a)*t));rotations.push(quaternionY(angle));translations.push([0,0,z]);
      }
    }
    model.bones[i].animations=[track('KGRT',frames,rotations)];
    if(i===0)model.bones[i].animations.push(track('KGTR',frames,translations));
  }
  // Keep conservative animated bounds, not only the bind-pose silhouette.
  for(const g of model.geosets)g.extent=extent(min,max);
}
export function custodianParts(){return [
  {name:'torso',mesh:merge(box(-10,10,-15,15,58,130),box(-6,6,-6,6,130,138)),tint:[.095,.11,.075]},
  {name:'head',mesh:box(-12,14,-13,13,137,174),tint:[.19,.20,.14]},
  {name:'arm_L',mesh:box(-6,6,-27,-17,30,128),tint:[.075,.085,.057]},
  {name:'arm_R',mesh:box(-6,6,17,27,30,128),tint:[.075,.085,.057]},
  {name:'leg_L',mesh:merge(box(-7,7,-14,-4,7,61),box(-8,19,-15,-3,0,10)),tint:[.055,.062,.045]},
  {name:'leg_R',mesh:merge(box(-7,7,4,14,7,61),box(-8,19,3,15,0,10)),tint:[.055,.062,.045]},
  {name:'eyes',mesh:merge(box(14,16,-9,-5,155,158),box(14,16,5,9,155,158)),tint:[.95,.95,.78],additive:true}
];}
export function writeModel(dir,name,parts,min,max){
  const file=path.join(dir,name+'.mdx');
  buildModel({name,extents:{min,max,radius:Math.hypot(...max.map((v,i)=>Math.max(Math.abs(v),Math.abs(min[i]))))},geosets:parts,outFile:file});
  const m=new Model();m.load(new Uint8Array(fs.readFileSync(file)));
  // Store colour in explicitly decoded BLP pixels, not static-tint channel
  // conversions on which the MDL helper and independent renderer disagree.
  // White geoset tint is order-independent; each geoset has its own material.
  m.textures=parts.map((part,i)=>{
    const rgb=part.tint.map(v=>Math.round(v*255));
    const filename='colour-'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('')+'.blp';
    const pixels=Buffer.alloc(64*64*3);for(let p=0;p<64*64;p++)for(let c=0;c<3;c++)pixels[p*3+c]=rgb[c];
    fs.writeFileSync(path.join(dir,filename),encodeBLP(64,64,pixels));
    const texture=new Texture();texture.path='war3mapImported\\'+filename;texture.replaceableId=0;
    for(const layer of m.materials[m.geosets[i].materialId].layers)layer.textureId=i;
    return texture;
  });
  m.geosetAnimations.forEach(g=>{g.flags|=2;g.color.set([1,1,1]);});
  if(name==='Custodian')rigCustodian(m);
  // No second war3-model parse/generate path. The final writer retains the
  // explicit static-colour flag; neutral white tint has no channel ambiguity.
  const bytes=m.saveMdx();fs.writeFileSync(file,bytes);
  const reread=new Model();reread.load(bytes);const checked=sanity(reread);
  if(checked.errors||checked.severe)throw Error(name+': final MDX sanity failure '+JSON.stringify(checked.nodes));
  if(reread.geosetAnimations.some(g=>!(g.flags&2)))throw Error(name+': missing final colour-enable bit');
  return reread;
}
