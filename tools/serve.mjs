import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = path.resolve(webRoot, process.env.STATIC_ROOT ?? process.argv[2] ?? ".");
const port = Number.parseInt(process.env.PORT ?? "5173", 10);
const host = process.env.HOST ?? "127.0.0.1";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".wav": "audio/wav",
  ".mid": "audio/midi",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // This is an ordinary static file server. No browser isolation headers or
  // native-process/API endpoints are supplied; production needs only the files.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed"); return;
  }
  const rawPath = new URL(req.url ?? "/", `http://${host}:${port}`).pathname;
  let target;
  try { target = path.resolve(root, "." + decodeURIComponent(rawPath)); }
  catch { res.writeHead(400).end("Invalid path"); return; }
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.writeHead(403).end("Forbidden"); return;
  }
  if (path.extname(target).length === 0) target = path.join(target, "index.html");
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end("Not found"); return; }
    const mime = MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream";
    const range = req.headers.range;
    let start = 0;
    let end = stat.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end(); return; }
      if (match[1]) start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
      if (!match[1] && match[2]) { start = Math.max(0, stat.size - Number(match[2])); end = stat.size - 1; }
      if (start > end || end >= stat.size) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end(); return; }
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Length": Math.max(0, end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` } : {}),
      "Cache-Control": "no-cache"
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(target, { start, end }).pipe(res);
  });
});
server.listen(port, host, () => {
  process.stdout.write(`Mystic Arts Web: http://${host}:${port}/\n`);
});
