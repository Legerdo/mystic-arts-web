# 공개 배포 확인 — 2026-10-18

- Public 저장소: https://github.com/Legerdo/mystic-arts-web
- 게임: https://legerdo.github.io/mystic-arts-web/
- 권리·라이선스 추적: https://github.com/Legerdo/mystic-arts-web/issues/1
- 최초 배포 코드 커밋: `a948b9681e94064c28eeb9fc549bf431200a9f7d`.
- 최초 [Actions build / deploy](https://github.com/Legerdo/mystic-arts-web/actions/runs/39133113063): 둘 다 success.
- 이후 문서/측정 기록 커밋은 게임 파일을 변경하지 않습니다. 최신 작업은 [Actions 목록](https://github.com/Legerdo/mystic-arts-web/actions/workflows/pages.yml)에서 확인합니다.

## 배포 파일

`phaser/native-core/dist/build-manifest.json` SHA-256:

```text
e429cea8a7db5727ef015277762004b54ea26096e60fb9fc800af2b11f8378e2
```

Linux / ubuntu-24.04 / Node.js 24에서 의존성 잠금 파일로 재설치·재빌드 후 `git diff --exit-code -- phaser/native-core/dist`가 통과했습니다. 소스와 커밋된 배포 파일이 일치합니다. 공개 URL의 매니페스트와 배포 171개 파일(매니페스트 제외)의 바이트 해시를 모두 검사했습니다. 원본 EXE와 나머지 63개 자료는 상위 원본 폴더와 배포 복사본 양쪽 모두 기준 해시와 일치했습니다.

```sh
npm run setup
npm run build
npm run verify
node tools/verify-native-dist.mjs --url https://legerdo.github.io/mystic-arts-web/
```

## 실제 공개 사이트 동작

Windows 11 / Ryzen 7 9800X3D / RTX 5080 / RAM 32GB, Chrome **155.0.8059.82 Headless**, 1100×900 뷰포트와 내부 640×480 Canvas로 검사했습니다.

```sh
python phaser/native-core/static-check.py pages-public-release-01 --url https://legerdo.github.io/mystic-arts-web/
python phaser/native-core/play-check.py --url https://legerdo.github.io/mystic-arts-web/ --output phaser/native-core/pages-performance-01 --trials 1
```

| 항목 | 결과 |
|---|---|
| 원본 20바이트 저장 형식 | PASS |
| 입력 후 플레이어 이동·픽셀 변화 | PASS, DOM 입력→반응 25.6ms 1회 |
| pause 시 플레이어 정지 | PASS |
| 로딩 후 네트워크 차단 상태에서 전투·점프 | PASS |
| 원본 함수로 저장 20바이트/해금 마스크 읽기 | PASS |
| 새로고침 후 저장 바이트 유지 | PASS |
| COOP/COEP 없이 실행 | PASS, `crossOriginIsolated=false`, SAB undefined |
| 브라우저/게임 오류 없음 | PASS |

원시 기록: [기능 검사](../phaser/native-core/pages-public-release-01/result.json), [성능](../phaser/native-core/pages-performance-01/result.json).

성능 입력은 오른쪽/왼쪽을 번갈아 누르며 Z 85ms + 160ms 간격, 네 번째마다 X 100ms입니다. 실제 픽셀 변경을 10초 측정한 결과:

| 지표 | 값 |
|---|---:|
| changedFrameFps | 61.0664 |
| 변경 간격 p95 / 최대 | 25.2 / 42.4ms |
| CPU 작업 평균 / p95 | 2.110 / 3.0ms/tick |
| 화면 합성 평균 / p95 | 0.447 / 0.7ms/tick |
| 게스트 측정 tick / skip | 620 / 2 |
| 게임 오류 / 브라우저 오류 | 0 / 0 |

이 한 구간을 전체 게임·모든 PC에서 60FPS 이상이라는 보장으로 사용하지 않습니다. 전체 캠페인 연속 클리어, 모든 보스·엔딩 분기, Windows와 모든 픽셀·음향·타이밍 일치는 여전히 별도 검증 범위입니다. 구간별 장기 측정과 정확한 벽 충돌 콤보 재현의 남은 한계는 [VERIFICATION.md](VERIFICATION.md)에 유지합니다.
