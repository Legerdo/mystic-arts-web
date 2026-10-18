import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.join(web,'phaser/native-core'),dist=path.join(root,'dist');
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'build-manifest.json')));
const originals=JSON.parse(fs.readFileSync(path.join(web,'tools/cpu-loops/original-files.json')));
if(manifest.originalFileCount!==64||originals.length!==64)throw Error('Expected exactly 64 original files');
for(const f of originals){const b=fs.readFileSync(path.join(dist,'original',f.path));if(b.length!==f.bytes||hash(b)!==f.sha256)throw Error('Original mismatch: '+f.path);}
const actual=[];
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Unexpected symlink: '+p);if(e.isDirectory())visit(p);else if(e.isFile()&&p!==path.join(dist,'build-manifest.json'))actual.push(path.relative(dist,p).replaceAll('\\','/'));}}
visit(dist);
if(JSON.stringify(actual.sort())!==JSON.stringify(Object.keys(manifest.files).sort()))throw Error('Unlisted or missing deployment files');
for(const [name,expected] of Object.entries(manifest.files))if(hash(fs.readFileSync(path.join(dist,name)))!==expected)throw Error('Deployment mismatch: '+name);
for(const name of ['index.html','layout.css','layout.mjs','main.mjs','worker.mjs','core.mjs','hot-functions.mjs','renderer.mjs']){
 const source=fs.readFileSync(path.join(root,name),'utf8').replaceAll(".mjs'",".js'").replaceAll('.mjs"','.js"');
 if(source!==fs.readFileSync(path.join(dist,name.replace('.mjs','.js')),'utf8'))throw Error('Source/build mismatch: '+name);
}
const assets=JSON.parse(fs.readFileSync(path.join(dist,'assets.json')));
for(const name of [...Object.values(assets.files),...Object.values(assets.images)])if(!Object.hasOwn(manifest.files,name))throw Error('Missing referenced asset: '+name);
const args=process.argv.slice(2);
if(args.length){
 if(args.length!==2||args[0]!=='--url')throw Error('Usage: node tools/verify-native-dist.mjs [--url https://host/project/]');
 const base=new URL(args[1].replace(/\/?$/,'/'));
 const online=await fetch(new URL('build-manifest.json',base));
 if(!online.ok||hash(Buffer.from(await online.arrayBuffer()))!==hash(fs.readFileSync(path.join(dist,'build-manifest.json'))))throw Error('Published manifest differs');
 let next=0;const entries=Object.entries(manifest.files);
 await Promise.all(Array.from({length:8},async()=>{while(next<entries.length){const [name,expected]=entries[next++],response=await fetch(new URL(name,base));if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==expected)throw Error('Published mismatch: '+name);}}));
}
console.log(JSON.stringify({pass:true,originals:originals.length,deploymentFiles:actual.length,buildManifestSha256:hash(fs.readFileSync(path.join(dist,'build-manifest.json'))),remoteVerified:args[1]??null}));
