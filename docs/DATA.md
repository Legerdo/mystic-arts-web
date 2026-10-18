# Mystic Arts 원본 데이터 포맷 / 웹 에셋

`web/tools/decode-data.mjs`는 원본 `Dat/` 및 `seq/`를 읽어 웹 정적 에셋으로 변환한다. 원본은 수정하지 않는다. 포맷 경계의 확인과 게임 규칙의 추론은 구분했다.

## 실행 및 재검증

Windows PowerShell에서 프로젝트 최상위 폴더를 현재 디렉터리로 설정한 뒤 Node.js 20 이상으로 실행한다.

```powershell
node web/tools/decode-data.mjs --write
node web/tools/decode-data.mjs --verify
node web/tools/decode-data.mjs --inspect
```

- `--write`는 정적 에셋 64개와 `web/public/assets/data/index.json`을 생성한다.
- `--verify`는 원본에서 재계산한 모든 출력 바이트와 기존 출력을 비교한다. 누락·변조·오래된 결과는 실패 처리한다.
- `--inspect`는 원본 구조를 검사하고 파일을 쓰지 않는다.
- JSON은 타임스탬프가 없는 결정적 형식이다. 원본 파일과 사운드 페이로드·타일 데이터·스크립트 세그먼트의 SHA-256이 기록된다.
- WLK/MLK와 모든 BRM은 `assets/data/original/`에 원본 바이트 그대로 추가 복사했다. SQ 원본은 `assets/data/scripts/`에 바이트 그대로 보존한다.

`index.json`의 `file` 경로는 **인덱스 URL 기준 상대경로**다. 예를 들어 `../audio/effects/wlk-000.wav`, `maps/STGa01.u16le`, `scripts/apple.sq`. 브라우저에서는 `new URL(entry.file, manifestURL)`로 접근한다.

## WLK — PCM 효과음 35개

원본: `Dat/MysticA.wlk`, 1,036,463바이트. `WLKF0200` 헤더와 고정 크기 34바이트 엔트리의 연결 구조는 파일 전체 범위를 검증했다.

| 오프셋 | 길이 | 확인된 구조 |
|---|---:|---|
| `0` | 8 | ASCII `WLKF0200` |
| `8` | 2 | LE `uint16` 엔트리 수(35) |
| `10` | 2 | LE `uint16` 값 3, 의미 미확인 |
| `12` | 35 × 34 | 아래 인덱스 엔트리 |
| `1202` | 가변 | 엔트리 순서대로 연속하는 PCM 사운드 |
| `1,034,616` | 478 | Shift-JIS/CP932 파일명 연결 문자열 |
| `1,035,094` | 1,369 | Shift-JIS/CP932 원본 WAV 절대경로 연결 문자열 |

엔트리 시작 `p=12+34*id`의 필드:

| 오프셋 | 타입 | 의미 |
|---|---|---|
| `p+0` | `uint16le` | 샘플 플래그(`0x00ff`, `0x80ff`, `0x81ff`) |
| `p+2` | `uint32le` | PCM 데이터 시작(파일 오프셋) |
| `p+6` | `uint32le` | PCM 바이트 길이 |
| `p+10` | `uint32le` | 샘플 레이트 Hz |
| `p+14`, `p+18` | 각각 `uint32le` | 이 원본에서 전부 0, 의미 미확인 |
| `p+22` | `uint32le` | 원본 파일명 문자열 시작 |
| `p+26` | `uint16le` | 파일명 바이트 길이 |
| `p+28` | `uint32le` | 원본 절대경로 문자열 시작 |
| `p+32` | `uint16le` | 절대경로 바이트 길이 |

PCM 범위 35개와 각 문자열 범위 70개가 중복·틈 없이 파일 전체를 채운다. Shift-JIS 파일명은 효과음을 구별하는 강한 근거다. 예: id 0 `01-1 通常攻撃ヒット１.wav`(일반공격 히트 1), 1 일반공격 히트 2, 3 낙뢰, 24 포즈, 34 폭발. 나머지 모든 매핑은 `effects[].originalName`에서 확인할 수 있다.

**샘플 복원:** 바이트 분포 및 프레임 길이를 근거로 `0x00ff`를 unsigned 8-bit mono, `0x80ff`와 `0x81ff`를 signed 16-bit little-endian mono PCM으로 복원했다. WAV RIFF 헤더만 추가했으며 오디오 샘플 바이트는 그대로다. 35개 출력의 원본 PCM 바이트 일치를 검증했다. 샘플 레이트는 엔트리에 따라 22,050/11,025/5,000Hz다. `0x80`과 `0x81` 플래그의 정확한 게임 내 차이(반복 재생 여부 등)는 **확인되지 않았다**. 출력: `assets/audio/effects/wlk-000.wav` ~ `wlk-034.wav`.

## MLK — 표준 MIDI 6개 및 미참조 꼬리

원본: `Dat/MysticA.mlk`, 123,468바이트. 첫 1바이트는 엔트리 수 `6`, 다음부터 9바이트 엔트리가 6개 있어 헤더 총 55바이트.

| 오프셋 | 타입 | 필드 |
|---|---|---|
| `p=1+9*id` | `uint8` | 원본 플래그(0/1), 의미 미확인 |
| `p+1` | `uint32le` | 페이로드 시작 오프셋 |
| `p+5` | `uint32le` | 페이로드 길이 |

6개 모두 표준 `MThd` + `MTrk` 구조의 MIDI SMF이다. MIDI format 0, track 1개, quarter note당 48 ticks로 확인했다. VLQ·running status·채널 메시지·Meta·SysEx를 파싱하여 End-of-Track까지 검사했다. **플래그가 0인 id 2도 유효한 MIDI**이며 `assets/audio/music/mlk-000.mid` ~ `mlk-005.mid`에 손실 없이 보존했다.

마지막 엔트리가 끝나는 오프셋은 `121,769`이고 뒤에 **인덱스가 참조하지 않는 1,699바이트**가 있다. 역할은 확인되지 않아 `assets/data/unindexed/MysticA.mlk.tail.bin`으로 보존했다.

브라우저의 HTML `<audio>` 태그는 범용 MIDI 재생기가 아니다. 곡을 구현하려면 MIDI 파서 및 GM SoundFont 신시사이저 또는 Web MIDI 출력이 필요하다. 현재의 `.mid`는 표준 MIDI 이벤트와 타이밍의 원본 바이트를 보존한다. 원본 음색 일치는 신시사이저/음원 뱅크 검증이 필요하다.

## BRM — 스테이지별 2개 타일 격자

원본 `STGa01..03.brm`, `STGf01..03.brm` 6개. 모든 BRM은 다음과 일치한다.

| 파일 오프셋 | 타입 | 내용 |
|---|---|---|
| 0 | 8 bytes | `BRUN100` + NUL |
| 8 | `uint16le` | 가로 칸 수 40 |
| 10 | `uint16le` | 세로 칸 수: 1스테이지 180, 2·3스테이지 150 |
| 12 | `uint16le[width*height]` | 그리드 (row-major) |

파일 크기는 정확히 `12+2*width*height`로, 첫 스테이지 14,412B, 나머지 12,012B다. `STGa`를 40열로 시각화하면 가로로 이어진 장애물·영역 패턴이 나타나며, `STGf`에서 이웃한 가로 타일 ID가 +1 증가하는 패턴이 두드러진다. 따라서 **row-major 배열 순서는 강하게 입증**된다.

`STGa`는 전체에서 값 `0,1,2,3,33`만 등장해 속성/충돌용 격자로 추정된다. `STGf`에는 198종까지의 값과 최대 ID `279`가 있어 시각적 타일 인덱스로 추정된다. **그러나 값 0·1·2·3·33의 게임 규칙, 물리 타일 크기, CNX 아틀라스 대응은 아직 확인되지 않았다.** 값을 임의로 충돌 또는 비충돌이라 단정하면 원본 동작과 달라질 수 있다.

`assets/data/maps/STGa01.u16le` 등 6개 파일은 헤더를 제외한 원본의 little-endian 16비트 셀만 포함한다. `maps[]`는 셀 크기, 크기, 값별 빈도, 해시, 원본 바이트 오프셋 12를 제공한다. `assets/data/original/*.brm`은 헤더 포함 원본을 보존한다.

## SQ — 오프셋 테이블과 실행 미확인 스크립트

각 `seq/**/*.sq`의 첫 `uint32le`는 오프셋 테이블의 **바이트 길이**이다. 이 값/4 개의 `uint32le`가 연속으로 이어지며 첫 값은 테이블 길이와 같다. 세그먼트 id `i`의 구간은 `[offset[i], offset[i+1])`이고 마지막은 파일 끝까지이다. 빈 엔트리와 NUL 종단 문자열 전용 엔트리도 있다.

| 파일 | 크기(bytes) | 엔트리 수 |
|---|---:|---:|
| `apple.sq` | 8,373 | 87 |
| `graph.sq` | 1,032 | 19 |
| `sound.sq` | 84 | 5 |
| `startup.sq` | 732 | 16 |
| `en/mess.sq` | 553 | 12 |
| `jp/mess.sq` | 625 | 13 |
| `kr/mess.sq` | 625 | 13 |
| **합계** | **12,024** | **165** |

`startup.sq`에는 `apple.sq`, `graph.sq`, `sound.sq`, `mess.sq` 문자열이, `graph.sq`에는 `mainbg.cnx`, `cur.cnx`, `m_frm.cnx`, `mado.cnx` 등 그래픽 이름이 있다. `sound.sq`의 `pcmdata.wlk`, `sniper.mlk`는 제공된 원본 파일명 `MysticA.wlk/.mlk`와 **다르다**. REA/IDA의 실행 파일 정적 문자열 조사에서도 `Mystic.exe`에 `dat\MysticA.wlk`(VA `0x4cf958`), `dat\MysticA.mlk`(VA `0x4cf968`), `startup.sq`(VA `0x4cf858`)가 확인되었다. 문자열의 실제 호출 여부는 별도 확인이 필요하다. 이전 리소스명 또는 런타임 파일명 변환인지 아직 확인되지 않아 이름을 변경하거나 임의 매핑하지 않았다.

`seq/jp/mess.sq`와 `seq/kr/mess.sq`는 크기뿐 아니라 SHA-256 `1b7d2da57502dea7799bb9c2f56b0dffb064ba4de10f2002958c32ef1d34678b`까지 **정확히 동일한 원본 바이트**다. 서로 다른 번역 텍스트가 들어 있다고 가정하면 안 된다.

**오프셋/데이터 구간은 확인되었으나 실제 명령 opcode, 제어 흐름, 이벤트 매핑은 확인되지 않았다.** 스크립트를 실행하려면 실행 파일의 VM/디스패처를 추적해야 한다. `scripts[].sections[]`는 세그먼트별 offset/length/SHA-256을 기록한다. 순수 NUL 종단 ASCII로 확인된 것만 `asciiZ` 텍스트로 제공한다. 파일 전체는 `assets/data/scripts/**`에 원본 그대로 복사한다.

## 브라우저 로더 인터페이스

`index.json`을 fetch한 뒤 상대경로를 인덱스 URL 기준으로 해석한다. 정적 서버 배포 경로에 독립적이다.

```js
const manifestURL = new URL("assets/data/index.json", document.baseURI);
const manifestResponse = await fetch(manifestURL);
if (!manifestResponse.ok) throw new Error("Missing Mystic assets index");
const assets = await manifestResponse.json();
if (assets.schema !== "mystic-arts-data-v1") throw new Error("Unexpected schema");

const assetURL = (entry) => new URL(entry.file, manifestURL);
const fetchBytes = async (entry) => {
  const response = await fetch(assetURL(entry));
  if (!response.ok) throw new Error("Missing asset: " + entry.file);
  return response.arrayBuffer();
};

const map = assets.maps.find((entry) => entry.id === "STGa01");
const mapBuffer = await fetchBytes(map);
if (mapBuffer.byteLength !== map.width * map.height * 2) throw new Error("Invalid map");
const view = new DataView(mapBuffer);
const tileAt = (x, y) => view.getUint16(2 * (y * map.width + x), true);

const script = assets.scripts.find((entry) => entry.source === "seq/apple.sq");
const sqBuffer = await fetchBytes(script);
const section = script.sections[1];
const segment = new Uint8Array(sqBuffer, section.offset, section.length);

const effect = assets.effects[0];
await new Audio(assetURL(effect).href).play(); // user gesture 필요

const song = assets.music[0];
const midiBytes = await fetchBytes(song); // 외부 MIDI synthesizer 입력
```

**구조 불변조건:** `maps[].file`은 BRM 헤더를 제외한 셀 배열, `scripts[].file`과 `original/*`는 헤더 포함 원본, `music[].file`은 완전한 MIDI 파일이다. WAV는 44바이트 RIFF 헤더 뒤에 원본 PCM을 담는다.

## 검증 범위 및 미확인 사항

2026-10-18 제공된 원본에 대해 `--write` → `--verify`를 실행했고 35 WAV·6 MIDI·6 BRM·7 SQ를 포함한 **64개 생성 파일이 바이트 일치**했다. MIDI 6개는 모든 이벤트를 끝까지 파싱했고 BRM 6개는 그리드 경계를, SQ 7개는 테이블과 각 세그먼트 경계를 검증했다. **35개 WAV 전부** Windows `System.Media.SoundPlayer.Load()`로 열리는 것을 확인했다. WAV 1개의 PCM을 임의로 1바이트 변경한 후 `--verify`가 오류를 반환하는 변조 감지 시험과 파일 복원 후 재통과도 확인했다.

이는 **정적 바이트·형식 변환 검증**이다. 게임 런타임의 사운드 반복 조건, 음악 음색, 타일 충돌 규칙, 스크립트 opcode 및 실제 동작은 EXE 역공학·실행 관찰과 교차검증이 필요하다.
