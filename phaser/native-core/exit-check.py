"""Real EXIT -> cleanup -> restart regression, without guest state writes."""
import asyncio,json,sys,hashlib
from pathlib import Path
from playwright.async_api import async_playwright

async def run():
 out=Path(__file__).resolve().parent/sys.argv[1];out.mkdir();report={'cycles':[],'errors':[]}
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(channel='chrome',headless=True);page=await browser.new_page(viewport={'width':1100,'height':1000})
  await page.add_init_script('''window.testWorkers=[];window.testAudio=[];const W=Worker,A=AudioContext;window.Worker=class extends W{constructor(...a){super(...a);testWorkers.push(this)}terminate(){this.terminated=true;super.terminate()}};window.AudioContext=class extends A{constructor(...a){super(...a);testAudio.push(this)}};''')
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  try:
   await page.goto('http://127.0.0.1:5175/');report['browser']=browser.version
   response=await page.request.get('http://127.0.0.1:5175/build-manifest.json');report['buildManifestSha256']=hashlib.sha256(await response.body()).hexdigest()
   await page.screenshot(path=str(out/'controls.png'))
   for cycle in range(2):
    await page.click('#start');await page.wait_for_function('mysticNative.snapshot().ready');await page.wait_for_timeout(6500)
    await page.keyboard.press('Enter',delay=100);await page.wait_for_timeout(2000)
    saved=await page.evaluate('localStorage.getItem("mystic.phaser.native.save.v1")')
    for _ in range(2):await page.keyboard.press('ArrowDown',delay=100);await page.wait_for_timeout(200)
    await page.keyboard.press('Enter',delay=100)
    await page.wait_for_function('mysticNative.snapshot().exited || mysticNative.snapshot().error',timeout=8000)
    s=await page.evaluate('mysticNative.snapshot()');assert s.get('exited') and s['error'] is None,s
    assert not await page.locator('#start').is_disabled();assert await page.locator('#measure').is_disabled();assert await page.locator('canvas').count()==0
    resources=await page.evaluate('({workers:testWorkers.map(w=>!!w.terminated),audio:testAudio.map(a=>a.state)})');assert all(resources['workers']) and resources['audio']==['suspended'],resources
    assert await page.evaluate('localStorage.getItem("mystic.phaser.native.save.v1")')==saved
    frames=s['frames'];await page.wait_for_timeout(300);assert (await page.evaluate('mysticNative.snapshot()'))['frames']==frames
    report['cycles'].append({'state':s,'resources':resources,'savePreserved':True});await page.screenshot(path=str(out/f'exit-{cycle+1}.png'))
   await page.click('#start');await page.wait_for_function('mysticNative.snapshot().ready');await page.wait_for_timeout(6500);await page.keyboard.press('Enter',delay=100);await page.wait_for_timeout(2000);await page.keyboard.press('Enter',delay=100);await page.wait_for_function('mysticNative.snapshot().game?.mode===4');await page.wait_for_timeout(4500)
   await page.keyboard.press('KeyZ',delay=100);await page.keyboard.press('KeyX',delay=150);await page.wait_for_timeout(500)
   report['restart']=await page.evaluate('mysticNative.snapshot()');assert report['restart']['error'] is None and report['restart']['saveRead']['present'] and report['restart']['sounds']>0
   assert await page.evaluate('testAudio.length===1 && testAudio[0].state==="running" && testWorkers.filter(w=>!w.terminated).length===1')
   report['pass']=not report['errors'];await page.locator('canvas').screenshot(path=str(out/'restart-play.png'))
  except Exception as e:report['error']=str(e);report['pass']=False;await page.screenshot(path=str(out/'failure.png'))
  finally:(out/'result.json').write_text(json.dumps(report,indent=2),encoding='utf8');await browser.close()
 print(json.dumps(report));assert report['pass']
asyncio.run(run())
