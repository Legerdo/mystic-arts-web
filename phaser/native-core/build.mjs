import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {decodeGmp} from '../../tools/decode-cnx.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(root,'../..'),out=path.join(root,'dist');
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--original-dir'))throw Error('Usage: node phaser/native-core/build.mjs [--original-dir path]');
const original=args.length?path.resolve(args[1]):path.dirname(web);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p));
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const files={};for(const f of json(path.join(web,'tools/cpu-loops/original-files.json'))){const b=read(path.join(original,f.path));if(hash(b)!==f.sha256)throw Error('Original changed '+f.path);const url='original/'+f.path;write(path.join(out,url),b);files[f.path.toLowerCase()]=url;}
const graphics=json(path.join(web,'public/assets/graphics/manifest.json')),images={};
for(const [name,s] of Object.entries(graphics.sheets)){const b=decodeGmp(read(path.join(web,'public/assets/graphics/raw',name+'.gmp'))).indices;if(hash(b)!==s.indicesSha256)throw Error('Indices differ '+name);images[name]='indices/'+name+'.bin';write(path.join(out,images[name]),b);}
for(const f of ['core.mjs','hot-functions.mjs','renderer.mjs','worker.mjs','main.mjs','layout.mjs','layout.css','index.html'])write(path.join(out,f.replace('.mjs','.js')),read(path.join(root,f)).toString('utf8').replaceAll(".mjs'",".js'").replaceAll('.mjs"','.js"'));
const adapter=read(path.join(root,'unicorn-adapter.cjs')).toString('utf8');write(path.join(out,'unicorn.js'),adapter+'\nexport default MUnicorn;\n');
const provenance=json(path.join(root,'adapter-provenance.json'));
if(hash(adapter)!==provenance.adapterSha256||hash(read(path.join(root,'node_modules/@alexaltea/unicorn-js/dist/unicorn_x86.js')))!==provenance.sourceSha256)throw Error('Unicorn adapter provenance mismatch');
write(path.join(out,'phaser.js'),read(path.join(web,'phaser/node_modules/phaser/dist/phaser.min.js')));
write(path.join(out,'tinysynth.js'),read(path.join(web,'vendor/tinysynth/package/webaudio-tinysynth.js')));
const data=json(path.join(web,'public/assets/data/index.json'));
for(const a of [...data.effects,...data.music])write(path.join(out,'audio',path.basename(a.file)),read(path.resolve(web,'public/assets/data',a.file)));
write(path.join(out,'assets.json'),JSON.stringify({graphics,files,images,effects:data.effects.length,music:data.music.length,musicFlags:data.music.map(m=>m.sourceFlag)}));
for(const [name,file] of Object.entries({'unicorn-GPL-2.0.txt':path.join(root,'node_modules/@alexaltea/unicorn-js/LICENSE'),'phaser-MIT.txt':path.join(web,'phaser/node_modules/phaser/LICENSE.md'),'tinysynth-Apache-2.0.txt':path.join(web,'vendor/tinysynth/package/LICENSE')}))write(path.join(out,'licenses',name),read(file));
write(path.join(out,'licenses/SOURCES.txt'),'Unicorn.js 2.1.4 (GPL-2.0): https://github.com/AlexAltea/unicorn.js\nPackage: https://www.npmjs.com/package/@alexaltea/unicorn-js/v/2.1.4\nUnicorn 2.1.4: https://github.com/unicorn-engine/unicorn/tree/2.1.4\nPhaser 3.90.0 (MIT): https://github.com/phaserjs/phaser/tree/v3.90.0\nWebAudioTinySynth 1.1.3 (Apache-2.0): https://github.com/g200kg/webaudio-tinysynth\nAdapter source and exact regeneration: https://github.com/Legerdo/mystic-arts-web/tree/main/phaser/native-core\nThe adapter exposes the existing WASM heap; CPU/WASM bytes are unchanged. See adapter-provenance.json and prepare.mjs.\nOriginal Mystic Arts code/assets are COMPILE game content, not relicensed by this repository. Rights and license tracking: https://github.com/Legerdo/mystic-arts-web/issues/1\n');
write(path.join(out,'licenses/adapter-provenance.json'),read(path.join(root,'adapter-provenance.json')));write(path.join(out,'licenses/prepare.mjs'),read(path.join(root,'prepare.mjs')));
write(path.join(out,'.nojekyll'),'');
const built={};function inventory(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const f=path.join(dir,e.name);if(e.isDirectory())inventory(f);else if(f!==path.join(out,'build-manifest.json'))built[path.relative(out,f).replaceAll('\\','/')]=hash(read(f));}}inventory(out);
write(path.join(out,'build-manifest.json'),JSON.stringify({kind:'phaser-original-core-preview',originalFileCount:Object.keys(files).length,originalExeSha256:hash(read(path.join(original,'Mystic.exe'))),runtime:'Phaser 3.90.0 + Unicorn.js 2.1.4 x86 Worker + indexed renderer',files:built},null,2));
console.log('Built isolated native-core candidate: '+out);
