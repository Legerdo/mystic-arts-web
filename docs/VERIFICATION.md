# 검증과 재현

날짜: 2026-10-18. 공개 대상: 원본 x86 / Unicorn.js 2.1.4 / Phaser 3.90.0 / TinySynth 1.1.3. 페이지는 [GitHub Pages](https://legerdo.github.io/mystic-arts-web/), 배포 과정은 [Actions](https://github.com/Legerdo/mystic-arts-web/actions/workflows/pages.yml)에서 확인합니다.

## 최신 배포 검사

| 항목 | 원시 결과 | 범위 |
|---|---|---|
| 원본 CPU 차등 재검사 | [hot-public-release-01.json](../phaser/native-core/hot-public-release-01.json) | 396사례 + 10,200프레임, RAM/힙/그리기·음향 명령/인덱스 화면 일치 |
| 로컬 정적 하위 경로 | [static-public-release-02/result.json](../phaser/native-core/static-public-release-02/result.json) | 8개 실제 브라우저 항목, 소스와 일치한 배포 매니페스트 |
| 공개 Pages 실행 | [pages-public-release-01/result.json](../phaser/native-core/pages-public-release-01/result.json) | 공개 URL에서 동일 8개 항목 재검사; 배포 후 기록 |
| 공개 Pages 픽셀 성능 | [pages-performance-01/result.json](../phaser/native-core/pages-performance-01/result.json) | 원본 1라운드 입력, 10초; 배포 후 기록 |
| 기술표·화면 구성 | [controls-readable-01/result.json](../phaser/native-core/controls-readable-01/result.json) | Chrome 155, 10개 크기·모든 안내 페이지·확대·전체화면·실제 플레이 |
| EXIT·재시작 | [exit-no-tabs-final-02/result.json](../phaser/native-core/exit-no-tabs-final-02/result.json) | 2회 종료 후 세 번째 실행, 음향 컨텍스트 1개 재사용, 원본 저장 보존 |

공개 URL 검사는 배포가 완료된 뒤 실행하며, 원시 JSON과 이 문서의 결과를 함께 갱신합니다. 로컬 통과를 원격 통과로 대체하지 않습니다.

### 실행 명령

Node.js 24, Python의 Playwright, 설치된 Chrome을 사용합니다. Python 도구는 개발 검증 의존성이며 방문자에게 필요하지 않습니다. 기존 결과는 덮어쓰지 않으므로 이름 뒤에 새 접미사를 지정하세요.

```sh
npm run setup
npm run build
npm run verify
node phaser/native-core/check-hot.mjs hot-recheck-new.json
python phaser/native-core/static-check.py static-recheck-new
python phaser/native-core/static-check.py pages-recheck-new --url https://legerdo.github.io/mystic-arts-web/
python phaser/native-core/play-check.py --url https://legerdo.github.io/mystic-arts-web/ --output phaser/native-core/pages-perf-new --trials 1
node tools/verify-native-dist.mjs --url https://legerdo.github.io/mystic-arts-web/
```

화면/EXIT 검사는 기본적으로 로컬 5175 서버를 사용합니다.

```sh
python phaser/native-core/layout-check.py layout-recheck-new
python phaser/native-core/exit-check.py exit-recheck-new
```

## 보존된 이전 측정

| 기록 | 실제 픽셀 FPS | 해석 |
|---|---|---|
| [delivery-play-final-01](../phaser/native-core/delivery-play-final-01/result.json) | 61.46~61.76 | 이전 c98c8169 전달본 10초 ×3 |
| [play-perf-04](../phaser/native-core/play-perf-04/result.json) | 58.37~61.56 | 연속 플레이 12개 10초 구간, 1→2라운드 |
| [play-round16-02](../phaser/native-core/play-round16-02/result.json) | 61.06~61.46 | 원본 STAGE SELECT·pause 메뉴로 16라운드 진입, 연속 캠페인 아님 |
| [skill-shake-final-01](../phaser/native-core/skill-shake-final-01/result.json) | 61.26 | 원본 MP FREE 옵션을 켠 별도 스킬 부하 |
| [positive-commands-final-01](../phaser/native-core/positive-commands-final-01.json) | 해당 없음 | 원본 커맨드 10종 × 양 방향, 20개 양성 입력 |

입력은 방향을 번갈아 누르며 Z 85ms + 160ms 간격, 네 번째마다 X 100ms입니다. 별도 스킬 부하는 `↓, 중립, ↓+Z`이며 일반 옵션 캠페인과 같은 조건으로 취급하지 않습니다. 표시 FPS는 `requestAnimationFrame`이나 present 개수가 아니라 전체 캔버스 픽셀 비교로 셉니다.

이전 CPU 작업 평균 1.865ms/tick, p95 3.0ms, 최대 29.5ms, 합성 평균 0.447ms입니다. 최장 변경 간격 116.8ms와 단일 DOM→픽셀 반응 12.9ms도 보존합니다. 이 값들은 이후 UI·EXIT 수정본의 새 측정이나 물리 키보드/디스플레이·스피커 지연이 아닙니다.

## 무결성

- 원본 EXE: `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`.
- 64개 파일 크기·해시 기준: [original-files.json](../tools/cpu-loops/original-files.json).
- 원본 47개 이미지의 인덱스 해시: [graphics/manifest.json](../public/assets/graphics/manifest.json).
- 배포 파일별 SHA-256: [build-manifest.json](../phaser/native-core/dist/build-manifest.json).
- CI는 소스 재빌드와 커밋된 배포 파일이 달라지면 실패합니다. 원격 검증은 매니페스트 및 모든 파일 바이트를 비교합니다.
- CPU/WASM 바이트를 바꾸지 않은 어댑터: [adapter-provenance.json](../phaser/native-core/adapter-provenance.json).

## 확인하지 못한 범위

매 순간 60FPS, 전체 PC/브라우저, 전체 16라운드 정상 연속 클리어, 모든 보스 후반 패턴·엔딩 분기, Windows의 전체 픽셀·음향·타이밍 일치는 입증하지 못했습니다. 전체 round fixture는 정상 캠페인 완료와 다릅니다.

Wine 레지스트리 정지는 코드/시각 증거가 있지만 통제된 인과성 A/B가 완료되지 않았습니다. 현재 구현은 Wine을 실행하지 않습니다. 콤보 마지막 타격의 정확한 벽 충돌 흔들림 재현과 스킬 흔들림 부하도 서로 구분합니다.
