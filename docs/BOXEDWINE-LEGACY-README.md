# Mystic Arts — 정적 웹 실행 버전

최신 Phaser 경로: [phaser/native-core/README.md](phaser/native-core/README.md).
원본 게임 코드만 WASM에서 실행하고 Phaser로 표시하는 별도 구현이며, 아래의 Wine 배포 기준선과 분리되어 있다.
기존 `dist/` 및 `release/`의 배포 설명과 성능을 최신 Phaser 빌드의 검증 결과로 혼동하지 않는다.

`dist/`의 파일만 HTTP(S) 정적 호스팅에 배포한다. 방문자의 컴퓨터에는 Node.js,
Python, Wine, Windows용 실행기나 브라우저 확장이 필요하지 않다.
브라우저가 단일 스레드 WebAssembly 안에서 원본 x86 `Mystic.exe`, Wine 6.0,
DirectDraw/DirectInput/DirectSound 호환 계층을 실행한다.

기본 빌드와 정식 배포는 기존 기준선을 유지한다. 실험 후보는
Wine 연산 루프 5개를 별도 WASM으로 가속한다.
원본 EXE·64개 자료·게임 타이머·스케줄러 정책은 변경하지 않는다.
후보 빌드마다 고정된 생성 소스와 Binaryen 131로 WAT/WASM을 재생성해 해시를 확인하고,
원본 BoxedWine CPU와의 316개 차등·가드·실패 처리 검사를 통과해야 배포 파일을 생성한다.
컴파일러는 기존 `lab/binaryen131/wasm-opt.exe`를 사용하며 브라우저 실행에는 필요 없다.
후보 생성: `node tools/build.mjs --cpu-loops --output lab/candidate-new`.
독립 기능 검사 32/32 통과 기록은 있으나 최종 ZIP의 이동 후 점프 검사가 재실패하여
기본 배포 채택은 보류했다. 기준선을 대체한 완성 릴리스로 취급하지 않는다.

2026-10-18 Chrome 155 Stage1 측정: 기준선 11.01~12.13FPS,
수정 후보 42.62~48.16FPS. 연속 286초의 30개 측정 구간은 평균 46.21FPS였다.
다만 1초 단위 270개 구간 중 7개가 30FPS 미만이어서 항상 안정적인 30FPS나
60FPS, 전체 16라운드 동등성을 보장하지 않는다. 자세한 근거와 한계는
`docs/PERFORMANCE-RESUME-20261018.md`를 참조한다.

후속 격리 실험 `lab/performance-resume-tail-loops-q1m`은 tail-call 1,192개와
호스트 실행 단위 상한을 조합해 45.79~50.18FPS, 프레임 간격 p95 33.4~34.8ms를 기록했다.
이 후보는 기본 빌드와 달리 에뮬레이터 스케줄러 할당량 상한을 바꾸며 게임 시계는 바꾸지 않는다.
기능 검사 32/32는 통과했지만 약 1초 정지와 미확인 입력이 남아 정식 채택하지 않았다.
별도 확인 명령은 `node tools/serve.mjs lab/performance-resume-tail-loops-q1m`이다.
오픈소스 대안의 실제 실행 결과는 `docs/WEB-EMULATION-RESEARCH-20261018-UPDATE.md`에 있다.

## 실행 및 배포

완성된 배포 폴더는 `web/dist/`, 배포 ZIP은 `web/release/mystic-arts-static.zip`이다.
ZIP의 최상위에 `index.html`이 있으며 압축을 푼 내용을 그대로 배포한다.
HTML 파일을 `file://`로 직접 여는 방식은 사용하지 않는다. 로컬 확인도 정적
HTTP 서버를 사용한다.

Windows PowerShell에서 이 `web` 폴더를 작업 디렉터리로 지정한다.

```powershell
node tools/build.mjs
node --test tests/archive.test.mjs tests/midi-bridge.test.mjs
node tools/serve.mjs dist
```

가속 없는 비교 빌드는 기존 결과를 덮어쓰지 않는 새 폴더에 생성한다.
`node tools/build.mjs --baseline --output lab/baseline-new`

마지막 명령은 `http://127.0.0.1:5173/`에서 파일만 제공한다. 실행 파일 호출,
스트리밍, 게임 상태 API 같은 서버 기능은 없다. `npm run build`, `npm test`,
`npm run preview`도 같은 명령을 실행한다. 개발 도구의 PATH 전달이 불완전한
환경에서는 위 Node 직접 호출을 사용한다.

GitHub Pages에서는 다음 순서로 배포한다.

1. 배포할 저장소 또는 브랜치의 최상위에 **`dist/` 안의 내용**을 넣는다.
   `.nojekyll`, `assets/`, `runtime/`, `src/`, `game-manifest.json`을 함께 포함한다.
   Wine ZIP은 GitHub 웹 파일 업로드 대신 Git으로 전송하는 편이 적합하다.
2. 저장소 `Settings → Pages → Build and deployment`에서 해당 브랜치와
   `/(root)`를 게시 원본으로 선택한다.
3. 생성된 프로젝트 주소에서 `게임 실행`을 누른다. 모든 경로는 페이지 기준
   상대 경로이므로 `https://<owner>.github.io/<repository>/`에서도 실행된다.

게시 원본을 `/docs`로 지정하는 경우에는 동일 파일들을 그 폴더에 넣는다.
별도 GitHub Actions 빌드나 사용자 정의 HTTP 헤더는 필요하지 않다.
실제 원격 저장소 생성·업로드·Pages 활성화는 이 프로젝트 작업에서 수행하지 않았다.

공식 배포 근거:
[GitHub Pages 개요](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[정적 사이트 생성과 .nojekyll](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## 원본 재사용 범위

게임의 규칙, 충돌, 적 AI, 16라운드 구성, 타이틀·옵션·엔딩, 스프라이트,
맵, 효과음 및 음악 이벤트는 원본 실행 파일과 데이터가 처리한다.
새 전투 엔진이나 대체 게임 화면을 구현하지 않았다.

원본 `Mystic.exe`는 914,944바이트이며 SHA-256은 다음과 같다.

```text
285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f
```

원본 EXE와 `Cnx`, `Dat`, `seq`, `savedata`의 **64개 파일 모두 바이트 단위로
보존**한다. 추가되는 것은 호환 DLL/설정과 브라우저 출력·저장 연결 코드다.
`dist/game-manifest.json`에 원본 및 배포 파일의 크기와 SHA-256을 기록한다.

해결한 호환 문제는 다음과 같다.

* 원본 폰트 초기화가 `굴림체 → 굴림체` fallback을 반복하던 문제:
  Wine 레지스트리에 원본 ANSI 이름 및 대응 별칭을 등록해 기존 Liberation Mono로
  연결했다. Windows 폰트 파일을 복사하거나 게임 바이너리를 패치하지 않았다.
* DirectDraw 출력: 번들 CNC-DDraw의 GDI 출력 경로로 원본 640×480 팔레트 화면을
  캔버스에 표시한다. 실험용 창 모드 EXE 패치는 배포에 포함되지 않는다.
* MIDI 무음: 원본이 보내는 WinMM/OSS 메시지를 Web Audio GM 음원으로 전달한다.
  수정 범위는 BoxedWine WASM의 테이블 용량 1바이트와 실행 시 MIDI 출력 포인터
  2개이며, 게임 코드와 기존 함수 테이블 항목은 유지한다.

## 입력과 기록

방향키로 이동, Z/C로 공격, X/B로 점프, Enter로 메뉴 선택,
Esc/F1로 일시정지한다. 게임의 옵션 메뉴와 해금된 STAGE SELECT, MP FREE,
COLISION도 원본 화면에서 조작한다. 바깥의 소리 버튼은 브라우저 출력 음소거다.

원본 `Mystic0.dat`는 **20바이트의 클리어·해금 기록**이다. 중간 라운드 상태나
위치 저장 기능은 아니다. 원본 게임의 파일 쓰기를 IndexedDB에 보관하고,
내보내기/가져오기로 원본 DAT 바이트를 주고받는다. 데이터는 브라우저·사이트
주소별로 구분된다. 원본 옵션 값이 재실행 때 기본값으로 돌아오는 것은 원본
저장 형식의 동작이다.

## 검증 재현

```powershell
node tools/build.mjs
node --test tests/archive.test.mjs tests/midi-bridge.test.mjs
python tests/browser-static.py
node tools/package.mjs
```

브라우저 테스트에는 설치된 Chrome과 Python의 Playwright/Pillow가 필요하다.
이들은 개발 검증 도구이며 배포 사이트의 실행 의존성이 아니다. 테스트는 배포
파일만 임시 폴더로 복사하고 일반 정적 서버의 `/mystic-arts/` 하위 경로에서
실제 Chrome을 실행한다. COOP/COEP가 없고 SharedArrayBuffer도 없는 조건을
assert한 뒤 화면·키보드·오디오·일시정지·기록을 검사한다. 초기 로딩 뒤에는
네트워크를 차단하고 게임이 계속 실행되는지도 확인한다.

이미 배포된 주소는 `python tests/browser-static.py --url <주소>/`로 검사할 수 있다.
결과 JSON과 실제 화면은 `test-results/`에 남는다.

검증된 항목과 원본 코드의 정적 분석 범위는 구분한다. 전체 16라운드를 정상
클리어하면서 Windows 기준 실행과 모든 프레임·타격 판정·엔딩을 대조한 시험은
아직 완료되지 않았다. GM 음악의 음색 및 일부 GDI 폰트 모양 역시 Windows
음원/굴림체와 샘플·픽셀 단위로 같다고 주장하지 않는다.

분석 근거: `docs/INIT.md`, `docs/REA-EVIDENCE.md`, `docs/BOXEDWINE.md`,
`docs/PARITY-CHECKLIST.md`. 런타임 출처와 변경 소스는
`THIRD_PARTY_NOTICES.md`에 정리되어 있다.
