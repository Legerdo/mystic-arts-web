# Mystic Arts 재개 검증 기록 — 2026-10-18

현재 판정: **v2 안정화 후보 및 재현 빌드 도구 구현. 정식 채택은 보류.**
독립 검사에서는 기능 32/32가 통과했으나 새 ZIP 실행에서 이동 후 점프 검사가 다시 실패했다.
최적화된 dist/ZIP은 `lab/resume-20261018/integrated-dist`, `integrated-release`에 보존했고,
정식 `dist`와 `release`는 `preserved-release`의 기존 기준선으로 복원했다.
사용자의 추가 요청에 따라 오픈소스 대안의 실제 빌드·실행과 두 조합 후보를 추가 검증했다.
최종 상태: **안정적인 30FPS 및 60FPS 목표 미달, 정식 배포는 보존된 기준선 유지.**
구현·검증 산출물은 아래 후속 결과에 기록했다. 전체 작업 완료로 판정하지 않는다.

## 원본과 생성물

- 원본 EXE SHA-256: `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`.
- 원본 64개 파일과 dist/기준선/v2 게임 ZIP의 바이트 일치 확인: `lab/resume-20261018/initial-integrity.json`.
- 기존 v2 WASM: `c18f09a77406970beb453786e2cd2175fbfd03c83dc2db6decc6506b00f59c12`.
- 수정 후보 WASM: `ac8df2b940997bb24f59798a6bd83746117cc7ba1a130b04b8d5d88d1e40b80a`.
- 인수 시 generate.mjs에는 미컴파일 fill 루프·선택적 quantum 코드가 있었지만 기존 WAT/WASM은 5개 루프였다.
  기존 소스는 보존했다. `lab/resume-20261018/generate-v2.mjs`는 역사적 v2 WAT를 정확히 재생성한다.
- 역사적 v2 컴파일 명령은 확인되지 않았다. 새 후보는 기존 Binaryen 131, 최적화 패스 없이 컴파일하며
  `tools/cpu-loops/artifact-lock.json`의 입력 및 WAT/WASM 해시를 빌드마다 검사한다.
- `tools/cpu-loops/generate.mjs`는 물리 주소+길이를 i64로 검사한다. 기존 i32 덧셈의 wrap을 고친 것이다.
  잘못된 MMU 항목에서 기존 v2가 OOB trap을 내는 회귀를 재현했다. 정상 게임에서 그 항목이 발생했다는 뜻은 아니다.
- 타이머, 스케줄러 정책, 게임 규칙, EXE, 게임 데이터는 변경하지 않았다.

## 의미론 및 실패 검사

- 기존 215건 원본 NormalCPU 오라클: **215/215 PASS**, `oracle-v2-recheck.json`.
- 수정된 overflow 재현 시험을 포함한 기존 v2: **313 PASS / 1 FAIL**, `oracle-v2-overflow-repro.json`.
- 수정 후보: **316/316 PASS**, `oracle-fixed-faults.json`.
  원래 정상 120/거부 95 + 경계 99 + 검증 실패 주입 2.
- CPU 1392바이트, 관련 RAM/MMU/opcode/branch/quota 상태를 비교한다.
  N=1/256, 4KiB 끝, 물리 alias, MXCSR/0/부호 있는 0/subnormal/유한 입력,
  quota/yield 및 mismatch/원본 throw 시 중단·복원을 포함한다.
- 비교기 6종 변조 음성 대조군과 소스/바이너리 변조 빌드 거부도 확인했다.
- 실제 게스트 COW/page-fault 전체 실행, 모든 SSE 예외, 16라운드 전체 동등성 증명은 아니다.

## 실제 측정

Windows 11, Ryzen 7 9800X3D, RTX 5080, RAM 32GB, Chrome 155.
브라우저는 Headless, 새 컨텍스트, 같은 원본 저장/옵션과 Stage1 방향/Z/X 입력 패턴이다.
서로 다른 엔진은 동일 논리 프레임의 스냅샷에서 재생한 결정론적 A/B가 아니다.

| 대상 | 변경 화면 FPS | 변경 간격 p95 |
|---|---|---|
| 기본 배포 3구간 | 11.01 / 12.13 / 11.90 | 116.8 / 117.8 / 113.0ms |
| 역사적 v2 3구간 | 40.00 / 47.40 / 47.74 | 44.7 / 37.3 / 35.3ms |
| 수정 후보 3구간 | 45.63 / 48.16 / 42.62 | 35.4 / 40.6 / 45.9ms |
| 수정 후보 장기 30구간 / 286.25초 | 가중 평균 46.21, 구간 37.61~49.60 | 구간 34.7~50.6ms |
| Windows 원본 3구간 | 59.872 / 59.878 / 59.876 | 17.15 / 17.17 / 17.23ms |

장기 시험의 270개 완전한 1초 창 중 **7개가 30FPS 미만**, 최소 3개 변경 프레임이었다.
첫 구간에는 약 925ms의 이미지 변화 공백과 연속 60~78ms WASM slice가 있었고,
10번째 구간에는 브라우저 long task 없이 약 1.27초의 이미지 변화 공백도 있었다.
후자는 원본의 사망/전환 정지와 처리량 문제를 아직 분리하지 못했다.
따라서 **항상 안정적인 30FPS는 미달/미입증, 웹 60FPS도 미달**이다.
게임 시간을 바꾸거나 같은 그림을 다시 그려 수치를 올리지 않았다.

장기 Chrome ThreadTime/경과 시간은 구간별 약 78.8~94.7%.
추가 프로파일의 원본 NormalCPU dispatch와 runSlice 비용이 남아 있다.
세부 guest hotspot 또는 일시 정지 원인 확인 없이 새 가속 루프나 scheduler ceiling을 활성화하지 않았다.

분리한 이동/점프 입력 12건씩에서 Canvas 옷 색상 중심의 실제 방향 변화:
기준선 평균 177.5ms / p95 318.4ms, 수정 후보 평균 99.7ms / p95 375.3ms.
각 12/12 관측. 평균은 개선됐지만 꼬리 지연 개선은 입증되지 않았다.
이는 trusted key timestamp → 화면상의 이동 반응이며 물리 키보드/디스플레이 측정은 아니다.
Web Audio buffer scheduling 및 reported base/output latency를 기록했지만
스피커의 실제 음향 지연은 측정하지 않았다.

원시 자료는 `test-results/performance/resume-*`,
Windows 원본은 `lab/resume-20261018/native-reference-approved/reference.json`과 PNG다.
원본 화면은 약 119회/초 GDI 샘플링이며, native 렌더 hook 측정은 아니다.
앞선 두 원본 시도는 포커스 상실로 기각했고, 사용자 동의 후 대조는 성공·프로세스 종료를 확인했다.

## 기능 검사와 검증기 변경

- 기존 순서/기준의 v2-bounds 검사: 이동 후 점프가 반복 실패, 진단 수집에서 **31/32**.
- 이벤트 기록상 이동 keyup → X keydown 283ms, 이 중 이미지 분석 181ms.
  이미지 분석 중에도 게임·적이 진행되므로 검증기가 상태에 영향을 줄 수 있다.
- 색 집계/플레이어 검출을 Pillow C 연산으로 바꿨다. 기존 9개 캡처의 모든 판정값이 동일했고
  평균 166ms → 9ms. 기존 고블린 제외 회귀와 합성 팔레트/중심 검사도 유지했다.
- 이동/점프 사이에는 실제 Canvas 픽셀을 읽어 screenshot 안정화 대기를 줄였다.
  trusted 키 입력, 시간 설정, 이동/점프 15픽셀 합격 기준은 그대로다.
- `resume-baseline-static-final`, `resume-fixed-static-final`: 각각 **32/32 PASS**.
- 최종 ZIP `resume-release-static`: **11개 중 10 PASS, 점프 FAIL**.
  지연 개선이 실패 원인을 완전히 해결했다는 주장은 철회하며 실패 로그를 보존한다.
- 통과 범위: 타이틀/옵션, 이동, 점프의 별도 성공, pause/resume, MIDI/PCM 비무음,
  mute/unmute, 네트워크 차단 후 실행, IndexedDB/내보내기/재로드/손상 저장 복구.
  공격 키·적 움직임·피격 장면은 관측했지만 모든 타격/충돌/AI 규칙을 대조한 것은 아니다.

## 수정 파일

- `tools/cpu-loops/*`: 독립 5루프 생성기, overflow 방어, compiler/input/output pin,
  원본 오라클 강제, 후보 생성 시 baseline 자산/원본 ZIP 독립 검증.
- `tools/build.mjs`: 64개 원본 해시 강제; 후보는 `--cpu-loops --output <새 폴더>`에서만 생성.
  기본은 가속 없는 기존 경로다.
- `lab/loop-validation/oracle-differential.mjs`: 출력 덮어쓰기 금지, --wasm/--output,
  확장 경계 및 검증 실패 주입.
- `tests/performance.py`, 새 `performance-exact-probe.js`: 전체 픽셀 비교, guest 진입점 counter,
  실제 시각 입력 반응/오디오 scheduling/구간 raw 로그.
- `tests/browser-static.py`, `test_visual_metrics.py`: 동일 판정의 빠른 이미지 분석,
  입력/캡처 시간 기록, 별도 build/output 및 실패를 유지하는 진단 수집.
- `tests/archive.test.mjs`, 새 `cpu-loops.test.mjs`: 독립 후보 검사와 변조 거부.
- 새 `tests/native-reference.py`: 원본 64파일의 격리 복사, 소유 process의 입력/화면 대조.
- `README.md`: 후보 상태·재현·한계. 기존 연구 및 PASS 산출물은 보존.

## 재현 및 배포 상태

```powershell
node lab/loop-validation/oracle-differential.mjs --extended --wasm lab/resume-20261018/fixed/loops.wasm --output <새 결과.json>
node tools/build.mjs --cpu-loops --output lab/<새 후보>
node --test tests/archive.test.mjs tests/midi-bridge.test.mjs tests/cpu-loops.test.mjs
python tests/test_visual_metrics.py
python tests/browser-static.py --build lab/<새 후보> --output test-results/<새 결과>
python tests/performance.py --build lab/<새 후보> --output test-results/performance/<새 결과> --trials 30 --exact --verify-loops
```

통합 빌드 후 Node 10/10 PASS 기록: `lab/resume-20261018/final-node-tests.log`.
일반 정적 HTTP의 /mystic-arts/ 하위 경로, COOP/COEP 없음, SAB 없음은 실제 확인됐다.
GitHub 원격 저장소/실제 Pages 게시를 수행한 것은 아니다.
원본 2~16라운드·엔딩, 완전한 타이밍/음색/물리 parity, 다른 PC/브라우저는 미검증이다.

## 후속 조합 후보와 최종 판정

실행 환경: Windows 11 / Ryzen 7 9800X3D / RTX 5080 / 32GB / Chrome Headless 155.0.8059.82.
Stage1에서 동일한 방향키·Z/Z 공격·X 점프 순서를 사용했다. 각 행은 별도 새 VM 실행이며
적/피격/게임 상태의 결정적 replay를 구현한 것은 아니다. 평균 향상만으로 의미론 동등성을 주장하지 않는다.

| 빌드 | changedFrameFps 구간 | 간격 p95 구간(ms) | 측정시간 / Renderer CPU ThreadTime(s) | 최대 host slice(ms) |
| --- | --- | --- | --- | --- |
| 기준선 | 11.01–12.13 | 113.0–117.8 | 29.19 / 28.74 | 32.8 |
| v2 bounds 수정 | 42.62–48.16 | 35.4–45.9 | 28.68 / 24.98 | 105.3 |
| v2 bounds 30구간 | 37.61–49.60 | 34.7–50.6 | 286.25 / 251.68 | 78.4 |
| tail-call + v2 bounds | 43.50–50.09 | 36.0–39.3 | 28.91 / 24.27 | 89.1 |
| 위 조합 + 1M quota 상한 | 45.79–50.18 | 33.4–34.8 | 28.65 / 24.88 | 21.5 |

tail-call 후보는 기존 원본 명령 파서를 재실행해 1,192개 변경 모두가 함수 최상위의
마지막 동일 시그니처 call_indirect → return_call_indirect임을 확인했다.
`tail-combination-byte-audit.json`은 전체 바이너리의 다른 바이트가 바뀌지 않았음을 검사한다.
원본 오라클 316건과 별도로 두 후보 Chrome 실행에서 각 루프 16건, 총 80건/실패0을 확인했다.
이것은 전체 실행 동등성이나 다른 브라우저의 tail-call 지원을 증명하지 않는다.

`quantum-candidate.mjs`는 고정된 runtime 해시와 초기 scheduler 값 100,000을 확인한 뒤
각 MainLoop.runIter 전에 contextTime(319056)의 상한만 1,000,000으로 설정한다.
게스트 timeGetTime, 원본 16ms 게이트, SKIP, AI, 명령어 실행량 계산은 그대로다.
호스트 스레드 스케줄링 정책은 달라진 실험이므로 일반 5루프 빌드에 합치지 않았다.
실제 구간 quota는 내부 적응 증가를 포함해 최대 약1.04M이었다.

관측된 입력→플레이어 중심 이동(밀리초; 실제 하드웨어 키보드/디스플레이 지연 아님):

| 빌드 | 관측/입력 | 평균 | p50 | p95(관측된 입력만) |
| --- | --- | --- | --- | --- |
| 기준선 | 12/12 | 177.49 | 178.8 | 318.4 |
| v2 bounds | 12/12 | 99.69 | 78.5 | 375.3 |
| tail + bounds + 1M | 11/12 | 103.34 | 81.4 | 219.8 |

마지막 후보의 1건은 미확인이므로 입력 반응 전체가 개선됐다는 결론을 내리지 않는다.
새 후보의 `test-results/resume-q1m-static/browser-static.json`은 **32/32 PASS**다.
그러나 기존 v2 ZIP의 점프 실패 기록은 유지하며, 이 한 번의 통과로 실패가 해소됐다고 주장하지 않는다.

### 긴 정지의 추가 증거

tail 조합 첫 구간 최대 변경 화면 간격은 880.3ms, 1M 후보는 907.1ms였다.
quota 상한이 브라우저의 긴 CPU 점유를 줄여도 게스트 내부 정지는 남았다.
추가 진단 run 두 건은 각각 31.56FPS/최대1,445.1ms 및 46.67FPS/최대1,010ms였다.
전자는 추가 오프라인 감사 작업이 같은 호스트에서 진행된 진단이며, 성능 A/B의 근거로 쓰지 않는다.
어느 결과도 삭제하거나 안정 판정을 위해 제외하지 않았다.

read-only `gapEvidence`에서 약1초 구간에 tick/draw/entity counter가 거의 정지했다.
해당 시점의 CPU는 다른 KMemory인 경우도 있어 게임 메모리 읽기는 null로 기록했다.
임의의 다른 프로세스 값을 게임 시계라고 해석하지 않는다.

기존 .so 전용 모듈 검사로는 주소가 UNMAPPED였다. `attribute-gap-code.py`가
wine/game ZIP의 실제 ELF/PE 1,112개를 검사해 **10개 주소 모두 96/96 바이트 일치**를 찾았다:
wineserver 5개, libc.so.6 4개, libX11.so.6.4.0 1개. 이는 CPU 시간 비중 통계는 아니다.
IDA에서 wineserver RVA 0x3358F는 레지스트리 경로 출력, 0x55DB7은 Unicode 문자열 직렬화,
호출자 0x33FEA는 WINE REGISTRY Version 2 저장 헤더와 전체 하위키 출력을 확인했다.
[Wine 6.0 server/registry.c](https://github.com/wine-mirror/wine/blob/wine-6.0/server/registry.c)는
30초마다 dirty branch를 동기 직렬화한다. 관측된 guest 시계 약30초와도 일치한다.
따라서 초기 긴 정지의 유력 원인은 Wine 레지스트리 자동저장이다.
저장 함수 진입/종료 전체 추적과 인과성 A/B는 아직 없어 모든 정지를 이 원인으로 확정하지 않는다.

저장을 끄거나 주기를 늘려 정지를 숨기지 않았다. system.reg는 1,383,313바이트다.
후속 수정에는 직렬화 결과·오류·원자적 파일 교체·읽기 상태를 보존하는 가속 또는
Wine 저장 구현 변경과 독립 오라클 검증이 필요하다. 그 변경은 이번에 구현하지 않았다.

### 추가 산출물·재현

```powershell
node tools/cpu-loops/candidate.mjs resume-tail-loops performance-tail-all
python lab/resume-20261018/verify-tail-combination.py
node lab/resume-20261018/quantum-candidate.mjs
python tests/performance.py --build lab/performance-resume-tail-loops-q1m --output test-results/performance/<새 이름> --label q1m --trials 3 --exact --verify-loops
python tests/browser-static.py --build lab/performance-resume-tail-loops-q1m --output test-results/<새 이름> --collect-all-checks
python tests/performance.py --build lab/performance-resume-tail-loops-q1m --output test-results/performance/<새 입력 결과> --label q1m-input --trials 1 --iterations 6 --exact --input-only
```

후보 생성 명령은 이미 존재하는 출력 폴더를 거부한다. 현재 만들어진 두 후보는 그대로 재시험한다.
원시 결과: `test-results/performance/resume-tail-loops-exact`, `resume-tail-loops-q1m`,
`resume-q1m-gap`, `resume-q1m-gap-code`, `resume-q1m-input`.
바이트 대조/IDA: `lab/resume-20261018/gap-code-attribution-all.json`, `gap-registry-ida.json`.

추가 수정 파일: `tests/performance-exact-probe.js`에 중복 화면 구간의 read-only counter/코드 샘플;
`lab/resume-20261018/quantum-candidate.mjs` 독립 상한 후보 생성;
`verify-tail-combination.py` tail 명령 경계 재검증;
`attribute-gap-code.py` 확장 모듈 대조;
`research/wine-assembly-browser.py` 공식 엔진 페이지에서 실제 로컬 ZIP 실행;
`final-audit.py` 최종 원본/배포/후보 무결성 검사.

오픈소스 조사·실행 및 실제 Pages 공유 메모리 증거는
[후속 조사 문서](WEB-EMULATION-RESEARCH-20261018-UPDATE.md)에 있다.
Wine-Assembly는 굴림체 열거 대기로 실제 Chrome에서도 검은 화면이었고,
BottleShip의 MIDI 미구현은 현재 고정 소스에서도 확인됐다. 즉시 교체하지 않는다.

최종 게이트: Node **10/10 PASS**, 이미지 검출 **3/3 PASS**;
로그 `final-gates-node.log`, `final-gates-visual.log`.
최종 무결성 `lab/resume-20261018/final-evidence.json`:
원본64파일 일치, dist/release의 보존된 기준선과 전체 파일 해시 일치,
두 조합 후보의 manifest/게임 ZIP 원본 일치, 외부 엔진 tracked source 무변경.
최적화 ZIP/원격 GitHub Pages 배포는 새로 승인·완료하지 않았다.
