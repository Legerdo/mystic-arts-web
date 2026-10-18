# Mystic Arts / BoxedWine 26R1 SingleThreaded 성능 감사

조사일: 2026-10-18. 원본은 1998년 Mystic Arts의 실행 파일과 게임 데이터 64개이며, GitHub Pages 등 일반 정적 HTTP(S) 호스팅과 특수 COOP/COEP 헤더 및 SharedArrayBuffer 미사용 조건을 유지한다.

## 판정

**가장 중요한 비용은 캔버스 업로드가 아니라 메인 스레드의 x86 명령어 인터프리터와 게스트 메모리 접근이다.** BoxedWine 26R1의 SingleThreaded WebAssembly는 한 번의 브라우저 requestAnimationFrame 콜백에서 여러 게스트 스레드를 합쳐 약 9–10ms 단위의 CPU 작업을 실행한다. 실제 계측에서 메인 스레드가 거의 계속 점유되며, 브라우저에 표시하는 present 횟수와 원본 게임에서 실제로 변경된 화면 횟수의 차이가 매우 크다.

특정 원본 명령어 핸들러의 **마지막 indirect call을 WebAssembly의 return_call_indirect로 변경**하는 최적화가 안전한 정적 실험 후보로 확인됐다. 먼저 6개 핫 핸들러, 이어서 동일 ABI·제어 깊이 조건을 만족하는 1,192개를 브라우저에서 A/B 측정한 결과, 실제 변경 화면의 속도가 약 **12fps → 15fps**로 개선됐다. CPU 작업시간 자체는 여전히 포화이므로 최종 성능 문제의 해결로 판정하지 않는다. 앞선 제어값/렌더링 대안은 동일 수준이거나 악화되었다.

**증거 등급:** 아래의 소스 분기와 WASM 명령어 위치는 26R1.0 소스 및 SHA로 고정한 바이너리의 확인 사실이다. 브라우저 수치는 메인이 이미 수집한 CDP/Canvas 로그를 읽은 값이며, 이 작업자는 새 브라우저나 원본 게임을 실행하지 않았다. 제안된 구조 변경의 효과 중 측정되지 않은 부분은 예상으로 표기한다.

## 확인한 입력과 감사 범위

| 대상 | 확인값 / 근거 |
| --- | --- |
| BoxedWine 소스 | `web/native-test/worker1/boxedwine-source/`, git 태그 26R1.0, commit `d7d5a1421bd781a81cbdf8f222cced11a7ebd76e` |
| 수정 전 SingleThreaded WASM | `web/runtime/SingleThreaded/boxedwine.wasm`, 2,295,258바이트, SHA-256 `d4148bda3955e0378de56719c716610f2e1daffd3581d0a2085970ba4df1decf` |
| 실행 시 사용한 WebAssembly | 정적 배포본은 위 WASM에 기존 MIDI table max 1바이트 패치 포함. MIDI vtable의 2개 슬롯 변경과 원본 4,776개 함수 테이블 참조 보존 조건은 별도 회귀 검사 대상 |
| 소스·배포 | `web/src/launcher.js`, `web/tools/build.mjs`, `web/runtime/SingleThreaded/boxedwine.js` 읽기 전용 확인 |
| 성능 계측 | `web/tests/performance.py`, `performance-probe.js`; `web/test-results/performance/{baseline,baseline-frames,no-ddraw-limit,no-render-vblank,tail-six,tail-all}/` |
| WASM opcode 검사 | `web/lab/perf-worker1/wasm-hot-audit.py` 및 `enumerate-tail-candidates.py`; 전체 후보와 정확한 file offset은 `tail-candidates.json` |

소스·runtime·빌드·launcher·원본 EXE/게임자료에는 작업자가 수정하지 않았다. 코드 감사용 스크립트/JSON은 허가된 `web/lab/perf-worker1/` 아래에만 생성했다.

## 브라우저에서 실측된 비용

Chrome 155 headless, Windows 11, 원본 1스테이지에서 실입력 반복 테스트로 측정한 기록이다. 각 비교는 별개의 약 9.7초 구간을 두 번 측정한 것이다. 측정 중 long task API가 빈 결과를 반환했어도 CDP TaskDuration을 근거로 낮은 CPU 부하라고 결론내릴 수 없다.

| 조건 | 실제 변경 화면 FPS, 시험1 / 시험2 | 변경 프레임 간격 p95 (ms) | Emscripten runIter 평균 (ms) | 구간 내 CPU TaskDuration |
| --- | --- | --- | --- | --- |
| baseline-frames, 원본 런타임 | **11.93 / 12.23** | 123.3 / 120.2 | 11.23 / 11.39 | 9.762 / 9.731초 (구간 각각 9.726초) |
| CNC-DDraw maxgameticks 제한 제거 | 11.09 / 10.73 | 129.0 / 126.2 | 11.39 / 11.25 | 9.756 / 9.697초 |
| 별도 render/vblank 대안 | 12.71 / 12.58 | 111.1 / 111.4 | 11.61 / 11.44 | 9.763 / 9.700초 |
| 최종 indirect call 6개만 tail-call | 13.46 / 13.32 | 93.1 / 100.4 | 11.42 / 11.33 | 9.676 / 9.759초 |
| 조건을 만족하는 indirect call 1,192개 tail-call | **14.95 / 14.96** | **91.4 / 94.9** | 11.59 / 11.31 | 9.702 / 9.698초 |
| Tail-call 1,192개 + Binaryen 131의 WASM -O3 연구본 | **16.24 / 15.60** | **87.9 / 94.6** | 11.51 / 11.48 | 9.73 / 9.75초 |

baseline-frames 대비 tail-all의 변경 화면 속도 개선은 1차 약 **+25.3%**, 2차 약 **+22.2%**이다. 프레임별 경로와 조작 입력은 게임 상태에 따라 달라질 수 있으므로 두 번의 A/B를 장기 성능 보장으로 확대하지 않는다. 각 경우 `performance.json`의 `errors`는 빈 배열이며 `failure` 값이 없다.

추가로 메인이 공식 Binaryen 131 연구 도구로 tail-call 적용본을 최적화한 경우, 별도 `web/test-results/performance/tail-o3/performance.json`의 Stage1 A/B는 **16.24/15.60 changed fps**였다. 최적화된 WASM의 실제 크기는 **1,974,291바이트**, SHA-256은 `19b33820d8bf6dbdddb20f8db0a21dbcee7760be1bf79575e6136141e0eddd18`으로 원본과 구조·주소·코드 배치가 달라질 수 있다. Chrome 기록에는 MIDI bridge가 활성화되고 4,873개 메시지가 수집됐지만, 이 값만으로 16개 스테이지 전체의 메모리·가상함수·타이밍이 동일하다고 판정하지 않는다. `-O3`도 긴 CPU TaskDuration 자체를 크게 줄이지 못했으며 사용자 PC/브라우저 간 효과가 동일하다고 보장할 수 없다.

초기 baseline에서도 브라우저에 실제로 그려진 `putImageData`는 평균 **약 0.033ms**에 불과했다. 반면 `runIter` 안의 emulator CPU 작업은 815/834회 실행했고 평균 **11.64/11.41ms**, p95 **20.1/19.7ms**로 관측됐다. `Performance.getMetrics`의 `TaskDuration`은 **9.686초 / 9.699초**였고 측정 구간은 **9.665초 / 9.693초**였다. 이 값의 근접성은 메인 스레드 CPU 포화의 강한 근거다.

주의: `SDL_RenderPresent`에 대응한 canvas present는 **65–67회/초** 관측됐으나, X11 강제 redraw가 포함되어 있다. **원본 게임의 실질적 changedImageData 프레임은 baseline 약 12fps**이다. 키 입력 timestamp에서 다음 present까지의 측정값은 대략 5–7ms 평균이지만, 그 present는 직전 픽셀 재제시일 수 있다. 이를 실제 키 입력 → 게임 상황 변화까지의 지연으로 대체할 수 없다. 변경 프레임 간격(평균 약 80ms, p95 120ms 이상)이 느리게 느껴지는 현상의 직접적인 관측이다.

### CDP CPU sample의 핫 함수 매핑

`web/test-results/performance/baseline/cpu.cpuprofile`의 **2,853개 샘플을 함수명 기준으로 합산**했다. 같은 WASM 함수가 여러 프로파일 node에 나타날 수 있어 node 단위 3% 등의 값보다 함수명 합산값이 중요하다.

| WASM 함수 번호 | 전체 sample 비율 (약) | 소스/바이너리 역할 |
| --- | --- | --- |
| **561** | 13.35% | x86 decoded-op interpreter handler; 다음 op 가상 인덱스 간접 호출 |
| **3743** | 10.45% | `KMemory::readd`, 32-bit 게스트 메모리 로드/MMU lookup |
| **1772** | 8.17% | decoded-op handler; 다음 op 간접 호출 |
| **4188** | 7.26% | `runSlice()`; 9,000/10,000µs 실행 예산 및 20,000 instruction quota 조정 |
| **663** | 5.89% | decoded-op handler; 다음 op 간접 호출 |
| **1759** | 4.94% | 분기 목적지/`cpu->nextOp` 기록형 decoded-op handler |
| **1771** | 3.75% | decoded-op handler; 다음 op 간접 호출 |
| **3745** | 3.61% | `KMemory::writed`, 32-bit 게스트 메모리 기록/MMU lookup |
| **1749** | 3.47% | 분기형 decoded-op handler (중간 helper call 이후 nextOp 저장) |
| **1791** | 2.52% | decoded-op handler; 다음 op 간접 호출 |
| **664** | 2.35% | decoded-op handler; 다음 op 간접 호출 |
| **574** | 2.31% | decoded-op handler; 다음 op 간접 호출 |

특히 `3743`의 WASM은 주소를 12비트 오른쪽 시프트해 페이지 인덱스를 얻고, 페이지 끝 경계를 검사한 뒤 RAM 빠른 경로 또는 Page 객체 간접 호출을 실행한다. 이는 `source/kernel/kmemory.cpp:806–818`에 있는 `KMemory::readd` 구현과 일치한다. `3745`는 같은 경계/페이지 처리 후 메모리를 기록하며 `kmemory.cpp:858–874`와 일치한다. `561` 등의 처음 부분은 `cpu+0x4D0`의 블록 instruction counter 증가, decoded-op 바이트 및 레지스터 계산을 수행한다. 이는 `source/emulation/cpu/normal/normalCPU.cpp:35–56`와 `::run():214–230`에 있는 guest-op dispatch 설계와 일치한다.

## rAF당 CPU 실행 예산과 대기 방식 — 소스 확인

실제 SingleThreaded Emscripten 경로는 다음과 같다.

~~~text
Emscripten requestAnimationFrame (mode=1, value=1)
  -> mainloop() / source/sdl/emscripten/mainloop.cpp:94-127
     repeat:
       runSlice()
         -> timers
         -> XServer::isDisplayDirty=true; draw()
         -> while runnable && emulated thread CPU walltime < 9,000us:
              runThreadSlice() with adaptive guest-instruction quota
           -> KMemory/NormalCPU::run interpreter
       -> KNativeSystem::tick()
       -> SDL_PollEvent via processEvents()
       -> until callback elapsed > 10,000us OR screen presented
  -> yield to browser and request next animation frame
~~~

- `source/sdl/emscripten/mainloop.cpp:99–127`: 내부 무한 루프는 실제 타이머로 **10,000µs** 또는 화면 present까지 실행한 뒤 빠져나온다. `diff>10000`일 때 중단하며 호출된 guest 함수가 길면 **초과 실행 가능**하다. 100ms 초과 경고는 로그만 남긴다.
- `mainloop.cpp:131–140`: `emscripten_set_main_loop(mainloop,0,1)`은 Emscripten의 JS `MainLoop.scheduler_rAF`에 연결된다(`boxedwine.js:7108–7185,7271–7300`). 프레임마다 rAF를 쓰며 rAF 사이 실제 타임슬라이스를 자동으로 CPU에 재배분하지는 않는다.
- `source/kernel/kscheduler.cpp:126–147`: `contextTime=100000` guest 명령어 quota를 기준으로 현재 스레드 CPU가 `cpu->run()`을 반복한다. `cpu->yield` 또는 quota를 넘으면 종료한다. quota는 instruction count이지 진짜 100,000 CPU 클록이나 10ms 상수가 아니다.
- `kscheduler.cpp:166–227`: 각 `runSlice`는 실행 시간 누적 **9,000µs**를 넘으면 반환하도록 설계됐다. 마지막 한 guest 스레드가 오래 걸리면 실제로는 그 이상일 수 있다. 스레드 누적 시간이 11ms를 넘으면 quota를 20,000 줄이고 9.5ms 미만이면 20,000 늘리는 adaptive 제어를 한다.
- 배포 전 원본 WASM의 **guest CPU scheduler 전역변수 주소**까지 확인했다. 메모리 **319056 (0x4DE50) = contextTime 100,000**, **319060 (0x4DE54) = contextTimeRemaining 100,000**, 모두 초기 데이터 세그먼트의 little-endian `a0 86 01 00`이다. `runSlice` 컴파일 함수 **4188**의 code body는 파일 오프셋 **755723**에서 시작하며, 10,000µs 상수는 **756345 / 756362**(`42 90 ce 00`), 9,000µs는 **756618**(`42 a8 c6 00`), quota 증감량 20,000은 **756693**(`41 a0 9c 01`)의 명령어 오프셋에 존재한다. 직접 바이너리 수정 후보로 오해하면 안 된다. 검증된 원본 해시/상수 길이/guest clock 및 ABI 보존 조건이 필요하다.
- JS `HEAPU32[319056>>>2]`에 사전 값을 20,000/50,000으로 써 보는 실험은 **초기 quota seed 변경**으로만 해석해야 한다. `runSlice`가 다음 quota 재계산에 이를 사용하며, 9.5ms/11ms 경계의 ±20,000 적응 규칙에 따라 다음 프레임에서 다시 증가/감소할 수 있다. **초기 메모리 값 한 번 변경은 지속 상한(cap)이 아니다.** 그러한 성능 개선이 있더라도 실제 guest 타이밍·스레드 인터리빙 차이를 검증해야 한다.
- `source/kernel/syscall.cpp:2253,2279–2286`: syscall이 소비한 host 실제 실행시간을 guest 블록 instruction counter로 환산해 산입한다. 빠른 CPU/늦은 API에서 같은 instruction 수라도 실행시간은 달라질 수 있다.
- `platform/linux/platform.cpp:57–79`: 시간은 실제 운영 시간 기반 `getSystemTimeAsMicroSeconds`를 사용한다. `emscripten_get_now()*1000000` 분기는 비활성화된 `__THIS_HANGS__` 조건 안에 있으므로 활성 빌드에서 마이크로초 단위가 틀렸다고 판단하면 오류다.
- `source/sdl/singleThreaded/mainloop.cpp:93–101`의 **native** 경로에는 runnable thread가 없을 때 최대20ms native socket wait 및 `KNativeThread::sleep(20)`이 있으나, **Emscripten mainloop.cpp에는 그 sleep 코드가 없다**. 대기 중 CPU 낭비를 추측하려면 실제 guest runnable count/EIP와 rAF slice를 동시에 측정해야 한다.
- `source/x11/x11common.cpp:660–670`: upstream 작성자는 XUnlockEvents 10회당 `cpu->yield = true`로 강제 양보하는 코드를 스스로 scheduler workaround라고 기록했다. 이 양보를 제거하면 이벤트 처리와 게스트 스레드 공정성이 깨질 수 있다.

결론적으로 **“hidden busy wait이 확정 원인”은 아직 증명되지 않았다.** 확인된 것은 게스트 runnable 명령어를 rAF마다 메인 스레드에서 오래 처리한다는 점이다. 특정 게스트 스레드가 `Sleep`이나 `WaitMessage` 없이 polling하는지는 guest EIP, syscall 및 thread state로 확인해야 한다. JS `setTimeout`을 임의로 추가하거나 rAF 호출 수를 줄이는 것은 리소스 소모는 줄일 수 있어도 **게임 CPU 처리량과 FPS를 더 떨어뜨릴 수 있다.**

## SDL 화면 경로 — 낭비 후보와 실제 우선순위

`source/kernel/kscheduler.cpp:172–176`에서 `runSlice`가 시작할 때마다 `XServer::isDisplayDirty=true`를 **강제로 설정**하고 `XServer::draw()`를 호출한다. `source/x11/xserver.cpp:365–401`은 최소16ms의 draw 간격 제한 이후 `screen->clear()`→매핑된 모든 자식 `XWindow::draw()`→`screen->present()`를 처리한다. `source/x11/xwindow.cpp:885–906`은 각 자식의 `isDirty`를 명시적으로 화면 백엔드에 전달한다.

`platform/sdl/knativescreenSDL.cpp:191–308`에서는 각 창이 `isDirty`일 경우에만 원본 8bpp 픽셀을 32bit ARGB로 팔레트 변환하고 SDL 스트리밍 텍스처를 `SDL_UpdateTexture`로 갱신한다. Dirty가 아니면 텍스처 데이터 업로드는 생략하지만 `SDL_RenderCopy`는 호출한다. `SDL_RenderPresent`는 `knativescreenSDL.cpp:310–328`에서 화면 갱신 여부와 관계없이 presented 플래그를 세운다.

빌드 소스 `knativescreenSDL.cpp:754–765`의 Emscripten 분기는 명시적으로 `SDL_RENDERER_SOFTWARE`를 선택한다. 그러나 화면 업로드의 크기와 JS 호출비용이 실측에서 미미하므로, **WebGL 렌더러 강제 전환·Texture upload 최적화는 현재 1순위로 정당화되지 않는다.** 소프트웨어 SDL 선택은 확인 사실이지만 실질적 병목의 비중은 결과가 정한다.

`XServer::isDisplayDirty=true` 강제 설정을 해당 모듈에서 불필요한 경우에만 억제하는 것은 측정 가능한 별도 A/B 후보이다. 다만 팝업, cursor, 별도 창, overlay나 palette 변경이 깨질 수 있어 *실제* `XWindow::setDirty` 호출 흐름·화면 스냅샷·입력을 보존하는지 확인해야 한다. 강제 present가 제거되면 `mainloop`는 10ms CPU까지 더 오래 실행할 수 있으므로 화면 횟수 감소가 반드시 CPU 부하 감소나 반응성 개선으로 이어진다고 단정할 수 없다.

## WASM indirect tail-call의 정확한 패치 위치

`NormalCPU`의 `NEXT()` 매크로는 한 decoded-op 실행을 마친 즉시 다음 op의 `pfn(cpu, op->next)`로 진입한다(`normalCPU.cpp:35–56`). upstream은 ordinary function pointer call을 사용했고, Emscripten 출력에서는 핫 경로에 `call_indirect`가 재귀적으로 반복된다. 대상 함수와 원본 호출자 모두 type index **5**, 시그니처 **(i32,i32)->void**.

`web/lab/perf-worker1/wasm-hot-audit.py`의 구문 분석 결과, 다음 핫 함수는 **마지막 opcode가 `0x11 call_indirect(type=5,table=0)`이며 즉시 `0x0B end`**로 끝난다. 원본 바이트오프셋은 함수 헤더를 포함한 전체 원본 WASM의 절대 주소다.

| 함수 | WASM body 시작 바이트 | 원본 간접호출 opcode 파일 바이트 | 선택 가능한 치환 |
| --- | ---: | ---: | --- |
| wasm-function[561] | 108243 | **108370** | `0x11 → 0x13` |
| wasm-function[663] | 131505 | **131623** | `0x11 → 0x13` |
| wasm-function[664] | 131637 | **131879** | `0x11 → 0x13` |
| wasm-function[1771] | 295631 | **295843** | `0x11 → 0x13` |
| wasm-function[1772] | 295857 | **296073** | `0x11 → 0x13` |
| wasm-function[1791] | 298507 | **298723** | `0x11 → 0x13` |

각 말단의 실제 12바이트 바이트열은 `11 85 80 80 80 00 80 80 80 80 00 0b`이며, 첫 `11`은 `call_indirect`, `85 80 80 80 00`는 type index5, 다음 5바이트는 table index0, 마지막 `0b`는 함수 끝이다. `0x13` `return_call_indirect`는 동일한 인수를 가진 **tail-call**이며 호출자의 스택 프레임을 정리하고 다음 함수로 분기한다.

**전체 범위 확장 확인:** 모든 WASM local function 8,322개를 검사했으며 정확한 말단 패턴과 호출자 ABI, 제어 스코프 깊이1(최상위), source hash를 충족하는 함수가 **1,192개** 있었다. 나머지 같은 말단 패턴 2개는 호출자 함수 타입이 type5가 아니라서 제외했다. 전체 목록과 파일 오프셋은 `web/lab/perf-worker1/tail-candidates.json`(1192 entries, 각 `fileOffset` 포함)에 고정했다.

`web/lab/perf-worker1/enumerate-tail-candidates.py`는 전체 후보를 리빌드 없이 다시 생성한다. 함수 디코더가 알 수 없는 WASM opcode를 만나거나 호출 타입/깊이가 기대와 달라지면 검증을 실패하게 설계했다. `1749`, `1759`처럼 분기 뒤 `cpu->nextOp`을 저장하는 함수나 `3743/3745`의 메모리 가상 호출은 위 조건이 아니므로 무차별 치환을 금지한다.

### NormalCPU::run 본체까지 추가 조사

`source/emulation/cpu/normal/normalCPU.cpp:214–230`의 실제 `NormalCPU::run()`을 RTTI/vtable과 바이트코드로 직접 식별했다. `9NormalCPU` 이름 문자열은 guest memory **136892**, typeinfo 주소는 **136880**, vptr 주소는 **136832**이고, **0-based virtual slot8**은 table1443→**wasm-function[1807]**이다. 함수1807은 `(i32)->void`, 30바이트 body가 파일 오프셋 **320057**에서 시작한다. 이 body는 `cpu->nextOp`(멤버 오프셋 `0x5C4`)을 읽고 op 구조체의 pfn(+8)을 `call_indirect type5`로 호출하며, **파일 오프셋 320075**의 `0x11`이 말단 호출이다. 명확한 호출 체인의 첫 함수이므로 성능 평가 시 profiler/bytecode로 별도 추적 가능하다.

다른 wrapper **wasm-function[506]**도 말단 indirect 명령이 **파일 오프셋 102546**에 있다. 두 개 모두 호출자 타입이 `(i32)->void`이고 indirect 대상이 `(i32,i32)->void`라서 1,192개 엄격한 *입력 시그니처 완전동일* 목록에서 보수적으로 제외됐다. 그러나 W3C tail-call 검증 규칙은 **호출자의 반환형과 대상 반환형이 호환되는지**를 검사하며, 두 함수의 반환형은 모두 void로 일치한다. 이 2개를 추가한 **1,194바이트 메모리 내 치환**도 Node24에서 `WebAssembly.validate=true` 및 imports/exports 동일 PASS다. 원본 WASM→추가 후보 SHA-256은 `ccc1dd8b6e1166703cbe544abb672859ef98d20afe36ed83a97cabfb64000027`, MIDI패치 WASM→추가 후보는 `027ddd35f0c36b5fee3c5e3ffd9a6470849e274a5ed9183e2445db72e94fff6b`이다. **1,194개 버전의 브라우저 FPS/정확성 결과는 없다**. 메인의 측정된 1,192개 개선값을 그 2개 추가 효과로 옮겨 쓰지 않는다.

### 바이너리 인터페이스 검증 — 실행 성능과 별개

Node v24.13.0에서 원본 WASM을 **메모리에서만** 변환하고 `WebAssembly.validate` 및 `new WebAssembly.Module`을 실행했다. import/export 인벤토리 일치, 크기 불변, 지정 위치만 다른지도 확인했다.

| 기준 입력 | 적용한 후보 | WebAssembly.validate | 결과 SHA-256 |
| --- | ---: | --- | --- |
| 원본 wasm (SHA d4148bda…) | 핫 6개 | PASS | `702f2f92e6ab4aeda2a3da2ce873b63a216e4913849550d15caeeb9ccf0549a5` |
| 원본 wasm (SHA d4148bda…) | 1,192개 | PASS | `f41965805079fd09e40e3f1f62ba2f8968ff2b55f638a2156c1a5aacd4d3fab8` |
| 기존 MIDI 패치 wasm (SHA 93610439…) | 1,192개 | PASS | `e23f36aa49277a30d20ac0a792e4cd1b7a720b709f3d5c1a19134a6964d657db` |

모든 패치는 2,295,258바이트를 유지하고 **함수 테이블 인덱스, 메모리 데이터, 원본 게임, MIDI vtable 슬롯은 변경하지 않는다.** 원본 CDP 기준 함수 바이트 주소는 이미 확인되어 있으며 패치 스크립트는 source SHA를 엄격히 고정해야 한다. 메인의 `tools/build.mjs`가 넣는 기존 1바이트 MIDI 테이블 확장 패치를 계속 함께 적용해야 하고, 최종 배포 매니페스트의 WASM SHA도 새로 검증해야 한다.

WASM 명세상 `return_call_indirect`는 기존 `call_indirect`의 tail variant이며 자원 고갈 위험이 있는 연속 함수 스택 누적을 피한다([W3C WebAssembly Core Instruction Specification](https://www.w3.org/TR/2026/CRD-wasm-core-2-20261013/)). 그러나 **모든 브라우저가 지원하지 않는다**. 현 호환성 표는 Chrome 112+, Firefox 121+, Safari 18.2+ 등에서 지원을 보여준다([Can I Use – WebAssembly tail-calls](https://caniuse.com/mdn-webassembly_tail-calls)). GitHub Pages의 일반 정적 배포 조건과는 독립적인 기능이므로, 범용성이 필요하면 `WebAssembly.validate`로 기능 탐지한 후 적합한 optimized/fallback WASM 파일을 선택해야 한다. 명세·Node 검증만으로 실제 모든 브라우저나 게임 상태의 동등성이 보장되지 않는다.

**성능 관측 해석:** 6개 tail 최적화는 변경 화면 13.3–13.5fps, 1,192개는 약 15fps로 개선됐다. CPU 전체 TaskDuration은 여전히 실행시간과 거의 같고 한 번의 WASM 메인 루프 역시 평균 11ms 이상이다. 즉 함수 스택 overhead 감소는 근거가 있지만, **하위 MMU 페이지 lookup 및 인터프리터 연산 전체를 해결하지 못한다.** tail-call보다 광범위한 함수 병합/대형 MMU 함수 강제 인라인은 실제 성능 결과가 없는 상태에서 권장할 수 없다.

## 우선순위와 위험

1. **핫 opcode tail-call (이미 A/B 검증된 후보)**: 가장 확실히 측정된 성능 향상. 정확한 WASM SHA, 명령어 오프셋, 타입, depth=1, fallback을 보장하며 최소6개 및 전체1,192개 후보를 같은 입력 스테이지/키 순서로 비교한다. 16라운드 전 구간의 게임 타이밍·충돌·MIDI 이벤트·저장·중단 후 재개 회귀는 별도 검증이 필요하다.
2. **WASM 게스트 메모리 경로 `KMemory::readd`/`writed`의 개선 연구**: self sample 약10.45% +3.61%이므로 규모가 크지만 함수 body가 약 582/569바이트(각각 **278/270개 WASM 명령어**)이며 빠른/느린 페이지 경로와 권한/실행 코드 무효화가 섞여 있다. 함수 전체를 단순 인라인하거나 가상 페이지 검사/권한 분기를 지우면 잘못된 guest memory semantics를 초래할 수 있다. 안전한 1차 optimizer 검증은 **실행시간을 측정한 작은 함수만** 선택(예: 64 instructions 이하 또는 128 bytes 이하부터 시작)하고, `3743`/`3745` 두 대형 함수의 강제 인라인은 배제하는 보수적인 실험이 적합하다. 이 임계값은 **안전한 속도 보장값이 아닌 실험 범위 제안**이며, 인라인 증가로 코드 크기·i-cache·JIT 컴파일시간이 악화될 수 있다. optimizer가 함수 재정렬·상수합치기·vtable 위치를 변경할 수 있으므로 기존 MIDI 주소/해시/테이블 인덱스를 전부 재감사한 다음 별도 A/B 회귀를 해야 한다. 원 조사 당시 `wasm-opt`/Emsdk CLI가 PATH에 확인되지 않았으며 이 작업자는 새 도구를 설치하지 않았다.
3. **XServer 강제 dirty/present**: 실제 60fps처럼 보이는 present 횟수 대부분의 설명. 텍스처 업로드는 이미 `isDirty`에 한정된다. CPU가 여전히 포화이므로 단독 해결책은 아니다. Popup/cursor/배경/전체 화면 회귀 확인 없는 강제 draw 삭제를 금한다.
4. **scheduler budget 조정**: 소스 `kscheduler.cpp:180`의 9ms와 `emscripten/mainloop.cpp:120`의 10ms는 정확한 제어점이다. 예산을 4–6ms로 단축하면 브라우저 이벤트 수신을 앞당길 **가능성**이 있지만 guest CPU throughput 감소·프레임 수 하락·가상 RDTSC/타이머 동작 변화를 같이 검증해야 한다. JS setTimeout 삽입이나 rAF 호출 빈도 강제 감소만으로 최적화했다고 판정하지 않는다.
5. **CLI/렌더·기타**: 업스트림 `-skipFrameFPS`, `-pollRate`는 인자 파싱/저장 부분에만 나타나고 실제 스케줄러·renderer에서 사용하는 코드가 확인되지 않는다. 런처에 인자를 추가한다고 렉 개선이 증명되는 옵션이 아니다. `-vsync`는 renderer 플래그를 바꾸는 옵션이지 x86 instruction 예산 제어가 아니다. 메인이 시도한 CNC-DDraw `maxgameticks=60→-1`은 실측 12fps 대비 10.7–11.1fps로 동급 또는 악화. SDL software renderer→hardware 전환, `-bpp 8/16` 등은 화면 호환성과 타이밍 회귀를 동반할 수 있으며 현재 렌더 프로파일로는 우선 적용 근거가 약하다.

## 재현 및 제외 사항

WASM hot opcode를 검사하는 명령(소스/배포 읽기 전용):

~~~powershell
python web/lab/perf-worker1/wasm-hot-audit.py
python web/lab/perf-worker1/enumerate-tail-candidates.py
~~~

결과 파일 `web/lab/perf-worker1/tail-candidates.json`은 감사용이며 게임 배포에 포함할 필요가 없다. 실행 브라우저 성능 계측 결과는 메인이 소유한 `web/test-results/performance/`의 A/B JSON과 Chrome CPU profile에서 확인한다. 이번 조사는 브라우저를 열거나 키를 입력하지 않았고 새 런타임/네이티브 실행기를 설치하지 않았다.

**성공의 경계:** 현재 근거는 **실제 changed visual FPS 약12→15**, WASM 일부 함수의 제어흐름 및 CPU self-time 식별, 정적 파일 호환성이다. 전체 스테이지와 Windows 원본의 타격 판정·시간·음악까지 완전 동등하거나 60fps에 도달했다는 결론은 이 증거로 뒷받침할 수 없다.
