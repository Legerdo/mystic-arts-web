# Mystic Arts 시작 경로와 블랙스크린 폰트 반복 원인

대상은 **원본 `Mystic.exe`** (PE32 x86, image base `0x400000`, SHA-256 `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`)이다. 모든 함수 VA는 이미지 베이스를 포함한다.

**근거:** [S] = 원본 기계어/IDA Professional 9.5 정적 디컴파일 확인, [R] = 메인 에이전트의 실제 실행 관찰, [I] = 추론, [U] = 미검증. 기존 주소 명세는 `web/docs/GAMEPLAY.md`와 `web/docs/REA-EVIDENCE.md`, 기존 IDA 자료는 `%TEMP%\mystic_worker2_20261018\Mystic.i64`이다. 해당 IDA DB를 별도로 복사한 `web/native-test/worker3/Mystic-static-analysis.i64`에 대해 `inspect-init.py`로 함수별 디컴파일/assembly/VA→file-offset를 추출했다. 원본 실행·원본 바이너리 변경은 하지 않았다.

## 1. 블랙스크린의 실제 폰트 무한 반복

**[S+R] `sub_45E12F @ 0x45E12F`에 한글 폰트 `굴림체`를 찾지 못할 때 탈출할 수 없는 fallback 경로가 있다.** 메인 에이전트가 기록한 15~40초 연속 `EnumFontFamiliesA` / `lstrcmpiA` 호출과 위치가 일치한다.

```c
found = 0; // dword_4EE0F8
while (font->face != NULL && found == 0) {
    if (getSurfaceDC(0, &hdc)) {
        EnumFontFamiliesA(hdc, font->face, callback_45E386, font);
        releaseSurfaceDC(0, hdc);
    }
    if (!found) {
        for (i = 0; fallback[i].from != NULL; ++i) {
            if (lstrcmpiA(fallback[i].from, font->face) == 0)
                break;
        }
        font->face = fallback[i].to;
        font->pitchAndFamily &= 0x8f;
    }
}
```

원본의 핵심 분기:

| VA | 코드 동작 |
|---|---|
| `0x45E13F–0x45E159` | `face != NULL && dword_4EE0F8 == 0` 확인; 못 찾았으면 반복 |
| `0x45E189` | `EnumFontFamiliesA(hdc, face, 0x45E386, lParam)` |
| `0x45E386–0x45E3A1` | 콜백에서 `LOGFONTA.lfFaceName`과 요청 face를 `lstrcmpiA`로 비교; 같을 때만 `dword_4EE0F8=1` |
| `0x45E1D7` | fallback 배열의 `from`과 face 비교 |
| `0x45E1EB–0x45E1F2` | `fallback[i].to`를 `lParam+52` (face 포인터)에 저장 |
| `0x45E213` | 다시 `0x45E13F`으로 이동 |
| `0x45E218` | font 발견 또는 face NULL일 때 루프 탈출 |

**[S] 원본 fallback 테이블 `0x4CFCF8`**은 8바이트씩 `uint32le from, uint32le to` 쌍이다.

| i | 테이블 VA | from VA | to VA | 실제 문자열 |
|---:|---|---|---|---|
| 0 | `0x4CFCF8` | `0x4CFE98` | `0x4CFEA0` | **굴림체 → 굴림체** |
| 1 | `0x4CFD00` | `0x4CFEA8` | `0x4CFEB0` | **굴림체 → 굴림체** |
| 2 | `0x4CFD08` | `0x4CFEB8` | `0x4CFEC0` | **굴림체 → 굴림체** |
| 3 | `0x4CFD10` | `0` | `0` | 종료 sentinel |

위 모든 비어 있지 않은 문자열 6개는 원본 파일에 **`B1 BC B8 B2 C3 BC 00`**으로 저장되어 있으며 CP949로 해석하면 `굴림체`다. 시작 폰트 설정 구조체 5개 `0x4CF5C8, 0x4CF608, 0x4CF648, 0x4CF688, 0x4CF6C8`의 `+52` face 필드가 가리키는 문자열 5개도 정확히 같은 바이트다. 각 구조체 `+32`는 `0x81` = `HANGEUL_CHARSET` (129)다.

따라서 처음 face `0x4CF7E0`이 발견되지 않으면 fallback 0번이 `0x4CFEA0`을 선택한다. 다음 반복에서 다시 0번에 일치해 `0x4CFEA0`을 선택한다. **포인터와 내용이 고정되고 flag가 계속 0인 무한 반복**이다. 테이블 끝의 null sentinel까지 내려가지 않는다. 코드 내부에 재시도 상한·timeout은 없다.

**[R]** 메인 에이전트의 `web/lab/results/wine6-original-api.json`과 relay 원본 로그에서 `EnumFontFamiliesA`(복귀 VA `0x45E18F`)와 `lstrcmpiA`(복귀 VA `0x45E1DD`) 호출 반복, 그리고 CP949 바이트 `B1 BC B8 B2 C3 BC`를 확인했다. Wine6 `system.reg`의 `FontSubstitutes`에 한국어 이름 및 ACP1252 mojibake 이름을 `Liberation Mono`에 매핑한 `lab/wine6-font-alias.zip` 적용 후 **반복 열거에서 탈출하여 `CreateFontA` / `GetTextMetricsA` / `DeleteObject` 호출로 진행**한 사실도 보고됐다. 원본 EXE를 패치할 필요가 없는 Wine 호환 설정 해결 경로다. 이후 메인 에이전트는 `web/lab/results/wine6-play-pause.png`에서 **숲 배경·플레이어·적·HP바·credit 5가 보이는 실제 원본 게임 장면을 관찰**했다고 보고했다. 이는 검정화면 정체 해소와 게임 장면 진입을 지지하지만 모든 스테이지·조작·엔딩·저장 기능까지 검증한 뜻은 아니다.

## 2. INPsetHwnd 메시지는 원인 지표가 아님

**[S] `INPsetHwnd : DirectInput no initialized\n`는 첫 부팅 호출 순서상 발생 가능한 진단 메시지다.** `sub_458280`은 DirectInput을 생성하기 전에 윈도우를 변경하면서 `INPsetHwnd`를 부른다.

| 호출 명령 VA | 실제 대상 | 순서/효과 |
|---|---|---|
| `0x458291` | `sub_4671F0(hWnd,3)` | 1차 MIDI / DirectSound 초기화 |
| `0x4582A2` | `sub_417F70` | DirectDrawCreate, IDirectDraw2, GetCaps |
| `0x4582D0` | `sub_47534F(2)` | 게임 전체화면 전환 |
| `0x4753B3` | `sub_467390` | DirectSound active HWND 전환 |
| **`0x4753E1`** | **`sub_41EBA9(hWnd,1)`** | **아직 초기화되지 않은 DI 검사 → 유일 관측 로그** |
| `0x475403` | `sub_418344` | DirectDraw 640×480×8bpp mode/surface/palette |
| `0x4582E9` | `sub_41E7F0` | **이제서야 DirectInputCreateA 호출** |
| `0x4582FE/0x45830C/0x45831B` | `sub_41F50F/41F491/41F576` | 입력장치 Acquire |
| `0x45836F`부터 5회 | **`sub_45E12F`** | **굴림체 탐색 및 폰트 생성** |
| `0x458402` | `sub_458710` | WLK/MLK 파일 및 그래픽 리소스 로드 |
| `0x458457` | return 1 | 초기화 완료, WinMain의 타이밍/메시지 루프 진입 |

로그의 원본 어셈블리:

```asm
0x41EBC9  cmp dword ptr [0x4E9EF8], 0    ; global IDirectInput*
0x41EBD0  jnz 0x41EBE2
0x41EBD2  push 0x497198                 ; 위 오류 문자열
0x41EBD7  call OutputDebugStringA
0x41EBDD  jmp 0x41F2CB                   ; 해당 함수만 반환
```

`sub_41E7F0`는 `DirectInputCreateA(hInstance,1280,&dword_4E9EF8,0)`가 실패한 경우만 0을 반환한다. 성공하면 `sub_41E9B4`의 keyboard/mouse/joystick `EnumDevices` 및 `sub_41EBA9`의 `CreateDevice` / `SetDataFormat` / `SetCooperativeLevel`을 호출한다. 개별 장치 생성 실패는 디버그 문자열을 출력하고 일부 장치를 건너뛸 수 있으며 상위 `DirectInputCreateA` 성공 반환값과 별개다. `DirectInputCreateA` 자체 실패라면 `sub_458280`는 `DirectInput Init FAILED` 메시지박스 경로로 반환한다.

## 3. MIDI / DirectSound blocking 의심의 검증 범위

`sub_4671F0(hWnd,3)`은 내부 두 작업의 성공/실패를 확인하지 않고 **항상 return 1**이다.

| 모듈 | 위치 및 실제 WinAPI |
|---|---|
| MIDI probe | `sub_469F84`: `midiStreamOpen @ 0x469FDA`, 성공하면 `midiStreamClose @ 0x46A005` |
| DirectSound | `sub_4672E2`: `DirectSoundCreate @ 0x467338`, `SetCooperativeLevel @ 0x467360` |
| Window 변경 | `sub_467390`: 버퍼 정리/장치 cooperative-level 재설정 |
| DirectInput | `sub_41E7F0`: `DirectInputCreateA @ 0x41E813`, `EnumDevices @ 0x41E9DA/0x41EA00/0x41EA2F` |
| PCM 데이터 | `sub_4680D6`: `Dat/MysticA.wlk` 읽기 (`ReadFile`/`SetFilePointer`) |
| MIDI 데이터 | `sub_46A2DA`: `sub_46AF58`에서 MLK/MIDI 파일 읽기·청크 파싱 |

**[I]** 같은 시작 시도에서 INPsetHwnd 로그가 도달했다면 1차 MIDI/DirectSound 호출 단계는 반환되었다. 그 API가 성공했다는 보장은 없지만 **로그가 나온 이후에도 그 초기 호출 자체에서 멈춰 있었다는 가설은 순서상 배제**된다. 15~40초 실제 trace와 우회 실험은 font 반복을 직접 가리킨다.

**[S] 주의:** DDraw의 `sub_418344`는 `SetCooperativeLevel @ 0x4185C8`, `SetDisplayMode @ 0x418716`에서 HRESULT 실패 시 `OutputDebugStringA` 없이 실패 상태를 세팅해 반환할 수 있다. 상위 `sub_47534F`는 이 반환값을 검사하지 않는다. **DGL 오류 로그가 없다는 사실만으로 DDraw 정상 초기화를 확정하지 않는다.**

## 4. 폰트 발견 후에도 확인해야 할 두 번째 루프

`sub_45E12F`의 폰트 열거 성공 후에는 다음 측정 루프가 존재한다.

```c
originalWidth = font->width;             // 요청 width: 보통 8 또는 12
font->maxCharWidth = 1024;
for (width = originalWidth + 6;
     font->maxCharWidth > originalWidth * 2;
     --width) {
    CreateFontA(height, width, ..., font->face);  // VA 0x45E2EE
    if (getSurfaceDC(0, &hdc)) {
        GetTextMetricsA(hdc, &metrics);           // VA 0x45E344
        font->height = metrics.tmHeight;
        font->maxCharWidth = metrics.tmMaxCharWidth;
        releaseSurfaceDC(0, hdc);
    }
}
```

**[S] `0x45E266`**은 `tmMaxCharWidth <= 2 * originalWidth`일 때 탈출한다. `GetTextMetricsA`가 갱신하지 못하거나 alias 폰트 폭이 계속 큰 경우에는 반복 종료가 되지 않을 가능성 [I]이 있다. 이 루프에는 `width`의 명시적 하한이나 최대 반복횟수가 없다. 메인의 새 로그에서 CreateFont/GetTextMetrics 호출이 나타났다는 사실은 첫 열거 루프 탈출만 의미한다.

다음 검증 기준은 별도 런타임 관찰로만 PASS 판정한다.

1. 원본 `sub_45E12F` 다섯 번이 전부 반환하며 `0x45E344` 호출횟수가 유한한가.
2. `0x458402`의 리소스 로더에 도달하고 `0x458457`에서 init이 1로 반환하는가.
3. WinMain `sub_458976` 게임 tick, `0x41CC37` 화면 present 및 첫 타이틀 픽셀이 보이는가.
4. Wine alias 글꼴의 실측 GDI 폭·높이/한글 glyph가 Win11 원본과 일치하는가.

## 5. 기계어와 폰트 테이블의 독립 PASS 검증

`web/native-test/worker3/verify-init.mjs`는 원본 실행 없이 원본 SHA-256과 PE32 섹션 헤더를 검사해 VA→원본 file offset을 **IDA와 독립적으로 계산**한다. x86 상대 CALL 13곳의 목적지를 직접 검증하고, 문제 문자열과 조건분기 `0x41EBC9` / `0x41EBD2`, 5개 폰트 설정의 charset `129`와 CP949 face 원본 바이트, fallback 3개 모두의 자기 자신 매핑, NULL 종단을 검증한다.

```powershell
node web/native-test/worker3/verify-init.mjs
```

2026-10-18 실행 결과: `status: PASS`, `x86DirectCallsProven: 13`, `fontFallback.status: PASS`, `selfLoopWhenNoFaceEnumerated: true`. 이 정적 검증은 원본의 자산이나 바이너리를 수정하지 않는다. 실제 웹 렌더링·게임플레이 PASS로 확대하지 않는다.

원본의 `savedata/Mystic0.dat` 저장 시점, 20바이트 필드, 크레딧/난이도 설정 및 엔딩 해금 조건은 `web/native-test/worker3/SAVE-ANALYSIS.md`에 별도 분석했다. `verify-save.mjs`의 원본 CALL 목적지 7곳 검증도 PASS다.
