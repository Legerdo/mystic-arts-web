# Mystic Arts — 원본 타이밍·CNC-DDraw GDI·BoxedWine 성능 감사

**작성일:** 2026-10-18. 기존 원본 바이트/IDA 디컴파일, 저장된 Chrome CPU 프로파일, CNC-DDraw v7.1.0.0 공개 소스를 **읽기 전용**으로 검토했다. 게임·브라우저·네이티브 실행 또는 소스·원본 EXE 수정은 하지 않았다.

**불변조건:** 원본 `Mystic.exe` (914,944바이트, SHA-256 `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`)와 64개 원본 파일, 논리/입력/팔레트/전투/오디오 동작, 일반 GitHub Pages 정적 배포(서버·COOP/COEP·SAB 불필요)를 보존한다. 게임 자체 속도를 늦추거나 렌더 프레임을 의도적으로 버리는 것은 성능 개선안으로 인정하지 않는다.

**증거 등급:** **[S]** 원본 바이트/IDA 또는 해당 소스에 명시, **[M]** 메인 에이전트가 저장·전달한 실제 측정, **[H]** 그 근거에서 추론한 A/B 후보, **[N]** 실제 시험에서 기각. 브라우저 rAF, BoxedWine interpreter slice, CNC primary present, 픽셀이 실제로 달라진 프레임, 게스트 게임 논리 tick은 각기 다른 수치다.

## 1. 배포 상태와 현재 성능 관련 설정

프로젝트 폴더는 Git 저장소 루트가 아니어서 `git status` 결과를 사용할 수 없었다. 프로젝트·`web`·`web/docs`·`web/compat`에 추가 `AGENTS.md` 지침도 없었다. 감사 시작 당시 원본 EXE 해시는 위 값과 일치했다.

**[S] 실제 배포와 설정의 동일성 확인:** `web/tools/build.mjs:58–63`이 `web/compat/ddraw.ini`를 그대로 `web/dist/assets/game.zip`에 담는다. 이 두 ini와 `web/win11-reference/mystic/ddraw.ini`는 모두 30,577바이트, 동일 SHA-256 `f4f9c9075db871e122869381296c186c475fea3c00c26bcf80ebc083d2ab2b6c`. game ZIP은 원본 64개에 `ddraw.dll` 및 `ddraw.ini`를 추가한 66개 엔트리. DLL은 394,240바이트, SHA-256 `aeba5b789a153275ace694806216114baadcd019049ae224ff30cea61a3162f6`. ini의 타 게임 전용 288개 구간 중 `[mystic]` 별도 override는 없다.

| 현재 설정 [S] | 의미와 주의점 |
|---|---|
| `renderer=gdi` / `windowed=true` | 원본 게임 화면까지 성공한 CNC 호환 경로. 바꾸면 기존 8비트 DirectDraw 호환 보장이 사라질 수 있음 |
| `maxgameticks=60` | CNC 내부 게스트 게임 tick limiter. 이론상 간격 1000/60 ≈ **16.667ms**, 내부 정수 길이 반올림 **17ms** |
| `limiter_type=0` | 자동 limiter. 별도의 PeekMessage hook type4와 구별 |
| `maxfps=-1` | CNC 출력 프레임 제한을 guest 화면의 `dmDisplayFrequency`로 설정. **60 고정이 아님**. 실패하는 Wine vblank 조회 후보와 관련 |
| `vsync=false` | 추가 동기화 off지만 위 `maxfps<0`의 vblank 탐색 분기를 막지는 않음 |
| `minfps=0` | 강제 redraw off. GDI render thread는 갱신 semaphore를 기다림 |
| `singlecpu=true` | CNC가 초기화 때 guest 프로세스 affinity를 CPU0으로 설정하는 호출 1회. 브라우저 single-threaded WASM을 multi-core로 바꾸지 못함 |
| `fixchilds=2` | CNC GDI 매 present에서 `EnumChildWindows`를 시도하는 경로 사용 |
| `hook_peekmessage=false` / `savesettings=1` | 별도 메시지 hook 옵션 off / 창 정보 저장. 프레임 주병목으로 확정된 근거 없음 |

**[S] 포트 아키텍처:** `web/src/launcher.js:100–105`는 BoxedWine26R1/Wine6 **SingleThreaded WASM**, `-resolution 640x480 -bpp 32`, `WINEDLLOVERRIDES=ddraw=n,b`를 사용한다. 호스트 출력 32비트와 원본의 논리 640×480 **8bpp/256색 DirectDraw**를 혼동하지 않는다. `web/dist/game-manifest.json`은 백엔드·Cross Origin Isolation 불필요를 명시한다. 원본 64개는 미수정.

## 2. 원본 WinMain: 16ms·SKIP·idle busy polling

**[S] IDA Professional 9.5** `web/native-test/worker3/init-ida.json`의 `WinMain @ 0x474910`와 `web/docs/GAMEPLAY.md`를 재확인했다. 원본 이 게임 루프의 시각 API는 `GetTickCount`가 아니라 **`timeGetTime`**이다.

```c
last = timeGetTime();              // dword_511220
while (running) {
    while (!PeekMessageA(&msg, NULL, 0, 0, 0)) {
        now = timeGetTime();       // dword_511204
        if ((uint32)(now + lag - last) >= 16) {
            lag += now - last - 16; // dword_512B04
            logicalTime += 16;     // dword_511578
            if ((uint32)lag <= 16 || skipCount >= skipOption) {
                logicalTime += lag;
                lag %= 16;
                sub_458976(0);    // 정상 프레임
                logicalTime = 0;
                skipCount = 1;
            } else {
                ++skipCount;
                sub_458976(1);    // 화면 갱신 일부 스킵
            }
            last = now;
        }
    }
    if (!GetMessageA(&msg, NULL, 0, 0)) break;
    TranslateMessage(&msg); DispatchMessageA(&msg);
}
```

- **[S] 명목 16ms = 62.5 게이트/초**이나 실제 62.5 tick/sec 보장은 아니다. guest 시간해상도·WASM slice·Wine scheduler 지연이 영향을 준다.
- **[S] `dword_4DCCC8`는 실제 옵션 표시상 `SKIP`(기본2, 메뉴 범위 1..5)**이며 `dword_4DD178`가 누적 skip count다. 옛 문서의 해당 값을 '난이도'로 추측한 해석과 구분한다. LEVEL 선택은 별도 `dword_51A428`과 관련된다.
- **[S] `sub_458976(skip) → sub_45AD50(skip)`는 skip=1이어도 `sub_41F63F`로 입력을 스캔하고 `sub_46F80C`로 엔티티를 업데이트한 다음 렌더 단계를 건너뛴다.** SKIP을 크게 해 CPU를 절약하면 화면/입력 반응 cadence를 변경할 수 있으므로 원본 보존 해법이 아니다.
- **[S] 메시지 없을 때 `PeekMessageA→timeGetTime`을 계속 반복하고 직접 `Sleep` 호출은 없다.** 이 코드는 x86 CPU/Wine 호출이 해석기에서 반복 실행되는 busy polling 후보지만, 현재 프로파일만으로 CPU 사용량 중 정확한 비율을 확정할 수는 없다.
- **[S] `0x474CE6` WinMM callback**은 `timeSetEvent(uDelay,0,fptc,0,0)`를 재등록하고 미대기 `WM_USER(0x400)` 메시지를 `PostMessageA`한다. WinMain은 `timeGetDevCaps`로 약17ms 타이머 기간을 선택하고 `timeBeginPeriod(2)`도 호출한다. 이 메시지 wakeup과 위 16ms 논리 시간 게이트는 별개의 경로다.
- **[S] 렌더:** `0x45AD50`의 `timeGetTime` 전후 측정, `0x45AE9B→0x46D16A→0x41CC37`의 offscreen→primary `IDirectDrawSurface::Blt(DDBLT_WAIT)`, 팔레트 업데이트 이후 CNC GDI 출력이 이어진다.

**충돌 가설 [H]:** 자체 16ms 게이트와 CNC 60Hz(약16.667ms) limiter가 동시에 작동하면 스킵·입력·프레임 주기에 간섭할 가능성은 있다. 그러나 이론상 약4% 간격 차이만으로 12FPS급 렉을 설명할 근거는 없고, 하단의 실제 A/B에서 limiter 제거가 오히려 악화됐다.

## 3. CNC-DDraw 정확한 hook·sleep·GDI 분기

다음은 **CNC-DDraw 공식 `v7.1.0.0` 태그의 실제 소스**를 직접 읽어 확인했다. 배포 DLL의 SHA-256은 확인했지만 그 DLL을 따로 디스어셈블해 upstream 소스와 바이트 단위로 일치시킨 것은 아니다.

| 공식 소스 위치 | 확인된 기능 [S] |
|---|---|
| [`dd.c:1795–1817`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/dd.c#L1795-L1817) | `maxgameticks>0`의 waitable timer·1/tick 설정, `0`은 60Hz vblank 모사 동작이며 **-1이 limiter 비활성화** |
| [`utils.c:390–469`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/utils.c#L390-L469) | `util_limit_game_ticks`는 GUI thread일 때 `WaitForSingleObject/SetWaitableTimer` 또는 fallback `timeGetTime/Sleep`. 주석 처리된 CPU busywait는 실행하지 않음 |
| [`ddsurface.c:447–463`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/ddsurface.c#L447-L463) | **primary Blt**가 `surface_updated/screen_updated`를 세우고 semaphore를 깨우며, limiter_type !=4이면 여기에서 `util_limit_game_ticks` 가능 |
| [`winapi_hooks.c:781–799`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/winapi_hooks.c#L781-L799) | **limiter_type=4**는 `fake_PeekMessageA`에서 직전 `screen_updated` 플래그를 원자적으로 소비한 순간에만 wait. **모든** PeekMessage idle spin에 sleep을 주입하지 않음 |
| [`ddsurface.c:1234–1250`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/ddsurface.c#L1234-L1250) | Unlock도 별도 limiter 지점(설정 type별 조건 다름) |
| [`dd.c:1821–1832`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/dd.c#L1821-L1832) | `singlecpu=true`는 초기화 시 `SetProcessAffinityMask(proc,1)` 한 번 호출 |

**중요한 판정:** `limiter_type=0→4`는 원본의 polling 전체를 없애는 해결책이 아니라, *Blt 후 제한을 다음 PeekMessage 직후로 이동하는 실험*이다. 이벤트 queue 상황·진짜 새 게임프레임·입력 지연 변화가 가능하다. `maxgameticks`도 함께 바꾼 A/B는 어느 원인인지 분리할 수 없다.

**[S] GDI 소프트웨어 작업:** [`render_gdi.c:41–45,85–94,127–160,182`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/render_gdi.c)는 `minfps=0`에서 render semaphore 무한 대기, `fixchilds` 활성 시 `EnumChildWindows`, 8bpp일 때 팔레트 256색 copy, GDI `SetDIBitsToDevice` 또는 확대시 `StretchDIBits`, 마지막 `fpsl_frame_end`를 수행한다. BoxedWine의 32비트 Canvas `putImageData`는 그 뒤 단계이므로 화면제출 마지막 함수가 빨라도 **앞단 8bpp Blt·팔레트/GDI 소프트웨어 변환과 x86 interpreter가 빠르다는 의미는 아니다**.

## 4. 확실히 반복되는 실패 Wine GDI vblank 장치 조회

**[S] 현재 설정 `maxfps=-1, vsync=false`가 트리거할 수 있는 코드 경로:**

1. [`fps_limiter.c:13–30`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/fps_limiter.c#L13-L30): 음수 maxfps를 현재 guest의 `dmDisplayFrequency`로 환산(실제 모드가 60인지는 미확인).
2. [`fps_limiter.c:147–163`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/fps_limiter.c#L147-L163): `maxfps<0`이면 매 GDI frame-end에서 `fpsl_dwm_flush() || fpsl_wait_for_vblank()` 분기로 들어간다. `vsync=false`만으로 차단되지 않는다.
3. [`fps_limiter.c:90–115`](https://github.com/FunkyFr3sh/cnc-ddraw/blob/v7.1.0.0/src/fps_limiter.c#L90-L115): `D3DKMTOpenAdapterFromHdc`가 Wine에서 stub/fail이면 adapter가 캐시되지 않아서 이후 프레임에서도 재시도할 수 있다. Wine에서는 DWM flush 경로가 비활성이다.

**[M] 반복 관측:** `web/test-results/performance/baseline/performance.json`의 `initialDiagnostics.logs` 490건 중 **446건**, `finalDiagnostics.logs`(최대500행 보존) 500건 중 **475건**이 `fixme:driver:D3DKMTOpenAdapterFromHdc (...): stub`이었다. `web/src/launcher.js:17–22`는 이런 로그 모두를 `console.log(message)`로도 내보낸다. **실재하는 중복 API 조회·로그 경로**라는 증거지만 해당 경로가 전체 98% CPU에서 차지하는 비중은 아직 측정되지 않았다.

**[H] 가장 국소적인 A/B 후보는 `maxfps=-1→0` 단독 변경이었다.** `maxgameticks=60`, `limiter_type=0`, `minfps=0`, `renderer=gdi`, `windowed=true`, `vsync=false`, 게임/Wine/WASM을 유지하면 `maxfps<0` 특수 vblank 조회를 피할 수 있다. 다만 **output FPS 제한 제거는 표면 update가 많은 상황에서 더 높은 redraw CPU를 유발할 수 있다.** 아래 **실제 A/B 결과에서는 반복 로그는 확실히 제거되었으나 CPU 병목은 해소되지 않았다.**

## 5. 메인 작업자 실제 CPU/프레임 기준선과 기각된 A/B

**[M] 출처:** `web/test-results/performance/baseline/performance.json` 및 `cpu.cpuprofile`. Windows11 Chrome155, `http://127.0.0.1:64504/mystic-arts/`, `crossOriginIsolated=false`, `SharedArrayBuffer=undefined`. Stage1 이동/공격 두 측정 구간으로 전체 캠페인 검증이 아니다. BoxedWine Emscripten `MainLoop.timingMode=1,timingValue=1`은 브라우저 rAF로 실행 slice를 스케줄한다.

| 측정값 | 구간 1 (9.6646s) | 구간 2 (9.6931s) | 주의 |
|---|---:|---:|---|
| rAF 평균 / p95 | 11.856 / 16.8ms | 11.626 / 16.8ms | 브라우저 scheduler 빈도; guest 게임 FPS가 아님 |
| **BoxedWine WASM 실행 slice 평균 / p95** | **11.639 / 20.1ms** | **11.407 / 19.7ms** | 메인스레드 장시간 점유 |
| Primary/Canvas presents | 630 = 65.19/s | 648 = 66.85/s | **같은 게임 그림 재출력도 포함** |
| `putImageData` 평균 | 0.0327ms | 0.0332ms | 마지막 Canvas copy 병목 가능성 낮음 |
| CPU Chrome ThreadTime | 9.5213s (98.5%) | 9.5324s (98.3%) | CPU 포화, 즉 싱글 스레드 WASM 경로가 관찰된 큰 비용 |
| 실제 **내용이 바뀐 게임 프레임** | 메인 측 별도 측정 약 12 FPS | 동일 범주 | present65FPS와 **별개**. 물리·논리 속도가 12Hz라는 증거는 아님 |

프로파일 상단의 `wasm-function[4188]` 등 함수 ID는 guest x86 주소·Wine 함수 심볼로 아직 역매핑되지 않았다. **guest WinMain busy spin vs Wine blit vs CNC limiter 각각 CPU 몇 %인지 현재 확정할 수 없다.**

**[N] 이미 실제 A/B에서 불채택:** 메인 작업자가 `maxgameticks=60→-1` **단독 변경**을 테스트한 결과 실제 새 게임 프레임이 기본 약 **12.0 FPS → 10.7~11.1 FPS로 동급/악화**, CPU도 약 **98%로 유지**되었다. 이 환경에서 그 limiter를 없애는 변경을 개선안으로 채택하지 않는다. 소스 빌드의 설정 검사도 기본값 `maxgameticks=60`을 요구한다.

**[M] `maxfps=-1→0` 실제 단독 A/B도 추가 완료:** 메인 에이전트의 `web/test-results/performance/no-render-vblank/performance.json`은 guest 원본/기존 `maxgameticks=60`을 유지한 별도 구성이다.

| 분리 지표 | 기존 baseline | `maxfps=0` A/B | 판정 |
|---|---|---|---|
| `D3DKMTOpenAdapterFromHdc` Wine stub | 기존 각 구간 보존 logs 500개 중 **471/474회** | 각 구간 logs **44개 중 0회** | **반복 조회/출력 비용 제거 확인** |
| 실제 새 게임 이미지 변화 FPS | 메인 추가계측 기준 **11.927/12.234** | **12.707/12.582** | **구간별 약 6.5% / 2.8%, 평균 약 5%**. 큰 체감 렉 해결 아님 |
| 새 이미지 변화 간격 p95 | 메인 보고 **120~123ms** | **111.1/111.4ms** | 단축되나 여전히 크다 |
| WASM slice 평균 / p95 | 11.639/20.1ms, 11.407/19.7ms | **11.608/20.0ms, 11.443/19.3ms** | 거의 동일 |
| Chrome ThreadTime/실경과 | **98.52% / 98.34%** | **98.19% / 98.64%** | **메인 CPU 포화 지속** |
| output present | **65.19 / 66.85회/s** | **64.05 / 65.28회/s** | output cap 제거가 무조건 frame 제출률을 높인 것도 아님 |

**해석:** `maxfps=0`은 실측상 반복 D3DKMT 로그를 제거하는 **국소 개선**이지만 게스트 x86/Wine/소프트웨어 렌더 전체의 약 98% CPU 병목은 그대로다. 따라서 '고사양 PC 심한 렉을 해결하는 핵심 패치'로 추천할 근거가 없다. 작은 체감 개선을 제품에 적용할지는 동일 UI/조작·guest tick·음악 parity를 확인한 뒤 메인이 판단해야 한다. 기존 `baseline/performance.json`은 새 이미지 FPS 지표가 없는 이전 계측 형식이므로 비교값 11.927/12.234는 **메인이 추가계측으로 전달한 값**임을 구분한다.

**[M/U] Stage HUD `179→175`:** 메인은 약 9.66초 사이 수치 4감소를 관찰했으나, 수치 한 단위가 실제 1초라는 원본 증거가 없다. IDA `0x46E835`는 별도 `dword_51A44C`를 조건부 **1800**으로 초기화하고 활성화 시 callback 당 1감소시키는 경로를 포함하며, `0x46DDF7`은 라운드 엔티티·`dword_513A24` 초기화다. `0x46E765`에 인자 180/210/240/300을 전달하는 것은 확인됐지만 **기존 IDA JSON에 해당 함수의 단위 해석 가능한 본문이 없어** HUD 179와 직접 연결됐는지 미검증이다. 이 표시를 근거로 게임이 0.4배속이라고 단정하면 안 되며 Win11 실제 기준과 논리 tick을 함께 비교한다.

## 6. 성능 개선 A/B 우선순위 및 최종 PASS 조건

| 상태 | 단독 변경/계측 | 채택 조건 |
|---|---|---|
| **A 실측 소폭 개선 [M]** | `maxfps=-1→0`만 변경, **maxgameticks=60 고정** | Wine D3DKMT stub 0건, 변경 게임프레임 약5% 개선. **CPU 98%는 유지되어 핵심 해결책 아님**. 원본 guest tick/sec·입력·팔레트·PCM/MIDI parity 검증 전 배포 확정 금지 |
| **B 후순위 [H]** | `limiter_type=0→4`만 변경 | Blt/Peek wait 위치 차이를 검증. **모든 idle spin Sleep 아님**; guest tick·pause·입력 latency/음악 원본 대조를 통과해야 함 |
| **C 조건부 [H]** | `fixchilds=2→0`만 변경 | 실제 child 창 사용하지 않는다는 확인이 있는 경우에만 `EnumChildWindows` 호출 절감. 창/폰트/메뉴 렌더 이상 시 즉시 기각 |
| **D 낮은 순위 [H]** | `singlecpu=true→false` 단독 | 초기 guest process affinity 설정만 바뀜. 싱글스레드 WASM 구조는 그대로; 성능과 안정성 둘 다 측정 전 안전 단정 불가 |
| **이미 기각 [N]** | `maxgameticks=60→-1` | 실측상 게임 새 프레임이 줄었고 CPU 개선되지 않음 |
| **부적절** | SKIP 증가, 렌더 30fps 제한, WinMain 16ms 변경, 원본 물리/스프라이트 축소, `renderer=gdi`를 검증 없이 변경, 강제 cross-origin isolation/서버 | 원본 FPS·입력·속도·그래픽·일반 Pages 호환조건 침해 |

**추가 작은 후보 [H]:** `web/src/launcher.js:114–150`의 40×30 화면 관측은 300ms 주기이므로 측정 없이 큰 병목이라 단정하지 않는다. `launcher.js:17–22`는 중복 Wine stub도 매번 JS console에 기록하므로, **게스트 실행을 바꾸지 않는 중복 로그 집계·반복 출력 제한**은 별도 측정 후보가 될 수 있다. 원본의 진짜 실패/진단(파일, DDraw, 음향)은 보존하고 로그 자체가 gameplay 시각에 영향 없음을 A/B로 검증해야 한다. 런처는 이번 조사에서 수정하지 않았다.

**메인이 구분 수집해야 할 네 계층:** (1) 실제 초당 guest `0x458976(skip0/skip1)`, `dword_4DD178`·`4DCCC8`·`512B04` 및 `timeGetTime` 시계; (2) `0x45AD50 / 0x46F80C` 엔티티 tick, `0x41CC37` 실제 primary Blt, palette/GDI API 호출; (3) CNC `util_limit_game_ticks`의 Blt/Peek 호출 위치와 wait 시간, Wine D3DKMT stub 및 브라우저 `console.log` 호출, WebAssembly slice·CPU·실제 새 프레임; (4) 같은 입력에 대한 Win11 원본 레퍼런스의 타이틀/Stage1/HUD 타이머, 이동·공격·pause latency, 픽셀/오디오·저장. **브라우저 rAF≈80/s·present≈65/s와 실제 게임 내용 변경≈12/s는 서로 다른 지표**다.

**A/B 통제:** 원본 EXE SHA, 64 자산, CNC DLL/폰트 레지스트리, Wine6/WASM, 동일 save·옵션(SKIP=2), 브라우저/페이지 visibility, 캔버스 크기 및 측정 구간을 유지한다. 한 번에 하나씩만 변경하며 Chrome CPU 프로파일·guest tick/skip·실제 새 게임 frame·input-to-change·음악/PCM/팔레트 패리티를 확인한다. 16라운드 캠페인 parity가 여전히 미검증이라는 사실도 변하지 않는다. **CPU가 낮아져도 게임 진행 속도·화면·입력이 원본과 달라지면 기각**한다. 정식 채택 시 `build.mjs`의 성공 설정 검증을 실제 검증된 최종 recipe에 맞게 조정해야 하며, 주석 문자열로 단순 통과시키면 안 된다.

**결론:** 현재 입증된 병목 범주는 최종 GPU/Canvas upload가 아니라 **메인스레드의 거의 모든 시간을 소비하는 단일스레드 WASM guest 실행**이다 [M]. 원본 busy polling/Win32 interpreter/GDI 스프라이트·팔레트/vblank 재시도의 **세부 점유 비율은 미확정**이다. 실패하는 Wine D3DKMT vblank probe와 중복 로그는 `maxfps=0` A/B에서 실제 사라졌지만 **새 게임프레임 개선은 소폭, CPU는 약98% 그대로**다. 따라서 다음 큰 개선을 위해서는 guest idle polling vs software game Blt vs Wine/BoxedWine interpreter가 차지하는 비용을 **원본을 변경하지 않는 분리 계측**으로 확정해야 한다. `maxgameticks` 제거는 실측 악화로 추천하지 않는다.

### 자료 위치

- 원본 IDA: `web/native-test/worker3/init-ida.json` (`0x474910`, `0x474CE6`), `save-ida.json`, [GAMEPLAY.md](GAMEPLAY.md).
- 배포: `web/compat/ddraw.ini`, `web/tools/build.mjs:58–63`, `web/dist/assets/game.zip`, `web/dist/game-manifest.json`, `web/src/launcher.js`, `web/runtime/SingleThreaded/boxedwine.js`.
- CNC-DDraw 공식 소스: [v7.1.0.0/src](https://github.com/FunkyFr3sh/cnc-ddraw/tree/v7.1.0.0/src) — `dd.c`, `utils.c`, `ddsurface.c`, `winapi_hooks.c`, `fps_limiter.c`, `render_gdi.c`.
- 메인 Chrome 측정(재실행하지 않음): `web/test-results/performance/baseline/performance.json`, `cpu.cpuprofile` 및 `web/test-results/performance/no-render-vblank/performance.json`. `maxgameticks=-1` A/B의 성능 악화와 baseline 신규 변경 게임 프레임 FPS 수치는 메인 작업자가 보고한 실행 결과다.
