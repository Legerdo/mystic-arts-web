import fs from 'node:fs';import M from './unicorn-adapter.cjs';import {NativeCore} from './core.mjs';import {installHotFunctions} from './hot-functions.mjs';
import {IndexedRenderer} from './renderer.mjs';import {createHash} from 'node:crypto';
const base=new URL('./dist/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets.json',base)));
const files=Object.fromEntries(Object.entries(manifest.files).map(([k,v])=>[k,fs.readFileSync(new URL(v,base))]));
const images=Object.fromEntries(Object.entries(manifest.images).map(([k,v])=>[k,fs.readFileSync(new URL(v,base))]));
const make=async(round=1)=>{const c=new NativeCore(await M(),files['mystic.exe'],{files:{...files},graphics:manifest.graphics});c.call(0x458710);c.w32(0x51a460,round);c.call(0x458b3a);c.call(0x458bc4);return c;};
const dispose=c=>{for(const h of c.hooks)c.e.hook_del(h);c.e.close();c.uc._free(c.ptr);};
const c=await make(),f=installHotFunctions(c,false),report={scope:'helper return/state, all original game data RAM, drawing/audio commands and indexed pixels; deterministic round fixtures, not campaign completion',cases:[],worldFrames:0,rounds:[],sha256:Object.fromEntries(['core.mjs','hot-functions.mjs','renderer.mjs','unicorn-adapter.cjs'].map(name=>[name,createHash('sha256').update(fs.readFileSync(new URL(name,import.meta.url))).digest('hex')]))};let seed=14981;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
try{
 for(let tick=0;tick<180;tick++){
  c.time=tick*16;c.input=tick%20<10?0x102:0x201;c.commands=[];c.call(0x458976,[0]);
  if(tick<80||tick%5)continue;
  for(const e of c.entities().filter(e=>e.group===1||e.group===2)){
   const [address,name,fn]=f.entries[e.group===1?1:0],before=c.ram.slice(e.p,e.p+620),expected=c.call(address,[e.p]),after=c.ram.slice(e.p,e.p+620);c.ram.set(before,e.p);const actual=fn(e.p);
   if((actual>>>0)!==expected||Buffer.compare(c.ram.subarray(e.p,e.p+620),after))throw Error('Collision mismatch '+name+' tick '+tick);c.ram.set(before,e.p);report.cases.push(name);
  }
  for(const entry of f.entries.slice(2,4)){const [address,name,fn]=entry,args=[c.entities().find(e=>e.group===1).data[7]+32*65536,420*65536,rand(2)?1:-1,[40,112,320][rand(3)],16];const a=c.call(address,args),b=fn(...args)>>>0;if(a!==b)throw Error(`${name} expected ${a} actual ${b}`);report.cases.push(name);}
 }
 for(let i=0;i<128;i++){for(let k=0;k<128;k++)c.w32(0x513a40+k*4,rand(1024));c.w32(0x513c40,rand(128));const face=i%3-1,a=c.call(0x465129,[face]),b=f.command(face);if(a!==(b>>>0))throw Error('Command mismatch');report.cases.push('RecognizeCommand');}
 const actor=c.entities().find(e=>e.group===2).p;const saved=c.ram.slice(actor,actor+620);
 for(let i=0;i<64;i++){c.w32(actor+28,(rand(700)-30)*65536);c.w32(actor+32,(rand(520)-20)*65536);const a=c.call(0x4035b6,[actor]),b=f.entries[6][2](actor);if(a!==(b>>>0))throw Error('Entity terrain mismatch');report.cases.push('EntityTerrain');}c.ram.set(saved,actor);
 const rect=c.alloc(16);
 for(let i=0;i<64;i++){for(let n=0;n<4;n++)c.w32(rect+n*4,rand(800)-80);const before=c.ram.slice(0x523200,0x523200+2542),a=c.call(0x414f80,[rect]),expected=c.ram.slice(0x523200,0x523200+2542);c.ram.set(before,0x523200);const b=f.mark(rect);if(a!==(b>>>0)||Buffer.compare(expected,c.ram.subarray(0x523200,0x523200+2542)))throw Error('Dirty mark mismatch');report.cases.push('MarkDirtyTiles');}
 dispose(c);
 for(let round=1;round<=17;round++){
  const original=await make(round),fast=await make(round);fast.ram.set(original.ram);installHotFunctions(fast);
  const renderers=[new IndexedRenderer(images),new IndexedRenderer(images)];renderers[0].apply(original.commands);renderers[1].apply(fast.commands);
  try{for(let i=0;i<600;i++){
   for(const c of [original,fast]){c.time=i*16;c.input=i%40<18?0x150|2:i%60<15?0x220|1:0;c.commands=[];c.call(0x458976,[0]);}
   for(const [lo,hi] of [[0x4d0000,0x658000],[0x900000,original.heapTop]]){
    const a=original.ram.subarray(lo,hi),b=fast.ram.subarray(lo,hi);if(Buffer.compare(a,b)){let n=0;while(a[n]===b[n])n++;throw Error(`World mismatch round ${round} frame ${i} at ${(n+lo).toString(16)}: ${a[n]} vs ${b[n]}`);}
   }
   if(JSON.stringify(original.commands)!==JSON.stringify(fast.commands)){report.commandMismatch={round,frame:i,original:original.commands,fast:fast.commands};throw Error(`Command mismatch round ${round} frame ${i}`);}
   renderers[0].apply(original.commands);renderers[1].apply(fast.commands);
   if(Buffer.compare(renderers[0].surfaces.get(256).data,renderers[1].surfaces.get(256).data))throw Error(`Pixel mismatch round ${round} frame ${i}`);
   report.worldFrames++;
  }report.rounds.push({round,frames:600,pass:true});console.log('Round '+round+': 600 frames matched');}
  finally{dispose(original);dispose(fast);}
 }
 report.pass=true;
}catch(e){report.error=String(e);process.exitCode=1;}
fs.writeFileSync(new URL(process.argv[2]??'hot-validation-01.json',import.meta.url),JSON.stringify(report,null,2),{flag:'wx'});console.log({pass:report.pass,cases:report.cases.length,worldFrames:report.worldFrames,error:report.error});
