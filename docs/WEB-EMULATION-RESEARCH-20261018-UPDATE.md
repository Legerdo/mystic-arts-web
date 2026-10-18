# 오픈소스 대안 실제 실행 — 2026-10-18 후속

목표는 원본 Win32 EXE/64파일·전투·타이밍·음악을 유지하는 정적 웹 실행이다.
엔진 개발자의 다른 게임 시연, API 이름 존재, 평균 FPS만으로 이 목표를 통과시키지 않는다.
현재 즉시 교체 가능한 대안은 확인되지 않았다. BoxedWine 기준 배포와 별도 후보를 유지한다.

## 공식 소스 재확인

| 엔진 | 확인한 구현 | Mystic 판단 |
| --- | --- | --- |
| [BoxedWine](https://github.com/danoon2/Boxedwine/blob/master/docs/CPUemulation.md) | 웹은 NormalCPU 인터프리터. 네이티브 x86/x64/ARM JIT과 다름 | 현재 실제 메뉴·Stage1·MIDI·저장이 되는 기준. 가속 후보의 긴 프레임과 입력 꼬리는 남음 |
| [BottleShip](https://github.com/jenissimo/bottleship/tree/2e1746cdf196a0b57d605ac3519040cc2a1f9406) | x86→WASM JIT/Win32 HLE. 해당 커밋 `src/worker/modules/winmm-caps.ts`는 MIDI_OUT_DEVICES=0, midiStreamOpen BADDEVICEID | 음악 보존 미충족. 이번 후속에서 Mystic 실행 성능을 측정하지 않음 |
| [Wine-Assembly](https://github.com/vgrichina/berrry-wine/tree/0997e24ae14be0f1f4142064584e1b662b53d04c) | WAT x86 인터프리터+Win32 HLE, tail dispatch/uop, DirectDraw/DirectSound. `src/09a3-handlers-audio.wat`에 MIDI stream queue/tempo/time division/restart 구현 | 빌드와 실제 Chrome 실행까지 수행. 굴림체 조회 대기로 타이틀 도달 실패 |
| [Sogen](https://github.com/momo5502/sogen) | Windows 사용자 환경 에뮬레이션 및 네이티브 실행 백엔드 | 네이티브 가속은 브라우저 정적 배포 증거가 아님. 이번 실행 후보에서 제외 |

기존 v86/Theseus/wemu/DOSBox-X/CheerpX 분석은 선행 문서에 보존했다. 새 근거 없이 동일 연구를 반복하거나 해당 프로젝트들을 Mystic의 완성된 대체재라고 부르지 않는다.

## Wine-Assembly 고정 빌드 및 원본 실행

- 커밋: `0997e24ae14be0f1f4142064584e1b662b53d04c`, MIT LICENSE.
- 위치: `lab/wine-assembly-lf-0997e24`. 원본 프로젝트와 별개 Git 체크아웃이며 외부 엔진 소스는 수정하지 않았다.
- Windows CRLF 변환으로 첫 체크아웃의 생성물 검사가 실패했다. 별도 `core.autocrlf=false` 체크아웃에서 upstream LF를 보존했다.
- sparse checkout에 필요한 추적된 toyvm 번들 두 개와 stdole2.tlb를 추가했다. 생성물 검사나 테스트를 건너뛰지 않았다.
- `npm ci --omit=dev --omit=optional --ignore-scripts`: pngjs/wabt 두 런타임 의존성, 성공.
- `bash tools/build.sh`: 공식 build gate 통과. 20,000 parser 사례 중 19,970 일치, 30 declined, 불일치 0. WASM 1,863,142 bytes. 이는 upstream 전체 1,990개 테스트 실행을 뜻하지 않는다.
- 원본 64파일의 SHA를 검사해 격리 복사. CNC-DDraw를 추가하지 않고 엔진의 DirectDraw HLE를 사용했다.

CLI 재현(해당 엔진 디렉터리):

```text
node test/run.js --exe=scratch/runs/mystic-20261018-01/game/Mystic.exe --vfs-include=**/* --no-build --quiet-api --real-ticks --max-seconds=30 --max-batches=10000000 --png=scratch/runs/mystic-20261018-01/final.png
```

실제 30초 실행은 검은 화면. PE 적재, 두 Mystic Arts 창, MIDI open/close, DirectSound/DirectDraw/DirectInput 초기화는 관측됐지만 플레이는 불가능했다. API 반환·화면·음악 전체의 정확성은 증명하지 못했다. CLI의 synthetic tick 기본값은 사용하지 않았다.

원인 증거:

- 별도 2초 `--trace-api-counts`: EnumFontFamiliesA 358,111회, GetDC/ReleaseDC/lstrcmpiA도 같은 반복.
- `--trace-api=EnumFontFamiliesA,lstrcmpiA`에서 CP949 `b1 bc b8 b2 c3 bc` = `굴림체` 조회를 확인.
- 원본 IDA `0x45E12F`는 글꼴 콜백이 `dword_4EE0F8`을 설정할 때까지 재시도한다. `0x45E386` 콜백은 받은 lfFaceName이 요청명과 같을 때 설정한다. 대체 표도 동일 굴림체로 돌아와 이 환경에서 루프가 끝나지 않는다.
- upstream `fonts/substitutions.json`/`src/10b-gdi-font.wat`의 현재 목록은 이 글꼴을 제공하지 않는다. 거짓 성공 반환이나 원본의 반복문 패치를 하지 않았다.
- 다음 개발은 실제 한글 글꼴 설치·열거·CP949 텍스트/메트릭 경로를 지원하고 원본 표시와 대조하는 일이다. API 반환값 한 개 바꾸는 수준의 완료로 볼 수 없다.

Chrome 155.0.8059.82에서도 공식 index.html → 64파일 ZIP 넣기 → OK/실행 → Enter 입력을 시험했다. 원본 파일은 localhost에만 제공했다. 서비스워커/Worker shared WASM은 동작했지만 게임 영역은 검은 상태였다. pageerror 0은 게임 성공을 의미하지 않는다.

원시 자료:

- `lab/resume-20261018/research/wine-assembly-lf-build-2.log`
- `lab/resume-20261018/research/wine-assembly-font-ida.json`
- `lab/wine-assembly-lf-0997e24/scratch/runs/mystic-20261018-01/{console-2.log,api-histogram.log,font-trace.log,final.png}`
- `lab/wine-assembly-lf-0997e24/scratch/runs/mystic-20261018-browser-02/{result.json,after-launch.png,after-enter.png}`
- `python lab/resume-20261018/research/wine-assembly-browser.py <새 출력 접미사>`: 기존 결과 덮어쓰기 금지.

## 실제 GitHub Pages의 공유 메모리

[coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)의 방식이 가능한지 실제 공개 Pages 문서에서 검증했다.
`https://leaysgur.github.io/js-multi-ast-viewer/`는 첫 HTTP 200 응답에 COOP/COEP가 없었다.
서비스워커 제어 후 reload에서 crossOriginIsolated=true, SAB, 공유 WebAssembly.Memory를 확인했다.
Worker가 같은 메모리에 Atomics.add를 실행해 41→42를 반환했다.

- 증거: `lab/resume-20261018/research/github-pages-coi.json` 및 `check-pages-coi.py`.
- 첫 조사 URL `https://gzuidhof.github.io/coi-serviceworker/`의 404도 그대로 보존했다.
- OPFS/AudioWorklet/WebGPU는 API 존재만 확인했다. 전체 정상 동작 검증으로 부르지 않는다.
- 이 실험은 Pages 플랫폼의 COI/SAB 가능성을 입증한다. Mystic의 원격 Pages 게시, 전체 저장/오디오/게임 호환성, BottleShip Range/ETag 요구 충족은 입증하지 않는다.
- 원본 게임 파일을 공개 사이트/저장소로 업로드하지 않았다. 정식 BoxedWine 배포는 여전히 특수 헤더/SAB 없이 작동하는 기준선이다.

## 채택 조건

다른 엔진으로 교체할 근거는 현재 없다. 기존 BoxedWine 후보의 실제 긴 프레임·입력 반응을 개선하고, 원본 오라클/실제 화면/기능 회귀를 함께 통과해야 한다. 새 엔진의 한글·MIDI·저장 호환성을 완성하지 않은 상태에서 FPS만 비교하는 것은 의미가 없다.

## 사용자 체감 재보고 이후 확인한 유사 사례

- [Boxedwine-WebGL](https://github.com/rtmtree/Boxedwine-WebGL): README의 native x64 JIT와 Quake 수치를 웹 Mystic 성능 증거로 사용할 수 없다. WASM에서의 속도/음향 제약 설명이 남아 있으며 이 게임의 벽 충돌 개선은 검증되지 않았다.
- [KASH3-in-Browser](https://github.com/wangyenshu/KASH3-in-Browser): 다른 Windows 게임을 BoxedWine/Wine 브라우저 경로로 배포한 사례다. 원본 Win32 재사용에 참고할 수 있지만 Mystic의 변경 화면 FPS/입력 지연 개선 증거는 아니다.
- [Tribes2/BoxedWine 개발 논의](https://www.tribesnext.com/forum/discussion/4335/boxedwine-as-a-path-to-running-tribes-2-in-a-web-browser): WebAudio/그래픽 연결 비용을 다루는 관련 사례. 제안된 방식의 존재만으로 Mystic에 적용 완료한 것으로 취급하지 않는다.
- Mystic Arts 공개 소스포트/리메이크 검색에서는 즉시 재사용할 검증된 구현을 찾지 못했다. 제한된 검색 결과이지 존재하지 않는다는 증명은 아니다.

사용자의 후속 요청에 따라 **기존 실행기를 교체하지 않고 별도 Phaser 이식을 시작**했다.
`../phaser/README.md`에 실행 파일, 원본 연산/자산 출처, 실제 키 입력 확인과 미이식 범위를 기록했다.
원본 전체 실행보다 내용이 적은 연습 빌드의61.6FPS를 완성된 게임의 성능 비교로 제시하지 않는다.
