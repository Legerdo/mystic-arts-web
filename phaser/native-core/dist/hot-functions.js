// Profile-selected native helpers. Oracle validation is required before enabling.
// Game AI, attack/skill state machines, timers and damage remain original x86.
export function installHotFunctions(c,enable=true){
 const read=p=>c.i32(p),write=(p,v)=>c.w32(p,v),trunc=Math.trunc;
 const tile=(x,y)=>{x|=0;y|=0;const width=read(0x5249c8),height=read(0x523bf0);if(x<0||x>=width*1048576||y>=height*1048576)return 8;if(y<0)return 0;
   const v=c.view,kind=v.getUint16(read(0x5251e0)+2*(width*(y>>20)+(x>>20)),true);
   return (v.getUint16(0x47f950+2*(kind>>4),true)+1)*((v.getUint16(0x47f930+2*(15-((x>>16)&15)),true)&v.getUint16(0x47f030+2*(16*(kind&15)+((y>>16)&15)),true))!==0);};
 const points=(p,player)=>player?[[0x4da548,5],[0x4da570,3],[0x4da588,4],[0x4da5a8,4]]:[0,1,2,3].map(i=>[read(p+588+i*4),read(p+604+i*4)]);
 const maxAt=(x,y,ps)=>{let m=0;for(const [a,n] of ps)for(let i=0;i<n;i++)m=Math.max(m,tile(x+read(a+8*i),y+read(a+8*i+4)));return m;};
 function move(p,player){
   const ps=points(p,player),vx=(read(p+576)+read(p+240))|0,vy=(read(p+580)+read(p+244))|0;write(p+576,0);write(p+580,0);
   let count=(Math.max(Math.abs(vx),Math.abs(vy))>>16)+1;if(!player&&!(count&1))count++;
   const startX=read(p+28),startY=read(p+32),threshold=maxAt(startX,startY,ps);let dx=0,dy=0,flags=0;
   for(let i=1;i<=count;i+=player?1:2){
     let x=((dx<<16)+trunc(Math.imul(i,vx)/count)+startX)|0,y=((dy<<16)+trunc(Math.imul(i,vy)/count)+startY)|0;
     const resolve=(side,axis,sign,bit,ground=false)=>{const [a,n]=ps[side];for(let k=0;k<n;k++)while(ground?tile(x+read(a+8*k),y+read(a+8*k+4))>threshold:tile(x+read(a+8*k),y+read(a+8*k+4))===8){if(axis){x=(x+sign*65536)|0;dx+=sign;}else{y=(y+sign*65536)|0;dy+=sign;}flags|=bit;}};
     resolve(0,false,-1,1,vy>=0);if(vy<0)resolve(1,false,1,2);resolve(3,true,-1,4);resolve(2,true,1,8);
   }
   let x=(startX+(dx<<16)+vx)|0,y=(startY+(dy<<16)+vy)|0;
   if(player&&vy>0&&!(flags&1)){let n=0,yy=y;for(;n<7&&maxAt(x,yy,ps)<=threshold;n++)yy+=65536;if(n!==7)y+=(n-1)<<16;}
   write(p+28,x);write(p+32,y);const after=maxAt(x,y,ps),[bottom,n]=ps[0];let close=0,below=0;
   for(let i=0;i<n;i++){const px=x+read(bottom+8*i),py=y+read(bottom+8*i+4);below=Math.max(below,tile(px,py+65536));for(let k=0;k<7;k+=player?1:2)close=Math.max(close,tile(px,py+(k<<16)));}
   if(below<=after)flags|=16;if(close<=after)flags|=32;return flags;
 }
 function walk(x,y,direction,distance,offset,findPlayer){
   x|=0;y|=0;direction|=0;distance|=0;offset|=0;let target;
   if(findPlayer){let p=read(0x655148+1240),end=0x6553ac+1240;while(p!==end&&c.view.getUint16(p+508,true)!==65535)p=read(p+8);if(p===end)return -1;const r=read(p+512),tx=(read(p+28)>>16)+read(r+32),ty=(read(p+32)>>16)+read(r+36);target=[tx,ty,tx+read(r+40),ty+read(r+44)];}
   for(let i=0;i<32&&tile(x,y)===0;i++)y=(y+65536)|0;
   for(let i=0;i<distance;i+=2){const solid=tile(x,y)!==0;let j=0;for(;j<8;j++){const yy=y+(solid?-1:1)*(j<<16);if(solid?tile(x,yy)===0:tile(x,yy)!==0){y=yy|0;break;}}
     if(j===8)return findPlayer?-1:solid?-1:1;
     x=(x+(direction<<(findPlayer?17:16)))|0;
     if(target){const left=(x>>16)-2,top=(y>>16)-4-offset,right=left+4,bottom=(y>>16)-offset;
       // 0x401B6B compares unsigned endpoints inclusively, including touching edges.
       const overlap=(a,b,c,d)=>{a>>>=0;b>>>=0;c>>>=0;d>>>=0;return(a>=c&&a<=d)||(b>=c&&b<=d)||(c>=a&&c<=b)||(d>=a&&d<=b);};
       if(overlap(target[0],target[2],left,right)&&overlap(target[1],target[3],top,bottom))return i;}
   }return findPlayer?-1:0;
 }
 function direction(face,bits){if((bits&3)===3||(bits&12)===12)return 0;const i=+(!!(bits&4))+2*(!!(bits&1))+4*(!!(bits&8))+8*(!!(bits&2));return face<0?[0,8,6,9,2,0,3,0,4,7,0,0,1,0,0,0][i]:face>0?[0,8,4,7,2,0,1,0,6,9,0,0,3,0,0,0][i]:0;}
 function command(face){face|=0;const latest=(read(0x513c40)-1)&127;let n=0,matched=0;
   while(n<16&&!matched){let p=latest,part=0,used=0;const base=0x4da5c8+360*n;if(read(base)===999)break;let i=0;
     for(;direction(face,read(0x513a40+4*p))===0&&i<15&&used<128;i++){p=(p-1)&127;used++;}if(i>=15||used>=128)break;
     let errors=0;while(used<128){const d=direction(face,read(0x513a40+4*p));p=(p-1)&127;
       if(d===read(base+4*part)){const limit=read(base+4*part+4);let j=0;for(;direction(face,read(0x513a40+4*p))===d&&j<limit&&used<128;j++){p=(p-1)&127;used++;}if(j>=limit||used>=128)break;part+=2;if(read(base+part*4)===99){matched=1;break;}}
       else if(++errors>(n?8:16))break;used++;
     }n++;
   }return matched?n:0;
 }
 function dirty(){const page=read(0x5231e8),ram=c.ram;for(let y=0;y<30;y++)for(let x=0;x<40;x++)if(ram[0x523200+page*1271+y*41+x]){const left=x;let n=0;while(x<40&&ram[0x523200+page*1271+y*41+x]){ram[0x523200+page*1271+y*41+x]=0;n++;x++;}const rect=[left*16,y*16,n*16,16];c.blt(255,rect,257,rect,0);}write(0x5231e8,page^1);return 30;}
 function mark(p){const x=read(p)>>4,y=read(p+4)>>4,w=Math.abs((read(p+8)>>4)-x),h=Math.abs((read(p+12)>>4)-y),page=read(0x5231e8),ram=c.ram;let result=h;
   for(let i=0;i<=h;i++){result=i+y;if((result>>>0)<=29){for(let j=0;j<=w;j++)if(((j+x)>>>0)<40)ram[0x523200+1271*page+41*(i+y)+j+x]=1;result=w+1;}}return result;}
 const entries=[[0x402f11,'EntityCollision',p=>move(p,false)],[0x464868,'PlayerCollision',p=>move(p,true)],
   [0x403a81,'FindPlayerTerrain',(x,y,d,n,o)=>walk(x,y,d,n,o,true)],[0x4037bf,'TerrainAhead',(x,y,d,n)=>walk(x,y,d,n,0,false)],
   [0x465129,'RecognizeCommand',command],[0x414d98,'RestoreDirtyTiles',dirty],
   [0x4035b6,'EntityTerrain',p=>maxAt(read(p+28),read(p+32),points(p,false))],[0x414f80,'MarkDirtyTiles',mark]];
 if(enable)for(const [address,name,fn] of entries)c.hook(address,'fast.'+name,fn);
 return {entries,tile,move,walk,command,dirty,mark};
}
