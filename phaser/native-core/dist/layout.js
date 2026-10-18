const $=s=>document.querySelector(s),body=document.body;
function fitGame(){const r=$('#playfield').getBoundingClientRect(),w=Math.max(0,Math.min(r.width-2,(r.height-2)*4/3));$('#game').style.width=w+'px';$('#game').style.height=w*3/4+'px';}
$('#expand').onclick=()=>{const expanded=body.dataset.expanded!=='true';body.dataset.expanded=String(expanded);$('#expand').setAttribute('aria-pressed',String(expanded));$('#expand').textContent=expanded?'기본 크기':'화면 확대';window.dispatchEvent(new Event('mystic-input-reset'));$('#game').focus({preventScroll:true});};
$('#fullscreen').title='게임 화면만 전체화면으로 표시 · Esc로 해제';
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else{window.dispatchEvent(new Event('mystic-input-reset'));$('#game').focus({preventScroll:true});await $('#playfield').requestFullscreen();}}catch{$('#status').textContent='전체화면을 사용할 수 없습니다. 화면 확대를 이용하세요.';}};
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').textContent=document.fullscreenElement?'전체화면 해제':'전체화면';if(body.dataset.view==='game')$('#game').focus({preventScroll:true});});
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&document.fullscreenElement){e.preventDefault();e.stopImmediatePropagation();document.exitFullscreen().catch(()=>{});}},true);
if(!document.fullscreenEnabled){$('#fullscreen').disabled=true;$('#fullscreen').title='이 브라우저에서는 전체화면이 지원되지 않습니다.';}
// Pack complete instructions into pages of the available height.
for(const panel of document.querySelectorAll('.guide')){
 const list=panel.querySelector('.moves'),items=[...list.children];let pages=[],page=0;
 function show(){items.forEach(i=>i.hidden=true);for(const item of pages[page]??[])item.hidden=false;panel.querySelector('.page').textContent=`${page+1}/${pages.length||1}`;panel.querySelectorAll('[data-step]').forEach(b=>b.disabled=pages.length<2);}
 function paginate(){if(!list.clientWidth||!list.clientHeight)return;items.forEach(i=>i.hidden=false);pages=[];let group=[],height=0;
  for(const item of items){const h=item.getBoundingClientRect().height;if(group.length&&height+h>list.clientHeight){pages.push(group);group=[];height=0;}group.push(item);height+=h;}if(group.length)pages.push(group);page=Math.min(page,pages.length-1);show();}
 panel.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{page=(page+Number(b.dataset.step)+pages.length)%pages.length;show();$('#game').focus({preventScroll:true});});
 new ResizeObserver(paginate).observe(list);
}
new ResizeObserver(fitGame).observe($('#playfield'));fitGame();
