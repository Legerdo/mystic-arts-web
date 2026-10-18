import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
async def run():
 out=Path(__file__).resolve().parent/sys.argv[1];out.mkdir();r={'checks':[],'errors':[]}
 async with async_playwright() as pw:
  b=await pw.chromium.launch(channel='chrome',headless=True);page=await b.new_page();page.on('pageerror',lambda e:r['errors'].append(str(e)))
  try:
   await page.goto('http://127.0.0.1:5175/');r['browser']=b.version
   for w,h in [(320,240),(360,640),(640,360),(768,1024),(1024,768),(1280,720),(1366,768),(1920,1080),(2560,1440),(3840,2160)]:
    await page.set_viewport_size({'width':w,'height':h})
    await page.wait_for_timeout(100)
    assert await page.locator('button[data-view]').count()==0
    assert await page.evaluate('document.documentElement.scrollHeight<=innerHeight && document.documentElement.scrollWidth<=innerWidth')
    boxes=await page.locator('#game').bounding_box();assert boxes['width']>0 and abs(boxes['width']/boxes['height']-4/3)<.01
    assert await page.evaluate("""() => {const b=[...document.querySelectorAll('header h1,header button,header label')].map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);return b.every((a,i)=>a.left>=0&&a.right<=innerWidth&&b.every((c,j)=>i===j||a.right<=c.left||c.right<=a.left||a.bottom<=c.top||c.bottom<=a.top));}"""),(w,h,'header overlap')
    for view in ['basic','skills']:
     panel=page.locator('#'+view);assert await panel.is_visible();total=int((await panel.locator('.page').inner_text()).split('/')[1]);seen=set()
     for _ in range(total):
      clipped=await panel.evaluate("""p=>{const r=p.querySelector('.moves').getBoundingClientRect();return [...p.querySelectorAll('article:not([hidden])')].filter(a=>a.getBoundingClientRect().bottom>r.bottom+1).map(a=>a.innerText)}""")
      assert not clipped,(w,h,view,clipped)
      seen.update(await panel.locator('article:not([hidden]) h3').all_text_contents())
      if total>1:await panel.locator('[data-step="1"]').click()
     assert len(seen)==await panel.locator('article').count(),(w,h,view,seen)
    r['checks'].append({'size':[w,h],'pass':True})
    before=await page.locator('#game').bounding_box();await page.click('#expand');await page.wait_for_timeout(100);after=await page.locator('#game').bounding_box();assert after['width']*after['height']>before['width']*before['height'];assert await page.evaluate('document.documentElement.scrollHeight<=innerHeight');await page.click('#expand')
   await page.set_viewport_size({'width':1920,'height':1080});await page.screenshot(path=str(out/'desktop.png'))
   await page.click('#start');await page.wait_for_function('mysticNative.snapshot().ready');await page.wait_for_timeout(6500);await page.keyboard.press('Enter',delay=100);await page.wait_for_timeout(2000);await page.keyboard.press('Enter',delay=100);await page.wait_for_function('mysticNative.snapshot().game?.mode===4');await page.wait_for_timeout(4500)
   await page.keyboard.press('KeyZ',delay=100)
   await page.click('#fullscreen');await page.wait_for_function('document.fullscreenElement?.id==="playfield"');assert await page.evaluate('!document.fullscreenElement.querySelector(".guide,header,nav,footer")');await page.screenshot(path=str(out/'fullscreen-only-game.png'));await page.keyboard.press('Escape');await page.wait_for_function('!document.fullscreenElement');r['fullscreen']=True
   for w,h in [(1920,1080),(1366,768),(640,360),(320,240)]:
    await page.set_viewport_size({'width':w,'height':h});await page.wait_for_timeout(200);assert await page.locator('canvas').evaluate('(c)=>c.width===640&&c.height===480');assert await page.evaluate('document.documentElement.scrollHeight<=innerHeight');await page.screenshot(path=str(out/f'play-{w}.png'))
   r['game']=await page.evaluate('mysticNative.snapshot()');assert r['game']['error'] is None;r['pass']=not r['errors']
  except Exception as e:r['error']=str(e);r['pass']=False;await page.screenshot(path=str(out/'failure.png'))
  finally:(out/'result.json').write_text(json.dumps(r,indent=2),encoding='utf8');await b.close()
 print(json.dumps(r));assert r['pass']
asyncio.run(run())
