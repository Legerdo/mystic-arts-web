const $=s=>document.querySelector(s),SAVE='mystic.phaser.native.save.v1';
let worker,game,texture,scene,held=0,synth,context,master,music=[],musicFlags=[],muted=false,frameImage;
const voices=new Map(),keys=new Set();let midiVolume=127;
const state={ready:false,error:null,frames:0,game:null,sounds:0,midi:0,saves:0,measurement:null};
let meter=null,previous=null;
const mapping={ArrowLeft:1,ArrowRight:2,ArrowUp:4,ArrowDown:8,KeyZ:0x150,Space:0x150,Enter:0x50,KeyC:0x100,KeyX:0x220,KeyB:0x200,Escape:0xa0,F1:0x80,F5:0x8000,F6:0x8000};
function fail(e){state.error=String(e);$('#status').textContent='실행 오류: '+e;console.error(e);worker?.terminate();}
async function audio(){
 if(context){await context.resume();return;}
 // This TinySynth version creates its own context (ignoring internalcontext
 // in constructor options). Share it with PCM so EXIT suspends all audio.
 synth=new WebAudioTinySynth({quality:1,useReverb:1,voices:64});context=synth.actx;await context.resume();
 master=context.createGain();master.gain.value=muted?0:1;master.connect(context.destination);
 synth.setMasterVol(muted?0:.4);synth.setLoop(1);
 const a=await(await fetch('./assets.json')).json();
 musicFlags=a.musicFlags;
 music=await Promise.all(Array.from({length:a.music},async(_,i)=>(await fetch(`./audio/mlk-${String(i).padStart(3,'0')}.mid`)).arrayBuffer()));
}
function effect(c){
 if(c.op.startsWith('ds')){
   let v=voices.get(c.id);if(!v){v={volume:0,pan:0,rate:0,position:0};voices.set(c.id,v);}
   const stop=()=>{if(v.source){try{v.source.stop();}catch{}v.source.disconnect();v.source=null;}v.left?.disconnect();v.right?.disconnect();v.split?.disconnect();v.merge?.disconnect();};
   const volume=()=>{if(v.left){v.left.gain.value=10**((v.volume-Math.max(0,v.pan))/2000);v.right.gain.value=10**((v.volume+Math.min(0,v.pan))/2000);}};
   if(c.op==='dsData'){
     v.format=c.format;const f=c.format,frames=c.data.length/f.align,b=context.createBuffer(f.channels,frames,f.rate),d=new DataView(c.data.buffer,c.data.byteOffset,c.data.byteLength);
     for(let ch=0;ch<f.channels;ch++){const target=b.getChannelData(ch);for(let i=0;i<frames;i++){const p=i*f.align+ch*f.bits/8;target[i]=f.bits===16?d.getInt16(p,true)/32768:(d.getUint8(p)-128)/128;}}
     v.buffer=b;v.rate=f.rate;
   }else if(c.op==='dsPlay'){
     if(!v.buffer)throw Error('Sound buffer was not filled');stop();state.sounds++;v.position=c.position;
     const s=context.createBufferSource();v.source=s;s.buffer=v.buffer;s.loop=c.loop;s.playbackRate.value=v.rate/v.format.rate;
     v.left=context.createGain();v.right=context.createGain();v.merge=context.createChannelMerger(2);
     if(v.format.channels===1){s.connect(v.left);s.connect(v.right);}else{v.split=context.createChannelSplitter(2);s.connect(v.split);v.split.connect(v.left,0);v.split.connect(v.right,1);}
     v.left.connect(v.merge,0,0);v.right.connect(v.merge,0,1);v.merge.connect(master);volume();s.start(0,c.position/v.format.align/v.format.rate);
   }else if(c.op==='dsVolume'){v.volume=c.volume;volume();}
   else if(c.op==='dsPan'){v.pan=c.pan;volume();}
   else if(c.op==='dsRate'){v.rate=c.rate;if(v.source)v.source.playbackRate.value=v.rate/v.format.rate;}
   else if(c.op==='dsPosition')v.position=c.position;
   else if(c.op==='dsStop')stop();
   else if(c.op==='dsRelease'){stop();voices.delete(c.id);}
 }else if(c.op==='midi'){if(!music[c.id])throw Error('Missing music '+c.id);synth.stopMIDI();synth.loadMIDI(music[c.id]);synth.setLoop(musicFlags[c.id]&1);synth.playMIDI();state.midi++;}
 else if(c.op==='midiStop')synth.stopMIDI();
 else if(c.op==='midiVolume'){midiVolume=c.volume;synth.setMasterVol(muted?0:.4*c.volume/127);}
 else if(c.op==='save'){if(c.name!=='savedata/mystic0.dat')throw Error('Unrecognized save slot '+c.name);localStorage.setItem(SAVE,JSON.stringify(c.data));state.saves++;}
}
function measureRendered(){
 if(!meter)return;
 const now=performance.now(),pixels=game.canvas.getContext('2d').getImageData(0,0,640,480).data,words=new Uint32Array(pixels.buffer);let changed=false;
 if(previous)for(let i=0;i<words.length;i++)if(previous[i]!==words[i]){changed=true;break;}previous=words;
 if(meter&&changed)meter.times.push(now);
 if(meter)meter.renders.push({time:now-meter.start,changed,...state.game});
 if(meter&&now-meter.start>=10000){const times=meter.times,gaps=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b);state.measurement={changedFrameFps:times.length*1000/(now-meter.start),p95Ms:gaps[Math.ceil(gaps.length*.95)-1],maxMs:gaps.at(-1),changedAtMs:times.map(t=>t-meter.start),durationMs:now-meter.start,renders:meter.renders};$('#fps').textContent=`변경 화면 ${state.measurement.changedFrameFps.toFixed(1)} FPS · p95 ${state.measurement.p95Ms?.toFixed(1)}ms · 최대 ${state.measurement.maxMs?.toFixed(1)}ms`;meter=null;worker.postMessage({type:'measureEnd'});}
}
function frame(m){
 if(frameImage)worker.postMessage({type:'recycle',buffer:frameImage.data.buffer},[frameImage.data.buffer]);
 frameImage=new ImageData(m.rgba,640,480);state.frames++;state.game=m.state;
 const text=`원본 화면 실행 중 · 라운드 ${m.state.stage} · ${m.state.pause?'일시정지':'조작 가능'}`;if($('#status').textContent!==text)$('#status').textContent=text;
}
async function exitGame(){
 worker?.terminate();worker=null;keys.clear();held=0;
 state.ready=false;$('#measure').disabled=true;meter=null;previous=null;frameImage=null;
 synth?.stopMIDI();for(const id of [...voices.keys()])effect({op:'dsRelease',id});
 if(context)await context.suspend();
 if(game){const current=game;await new Promise(resolve=>{current.events.once('destroy',resolve);current.destroy(true);});}
 game=null;scene=null;texture=null;state.game=null;state.exited=true;
 $('#fps').textContent='';$('#status').textContent='게임을 종료했습니다. 게임 실행을 누르면 다시 시작합니다.';$('#start').disabled=false;
}
$('#start').onclick=async()=>{
 Object.assign(state,{ready:false,error:null,exited:false,frames:0,game:null,sounds:0,midi:0,saves:0,measurement:null,workerSamples:null});
 $('#start').disabled=true;$('#status').textContent='원본 자료를 불러오는 중…';
 try{
  await audio();
  game=new Phaser.Game({type:Phaser.CANVAS,width:640,height:480,parent:'game',pixelArt:true,roundPixels:true,banner:false,audio:{noAudio:true},scene:{create(){scene=this;texture=this.textures.createCanvas('original',640,480);this.add.image(0,0,'original').setOrigin(0);},update(){if(frameImage){texture.context.putImageData(frameImage,0,0);texture.refresh();worker.postMessage({type:'recycle',buffer:frameImage.data.buffer},[frameImage.data.buffer]);frameImage=null;}}}});
  game.events.on('postrender',measureRendered);
  worker=new Worker('./worker.mjs',{type:'module'});worker.onerror=e=>fail(e.message);worker.onmessage=e=>{try{const m=e.data;if(m.type==='frame')frame(m);else if(m.type==='effect')effect(m.command);else if(m.type==='metrics')state.workerSamples=m.samples;else if(m.type==='ready'){state.ready=true;state.saveRead={present:m.hadSave,bytes:m.saveReadBytes,roundMask:m.savedRoundMask};$('#measure').disabled=false;}else if(m.type==='exit')exitGame().catch(fail);else if(m.type==='error')fail(m.error);}catch(e){fail(e);}};
  let save=null;const stored=localStorage.getItem(SAVE);if(stored)save=JSON.parse(stored);worker.postMessage({type:'boot',save});$('#game').focus();
 }catch(e){fail(e);}
};
$('#measure').onclick=()=>{if(meter)return;meter={start:performance.now(),times:[],renders:[]};previous=null;state.measurement=null;state.workerSamples=null;worker.postMessage({type:'measureStart'});$('#fps').textContent='10초 측정 중';$('#game').focus();};
$('#mute').onchange=e=>{muted=e.target.checked;synth?.setMasterVol(muted?0:.4*midiVolume/127);if(master)master.gain.value=muted?0:1;};
function input(){held=0;for(const key of keys)held|=mapping[key];worker?.postMessage({type:'input',bits:held});}
addEventListener('keydown',e=>{if(document.body.dataset.view!=='game'||e.target.closest('button,input,a,select'))return;if(mapping[e.code]){e.preventDefault();keys.add(e.code);input();}});
addEventListener('keyup',e=>{if(mapping[e.code]){e.preventDefault();keys.delete(e.code);input();}});
function clearInput(){keys.clear();input();}
addEventListener('blur',clearInput);
addEventListener('mystic-input-reset',clearInput);
Object.defineProperty(window,'mysticNative',{value:{snapshot:()=>structuredClone(state)}});
