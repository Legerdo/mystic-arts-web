# Mystic Arts — BoxedWine guest CPU ABI와 Wine 핫 주소 정적 검증

2026-10-18 읽기 전용 감사. 메인이 이미 생성한 Chrome guest EIP 코드 덤프, 원본 WASM, BoxedWine 소스, 배포 ZIP만 읽었다. 게임/브라우저/네이티브 실행 또는 원본·프로덕션 코드 수정 없음.

원본 `Mystic.exe` SHA-256: `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`. BoxedWine26R1 원본 `web/runtime/SingleThreaded/boxedwine.wasm` SHA-256: `d4148bda3955e0378de56719c716610f2e1daffd3581d0a2085970ba4df1decf`.

## 1. CPU 필드 및 NormalCPU::run 함수 검증

원본 WASM data segment **136832 (0x21680)**의 NormalCPU vtable 첫 10개 항목은 `1435..1444`이다. vptr **slot8 = WASM table index 1443 = function1807** (원본 WASM file offset **320057**, 함수 본문 **30바이트**, ABI `(i32)->void`).

fn1807 실제 bytecode: `local.get0; local.get0; i32.load offset708; local.tee1; local.get1; i32.load offset8; call_indirect type5/table0`. 원본 C++ `NormalCPU::run()`의 `nextOp->pfn(this,nextOp)`와 일치한다.

| CPU 필드 | offset decimal | hex | 근거 |
|---|---:|---|---|
| EAX ECX EDX EBX | **4 8 12 16** | `0x04..0x10` | vptr4B 뒤 `Reg reg[9]` stride4 |
| ESP EBP ESI EDI | **20 24 28 32** | `0x14..0x20` | `reg[4]..reg[7]` |
| ES CS SS DS base | **40 48 56 64** | `0x28 0x30 0x38 0x40` | `Seg seg[7]` stride8, {address,value} |
| FS GS base | **72 80** | `0x48 0x50` | `seg[4],seg[5]` |
| **EIP** | **112** | `0x70` | WASM fn1759 load/store112 |
| **blockInstructionCount** | **592** | `0x250` | WASM fn561/1433/1759 load→add1→store592 |
| **KMemory* memory** | **700** | `0x2BC` | fn1805/fn1806 load700 |
| **DecodedOp* nextOp** | **708** | `0x2C4` | fn1807 load708 → op.pfn+8 |
| **CPU.big (U32)** | **1384** | `0x568` | fn1806/fn2041 load1384 |

**SSE ABI — 추가 원본 WASM 증거:** `cpu.h:179–183`의 `SSE`는 simde 128비트 벡터 union (16B), `cpu.h:205`의 `ALIGN(SSE xmm[8],16)`은 **XMM0=cpu+160 (0xA0)**에서 시작해 **XMM1=176, XMM2=192, XMM3=208**, XMM4=224, XMM5=240, XMM6=256, XMM7=272 (각16B)다. 마지막 XMM7 끝은+288이므로 **sseControlStateTmp=cpu+288 (0x120)**, **mxcsr=cpu+292 (0x124)**이고 C++ 기본 mxcsr은 **0x1F80 (8064)**이다.

**WASM 교차검증:** fn**2145** (file offset **362646**, 28B)는 `cpu.memory+700` 및 `cpu + (registerIndex<<4) + 160`에서 32비트 XMM lane을 읽고 guest memory로 전달한다. 이 명령 스트림은 단순 계산상 160 추측이 아니라 **실제 XMM 시작 위치와 stride16**을 입증한다. fn**2170** (file **366681**, 22B)은 `cpu+292 i32.load` 후 KMemory guest write를 호출해 C++ `common_sse.cpp:767`의 **STMXCSR**과 일치하고, fn**2171** (file **366704**, 22B)은 guest read 후 `cpu+292 i32.store` 하므로 C++ `common_sse.cpp:771`의 **LDMXCSR**과 일치한다. fn**5369**는 `cpu+288` SSE 임시상태 읽기도 확인된다. 전체 세부 opcode는 `web/lab/guest-cpu/verify-layout.py`에서 SHA 고정 검증하며 PASS했다.

**기존 실험 스크립트 `web/tests/guest-profile.js`의 잘못된 상수** `blockInstructionCount+0x4D0`·`nextOp+0x5C4`는 각각 **+0x250 / +0x2C4**로 교정해야 한다. `eip+0x70`은 맞다. 이 파일은 수정하지 않고 메인에게 전달했다. 명령 카운터 delta 계산은 `(after-before)>>>0`로 unsigned wrap을 처리한다.

**big 모드의 강한 증거:** WASM function **2041**, file offset **351812** body54B는 `i32.load(cpu+48)`(CSbase) → `i32.load(cpu+112)`(EIP) → `EIP&65535` → `i32.load(cpu+1384)`(big) → `select` → `i32.add` 순서이다. C++ `CPU::getEipAddress()`와 정확히 일치한다. 원본 `cpu.cpp:85-86`은 `setIsBig(value)`, `reset():104`는 **setIsBig(1)**. 보수적 hot-loop 가드는 **`HEAPU32[(cpu+0x568)>>>2]===1`**이다. CSbase=0인 메인 게스트 덤프에서도 모드 guard 자체는 필요하다.

## 2. guest virtual memory → WASM host RAM 변환

guest linear 주소는 HEAPU8 index가 아니다. 원본 WASM fn1805/1806/3708/3726/3743과 `kmemory_soft.h`·`soft_mmu.h`·`soft_ram.h`를 대조했다.

```js
const memory = HEAPU32[(cpu + 700) >>> 2]; // CPU.memory, KMemory*
const data = HEAPU32[(memory + 8) >>> 2]; // KMemory.data
const page = guestLinearAddress >>> 12; // 4096B/page
const entry = HEAPU32[(data + 4 + 4*page) >>> 2]; // MMU[page]
const readRam = !!(entry & 1);
const writeRam = !!(entry & 2);
const type = (entry >>> 2) & 7; // 1 RAM, 2 Code, 3 File, 4 COW
const flags = (entry >>> 6) & 63; // PAGE_READ=1, WRITE=2, EXEC=4
if (!readRam || !(flags & 1) || ![1,2,4].includes(type))
  return null;
const host = ((entry & 0xfffff000) | (guestLinearAddress & 0xfff)) >>> 0;
// host bounds와 넘어가는 매 4096B page를 반드시 독립 검사
```

`KMemoryData.mmu`는 첫 포인터4B 다음 **offset+4**, 1,048,576개의 **u32 packed MMU entries**. fn3708은 KMemory+8→data pointer 및 data+4+page*4에서 flags>>6&63을 읽고, fn3726은 MMU 전체 뒤 data+4194308 주소를 참조한다. fn3743 `KMemory::readd`의 RAM fast path는 entry bit0와 `(entry&-4096)|(guestAddr&4095)`를 사용해 실제 WASM host load한다.

File/COW/Code lazy MMU, page fault, write barrier, code-cache 무효화·접근 보호를 생략할 수 없다. `web/lab/guest-cpu/guest-memory.mjs`는 **read-only**이고 올바른 RAM page/메모리 경계를 통과하지 못하면 null 반환. Synthetic Node 검사로 유효 2바이트 65/66 읽기와 미매핑 null을 확인했다.

## 3. 메인이 수집한 실제 Wine 핫 EIP의 바이트 출처

메인의 `web/test-results/performance/guest-code-samples/performance.json`에는 EIP별 실제 guest 코드 **96B**가 저장됐다. `web/lab/guest-cpu/attribute-hot-bytes.py`로 배포 `web/dist/assets/wine.zip`의 ELF 실행모듈 **126개**와 `game.zip`의 원본 Mystic.exe/CNC native ddraw.dll **2개**, 총128개 실행모듈을 대조했다. ELF executable PT_LOAD의 파일 오프셋/virtual address로 실제 `loadBias=guestEIP-executableVirtualVA`를 계산하고 4KiB 정렬 여부를 확인한다.

| guest EIP | 샘플 opcode 비중 | 코드가 실제 들어 있는 모듈 | runtime base + RVA | code 96B |
|---|---:|---|---|---|
| `0xD0FD18F0` | **21.62%** | Wine **gdi32.dll.so** | `0xD0F70000 + 0x618F0` | **96/96 동일** |
| `0xD172D224` | **18.56%** | Wine **winex11.drv.so** | `0xD1700000 + 0x2D224` | **96/96 동일** |
| `0xD0D9A3C3` | **18.55%** | Wine **ucrtbase.dll.so** | `0xD0D00000 + 0x9A3C3` | **96/96 동일** |
| `0xD155818E` | **11.80%** | Wine **dsound.dll.so** | `0xD1530000 + 0x2818E` | **92/96**, 4B reloc |
| `0xD1558204` | **5.42%** | Wine **dsound.dll.so** | `0xD1530000 + 0x28204` | **96/96 동일** |
| `0x00401D91` | 1.95% | original **Mystic.exe** | `0x00400000 + RVA0x1D91`, file offset `0x1191` | **96/96** |
| `0x100013A0` | 1.49% | native **cnc-ddraw.dll** | `0x10000000 + RVA0x13A0`, file offset `0x7A0` | **96/96** |
| `0xD0DA0392` | 1.18% | Wine **ucrtbase.dll.so** | `0xD0D00000 + 0xA0392` | **96/96** |

**상위 다섯 EIP 합계 약 75.96%는 샘플링된 guest x86 opcode 수의 비율이지 CPU wall-time 점유율이 아니다.** 주요 루프는 Wine GDI 팔레트 변환, X11 pixel 합성, ucrtbase 메모리복사, DSound SSE 오디오 믹싱이다. 순수 WinMain PeekMessage/timeGetTime busywait가 이 다섯 핫 주소라는 예전 추측은 실제 샘플에 부합하지 않는다. 실제 CPU 시간은 별도 계측 필요.

ucrtbase copy code는 msvcrt/crtdll과 서명이 유사하다. 그러나 ucrtbase만 page-aligned loadBias `0xD0D00000`이고 다른 EIP `0xD0DA0392`까지 같은 base가 독립 일치한다. dsound offset `0x2818E`의 96B 중 4B 차이는 byte offset **10/11/31/32**, 동일 DLL의 다른 hot code/같은 loadBias로 `RELOCATION_TOLERANT` 분리했다.

Wine ZIP의 여러 PE companion DLL은 preferred base `0x10000000`을 공유하므로 **preferred PE address로 0xD0... ELF code를 식별할 수 없다**. BoxedWine `kprocess.cpp:653–669`의 `KProcess::getModuleName`은 실제 mappedFiles 구간을 본다. Wine PEB.Ldr의 PE 모듈 리스트도 ELF 실행 코드 전체 목록을 보장하지 않으므로 실제 배포 ELF 바이트 비교가 가장 직접적인 근거다.

## 4. hot-loop 최적화의 fail-closed 조건

이 감사는 성능 패치를 작성하지 않았다. 원본 30~60FPS 목표를 위해 후보 WASM bulk 최적화를 검토하더라도 **CPU.big==1**, CS/SS/DS base, 필요한 모든 x86 GPR, 모든 memory page와 권한/범위, CPU flags/lazyFlags, guest EIP·nextOp·instructionCount, page fault·write barrier·code invalidate가 원본과 동일해야 한다. **256회 이하 batch 뒤 마지막 1회 원본 handler 실행만으로 이전 반복의 side effect가 보존된다는 증거는 아니다.** DSound SSE/FPU의 rounding·denormal과 출력 샘플 순서, 팔레트 8→32 픽셀 채널·투명도도 완전 동등해야 한다.

메인 별도 기록은 약 **175,969,205 NormalCPU.run calls / 10.5s**, 매8192회 1번으로 **21,480 samples /147,407 sampled guest instructions / failed0**. 이 값은 guest opcode 히스토그램이지 CPU 시간 비율이 아니다. 실제 30~60FPS 달성·전16라운드 parity도 이 문서 작성만으로 입증되지 않는다.

## 5. 재현 — 실행 게임·브라우저 불필요

```powershell
python web/lab/guest-cpu/verify-layout.py
python web/lab/guest-cpu/attribute-hot-bytes.py --top 12 --output web/lab/guest-cpu/hot-attribution.json
node --check web/lab/guest-cpu/guest-memory.mjs
```

정적 검증 결과: 원본 SHA와 CPU vptr·함수/필드/MMU opcode **PASS**, ELF+PE **128개 실행 모듈** 스캔해 상위12 EIP **EXACT 10 / RELOCATION_TOLERANT 2**로 매핑, synthetic page read/fail-closed Node 검사 PASS. 저장 분석 결과: `web/lab/guest-cpu/hot-attribution.json`. 원본 자산/코드·프로덕션 파일 수정 없음.
