import M from './unicorn.js';import {NativeCore} from './core.mjs';import {IndexedRenderer} from './renderer.mjs';
import {installHotFunctions} from './hot-functions.mjs';
let core,renderer,running=false,start=0,last=0,lag=0,skipCount=1,logical=0,ticks=0;
let metrics=null;
const frameBuffers=[];
const bytes=async url=>{const r=await fetch(url);if(!r.ok)throw Error('Asset HTTP '+r.status+' '+url);return new Uint8Array(await r.arrayBuffer());};
async function boot(save){
  const manifest=await (await fetch('./assets.json')).json();
  const files=Object.fromEntries(await Promise.all(Object.entries(manifest.files).map(async([k,v])=>[k,await bytes(v)])));
  const images=Object.fromEntries(await Promise.all(Object.entries(manifest.images).map(async([k,v])=>[k,await bytes(v)])));
  if(save){const b=Uint8Array.from(save),v=new DataView(b.buffer);if(b.length!==20||v.getUint32(0,true)!==20)throw Error('Invalid original save data');files['savedata/mystic0.dat']=b;}
  core=new NativeCore(await M(),files['mystic.exe'],{files,graphics:manifest.graphics});renderer=new IndexedRenderer(images);
  installHotFunctions(core);
  core.call(0x458710);renderer.apply(core.commands);dispatch();core.commands=[];
  start=performance.now();last=0;running=true;postMessage({type:'ready',hadSave:!!save,savedRoundMask:core.r32(0x51a434),saveReadBytes:core.saveReadBytes??0});pump();
}
function dispatch(){
  for(const command of renderer.audio)postMessage({type:'effect',command});
  if(renderer.presented){
    const rgba=renderer.frame(core.ram.subarray(0x4e1690,0x4e1690+1024),frameBuffers.pop());
    const state={ticks,stage:core.r32(0x51a460),mode:core.r32(0x51a450),pause:core.r32(0x51a42c),entities:core.entityCount(),player:core.playerState(),shake:[core.i32(0x5231e4),core.i32(0x5231e0)]};
    postMessage({type:'frame',rgba,state},[rgba.buffer]);
  }
}
function pump(){
  if(!running)return;
  try{
    const now=Math.floor(performance.now()-start);
    if((now+lag-last)>>>0>=16){
      lag+=now-last-16;logical+=16;let skip;
      if((lag>>>0)<=16||skipCount>=core.r32(0x4dccc8)){logical+=lag;lag%=16;skip=0;skipCount=1;}else{skip=1;skipCount++;}
      core.time=now;core.w32(0x511204,now);core.w32(0x511578,logical);core.w32(0x512b04,lag);core.w32(0x4dd178,skipCount);
      const begin=performance.now();core.commands=[];core.call(0x458976,[skip]);ticks++;const cpuEnd=performance.now();
      if(!skip)logical=0;last=now;renderer.apply(core.commands);dispatch();
      if(core.exitRequested){running=false;postMessage({type:'exit'});return;}
      if(metrics)metrics.push({time:now,cpuMs:cpuEnd-begin,renderMs:performance.now()-cpuEnd,skip,stage:core.r32(0x51a460),mode:core.r32(0x51a450),entities:core.entityCount(),player:core.playerState(),shake:[core.i32(0x5231e4),core.i32(0x5231e0)]});
    }
    setTimeout(pump,Math.max(0,16-(Math.floor(performance.now()-start)+lag-last)));
  }catch(e){running=false;postMessage({type:'error',error:String(e?.stack??e),state:core&&{stage:core.r32(0x51a460),mode:core.r32(0x51a450),trace:core.trace}});}
}
onmessage=event=>{const m=event.data;if(m.type==='boot')boot(m.save).catch(e=>postMessage({type:'error',error:String(e?.stack??e)}));else if(m.type==='input'&&core)core.input=m.bits;else if(m.type==='recycle'){if(frameBuffers.length<3)frameBuffers.push(m.buffer);}else if(m.type==='measureStart')metrics=[];else if(m.type==='measureEnd'){postMessage({type:'metrics',samples:metrics});metrics=null;}};
