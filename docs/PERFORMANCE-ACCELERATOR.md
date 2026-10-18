# BoxedWine26R1 실행 경로 가속 — WASM trace sidecar 연구 및 격리 프로토타입

조사일: 2026-10-18. 대상은 Mystic Arts 원본 64개 데이터와 `Mystic.exe`(914,944B, SHA-256 `285d1bb736b36ebba95e88334223f5a6851f788926961155b4e1a74f7f63296f`)를 보존한 BoxedWine26R1/Wine6 SingleThreaded WASM이다. GitHub Pages 등의 정적 호스팅, `SharedArrayBuffer`·별도 서버 없는 브라우저 실행을 전제로 한다.

**판정:** 디코딩된 게스트 x86 명령어 여러 개를 외부 WASM 함수 하나로 합치고, 기존 BoxedWine의 공유 `WebAssembly.Memory` 및 `WebAssembly.Table`에서 원래 명령어 체인으로 복귀하는 **실행 가능한 독립 프로토타입을 작성했다.** Node에서 15개 검증이 통과했다. 그러나 아직 실제 BoxedWine CPU/DecodedOp 메모리 ABI를 연결하거나 게임을 실행한 성능 측정은 없으므로, **30~60FPS를 달성했다는 결과는 아니다.** 30~60FPS 향상을 위한 다음 실행 경로 검증의 출발점이다.

## 1. 원인 경로와 정적 수치

실제 실행 흐름은 `native-test/worker1/boxedwine-source/source/emulation/cpu/normal/normalCPU.cpp:214-230`의 `NormalCPU::run()`에서 `nextOp->pfn(this,nextOp)`를 시작한다. 같은 파일 `:35-56`의 `START_OP`는 `blockInstructionCount++`, `NEXT()`는 `eip += op->len; op->next->pfn(cpu, op->next)`를 수행한다. `getOp()`는 `:171-202`에서 미리 디코드된 `DecodedOp` 연결 목록의 callback을 설정하고, `decoder.cpp:6417-6517`은 분기·이미 캐시된 주소·긴 블록(최대 약 1000 op)에서 연결을 종료한다.

원본 BoxedWine가 가진 native JIT은 현재 WASM 실행 경로에서 활성화되어 있지 않다. `cpu.h:185`의 `JIT_RUN_COUNT=50`과 `jit/jitCodeGen.cpp:718-734`의 `firstDynamicOp`는 `BOXEDWINE_JIT` 빌드 조건을 필요로 한다. 실행 파일만 C++의 native JIT으로 전환한다고 정적 웹 런타임에서 동적 기계어 실행을 획득할 수 있는 구조가 아니다.

재현 명령:

```powershell
cd 'C:\Users\K\DevSpaceWorkspaces\미스틱 아츠(Mystic Arts)\web'
python lab/perf-accelerator/callgraph-audit.py
node --test lab/perf-accelerator/trace-wasm.test.mjs
```

`callgraph-audit.py`는 기존 `lab/perf-worker1/wasm-hot-audit.py`의 opcode 디코더와 `native-test/worker1/inspect-wasm.py`의 WASM 섹션 파서를 사용한다. **원본** `runtime/SingleThreaded/boxedwine.wasm`의 SHA-256 `d4148bda3955e0378de56719c716610f2e1daffd3581d0a2085970ba4df1decf`를 고정한다. 결과는 `lab/perf-accelerator/callgraph-audit.json`에 저장한다.

| 실제 WASM 정적 파싱 수치 | 값 | 해석 |
| --- | ---: | --- |
| 전체 함수 8,595개 중 imports | 273 | local function 8,322개 |
| 디코딩 성공한 local 함수 | 8,176 | 나머지 146개는 WASM EH `0x18/0x19` 미지원으로 집계 제외 |
| 디코딩된 함수의 indirect call 명령 | 4,493 | 실제 실행 빈도는 별도 CPU profiling 필요 |
| `KMemory::readd` 함수 [3743] | 582B / 278 Wasm instructions | 240개 호출자, 직접 callsite **최소 628개** |
| `KMemory::writed` 함수 [3745] | 569B / 270 Wasm instructions | 180개 호출자, 직접 callsite **최소 745개** |
| 원본 `NormalCPU::run` 함수 [1807] | 30B / 8 Wasm instructions | `(i32)->void`, indirect callback 1개 |

이는 static callsite 개수이지 런타임 CPU 시간 비율이 아니다. 146개 분석 제외로 인해 호출자/호출점 수는 코드 전체의 **하한**이다. hot opcode 함수 [561], [663]은 각각 이 함수 수준에서 간접호출 1개, [664]/[1772]는 `readd` 호출 1개, [1771]는 `writed` 호출 1개를 포함한다.

현재 WASM은 `memory`와 `__indirect_function_table`을 export한다. 원본 element segment에서 **table slot 1443 → function [1807]**, 타입 `(i32)->void`를 확인했다. 이 구조는 별도 WASM sidecar가 `NormalCPU::run`의 기존 virtual callback을 저장하고, 특정 CPU 상태의 빠른 trace를 직접 실행하는 출발점이다. **실제로 table slot 교체 후 BoxedWine 게임이 부팅되는지 확인한 결과는 없다.**

## 2. 현재 runnable prototype과 실제 API

구현: `lab/perf-accelerator/trace-wasm.mjs`. 외부 npm/emsdk/브라우저가 필요하지 않으며 Node의 WebAssembly API만으로 실행된다. `compileTrace`는 실제 WASM 바이너리를 합성하고, `installTrace`는 복구 가능한 virtual-table hook을 설치한다. 테스트용 CPU offset은 실제 BoxedWine ABI 값이 아닌 의도적인 **합성 fixture**다.

```javascript
import {compileTrace, installTrace} from './lab/perf-accelerator/trace-wasm.mjs';

const trace = {
  memory: boxedWineExports.memory,
  layout: {
    cpu: {reg, eip, csBase, blockInstructionCount, nextOp},
    op: {next, pfn, imm, inst, reg:opReg, rm, len, lenMask, lenShift}
  },
  // Build/version에 맞게 검증된 decoded inst ID와 실제 handler table ID.
  opcodeRegistry: {
    'mov-r32-imm32': {inst: auditedMovImmInstructionId, pfn: auditedMovImmHandlerId},
    'mov-r32-r32':   {inst: auditedMovRegInstructionId, pfn: auditedMovRegHandlerId},
    'nop':           {inst: auditedNopInstructionId, pfn: auditedNopHandlerId}
  },
  cpuStartEip: candidateEip,
  cpuCsBase: candidateCsBase,
  ops: [
    // {kind, ptr, nextPtr, pfn, inst, imm, reg, rm, len}, ...
    // contiguous immutable trace snapshot derived from guest op cache
  ]
};
const bytes = compileTrace(trace); // Uint8Array; WebAssembly.validate(bytes) = true
const hook = installTrace({
  memory: boxedWineExports.memory,
  table: boxedWineExports.__indirect_function_table,
  slot: 1443,
  trace
});
// ... CPU run requests enter the WASM sidecar on table lookup ...
hook.uninstall(); // verifies slot ownership, restores original Wasm reference
```

위 코드의 `boxedWineExports`, `audited*Id`, ABI offset과 candidate snapshot은 **실제 런타임 연결 어댑터가 제공해야 하는 미구현 입력**이다. 예시를 그대로 복사하여 게임에 적용할 수 있는 상태는 아니다. 사용 가능한 실동작 예시는 `trace-wasm.test.mjs`이다.

Sidecar WASM의 binary ABI:

| 방향 | 항목 | 타입 |
| --- | --- | --- |
| import | `host.memory` | 같은 `WebAssembly.Memory` |
| import | `host.table` | 같은 `WebAssembly.Table` (`funcref`) |
| import | `host.original_run` | `(i32 CPU*) -> void` WASM 참조 |
| export | `run` | `(i32 CPU*) -> void` |
| 원본 table 후속 호출 | `call_indirect` (type index 1) | `(i32 CPU*, i32 DecodedOp*) -> void` |

컴파일 가능 명령은 `mov-r32-imm32`, `mov-r32-r32`, `nop` 세 종류뿐이다. 이 명령들은 원본 `normal_move.h:69-87` 및 `normal_other.h:70-76`에서 **게스트 MMU 호출, lazy flag 갱신, 분기, fault가 없는 것**을 확인했다. 실행 결과는 동일한 레지스터 갱신, 명령당 `blockInstructionCount +=1`, `EIP+=len`이며 최종 `op->next->pfn(cpu,next)` callback을 공유 WASM table로 호출한다. 따라서 후속 명령의 fault·branch·getNextOp 등은 원본 경로가 처리한다. **이 세 종류의 trace가 실제 게임의 주된 hot loop일지는 확인되지 않았다.**

중간에 JS를 호출해 모든 명령을 해석하는 구조가 아니다. 합성 WASM은 `NormalCPU::run` table hook으로 진입해 메모리를 직접 검사·처리하고 원본 WASM 함수로 복귀한다. JS는 초기 trace 생성과 설치·해제에만 사용한다.

선행 검증은 모두 *첫 번째 CPU 수정 이전*에 끝난다. CPU의 `nextOp/EIP/CS base`, 각 decoded op의 `next/pfn/inst/imm/reg/rm/len`이 스냅샷과 조금이라도 다르면 오리지널 `NormalCPU::run(cpu)`로 즉시 위임한다. 소스와 서명이 같은 함수 테이블의 pfn lookup을 사용한다. 오래된 cache 연결, 진입 EIP 변경, opcode 재분류, 즉시값/길이 변경, callback 변경이 fallback의 대상이다. **단, 정합성이 검증된 `layout`와 `opcodeRegistry`를 호출자가 제공한다는 전제**이며 이를 잘못 제공하면 합성 결과는 보장할 수 없다.

## 3. 재현 가능한 검증

`node --test lab/perf-accelerator/trace-wasm.test.mjs`는 Windows 11 / Node 24에서 테스트 작성 시 **15 PASS / 0 FAIL**이었다.

- Node에서 실제 WASM 함수를 컴파일해 `WebAssembly.Table`에 넣고, 생성한 sidecar 모듈의 `call_indirect`가 해당 후속 함수를 호출하는 것을 확인했다. 별도 원본 runner도 WASM 함수 형태다.
- MOV/NOP 3개를 합친 실행 결과가 테스트 인터프리터와 일치했다. 레지스터·EIP·CS·명령 카운터·nextOp·원본 fixture의 flags/lazyFlags를 비교했다.
- EIP, CS, nextOp, opcode, imm, reg, 다음 포인터, pfn, 명령 길이를 각각 변경했을 때 **부분 CPU 쓰기 없이** 원본 runner가 호출되는 것을 확인했다.
- guest fault로 표시된 합성 시험 경로는 원본 runner로 전달돼 동일 예외를 던졌다. MMU/opcode 미지원과 잘못된 opcode registry는 컴파일 전에 거부했다.
- `lab/performance-baseline/runtime/boxedwine.wasm`의 SHA-256 `9361043967b4d5e71736999f3a777ae4033510107cd98d93dff188d9e36eb8e8`를 확인하고, **인스턴스 생성 없이** `WebAssembly.Module.exports`의 memory/table 존재를 점검했다.

테스트에서 쓴 `CPU_LAYOUT`·`OP_LAYOUT`, opcode ID, EIP, 테이블 슬롯 7/3은 synthetic 예시용이다. **실제 BoxedWine slot 1443의 게임 접속 테스트나 guest 메모리/page fault parity는 아직 수행하지 않았다.** Synthetic pass로 원본 세그먼트/하드웨어 exception parity를 인증하지 않는다.

## 4. 30–60 FPS를 향한 구현 판단

기존 기록 `test-results/performance/{baseline-frames,tail-all,tail-o3,inline150}/performance.json`에서 구간별 **실제 화면 내용 변경 FPS**를 구분해서 기록한다.

| 구분 | 구간1 / 구간2 FPS | 비고 |
| --- | --- | --- |
| 기존 baseline | **11.927 / 12.234** | 실제 내용 변경 프레임 |
| 1,192개 tail-call 패치 | **14.950 / 14.956** | 측정 완료 |
| tail-call + Binaryen 131 `-O3` | **16.241 / 15.597** | 측정 완료 |
| 별도 Binaryen inline150 후보 | **14.801 / 15.680** | 광범위 inline의 우세가 입증되지 않음 |
| 현재 trace sidecar | **미측정** | synthetic WASM 테스트만 실행 |

`KMemory::readd/writed`를 한꺼번에 인라인하는 것만으로 기존 12fps를 30fps로 개선한다는 근거는 없다. `kmemory.cpp:806-874`의 `canReadRam/canWriteRam` 검사, 페이지 끝 교차, 느린 page virtual dispatch가 섞이고, 쓰기 경로의 코드 캐시 무효화까지 고려해야 한다. 옵티마이저는 이러한 경로를 지워서 처리량만 올릴 권한이 없다. 기존 7.6MB inline150 결과도 광범위 함수 인라인의 긍정적 근거가 아니다.

보다 구조적인 방향은 **hot guest basic block 단위의 명령어 합성**이다. 디코딩 완료된 반복 코드를 직접 WASM으로 컴파일해 1회 실행에서 여러 게스트 op를 진행시키면 `pfn` 호출 체인을 피할 수 있다. 그러나 branch, lazy flag 계산, guest 실제 주소→MMU ram page mapping, write-triggered code invalidation 및 scheduler count/timing을 모두 함께 보존해야 한다. 원본 `KMemory::removeCode` (`kmemory.cpp:559-567`)와 `CPU::getNextOp` (`cpu.cpp:1209-1211`)가 정합성 경계다.

실게임 연결이 필요하면 아래 조건을 순서대로 만족시킨다.

1. **실 ABI 증명:** 현재 배포 SHA와 MIDI vtable bridge 상태를 고정하고, 원본 `NormalCPU::run` table slot, guest CPU struct 멤버 오프셋, `DecodedOp` 포인터/비트필드 offset, opcode ID→handler pfn 매핑을 실제 WASM 바이트와 독립 확인한다. 검증 정보가 없는 빌드는 sidecar 미설치.
2. **trace 생성과 무효화:** `decodeBlock/getOp`에서 하나의 연속 `DecodedOp` chain을 검증한 뒤 만든다. 게스트 write, page remap, execute protection 변경, code cache invalidation 시 캐시된 trace를 폐기한다. 현재 코드는 실행시 모든 decoded-op 필드를 선검증하지만 **code cache 이벤트 후 조기 폐기 프로토콜**은 아직 구현하지 않았다.
3. **호환 가능한 옵코드만 확장:** MOV/NOP 이외의 플래그/메모리/반복 명령은 별도 instruction semantics와 page fault/alias 검증을 통과한 뒤 추가한다. 실행 사이 JS callback을 두지 않는다. 대형 tight loop는 종료조건·게스트 카운터를 원본과 직접 비교해 검증하고, 필요 시 마지막 반복을 원래 interpreter에 남겨 lazyFlags를 계산한다.
4. **부팅·전체 게임 검증:** unmodified baseline과 동일 입력에서 원본 EXE/64 자산 해시, 실제 changed pixel FPS, guest tick/EIP, palette·timer·MIDI, 16라운드 진행, 저장/재개 및 입력 지연을 확인한다. CPU/GPU·화면 이미지의 fps 값은 rAF/present 호출 횟수로 대체할 수 없다.
5. **정적 배포·fallback:** sidecar 바이너리는 JavaScript 안에서 `WebAssembly.Module`로 합성하므로 서버 API/COOP/COEP/SAB가 필요하지 않다. 실제 사용자 UI 지연을 줄이려면 장기적으로 컴파일을 `WebAssembly.compile` 비동기 경로로 이전하고, signature/기능 지원 불일치나 런타임 예외 발생 시 기존 WASM을 그대로 실행한다.

## 5. 핫 SSE 루프의 실행 동등성 검토

실행 프로파일의 두 사운드 처리 SSE 반복 루프에 대해 원본 `source/emulation/cpu/common/{common_sse.cpp,common_sse2.cpp}` 및 `normal/normal_sse{,2}.h`를 읽기 전용으로 검사했다. 이는 기존 **세 명령 trace 프로토타입의 지원 범위에 포함되지 않는다.** 실제 loop 가속 코드는 별도의 성능 실험에서 검증해야 한다.

| 원본 연산 | 상태 갱신 및 보존 |
| --- | --- |
| `movss xmm0,[m32]` | `common_sse.cpp:559-564`: low 32bit load, **상위 96bit 모두 0** |
| `mulss`, `addss` | `common_sse.cpp:34-41,76-83`: SIMDE의 scalar f32 multiply/add, 대상 XMM의 상위 96bit 유지 |
| `pxor xmm1,xmm1` | `common_sse2.cpp:601-603`: XMM1의 전체 128bit 0 |
| `cvtss2sd` | `common_sse2.cpp:919-926`: low f32→f64, 대상 XMM 상위 64bit 유지 |
| `mulsd`, `addsd` | `common_sse2.cpp:37-44,79-86`: scalar f64 multiply/add, 상위 64bit 유지 |
| `cvtsd2ss` | `common_sse2.cpp:900-908`: low f64→f32, 대상 XMM 상위 96bit 유지 |
| `movss [m32],xmm0` | `common_sse.cpp:566-568`: low 32bit를 `KMemory::writed`로 기록 |
| `add reg,imm`, `cmp reg,imm/reg` | `normal_arith.h:143-150,1122-1153`: `dst/src/result`와 `lazyFlagType=FLAGS_ADD32(3)/CMP32(39)` 갱신 |

`CPU`의 C++ wasm32 일반 레이아웃과 `ALIGN(SSE xmm[8],16)`을 대입하면 XMM0/1/2/3 offset은 각각 **160/176/192/208**, `sseControlStateTmp=288`, `mxcsr=292`, `lazyFlagType=296`으로 계산된다. 이는 `cpu.h:187-210`의 **소스 구조 기반 추론치**이며 실제 배포 WASM에서 독립적으로 확인하기 전에는 ABI 계약으로 승인할 수 없다.

반복 사운드 `mulss + addss`의 누적은 **매 반복 f32 곱 후 f32 덧셈**으로 정확한 순서를 지켜야 한다. `f64` 임시 누적이나 FMA로 합치면 비트 동등성이 달라질 수 있다. 다른 루프의 `movss→mulss→cvtss2sd→mulsd→addsd→cvtsd2ss→store`도 f32/f64 변환과 반올림 위치를 원본과 같게 구현해야 한다. `movss`의 상위 lanes 초기화, `cvtsd2ss`의 lane 보존, 두 guest source와 목적지의 aliasing, 페이지 보호·fault, MXCSR 반올림 모드/NaN·subnormal·signed-zero, loop 종료 플래그 모두 검증 대상이다. 중간 반복을 최적화한다면 **반드시 끝 반복을 원본 interpreter에서 실행하여 최종 EIP, XMM, lazy flags와 branch 상태를 생성**하도록 하는 방법을 검토할 수 있다. 이 방법도 그 이전 반복에서 observable fault/interrupt/timer 동작이 완전히 동등해야만 적용 가능하다.

스케줄러 경계 역시 중요하다. `kernel/kscheduler.cpp:131-147`에서 `runThreadSlice()`는 `cpu->run()`이 반환될 때마다 `blockInstructionCount < contextTimeRemaining`과 `cpu->yield`를 검사한다. `runSlice()` (`:166-228`)는 wall clock 약 9ms 단위로 스레드·timer를 관리한다. `common/cpu.cpp:1485-1489`의 `RDTSC` 구현은 `instructionCount + blockInstructionCount`를 반환한다. 여러 반복을 합치면 누적 guest instruction 수는 보상할 수 있지만 **스케줄러 검사 횟수는 줄어든다.** batch 크기 제한·yield 및 guest timer 검증 없이 큰 반복 수 전체를 한 번의 WASM 함수로 소비해서는 안 된다.

이번 변경은 `lab/perf-accelerator/trace-wasm.mjs`, `trace-wasm.test.mjs`, `callgraph-audit.py`, `callgraph-audit.json`, 이 문서에 한정한다. `runtime/`, `source/`, `dist/`, BoxedWine vendor 원본, `Mystic.exe` 및 모든 게임 자산을 수정하지 않았다. 브라우저/게임 실행 및 새로운 FPS 측정도 수행하지 않았다.
