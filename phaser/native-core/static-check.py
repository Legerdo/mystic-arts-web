"""Ordinary HTTP subpath, original UI/input, pause, offline and original save readback."""
import argparse, asyncio, functools, http.server, json, threading, hashlib
from pathlib import Path
from playwright.async_api import async_playwright

async def run(args):
    here=Path(__file__).resolve().parent; web=here.parent.parent; out=here/args.output;out.mkdir()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=None
    if args.url:url=args.url.rstrip('/')+'/'
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(web)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        url=f'http://127.0.0.1:{server.server_port}/phaser/native-core/dist/'
    report={'url':url,'checks':{},'errors':[]}
    try:
        async with async_playwright() as pw:
            b=await pw.chromium.launch(channel='chrome',headless=True);ctx=await b.new_context(viewport={'width':1100,'height':900});p=await ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)))
            response=await p.goto(url);report['browser']=b.version;report['headers']=dict(response.headers)
            local_manifest=(here/'dist/build-manifest.json').read_bytes()
            manifest_response=await p.request.get(url+'build-manifest.json')
            assert manifest_response.ok and await manifest_response.body()==local_manifest,'Served build differs from local release'
            report['buildManifestSha256']=hashlib.sha256(local_manifest).hexdigest()
            report['platform']=await p.evaluate('({crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer})')
            await p.click('#start');await p.wait_for_function('mysticNative.snapshot().ready');await p.wait_for_timeout(6500)
            await p.keyboard.press('Enter',delay=100);await p.wait_for_timeout(2000);await p.locator('canvas').screenshot(path=str(out/'menu.png'))
            saved=await p.evaluate('localStorage.getItem("mystic.phaser.native.save.v1")');data=json.loads(saved)
            report['checks']['originalSave20Bytes']=len(data)==20 and int.from_bytes(bytes(data[:4]),'little')==20
            await p.keyboard.press('Enter',delay=100);await p.wait_for_function('mysticNative.snapshot().game?.mode===4');await p.wait_for_timeout(4500)
            await p.evaluate('''() => {window.inputProbe=new Promise(resolve=>{addEventListener('keydown',function begin(e){if(e.code!=='ArrowRight')return;removeEventListener('keydown',begin);const start=performance.now(),x=mysticNative.snapshot().game.player.x,ctx=document.querySelector('canvas').getContext('2d'),before=ctx.getImageData(0,0,640,480).data;function observe(){const s=mysticNative.snapshot(),pixels=ctx.getImageData(0,0,640,480).data;if(s.game.player.x>x&&pixels.some((v,i)=>v!==before[i]))return resolve({ms:performance.now()-start,beforeX:x,afterX:s.game.player.x});if(performance.now()-start>1000)return resolve({error:'No rightward pixel response'});requestAnimationFrame(observe);}requestAnimationFrame(observe);});});}''')
            await p.keyboard.down('ArrowRight');report['inputProbe']=await p.evaluate('inputProbe');await p.keyboard.up('ArrowRight')
            report['checks']['inputMovesRenderedPlayer']='error' not in report['inputProbe']
            await p.keyboard.press('Escape',delay=100);await p.wait_for_function('mysticNative.snapshot().game.pause===1');await p.wait_for_timeout(600)
            before=await p.evaluate('mysticNative.snapshot().game.player');await p.wait_for_timeout(400);after=await p.evaluate('mysticNative.snapshot().game.player')
            report['checks']['pauseFreezesPlayer']=before==after;await p.locator('canvas').screenshot(path=str(out/'pause.png'))
            await p.keyboard.press('Escape',delay=100);await p.wait_for_function('mysticNative.snapshot().game.pause===0')
            await ctx.set_offline(True)
            for _ in range(8):await p.keyboard.press('KeyZ',delay=100);await p.wait_for_timeout(200)
            await p.keyboard.press('KeyX',delay=150);await p.wait_for_timeout(300)
            state=await p.evaluate('mysticNative.snapshot()');report['offlineState']=state;report['checks']['offlineContinues']=state['error'] is None and state['game']['mode']==4
            await p.locator('canvas').screenshot(path=str(out/'offline-play.png'));await ctx.set_offline(False)
            await p.reload();await p.click('#start');await p.wait_for_function('mysticNative.snapshot().ready');state=await p.evaluate('mysticNative.snapshot()');report['reloadState']=state
            report['checks']['nativeSaveReadback']=state['saveRead']['present'] and state['saveRead']['bytes']==20 and state['saveRead']['roundMask']==int.from_bytes(bytes(data[16:20]),'little')
            report['checks']['saveBytesSurviveReload']=(await p.evaluate('localStorage.getItem("mystic.phaser.native.save.v1")'))==saved
            report['checks']['noIsolationHeaders']=not report['platform']['crossOriginIsolated'] and not any(k.startswith('cross-origin-') for k in report['headers'])
            report['checks']['noRuntimeErrors']=not report['errors'] and state['error'] is None
            await b.close()
        report['pass']=all(report['checks'].values())
    except Exception as e:report['error']=str(e);report['pass']=False
    finally:
        if server:server.shutdown()
        (out/'result.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report));assert report['pass']
parser=argparse.ArgumentParser();parser.add_argument('output');parser.add_argument('--url')
asyncio.run(run(parser.parse_args()))
