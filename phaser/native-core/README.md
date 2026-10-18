# Mystic Arts — 원본 게임 로직 / Phaser

> 이 문서는 초기 로컬 검증과 성능 연구 이력을 보존한다. 현재 공개 실행/빌드 안내는 [최상위 README](../../README.md), 최종 배포 검사는 [VERIFICATION.md](../../docs/VERIFICATION.md)가 기준이다. 공개 사이트: https://legerdo.github.io/mystic-arts-web/.

화면 안내: 게임/기본콤보/특수기 선택 탭을 제거했다. 기본·콤보와 특수기는 게임 양옆에 표시하고, 좁은 세로 화면에서는 게임 아래 두 칸으로 배치한다. 높이가 부족한 안내는 패널의 이전/다음 버튼으로 읽으며 페이지 전체를 스크롤하지 않는다. 화면 확대는 안내를 접고 게임을 키운다. 전체화면은 게임 영역만 표시하며 Esc로 해제한다. 내부 640×480 해상도, 원본 입력 판정과 게임 시계는 유지한다.

기술표는 이동·점프 / 방어·기본 공격 / 콤보 연결 / 메뉴로 구분한다. 동작 이름과 입력 키캡을 나란히 놓고 조건은 아래에 표시한다. 특수기는 `+`(동시 입력)와 `후`(순서대로)를 구분하고 기력 조건을 별도로 강조한다. 인터넷/원본 코드 대조로 확인한 기술의 입력과 발동 조건을 유지한다.

레이아웃 확인: `python phaser/native-core/layout-check.py controls-readable-01` — Chrome 155에서 320×240~3840×2160의 10개 화면 크기, 모든 안내 페이지의 잘림/접근성, 확대, 게임만 전체화면/Esc 복귀, 실제 1라운드 플레이 중 크기 변경을 검사했다. `controls-readable-01/result.json`: PASS, 페이지 오류 0건. 재실행할 때는 새 결과 폴더 이름을 사용한다. 이 검사는 새로운 FPS 측정이나 전체 캠페인 검증을 의미하지 않는다.

후속 수정: EXIT의 `USER32.dll!DestroyWindow` 미지원 오류를 웹 세션 종료로 연결했다. Worker·음향·Phaser 화면을 정리하고 게임 실행 버튼으로 재시작한다. 음향 컨텍스트를 공유/재사용하며 종료 시 정지한다. 조작 안내는 [인터넷 자료와 원본 입력 판정의 대조 기록](CONTROLS.md)을 기준으로 보강했다. 아래 c98c8169 빌드 해시·패키지·성능 수치는 이 EXIT 수정 이전의 보존된 기록이다.

2026-10-18. 최신 로컬 실행: **http://127.0.0.1:5175/**. 기존 페이지는 새로고침한 뒤 게임 실행을 누른다.
이 경로는 첫 연습 데모를 확장한 임의 AI가 아니라, 원본 게임 코드와 자료를 실행하는 전체 게임 후보다.
**평균 60FPS 부근까지 개선했지만, 모든 순간 60FPS 이상과 전체 캠페인 완전 동등성은 아직 입증하지 못했다.**

## 구현과 보존 범위

- Phaser 3.90.0이 화면을 표시하고, 별도 Worker의 Unicorn.js 2.1.4 WASM이 원본 x86 게임 함수를 실행한다. Wine/Windows 그래픽 드라이버를 통과하지 않는다. 일반 정적 HTTP(S) 파일만 필요하다.
- 타이틀·옵션·HUD·AI·콤보·스킬·피격·사망·라운드/엔딩 상태 머신은 원본 코드다. 16.16 고정소수점, 원본 16ms 게이트와 SKIP 옵션을 유지한다.
- 원본 47개 이미지의 인덱스/팔레트, blit/키 색/반전/클리핑을 합성한다. 원본 WAV 뱅크 파서와 DirectSound의 16개 음성 선택을 실행하고 Web Audio로 출력한다. 효과음 35개, MIDI 6개를 사용한다.
- MIDI 원본 루프 플래그를 반영하며 2번 곡은 일회 재생이다. 음색 합성기는 기존 TinySynth다. Windows 음원 장치와 음향 파형까지 같다는 주장은 하지 않는다.
- 원본 20바이트 저장 형식과 원본 읽기/쓰기 함수를 사용한다. 초기에는 원본 파일 묶음의 저장을 읽고 이후 `mystic.phaser.native.save.v1` 브라우저 저장을 우선한다. 원본 디스크 파일과 이전 실행기의 저장은 변경하지 않는다.
- 원본 64개 파일과 이전 `web/dist`, `web/release`, 첫 Phaser 연습용 `phaser/dist`는 보존한다. 5175의 정적 서버 루트만 이 후보로 변경했다.

## 수정 파일과 이유

| 파일 | 역할/변경 이유 |
|---|---|
| `core.mjs` | 원본 PE/RAM/CPU와 파일·입력·표면·DirectSound 경계 연결. 알 수 없는 호출은 오류로 처리한다. 저장 파일의 CREATE_ALWAYS 절단 규칙도 반영한다. |
| `hot-functions.mjs` | 실제 프로파일에서 확인한 충돌/지형/커맨드/dirty 영역의 8개 함수만 가속한다. AI·전투 상태 머신·게임 시계는 변경하지 않는다. |
| `renderer.mjs` | 8비트 표면 합성 및 최종 RGBA 변환. 팔레트 배열과 반환된 화면 버퍼를 재사용한다. |
| `worker.mjs` | 원본 메인 루프의 시간/skip 정책과 입력을 연결한다. 측정 중에만 CPU/합성 구간을 기록한다. |
| `main.mjs`, `index.html` | Phaser 표시, 실제 키 입력, Web Audio, 저장, 픽셀 변화 10초 측정. 불필요한 매 프레임 DOM 변경과 화면 버퍼 할당을 줄였다. |
| `prepare.mjs`, `build.mjs`, `preview.ps1` | 버전 고정, WASM 어댑터 출처 확인, 원본/이미지 해시 검사, 정적 빌드 매니페스트, 포트의 실제 빌드 확인. |
| `check-hot.mjs`, `play-check.py`, `static-check.py` | 원본 CPU 차등 검사와 실제 브라우저 입력·픽셀·저장 경로 검증. 기존 Wine 검사 기준을 수정하거나 완화하지 않았다. |

Unicorn의 instruction-count 계측은 원본 초기화 코드에서 번역기 오류를 일으켜 정상 실행 모드(count=0)를 사용한다. 게임 실행은 종료 가능한 Worker 안에 있다. 원본 EXE 명령 바이트를 패치하지 않았다.

## 성능 측정

Chrome **155.0.8059.82 Headless**, Windows 11, 640×480 원본 캔버스. 브라우저 렌더 이벤트 때 **실제 캔버스 픽셀 전체를 비교**했다. 표시 호출 수나 Worker 메시지 수를 FPS로 계산하지 않는다. 관측된 브라우저 렌더 간격 중앙값은 약 8.3ms였다.

실제 시스템 조회: Windows 11 Pro 10.0.26300, Ryzen 7 9800X3D, RTX 5080, 시스템에 표시된 물리 RAM 31.14GiB(32GB 구성).

| 구간 | changedFrameFps | 변경 간격 p95 | 최장 간격 | CPU 작업 평균 |
|---|---:|---:|---:|---:|
| 이전 전체 게임 후보, 6개 가속 함수, 10초 | 60.27 | 25.2ms | 66.9ms | 5.04ms/tick |
| 최종 5175 전달본, 10초 ×3 | 61.46~61.76 | 25.1~25.2ms | 33.9~50.1ms | 1.91~2.05ms/tick |
| 연속 플레이 중 10초 ×12, 1→2라운드 | 58.37~61.56 | 25.1~33.3ms | 116.8ms | 전체 평균 1.865ms/tick |
| 16라운드 보스전, 10초 ×3 | 61.06~61.46 | 25.1~25.2ms | 41.6~50.0ms | 전체 평균 2.262ms/tick |
| 원본 스킬/카메라 흔들림 반복, 10초 | 61.26 | 25.2ms | 50.0ms | 1.774ms/tick |

장기 구간의 CPU p95는 3.0ms, 최대 29.5ms이며 합성 평균은 0.447ms다. 최대 76개 엔티티를 관측했다. 1라운드의 정상 적 처치 후 2라운드로 실제 전이했다. 이 결과를 전체 캠페인 클리어로 확대 해석하지 않는다.

기본 입력: 방향을 번갈아 누르며 Z 85ms + 160ms 간격, 네 번째 공격마다 X 100ms. 16라운드는 원본 옵션의 STAGE SELECT와 원본 일시정지 화면으로 진입했다. 메모리로 라운드를 바꾸지 않았다.
스킬 부하는 원본 옵션 MP FREE를 켜고 `↓, 중립, ↓+Z`를 반복한 별도 조건이다. 원본 action 15와 **618개 측정 tick 중 561개 카메라 흔들림 상태**를 확인했다. 정상 옵션 캠페인 성능과 같은 조건으로 취급하지 않는다.

입력 검사는 DOM 키다운부터 플레이어의 오른쪽 이동 및 캔버스 픽셀 변화까지 **12.9ms, 1회**였다. 물리 키보드/모니터 지연이나 전체 입력 지연 분포를 입증한 값이 아니다.

화면 준비 즉시 Phaser를 수동 갱신하는 대안은 59.26~59.76FPS로 악화되어 제외했다. 원시 결과 `play-arrival-01/`은 보존한다.

## 검증과 무결성

- `hot-validation-final-07.json`: **396/396 함수 사례**, 1~16라운드 및 엔딩 진입의 **10,200/10,200 프레임 PASS**. 원본 Unicorn CPU와 가속 경로의 데이터 RAM/할당 힙, 그리기·오디오 명령, 최종 인덱스 픽셀을 비교했다.
- `positive-commands-final-01.json`: 원본 10개 커맨드의 양쪽 방향 **20/20 실제 성공 패턴 PASS**. 원본 반환값과 가속 반환값 모두 해당 커맨드 번호와 일치한다.
- 초기 검증에서 발견한 사각형 경계의 포함 비교 문제를 수정했다. 실패 기록 `hot-validation-01.json`은 남겼다. `03/04`의 추가 명령 비교 실패는 원본의 빈 RET 함수에 생성하던 불필요한 진단 명령 때문이었다. 그 원본 no-op은 원본 CPU가 그대로 실행하도록 수정했다.
- `static-final-01/result.json`: **8/8 PASS**. 실제 입력, 일시정지, 네트워크 차단 후 전투, 원본 20바이트 저장·재로드·원본 함수의 20바이트 읽기·라운드 해금 마스크(63) 복원을 확인했다.
- 초기에는 일반 Python 정적 서버의 `/phaser/native-core/dist/` 하위 경로에서 실행했다. `crossOriginIsolated=false`, `SharedArrayBuffer=undefined`, COOP/COEP 헤더 없음. 당시에는 원격 배포 전이었다. 현재 Pages 검사 결과는 최상위 검증 문서를 따른다.
- 원본 EXE SHA-256: `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`.
- 64개 원본과 47개 이미지 인덱스는 빌드 시 원래 매니페스트와 대조한다. 정적 파일 168개의 해시는 `dist/build-manifest.json`에 있다.
- 전달본 매니페스트 SHA-256: `c98c8169611004ac940b79c24bfd8d8fb812217093661e247c766d74a257e469`.
- 가속 함수 SHA-256: `fa2e922f3ea5dc8997b20e3565ba4444427a356ce5cac39966155c2a356f617f`.
- Unicorn 원본 배포 JS `643adbbb0c77eadb71182f116c9da0860814221a25194dac3ed561589929ef6d`; heap getter 어댑터 `a0760828c23d0ae83b525c74d5354bec68de77f9de37d7f92426199d64f8681e`. 빌드된 ESM 파일은 `3f55a9930bbcb17770ce5c1fd4a9e613b0778f73b3be59cc88742ab51e2b5832`. WASM CPU 바이트는 바꾸지 않았다.

차등 검사는 같은 플랫폼 어댑터 위에서 가속 함수가 원본과 일치하는지 검사한다. 플랫폼 어댑터/합성기가 원본 Windows와 완전히 같은지는 별도 대조가 필요하다. CPU의 모든 임시 레지스터/예외 상태까지 같다는 검증도 아니다. 기존 Wine의 32/32 기록을 이 구현의 검사 결과로 가져오지 않는다.

## 실행과 재현

`web`에서 실행한다. 출력 보고서/디렉터리는 기존 원시 결과를 보존하도록 사용하지 않은 이름을 지정한다.

```powershell
node phaser/native-core/build.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File phaser/native-core/preview.ps1 -Port 5175
node phaser/native-core/check-hot.mjs hot-recheck-new.json
python phaser/native-core/play-check.py --url http://127.0.0.1:5175/ --output test-results/performance/native-core-new --trials 3
python phaser/native-core/play-check.py --url http://127.0.0.1:5175/ --output test-results/performance/native-core-round16-new --round 16 --trials 3
python phaser/native-core/static-check.py static-recheck-new
```

원시 결과: `play-perf-03/`, `play-perf-04/`, `delivery-play-final-01/`, `play-round16-02/`, `wall-play-final-01/`, `skill-shake-final-01/`, `static-final-01/`. 각 JSON과 PNG를 함께 보존한다. 5176도 같은 후보를 제공하며 5174의 Wine 후보는 유지한다.

전달 검증 요약은 `delivery-validation-01.json`이다. 별도 정적 패키지 `releases/mystic-phaser-original-core-c98c8169.zip`의 169개 항목을 다시 해시 검사했다. ZIP SHA-256은 `455f5a3ed4710b59fea508307fa9bc8954686fab92eefdd95282bb7c17a831fc`다. 이전 정식 ZIP은 교체하지 않았다.

## 아직 완료하지 않은 범위

매 순간 60FPS는 미달이다. 장기 구간의 58FPS대, 33ms 이상의 프레임, 라운드 전환의 116.8ms 간격을 숨기지 않는다. 원본의 정지/슬로 연출(0x42091A, 0x42097F, mode 7)도 유지한다. 정지 화면을 재출력해 변경 FPS를 높이지 않는다.

정확히 보고된 콤보 마지막 타격→적의 벽 충돌 장면은 이번 실제 입력 기록에서 카메라 흔들림까지 재현되지 않았다. 스킬로 발생시키는 같은 원본 카메라 흔들림은 별도로 실행했다. 전체 16라운드 정상 연속 클리어, 모든 보스 후반 패턴/엔딩 분기, 장시간 반복 저장/게임오버, Windows 원본과의 전체 시각·음향·타이밍 대조는 남아 있다. 따라서 최종 완전 동등성 릴리스로 표시하지 않는다.

오픈소스 출처: [Unicorn.js](https://github.com/AlexAltea/unicorn.js), [Phaser 3.90.0](https://github.com/phaserjs/phaser/tree/v3.90.0), [TinySynth](https://github.com/g200kg/webaudio-tinysynth). 라이선스와 어댑터 생성 소스는 정적 폴더의 `licenses/`에 포함한다. 이 문서에 기록한 c98c8169 ZIP은 초기 로컬 확인 패키지이며 현재 Pages 산출물과 구분한다. 상세 권리/라이선스 추적은 [이슈 #1](https://github.com/Legerdo/mystic-arts-web/issues/1)에 있다.
