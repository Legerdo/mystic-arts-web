import fs from 'node:fs';
import {createHash} from 'node:crypto';
const source=fs.readFileSync(new URL('node_modules/@alexaltea/unicorn-js/dist/unicorn_x86.js',import.meta.url),'utf8');
const marker=';return moduleRtn';
if(source.split(marker).length!==2)throw Error('Unicorn glue ABI changed');
const patched=source.replace(marker,";Object.defineProperty(Module,'gameHeap',{get:()=>HEAPU8});return moduleRtn");
fs.writeFileSync(new URL('unicorn-adapter.cjs',import.meta.url),patched);
fs.writeFileSync(new URL('adapter-provenance.json',import.meta.url),JSON.stringify({package:'@alexaltea/unicorn-js',version:'2.1.4',sourceSha256:createHash('sha256').update(source).digest('hex'),adapterSha256:createHash('sha256').update(patched).digest('hex'),change:'Expose existing WASM heap through a read-only getter; no CPU/WASM byte changes'},null,2));
