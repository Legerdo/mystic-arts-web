#!/usr/bin/env node
/**
 * Mystic Arts / Compile GMP-200 CNX v2 decoder.
 *
 * No npm dependencies. Produces palette-indexed PNGs (PNG color type 3), so
 * every source palette index is retained even when palette entry 0 is keyed
 * transparent for rendering sprites in browsers.
 *
 * Usage:
 *   node web/tools/decode-cnx.mjs
 *   node web/tools/decode-cnx.mjs --check
 *   node web/tools/decode-cnx.mjs --source Cnx --output web/public/assets/graphics
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SOURCE = path.join(projectRoot, 'Cnx');
const DEFAULT_OUTPUT = path.join(projectRoot, 'web/public/assets/graphics');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// These resources are full-screen backdrops or full-window illustrations.
// Their palette entry 0 carries visible background color; retain its opacity.
// Every other known resource uses palette index 0 as its transparent key.
const OPAQUE_SHEETS = new Set([
  'ttl', 'stgb01', 'stgb02', 'stgb03', 'end01', 'end02',
  'end03', 'end04', 'roll', 'rogwall',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Decompress CNX v2. The 2-bit operation codes are in low-to-high bit order.
 * 
 * 0: skip [length] bytes of input (padding, no output); end 4-op group.
 * 1: copy one literal byte.
 * 2: 16-bit big-endian LZ pair: distance=(word>>>5)+1, length=(word&31)+4.
 * 3: copy [length] literal bytes.
 *
 * @param {Uint8Array} input
 * @returns {{bytes: Buffer, stats: object}}
 */
export function decodeCnx(input) {
  const source = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  ensure(source.length >= 17, 'CNX file too short');
  ensure(source.toString('ascii', 0, 3) === 'CNX' && source[3] === 2,
    'CNX v2 signature missing');
  ensure(source.toString('ascii', 4, 7) === 'GMP', 'Expected GMP payload');
  ensure(source[7] === 0x10, 'Unexpected CNX header marker');

  const compressedSize = source.readUInt32BE(8);
  const decompressedSize = source.readUInt32BE(12);
  ensure(compressedSize === source.length - 16,
    `CNX compressed length mismatch: ${compressedSize} vs ${source.length - 16}`);
  ensure(decompressedSize >= 32 && decompressedSize <= 128 * 1024 * 1024,
    `Implausible CNX decompressed length ${decompressedSize}`);

  const output = Buffer.alloc(decompressedSize);
  const opCounts = [0, 0, 0, 0];
  let src = 16;
  let dst = 0;
  while (dst < decompressedSize) {
    ensure(src < source.length, `CNX command exhausted at output byte ${dst}`);
    const control = source[src++];
    for (let slot = 0; slot < 4 && dst < decompressedSize; slot++) {
      const op = (control >>> (slot * 2)) & 3;
      opCounts[op]++;
      if (op === 0) {
        ensure(src < source.length, 'Truncated CNX padding command');
        const skip = source[src++];
        ensure(src + skip <= source.length, 'CNX padding runs past EOF');
        src += skip;
        break;
      }
      if (op === 1) {
        ensure(src < source.length, 'Truncated CNX literal byte');
        output[dst++] = source[src++];
      } else if (op === 2) {
        ensure(src + 2 <= source.length, 'Truncated CNX match pair');
        const pair = source.readUInt16BE(src);
        src += 2;
        const distance = (pair >>> 5) + 1;
        const length = (pair & 31) + 4;
        ensure(distance <= 2048 && distance <= dst, `CNX invalid back-reference distance ${distance} at ${dst}`);
        ensure(dst + length <= decompressedSize, 'CNX LZ match overflows output');
        // A byte-at-a-time copy is necessary for overlapping LZ matches.
        for (let i = 0; i < length; i++) {
          output[dst] = output[dst - distance];
          dst++;
        }
      } else {
        ensure(src < source.length, 'Truncated CNX literal run length');
        const length = source[src++];
        ensure(src + length <= source.length, 'CNX literal run exceeds input');
        ensure(dst + length <= decompressedSize, 'CNX literal run overflows output');
        source.copy(output, dst, src, src + length);
        src += length;
        dst += length;
      }
    }
  }

  // In the game files the final control word can contain unused commands.
  // They leave a short, implementation-specific footer (00 00 / FC 00 00).
  const trailer = source.subarray(src);
  ensure(trailer.length <= 3 && (trailer.equals(Buffer.from([0, 0])) ||
    trailer.equals(Buffer.from([0xfc, 0, 0])) || trailer.length === 0),
  `Unexpected CNX trailing bytes: ${trailer.toString('hex')}`);
  return {
    bytes: output,
    stats: {
      compressedSize,
      decompressedSize,
      opCounts: { padding: opCounts[0], literalByte: opCounts[1], match: opCounts[2], literalRun: opCounts[3] },
      trailingBytes: trailer.length,
    },
  };
}

/**
 * Decode GMP-200 as exact palette indices in top-left image order.
 * The GMP pixel array is stored bottom-to-top as in Windows BMP.
 * 
 * @param {Uint8Array} bytes Raw decompressed GMP bytes
 * @returns {{width:number,height:number,bitDepth:number,palette:Uint8Array,paletteBgra:Uint8Array,
 *   indices:Buffer, rawPixels:Buffer, paletteCount:number,rawPixelOffset:number}}
 */
export function decodeGmp(bytes) {
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  ensure(raw.length >= 32 && raw.toString('ascii', 0, 8) === 'GMP-200\0',
    'Invalid GMP-200 signature');
  const height = raw.readUInt32LE(8);
  const width = raw.readUInt32LE(12);
  const reserved = raw.readUInt32LE(16);
  const paletteOffset = raw.readUInt32LE(20);
  const pixelOffset = raw.readUInt32LE(24);
  const paletteCount = raw.readUInt16LE(28);
  const bitDepth = raw.readUInt16LE(30);
  ensure(reserved === 0, `Unexpected GMP reserved field ${reserved}`);
  ensure(width > 0 && width <= 16384 && height > 0 && height <= 16384, `Invalid GMP dimensions ${width}x${height}`);
  ensure(bitDepth === 4 || bitDepth === 8, `Unsupported GMP bit depth ${bitDepth}`);
  ensure(paletteCount >= 1 && paletteCount <= (1 << bitDepth), `Invalid GMP palette size ${paletteCount}`);
  ensure(paletteOffset === 32 && pixelOffset === paletteOffset + paletteCount * 4,
    'GMP palette/data offsets inconsistent');
  const bytesPerRow = Math.ceil(width * bitDepth / 8);
  ensure(raw.length === pixelOffset + height * bytesPerRow,
    `GMP pixel length mismatch: ${raw.length} != ${pixelOffset} + ${height} * ${bytesPerRow}`);

  const paletteBgra = raw.subarray(paletteOffset, pixelOffset);
  const palette = Buffer.alloc(paletteCount * 3);
  for (let i = 0; i < paletteCount; i++) {
    palette[i * 3] = paletteBgra[i * 4 + 2];
    palette[i * 3 + 1] = paletteBgra[i * 4 + 1];
    palette[i * 3 + 2] = paletteBgra[i * 4];
  }
  const rawPixels = raw.subarray(pixelOffset);
  const indices = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    const sourceRow = (height - y - 1) * bytesPerRow;
    const targetRow = y * width;
    if (bitDepth === 8) rawPixels.copy(indices, targetRow, sourceRow, sourceRow + width);
    else for (let x = 0; x < width; x++) {
      const packed = rawPixels[sourceRow + (x >>> 1)];
      indices[targetRow + x] = (x & 1) === 0 ? packed >>> 4 : packed & 15;
    }
  }
  let maxIndex = 0;
  let nonKeyPixels = 0;
  for (const value of indices) {
    if (value > maxIndex) maxIndex = value;
    if (value !== 0) nonKeyPixels++;
  }
  ensure(maxIndex < paletteCount, `GMP pixel palette index ${maxIndex} out of range (${paletteCount})`);
  return { width, height, bitDepth, paletteCount, palette, paletteBgra, paletteOffset,
    pixelOffset, indices, rawPixels, maxIndex, nonKeyPixels };
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length, 0);
  header.write(type, 4, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), payload])), 0);
  return Buffer.concat([header, payload, checksum]);
}

/** PNG color type 3 stores exact GMP color indices, no quantization. */
export function encodeIndexedPng(image, transparentIndex = 0) {
  const { width, height, palette, paletteCount, indices } = image;
  ensure(indices.length === width * height, 'Invalid index buffer length');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // expanded source 4bpp to 8bpp indexed, preserving exact indices
  ihdr[9] = 3; // palette
  const scanlines = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) indices.copy(scanlines, y * (width + 1) + 1, y * width, (y + 1) * width);
  const chunks = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('PLTE', palette)];
  if (transparentIndex !== null) {
    ensure(Number.isInteger(transparentIndex) && transparentIndex >= 0 && transparentIndex < paletteCount,
      'Invalid transparent palette index');
    const trns = Buffer.alloc(transparentIndex + 1, 255);
    trns[transparentIndex] = 0;
    chunks.push(pngChunk('tRNS', trns));
  }
  chunks.push(pngChunk('IDAT', deflateSync(scanlines, { level: 9 })));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

/** Independently read back generated PNG bytes and compare all palette indices. */
export function verifyIndexedPng(png, expected) {
  ensure(png.subarray(0, 8).equals(PNG_SIGNATURE), 'PNG signature mismatch');
  let offset = 8;
  let width, height, palette, transparency = null, idat = [];
  while (offset < png.length) {
    ensure(offset + 12 <= png.length, 'PNG truncated chunk');
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    ensure(end <= png.length, 'PNG chunk exceeds EOF');
    const payload = png.subarray(offset + 8, offset + 8 + length);
    ensure(crc32(png.subarray(offset + 4, end - 4)) === png.readUInt32BE(end - 4),
      `PNG CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      ensure(payload[8] === 8 && payload[9] === 3 && payload[12] === 0, 'Unexpected PNG format');
    } else if (type === 'PLTE') palette = payload;
    else if (type === 'tRNS') transparency = payload;
    else if (type === 'IDAT') idat.push(payload);
    else if (type === 'IEND') ensure(end === png.length, 'PNG has bytes after IEND');
    offset = end;
  }
  ensure(width === expected.width && height === expected.height, 'PNG dimension mismatch');
  ensure(palette?.equals(expected.palette), 'PNG palette mismatch');
  ensure((expected.transparentIndex === null) === (transparency === null), 'PNG transparency presence mismatch');
  if (expected.transparentIndex !== null) ensure(
    transparency.length === expected.transparentIndex + 1 && transparency[expected.transparentIndex] === 0,
    'PNG palette key mismatch');
  const pixels = inflateSync(Buffer.concat(idat));
  ensure(pixels.length === height * (width + 1), 'PNG scanline length mismatch');
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    ensure(pixels[row] === 0, 'PNG filter must be 0');
    ensure(pixels.subarray(row + 1, row + 1 + width).equals(
      expected.indices.subarray(y * width, (y + 1) * width)), `PNG pixel mismatch at row ${y}`);
  }
}

function classify(name) {
  if (/^stgb0[1-3]$/.test(name)) return 'background';
  if (/^stgp0[1-3]$/.test(name)) return 'foreground';
  if (/^(ttl|ttlmenu|gage|sysfont|sfont|font_1|lavel|over|del|credit)$/.test(name)) return 'interface';
  if (/^(end\d\d|roll|rogwall|rogo\d)$/.test(name)) return 'illustration';
  if (/^effect/.test(name)) return 'effect-atlas';
  return 'character-atlas';
}

/** Convert every source CNX, write indexed PNGs + a metadata manifest. */
export async function convertAll({ sourceDir = DEFAULT_SOURCE, outputDir = DEFAULT_OUTPUT, check = false } = {}) {
  const inputs = (await fs.readdir(sourceDir)).filter(n => /\.cnx$/i.test(n)).sort((a, b) => a.localeCompare(b, 'en'));
  ensure(inputs.length > 0, `No CNX files in ${sourceDir}`);
  if (!check) {
    await fs.mkdir(path.join(outputDir, 'original'), { recursive: true });
    await fs.mkdir(path.join(outputDir, 'raw'), { recursive: true });
  }

  const sheets = {};
  let totalPixels = 0;
  let totalCompressedBytes = 0;
  let totalRawBytes = 0;
  for (const filename of inputs) {
    const name = path.parse(filename).name.toLowerCase();
    const source = await fs.readFile(path.join(sourceDir, filename));
    const { bytes, stats } = decodeCnx(source);
    const image = decodeGmp(bytes);
    const transparentIndex = OPAQUE_SHEETS.has(name) ? null : 0;
    const png = encodeIndexedPng(image, transparentIndex);
    const outputName = `${name}.png`;
    const sheet = {
      cnx: `/assets/graphics/original/${name}.cnx`,
      gmp: `/assets/graphics/raw/${name}.gmp`,
      image: `/assets/graphics/${outputName}`,
      kind: classify(name),
      width: image.width,
      height: image.height,
      sourceName: filename,
      compressedBytes: source.length,
      gmpBytes: bytes.length,
      sourceBitDepth: image.bitDepth,
      pngBitDepth: 8,
      paletteColors: image.paletteCount,
      paletteOffset: image.paletteOffset,
      rawPixelOffset: image.pixelOffset,
      transparentIndex,
      paletteBGRA: image.paletteBgra.toString('hex'),
      pixelCount: image.width * image.height,
      nonzeroIndexPixels: image.nonKeyPixels,
      sourceSha256: sha256(source),
      gmpSha256: sha256(bytes),
      indicesSha256: sha256(image.indices),
      pngSha256: sha256(png),
      compression: stats.opCounts,
      // A full-sheet sourceRect is always valid. Animation frame boundaries
      // must be supplied by the game's sprite commands, not guessed from gaps.
      frames: [{ id: 'sheet', x: 0, y: 0, width: image.width, height: image.height }],
    };
    if (check) {
      ensure((await fs.readFile(path.join(outputDir, 'original', `${name}.cnx`))).equals(source),
        `Original CNX copy changed: ${name}`);
      ensure((await fs.readFile(path.join(outputDir, 'raw', `${name}.gmp`))).equals(bytes),
        `Uncompressed GMP copy changed: ${name}`);
      const recorded = await fs.readFile(path.join(outputDir, outputName));
      ensure(recorded.equals(png), `Asset changed or out of date: ${outputName}`);
      verifyIndexedPng(recorded, { ...image, transparentIndex });
    } else {
      await fs.writeFile(path.join(outputDir, 'original', `${name}.cnx`), source);
      await fs.writeFile(path.join(outputDir, 'raw', `${name}.gmp`), bytes);
      await fs.writeFile(path.join(outputDir, outputName), png);
      verifyIndexedPng(png, { ...image, transparentIndex });
    }
    sheets[name] = sheet;
    totalCompressedBytes += source.length;
    totalRawBytes += bytes.length;
    totalPixels += image.width * image.height;
    console.log(`${check ? 'checked' : 'decoded'} ${filename.padEnd(15)} ${String(image.width).padStart(4)}x${String(image.height).padEnd(4)} ${image.bitDepth}bpp ${String(image.paletteCount).padStart(3)} colors ${stats.compressedSize} bytes`);
  }
  const manifest = {
    version: 1,
    format: 'CNX v2 / GMP-200',
    baseUrl: '/assets/graphics/',
    coordinateSystem: 'top-left, x increasing right, y increasing down',
    sourcePixelOrientation: 'bottom-up',
    defaultTransparentIndex: 0,
    warning: 'frames[].id=sheet covers each full atlas. Per-action sprite rectangles require verification against game code/sequence data.',
    totals: { files: inputs.length, pixels: totalPixels, compressedBytes: totalCompressedBytes, gmpBytes: totalRawBytes },
    sheets,
  };
  const manifestPath = path.join(outputDir, 'manifest.json');
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (check) {
    ensure((await fs.readFile(manifestPath, 'utf8')) === json, 'Manifest outdated');
  } else await fs.writeFile(manifestPath, json, 'utf8');
  console.log(`${check ? 'Verified' : 'Converted'} ${inputs.length} files; ${totalPixels.toLocaleString('en-US')} exact palette indices; manifest: ${manifestPath}`);
  return manifest;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--source' && argv[i + 1]) options.sourceDir = path.resolve(argv[++i]);
    else if (arg === '--output' && argv[i + 1]) options.outputDir = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') return null;
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options === null) console.log('Usage: node web/tools/decode-cnx.mjs [--check] [--source path] [--output path]');
    else await convertAll(options);
  } catch (error) {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  }
}
