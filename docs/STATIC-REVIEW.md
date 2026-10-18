# Mystic Arts — GitHub Pages형 정적 배포 독립 리뷰

검토일: 2026-10-18. 대상: **web/dist**, **web/tools/build.mjs**, **web/src/launcher.js**, 저장된 브라우저 검증 기록, **web/release/mystic-arts-static.zip**.

## 결과

**하위 경로 정적 배포를 막는 새로운 결함은 확인되지 않았다.** 현재 배포본의 경로, 파일 구성, 원본 데이터, 비공유 WASM 및 HTTP 요구사항은 검증한 범위에서 모두 적합하다. 리뷰 중 형식이 잘못된 기존 IndexedDB 저장 파일을 UI로 복구하지 못하는 **조건부 저장 복구 결함 1건**을 재현했으나, 메인이 즉시 소스·배포본을 수정했고 추가 Chrome 회귀테스트로 복구 성공까지 확인했다. 이 결함은 일반적인 신규 설치나 정상 저장 데이터에서 발생한 것이 아니었으며 정적 호스팅 자체의 차단 사유도 아니었다.

이 리뷰는 읽기 전용이다. 원본 Mystic.exe, 소스, dist, release ZIP, 브라우저·게임 프로세스를 변경하거나 재실행하지 않았다. 유일한 작성 결과물은 이 문서다. Node 회귀 테스트와 인메모리 모의 저장 오류 재현은 파일 쓰기 없이 실행했다. 최신 브라우저 실기동 결과는 메인이 생성한 기록을 독립적으로 다시 읽어 확인했다.

## 발견사항 SR-01 — 손상된 기존 저장 파일 복구 불가 (코드 수정 완료)

**상태: 해결 및 실제 Chrome 재검증 PASS.** 리뷰에서 재현 → 메인이 같은 턴에 소스와 dist를 수정 → 독립 코드 비교·Node VM 모의 불량 파일 재검증 PASS → 실제 Chrome에서 7바이트 손상 저장 주입 후 백업 복구·게스트 부팅까지 PASS. 정상 저장이나 처음 방문자의 일반 실행 실패로 오인하지 말 것.

- **전제:** 같은 사이트의 IndexedDB에 이미 /saves/Mystic0.dat 파일이 있고, 그 내용이 20바이트가 아니거나 첫 4바이트의 원본 길이 값이 20이 아니다.
- **종전 코드:** [launcher.js](../src/launcher.js)의 initializeFiles 함수에서 기록 가져오기/내보내기 버튼 활성화가 기존 저장 파일 검증 **이후**에 있었다. 기존 저장이 형식 오류면 예외로 fail 상태에 들어가 복구 버튼 자체가 비활성 상태로 남았다.
- **종전 증거:** launcher.js에서 validSave, syncSave, initializeFiles 함수를 당시 소스 그대로 추출해 Node VM에서 실행했다. 입력은 **이미 존재하는 7바이트 저장 파일**, 정상 종료하는 FS.syncfs, 정상 패키지 fetch 모의 객체였다. 관측: 저장 형식 오류, importDisabled=true, exportDisabled=true, mystic-files 의존성 미해제.
- **수정 확인:** 메인이 [launcher.js](../src/launcher.js) **74–83행**에서 사용자의 기존 기록을 보존하고, 버튼 활성화·저장 위치 표시를 validSave 검증 **이전(77–78행)**으로 옮겼다. 형식 오류 시 정상 20바이트 DAT 백업 가져오기를 안내하고, 유효 기록이 없으면 게임 본문만 보류한다. 가져오기 핸들러는 백업을 IDBFS에 저장한 후 새 VM으로 리로드한다. 실제 소스와 dist의 launcher.js는 **SHA-256 및 전체 바이트가 일치**했다.
- **추가 회귀 PASS:** 메인의 browser-static.py에는 잘못된 7바이트 IDBFS 파일을 저장·새로고침한 뒤 오류 화면에서 복구 버튼의 활성화, 손상된 바이트 내보내기, 유효 DAT 가져오기·재부팅·복원까지 검증하는 시나리오가 추가됐다. 첫 시도에서 테스트가 닫힌 details의 버튼을 찾지 못하던 검사 순서는 수정됐다. 새 Chrome 실행에서 **Damaged persisted save leaves recovery controls enabled / Recovery preserves the damaged record for export / Valid backup import restores original game boot and unlock record** 세 검사가 모두 PASS였으며 32개 전체 검사에도 실패가 없었다.

**한계:** 실제 이용자의 IndexedDB가 손상됐다는 증거는 없다. 이 건의 영향은 기존 데이터가 잘못된 형식인 경우로 제한한다. 수정된 코드 경로와 실제 브라우저 복구까지 통과했으므로 **미해결 결함으로 남기지 않는다.**

## 정적 배포 확인 결과

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 배포 파일·해시 | **PASS** | dist/game-manifest.json에 등재된 **17개 asset**의 존재·크기·SHA-256 **17/17 일치**. 매니페스트까지 총 **18개 파일**, 누락/예상외 파일 없음. 최신 수정본 자산 용량 합계 **42,819,786바이트**. |
| GitHub Pages 개별 파일 크기 | **PASS** | 가장 큰 assets/wine.zip **37,185,823바이트**. 모두 50MiB 미만. 게임 ZIP **2,773,847바이트**, WASM **2,295,258바이트**. |
| 원본 파일 불변 | **PASS** | 원본 **64개**가 assets/game.zip 안에서 디스크 원본과 바이트 단위 일치. ZIP 전체 66개 항목은 원본 64개와 별도 ddraw.dll, ddraw.ini다. EXE SHA-256은 아래에 기록. |
| 런타임 수정 무결성 | **PASS** | 배포된 WASM은 upstream SingleThreaded WASM 대비 테이블 최대 길이용 **파일 오프셋 18499 한 바이트만 다름**. 수정본 SHA-256도 고정 검사. 폰트 호환 변경은 Wine system.reg 한 파일이고 추가 폰트/EXE 변경 없음. |
| 배포 패키지 | **PASS** | web/release/mystic-arts-static.zip: 최신 **39,867,609바이트**, 18개 ZIP 엔트리, ZIP CRC 전체 PASS, 내부 파일이 최신 dist의 18개와 모두 바이트 단위 일치. 옆의 sha256 체크섬 및 package-report.json 값도 일치. |
| 소스와 배포본 동기화 | **PASS** | index.html, src/launcher.js, src/midi.js, src/midi-bridge.js, src/style.css, THIRD_PARTY_NOTICES.md를 각각 dist의 대응 파일과 바이트 비교해 모두 같았다. |
| 프로젝트 하위 경로 | **PASS** | 기준 https://example.github.io/mystic-arts/에서 HTML 링크와 런처의 fetch/import가 사용하는 **12개 필수 경로 모두 프로젝트 prefix 안**으로 해석되고 파일이 존재. 일반 HTTP의 실제 Chrome 기록도 /mystic-arts/에서 실행. |
| 외부통신·백엔드 | **PASS (측정된 실행)** | Chrome 기록상 HTTP 요청은 동일 사이트의 정적 파일로만 향하는 **GET**, WebSocket/API·원격 스트리밍 호출 없음. 최초 로딩 뒤 네트워크 차단 상태에서 게임이 계속 실행되는 검증 통과. |
| SAB·COOP·COEP | **PASS** | 배포 WebAssembly는 non-shared memory. 실제 브라우저 테스트는 crossOriginIsolated=false, SharedArrayBuffer=undefined, COOP/COEP 응답 헤더 없음 조건으로 성공. |
| 정상 저장과 복구/내보내기 | **PASS (정상 기록)** | IndexedDB 초기화, 게스트 타임스탬프 쓰기, 20바이트 파일 내보내기, 잘못된 import 거절 후 기존 파일 불변, 새 페이지/VM 로드 후 기록 유지가 모두 PASS. |
| 부팅 및 게임·오디오 실제 실행 | **PASS (측정된 실행)** | 타이틀, 옵션 변경, 1스테이지, 이동, 점프, 일시정지/재개, MIDI 브릿지, non-silent MIDI 및 DirectSound PCM, 음소거/복구가 실제 정적 Chrome 실행에서 확인됨. |

**원본 Mystic.exe SHA-256:** 285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f

**배포 WebAssembly SHA-256:** 9361043967b4d5e71736999f3a777ae4033510107cd98d93dff188d9e36eb8e8

**release ZIP SHA-256:** 2a560eafe44788e1cd9759ffcd734170d9d78ee2f208cce3a8b2746f666902d8

## 실제 브라우저 검증과 부팅 예외

최종 저장된 [browser-static.json](../test-results/browser-static.json)은 **http://127.0.0.1:55331/mystic-arts/**, 소요 **69.67초**, **32/32 PASS**였다. 페이지 예외, 실패한 정적 요청, HTTP 오류는 각각 **0건**이다. 실제 게임 본문 실행에서 MIDI **3,736메시지 / 1,321노트 / 프로그램 변경 13회 / 출력 피크 0.2464**, PCM **322블록 / 비무음 142블록 / 피크 0.7975**가 기록됐다. 이어서 7바이트 손상 기록 주입 후 UI 내보내기/복구 및 정상 백업 가져오기·리로드·타이틀 실행이 별도 확인됐다. 이는 이전 사용자 보고의 42.66초 실행 수치와는 별도 재현 결과다.

검토 중 기존의 점프 위치 판정 테스트가 한 번 실패한 기록도 관측했으나, 메인은 고블린 얼굴까지 플레이어 색상으로 계산하던 검증기 문제를 실제 화면으로 확인·수정하고 실패 회귀 자료를 별도로 보존했다. 최종 29/29 통과 결과를 기준으로 하며, 이 검증기 문제를 게임 동작 또는 정적 호스팅 결함으로 취급하지 않는다.

launcher.js의 과거 60초 지연에 대한 강제 오류 판정 역시 메인이 수정 완료했다. 현재 **소스 및 dist 모두** 페이지가 백그라운드에서 정지·지연된 경우를 일반 대기/waiting 상태로 처리하고 실제 렌더링 뒤 running으로 전환하는 코드가 있다. 이미 수정된 항목을 신규 실패로 등록하지 않았다.

BoxedWine/Emscripten의 번들 JavaScript 안에는 일반 런타임용 SOCKFS/WebSocket API 구현 코드가 들어 있지만, 이를 실제 외부 연결이라고 해석할 근거는 없다. 측정된 게임 실행에서 사용하지 않았고, 호스팅에 별도 WebSocket 서버를 요구하지 않는다. 또한 WASM은 다운로드 후 ArrayBuffer로 직접 컴파일되므로 서버가 특별한 WASM 실행 API를 제공할 필요도 없다.

## 배포 조건 및 검증 범위

GitHub Pages에서는 **web/dist 안의 파일 전체**를 사이트가 서비스하는 디렉터리에 게시해야 한다. 배포 ZIP을 사용할 때는 최상위 index.html과 .nojekyll을 포함한 압축 해제 결과를 올린다. 서비스 URL이 저장소 하위 디렉터리인 경우에도 HTML과 JavaScript의 모든 정적 자원 주소는 문서 디렉터리를 기준으로 해석된다. 별도 서버 프로세스, 사용자 정의 COOP/COEP 헤더 또는 SharedArrayBuffer가 필요하지 않다. 브라우저 실행 의존성을 개발용 Node, Python, Playwright와 혼동하지 않는다.

로컬 파일을 file://로 직접 열면 일반적인 브라우저 fetch/모듈 제약을 받을 수 있으므로 **HTTP(S) 정적 호스팅**으로 배포해야 한다. 공개 사이트의 저장 공간은 같은 브라우저·오리진에 귀속되므로 호스트/도메인 이동 때에는 사용자가 DAT를 내보내고 가져오는 방식으로 기록을 이관할 수 있다. 이는 저장 데이터 스코프에 대한 사용 안내이며 SR-01과는 별개다.

마지막으로, 확인된 화면과 사운드 및 일부 원본 입력·저장 경로는 PASS이지만 **16개 스테이지 전 구간의 픽셀/판정/오디오를 Windows 원본과 완전히 일치시켰다는 보증은 아직 없다.** 이는 원본 충실도 검증 범위이며, 별도의 정적 배포 실패로 집계하지 않는다.

독립 정적 검증 명령: **web** 디렉터리에서 npm test → **8/8 PASS**. 보조 자료: [archive.test.mjs](../tests/archive.test.mjs), [midi-bridge.test.mjs](../tests/midi-bridge.test.mjs), [README.md](../README.md), [build.mjs](../tools/build.mjs), [launcher.js](../src/launcher.js).
