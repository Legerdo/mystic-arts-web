// Native 8-bit surface commands, preserving palette indices through composition.
// Phaser receives only the final RGBA canvas; original UI/entities draw themselves.
export class IndexedRenderer {
  constructor(images){this.images=images;this.surfaces=new Map();this.audio=[];this.presented=false;this.colors=new Uint32Array(256);}
  apply(commands){
    this.audio=[];this.presented=false;
    for(const c of commands){
      if(c.op==='surface'){
        const data=new Uint8Array(c.w*c.h);
        if(c.name){const src=this.images[c.name];if(!src||src.length!==data.length)throw Error('Missing indexed pixels '+c.name);for(let i=0;i<data.length;i++)data[i]=Math.min(255,src[i]+c.offset);}
        this.surfaces.set(c.id,{w:c.w,h:c.h,data,key:c.key??0});
      }else if(c.op==='release')this.surfaces.delete(c.id);
      else if(c.op==='key')this.surfaces.get(c.id).key=c.key;
      else if(c.op==='fill'){
        const s=this.surfaces.get(c.id);if(!s)throw Error('Fill missing surface '+c.id);const [x,y,w,h]=c.rect??[0,0,s.w,s.h];
        for(let row=Math.max(0,y);row<Math.min(s.h,y+h);row++)s.data.fill(c.color,row*s.w+Math.max(0,x),row*s.w+Math.min(s.w,x+w));
        if(c.id===256)this.presented=true;
      }else if(c.op==='blt')this.blt(c);
      else if(c.op==='present'){this.presented=true;const a=this.surfaces.get(257),b=this.surfaces.get(256);b.data.set(a.data);}
      else if(c.op.startsWith('ds')||['sound','soundVolume','midi','midiStop','midiVolume','save'].includes(c.op))this.audio.push(c);
      else if(!['debug','debugText','debugNumber','loadSounds','loadMidi'].includes(c.op))throw Error('Unknown drawing command '+c.op);
    }
  }
  blt(c){
    const a=this.surfaces.get(c.source),b=this.surfaces.get(c.destination);if(!a||!b)throw Error(`Missing blit surface ${c.source}->${c.destination}`);
    if(c.destination===256)this.presented=true;
    const [sx,sy,sw,sh]=c.sr??[0,0,a.w,a.h],[dx,dy,dw,dh]=c.dr??[0,0,b.w,b.h];
    if(sw<=0||sh<=0||dw<=0||dh<=0)return;
    const flipX=!!(c.flags&0x100),flipY=!!(c.flags&0x200),keyed=!!(c.flags&2);
    if(sx<0||sy<0||sx+sw>a.w||sy+sh>a.h)throw Error('Original blit source outside surface');
    const data=a===b?a.data.slice():a.data;
    const clip=c.clip??[0,0,b.w,b.h];
    const left=Math.max(dx,0,clip[0]),right=Math.min(dx+dw,b.w,clip[2]),top=Math.max(dy,0,clip[1]),bottom=Math.min(dy+dh,b.h,clip[3]);
    if(right<=left||bottom<=top)return;
    if(!keyed&&!flipX&&!flipY&&sw===dw&&sh===dh){for(let y=top;y<bottom;y++){const start=(sy+y-dy)*a.w+sx+left-dx;b.data.set(data.subarray(start,start+right-left),y*b.w+left);}return;}
    for(let y=top;y<bottom;y++){
      const yy=Math.floor((y-dy)*sh/dh),srcrow=(sy+(flipY?sh-1-yy:yy))*a.w;
      for(let x=left;x<right;x++){const xx=Math.floor((x-dx)*sw/dw),v=data[srcrow+sx+(flipX?sw-1-xx:xx)];if(!keyed||v!==a.key)b.data[y*b.w+x]=v;}
    }
  }
  frame(palette,buffer){const s=this.surfaces.get(256),rgba=buffer?new Uint8ClampedArray(buffer):new Uint8ClampedArray(s.data.length*4),colors=this.colors;for(let i=0;i<256;i++)colors[i]=0xff000000|palette[i*4]|palette[i*4+1]<<8|palette[i*4+2]<<16;const out=new Uint32Array(rgba.buffer);for(let i=0;i<out.length;i++)out[i]=colors[s.data[i]];return rgba;}
}
