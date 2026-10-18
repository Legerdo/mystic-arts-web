# Mystic Arts CNX v2 / GMP-200 graphics

## Status and tested inputs

All **47 original `Cnx/*.CNX` files** from the supplied Mystic Arts 1998 distribution decode successfully. The process is deterministic and does not modify the original game files.

| Measured item | Verified value |
| --- | ---: |
| CNX sources | 47 |
| Compressed bytes (including headers) | 1,962,495 |
| Decompressed GMP bytes | 11,078,876 |
| Decoded color-index pixels | 11,260,224 |
| 8-bit indexed sheets | 41 |
| 4-bit indexed sheets | 6 |
| Output files | 47 original CNX copies, 47 GMP, 47 indexed PNG, 1 manifest |
| PNG payload sum | 1,233,744 bytes |

The 47 CNX compressed-length headers match their source file lengths, all decompressed GMP headers have valid dimensions, palette/data offsets and exact bitmap lengths, and every generated PNG index matches its source GMP index without lossy color quantization. The independent Python/Pillow verification covered all 11,260,224 palette-index pixels and all palette entries (see *Verification*).

## Run on Windows 11

From the game root (`.../미스틱 아츠(Mystic Arts)`):

```powershell
node web/tools/decode-cnx.mjs
node web/tools/decode-cnx.mjs --check
```

For alternate source and output directories:

```powershell
node web/tools/decode-cnx.mjs --source "C:\path\to\Cnx" --output "C:\path\to\graphics"
```

`--check` is read-only: it decodes each original again, compares original CNX copies, uncompressed GMP bytes, generated PNG bytes and the manifest, then parses every PNG and checks its dimensions, palette, alpha key, CRCs and all rows of palette-index pixels. A mismatch exits nonzero. The decoder only uses Node.js built-ins (`fs`, `crypto`, `zlib`).

Output layout:

```text
web/public/assets/graphics/
  manifest.json
  thany_a1.png                 # Indexed PNG, top-left coordinates
  ttl.png                      # Full 640x480 image
  stgb01.png                   # Full 640x480 background
  ...                          # 47 PNG images
  original/thany_a1.cnx        # Byte-exact original CNX copy
  raw/thany_a1.gmp             # Byte-exact decompressed GMP
  ...                          # 47 of each binary file
```

No source file is changed or deleted. `original/` exists to expose the compressed original binary to a browser or diagnostics; `raw/` retains every GMP byte, including its original 4-byte palette entries and packed 4-bit pixel data.

## Verified binary layout

### CNX v2 compressed wrapper

| Relative offset | Size | Endianness | Meaning |
| --- | ---: | --- | --- |
| `0x00` | 3 | ASCII | `CNX` |
| `0x03` | 1 | byte | `0x02` (version) |
| `0x04` | 3 | ASCII | `GMP` (payload type) |
| `0x07` | 1 | byte | `0x10` |
| `0x08` | 4 | big-endian | Compressed payload byte count, excluding the 16-byte header |
| `0x0C` | 4 | big-endian | Uncompressed GMP byte count |
| `0x10` | variable | byte stream | LZ data |

Each control byte encodes four 2-bit operations, from **least significant to most significant**. Codes:

| Code | Encoded fields | Decoder action |
| --- | --- | --- |
| `0` | 8-bit `skip` | Advance compressed input by `skip` bytes, output nothing and leave the current four-operation group |
| `1` | `value: u8` | Write one raw byte |
| `2` | `pair: u16BE` | Copy from preceding output. `distance = (pair >>> 5) + 1` (`1..2048`); `length = (pair & 31) + 4` (`4..35`). Overlaps are copied byte by byte. |
| `3` | `length: u8`, then `length` literal bytes | Copy literal run |

Each game file terminates once the declared decompressed byte count is reached. Some have a final 2-byte `00 00` or 3-byte `FC 00 00` stream trailer left by compression padding. The decoder validates this footer instead of interpreting it as additional output.

### Decompressed GMP-200 image

| Relative offset | Size | Endianness | Meaning |
| --- | ---: | --- | --- |
| `0x00` | 8 | ASCII | `GMP-200\0` |
| `0x08` | 4 | little-endian | Height |
| `0x0C` | 4 | little-endian | Width |
| `0x10` | 4 | little-endian | Reserved (0 in all 47 files) |
| `0x14` | 4 | little-endian | Palette offset (`0x20`) |
| `0x18` | 4 | little-endian | Bitmap pixel offset (`0x20 + paletteCount * 4`) |
| `0x1C` | 2 | little-endian | Number of palette colors (`1..256`) |
| `0x1E` | 2 | little-endian | Bits per pixel (4 or 8) |
| `0x20` | 4 × colors | bytes | Palette entries in **blue, green, red, reserved** order |
| bitmap offset | `height × ceil(width × bpp / 8)` | bytes | Pixel rows, **bottom row first**, as BMP storage |

8bpp bytes directly index the palette. 4bpp stores two pixels per byte, **high nibble first**, followed by low nibble. The PNG converter reverses row order so image and `sourceRect` coordinates start at the top left. PNG color type 3 with an RGB `PLTE` chunk preserves the exact indices; for 4bpp, source nibbles are expanded to one byte per palette index with no color loss.

The source GMP palette's fourth byte is zero, including visible colors; it is the BMP reserved byte and must **not** be treated as alpha. The runtime transparency key is separate from this byte. For sprite/effect/front layer atlases, the generated PNG sets `tRNS` palette index `0` to fully transparent. Full backdrops (`ttl`, `stgb01..03`, `end01..04`, `roll`, `rogwall`) preserve index 0 as opaque. This render classification follows resource usage and visual inspection; the exact drawing mode must ultimately be checked against `Mystic.exe` drawing calls. Both original CNX and raw GMP preserve the true color of every palette entry, including index 0, allowing a different alpha policy at runtime when required.

## Browser loading and frame coordinates

Manifest URL: `/assets/graphics/manifest.json`.

`sheets` is a dictionary keyed by lowercase source file stem (`thany_a1`, `ttlmenu`, `stgb01`, ...). Relevant values:

```json
{
  "sheets": {
    "thany_a1": {
      "image": "/assets/graphics/thany_a1.png",
      "cnx": "/assets/graphics/original/thany_a1.cnx",
      "gmp": "/assets/graphics/raw/thany_a1.gmp",
      "kind": "character-atlas",
      "width": 640,
      "height": 616,
      "sourceBitDepth": 8,
      "pngBitDepth": 8,
      "paletteColors": 128,
      "paletteOffset": 32,
      "rawPixelOffset": 544,
      "transparentIndex": 0,
      "frames": [{ "id": "sheet", "x": 0, "y": 0, "width": 640, "height": 616 }]
    }
  }
}
```

Additional metadata per sheet: `sourceName`, `compressedBytes`, `gmpBytes`, `paletteBGRA` (hex-encoded original bytes), `pixelCount`, `nonzeroIndexPixels`, `sourceSha256`, `gmpSha256`, `indicesSha256`, `pngSha256`, and command counts in `compression`. The `paletteBGRA` values retain **all** original GMP palette bytes. Source and pixel hashes make validation independent of PNG display quirks.

Render as an entire image:

```js
const manifest = await fetch('/assets/graphics/manifest.json').then(r => r.json());
const sheet = manifest.sheets.thany_a1;
const image = new Image();
image.src = sheet.image;
await image.decode();
ctx.drawImage(image, 0, 0); // example position
```

To render a sub-frame, retrieve the original game's source rectangle `(x, y, width, height)` and pass it directly to canvas. For example:

```js
const sourceRect = { x: 0, y: 0, width: 64, height: 64 }; // illustrative; verify in game code
ctx.drawImage(image, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
  100, 100, sourceRect.width, sourceRect.height);
```

**Animation boundary:** CNX/GMP is an image container; its header has no pose count, frame timing, named animation states or per-pose source rectangles. Several sheets pack sprites with varying widths and row heights, so cutting them into a guessed grid would change the original behavior. The manifest provides one lossless full-atlas `frames[].id = "sheet"` rectangle per image; identifying action-specific frame rectangles and animation order remains a separate EXE/script analysis task. Clients can immediately draw any verified source rectangle using the exact PNG pixels. `frames` is deliberately not advertised as a complete animation state machine.

## Verification and reproducibility

The following checks were executed with Node.js 24.13.0 on Windows, using the exact shipped game files:

1. `node web/tools/decode-cnx.mjs`: **PASS**, 47 sources decoded, 11,260,224 indexed pixels.
2. `node web/tools/decode-cnx.mjs --check`: **PASS**, 47 source copies / GMP / PNG / manifest compared byte-for-byte; PNG inflate, CRCs, dimensions, palettes, transparency and each row checked.
3. Independent Python 3.13 + Pillow verification: **PASS**, 47 source CNX files decompressed by a separate implementation, matched all generated raw GMP copies, compared palette bytes and all 11,260,224 indexed pixels to Pillow-decoded PNGs; confirmed transparent palette indices and source SHA-256 hashes.

Observed images include 640×480 `ttl` and `stgb01..03`, 640×616 `thany_a1/a2`, 640×592 `wiz`, 640×432 `wolf_l/r`, 640×128 `gage`, and 640×352 4bpp `ttlmenu`. `sfont.CNX` has all-zero pixel bytes in the original source; its empty appearance after conversion is **verified source data**.

Independent format descriptions consulted during implementation:

- [Puyo Tools CNX decompression by drx](https://github.com/memerdot/puyotools-1/blob/master/PuyoTools.Modules/Compression/Formats/CnxCompression.cs) for the CNX command classes and 2048-byte LZ window.
- [CompileTools LZ77CNX](https://github.com/M-bot/CompileTools/blob/master/CompileTools/LZ77CNX.cs) for control-bit order and match encoding.
- [CompileTools GMP200](https://github.com/M-bot/CompileTools/blob/master/CompileTools/GMP200.cs) for image header, palette and BMP-compatible row storage.

The decoder and validator here were implemented in JavaScript and executed directly against this game's 47 files; external format documentation alone was not used as a success criterion.
