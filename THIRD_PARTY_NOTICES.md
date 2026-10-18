# Third-party notices

The published build uses the components below. This notice does not grant rights to the original game or assign one license to the entire repository. Detailed rights and distribution tracking: [issue #1](https://github.com/Legerdo/mystic-arts-web/issues/1).

| Component | Version | License / shipped text | Source |
|---|---|---|---|
| Phaser | 3.90.0 | [MIT](phaser/native-core/dist/licenses/phaser-MIT.txt) | [phaserjs/phaser](https://github.com/phaserjs/phaser/tree/v3.90.0) |
| Unicorn.js | 2.1.4 | [GPL-2.0](phaser/native-core/dist/licenses/unicorn-GPL-2.0.txt) | [AlexAltea/unicorn.js](https://github.com/AlexAltea/unicorn.js), [pinned npm package](https://www.npmjs.com/package/@alexaltea/unicorn-js/v/2.1.4) |
| Unicorn engine | 2.1.4 | GPL-2.0, included in Unicorn.js | [unicorn-engine/unicorn](https://github.com/unicorn-engine/unicorn/tree/2.1.4) |
| WebAudioTinySynth | 1.1.3 | [Apache-2.0](phaser/native-core/dist/licenses/tinysynth-Apache-2.0.txt) | [g200kg/webaudio-tinysynth](https://github.com/g200kg/webaudio-tinysynth) |

The Unicorn.js adapter exposes the existing WASM heap via a read-only getter. CPU/WASM bytes are unchanged. The exact recipe, version, and SHA-256 values are in [prepare.mjs](phaser/native-core/prepare.mjs) and [adapter-provenance.json](phaser/native-core/adapter-provenance.json). Build dependencies are pinned in lock files. Original copyright/license headers remain in the distributed JavaScript.

Mystic Arts (1998) is original COMPILE game content. Its executable and 63 other files are preserved byte-for-byte; no ownership or relicensing is claimed. Public availability or a preserved hash is not proof of redistribution permission. Unresolved rights/source-distribution questions remain in the linked issue.

BoxedWine, Wine and CNC-DDraw belong to the earlier research path and are **not shipped by the current Pages workflow**. Their historical notices are preserved in [BOXEDWINE-LEGACY-NOTICES.md](docs/BOXEDWINE-LEGACY-NOTICES.md).
