"""Real title -> game keyboard flow and displayed-pixel measurement. No game state writes."""
import argparse, asyncio, json, time, hashlib
from pathlib import Path
from playwright.async_api import async_playwright

async def run(a):
    out=Path(a.output); out.mkdir(parents=True, exist_ok=False)
    errors=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(channel='chrome', headless=not a.headed)
        page=await browser.new_page(viewport={'width':1100,'height':900})
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto(a.url)
        manifest_url=a.url.split('?')[0]+'build-manifest.json'
        manifest_response=await page.request.get(manifest_url);manifest_bytes=await manifest_response.body()
        build_hash=hashlib.sha256(manifest_bytes).hexdigest() if manifest_response.ok else None
        await page.click('#start')
        await page.wait_for_function('window.mysticNative.snapshot().ready',timeout=60000)
        await page.wait_for_timeout(6500)
        await page.keyboard.press('Enter',delay=100); await page.wait_for_timeout(2000)
        if a.round!=1:
            await page.keyboard.press('ArrowDown',delay=100); await page.wait_for_timeout(150)
            await page.keyboard.press('Enter',delay=100); await page.wait_for_timeout(700)
            for _ in range(4):
                await page.keyboard.press('ArrowDown',delay=100); await page.wait_for_timeout(150)
            await page.keyboard.press('ArrowRight',delay=100); await page.wait_for_timeout(200)
            await page.locator('canvas').screenshot(path=str(out/'stage-select-option.png'))
            await page.keyboard.press('Enter',delay=100); await page.wait_for_timeout(1000)
        await page.keyboard.press('Enter',delay=100)
        await page.wait_for_function('window.mysticNative.snapshot().game?.mode===4',timeout=15000)
        await page.wait_for_timeout(4500)
        if a.round!=1:
            await page.keyboard.press('F1',delay=100)
            await page.wait_for_function('mysticNative.snapshot().game.pause===1',timeout=5000)
            for _ in range(a.round-1):
                await page.keyboard.press('ArrowRight',delay=100); await page.wait_for_timeout(150)
            assert (await page.evaluate('mysticNative.snapshot().game.stage'))==a.round
            await page.locator('canvas').screenshot(path=str(out/'stage-select-pause.png'))
            await page.keyboard.press('F1',delay=100)
            await page.wait_for_function('mysticNative.snapshot().game.pause===0 && mysticNative.snapshot().game.mode===4',timeout=5000)
            await page.wait_for_timeout(4500)
        results=[]
        for trial in range(a.trials):
            await page.click('#measure'); start=time.monotonic(); i=0
            while time.monotonic()-start<10.3:
                direction='ArrowRight' if i//7%2==0 else 'ArrowLeft'
                await page.keyboard.down(direction)
                await page.keyboard.press('KeyZ',delay=85)
                if i%4==0: await page.keyboard.press('KeyX',delay=100)
                await page.wait_for_timeout(160)
                await page.keyboard.up(direction); i+=1
            await page.wait_for_function('window.mysticNative.snapshot().workerSamples!==null',timeout=5000)
            s=await page.evaluate('window.mysticNative.snapshot()')
            results.append(s)
            await page.locator('canvas').screenshot(path=str(out/f'play-{trial+1}.png'))
            (out/'result.json').write_text(json.dumps({'browser':browser.version,'url':a.url,'buildManifestSha256':build_hash,'roundSelection':'normal start' if a.round==1 else 'original STAGE SELECT option + original pause menu','errors':errors,'input':'alternating directions, Z 85ms + 160ms, X 100ms every fourth attack','trials':results},indent=2),encoding='utf8')
            m=s['measurement']; samples=s['workerSamples']; cpu=sorted(x['cpuMs'] for x in samples); draw=sorted(x['renderMs'] for x in samples)
            print(json.dumps({'trial':trial+1,'fps':m['changedFrameFps'],'p95':m['p95Ms'],'max':m['maxMs'],'cpuMean':sum(cpu)/len(cpu),'cpuP95':cpu[int(len(cpu)*.95)],'drawMean':sum(draw)/len(draw),'drawP95':draw[int(len(draw)*.95)],'skips':sum(x['skip'] for x in samples),'game':s['game'],'error':s['error']}),flush=True)
        await browser.close()
    if errors or any(r['error'] for r in results): raise RuntimeError('Runtime errors; inspect saved result')

p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:5176/');p.add_argument('--output',required=True);p.add_argument('--trials',type=int,default=3);p.add_argument('--round',type=int,choices=range(1,17),default=1);p.add_argument('--headed',action='store_true')
asyncio.run(run(p.parse_args()))
