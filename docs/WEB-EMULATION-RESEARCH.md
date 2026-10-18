# Mystic Arts 웹 에뮬레이션 대안 및 고속 x86 실행 경로 조사

> 후속 실험: [2026-10-18 실행·정적 호스팅 재검증](WEB-EMULATION-RESEARCH-20261018-UPDATE.md).
> 아래는 선행 조사 기록이다. 후속 기록에는 Wine-Assembly의 실제 원본 실행 실패와 GitHub Pages 공유 메모리 성공 증거가 추가됐다.

조사 기준일: **2026-10-18**. 공식 프로젝트 문서·릴리스·원본 저장소와 이 프로젝트의 고정된 측정 파일을 근거로 한다. 이 문서의 판단은 **Mystic.exe 자체의 Win32 x86 코드를 그대로 실행하며 원본 게임 속도·입력·그래픽·음악을 보존하고, 일반 GitHub Pages 정적 파일만으로 서비스할 수 있는가**에 한정한다. 아래의 다른 게임/에뮬레이터 개발자 시연은 Mystic Arts의 30–60fps 증거가 아니다.

## 판정 및 증거의 경계

**현 기준에 즉시 교체 가능한 검증 완료 백엔드는 없다.** 우선 조사·실행 후보는 **BottleShip의 Win32 PE 직접 실행+v86 기반 WASM JIT+DirectDraw HLE**이고, 기존 BoxedWine 26R1에 대해서는 **WASM JIT이 없는 구조적인 인터프리터 병목**이 실제 데이터로 확인됐다. BottleShip은 원본 바이너리를 입력으로 삼고 서버 측 게임 실행이 필요 없지만, 공식 소스의 **WinMM MIDI 출력·스트림 미구현**이 Mystic의 음악 동등성을 직접 가로막는다. 따라서 *장면 출력 및 CPU 성능을 먼저 시험*하더라도 BGM까지 그대로 동작한다고 보고 배포해서는 안 된다.

증거 등급: **[L]** 로컬 원본 파일·실측 재현 자료, **[S]** 공급자 공식 구현·릴리스의 확인 사실, **[D]** 공급자 자체 호환성 보고(독립 검증 아님), **[H]** 이 프로젝트에 적용 가능하다는 가설/미실행 실험이다.

| 실행 경로 | 원본 Win32 PE 그대로 입력 | 별도 Windows OS 이미지 없이 정적 호스팅 | 빠른 x86 실행 원리 | 현 판정 |
| --- | --- | --- | --- | --- |
| **BottleShip 0.7 / 이후 main** | **예** | **조건부**: 브라우저 WebGPU·SAB/COI; GH Pages에서 COI-SW·파일 로딩 검증 필요 | v86 파생 x86→WASM **동적 JIT**, hot HLE WASM 경로 | **최우선 격리 실험**. WinMM MIDI 부족, 실제 Mystic/30fps 미검증 |
| **현재 BoxedWine 26R1 SingleThreaded** | **예**, Wine을 통해 현재 작동 | **예**, 이미 배포 검증 | `NormalCPU` decoded-op **인터프리터**, 현재 Web/WASM JIT 없음 | **검증된 호환성 기준선 유지**. CPU 포화로 목표 미달 |
| BoxedWine MultiThreaded / 자체 WASM dynarec 구현 | 예 | **조건부**: COI-SW, 게스트 스케줄러·오디오 회귀 필요 | 전자는 기존 인터프리터 병렬 실행, 후자는 **새 번역기 개발**이 필요 | 1차 선택 아님. 네이티브 JIT을 WASM에서 옵션만 켜는 경로는 없음 |
| **wemu** | 예 | 공식 웹 플레이어 있음 | Rust Win32 HLE, fastmem형 guest memory | 대안 실험 후보. **사운드 출력 미구현**, 범용 게임 검증 부족 |
| **v86 단독** | Windows 게스트 안에서는 예 | OS/드라이버 디스크 이미지·브라우저 메모리·배포 요건 추가 | x86→WASM 동적 JIT | CPU 기술 참고. 직접 게임 실행 대체재 아님 |
| **CheerpX** | 직접 Win32 PE는 **아니오** | 조건부 COI·CDN·사용 라이선스 | Linux 사용자 공간 x86→WASM JIT | Windows Win32/DirectDraw/Wine 접착층 부재로 현재 기각 |
| **Theseus** 정적 번역 | 원본 PE를 **번역 입력**으로 사용, 결과물은 Rust/WASM 별도 빌드 | 결과 앱의 브라우저 빌드는 가능 | x86→Rust→WASM **AOT**, API 지원 수동 작성 | 장기 R&D만. 범용 Win32 1998 게임 재컴파일은 입증되지 않음 |
| DOSBox-X 웹 포트 / PC-98 / EmulatorJS 콘솔·아케이드 | **아니오** 또는 OS 안에서 간접 실행 | 일부 정적 웹 사례 존재 | 별도 하드웨어/OS/게임 ROM 에뮬레이션 | **Mystic.exe 64개 자산을 유지한 대체 경로로 기각** |

### 실제 기준선 [L]

- 현재 배포는 BoxedWine `26R1.0`, SingleThreaded WASM, Wine 6, CNC-DDraw GDI, MIDI 브리지다. 원본 `Mystic.exe` **914,944바이트**, SHA-256 **`285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`**, 64개 원본 파일 모두 불변.
- `docs/PERFORMANCE-RUNTIME-AUDIT.md`, `test-results/performance/{baseline-frames,tail-all,tail-o3}/performance.json`: Stage1 변경된 게임 화면 **11.93/12.23 fps**, 1,192개 WASM 간접 tail call 후 **14.95/14.96 fps**, 이 버전 Binaryen 131 `-O3` 후 **16.24/15.60 fps**. 서로 다른 약 9.7초 2회 구간이다. 실측 CPU TaskDuration은 baseline 실경과 약 9.7초와 같아 **CPU 98%대 포화**였다.
- Canvas `putImageData` 평균 약 **0.033 ms**, Emscripten `runIter` 평균 약 **11.4–11.6 ms**. 초당 Canvas present 약 65회는 *이전 동일 이미지 재출력 포함*이므로 **실제 게임 FPS가 아니다**. rAF/GUI 출력만 60으로 맞추는 실험은 성과로 계산하지 않는다.
- 로컬 CPU 프로파일의 상위 `wasm-function[561]` decoded-op handler **13.35%**, `[3743]` 게스트 32-bit 메모리 읽기 **10.45%**, `[1772]` 다른 decoded-op **8.17%**, `[4188]` 스케줄러 **7.26%**다(2,853 CPU 샘플 함수명 합산). GPU 가속만으로 30–60fps를 예측할 근거가 없다.
- WinMain은 `PeekMessageA`와 `timeGetTime`을 반복하면서 약 **16 ms 논리 시간 게이트**, `SKIP` 분기/WinMM 타이머 콜백을 운용한다(`docs/PERFORMANCE-TIMING-AUDIT.md`). 화면 변화율이 떨어진 원인을 게임 로직 12Hz 확정으로 해석하면 안 된다. `SKIP` 변경, 원본 timer/hitbox/물리 속도 변경은 성능 해법에서 제외한다.

현재 기준 **12fps → 30fps는 약 2.5배, 60fps는 약 5배**의 실질 처리량이 요구된다. 16fps 연구본에서도 각각 약 **1.9배 / 3.75배** 추가 향상이 필요하다. 이 배수는 필요조건의 규모일 뿐 특정 JIT을 채택하면 달성된다는 예측값이 아니다.

## 1. Puyo Puyo/Compile 브라우저 사례: 무엇을 실제로 돌리는가

**동일 제작사/유사 화면 스타일과 동일 Windows 실행파일은 전혀 다른 대상이다.** [MAME System C/C2 드라이버](https://github.com/libretro/mame2003-plus-libretro/blob/master/src/drivers/segac2.c)는 실제 `puyopuyo`(1992 Sega/Compile), `puyopuy2`(1994 Compile/Sega 라이선스) **아케이드 68000/보호칩/VDP ROM**을 구동한다. 드라이버 주석부터 Genesis와 메모리 배치가 *유사하되 다르다*고 설명한다. Puyo의 Mega Drive/Genesis, SNES 게임들은 그 기기의 별도 ROM 버전이다. **1998 Win32 Mystic Arts의 PE 헤더·WinMM MIDI·DirectDraw 8bpp·DirectInput·CNX 자산은 이 아케이드/콘솔 ROM 안에 들어 있지 않다.**

| 공식 소스/실제 웹 구현 | 확인할 수 있는 일 | Mystic 목표와의 관계 |
| --- | --- | --- |
| [EmulatorJS 코어 목록](https://emulatorjs.org/docs4devs/cores/): `genesis_plus_gx`(`segaMD`), `snes9x`/`bsnes`(`snes`), `fbneo`(`arcade`), `mame2003_plus`(`mame2003`) | 각 하드웨어·ROM용 WASM/JS 브라우저 플레이어. 게임마다 적합한 ROM과 에뮬레이터 코어가 있어야 함 | **다른 판본의 Puyo만** 가능. Windows `Mystic.exe`를 ROM처럼 올려 구동하지 못함 |
| [MAME 0.217/Emscripten System C2 실험 기록](https://gist.github.com/h1romas4/a048aca9b3284eb587ecb2cfa0511f08) | `mame0217` 태그 + 당시 Emscripten **1.39.6 fastcomp**, `SUBTARGET=segac2`; 산출 `mamesegac2.wasm` **21,039,864B**, `mamesegac2.js` **3,491,547B**. [Emularity](https://github.com/db48x/emularity) `JSMAMELoader.driver("puyopuy2")`와 `puyopuy2.zip` 로딩 코드 존재 | **오리지널 아케이드 ROM 대상 WASM 컴파일/브라우저 로더 코드 증거**. 다만 독립적인 실플레이·FPS 계측은 기록되지 않았고 구형 fastcomp는 이후 폐기, 현대 빌드 보장도 아님 |
| [h1romas4/wasm-genplus](https://github.com/h1romas4/wasm-genplus) | Sega Mega Drive/Genesis Plus GX Emscripten WASM 포트 및 ROM 실행 프런트엔드 | 실제 MD ROM 실행 사례이나 **다른 게임 플랫폼**. Mystic용 성능 자료 아님 |
| [uraraworks/WebNP2](https://github.com/uraraworks/WebNP2): NP2kai→WASM PC-98 | [웹 데모](https://uraraworks.github.io/WebNP2/)는 FreeDOS(98) 및 소유한 PC-98 HDD/FD 이미지를 구동 | PC-98은 NEC 독자 PC 아키텍처/게임 매체. Mystic Win32 PE를 그대로 실행하는 솔루션 아님 |
| [Lumapuyo](https://github.com/kamoi-kenichi/lumapuyo) | 공식 README가 Vanilla JavaScript로 새로 제작한 *Puyo Puyo 영감의 퍼즐*이라고 명시 | **팬클론/독립 게임 구현**. 원본 ROM/Win32 실행, 정밀한 타이밍 호환, FPS 증거가 아님 |

Puyo 사례에서 배울 점은 **게임에 맞는 CPU·하드웨어 추상화 계층을 제거하거나 단순화하면 웹 실행이 가능**하다는 설계 원리뿐이다. Mystic의 EXE를 다른 ROM/클론으로 대체하면 요구조건을 위반한다. EmulatorJS 프런트엔드 자체 [GPL-3.0](https://github.com/EmulatorJS/EmulatorJS/blob/main/LICENSE)이며 개별 코어(Genesis Plus GX·Snes9x·FBNeo 등)는 **별도의 라이선스**를 확인해야 한다. 프런트엔드 오픈소스는 Puyo ROM이나 원작 게임 배포 허가를 뜻하지 않는다.

## 2. 원본 Mystic.exe에서 직접 확인한 Win32 의존성 [L]

`../Mystic.exe`를 **읽기 전용**으로 PE32 optional header→IMAGE_IMPORT_DESCRIPTOR/IAT→각 이름 RVA를 해석했다. SHA-256과 크기를 위 원본 고정값과 대조했다. 이 값은 `lab/pe-imports.json`과 **출처가 다르다**. 그 JSON의 `cnc71`·`wine` 섹션은 주로 **CNC-DDraw DLL/번들 Wine DLL**을 검사한 데이터이므로 **Mystic.exe 자체의 import로 혼동하면 안 된다.**

| 직접 import DLL | API 개수 | 교체 런타임의 필수 확인 경로 |
| --- | ---: | --- |
| `WINMM.dll` | **19** | `timeGetTime`, `timeGetDevCaps`, `timeBeginPeriod`, `timeEndPeriod`, **`timeSetEvent`/`timeKillEvent`**, `midiStreamOpen`, `midiStreamOut`, `midiStreamProperty`, `midiStreamPause`, `midiStreamRestart`, `midiStreamClose`, `midiOutShortMsg`, `midiOutPrepareHeader`, `midiOutUnprepareHeader`, `midiOutReset`, `midiOutGetVolume`, `midiOutSetVolume`, `joyGetPosEx` |
| `DDRAW.dll` | **1** | `DirectDrawCreate` → 8bpp/256색 palette, surface lock/blit, 원본 해상도·클리핑·창 모드 |
| `DINPUT.dll` | **1** | `DirectInputCreateA` 및 반환 COM device 메서드·키보드/패드 상태 |
| `DSOUND.dll` | **1** | `DirectSoundCreate` 및 반환 COM buffer/PCM 재생 |
| `KERNEL32.dll` | **71** | 파일/경로/heap/시간/loader/registry 관련 간접 경로; `LoadLibraryA`·`GetProcAddress`로 추가 동적 호출 가능 |
| `USER32.dll` | **37** | `PeekMessageA`, `PostMessageA`, `CreateWindowExA`, `GetMessageA`, `DispatchMessageA`, keyboard/window/input |
| `GDI32.dll` | **13** | `EnumFontFamiliesA`, `CreateFontA`/`CreateFontIndirectA`, `TextOutA`, `StretchDIBits` 등, 폰트 열거 문제 재발 여부 |
| `ADVAPI32.dll` | **3** | `RegOpenKeyExA`, `RegQueryValueExA`, `RegCloseKey` |

**중요:** 이 표는 PE import가 존재한다는 증거일 뿐 모든 함수가 게임의 모든 구간에서 실행된다는 증거는 아니다. `ddraw.dll`·`dinput.dll` 등이 COM 메서드, `GetProcAddress`, 콜백으로 호출하는 추가 API는 목록에 나오지 않는다. 전반적인 커버리지는 **실제 실행 트레이스**로 확인해야 한다. 원본 창은 약 640×480 8비트 DirectDraw 경로이며 브라우저 호스트의 32비트 Canvas와 혼동하면 안 된다.

## 3. 1순위: BottleShip Win32 HLE + 동적 WASM JIT

- **소스 및 고정 버전:** [jenissimo/bottleship](https://github.com/jenissimo/bottleship), Apache-2.0 + [third-party notices](https://github.com/jenissimo/bottleship/blob/main/THIRD-PARTY-NOTICES.md). **`v0.7.0`** 2026-10-08, 태그 객체 `225dead4c4f7e442ae7466e73ee6b518003d3213` → **커밋 `c5954ad764e280d7f31d7f6f40f0d5191b9bf3e8`**. 이후 분석한 **main 커밋 `2e1746cdf196a0b57d605ac3519040cc2a1f9406`(2026-10-12)**. 차후 동일 코드를 재현할 때는 commit pin 필수.
- [README](https://github.com/jenissimo/bottleship/blob/main/README.md)·[아키텍처](https://github.com/jenissimo/bottleship/blob/main/docs/architecture.md): 원본 `.exe`를 PE loader가 직접 매핑하고 v86 파생 x86→WASM **JIT**로 게스트 코드를 실행. Windows OS 부팅·Wine/x86 Linux 에뮬 없이 Win32 thunk, DirectDraw/Direct3D→WebGPU, DirectSound/`waveOut`→WebAudio/AudioWorklet, 가상 파일·레지스트리→OPFS. JS hot call 일부는 WASM 내부에서 처리한다. 소유한 원본 게임 폴더 드롭과 `.wgb` 클라이언트 패키지가 지원된다.
- [`v0.7.0` 릴리스](https://github.com/jenissimo/bottleship/releases/tag/v0.7.0)는 **53개 게임 호환성** 및 “일부 게임 FPS 개선”을 *개발자 진술*로 제공하며 **Mystic Arts 프레임 자료는 없다**. [호환성 목록](https://github.com/jenissimo/bottleship/blob/main/docs/compatibility.md)은 2026-10-08 업데이트로 일부 1998년대 DirectDraw 게임을 `playable`로 표기한다. 이 상태는 제목/버전별로 상이하고 모든 최신 빌드에서 독립 재검증된 것이 아니다. `v0.7` **AOT는 실행 중 이미 생성한 JIT WASM을 기록해 다음 실행에 재사용**하는 기능으로, 사전 완전 재컴파일·근본적인 실행 FPS 가속을 보장하지 않는다.
- **미디를 확인한 소스:** [main `src/worker/modules/winmm-caps.ts`](https://github.com/jenissimo/bottleship/blob/2e1746cdf196a0b57d605ac3519040cc2a1f9406/src/worker/modules/winmm-caps.ts#L1-L40)의 주석은 **“MIDI out/in: NONE. There is no synthesizer”**라고 명시, `MIDI_OUT_DEVICES=0`. [154–187행](https://github.com/jenissimo/bottleship/blob/2e1746cdf196a0b57d605ac3519040cc2a1f9406/src/worker/modules/winmm-caps.ts#L154-L187)은 `midiOutOpen`/`midiStreamOpen`에 `MMSYSERR_BADDEVICEID`, `midiStreamOut`/`midiOutShortMsg`에 invalid-handle을 반환한다. **Mystic이 직접 import하는 바로 그 함수들이다.** release `v0.7.0`의 동명 파일에도 이 정책이 존재한다. 따라서 **원본 MIDI BGM이 현행 BottleShip에서 동일 출력된다는 주장은 기각**한다.
- 반대로 [`timeSetEvent` 구현](https://github.com/jenissimo/bottleship/blob/2e1746cdf196a0b57d605ac3519040cc2a1f9406/src/worker/modules/winmm.ts#L1349-L1450), [`DirectInputCreateA` 구현](https://github.com/jenissimo/bottleship/blob/2e1746cdf196a0b57d605ac3519040cc2a1f9406/src/worker/modules/dinput/dinput.ts#L563-L585), [`EnumFontFamiliesA` 콜백 지원](https://github.com/jenissimo/bottleship/blob/2e1746cdf196a0b57d605ac3519040cc2a1f9406/src/worker/modules/gdi32/font-enumeration.ts)은 코드상 확인된다. 이 함수들이 Mystic의 특정 사용 패턴과 정확히 맞는지는 실행 결과로 증명해야 한다.
- [개발/자체 호스팅 공식 문서](https://github.com/jenissimo/bottleship/blob/main/docs/development.md) 요구사항은 빌드용 **Bun**, 클라이언트 브라우저 **WebGPU + SharedArrayBuffer**, 웹 문서의 **COOP/COEP**, 대형 `.wgb` 스트리밍 시 **HTTP Range/강한 ETag**다. `bun run build`가 생성하는 `dist/` 정적 파일 및 사용자가 선택한 파일을 OPFS로 가져오는 경로는 GitHub Pages 실험 대상. **Bun은 개발/빌드 도구이고 방문자 PC에 설치할 필요는 없다.**

**장점:** CPU/Wine/Linux syscall/Win32 thunk 여러 겹을 거치는 현재 경로에 비해 x86 JIT과 Win32 HLE의 결합은 구조상 CPU 비중을 줄일 가능성이 있다. **위험:** JIT 생성/단축 hot API 자체 비용, 포맷/자산 경로·CNX, 8bpp surface의 lock/palette/primary blit, WinMM `midiStream`·callback 순서, DirectInput, Win32 tick·SKIP, 브라우저 WebGPU 제한은 게임별 호환성 문제다. **실측 FPS 향상은 아직 확인되지 않았다.**

Mystic의 Win11/BoxedWine 구성에서 쓰는 외부 `CNC-DDraw`를 처음부터 반드시 로딩한다고 가정하지 않는다. BottleShip의 **자체 DirectDraw HLE가 원본 `Mystic.exe`의 8bpp 동작을 제공할 수 있는지** 먼저 원본 64개 자산만으로 격리 실행하고, 필요할 경우 `CNC-DDraw` 의존 DLL `AVIFIL32`/native hook까지 별도로 분석한다. EXE 패치·게임 규칙 변경은 하지 않는다.

## 4. 다른 Win32/x86 실행 엔진의 실제 경계

### BoxedWine [S/L]

[`26R1.0` 공식 릴리스](https://github.com/danoon2/Boxedwine/releases/tag/26R1.0)는 커밋 **`d7d5a1421bd781a81cbdf8f222cced11a7ebd76e`**, GPL-2.0이고 “**50% faster for all platforms except Web/WASM**”이라고 정확히 명시한다. 따라서 **26R1의 50% 성능 개선을 브라우저 성능 근거로 적용할 수 없다.** [공식 CPU 에뮬레이션 문서](https://github.com/danoon2/Boxedwine/blob/master/docs/CPUemulation.md)는 Web/Emscripten 빌드는 `NormalCPU` decoder+간접 호출 인터프리터만 사용하며, 네이티브 JIT은 **x86/x64/ARMv8**에 구현됐다고 명시한다. “멀티스레드 50% 빠름”은 해당 문서의 일반 설명일 뿐 이 원본 게임·브라우저·실제 화면 FPS의 벤치마크가 아니다. 게스트 CPU를 여러 스레드에서 나눠도 오디오/게임 루프 동기화·COI가 따라와야 한다.

**실행 가능한 후속 최적화:** (1) `KMemory::readd/writed` page-table lookup+CPU dispatch 계측, (2) 원본 Busy PeekMessage/WinMM/GDI 호출 간 실제 CPU 샘플 분할, (3) 조건 보존된 decoded-op fusion/블록 실행 및 캐시 전략의 격리 A/B, (4) 궁극적으로 WASM 런타임용 x86→WASM **JIT 설계·개발**. 이 중 (4)는 v86 동작기와 BoxedWine의 게스트 메모리, Wine/Linux syscall ABI, 자체 decoded-op cache invalidation을 통합해야 할 새 프로젝트다. 현재 WASM 파일에 이미 native JIT 코드가 있어 단순 스위치로 활성화되는 상태가 아니다.

### v86 [S]

[copy/v86](https://github.com/copy/v86)은 **BSD-2-Clause** 라이선스의 full x86 PC/주변장치 에뮬레이터이며 CPU 코드를 실행 중 WASM 모듈로 변환하는 **실제 x86→WASM JIT**이 있다. 32비트 Windows 95/98 등을 **OS 이미지로 부팅하는 데모**가 있어도, 원본 Mystic의 Win32 API/DirectDraw가 가상 PC 내 Windows와 그래픽·사운드 드라이버에서 정상 작동한다는 증거는 아니다. Windows OS 이미지·라이선스·부팅시간/용량, 메모리 점유, 오디오와 palette, GH Pages 파일 크기/로딩 이슈가 더해진다. **CPU 번역기 원리·BottleShip 파생 구현 조사에는 유용**, Mystic PE를 OS 없이 실행하는 최단 경로로는 부적절.

### CheerpX [S]

[CheerpX 공식 개요](https://cheerpx.io/docs/overview)·[시작 가이드](https://cheerpx.io/docs/getting-started)에서 확인되는 것은 **브라우저의 x86 Linux 사용자 공간 ELF/시스템 호출 호환 실행**과 JIT이다. Windows `Mystic.exe` PE loader, Win32/DirectDraw, Wine6 그래픽 드라이버·OSS/ALSA까지 제공한다는 근거는 없다. Wine binary와 Linux 런타임을 얹는 작업을 따로 수행해야 하며 이 프로젝트에서 아직 실증하지 않았다. 공식 가이드는 COI/SAB를 요구한다.

[CheerpX 라이선스 원문](https://cheerpx.io/docs/licensing)은 개인·평가·상업·배포 방식마다 다르며, **런타임 자체 self-host는 commercial license 대상**이라고 명시한다. GitHub Pages에 라이선스와 무관하게 CheerpX 런타임을 직접 복사/호스팅할 수 있다고 가정하면 안 된다. CDN을 사용하는 허용 범위와 운영 주체를 먼저 확인해야 한다. 추가 Win32 구성 없는 현 상황에서는 성능 비교 실행의 1순위에서 제외.

### wemu / retrowin32 / Theseus [S/H]

- [44670/wemu](https://github.com/44670/wemu), [공식 사이트](https://wemu.dev/)는 **Apache-2.0**, Rust/WASM의 직접 PE 적재·Win32 HLE·DirectDraw/GDI·fastmem형 게스트 메모리를 표방한다. 정적 브라우저 앱과 로컬 ZIP 업로드가 가능하다. 다만 사이트 스스로 **사운드 출력 미구현**, missing x86 instruction/API, 게임 커버리지 실험 중이라고 명시한다. 원본 `DSOUND`·`WINMM MIDI` 보존에 적합하다고 판단할 근거 없음. 대안 CPU 구조의 read-only 참고 및 별도 짧은 부팅 검사 수준.
- [evmar/retrowin32](https://github.com/evmar/retrowin32)의 공식 README는 **개발 중단** 및 Theseus로 전환을 선언했다. 구 데모/DirectDraw 몇 개는 원본 Mystic 호환 근거가 아니다.
- [evmar/theseus](https://github.com/evmar/theseus)는 Windows/DOS x86 `.exe`를 **Rust 소스**로 정적 변환하고 WASM으로 빌드할 수 있다고 설명하며 지원 Win32 API는 일부이다. README는 “실험적, 임의 프로그램은 대개 실패” 및 프로그램별 추가 Rust 지원 코드 필요를 명시한다. **원본 EXE 파일은 번역 입력으로 불변**일 수 있으나, 브라우저가 실행하는 대상은 원본 PE가 아니라 새로 빌드된 WASM 프로그램이다. '바이너리 원본을 직접 실행' 조건을 엄밀히 적용할 때는 별도 승인 없이 대체 불가. 컴파일러 **Apache-2.0**과 생성물의 게임 저작권·배포 권한은 서로 다른 문제다.

### DOSBox-X의 웹 포트 및 PC-98 [S]

[DOSBox-X 공식 저장소](https://github.com/joncampbell123/dosbox-x)·[공식 Windows 98 설치 안내](https://github.com/joncampbell123/dosbox-x/wiki/Guide%3AInstalling-Windows-98)에 따르면 DOSBox-X는 **DOS·Win3.x 및 설치된 Windows 95/98/ME 게스트**를 위한 PC/PC-98 에뮬레이터다. 원본 `Mystic.exe`는 DOS 실행 파일이 아니므로 직접 `DOSBox-X.exe`에 투입할 수 없다. GitHub의 [`yksoft1/dosbox-x-vanilla-sdl` Emscripten 분기](https://github.com/yksoft1/dosbox-x-vanilla-sdl/tree/emscripten)(브랜치 HEAD `c1bb5ebbc618b73616f2326c402c4410fb66255c`, 2019년 계열)는 **서드파티 웹 이식 실험**이지 현재 upstream DOSBox-X의 공식 Win98/DirectDraw 웹 호환 보증이 아니다. 메모리·Windows 이미지·Win9x DirectDraw 드라이버 및 게임 성능을 추가 검증해야 한다. [WebNP2/NP2kai](https://github.com/uraraworks/WebNP2)는 PC-98 소프트웨어/디스크를 브라우저로 가져오는 연구에는 의미가 있으나 이 Windows PE의 직접 실행 엔진은 아니다.

## 5. 일반 GitHub Pages 정적 호스팅과 Cross-Origin Isolation

GitHub Pages는 [공식 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)에 따라 정적 자산 게시를 제공하며 임의 서버 코드/게임 서버 프로세스를 돌리지 않는다. HTML에 COOP/COEP HTTP 헤더를 직접 지정하기 어려운 환경에서 [gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker/blob/master/README.md)(MIT)의 방법이 **기술적으로 가능한 브라우저 측 우회**다. 이 도구는 **Service Worker가 제어하는 문서 응답에 COOP/COEP를 삽입하고 첫 방문에 페이지를 자동 reload**한다. 배포 시 JS는 반드시 **동일 origin의 별도 파일**로 두며 CDN 번들에 넣지 않고 HTTPS/localhost에서 등록한다.

개념상 GitHub Pages `/repo/` 하위 경로에 `index.html`과 `coi-serviceworker.js`를 나란히 두고 초기화 시 `<script src="./coi-serviceworker.js"></script>`를 실행한다. **SW가 활성화된 두 번째 navigation부터** `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`에 해당하는 isolation이 생기는지 개발자 도구로 직접 확인한다. 실제 성공 조건은 `window.crossOriginIsolated === true`, `typeof SharedArrayBuffer === "function"`, `navigator.gpu` 사용 가능, WASM worker/AudioWorklet/OPFS 정상, game ZIP/`.wgb` 가져오기 및 재방문 후 저장 유지다. SW 제어 밖 첫 방문, SW 제한 브라우저, private mode, cross-origin 폰트/CDN/CORP, 기존 범위의 다른 SW와 충돌, nested GH Pages path는 실패 가능성이 있다. **SW만 넣는다고 자동 FPS가 올라가지는 않는다.**

**BottleShip과의 정확한 접점:** 공식 [development.md](https://github.com/jenissimo/bottleship/blob/main/docs/development.md)는 COOP/COEP, SAB, WebGPU가 필요하고 **대형 파일을 서버에서 부분 읽기 하려면 Range/강한 ETag**를 요구한다. SW로 COI를 공급해도 **바이트 범위 응답/ETag를 생성·보장하는 것은 별도 문제**다. 파일 선택/drag-drop→브라우저 로컬 OPFS에 스테이징해서 **서버 측 Range 경로를 쓰지 않는** 격리 실험을 우선하고, 공개 정적 `.wgb` 링크로 서비스할 때는 HTTP **206 Content-Range / ETag / 재요청 조건**을 별도로 검사한다. 서버에 게임 실행 API를 둬 우회하거나 사용자가 서버를 설치하는 구조는 기각한다.

## 6. 라이선스 및 게임 파일

| 후보 | 공급자 공식 라이선스 | 이 프로젝트에서 주의할 점 |
| --- | --- | --- |
| BoxedWine 26R1 + Wine6 + CNC-DDraw | [BoxedWine GPL-2.0](https://github.com/danoon2/Boxedwine/blob/26R1.0/license.txt), [Wine LGPL-2.1+](https://gitlab.winehq.org/wine/wine/-/tree/wine-6.0), [CNC-DDraw GPL-2.0](https://github.com/FunkyFr3sh/cnc-ddraw), `THIRD_PARTY_NOTICES.md` 참조 | 현재 빌드/배포가 수정된 WASM과 각 라이선스/소스 공개 의무를 충족하는지 유지 |
| BottleShip | [Apache-2.0](https://github.com/jenissimo/bottleship/blob/main/LICENSE) + v86 BSD-2 등 [서드파티 고지](https://github.com/jenissimo/bottleship/blob/main/THIRD-PARTY-NOTICES.md) | MIT/BSD/Apache 외 번들된 BIOS·FFmpeg·폰트·코어 라이선스를 재배포 아카이브별 확인 |
| v86 / coi-serviceworker / wemu | [v86 BSD-2](https://github.com/copy/v86/blob/master/LICENSE), [coi-serviceworker MIT](https://github.com/gzuidhof/coi-serviceworker/blob/master/LICENSE), [wemu Apache-2.0](https://github.com/44670/wemu/blob/main/LICENSE) | 각 소스 고지 보존. 라이선스 표기는 프로젝트 자체 기준이며 게임 파일 허가와 무관 |
| EmulatorJS + 각 콘솔 코어 | [EmulatorJS GPL-3.0](https://github.com/EmulatorJS/EmulatorJS/blob/main/LICENSE) 및 코어별 상이 | console/arcade ROM 권리/재배포와 프런트엔드 라이선스는 별도로 검토 |
| DOSBox-X / Theseus / CheerpX | [DOSBox-X GPL-2.0](https://github.com/joncampbell123/dosbox-x), [Theseus Apache-2.0](https://github.com/evmar/theseus), [CheerpX 사용조건](https://cheerpx.io/docs/licensing) | Windows OS 이미지 및 자체 호스팅 상용 라이선스 여부 별도 검토 |

원본 Mystic Arts의 EXE와 64개 데이터는 **사용자 보유 파일**로서 바이트가 같더라도 저작권·공개 재배포 허가가 자동 생성되지는 않는다. 대안을 시험할 때 게임 파일을 외부 공개 저장소/서드파티 서버에 자동 업로드하거나 오픈소스 라이선스에 편입했다고 주장하지 않는다. 원본 exe와 컨텐츠 해시를 함께 검증한다.

## 7. 추천하는 단일 실행 실험 및 기각 기준

1. **[최우선, 독립 실험] BottleShip commit `2e1746cdf196a0b57d605ac3519040cc2a1f9406` 고정.** 원본 `Mystic.exe`+64개 리소스를 파일 업로드/OPFS로 제공하고 **원본 바이너리는 절대 수정하지 않는다**. Bun build→독립적 정적 로더; 메인 성능 측정 세션과 동시에 게임을 켜지 않는다. `DirectDrawCreate`/8bpp palette/primary surface, `DirectInputCreateA`, `timeSetEvent` callback, GDI 폰트·DInput, 실제 메뉴/Stage1까지의 HRESULT·WinAPI stub 로그를 수집한다. **첫 목표는 Stage1 실제 플레이 가능 판정**이며 ‘JIT이니까 60fps’라는 목표값 기입은 금지. **MIDI `midiStreamOpen`이 BADDEVICEID인 것은 알려진 실패**이므로 그때는 오류·대응 API 목록을 정확히 기록하고 WinMM 장치·스트림·Synth의 동등 기능 개발 범위를 산정한다. 가능하다면 호환성 일반화 패치(게임별 시간/스킵 하드코딩 금지)로 해결한다.
2. **[조건 게이트] GH Pages 하위 경로의 순수 정적 COI-SW proof.** 로컬 HTTP 특수 헤더 서버에서는 통과해도 GH Pages 자체에서 SW 첫 navigation/reload 후 `crossOriginIsolated`, SAB, WebGPU, AudioWorklet, OPFS, drag-drop, dynamic generated WASM JIT, 재접속 저장 데이터가 모두 작동하지 않으면 일반 정적 배포 적합 판정을 보류한다. 공개 WGB 스트리밍의 Range/ETag는 별도 테스트. SW 사용 여부·실제 응답 헤더·브라우저/버전/네트워크 실패를 기록.
3. **[성능 채택] 메인 단독 게임 벤치:** Win11 원본/현 BoxedWine/bottleship 후보에 **동일 Stage1 시작 위치·입력·저장·옵션·브라우저 visibility**를 유지하고, `changedImageData` 기반 실제 새로운 게임 프레임, 프레임 간격 p95, CPU TaskDuration, x86 실행 시간, guest `timeGetTime` 16ms tick·`SKIP` 호출량, 입력→실제 변화, 빈 공간 프레임/눈속임 중복 present, PCM/MIDI note·timing을 비교한다. 두 차례 이상 지속한 30fps를 통과해야 30 목표의 증거로 취급하며 60 목표는 별도. Stage1 수치만으로 16 스테이지/장기 안정 완료를 선언하지 않는다.
4. **[2차] 기존 BoxedWine dispatch+guest MMU 연구:** 타이밍/게임 parity 실패 없이 hot decoded-op/메모리 접근을 실제 계측으로 나누고, 초기 변경은 단일 hot 경로의 의미론·WASM ABI 보존 A/B로 제한한다. v86 JIT 코드를 BoxedWine WASM에 복사하는 접근은 x86 decode·memory permission·cache invalidation 차이로 단순 재사용 불가. 별도 범위·장기 투자로 판단.

**명확한 기각:** 팬클론을 원본 게임으로 부르는 것, `Mystic.exe` 대신 Genesis/SNES/System C2/PC-98 ROM으로 바꾸는 것, `rAF`/`SDL_RenderPresent`/canvas 60회 갱신을 원본 게임 60fps로 주장하는 것, SKIP 강제 증가/게임 시간 가속, 서비스에서 EXE 실행/스트리밍, 특정 브라우저에 로컬 프로그램 설치 요구, 검증 없이 원본 EXE/64파일 변경은 목표를 충족하지 않는다.

## 검증 범위 및 미확인

이 조사에서 **새 웹 게임 실행·브라우저 병렬 성능 측정·코드 패치/게임파일 수정은 수행하지 않았다**. 직접 수행한 것은 원본 PE import 읽기/해시 재계산, 공식 GitHub 파일·릴리스·문서 원문 대조, 로컬 성능 감사 결과 재독이다. BottleShip이 Mystic를 메뉴/Stage1까지 실행하는지, 8bpp GDI/폰트/팔레트 패리티, 자체 JIT가 실제로 30–60 changed fps에 도달하는지, GH Pages와 COI-SW/OPFS/Range가 함께 동작하는지는 **미검증**이다. 이는 해당 접근을 실패로 확정한다는 의미도, 성공했다고 주장할 근거도 아니다.
