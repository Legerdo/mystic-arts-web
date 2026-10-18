# Runtime components

The original Mystic Arts executable and game data are user-supplied COMPILE game files.
They remain byte-identical. This project does not claim ownership of them.

The browser runtime uses the single-threaded **BoxedWine 26R1** WebAssembly release,
including its **Wine 6.0** filesystem and bundled **CNC-DDraw** compatibility library.
It does not execute a host Windows program, stream a desktop, or call a backend API.

- BoxedWine: GPL-2.0. Project and corresponding release source:
  https://github.com/danoon2/Boxedwine/tree/26R1.0
  https://github.com/danoon2/Boxedwine/releases/tag/26R1.0
- Wine: LGPL-2.1-or-later. Wine 6.0 source:
  https://gitlab.winehq.org/wine/wine/-/tree/wine-6.0
- CNC-DDraw: GPL-2.0. Project source:
  https://github.com/FunkyFr3sh/cnc-ddraw

The supplied Wine archive includes its own runtime data. No Windows system font is
copied into this project. A registry-only compatibility change maps the game's
legacy face names to Liberation Mono already present in the upstream filesystem.
The game's CNX graphics, including its title and menu lettering, are unchanged.

The only changed Wine entry is `home/username/.wine/system.reg`. Build metadata
records the original and modified registry hashes, the runtime input hash and all
original game-file hashes. `tools/build.mjs` contains the complete change recipe.

## MIDI output adapter

The upstream single-threaded SDL audio backend reports a MIDI device but its two
MIDI send methods return success without producing sound. This distribution
connects those two output methods to browser Web Audio. The original game's
WinMM/OSS events, ordering and bytes still determine the music.

The audited BoxedWine 26R1 WASM input SHA-256 is
`d4148bda3955e0378de56719c716610f2e1daffd3581d0a2085970ba4df1decf`.
Exactly one byte at file offset 18499 changes `A8` to `AA`, reserving two extra
function-table slots. The generated WASM SHA-256 is
`9361043967b4d5e71736999f3a777ae4033510107cd98d93dff188d9e36eb8e8`.
At instantiation, only the class-specific short/long MIDI vtable entries are
redirected to typed WASM host wrappers. All original 4776 function-table entries
and every original game file remain unchanged.

The exact modification source is shipped at
`runtime/patch-source/midi-wasm.mjs` and `src/midi-bridge.js`. The corresponding
upstream source is the 26R1.0 release linked above. BoxedWine's GPL text is
included as `runtime/BoxedWine-LICENSE.txt`.

The General MIDI output synthesizer is **WebAudioTinySynth 1.1.3**, by g200kg,
licensed under Apache-2.0. Its unminified code and license are shipped at
`runtime/tinysynth.js` and `runtime/tinysynth-LICENSE.txt`.
Source: https://github.com/g200kg/webaudio-tinysynth

General MIDI sound generation is browser-local and does not use Web MIDI devices,
external sound services or downloaded sound fonts. Its timbres need not be
identical to the user's Windows MIDI synthesizer. DirectSound effects retain the
original PCM data and use the upstream SDL Web Audio output path.
