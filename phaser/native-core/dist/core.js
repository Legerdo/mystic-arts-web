// Original game CPU, without Wine or guest graphics/audio drivers.
// Only platform boundaries are adapted. Unimplemented imports are fatal.
export class NativeCore {
  constructor(uc,exe,assets){
    this.uc=uc;this.e=new uc.Unicorn(uc.ARCH_X86,uc.MODE_32);this.assets=assets;
    this.size=32*1024*1024;this.ptr=uc._malloc(this.size);this.handle=uc.getValue(this.e.handle_ptr,'*');
    if(uc._uc_mem_map_ptr(this.handle,4096n,BigInt(this.size-4096),uc.PROT_ALL,this.ptr+4096))throw Error('Guest RAM mapping failed');
    this.heapTop=0x900000;this.hooks=[];this.commands=[];this.surfaces=new Map();this.time=0;this.input=0;this.trace=[];this.files=new Map();this.nextFile=1;
    this.ram.fill(0);this.loadPE(exe);this.install();
    this.w32(0x4e24b8,1);this.surface(256,640,480);this.surface(257,640,480);
    // Platform initialization normally sets the virtual installation's save path
    // and DirectDraw dimensions before sub_458710; retain the original values.
    this.putstr(0x512f40,'savedata');this.w32(0x520a70,0x4cf0c8);
    for(const a of [0x4e24cc,0x5216ec,0x521b6c])this.w32(a,640);
    for(const a of [0x4e24d0,0x5216f0,0x521b70])this.w32(a,480);
    this.w32(0x4eec28,3);this.call(0x4672e2,[0]);
  }
  refresh(){const b=this.uc.gameHeap.buffer;if(this.cachedBuffer!==b){this.cachedBuffer=b;this.cachedRam=new Uint8Array(b,this.ptr,this.size);this.cachedView=new DataView(b,this.ptr,this.size);}}
  get ram(){this.refresh();return this.cachedRam;}
  get view(){this.refresh();return this.cachedView;}
  r32(a){return this.view.getUint32(a,true);} i32(a){return this.view.getInt32(a,true);} w32(a,v){this.view.setUint32(a,v>>>0,true);}
  str(a){let end=a;while(this.ram[end]&&end<a+4096)end++;return new TextDecoder('windows-1252').decode(this.ram.subarray(a,end));}
  putstr(a,s){const b=new TextEncoder().encode(s);this.ram.set(b,a);this.ram[a+b.length]=0;return a;}
  alloc(n){n=(n+15)&~15;this.allocations??=new Map();this.freeBlocks??=[];const i=this.freeBlocks.findIndex(b=>b.size>=n);let p,size=n;if(i>=0){const b=this.freeBlocks.splice(i,1)[0];p=b.p;size=b.size;}else{p=this.heapTop;this.heapTop+=n;if(this.heapTop>=0x1d00000)throw Error('Guest heap exhausted');}this.allocations.set(p,size);this.ram.fill(0,p,p+size);return p;}
  free(p){if(!p)return 1;const size=this.allocations.get(p);if(!size)return 0;this.allocations.delete(p);this.freeBlocks.push({p,size});return 1;}
  loadPE(exe){
    const v=new DataView(exe.buffer,exe.byteOffset,exe.byteLength),pe=v.getUint32(60,true),op=pe+24,base=v.getUint32(op+28,true);
    const sections=op+v.getUint16(pe+20,true);this.ram.set(exe.subarray(0,v.getUint32(op+60,true)),base);
    for(let i=0;i<v.getUint16(pe+6,true);i++){const p=sections+i*40;this.ram.set(exe.subarray(v.getUint32(p+20,true),v.getUint32(p+20,true)+v.getUint32(p+16,true)),base+v.getUint32(p+12,true));}
    this.imports=[];
    for(let desc=base+v.getUint32(op+104,true);this.r32(desc+12);desc+=20){
      const dll=this.str(base+this.r32(desc+12)),thunk=base+(this.r32(desc)||this.r32(desc+16)),iat=base+this.r32(desc+16);
      for(let i=0;this.r32(thunk+i*4);i++){const value=this.r32(thunk+i*4),name=value&0x80000000?'#'+(value&65535):this.str(base+value+2),address=0x700000+this.imports.length*16;
        this.w32(iat+i*4,address);this.imports.push({dll,name,address});this.ram[address]=0xc3;}
    }
  }
  hook(address,name,fn,pop=0){
    this.hooks.push(this.e.hook_add(this.uc.HOOK_CODE,()=>{
      const sp=this.e.reg_read_i32(this.uc.X86_REG_ESP)>>>0,args=Array.from({length:12},(_,i)=>this.r32(sp+4+i*4));
      this.trace.push(name);if(this.trace.length>32)this.trace.shift();
      const result=fn(...args);this.e.reg_write_i32(this.uc.X86_REG_EAX,(result??0)|0);
      this.e.reg_write_i32(this.uc.X86_REG_ESP,(sp+4+pop)|0);this.e.reg_write_i32(this.uc.X86_REG_EIP,this.r32(sp)|0);
    },{},address,address));
  }
  call(address,args=[]){
    const sp=0x1f00000-4*(args.length+1);this.w32(sp,0x1000);args.forEach((v,i)=>this.w32(sp+4+i*4,v));
    this.e.reg_write_i32(this.uc.X86_REG_ESP,sp);this.e.reg_write_i32(this.uc.X86_REG_EBP,0);
    // Unicorn.js 2.1.4's per-instruction count instrumentation crashes while
    // translating long original initialization blocks. Normal execution uses
    // count=0; browser execution must live in a terminable Worker.
    try{this.e.emu_start(address,0x1000,0,0);}catch(e){throw Error(`${e}; EIP=${(this.e.reg_read_i32(this.uc.X86_REG_EIP)>>>0).toString(16)}; trace=${this.trace.join(',')}`);}
    if((this.e.reg_read_i32(this.uc.X86_REG_EIP)>>>0)!==0x1000)throw Error('Guest instruction limit reached');
    return this.e.reg_read_i32(this.uc.X86_REG_EAX)>>>0;
  }
  surface(id,w,h,name=null,key=0){
    const p=this.alloc(128);this.w32(0x5212c0+id*4,p);this.w32(p+12,w);this.w32(p+16,h);this.w32(p+40,1);this.w32(p+48,w);this.w32(p+52,h);this.w32(p+56,1);this.w32(p+44,1);
    this.w32(p+20,8);this.w32(p+24,key);this.surfaces.set(id,{id,w,h,name,p});this.commands.push({op:'surface',id,w,h,name,key});return 1;
  }
  image(id,path,flags,offset,key){const name=this.str(path).split(/[\\/]/).at(-1).toLowerCase().replace(/\.cnx$/,'');const s=this.assets.graphics.sheets[name];if(!s)throw Error('Missing CNX '+name);this.surface(id,s.width,s.height,name);this.w32(this.r32(0x5212c0+4*id)+24,key);this.commands.at(-1).offset=offset;this.commands.at(-1).key=key;
    for(let i=0;i<Math.min(s.paletteColors,256-offset);i++){const hex=s.paletteBGRA.slice(i*8,i*8+8),b=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),r=parseInt(hex.slice(4,6),16);this.w32(0x4e1690+4*(offset+i),r|(g<<8)|(b<<16)|0x5000000);}return 1;}
  rect(a){return a?Array.from({length:4},(_,i)=>this.i32(a+i*4)):null;}
  blt(source,r,destination,dr,flags){
    const s=this.surfaces.get(source),d=this.surfaces.get(destination);
    if(!s||!d||source>=256||destination>=258){this.w32(0x4e24c4,134217729);return 0;}
    if(r&&(r[0]<0||r[1]<0||r[0]+r[2]>s.w||r[1]+r[3]>s.h)){this.w32(0x4e24c4,134217730);return 0;}
    let clip=null;if(destination===257){clip=this.rect(this.r32(0x520a70)+16*((flags>>>12)&15));if(clip[0]===clip[2]||clip[1]===clip[3])clip=null;}
    this.commands.push({op:'blt',source,sr:r,destination,dr,flags,clip});this.w32(0x4e24c4,0);return 1;
  }
  install(){
    const api={
      // The web host owns the game surface; native window destruction ends
      // this game session after its current call and queued effects complete.
      DestroyWindow:[4,()=>{this.exitRequested=true;return 1;}],
      CreateDirectoryA:[8,p=>{const name=this.str(p).replaceAll('\\','/').toLowerCase();this.directories??=new Set(Object.keys(this.assets.files).map(n=>n.slice(0,n.lastIndexOf('/'))));if(this.directories.has(name)){this.lastError=183;return 0;}this.directories.add(name);return 1;}],
      GetLastError:[0,()=>this.lastError??0],
      // This runtime has no Windows registry. Report a missing key so the
      // original application's documented default-selection path executes.
      RegOpenKeyExA:[20,(_root,_path,_options,_access,out)=>{if(out)this.w32(out,0);return 2;}],
      GlobalAlloc:[8,(_flags,n)=>this.alloc(n)],GlobalLock:[4,p=>this.allocations.has(p)?p:0],
      GlobalUnlock:[4,()=>0],GlobalFree:[4,p=>this.free(p)?0:p],
      GetProcessHeap:[0,()=>1],HeapAlloc:[12,(_h,_flags,n)=>this.alloc(n)],HeapFree:[12,(_h,_flags,p)=>this.free(p)],
      DirectSoundCreate:[12,(_guid,out)=>{this.w32(out,this.createDirectSound());return 0;}],
      lstrcpyA:[8,(d,s)=>this.putstr(d,this.str(s))],lstrcatA:[8,(d,s)=>this.putstr(d,this.str(d)+this.str(s))],lstrlenA:[4,s=>this.str(s).length],
      timeGetTime:[0,()=>this.time],GetTickCount:[0,()=>this.time],OutputDebugStringA:[4,p=>{this.commands.push({op:'debug',text:this.str(p)});}],
      GetSystemTime:[4,p=>this.systemTime(p,true)],GetLocalTime:[4,p=>this.systemTime(p,false)],
      wsprintfA:[0,(p,f,...args)=>{let i=0;const s=this.str(f).replace(/%0?(\d*)[dsx]/g,(m,w)=>{const n=args[i++];return (m.endsWith('s')?this.str(n):m.endsWith('x')?n.toString(16):String(n|0)).padStart(+w||0,'0');});this.putstr(p,s);return s.length;}],
      CreateFileA:[28,(p,access,share,security,creation)=>{const name=this.str(p).replaceAll('\\','/').toLowerCase(),data=this.assets.files[name];if(!data&&creation===3)return -1;const id=this.nextFile++;this.files.set(id,{name,data:creation===2?new Uint8Array():data?.slice()??new Uint8Array(),position:0,writable:!!(access&0x40000000)});return id;}],
      GetFileSize:[8,h=>this.files.get(h)?.data.length??0xffffffff],
      ReadFile:[20,(h,d,n,count)=>{const f=this.files.get(h);if(!f)return 0;const b=f.data.subarray(f.position,f.position+n);this.ram.set(b,d);f.position+=b.length;if(f.name==='savedata/mystic0.dat')this.saveReadBytes=(this.saveReadBytes??0)+b.length;if(count)this.w32(count,b.length);return 1;}],
      WriteFile:[20,(h,d,n,count)=>{const f=this.files.get(h);if(!f||!f.writable)return 0;const b=new Uint8Array(Math.max(f.data.length,f.position+n));b.set(f.data);b.set(this.ram.subarray(d,d+n),f.position);f.data=b;f.position+=n;if(count)this.w32(count,n);return 1;}],
      CloseHandle:[4,h=>{const f=this.files.get(h);if(!f)return 0;if(f.writable){this.assets.files[f.name]=f.data;this.commands.push({op:'save',name:f.name,data:Array.from(f.data)});}this.files.delete(h);return 1;}],
      SetFilePointer:[16,(h,offset,high,method)=>{const f=this.files.get(h);if(!f)return -1;f.position=(method===0?0:method===1?f.position:f.data.length)+(offset|0);return f.position;}],
    };
    for(const {address,name,dll} of this.imports){const def=api[name];this.hook(address,dll+'!'+name,def?def[1]:()=>{throw Error('Unsupported import '+dll+'!'+name);},def?.[0]??0);}
    this.hook(0x418f90,'CreateSurface',(id,w,h,_flags,key)=>this.surface(id,w,h,null,key));
    this.hook(0x41a276,'LoadCNX',(...args)=>this.image(...args));
    this.hook(0x419619,'ReleaseSurface',id=>{this.w32(0x5212c0+4*id,0);this.surfaces.delete(id);this.commands.push({op:'release',id});return 1;});
    this.hook(0x41cc37,'Present',()=>{this.commands.push({op:'present'});return 1;});
    this.hook(0x41cd6c,'PresentRect',(sr,dr)=>{this.commands.push({op:'blt',source:257,destination:256,sr:this.rect(sr),dr:this.rect(dr),flags:0});return 1;});
    this.hook(0x41c6a4,'Blt',(source,sr,destination,dr,flags)=>this.blt(source,this.rect(sr),destination,this.rect(dr),flags));
    this.hook(0x41c47f,'Fill',(id,r,color)=>{this.commands.push({op:'fill',id,rect:this.rect(r),color});return 1;});
    this.hook(0x4199fe,'ColorKey',(id,key)=>{this.w32(this.r32(0x5212c0+4*id)+24,key);this.commands.push({op:'key',id,key});return 1;});
    this.hook(0x41f63f,'PollInput',()=>0);this.hook(0x420012,'InputBits',()=>this.input);
    this.hook(0x46a2da,'LoadMIDI',(id,path,index)=>{this.commands.push({op:'loadMidi',id,index});return 1;});
    this.hook(0x46ac2f,'StopMIDI',()=>{this.commands.push({op:'midiStop'});return 0;});
    this.hook(0x46a50c,'PlayMIDI',id=>{this.commands.push({op:'midi',id});return 0;});
    this.hook(0x46aaa6,'MIDIVolume',volume=>{this.commands.push({op:'midiVolume',volume});return 0;});
    // Original drawing/debug output is handled by the frontend, never an OS.
    this.hook(0x470b49,'DebugNumber',(x,y,value)=>{this.commands.push({op:'debugNumber',x,y,value});return 0;});
    this.hook(0x470b7c,'DebugNumber2',(x,y,value)=>{this.commands.push({op:'debugNumber',x,y,value});return 0;});
    // 0x470BAF is an empty RET in the shipped EXE. Let the original no-op run;
    // it must not invent frontend commands absent from the original program.
  }
  createDirectSound(){
    if(!this.dsTable){
      this.dsBuffers=new Map();this.virtualNext=0x710000;
      const table=(count,methods)=>{const p=this.alloc(count*4);for(let i=0;i<count;i++){const address=this.virtualNext;this.virtualNext+=16;const def=methods[i];this.ram[address]=0xc3;this.w32(p+4*i,address);this.hook(address,'DirectSound.'+i,def?def[1]:()=>{throw Error('Unsupported DirectSound method '+i);},def?def[0]*4:0);}return p;};
      const buffer=p=>{const b=this.dsBuffers.get(p);if(!b)throw Error('Unknown sound buffer');return b;};
      const event=(p,op,fields={})=>{this.commands.push({op,id:p,...fields});return 0;};
      this.bufferTable=table(21,{
        1:[1,()=>2],2:[1,p=>{const b=buffer(p);event(p,'dsRelease');this.free(b.data);this.free(p);this.dsBuffers.delete(p);return 0;}],
        6:[2,(p,out)=>{this.w32(out,buffer(p).volume);return 0;}],7:[2,(p,out)=>{this.w32(out,buffer(p).pan);return 0;}],8:[2,(p,out)=>{this.w32(out,buffer(p).rate);return 0;}],
        9:[2,(p,out)=>{const b=buffer(p);if(b.playing&&!b.loop&&this.time-b.started>=b.bytes/b.align/b.rate*1000)b.playing=false;this.w32(out,b.playing?1:0);return 0;}],
        11:[8,(p,offset,n,ptr1,len1,ptr2,len2)=>{const b=buffer(p);if(offset+n>b.bytes)throw Error('DS lock range');this.w32(ptr1,b.data+offset);this.w32(len1,n);if(ptr2)this.w32(ptr2,0);if(len2)this.w32(len2,0);return 0;}],
        12:[4,(p,_r1,_r2,flags)=>{const b=buffer(p);b.playing=true;b.loop=!!(flags&1);b.started=this.time;return event(p,'dsPlay',{loop:b.loop,position:b.position??0});}],
        13:[2,(p,position)=>{buffer(p).position=position;return event(p,'dsPosition',{position});}],
        15:[2,(p,volume)=>{buffer(p).volume=volume|0;return event(p,'dsVolume',{volume:volume|0});}],
        16:[2,(p,pan)=>{buffer(p).pan=pan|0;return event(p,'dsPan',{pan:pan|0});}],
        17:[2,(p,rate)=>{buffer(p).rate=rate;return event(p,'dsRate',{rate});}],
        18:[1,p=>{buffer(p).playing=false;return event(p,'dsStop');}],
        19:[5,p=>{const b=buffer(p);return event(p,'dsData',{format:{rate:b.rate,channels:b.channels,bits:b.bits,align:b.align},data:this.ram.slice(b.data,b.data+b.bytes)});}],
        20:[1,()=>0]
      });
      this.dsTable=table(11,{
        1:[1,()=>2],2:[1,()=>0],
        3:[4,(_self,desc,out)=>{const f=this.r32(desc+16),bytes=this.r32(desc+8);if(!f)throw Error('Primary sound buffer unsupported');const p=this.alloc(16),data=this.alloc(bytes);this.w32(p,this.bufferTable);const b={data,bytes,rate:this.r32(f+4),channels:this.view.getUint16(f+2,true),bits:this.view.getUint16(f+14,true),align:this.view.getUint16(f+12,true),volume:0,pan:0,playing:false};this.dsBuffers.set(p,b);this.w32(out,p);return 0;}],
        6:[3,(_self,_hwnd,level)=>{if(level<1||level>4)throw Error('DS cooperative level');return 0;}]
      });
    }
    const p=this.alloc(8);this.w32(p,this.dsTable);return p;
  }
  systemTime(p,utc){const d=new Date(),g=n=>d[(utc?'getUTC':'get')+n]();[g('FullYear'),g('Month')+1,g('Day'),g('Date'),g('Hours'),g('Minutes'),g('Seconds'),g('Milliseconds')].forEach((v,i)=>this.view.setUint16(p+2*i,v,true));return 0;}
  entityCount(){let count=0;for(let group=0;group<6;group++){const end=0x6553ac+1240*group;for(let p=this.r32(0x655148+1240*group);p!==end;p=this.r32(p+8)){if(!p||++count>12000)throw Error('Invalid entity list');}}return count;}
  playerState(){const end=0x6553ac+1240;let p=this.r32(0x655148+1240),guard=0;while(p!==end){if(!p||++guard>2000)throw Error('Invalid player list');if(this.view.getUint16(p+508,true)===65535)return {x:this.i32(p+28),y:this.i32(p+32),hp:this.i32(p+536),action:this.i32(p+252),attack:this.i32(p+528)};p=this.r32(p+8);}return null;}
  entities(){const out=[];for(let group=0;group<6;group++){const end=0x6553ac+1240*group;let p=this.r32(0x655148+1240*group),guard=0;while(p!==end){if(!p||++guard>2000)throw Error('Invalid entity list');out.push({group,p,fn:this.r32(p+16),data:Array.from(new Int32Array(this.uc.gameHeap.buffer,this.ptr+p,155))});p=this.r32(p+8);}}return out;}
}
