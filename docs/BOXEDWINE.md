# Mystic Arts: BoxedWine 26R1, CNC-DDraw, Wine6/WASM 조사 기록

## 현재 판정 (2026-10-18)

**브라우저 원본 EXE 실행 및 실제 게임 화면 출력 성공.** Wine6 최소 root에 없는 레거시 한글 폰트 이름을 이미 설치된 Liberation Mono로 대체하는 `FontSubstitutes` 24개 항목을 등록하자 반복되던 `EnumFontFamiliesA` 호출 루프에서 벗어나 **원본 보라색 Mystic Arts 타이틀과 1스테이지 숲·주인공·적·체력바·CREDIT 5**가 출력되었다. Chrome의 Emscripten **SingleThreaded** 실행이며 일반 HTTP 정적 서버에서 `crossOriginIsolated=false`, `SharedArrayBuffer=undefined` 상태로 관측했다. 즉 특수 COOP/COEP 응답 헤더 없는 정적 호스팅에서 실행 가능한 경로가 실제로 확인되었다.

이전 native/WASM 실험의 검정 화면은 아래 표의 **과거 폰트 수정 이전 상태**에 해당한다. `ddraw.dll` 로드와 GDI 설정만으로는 게임 본문 실행을 증명할 수 없었다. 현재 관측은 타이틀과 실제 1스테이지까지이며, 모든 입력·애니메이션·MIDI/효과음·저장 동작의 원본 동등성을 보증하지 않는다.

원본 `Mystic.exe` SHA-256: `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f` (914,944바이트). Win11에서 타이틀이 정상 출력된 참조 실행은 `web/win11-reference/mystic/`의 cnc-ddraw v7.1과 `windowed=true`, `renderer=gdi`, `maxgameticks=60` 설정을 사용했다. 원본 실행 파일은 byte-for-byte 동일하다.

### 결정적인 브라우저 A/B 근거와 동작 범위

- **수정 전:** `web/lab/results/wine6-original-api.json`은 15–40초 구간에 원본 `GDI32.EnumFontFamiliesA`가 CP949 바이트 `B1 BC B8 B2 C3 BC`인 이름을 반복 조회하고, 원본 콜백 `0x0045E386`, `lstrcmpiA` 비교를 반복했음을 보존한다. 바이트를 `cp949`로 해독하면 **`굴림체`**다. 그 바이트를 Wine6 기본 ANSI 코드페이지인 CP1252로 해독하면 `±¼¸²Ã¼`가 된다. 기본 Wine6 root는 필요한 문자열에 일치하는 실제 폰트가 없어 게임 초기화가 진행하지 못한 상태였다(반복 원인은 호출 기록을 근거로 하며 개별 반환 분기는 별도 EXE 분석 대상).
- **수정:** `web/lab/font-alias-root.py`가 `web/runtime/SingleThreaded/boxedwine.zip`의 **`home/username/.wine/system.reg` 한 파일만** 변경해 `[Software\\Microsoft\\Windows NT\\CurrentVersion\\FontSubstitutes]`에 24개 이름을 `Liberation Mono`로 매핑한다. 한글 8종(`굴림체`, `굴림`, `돋움체`, `돋움`, `바탕체`, `바탕`, `궁서체`, `궁서`)의 정상 유니코드 이름과 CP949 바이트가 CP1252로 잘못 해석된 이름, 영문 8종(`GulimChe`, `Gulim`, `DotumChe`, `Dotum`, `BatangChe`, `Batang`, `GungsuhChe`, `Gungsuh`)을 포함한다. **원본 EXE·리소스·폰트 바이너리 수정 없음.** 독립 ZIP 비교에서 **1,640개 엔트리 중 1,639개 byte-identical, `system.reg`만 922바이트 증가**했다.
- **수정 후:** `web/lab/results/wine6-font-alias.json`에서는 초기 폰트 호출에서 `CreateFont`, `GetTextMetrics`, WinMain 쪽 실행으로 진행한다. `web/lab/results/wine6-font-alias.png`은 **원본 로고와 CREDIT 6**, `web/lab/results/wine6-play-pause.png`는 **640×480 숲·주인공·늑대·고블린·체력바·CREDIT 5**가 실제 픽셀로 출력되었음을 확인할 수 있다. MIDI 관련 원본 실행 호출도 관측됐지만 사운드 출력 성공은 별도 검증이다. `wine6-play-enter-1.png` 등의 중간 흑색은 장면 전환 및 리소스 로딩 시점의 캡처여서 전체 실행 실패로 판정하지 않는다.
- **정적 서버 조건:** 위 `wine6-original-api.json`, `wine6-font-alias.json`, `wine6-play.json` 모두 `isolated=false`, `sab="undefined"`를 기록한다. WebAssembly 실행 루프는 계속 진행되었고 프레임 이미지가 생성되었다. COOP/COEP 의존성이 있는 MultiThreaded를 런타임 선택지로 강제할 필요가 없다는 직접 실행 증거다.

### 레거시 폰트 루프의 구체적인 환경 원인

`web/native-test/worker1/font-audit.py`가 BoxedWine 공식 전체 Wine6과 번들 Wine6 최소 root에서 같은 사실을 관찰했고, 출력은 `worker1/wine6-font-inventory.json`에 기록했다.

| 검사 항목 | Wine6 최소/전체 root 원본 |
| --- | --- |
| `HKLM\\System\\CurrentControlSet\\Control\\Nls\\Codepage`의 `ACP` | `1252` |
| 같은 위치 `OEMCP` | `437` |
| `HKCU\\Software\\Wine\\Fonts`의 `Codepages` | `1252,437` |
| `HKCU\\Control Panel\\International`의 `Locale` | `0000007f` (Invariant) |
| `c_949.nls` | 최소 root Windows system32에 **이미 존재** |
| `FontSubstitutes`의 원본 `굴림체` 별칭 | 없음 |
| Liberation Mono | Windows Fonts 레지스트리에 `Z:\\usr\\local\\share\\fonts\\liberation\\LiberationMono-Regular.ttf`로 **이미 등록** |

즉 CP949 파일이 전혀 없어서가 아니라 **기본 ANSI 코드페이지 및 폰트 이름 별칭의 불일치**가 관측된 직접 장애다. 독립 폰트 파일 0개 추가로 해결됐으므로 한글 OS 폰트 파일을 다운로드·복사할 필요가 없다. 현재 대체 서체의 글꼴 모양·문자 폭·높이는 원본 한국어 Windows의 굴림체와 같다고 입증한 것은 아니므로, 원본의 모든 UI 텍스트 픽셀까지 100% 일치하려면 별도 비교가 필요하다.

### 각기 다른 네 문제를 구분

1. **실행 진입점/기본 셸:** 원본 `Mystic.exe`와 정해진 작업 폴더를 `-w ... /bin/wine Mystic.exe`로 실행해야 한다. 빈/기본 Wine 데스크톱 또는 잘못된 `-mount` 경로는 게임 실행 증거가 아니다.
2. **CNC-DDraw 로드:** Wine6 축소본에서 Win11 참조 v7.1은 `AVIFIL32.dll.so` 구현이 없어 `c0000135`가 발생한다. BoxedWine 번들 CNC-DDraw를 사용하면 해당 필수 import가 없어 게임 DLL 로딩은 가능하다. 직접 추가 `-mount` 방식에는 DLL과 `WINEDLLOVERRIDES=ddraw=n,b`를 함께 제공한다.
3. **한글 폰트 열거 루프:** 초기 검정화면의 **결정적인 런타임 정체 원인**. Wine6 `ACP=1252`와 CP949 원본 폰트 이름 불일치를 `FontSubstitutes` 24개 별칭으로 해결해 타이틀과 스테이지 실제 렌더링이 검증되었다.
4. **브라우저 배포 제약:** BoxedWine MultiThreaded는 COOP/COEP 격리 헤더가 필요하지만, **SingleThreaded**는 일반 HTTP/정적 브라우저에서 실제 `crossOriginIsolated=false` 상태로 정상 게임 화면에 도달했다. GitHub Pages 형태의 배포에는 SingleThreaded 경로를 유지한다.

### 이전 실패 A/B 재현 결과 (폰트 별칭 적용 전)

| 실험 및 근거 | 게임 디렉터리 | DLL 로드 확인 | 렌더링 판정 |
| --- | --- | --- | --- |
| 이전 A `ddraw-lab/results/A_mount6-bpp8-probe.log` | Wine6, `-mount mystic.zip` | 실패: `-ddrawOverride ... not found` | 해당 설정에서 DLL 제공 실패 |
| 이전 B/C `ddraw-lab/results/B_overlay6-bpp8-probe.log`, `C_embedded6-bpp8-probe.log` | Wine6, 게임 파일 추가 `-zip` 또는 root ZIP 내장 | BusyBox: `Mystic/ddraw.dll`이 `drive_c/ddraw/ddraw.dll`로 향하는 링크 확인 | DLL 배치까지만 증명 |
| 이전 J `ddraw-lab/results/J_cnc7111-bpp8-visible-loaddll.log` | Wine11 root 내장 + CNC7.1 | `Loaded L"C:\\Mystic\\DDRAW.dll" ... native` | 캡처 `J_cnc7111-bpp8-visible.png`: 638×475 전체 검정 |
| 이전 K `ddraw-lab/results/K_mount_cnc7111-bpp8-visible-loaddll.log` | Wine11 `-mount`된 CNC7.1 DLL + `WINEDLLOVERRIDES` | 동일 native 로드 | 캡처 `K_mount_cnc7111-bpp8-visible.png`: 검정 |
| Worker1 `runs/wine6-cnc71-bpp8-1792300142266698300-45592/boxedwine.log` | Wine6 최소 root + CNC7.1 | 실패: `AVIFIL32.dll not found`, EXE import `c0000135` | EXE 본 실행 전 DLL 의존성 실패 |
| Worker1 `runs/wine6-gdi-bpp8-1792300183805171900-50748/` | Wine6 최소 root + **내장 CNC** + `renderer=gdi` | `DDRAW.dll` native 로드 | 약 15초 뒤 중앙 140,114/140,114픽셀 검정 |
| Worker1 `runs/wine6-gdi-bpp32-1792300263842166700-21492/` | 동일 + `-bpp 32` | native 로드 | 중앙 140,114/140,114픽셀 검정 |
| Worker1 `runs/wine6-cnc71-avifil-Mystic-bpp8-1792300837442300000-23148/` | Wine6 최소 root + CNC7.1 + Wine6 동일버전 `avifil32.dll.so` 보충 | `DDRAW.dll` native 로드, `AVIFIL32.dll not found` 사라짐 | 중앙 140,114/140,114픽셀 검정 |
| Worker1 `runs/wine6-gdi-boot-bpp8-1792300434068947000-37512/` | Wine6 최소 root, 기존 숨겨진 `wineboot.exe.so` 복원 | Wineboot 실행됨, 아직 게임 DLL 로드 전 | `The Wine configuration ... is being updated` 28초 이상 유지; 완료/게임 출력 판정 불가 |

Worker1의 화면 캡처는 자신의 **새로 실행한** BoxedWine Win64 native 프로세스의 HWND에 대해 Pillow `ImageGrab.grab(window=hwnd)`로 수행했고, 프로그램/창은 해당 테스트의 PID만 종료했다. 다른 Mystic 원본 및 브라우저 앱은 제어하지 않았다. `runs/*/result.json`에는 정확한 CLI, 종료코드, pixel histogram, 독립 임시 root 경로가 있다. 캡처/GUI 관측과 로그는 서로 다른 증거다.

## 근본 원인 1: `-ddrawOverride` 적용 시점

BoxedWine 26R1.0 소스 [source/sdl/startupArgs.cpp](https://github.com/danoon2/Boxedwine/blob/26R1.0/source/sdl/startupArgs.cpp)의 `StartUpArgs::apply()`:

1. `-zip` 루트들을 `FsZip::init`으로 로드 (**355–363행**).
2. `-ddrawOverride <emulated-directory>`가 있으면 `WINEDLLOVERRIDES=ddraw=n,b`를 환경에 넣고 그 폴더에 **`ddraw.dll`, `ddraw.ini` 링크**를 만듦 (**402–415행**).
3. 이후 `-mount` 정보에 따라 ZIP 또는 로컬 디렉터리를 마운트 (**461–489행**).

따라서 `-mount mystic.zip /home/username/.wine/drive_c/Mystic`로 파일을 제공하는 경우 단독 `-ddrawOverride /home/username/.wine/drive_c/Mystic`의 대상 디렉터리는 조회 시점에 없을 수 있다. **`-ddrawOverride` 옵션의 텍스트 위치만 조정해서 고칠 수 없는 실행 순서 문제**다. 소스의 실제 구현은 `<emulated-directory>/ddraw.dll` 링크를 추가하므로 대상은 EXE 파일 자체가 아니라 **EXE가 들어 있는 에뮬레이트된 폴더**여야 한다. 공식 `commandLine.txt`의 EXE 경로 예시는 코드와 불일치한다.

확인한 두 적용 방법:

```text
# 방법 A: 게임 폴더를 초기 root ZIP으로 미리 로드
-root <fresh-root> -zip <Wine6-with-Mystic.zip>
-ddrawOverride /home/username/.wine/drive_c/Mystic
-w /home/username/.wine/drive_c/Mystic /bin/wine Mystic.exe

# 방법 B: mount-only 앱 ZIP 안에 ddraw.dll / ddraw.ini 실제 파일 추가
# wrapper 추가와 native DLL 우선순위는 -env로 설정
-root <fresh-root> -zip <Wine6.zip>
-mount <mystic-with-ddraw.zip> /home/username/.wine/drive_c/Mystic
-env WINEDLLOVERRIDES=ddraw=n,b
-w /home/username/.wine/drive_c/Mystic /bin/wine Mystic.exe
```

방법 B는 이전 K 실험에서 별도 로그로 DLL 로드를 검증했다. 일반 빌드와 마운트 archive는 **원본 실행 파일을 수정하지 않는다**.

## 근본 원인 2: Wine6 최소 루트의 누락된 구현 DLL·서비스

BoxedWine 26R1 번들 `web/runtime/SingleThreaded/boxedwine.zip`은 Wine 6.0의 **축소된 파일시스템**이다. 내부 `recreateInstructions.txt`·`build.txt`·`name.txt`·`wineVersion.txt`에서 확인했다.

- 최소 배포본에는 `home/username/.wine/drive_c/windows/system32/avifil32.dll` **PE stub 44,036바이트**가 있으나 `opt/wine/lib/wine/avifil32.dll.so` 구현 본체가 없다.
- 최소 루트에는 `opt/wine/lib/wine/wineboot.exe.so.hide`가 있고, 본래의 활성화 경로 `wineboot.exe.so`는 없다. Windows측 `wineboot.exe` PE 파일은 존재한다. Native 로그의 `wineboot.exe not found`, `run_wineboot ... c0000135`가 여기와 일치한다.
- 최소 루트에는 원래 bundled CNC ddraw.dll(394,240바이트)이 있고, Win11 정상 출력 버전 CNC7.1(411,648바이트)과는 다르다. 내장 CNC의 PE imports에는 AVIFIL32가 없어서 의존성 실패 없이 로드된다. **폰트 별칭 적용 전의 화면은 검정이었으나, 상단의 브라우저 성공 실험은 동일 번들 CNC 경로에서 폰트 루프를 해결했다.**
- CNC7.1 DLL의 경우 실제 실행 로그에서 `Library AVIFIL32.dll (which is needed by C:\\Mystic\\DDRAW.dll) not found`가 관측됐다. **Wine6와 동일한 빌드의** `avifil32.dll.so`를 추가한 뒤 해당 import 오류가 사라지고 CNC7.1이 native DLL로 로드됐다. 따라서 AVC/AVI 구성요소 누락이 CNC7.1 로딩 실패의 직접 원인임은 확인됐다. 나머지 블랙스크린의 원인으로까지 단정할 수 없다.

`wineboot.exe.so.hide`를 이름만 바꿔 복구하는 실험에서는 설정 갱신 창이 떠 28초 이상 초기화가 완료되지 않았다. 이 결과만으로 Wineboot 복구가 실제 게임 렌더링을 고친다고 할 수 없다. 최적화된 최소 파일시스템에서 활성화하면 추가 시스템 초기화/서비스가 요구될 수 있다.

### 공급자 공식 전체 Wine 파일시스템 — 직접 다운로드 및 무결성 확인

BoxedWine 26R1 설치 인덱스 `%APPDATA%/Boxedwine/filesV2.xml`에 포함된 공식 URL:

| 구분 | 공식 다운로드 URL | 서버 HEAD 길이 | 내용 검증 |
| --- | --- | ---: | --- |
| Wine 6.0 전체 | `https://boxedwine.org/v2/2/TinyCore15Wine6.0.zip` | **141,109,447 bytes** | 로컬 ZIP testzip PASS, 8,658 엔트리, `wineVersion.txt = 6.0` |
| Wine 11.0 전체 | `https://boxedwine.org/v2/6/TinyCore15Wine11.0.zip` | **159,146,791 bytes** | HEAD 200 확인; 다운로드 및 본문 검증은 아직 안 함 |

다운로드된 Wine6 공식 archive: `web/native-test/worker1/TinyCore15Wine6.0.zip`.

SHA-256: `ef1aa2e7d350751e2b324a9aa27beb3c22c82a6207b1a02fa18dbb7ba5551efe`.

Python `zipfile.ZipFile.testzip()`가 전체 ZIP의 각 엔트리를 검사해 `None`을 반환했다. Archive 내 구현체 `opt/wine/lib/wine/avifil32.dll.so` 340,760바이트와 활성 `opt/wine/lib/wine/wineboot.exe.so` 183,880바이트 존재. `wineVersion.txt`는 최소본과 동일하게 `6.0`.

`worker1/wine6-full-vs-mini.json`은 파일명·바이트를 독립 비교한 결과다. 디렉터리 제외 전체 Wine6 8,343개, 최소본 1,481개이며, full 전용 6,884개, mini 전용 22개, 공통 파일 중 바이트까지 동일 1,450개, 달라진 파일 9개다. full 전용 파일 중 `opt/wine/*`의 `.so` 구현 **877개**, `.exe.so` 실행 구성 **84개**가 포함된다. 공통에서 서로 다른 9개는 `system.reg`, `user.reg`, `version.txt`, 이름·변경기록 및 임시/폰트 캐시 파일이다. 전체 배포본의 단순 용량 차이는 다른 미디어 데이터 등이 포함된 결과이므로 `877개 모두 Mystic.exe에 필요`라는 주장은 성립하지 않는다.

### 최소 의존성 오버레이

`worker1/diff-and-overlay.py` 실행 산출:

- `web/native-test/worker1/derived/wine6-avifil-overlay.zip`: 92,540바이트. 단 1개 파일 `opt/wine/lib/wine/avifil32.dll.so` 포함. SHA-256 `5e6d83877122d59edc8314894c9a7d562be4771c1d72aac38d0076e5c4db14ae`.
- `web/native-test/worker1/derived/wine6-cnc71-avifil.zip`: 기존 Wine6 mini+원본 게임+CNC7.1 ZIP에 해당 `.so`만 추가한 43,006,696바이트 파일. 모든 기존 ZIP 엔트리가 이전 bytes와 완전 일치하고 `Mystic.exe` SHA-256이 변하지 않는 것을 확인했다.
- native `wine6-cnc71-avifil` A/B에서 CNC7.1 native DLL 로드 성공과 블랙스크린 잔존 확인.

전체 ZIP 없이 최소 root에 일부 DLL만 추가해도 로딩 경계를 제거할 수 있음을 증명했다. **그러나 92KB 오버레이만으로 폰트 열거 루프가 해결되지는 않는다.** 최종적으로 필요한 것은 위의 폰트 별칭 수정이며, 실제 성공한 구성은 전체 Wine6가 아니라 작은 Wine6 번들 기반이다.

## GDI 렌더링 경로의 확인된 범위

BoxedWine 26R1 `platform/sdl/knativescreenSDL.cpp` (191–315행)은 자체 SDL 텍스처에 8bpp 인덱스를 `palette[*srcLine]`로 ARGB8888 변환하는 구현이 있다. `source/x11/xwindow.cpp` (885–905행)는 X11 창의 데이터/팔레트를 `putBitsOnWnd`에 전달하고, `source/x11/xserver.cpp` (365–399행)는 dirty 화면을 `clear -> child.draw -> present`로 출력한다.

즉 BoxedWine 소스상 8bpp 팔레트 화면을 32bit SDL 텍스처로 올리는 경로는 존재한다. 과거 DLL native 로드만으로는 present를 증명할 수 없었지만, **현재 브라우저에서 원본 게임 이미지가 실제로 출력되는 것까지 확인**됐다. 아직 모든 게임 조작/프레임/오디오의 원본 일치를 증명한 것은 아니다.

메인에 인계할 WASM/정적 배포 제약: BoxedWine 26R1 문서상 Emscripten SingleThreaded는 COOP/COEP를 요구하지 않지만 MultiThreaded는 필요하다. 일반 GitHub Pages 정적 배포에는 SingleThreaded만 맞는다. 전체 Wine6 ZIP은 파일 크기 141MB로 GitHub 단일 파일 100MiB/100MB 제한을 초과하므로, full ZIP을 그대로 저장소에 추가하는 것은 맞지 않다. 성공이 검증된 경우에만 검증 가능한 작은 파일 오버레이를 우선하거나, ZIP을 여러 정적 청크로 나눈 뒤 클라이언트가 MEMFS에 재조립하도록 해야 한다. 서비스가 없다는 이유만으로 무조건 전체 141MB가 필요하다고 추정하지 않는다.

## 재현 도구

`web/native-test/worker1/`에 기록된 스크립트:

```powershell
# 프로젝트 root에서 실행. 한국어 경로를 BoxedWine이 ZIP 로드 실패하는 문제 회피.
# 다른 프로세스가 사용 중이지 않은 드라이브 문자만 선택.
subst Y: 'C:\Users\K\DevSpaceWorkspaces\미스틱 아츠(Mystic Arts)'

# 원본/full Wine6 archive CRC/해시를 확인하고 파일별 차이를 비교
python web/native-test/worker1/diff-and-overlay.py

# native 26R1 (개별 격리 root 사용) - 종료는 해당 실행으로 생성된 PID만
python web/native-test/worker1/run-native-ab.py --case wine6-gdi --bpp 8 --duration 26
python web/native-test/worker1/run-native-ab.py --case wine6-gdi --bpp 32 --duration 24
python web/native-test/worker1/run-native-ab.py --case wine6-cnc71-avifil --bpp 8 --duration 24

# 부팅 구성요소 독립 복원 실험 (완전성 검증, 원본 ZIP 불변)
python web/native-test/worker1/build-boot-probe.py
python web/native-test/worker1/run-native-ab.py --case wine6-gdi-boot --bpp 8 --duration 28
```

CLI 로그와 캡처는 `web/native-test/worker1/runs/<case>/`에 남는다. 도구는 신규 native 실행을 PID로 추적하고 그 프로세스만 종료한다. 스크립트가 생성한 `Y:` subst mapping이 필요 없고, 해당 매핑의 소유자가 본인임이 확인됐을 때만 `subst Y: /D`로 정리할 것.

**현 시점 미검증:** 게임 전 구간, 입력 지연 및 충돌 판정, 애니메이션, DirectSound 효과음과 WinMM MIDI BGM 실제 음향, 저장 기능, Win11 참조와의 프레임 단위 픽셀 일치. 타이틀 및 1스테이지 화면 출력은 **PASS**, 전체 원본 동등성은 별도 검증이 필요하다.

## WASM MIDI 브릿지: 실제 binary metadata와 격리된 두 슬롯 교체 (2026-10-18)

BoxedWine의 SingleThreaded WASM은 DevSequencer에서 받은 WinMM/OSS MIDI raw bytes를 KNativeAudioSDL::midiOutData와 midiOutLongData로 전달하지만, SDL 구현은 두 가상함수 모두 return 0만 실행한다. 원본 DevSequencer 이벤트 파싱 및 타이밍을 그대로 유지하면서, 이 두 메서드에서 JS Module.midiMessage(number[]) 콜백으로 raw MIDI 바이트를 전달하도록 별도의 WASM sidecar 브릿지를 구현했다.

| 확인 항목 | 실제 숫자·주소 |
| --- | --- |
| 원본 WASM bytes / SHA-256 | 2,295,258 / d4148bda3955e0378de56719c716610f2e1daffd3581d0a2085970ba4df1decf |
| 원본 funcref table | min=4776, max=4776 (0..4775), element 초기화 4775개 |
| Binary table section | 파일 오프셋 18492, max LEB 오프셋 **18499** |
| 최소 binary 수정 | 파일 **18499**의 0xA8 → 0xAA, table max 4776→4778; 원본 code/data 및 table 초기값 보존 |
| 패치 WASM SHA-256 | 9361043967b4d5e71736999f3a777ae4033510107cd98d93dff188d9e36eb8e8 |
| KNativeAudioSDL RTTI | 135652 (0x211E4), type name 포인터 135664, 문자열 15KNativeAudioSDL |
| KNativeAudioSDL vptr | 135600 (0x211B0), 총 13 virtual slots [92..104] |
| Fake Midi 식별 | 문자열 92197, 가상 slot11 table103→function409의 i32.const 92197 직접 참조 |
| MIDI short | slot5, 메모리 **135620 (0x211C4)**, 기존 table97→function403 |
| MIDI long | slot6, 메모리 **135624 (0x211C8)**, 기존 table98→function404 |
| ABI | 양쪽 모두 WebAssembly type7: (i32,i32,i32,i32)->i32. 원본 본문 hex 00 41 00 0B = return 0 |
| 새 브릿지 | table4776 / 4777, 기존 table0..4775 전체 및 virtual slot 나머지 11개 불변 |

실제 구현은 web/tools/midi-wasm.mjs (makeMidiPatch(rawBuffer)), web/src/midi-bridge.js (installMidiBridge, createMidiInstantiateWasm), web/tests/midi-bridge.test.mjs, 정적 증거 web/native-test/worker1/inspect-wasm.py 및 wasm-midi-inspection.json에 있다. 원본 Mystic.exe SHA-256 285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f는 변경되지 않았다.

별도 105바이트 WASM wrapper는 JS에서 직접 함수를 넣을 수 없는 funcref 테이블을 위해 두 개의 typed WASM 함수를 생성한다. 이 함수는 env.midiShort/Long JS imports를 호출하며, 각 MIDI 메시지의 guest 메모리 주소와 길이로 정확한 바이트를 복사해 Module.midiMessage(array)에 전달한다. 기존 stub 함수 자체나 동일 함수를 사용하는 다른 table element를 전역 치환하지 않는다. short 길이 1–3, SysEx long 길이 최대 1024, guest buffer bounds, RTTI, 13개 가상 슬롯, 함수 반환값 0을 검증한다.

빌드 및 런처 API 사용 예시:

~~~js
// Node tools/build.mjs: 사용자 게임/원본 WASM 파일 무변경
import {makeMidiPatch} from './midi-wasm.mjs';
const patchedWasm = makeMidiPatch(originalWasmBytes);
// patchedWasm을 정적 boxedwine-midi.wasm으로 배포

// 브라우저: 원본 boxedwine.js 로드 전에만 hook을 설치
import {createMidiInstantiateWasm} from './midi-bridge.js';
Module.midiMessage = bytes => MysticMidi.send(bytes);
Module.instantiateWasm = await createMidiInstantiateWasm({
  Module, wasmUrl: '/runtime/boxedwine-midi.wasm', onError: console.error
});
// 이제 기존 boxedwine.js 로드 가능
~~~

메인이 직접 WASM 인스턴스를 생성하는 경우 installMidiBridge({wasmExports: instance.exports, Module, onError})를 인스턴스 생성 이후, Emscripten successCallback 실행 이전에 호출한다. Browser static HTTPS(GitHub Pages)에서 SHA-256을 검사하고 동일한 BoxedWine SingleThreaded JS 로더와 결합된다. COOP/COEP나 SharedArrayBuffer, Emsdk 전체 재컴파일은 필요하지 않다.

검증 명령: node --test web/tests/midi-bridge.test.mjs. **Node 3/3 PASS**: source/patch SHA와 1바이트 diff, 처음 4776개 table.get 객체 모두 동일, vtable의 short·long 두 주소 이외의 RTTI/슬롯 바이트 전부 동일, 실제 WASM call_indirect에서 type7 ABI 통과, short/realtime/long SysEx raw byte array 완전일치, 이상 offset/length에서도 게스트 반환값 0 유지, instantiateWasm 성공 콜백 전에 MIDI table 설치까지 확인했다. 실제 원본 게임을 플레이하면서 MIDI event와 브라우저 TinySynth 소리의 음색·시간을 검증하는 작업은 메인 런처 브라우저 통합 범위에 남는다.

## 참고 소스

- [BoxedWine 26R1.0 `startupArgs.cpp`](https://github.com/danoon2/Boxedwine/blob/26R1.0/source/sdl/startupArgs.cpp) — `-zip`/`-ddrawOverride`/`-mount`의 실제 실행 순서 및 native DLL override.
- [BoxedWine 26R1.0 `knativescreenSDL.cpp`](https://github.com/danoon2/Boxedwine/blob/26R1.0/platform/sdl/knativescreenSDL.cpp) — 8bpp paletted texture 변환과 프레임 표시.
- [BoxedWine 26R1 `commandLine.txt`](https://github.com/danoon2/Boxedwine/blob/26R1.0/commandLine.txt) — 명령행 명세(실제 코드와 불일치하는 예시 주의).
- [BoxedWine 공식 Web/Emscripten FileSystem 안내](https://github.com/danoon2/Boxedwine/blob/26R1.0/docs/How-To-Create-FileSystem-For-Web.md) — 통합 ZIP과 static browser root FS.
- [CNC-DDraw 프로젝트](https://github.com/FunkyFr3sh/cnc-ddraw) — 원본 게임 Windows 11 GDI 성공 참조. 특정 7.1 버전의 실제 동작 여부는 `win11-reference` 파일 해시/실행 기록을 근거로 한다.
