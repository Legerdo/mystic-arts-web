# Mystic Arts — REA/IDA 역공학 증거와 재현 기록

원본 `Mystic.exe` 및 `seq/*.sq`을 분석한 근거 기록이다. 함수 주소는 **PE 이미지베이스 `0x400000`을 포함한 x86 VA**이며, 검증 대상은 1998년 원본이다. 원본 바이너리/데이터는 수정하지 않았다. 게임 동작 명세는 [GAMEPLAY.md](GAMEPLAY.md)에 있다.

**근거 분류:** **S** = 바이너리 파일 검사 또는 IDA 9.5 x86 디컴파일·디스어셈블로 확인, **R** = 실제 실행 관찰(메인 에이전트 보고 포함), **I** = 코드 의미에 대한 추론, **U** = 검증되지 않음. 정적 디컴파일을 플레이 성공으로 해석하지 않는다.

## 1. 원본 식별과 도구

| 대상 | 크기 | SHA-256 |
|---|---:|---|
| `Mystic.exe` | 914,944B | `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f` |
| `savedata/Mystic0.dat` | 20B | `2680560b172dbeee14891554d27f42bcdf05cbdb5386fddf226288c72aaa4696` |
| `seq/apple.sq` | 8,373B | `8201023481ba7ccd51e561078df4634226e29c10e7dbfaf2b25fed0bb606b8e8` |
| `seq/graph.sq` | 1,032B | `bf5741e154db3a8533eb95f283c8c7a0b1156e13dc78416694d6eebbb2d149c5` |
| `seq/sound.sq` | 84B | `f4a3f508e955bddcc3983a281fa03590b5ea5b81cc0572e823166395aa63c415` |
| `seq/startup.sq` | 732B | `7180916a17a172464464adc9e329eff7ce820222b7f75c243707d31a1ecc734e` |
| `seq/en/mess.sq` | 553B | `848c30089c9de7f543827b2a6970aaecc8b83150be3b69dc159a8e5bf09a5766` |
| `seq/kr/mess.sq` | 625B | `1b7d2da57502dea7799bb9c2f56b0dffb064ba4de10f2002958c32ef1d34678b` |
| `seq/jp/mess.sq` | 625B | `1b7d2da57502dea7799bb9c2f56b0dffb064ba4de10f2002958c32ef1d34678b` |

[S] PE32 x86(`IMAGE_FILE_MACHINE_I386`), entry `0x4777B0`, WinMain `0x474910`, imagebase `0x400000`; 직접 IDA Professional 9.5 headless 자동 분석에서 **함수 853개·문자열 575개**. Import에는 `DDRAW!DirectDrawCreate`, `DINPUT!DirectInputCreateA`, `DSOUND!DirectSoundCreate`, `WINMM!timeGetTime`·`timeSetEvent`·`joyGetPosEx`가 있다.

REA CLI `rea@6.5.0`이 설치되어 있고 `rea inspect Mystic.exe --provider ida`는 내부 IDA 분석 데이터를 생성한 뒤 `cleanup_incomplete` 에러를 반환했다. 따라서 해당 REA 시도는 완전 성공으로 주장하지 않는다. 이후 **IDA headless를 직접 호출**해 독립적으로 정확한 주소를 확보했다. 분석용 `Mystic.i64`와 JSON, IDAPython 스크립트는 모두 `%TEMP%\mystic_worker2_20261018`에 보존돼 있다(사용자에게 전송되는 별도 산출물 아님).

Windows 11 재현 호출:

~~~powershell
$dir = Join-Path $env:TEMP 'mystic_worker2_20261018'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
# IDAPython으로 inventory.py 작성 후:
& 'C:\Program Files\IDA Professional 9.5\idat.exe' -A -L"$dir\ida.log" -S"$dir\inventory.py" -o"$dir\Mystic.idb" '.\Mystic.exe'
# IDA가 종료하면 Mystic.i64 / inventory.json 생성
~~~

저장된 분석 증거: `inventory.json`(엔트리/853함수/575문자열/import), `refs.json`(교차참조+주요 디컴파일), `game.json`(state/라운드), `more.json`(전역 xrefs/메뉴/세이브), `vm.json`(GSQ 4 점프테이블 및 193개 유니크 handler), `runtime_tables.json`(input table), `ddraw.json`/`present.json`(DirectDraw 화면·render pipeline), `patch_instructions.json`(VA→file offset/명령 바이트). 분석본의 임시 DB만 변경하며 **원본을 재저장·패치하지 않았다**.

## 2. 함수 주소와 호출 관계

| VA | 확정된 역할 / 근거 (S) |
|---|---|
| `0x474910` | WinMain. `FindWindowA` 중복 방지, 그래픽 초기화, `SetWindowsHookExA`, `timeSetEvent`, `PeekMessageA` idle 루프에서 `timeGetTime`으로 **16ms tick**, `sub_458976(skip=0/1)` |
| `0x474B6B` | EXE 위치를 `SetCurrentDirectoryA`로 지정; 레지스트리 `SavePath`/`Language`와 기본 `savedata` 결정 |
| `0x474D9B` | `GAME_NML`와 `COMPILE_GAME` 두 Win32 window, **640×480** client rect |
| `0x474F4D` | WndProc, focus/WM_DESTROY, F8(VK119) 화면 캡처 |
| `0x458280` | `sub_417F70` DDraw → `sub_47534F(2)` 화면 모드 → `sub_41E7F0` DirectInput → fonts/resources (`sub_458710`) |
| `0x458710` | 게임 전역 state·옵션 초기화, `dat\MysticA.wlk`, `dat\MysticA.mlk`, `sysfont.cnx`·`credit.cnx`·`del.cnx` 준비 |
| `0x458976` | `dword_51A450` 최상위 state: 0/1/2/3/4/5/6/7/9/99 |
| `0x45AD50` | 일반 게임 프레임, `sub_41F63F` 스캔·`sub_46F80C(0,6)` 엔티티 tick → 렌더/present |
| `0x45AE0C` | 특수 전환 프레임, `sub_46F80C(0,1)` |
| `0x401000` | 620바이트 객체 pool 및 6개 linked list sentinel 구성 |
| `0x46F80C` | 엔티티 콜백 at `entity+16`을 매 tick 순회, pause 플래그 조건 적용 |
| `0x46F89B` | `dword_51328C = (~previousPressed)&newPressed` 입력 에지 판정 |
| `0x41F63F` | DirectInput 키보드(256바이트), fallback GetKeyboardState, mouse·최대16 joystick |
| `0x420012` | `word_496E30`(1P) / `word_496F30`(2P) 16×8 스캔코드 → 논리 비트 |
| `0x4650F9` / `0x465129` | 128회 방향 링버퍼 저장 및 16개 커맨드 시퀀스 매칭 |
| `0x465376` | 네 방향 비트를 숫자 방향(1..9)으로 치환 |
| `0x4728C0` / `0x472B24` / `0x472BEC` | 타이틀 CNX 로드, 네이티브 객체 생성, 3항목 메인·옵션(0..15 내부상태) |
| `0x45A9EE` / `0x465B9C` | 잔여 기회(99/6/4) 표시, 시작·취소 전환 |
| `0x458B3A` / `0x458BC4` | 라운드 준비 및 native 함수별 1..16 적 스폰, **17→엔딩 상태5** |
| `0x46D99E` / `0x46DC9C` | 3그룹 스테이지/리소스 매핑; 타일 `40×30×16×16` |
| `0x46DE4F` | 라운드 종료·전환 `++dword_51A460` 및 자원 계승 |
| `0x46E835` / `0x46ED79` | pause `edge&0x80` 및 1..16 라운드 선택 관련 |
| `0x426E30` | over.cnx 게임오버, 상태1 복귀 |
| `0x4271A3` / `0x42757D` | roll.cnx/End01~04.cnx 엔딩 객체, 다단계 tick·해금/복귀 |

[S] 스테이지 매핑 테이블 **`0x46DC9C`** 16바이트는 `00 00 00 00 00 00 01 01 01 01 01 02 02 02 02 02`이며 라운드 `1–6`, `7–11`, `12–16`에 대응한다. 타일은 **40×30개**, 16픽셀 간격, `stgb%02d.cnx`·`stgp%02d.cnx` 및 `dat\stgf%02d.brm`·`dat\stga%02d.brm`를 로드한다. `0x458BC4`의 정확한 16라운드 네이티브 콜백·스폰 좌표/매개변수는 [GAMEPLAY 6절](GAMEPLAY.md#6-라운드스테이지배경)에 별도 표로 복원했다. 적 콜백의 물리·피격 원리 전체는 U다.

[S] 렌더 경로: `0x45AD50 → 0x45AEBA`(active draw entity 수집) `→ 0x45AF75`(깊이/레이어 Shell sort) `→ 0x415D7E`(draw entity 순회) `→ 0x415F10`(sprite blit) `→ 0x45AE9B`(palette `0x416705` 및 present 분기). `dword_5231EC==0`이면 `0x46D16A→0x41CC37` 전체 화면 present, 다른 경우 `0x415064`의 부분 영역 업데이트. `0x41C47F`는 DirectDraw surface `Blt`/ColorFill, `0x41C6A4`는 sprite surface-to-surface `Blt` 처리. `0x415F10`은 sprite atlas rectangle과 실제 화면 좌표의 클리핑/이동을 계산한다. 깊이 키는 `entity+36`이다. [U] 충돌 및 점수 세부 산식은 이 문서에서 완전 복원하지 못했다.

## 3. DirectDraw 독점 8bpp 장애 및 A/B 정확 바이트

[S] `0x417F70`: `DirectDrawCreate` → QueryInterface `IDirectDraw2` → `GetCaps`, 실패 시 `OutputDebugStringA` 및 0 리턴. 초기 진입 `0x458280`은 `sub_47534F(2)`를 호출한다. 이 호출은 **반환값을 무시**한다. 즉 창이 표시되어도 `sub_418344` 내부 surface 생성/모드 설정 실패로 렌더가 멈출 수 있다.

`0x47534F(mode)`: mode`2`는 `COMPILE_GAME` 보조 윈도우 활성화, mode`1`은 `GAME_NML` 일반 창 활성화. `0x418344`는 mode`2`에서 `SetCooperativeLevel(hwnd,17)` 및 `SetDisplayMode(640,480,8,0,0)` 호출. 이어서 `CreateSurface`·`CreatePalette`·`SetPalette`. mode`1`은 `SetCooperativeLevel(hwnd,8)`이며 `SetDisplayMode` 생략; 오프스크린 surface는 여전히 8비트.

**원본 EXE와 PE file offset을 직접 독립 확인한 진단용 패치:**

| 항목 | 검증값 |
|---|---|
| 명령 VA | **`0x4582CE`** |
| PE offset (명령 시작) | `0x576CE` = 357070 |
| 원본 7 bytes | **`6A 02 E8 7A D0 01 00`** (`push 2; call 0x47534F`) |
| 변경 단일 byte | **PE offset `0x576CF` = 357071: `02→01`** |
| 패치 후 7 bytes | **`6A 01 E8 7A D0 01 00`** (`push 1; call 0x47534F`) |
| 독립 검증 | IDA `ida_loader.get_fileregion_offset(0x4582CE)=0x576CE` + Python 원본 `bytes[0x576CE:0x576D5]` 대조 PASS |
| 원본 무결성 | 위 SHA-256 원본 유지. 변경은 `web/_original_probe` 등 **별도 실험 사본에 한정** |

패치 생성 검증 의사코드:

~~~python
from pathlib import Path
import hashlib
src = Path("Mystic.exe")  # 원본 절대경로
dst = Path("Mystic_Windowed_AB.exe")  # 반드시 새 실험 파일
b = src.read_bytes()
assert hashlib.sha256(b).hexdigest() == "285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f"
assert b[0x576CE:0x576D5] == bytes.fromhex("6A 02 E8 7A D0 01 00")
copy = bytearray(b)
copy[0x576CF] = 1
assert sum(a != z for a,z in zip(copy,b)) == 1
assert not dst.exists()
dst.write_bytes(copy)
assert dst.read_bytes()[0x576CE:0x576D5] == bytes.fromhex("6A 01 E8 7A D0 01 00")
~~~

[R] prime이 보고한 BoxedWine 26R1 테스트: Wine6/11 native/browser에서 원본은 검정 단일 창, Wine11 native `run_wineboot failed c0000135`/`load_apiset_dll ... c000000f`/`wined3d_adapter_gl_init` 오류. 1바이트 창모드 사본은 **하얀 화면과 `Mystic Arts` 창 타이틀 바**까지 표시(게임 그림 미표시). 즉 패치가 **창 모드/창 생성에 효과**를 보였으나 EXE 프레임/palette 에셋 성공까지 입증하지 않는다.

[R] 메인 에이전트의 Windows 11 참조 실행: 원본 `Mystic.exe` 파일을 **그대로 유지**하고 외부 `cnc-ddraw v7.1`의 `ddraw.dll`와 `ddraw.ini`(`windowed=true`, `renderer=gdi`, `maxgameticks=60`)를 같은 프로그램 디렉터리에 배치했을 때 실제 타이틀 그래픽이 정상 표시됐다. 이 독립 검증 환경은 `web/win11-reference/mystic`에 구성됐으며 원본 수정 없이 동작하는 Win32 그래픽 비교 기준을 확보했다. BoxedWine 내 cnc-ddraw DLL override 성공 및 전투 전체 재생은 아직 미검증이다.

[S] 최종 화면 함수 `0x41CC37`: `dword_52172C!=0`이면 primary의 `Flip`(vtbl+44), 그렇지 않으면 `dword_521B64` primary가 `dword_5216E4` offscreen의 8bpp surface를 `Blt`(vtbl+20, `DDBLT_WAIT=0x01000000`)한다. 창모드 `dword_520E88==1`에서는 `ClientToScreen`을 이용해 화면 좌표를 변환한다. HRESULT `-2005532222`(`DDERR_SURFACELOST`)라면 primary `Restore`(vtbl+108) 후 반복하고, 다른 오류는 `OutputDebugStringA("DGLbltPrimary...")`, `dword_4E24C4=134217736`, return 0이다. `0x41CD6C`는 비슷한 방식의 부분 primary Blt와 clipping을 수행한다.

**진단할 실제 HRESULT/분기 주소:**

- `0x417F70`: `DirectDrawCreate`, `QueryInterface(IDirectDraw2)`, `GetCaps` 결과.
- `0x418344`: `IDirectDraw2::SetCooperativeLevel` vtbl+80, `SetDisplayMode` vtbl+84, `CreateSurface` vtbl+24, `CreatePalette` vtbl+20, surface `SetPalette` vtbl+124. 일부 호출은 **HRESULT 리턴 검사가 생략돼** state와 surface pointer를 직접 확인해야 한다.
- `0x458280`: 최초 DDraw init 리턴 0이면 `MessageBoxA("DirectDraw Init FAILED")`; DirectInput 0이면 `"DirectInput Init FAILED"`. 화면모드 전환 `0x47534F`의 결과는 체크하지 않는다.
- `0x4580F5`: `CreateFileA` 실패시 `OutputDebugStringA("Cannot open file '%s'")` 후 `MessageBoxA(MB_RETRYCANCEL)` 반복; 취소는 `0x458259`의 `ExitProcess(1)`로 연결. ZIP mount의 **현재 working directory와 경로 대소문자**를 따로 검증해야 한다.
- `0x458710`: 기본 `dat\MysticA.wlk` 및 `dat\MysticA.mlk`, `sysfont/credit/del.cnx` 등의 성공 여부. `sub_418F90(255,640,480,0x02000044,10)`의 surface 생성 실패도 호출자에서 검사하지 않는다. `0x41CC37`(전체 present) / `0x41CD6C`(부분 present)의 호출 횟수·HRESULT, WinMain `0x458976` 진입 횟수, `dword_51A450`이 0→1인지 측정하면 **메시지루프 정체, 파일 로딩 오류, DDraw blit 오류**를 구분할 수 있다.

## 4. `*.sq` 오프셋 파일형식 전체 검사

[S] 원본 SQ 파일 7개 모두 다음 조건을 Python `struct.unpack('<I', file[0:4])`로 검증하여 PASS: **첫 LE32 = 4×레코드 수 N**(헤더 전체 길이). 레코드의 offset table도 첫 DWORD부터 N개 순차 LE32이며, `offset[0] = 4N`, 단조 비감소, 마지막 offset ≤ 파일 길이. 연속 동일 offset이면 빈 레코드다.

| SQ 상대경로 | N | 테이블 길이 | 마지막 offset / 길이 | 빈 레코드 |
|---|---:|---:|---|---:|
| `apple.sq` | 87 | 348B | 8280 / 93B | 1 |
| `graph.sq` | 19 | 76B | 1019 / 13B | 1 |
| `sound.sq` | 5 | 20B | 72 / 12B | 1 |
| `startup.sq` | 16 | 64B | 723 / 9B | 0 |
| `en/mess.sq` | 12 | 48B | 420 / 133B | 1 |
| `kr/mess.sq` | 13 | 52B | 488 / 137B | 1 |
| `jp/mess.sq` | 13 | 52B | 488 / 137B | 1 |

[S] sound.sq 헤더 20bytes = `14 00 00 00 14 00 00 00 20 00 00 00 3C 00 00 00 48 00 00 00`; offset은 `[20,20,32,60,72]`. `startup.sq` 기록 14·15는 각각 NUL 문자열 `sound.sq`/`mess.sq`; `sound.sq` 기록 3·4는 `pcmdata.wlk`/`sniper.mlk`. `graph.sq` 말미 자산문자열 `mado.cnx`/`adjfree.cnx`/`adjmono.cnx`. `kr/mess.sq`와 `jp/mess.sq`는 내용·SHA-256까지 동일하다.

재검증 (Python3 표준 라이브러리만 필요):

~~~python
from pathlib import Path
from struct import unpack_from
for file in Path("seq").rglob("*.sq"):
    b=file.read_bytes()
    first=unpack_from("<I",b)[0]
    assert 4<=first<=len(b) and first%4==0
    n=first//4
    off=unpack_from("<"+"I"*n,b)
    assert off[0]==first and off==tuple(sorted(off))
    assert off[-1]<=len(b)
    chunks=[b[off[i]:(off[i+1] if i+1<n else len(b))] for i in range(n)]
    assert sum(map(len,chunks))==len(b)-first
    print(file,n,len(b))
~~~

### 4.1 GSQ VM의 실제 주소

[S] `0x45B230`: 파일 메모리 로드 및 SQ slot(0..99) 관리. `0x45B358(slot,index)`는 `base + LE32(base+4*index)`로 Record pointer 반환. `0x45B39E(filename,slot,index)`는 `sub_401174(sub_45B447)` 스크립트 엔티티를 생성, `entity[38]=pc`, `entity[39]=slot` 설정.

[S] `0x45B447` opcode dispatch:

| opcode | table VA | entry 수와 확인 |
|---|---|---|
| `0x00..0x0F` | `funcs_45B485@0x4958B8` | 16 (실제 13 handler·공통 stub 3) |
| `0x10 + opcode2` | `funcs_45B4E4@0x4DCB70` | 66개 슬롯, 주요 `0x10 0x14→0x471605` call, `0x10 0x15→0x4716BA` return |
| `0x11 + opcode2` | `funcs_45B51B@0x4CF998` | 53개 슬롯, 그래픽/엔티티 handler 다수 |
| `0x12 + opcode2` | `funcs_45B552@0x4DBE38` | 81개 슬롯, 미구현 `0x45B565` 공통 stub 포함 |

주의: 몇 점프테이블의 마지막 entry는 함수 주소 대신 **인접 문자열처럼 보이는 값**이 추출되었다. 이것은 실제 실행 범위의 안전성을 증명하지 않는다. ABI/디컴파일 표현에 따라 일부 오프셋 또는 인덱스 경계 역추적이 추가로 필요하다. 핸들러별 명령 길이는 가변이며 모든 레코드를 고정 단위 코드로 자를 수 없다.

[S] `0x471605` 외부호출은 `pc+2`의 LE16 파일 slot, `pc+4`의 LE16 record index를 읽고 `sub_45B358`로 새 PC를 구하며 호출 스택에 원래 슬롯과 `pc+8` 복귀 위치를 저장한다. `0x4716BA`는 pop하여 복귀한다. 호출스택 최대 depth 4에서 디버그 메시지를 출력하는 방어가 있다. VM `0x45B447`은 전역 `dword_513CE8==0` 동안 명령을 계속 디스패치한다.

**설계 의미:** 위 GSQ 엔진은 스크립트·표시·자산 함수 일부를 구동한다. 전투 규칙/AI/충돌 대부분은 별도 compiled x86 entity callback 주소에 있으므로 SQ 데이터 해석만으로 원본 전체 게임 동작을 복제하지 못한다.

## 5. 세이브 구조 및 원본 작성자 검증

[S] `savedata/Mystic0.dat`의 5개 LE32는 순서대로:

~~~text
14 00 00 00 | CE 07 09 00 | 1D 00 0D 00 | 2A 00 2B 00 | 3F 00 00 00
size=20     | 1998/09      | day29 hour13 | min42 sec43  | unlock bits=63
~~~

| 함수 | 실제 원본 행위 |
|---|---|
| `0x41DFB0` | 시작 헤더 4×DWORD: 파일 길이, `(month<<16)|year`, `(hour<<16)|day`, `(sec<<16)|minute`, `used=4` |
| `0x41E0A2` | `memcpy` raw append, DWORD padding |
| `0x41E0E2` | bit range from `dword_512AE0` append |
| `0x41E1B6` | var range from `dword_5126C0` append |
| `0x41E1FC` | `firstDWORD=4*usedDWORD` 업데이트, `savedata\MysticX.dat` 저장 |
| `0x41E3D2` | 파일 로드(버퍼 1024B), 존재하지 않으면 타임스탬프 0 |
| `0x41E609`/`0x41E6EF`/`0x41E736` | bit/var/raw 별 복원 |
| **`0x45AD2D`** | **`sub_41DFB0(0); sub_41E0A2(&dword_51A434,4); sub_41E1FC()`** |

[S] 따라서 마지막 DWORD `0x3F`는 **`dword_51A434` 해금 마스크** 확정. 타이틀 `0x472BEC`는 이 비트마스크의 `0x1/0x4/0x10/0x40`에 따라 추가 옵션 항목을 표시한다. 제공된 20바이트 세이브는 게임 전투 중 모든 상태를 저장했다고 볼 근거가 없으며, 다른 저장 슬롯의 실제 쓰기경로는 추가 검증 U다.

## 6. BoxedWine 호환계층의 외부 근거와 완료 기준

공식 [BoxedWine](https://github.com/danoon2/Boxedwine)와 [26R1 릴리스](https://github.com/danoon2/Boxedwine/releases), [웹 filesystem/패키징 문서](https://github.com/danoon2/Boxedwine/blob/master/docs/How-To-Create-FileSystem-For-Web.md), [웹 데모](https://boxedwine.org/v/26R1/)는 x86 Windows 프로그램을 CPU 에뮬레이터+Wine API로 실행하는 방향의 근거다. **BoxedWine이 DirectDraw를 지원한다는 설명과 Mystic이 실제로 8비트 독점 화면·입력·오디오까지 PASS한다는 사실은 별개**다. WASM 속도·joystick 지원 및 browser focus 문제도 별도 재현할 필요가 있다. [WindowsAppPlayer](https://github.com/bassdrum4/windowsappplayer)는 BoxedWine+Wine WASM과 canvas UI 참고 구현이며 Mystic 실행성의 증거는 아니다.

1. **DDraw 진단:** WinMain 진입, `0x417F70` DDraw 리턴, `0x418344` API별 HRESULT, sprite blit/`0x41CC37` present 및 화면 픽셀로 첫 게임 로고 PASS/FAIL 판정.
2. **입력/tick:** `0x420012` DIK→논리 16bit 변환, `0x46F89B` pressed edge, `0x458976` 16ms ticker의 실제 tick 카운트 수집.
3. **전투:** 16라운드 적 스폰/AI/충돌/HP/콤보/점수와 BGM, 게임오버·엔딩·옵션·저장 장면까지 Windows 실행과 비교.
4. **회귀:** 원본 EXE 8bpp 독점 vs 창모드 사본, Wine6/11, native vs Web 각각에서 로그/스크린샷·결과 해시 별도 보존.

**현재 범위:** x86 상태머신·타일 그룹·스폰 구성·타이틀·SQ offset·비트마스크·DDraw A/B 바이너리 위치는 S 검증 완료. **실제 BoxedWine 전 과정 정상 구동 및 전투 재현은 아직 U**다. 위 주소와 독립 검사로 진행 상태를 측정할 수 있다.

